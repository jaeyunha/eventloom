import { hashPassword } from "better-auth/crypto";
import type { ApiBindings, ApiDependencies } from "../app";
import { RequestAuthenticator } from "../features/auth/authenticator";
import {
  AuthConfigurationError,
  createBetterAuthRuntimeConfiguration,
} from "../features/auth/configuration";
import { createBetterAuthRuntime, createOpenSendMagicLinkMessage } from "../features/auth/runtime";
import type {
  ApiKeyScope,
  AuthSession,
  BetterAuthGateway,
  D1ApiKeyGateway,
  OrganizationMembership,
  SpeakerGrant,
  StoredApiKey,
} from "../features/auth/types";
import { apiKeyScopes, organizationRoles } from "../features/auth/types";
import {
  type OrganizationMembership as MemberOrganizationMembership,
  MemberRepositoryConflictError,
  MemberService,
  type OrganizationRecord,
} from "../features/members/service";
import type {
  Member,
  MemberAuthBoundary,
  MemberIdentityRepository,
  MemberInvitation,
  MemberInvitationDelivery,
  MemberMembership,
  MemberUser,
  ReviewerPool,
  ReviewerPoolRepository,
  SetupLinkClaim,
} from "../features/members/types";
import type { AirtableTransport } from "../infrastructure/airtable";
import { FetchAirtableTransport, RetryingAirtableTransport } from "../infrastructure/airtable";
import {
  type CloudflareBindings,
  type CloudflareOutboxInvitationTransient,
  type CloudflareOutboxMessage,
  inspectCloudflareBindings,
} from "../infrastructure/cloudflare/bindings";
import { type CloudflareAiBinding, createCloudflareAiProviders } from "../integrations/ai";
import { DEFAULT_OPEN_SEND_SENDERS, OpenSendClient } from "../integrations/opensend/client";
import type { OpenSendMessage } from "../integrations/opensend/types";
import { AirtableJsonStore, createAirtableDependencies, D1IdempotencyStore } from "./airtable";

export type RuntimeBindings = ApiBindings &
  Partial<Omit<CloudflareBindings, keyof ApiBindings>> & {
    readonly API_ORIGIN?: string;
    readonly AIRTABLE_ACCESS_TOKEN?: string;
    readonly AIRTABLE_BASE_ID?: string;
    readonly BETTER_AUTH_SECRET?: string;
    readonly OPENSEND_API_KEY?: string;
    readonly OPENSEND_SENDING_API_KEY?: string;
    readonly OPENSEND_API_URL?: string;
    readonly CACHE_INVALIDATION_URL?: string;
    readonly CACHE_INVALIDATION_TOKEN?: string;
    readonly AUTH_FROM_EMAIL?: string;
    readonly SPEAKERS_FROM_EMAIL?: string;
    readonly CALENDAR_FROM_EMAIL?: string;
    readonly AIRTABLE_API_ORIGIN?: string;
    readonly AIRTABLE_TRANSPORT?: AirtableTransport;
    readonly AI?: CloudflareAiBinding;
    readonly AI_MODEL?: string;
    readonly ORGANIZER_AUTOJOIN_DOMAINS?: string;
    readonly ORGANIZER_AUTOJOIN_ORGANIZATION_ID?: string;
  };

export interface RuntimeConfigurationInspection {
  readonly success: boolean;
  readonly issues: readonly string[];
}

interface SessionRow {
  readonly session_id: string;
  readonly user_id: string;
  readonly email: string;
  readonly email_verified: number;
  readonly expires_at: string;
}

interface MembershipRow {
  readonly organization_id: string;
  readonly role: string;
}

interface SpeakerGrantRow {
  readonly organization_id: string;
  readonly speaker_profile_id: string;
}

interface ApiKeyRow {
  readonly id: string;
  readonly organization_id: string;
  readonly label: string;
  readonly scopes_json: string;
  readonly expires_at: string | null;
  readonly revoked_at: string | null;
}
interface MemberUserRow {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly email_verified: number;
  readonly created_at: string;
  readonly updated_at: string;
}

interface MemberRow {
  readonly organization_id: string;
  readonly user_id: string;
  readonly email: string;
  readonly name: string | null;
  readonly email_verified: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly user_created_at?: string;
  readonly user_updated_at?: string;
  readonly role: string;
}
interface OrganizationRow {
  readonly organization_id: string;
  readonly slug: string;
  readonly name: string;
  readonly config_json: string;
  readonly created_at: string;
  readonly updated_at: string;
}

interface OrganizationMembershipOrganizationRow {
  readonly organization_id: string;
  readonly user_id: string;
  readonly role: string;
  readonly membership_created_at: string;
  readonly membership_updated_at: string;
  readonly organization_slug: string | null;
  readonly organization_name: string | null;
  readonly organization_config_json: string | null;
  readonly organization_created_at: string | null;
  readonly organization_updated_at: string | null;
}

interface MemberInvitationRow {
  readonly id: string;
  readonly identifier: string;
  readonly token_digest: string;
  readonly expires_at: string;
  readonly created_at: string;
  readonly updated_at: string;
}

interface MemberInvitationEnvelope {
  readonly kind: "member_invitation";
  readonly invitation: MemberInvitation;
  readonly usedAt: string | null;
  readonly activationDigest: string | null;
}

interface ReviewerPoolRecord extends ReviewerPool {
  readonly id: string;
}
export interface OrganizerAutojoinConfiguration {
  readonly domains: readonly string[];
  readonly organizationId: string;
}

const ORGANIZER_AUTOJOIN_DOMAINS = new Set(["swyx.io", "ai.engineer"]);
const ORGANIZER_AUTOJOIN_ORGANIZATION_ID = "ai-engineer";

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function normalizedEmailDomain(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1 || normalized.indexOf("@") !== at) return null;
  return normalized.slice(at + 1);
}

function parseOrganizerAutojoinConfiguration(
  bindings: Pick<
    RuntimeBindings,
    "ORGANIZER_AUTOJOIN_DOMAINS" | "ORGANIZER_AUTOJOIN_ORGANIZATION_ID"
  >,
): OrganizerAutojoinConfiguration | null {
  const rawDomains = bindings.ORGANIZER_AUTOJOIN_DOMAINS;
  const rawOrganizationId = bindings.ORGANIZER_AUTOJOIN_ORGANIZATION_ID;
  if (!nonEmpty(rawDomains) || !nonEmpty(rawOrganizationId)) return null;

  const domains = rawDomains.split(",").map((domain) => domain.trim().toLowerCase());
  const domainPattern =
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
  if (
    domains.length === 0 ||
    domains.some((domain) => !domainPattern.test(domain) || !ORGANIZER_AUTOJOIN_DOMAINS.has(domain))
  ) {
    return null;
  }

  const organizationId = rawOrganizationId.trim();
  if (
    organizationId !== ORGANIZER_AUTOJOIN_ORGANIZATION_ID ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(organizationId)
  ) {
    return null;
  }

  return { domains: [...new Set(domains)], organizationId };
}

function organizerAutojoinConfigurationProvided(
  bindings: Pick<
    RuntimeBindings,
    "ORGANIZER_AUTOJOIN_DOMAINS" | "ORGANIZER_AUTOJOIN_ORGANIZATION_ID"
  >,
): boolean {
  return (
    nonEmpty(bindings.ORGANIZER_AUTOJOIN_DOMAINS) ||
    nonEmpty(bindings.ORGANIZER_AUTOJOIN_ORGANIZATION_ID)
  );
}

function validOrganizerAutojoinConfiguration(
  configuration: OrganizerAutojoinConfiguration | null,
): OrganizerAutojoinConfiguration | null {
  if (
    configuration === null ||
    configuration.organizationId !== ORGANIZER_AUTOJOIN_ORGANIZATION_ID ||
    configuration.domains.length === 0 ||
    configuration.domains.some((domain) => !ORGANIZER_AUTOJOIN_DOMAINS.has(domain))
  ) {
    return null;
  }
  return {
    domains: [...new Set(configuration.domains)],
    organizationId: configuration.organizationId,
  };
}

function validDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function membershipsFrom(rows: readonly MembershipRow[]): OrganizationMembership[] {
  const roles = new Set<string>(organizationRoles);
  return rows.flatMap((row) =>
    nonEmpty(row.organization_id) && roles.has(row.role)
      ? [
          {
            organizationId: row.organization_id,
            role: row.role as OrganizationMembership["role"],
          },
        ]
      : [],
  );
}

function speakerGrantsFrom(rows: readonly SpeakerGrantRow[]): SpeakerGrant[] {
  return rows.flatMap((row) =>
    nonEmpty(row.organization_id) && nonEmpty(row.speaker_profile_id)
      ? [
          {
            organizationId: row.organization_id,
            speakerProfileId: row.speaker_profile_id,
          },
        ]
      : [],
  );
}

type MagicLinkOperations = Pick<BetterAuthGateway, "requestMagicLink" | "consumeMagicLink">;

const unavailableMagicLinks: MagicLinkOperations = {
  async requestMagicLink() {
    throw new AuthConfigurationError("OpenSend magic-link delivery is not configured.");
  },
  async consumeMagicLink() {
    return null;
  },
};

export class D1BetterAuthGateway implements BetterAuthGateway {
  readonly #magicLinks: MagicLinkOperations;
  readonly #organizerAutojoin: OrganizerAutojoinConfiguration | null;

  constructor(
    private readonly database: D1Database,
    magicLinks: MagicLinkOperations = unavailableMagicLinks,
    organizerAutojoin: OrganizerAutojoinConfiguration | null = null,
  ) {
    this.#magicLinks = magicLinks;
    this.#organizerAutojoin = validOrganizerAutojoinConfiguration(organizerAutojoin);
  }

  async resolveSession(sessionToken: string): Promise<AuthSession | null> {
    const tokenDigest = await sha256(sessionToken);
    const row = await this.database
      .prepare(
        `SELECT sessions.id AS session_id,
                sessions.user_id AS user_id,
                users.email AS email,
                users.email_verified AS email_verified,
                sessions.expires_at AS expires_at
           FROM auth_sessions AS sessions
           JOIN auth_users AS users ON users.id = sessions.user_id
          WHERE sessions.token_digest = ?
          LIMIT 1`,
      )
      .bind(tokenDigest)
      .first<SessionRow>();
    if (row === null) return null;
    const expiresAt = validDate(row.expires_at);
    if (expiresAt === null || !nonEmpty(row.session_id) || !nonEmpty(row.user_id)) return null;

    const [membershipResult, speakerGrantResult] = await Promise.all([
      this.database
        .prepare(
          `SELECT organization_id, role
             FROM organization_memberships
            WHERE user_id = ?
            ORDER BY organization_id`,
        )
        .bind(row.user_id)
        .all<MembershipRow>(),
      this.database
        .prepare(
          `SELECT organization_id, speaker_profile_id
             FROM speaker_grants
            WHERE user_id = ? AND revoked_at IS NULL
            ORDER BY organization_id, speaker_profile_id`,
        )
        .bind(row.user_id)
        .all<SpeakerGrantRow>(),
    ]);

    let memberships = membershipsFrom(membershipResult.results);
    const organizerAutojoin = this.#organizerAutojoin;
    const emailDomain = normalizedEmailDomain(row.email);
    if (
      organizerAutojoin !== null &&
      row.email_verified === 1 &&
      expiresAt.getTime() > Date.now() &&
      emailDomain !== null &&
      organizerAutojoin.domains.includes(emailDomain) &&
      !memberships.some(
        (membership) => membership.organizationId === organizerAutojoin.organizationId,
      ) &&
      !(await this.hasUnfinishedMemberInvitation(
        organizerAutojoin.organizationId,
        row.user_id,
        row.email,
      ))
    ) {
      const auditTimestamp = new Date().toISOString();
      const insertResult = await this.database
        .prepare(
          `INSERT INTO organization_memberships (
             organization_id, user_id, role, created_at, updated_at
           ) VALUES (?, ?, 'admin', ?, ?)
           ON CONFLICT (organization_id, user_id) DO NOTHING`,
        )
        .bind(organizerAutojoin.organizationId, row.user_id, auditTimestamp, auditTimestamp)
        .run();
      if (Number(insertResult.meta?.changes ?? 0) > 0) {
        memberships = [
          ...memberships,
          { organizationId: organizerAutojoin.organizationId, role: "admin" },
        ];
      } else {
        const refreshedMemberships = await this.database
          .prepare(
            `SELECT organization_id, role
               FROM organization_memberships
              WHERE user_id = ?
              ORDER BY organization_id`,
          )
          .bind(row.user_id)
          .all<MembershipRow>();
        memberships = membershipsFrom(refreshedMemberships.results);
      }
    }

    return {
      sessionId: row.session_id,
      userId: row.user_id,
      email: row.email,
      emailVerified: row.email_verified === 1,
      expiresAt,
      memberships,
      speakerGrants: speakerGrantsFrom(speakerGrantResult.results),
    };
  }

  private async hasUnfinishedMemberInvitation(
    organizationId: string,
    userId: string,
    email: string,
  ): Promise<boolean> {
    const rows = await this.database
      .prepare(
        `SELECT id, identifier, token_digest, expires_at, created_at, updated_at
           FROM auth_verifications`,
      )
      .all<MemberInvitationRow>();
    return rows.results.some((invitationRow) => {
      let parsed: MemberInvitationEnvelope | null;
      try {
        parsed = invitationEnvelope(JSON.parse(invitationRow.identifier));
      } catch {
        parsed = null;
      }
      return (
        parsed !== null &&
        parsed.usedAt === null &&
        parsed.invitation.organizationId === organizationId &&
        parsed.invitation.userId === userId &&
        parsed.invitation.email.toLowerCase() === email.toLowerCase() &&
        (parsed.invitation.status === "pending" ||
          parsed.invitation.status === "delivered" ||
          parsed.invitation.status === "accepted")
      );
    });
  }

  async requestMagicLink(input: { email: string; callbackUrl: string }): Promise<void> {
    await this.#magicLinks.requestMagicLink(input);
  }

  async consumeMagicLink(token: string): Promise<AuthSession | null> {
    return this.#magicLinks.consumeMagicLink(token);
  }
}
function recordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}
const organizationSlugPattern = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;

function organizationFromRow(row: OrganizationRow): OrganizationRecord | null {
  if (
    !nonEmpty(row.organization_id) ||
    !nonEmpty(row.slug) ||
    !organizationSlugPattern.test(row.slug.trim().toLowerCase()) ||
    !nonEmpty(row.name) ||
    !nonEmpty(row.created_at) ||
    !nonEmpty(row.updated_at) ||
    typeof row.config_json !== "string"
  ) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.config_json);
  } catch {
    return null;
  }
  if (!recordValue(parsed)) return null;
  if (
    Object.keys(parsed).some(
      (key) => key === "__proto__" || key === "constructor" || key === "prototype",
    )
  ) {
    return null;
  }
  return {
    organizationId: row.organization_id,
    slug: row.slug.trim().toLowerCase(),
    name: row.name.trim(),
    config: cloneValue(parsed),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
function organizationFromValue(value: unknown): OrganizationRecord | null {
  if (!recordValue(value)) return null;
  if (
    typeof value.organizationId !== "string" ||
    typeof value.slug !== "string" ||
    typeof value.name !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }
  let configJson: string | undefined;
  try {
    configJson = JSON.stringify(value.config);
  } catch {
    return null;
  }
  if (configJson === undefined) return null;
  return organizationFromRow({
    organization_id: value.organizationId,
    slug: value.slug,
    name: value.name,
    config_json: configJson,
    created_at: value.createdAt,
    updated_at: value.updatedAt,
  });
}

function organizationFingerprint(organization: OrganizationRecord, ownerUserId: string): string {
  return JSON.stringify({
    organizationId: organization.organizationId,
    slug: organization.slug,
    name: organization.name,
    config: organization.config,
    ownerUserId,
  });
}

function sameOrganization(left: OrganizationRecord, right: OrganizationRecord): boolean {
  return (
    left.organizationId === right.organizationId &&
    left.slug === right.slug &&
    left.name === right.name &&
    JSON.stringify(left.config) === JSON.stringify(right.config)
  );
}

function organizationMembershipFromRow(
  row: OrganizationMembershipOrganizationRow,
): MemberOrganizationMembership | null {
  if (
    !nonEmpty(row.organization_id) ||
    !nonEmpty(row.user_id) ||
    !nonEmpty(row.role) ||
    row.organization_slug === null ||
    row.organization_name === null ||
    row.organization_config_json === null ||
    row.organization_created_at === null ||
    row.organization_updated_at === null
  ) {
    return null;
  }
  if (row.role !== "owner" && row.role !== "admin" && row.role !== "reviewer") return null;
  const organization = organizationFromRow({
    organization_id: row.organization_id,
    slug: row.organization_slug,
    name: row.organization_name,
    config_json: row.organization_config_json,
    created_at: row.organization_created_at,
    updated_at: row.organization_updated_at,
  });
  return organization === null
    ? null
    : {
        ...organization,
        role: row.role,
      };
}

function organizationSlugBase(organizationId: string): string {
  const normalized = organizationId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  const base = normalized.slice(0, 64).replace(/-+$/u, "");
  return base.length === 0 ? "organization" : base;
}

function organizationDisplayName(organizationId: string): string {
  const normalized = [...organizationId]
    .map((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint < 32 || codePoint === 127) ? " " : character;
    })
    .join("")
    .trim()
    .slice(0, 200);
  return normalized.length === 0 ? "Organization" : normalized;
}

function memberUserFromRow(row: MemberUserRow): MemberUser | null {
  if (
    !nonEmpty(row.id) ||
    !nonEmpty(row.email) ||
    !nonEmpty(row.created_at) ||
    !nonEmpty(row.updated_at)
  ) {
    return null;
  }
  return {
    userId: row.id,
    email: row.email,
    name: typeof row.name === "string" && row.name.trim().length > 0 ? row.name : null,
    emailVerified: row.email_verified === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function memberFromRow(row: MemberRow): Member | null {
  const user = memberUserFromRow({
    id: row.user_id,
    email: row.email,
    name: row.name,
    email_verified: row.email_verified,
    created_at: row.user_created_at ?? row.created_at,
    updated_at: row.user_updated_at ?? row.updated_at,
  });
  if (user === null || !nonEmpty(row.organization_id) || !nonEmpty(row.role)) return null;
  if (row.role !== "owner" && row.role !== "admin" && row.role !== "reviewer") return null;
  return {
    organizationId: row.organization_id,
    userId: user.userId,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
    status: user.emailVerified ? "active" : "pending",
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at > user.updatedAt ? row.updated_at : user.updatedAt,
  };
}

function invitationEnvelope(value: unknown): MemberInvitationEnvelope | null {
  if (!recordValue(value) || value.kind !== "member_invitation") return null;
  const candidate = value.invitation;
  if (!recordValue(candidate)) return null;
  const status = candidate.status;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.organizationId !== "string" ||
    typeof candidate.userId !== "string" ||
    typeof candidate.email !== "string" ||
    (candidate.name !== null && typeof candidate.name !== "string") ||
    (candidate.role !== "owner" && candidate.role !== "admin" && candidate.role !== "reviewer") ||
    (status !== "pending" &&
      status !== "delivered" &&
      status !== "accepted" &&
      status !== "revoked") ||
    typeof candidate.idempotencyKey !== "string" ||
    typeof candidate.createdAt !== "string" ||
    typeof candidate.updatedAt !== "string" ||
    typeof candidate.expiresAt !== "string" ||
    (candidate.deliveredAt !== null && typeof candidate.deliveredAt !== "string") ||
    (candidate.acceptedAt !== null && typeof candidate.acceptedAt !== "string") ||
    (value.activationDigest !== null && typeof value.activationDigest !== "string") ||
    (value.usedAt !== null && typeof value.usedAt !== "string")
  ) {
    return null;
  }
  return {
    kind: "member_invitation",
    invitation: candidate as unknown as MemberInvitation,
    activationDigest: value.activationDigest as string | null,
    usedAt: value.usedAt as string | null,
  };
}

function invitationIdentifier(envelope: MemberInvitationEnvelope): string {
  return JSON.stringify(envelope);
}

function tokenFromUrl(value: string): string {
  const candidate = value.trim();
  if (candidate.length === 0) return candidate;
  try {
    const parsed = new URL(candidate);
    return parsed.searchParams.get("token") ?? candidate;
  } catch {
    return candidate;
  }
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function repositoryConflict(error: unknown): boolean {
  return error instanceof Error && /constraint|unique|duplicate/i.test(error.message);
}

/** D1-backed identity, membership, and invitation metadata. */
export class D1MemberIdentityRepository implements MemberIdentityRepository {
  readonly #idempotency: D1IdempotencyStore;

  constructor(private readonly database: D1Database) {
    this.#idempotency = new D1IdempotencyStore(database);
  }
  async createOrganizationWithOwner(input: {
    readonly organization: OrganizationRecord;
    readonly membership: MemberMembership;
    readonly idempotencyKey?: string;
  }): Promise<OrganizationRecord> {
    const organization = cloneValue(input.organization);
    const membership = cloneValue(input.membership);
    if (
      membership.organizationId !== organization.organizationId ||
      membership.role !== "owner" ||
      !nonEmpty(membership.userId)
    ) {
      throw new MemberRepositoryConflictError("The organization owner membership is invalid.");
    }

    const allowExisting = input.idempotencyKey !== undefined;
    const operation = () =>
      this.insertOrganizationWithOwner({ organization, membership, allowExisting });
    if (input.idempotencyKey === undefined) return operation();

    const scope = `${encodeURIComponent(membership.userId)}:organization-create`;
    const key = input.idempotencyKey;
    const fingerprint = organizationFingerprint(organization, membership.userId);
    const claim = await this.#idempotency.begin({ scope, key, fingerprint });
    if (claim.status === "conflict") {
      throw new MemberRepositoryConflictError(
        "The organization idempotency key was already used for another request.",
      );
    }
    if (claim.status === "replay" || claim.status === "pending") {
      const response = claim.status === "replay" ? claim.response : await claim.wait();
      const replay = organizationFromValue(response.body);
      if (replay === null) {
        throw new MemberRepositoryConflictError("The stored organization response is invalid.");
      }
      return cloneValue(replay);
    }

    try {
      const created = await operation();
      const completeInput = {
        scope,
        key,
        fingerprint,
        response: { status: 201, body: created },
        ...(claim.leaseId === undefined ? {} : { leaseId: claim.leaseId }),
      };
      await this.#idempotency.complete(completeInput);
      return cloneValue(created);
    } catch (error) {
      if (this.#idempotency.release !== undefined) {
        const releaseInput = {
          scope,
          key,
          fingerprint,
          ...(claim.leaseId === undefined ? {} : { leaseId: claim.leaseId }),
        };
        await this.#idempotency.release(releaseInput);
      }
      throw error;
    }
  }

  async listOrganizationsForUser(userId: string): Promise<readonly MemberOrganizationMembership[]> {
    const rows = await this.organizationRowsForUser(userId);
    const missing = [
      ...new Set(
        rows.filter((row) => row.organization_slug === null).map((row) => row.organization_id),
      ),
    ];
    for (const organizationId of missing) await this.materializeOrganization(organizationId);
    const refreshed = missing.length === 0 ? rows : await this.organizationRowsForUser(userId);
    return refreshed
      .map(organizationMembershipFromRow)
      .filter((organization): organization is MemberOrganizationMembership => organization !== null)
      .sort(
        (left, right) =>
          left.name.localeCompare(right.name) ||
          left.organizationId.localeCompare(right.organizationId),
      )
      .map(cloneValue);
  }

  async getOrganization(organizationId: string): Promise<OrganizationRecord | null> {
    const current = await this.readOrganization(organizationId);
    return current ?? this.materializeOrganization(organizationId);
  }

  async updateOrganization(input: {
    readonly organizationId: string;
    readonly slug?: string;
    readonly name?: string;
    readonly config?: Readonly<Record<string, unknown>>;
    readonly updatedAt: string;
  }): Promise<OrganizationRecord> {
    const current = await this.getOrganization(input.organizationId);
    if (current === null) {
      throw new MemberRepositoryConflictError("The organization does not exist.");
    }

    const assignments: string[] = [];
    const values: string[] = [];
    if (input.slug !== undefined) {
      assignments.push("slug = ?");
      values.push(input.slug);
    }
    if (input.name !== undefined) {
      assignments.push("name = ?");
      values.push(input.name);
    }
    if (input.config !== undefined) {
      let configJson: string | undefined;
      try {
        configJson = JSON.stringify(input.config);
      } catch {
        throw new MemberRepositoryConflictError("The organization config is not serializable.");
      }
      if (configJson === undefined) {
        throw new MemberRepositoryConflictError("The organization config is not serializable.");
      }
      assignments.push("config_json = ?");
      values.push(configJson);
    }
    assignments.push("updated_at = ?");
    values.push(input.updatedAt, input.organizationId);

    try {
      await this.database
        .prepare(`UPDATE organizations SET ${assignments.join(", ")} WHERE organization_id = ?`)
        .bind(...values)
        .run();
    } catch (error) {
      if (repositoryConflict(error)) {
        throw new MemberRepositoryConflictError("The organization slug already exists.");
      }
      throw error;
    }

    const updated = await this.readOrganization(input.organizationId);
    if (updated === null) {
      throw new MemberRepositoryConflictError("The organization could not be updated.");
    }
    return cloneValue(updated);
  }

  private async insertOrganizationWithOwner(input: {
    readonly organization: OrganizationRecord;
    readonly membership: MemberMembership;
    readonly allowExisting: boolean;
  }): Promise<OrganizationRecord> {
    const existing = await this.readOrganization(input.organization.organizationId);
    if (existing !== null) {
      if (!input.allowExisting || !sameOrganization(existing, input.organization)) {
        throw new MemberRepositoryConflictError("The organization ID already exists.");
      }
      const owners = await this.organizationOwnerIds(input.organization.organizationId);
      if (owners.includes(input.membership.userId)) return cloneValue(existing);
      if (owners.length > 0) {
        throw new MemberRepositoryConflictError("The organization already has another owner.");
      }
      try {
        await this.insertOwnerMembership(input.membership);
      } catch (error) {
        if (!repositoryConflict(error)) throw error;
        const refreshedOwners = await this.organizationOwnerIds(input.organization.organizationId);
        if (!refreshedOwners.includes(input.membership.userId)) throw error;
      }
      return cloneValue(existing);
    }

    let configJson: string | undefined;
    try {
      configJson = JSON.stringify(input.organization.config);
    } catch {
      throw new MemberRepositoryConflictError("The organization config is not serializable.");
    }
    if (configJson === undefined) {
      throw new MemberRepositoryConflictError("The organization config is not serializable.");
    }

    try {
      await this.database.batch([
        this.database
          .prepare(
            `INSERT INTO organizations (
               organization_id, slug, name, config_json, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            input.organization.organizationId,
            input.organization.slug,
            input.organization.name,
            configJson,
            input.organization.createdAt,
            input.organization.updatedAt,
          ),
        this.database
          .prepare(
            `INSERT INTO organization_memberships (
               organization_id, user_id, role, created_at, updated_at
             ) VALUES (?, ?, 'owner', ?, ?)`,
          )
          .bind(
            input.membership.organizationId,
            input.membership.userId,
            input.membership.createdAt,
            input.membership.updatedAt,
          ),
      ]);
    } catch (error) {
      if (repositoryConflict(error)) {
        throw new MemberRepositoryConflictError(
          "The organization ID, slug, or owner membership already exists.",
        );
      }
      throw error;
    }

    const created = await this.readOrganization(input.organization.organizationId);
    if (created === null) {
      throw new MemberRepositoryConflictError("The organization could not be created.");
    }
    const owners = await this.organizationOwnerIds(input.organization.organizationId);
    if (!owners.includes(input.membership.userId)) {
      throw new MemberRepositoryConflictError("The organization owner membership was not created.");
    }
    return cloneValue(created);
  }

  private async insertOwnerMembership(membership: MemberMembership): Promise<void> {
    await this.database
      .prepare(
        `INSERT INTO organization_memberships (
           organization_id, user_id, role, created_at, updated_at
         ) VALUES (?, ?, 'owner', ?, ?)`,
      )
      .bind(
        membership.organizationId,
        membership.userId,
        membership.createdAt,
        membership.updatedAt,
      )
      .run();
  }

  private async readOrganization(organizationId: string): Promise<OrganizationRecord | null> {
    const row = await this.database
      .prepare(
        `SELECT organization_id, slug, name, config_json, created_at, updated_at
           FROM organizations
          WHERE organization_id = ?
          LIMIT 1`,
      )
      .bind(organizationId)
      .first<OrganizationRow>();
    return row === null ? null : organizationFromRow(row);
  }

  private async organizationOwnerIds(organizationId: string): Promise<readonly string[]> {
    const result = await this.database
      .prepare(
        `SELECT user_id
           FROM organization_memberships
          WHERE organization_id = ? AND role = 'owner'
          ORDER BY user_id`,
      )
      .bind(organizationId)
      .all<{ readonly user_id: string }>();
    return result.results.map((row) => row.user_id).filter(nonEmpty);
  }

  private async organizationRowsForUser(
    userId: string,
  ): Promise<readonly OrganizationMembershipOrganizationRow[]> {
    const result = await this.database
      .prepare(
        `SELECT memberships.organization_id,
                memberships.user_id,
                memberships.role,
                memberships.created_at AS membership_created_at,
                memberships.updated_at AS membership_updated_at,
                organizations.slug AS organization_slug,
                organizations.name AS organization_name,
                organizations.config_json AS organization_config_json,
                organizations.created_at AS organization_created_at,
                organizations.updated_at AS organization_updated_at
           FROM organization_memberships AS memberships
           LEFT JOIN organizations
             ON organizations.organization_id = memberships.organization_id
          WHERE memberships.user_id = ?
          ORDER BY COALESCE(organizations.name, memberships.organization_id),
                   memberships.organization_id`,
      )
      .bind(userId)
      .all<OrganizationMembershipOrganizationRow>();
    return result.results;
  }

  private async materializeOrganization(
    organizationId: string,
  ): Promise<OrganizationRecord | null> {
    const existing = await this.readOrganization(organizationId);
    if (existing !== null) return existing;
    const membershipTimestamps = await this.database
      .prepare(
        `SELECT MIN(created_at) AS created_at, MAX(updated_at) AS updated_at
           FROM organization_memberships
          WHERE organization_id = ?`,
      )
      .bind(organizationId)
      .first<{ readonly created_at: string | null; readonly updated_at: string | null }>();
    if (
      membershipTimestamps === null ||
      (!nonEmpty(membershipTimestamps.created_at) && !nonEmpty(membershipTimestamps.updated_at))
    ) {
      return null;
    }
    const now = new Date().toISOString();
    let organizationSlug = await this.organizationSlugCandidate(organizationId);
    const organization: OrganizationRecord = {
      organizationId,
      slug: organizationSlug,
      name: organizationDisplayName(organizationId),
      config: {},
      createdAt: nonEmpty(membershipTimestamps.created_at) ? membershipTimestamps.created_at : now,
      updatedAt: nonEmpty(membershipTimestamps.updated_at) ? membershipTimestamps.updated_at : now,
    };
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await this.database
          .prepare(
            `INSERT INTO organizations (
               organization_id, slug, name, config_json, created_at, updated_at
             ) VALUES (?, ?, ?, '{}', ?, ?)
             ON CONFLICT (organization_id) DO NOTHING`,
          )
          .bind(
            organization.organizationId,
            organizationSlug,
            organization.name,
            organization.createdAt,
            organization.updatedAt,
          )
          .run();
        return await this.readOrganization(organizationId);
      } catch (error) {
        if (!repositoryConflict(error)) throw error;
        const raced = await this.readOrganization(organizationId);
        if (raced !== null) return raced;
        organizationSlug = await this.organizationSlugCandidate(organizationId);
      }
    }
    throw new MemberRepositoryConflictError("The organization could not be materialized.");
  }

  private async organizationSlugCandidate(organizationId: string): Promise<string> {
    const base = organizationSlugBase(organizationId);
    for (let suffix = 0; suffix < 1_000; suffix += 1) {
      const suffixValue = suffix === 0 ? "" : `-${suffix}`;
      const baseLength = Math.max(1, 64 - suffixValue.length);
      const candidate =
        `${base.slice(0, baseLength).replace(/-+$/u, "")}${suffixValue}` || "organization";
      const row = await this.database
        .prepare(
          `SELECT organization_id
             FROM organizations
            WHERE slug = ? COLLATE NOCASE
            LIMIT 1`,
        )
        .bind(candidate)
        .first<{ readonly organization_id: string }>();
      if (row === null || row.organization_id === organizationId) return candidate;
    }
    throw new MemberRepositoryConflictError("A unique organization slug could not be generated.");
  }

  async listMembers(organizationId: string): Promise<readonly Member[]> {
    const result = await this.database
      .prepare(
        `SELECT memberships.organization_id, memberships.user_id, memberships.role,
                memberships.created_at, memberships.updated_at,
                users.email, users.name, users.email_verified,
                users.created_at AS user_created_at, users.updated_at AS user_updated_at
           FROM organization_memberships AS memberships
           JOIN auth_users AS users ON users.id = memberships.user_id
          WHERE memberships.organization_id = ?
          ORDER BY users.email, memberships.user_id`,
      )
      .bind(organizationId)
      .all<
        MemberRow & {
          readonly user_created_at: string;
          readonly user_updated_at: string;
        }
      >();
    return result.results
      .map((row) =>
        memberFromRow({
          ...row,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }),
      )
      .filter(
        (member): member is Member => member !== null && member.organizationId === organizationId,
      )
      .map(cloneValue);
  }

  async getMember(organizationId: string, userId: string): Promise<Member | null> {
    const row = await this.database
      .prepare(
        `SELECT memberships.organization_id, memberships.user_id, memberships.role,
                memberships.created_at, memberships.updated_at,
                users.email, users.name, users.email_verified,
                users.created_at AS user_created_at, users.updated_at AS user_updated_at
           FROM organization_memberships AS memberships
           JOIN auth_users AS users ON users.id = memberships.user_id
          WHERE memberships.organization_id = ? AND memberships.user_id = ?
          LIMIT 1`,
      )
      .bind(organizationId, userId)
      .first<
        MemberRow & {
          readonly user_created_at: string;
          readonly user_updated_at: string;
        }
      >();
    return row === null ? null : memberFromRow(row);
  }

  async findMemberByEmail(organizationId: string, email: string): Promise<Member | null> {
    const row = await this.database
      .prepare(
        `SELECT memberships.organization_id, memberships.user_id, memberships.role,
                memberships.created_at, memberships.updated_at,
                users.email, users.name, users.email_verified,
                users.created_at AS user_created_at, users.updated_at AS user_updated_at
           FROM organization_memberships AS memberships
           JOIN auth_users AS users ON users.id = memberships.user_id
          WHERE memberships.organization_id = ? AND users.email = ? COLLATE NOCASE
          LIMIT 1`,
      )
      .bind(organizationId, email)
      .first<
        MemberRow & {
          readonly user_created_at: string;
          readonly user_updated_at: string;
        }
      >();
    return row === null ? null : memberFromRow(row);
  }

  async findUserByEmail(email: string): Promise<MemberUser | null> {
    const row = await this.database
      .prepare(
        `SELECT id, email, name, email_verified, created_at, updated_at
           FROM auth_users
          WHERE email = ? COLLATE NOCASE
          LIMIT 1`,
      )
      .bind(email)
      .first<MemberUserRow>();
    return row === null ? null : memberUserFromRow(row);
  }

  async createUser(input: {
    readonly userId: string;
    readonly email: string;
    readonly name: string | null;
    readonly emailVerified: boolean;
    readonly createdAt: string;
    readonly updatedAt: string;
  }): Promise<MemberUser> {
    try {
      await this.database
        .prepare(
          `INSERT INTO auth_users
             (id, email, name, email_verified, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          input.userId,
          input.email,
          input.name,
          input.emailVerified ? 1 : 0,
          input.createdAt,
          input.updatedAt,
        )
        .run();
    } catch (error) {
      if (repositoryConflict(error)) {
        throw new MemberRepositoryConflictError("The user already exists.");
      }
      throw error;
    }
    return {
      userId: input.userId,
      email: input.email,
      name: input.name,
      emailVerified: input.emailVerified,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    };
  }

  async createMembership(input: MemberMembership): Promise<void> {
    try {
      const result = await this.database
        .prepare(
          `INSERT INTO organization_memberships
             (organization_id, user_id, role, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(input.organizationId, input.userId, input.role, input.createdAt, input.updatedAt)
        .run();
      if (Number(result.meta?.changes ?? 1) === 0) {
        throw new MemberRepositoryConflictError("The membership already exists.");
      }
    } catch (error) {
      if (error instanceof MemberRepositoryConflictError) throw error;
      if (repositoryConflict(error)) {
        throw new MemberRepositoryConflictError("The membership already exists.");
      }
      throw error;
    }
  }

  async updateMembershipRole(
    organizationId: string,
    userId: string,
    role: MemberMembership["role"],
    updatedAt: string,
  ): Promise<void> {
    await this.database
      .prepare(
        `UPDATE organization_memberships
            SET role = ?, updated_at = ?
          WHERE organization_id = ? AND user_id = ?`,
      )
      .bind(role, updatedAt, organizationId, userId)
      .run();
  }

  async removeMembership(organizationId: string, userId: string): Promise<void> {
    await this.database
      .prepare("DELETE FROM organization_memberships WHERE organization_id = ? AND user_id = ?")
      .bind(organizationId, userId)
      .run();
  }

  async countOwners(organizationId: string): Promise<number> {
    const row = await this.database
      .prepare(
        "SELECT COUNT(*) AS count FROM organization_memberships WHERE organization_id = ? AND role = 'owner'",
      )
      .bind(organizationId)
      .first<{ readonly count: number | string }>();
    const count = row === null ? 0 : Number(row.count);
    return Number.isFinite(count) && count >= 0 ? count : 0;
  }

  async findInvitationByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<MemberInvitation | null> {
    const rows = await this.invitationRows();
    for (const row of rows) {
      const parsed = this.parseInvitationRow(row);
      if (
        parsed !== null &&
        parsed.envelope.invitation.organizationId === organizationId &&
        parsed.envelope.invitation.idempotencyKey === idempotencyKey
      ) {
        return cloneValue(parsed.envelope.invitation);
      }
    }
    return null;
  }

  async findPendingInvitation(
    organizationId: string,
    email: string,
  ): Promise<MemberInvitation | null> {
    const rows = await this.invitationRows();
    const candidates = rows
      .map((row) => this.parseInvitationRow(row))
      .filter(
        (
          entry,
        ): entry is {
          readonly row: MemberInvitationRow;
          readonly envelope: MemberInvitationEnvelope;
        } =>
          entry !== null &&
          entry.envelope.invitation.organizationId === organizationId &&
          entry.envelope.invitation.email.toLowerCase() === email.toLowerCase() &&
          (entry.envelope.invitation.status === "pending" ||
            entry.envelope.invitation.status === "delivered"),
      )
      .sort((left, right) =>
        right.envelope.invitation.createdAt.localeCompare(left.envelope.invitation.createdAt),
      );
    return candidates[0] === undefined ? null : cloneValue(candidates[0].envelope.invitation);
  }
  async listPendingInvitations(organizationId: string): Promise<readonly MemberInvitation[]> {
    const rows = await this.invitationRows();
    return rows
      .map((row) => this.parseInvitationRow(row))
      .filter(
        (
          entry,
        ): entry is {
          readonly row: MemberInvitationRow;
          readonly envelope: MemberInvitationEnvelope;
        } =>
          entry !== null &&
          entry.envelope.invitation.organizationId === organizationId &&
          (entry.envelope.invitation.status === "pending" ||
            entry.envelope.invitation.status === "delivered"),
      )
      .map((entry) => cloneValue(entry.envelope.invitation))
      .sort((left, right) => left.email.localeCompare(right.email));
  }
  async revokePendingInvitations(
    organizationId: string,
    email: string,
    revokedAt: string,
  ): Promise<readonly MemberInvitation[]> {
    const rows = await this.invitationRows();
    const revoked: MemberInvitation[] = [];
    for (const row of rows) {
      const parsed = this.parseInvitationRow(row);
      if (
        parsed === null ||
        parsed.envelope.invitation.organizationId !== organizationId ||
        parsed.envelope.invitation.email.toLowerCase() !== email.toLowerCase() ||
        (parsed.envelope.invitation.status !== "pending" &&
          parsed.envelope.invitation.status !== "delivered")
      ) {
        continue;
      }
      revoked.push(
        await this.updateInvitation(parsed.envelope.invitation.id, (invitation) => ({
          ...invitation,
          status: "revoked",
          updatedAt: revokedAt,
        })),
      );
    }
    return revoked.map(cloneValue);
  }

  async getInvitation(invitationId: string): Promise<MemberInvitation | null> {
    const row = await this.database
      .prepare(
        `SELECT id, identifier, token_digest, expires_at, created_at, updated_at
           FROM auth_verifications
          WHERE id = ?
          LIMIT 1`,
      )
      .bind(invitationId)
      .first<MemberInvitationRow>();
    const envelope = row === null ? null : this.parseInvitationRow(row);
    return envelope === null ? null : cloneValue(envelope.envelope.invitation);
  }

  async createInvitation(input: MemberInvitation): Promise<void> {
    if (await this.findInvitationByIdempotencyKey(input.organizationId, input.idempotencyKey)) {
      throw new MemberRepositoryConflictError("The invitation idempotency key already exists.");
    }
    const envelope: MemberInvitationEnvelope = {
      kind: "member_invitation",
      invitation: cloneValue(input),
      usedAt: null,
      activationDigest: null,
    };
    const temporaryDigest = await sha256(randomToken());
    try {
      await this.database
        .prepare(
          `INSERT INTO auth_verifications
             (id, identifier, token_digest, expires_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          input.id,
          invitationIdentifier(envelope),
          temporaryDigest,
          input.expiresAt,
          input.createdAt,
          input.updatedAt,
        )
        .run();
    } catch (error) {
      if (repositoryConflict(error)) {
        throw new MemberRepositoryConflictError("The invitation already exists.");
      }
      throw error;
    }
  }

  async markInvitationDelivered(
    invitationId: string,
    deliveredAt: string,
  ): Promise<MemberInvitation> {
    return this.updateInvitation(invitationId, (invitation) => {
      if (invitation.status !== "pending") {
        throw new MemberRepositoryConflictError("The invitation is not pending delivery.");
      }
      return {
        ...invitation,
        status: "delivered",
        deliveredAt,
        updatedAt: deliveredAt,
      };
    });
  }

  async claimInvitationActivation(
    invitationId: string,
    activationDigest: string,
    acceptedAt: string,
  ): Promise<MemberInvitation> {
    const row = await this.database
      .prepare(
        `SELECT id, identifier, token_digest, expires_at, created_at, updated_at
           FROM auth_verifications
          WHERE id = ?
          LIMIT 1`,
      )
      .bind(invitationId)
      .first<MemberInvitationRow>();
    if (row === null) throw new MemberRepositoryConflictError("The invitation does not exist.");
    const parsed = this.parseInvitationRow(row);
    if (parsed === null) throw new MemberRepositoryConflictError("The invitation does not exist.");
    if (parsed.envelope.invitation.status === "accepted") {
      if (parsed.envelope.activationDigest !== activationDigest) {
        throw new MemberRepositoryConflictError(
          "The invitation is already being activated with different account details.",
        );
      }
      return cloneValue(parsed.envelope.invitation);
    }
    if (
      parsed.envelope.invitation.status !== "pending" &&
      parsed.envelope.invitation.status !== "delivered"
    ) {
      throw new MemberRepositoryConflictError("The invitation cannot be activated.");
    }
    const updatedInvitation: MemberInvitation = {
      ...parsed.envelope.invitation,
      status: "accepted",
      acceptedAt,
      updatedAt: acceptedAt,
    };
    const updatedEnvelope: MemberInvitationEnvelope = {
      ...parsed.envelope,
      invitation: updatedInvitation,
      activationDigest,
    };
    const result = await this.database
      .prepare(
        `UPDATE auth_verifications
            SET identifier = ?, expires_at = ?, updated_at = ?
          WHERE id = ? AND identifier = ?`,
      )
      .bind(
        invitationIdentifier(updatedEnvelope),
        updatedInvitation.expiresAt,
        updatedInvitation.updatedAt,
        invitationId,
        row.identifier,
      )
      .run();
    if (Number(result.meta?.changes ?? 1) !== 1) {
      throw new MemberRepositoryConflictError("The invitation activation claim was superseded.");
    }
    return cloneValue(updatedInvitation);
  }

  async activateUser(userId: string, name: string | null, updatedAt: string): Promise<MemberUser> {
    const result = await this.database
      .prepare(
        `UPDATE auth_users
            SET name = ?, email_verified = 1, updated_at = ?
          WHERE id = ?`,
      )
      .bind(name, updatedAt, userId)
      .run();
    if (Number(result.meta?.changes ?? 1) === 0) {
      throw new MemberRepositoryConflictError("The user does not exist.");
    }
    const row = await this.database
      .prepare(
        "SELECT id, email, name, email_verified, created_at, updated_at FROM auth_users WHERE id = ? LIMIT 1",
      )
      .bind(userId)
      .first<MemberUserRow>();
    const user = row === null ? null : memberUserFromRow(row);
    if (user === null) throw new MemberRepositoryConflictError("The user does not exist.");
    return user;
  }

  private async invitationRows(): Promise<readonly MemberInvitationRow[]> {
    const result = await this.database
      .prepare(
        `SELECT id, identifier, token_digest, expires_at, created_at, updated_at
           FROM auth_verifications`,
      )
      .all<MemberInvitationRow>();
    return result.results;
  }

  private parseInvitationRow(
    row: MemberInvitationRow,
  ): { readonly row: MemberInvitationRow; readonly envelope: MemberInvitationEnvelope } | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.identifier);
    } catch {
      return null;
    }
    const envelope = invitationEnvelope(parsed);
    return envelope === null ? null : { row, envelope };
  }

  private async updateInvitation(
    invitationId: string,
    update: (invitation: MemberInvitation) => MemberInvitation,
  ): Promise<MemberInvitation> {
    const row = await this.database
      .prepare(
        `SELECT id, identifier, token_digest, expires_at, created_at, updated_at
           FROM auth_verifications
          WHERE id = ?
          LIMIT 1`,
      )
      .bind(invitationId)
      .first<MemberInvitationRow>();
    if (row === null) throw new MemberRepositoryConflictError("The invitation does not exist.");
    const parsed = this.parseInvitationRow(row);
    if (parsed === null) throw new MemberRepositoryConflictError("The invitation does not exist.");
    const updatedEnvelope: MemberInvitationEnvelope = {
      ...parsed.envelope,
      invitation: update(parsed.envelope.invitation),
    };
    const result = await this.database
      .prepare(
        "UPDATE auth_verifications SET identifier = ?, expires_at = ?, updated_at = ? WHERE id = ? AND identifier = ?",
      )
      .bind(
        invitationIdentifier(updatedEnvelope),
        updatedEnvelope.invitation.expiresAt,
        updatedEnvelope.invitation.updatedAt,
        invitationId,
        row.identifier,
      )
      .run();
    if (Number(result.meta?.changes ?? 1) !== 1) {
      throw new MemberRepositoryConflictError("The invitation could not be updated.");
    }
    return cloneValue(updatedEnvelope.invitation);
  }
}

/** One-time member setup links use Better Auth's verification table and retain only token digests. */
export class D1MemberAuthBoundary implements MemberAuthBoundary {
  readonly #webOrigin: string;

  constructor(
    private readonly database: D1Database,
    webOrigin: string,
  ) {
    this.#webOrigin = webOrigin.replace(/\/+$/u, "");
  }

  async issueSetupLink(input: {
    readonly invitationId: string;
    readonly organizationId: string;
    readonly userId: string;
    readonly email: string;
    readonly expiresAt: Date;
  }): Promise<{ setupUrl: string; expiresAt: Date }> {
    const token = randomToken();
    const tokenDigest = await sha256(token);
    const row = await this.database
      .prepare(
        `SELECT id, identifier, token_digest, expires_at, created_at, updated_at
           FROM auth_verifications
          WHERE id = ?
          LIMIT 1`,
      )
      .bind(input.invitationId)
      .first<MemberInvitationRow>();
    if (row === null) throw new Error("The invitation setup record does not exist.");
    const parsed = (() => {
      try {
        return invitationEnvelope(JSON.parse(row.identifier));
      } catch {
        return null;
      }
    })();
    if (
      parsed === null ||
      parsed.invitation.id !== row.id ||
      parsed.invitation.organizationId !== input.organizationId ||
      parsed.invitation.userId !== input.userId ||
      parsed.invitation.email !== input.email ||
      parsed.invitation.expiresAt !== input.expiresAt.toISOString() ||
      parsed.invitation.status !== "pending" ||
      parsed.activationDigest !== null ||
      parsed.usedAt !== null
    ) {
      throw new Error("The invitation setup record is invalid.");
    }
    const result = await this.database
      .prepare(
        "UPDATE auth_verifications SET token_digest = ?, expires_at = ?, updated_at = ? WHERE id = ? AND identifier = ?",
      )
      .bind(
        tokenDigest,
        input.expiresAt.toISOString(),
        new Date().toISOString(),
        input.invitationId,
        row.identifier,
      )
      .run();
    if (Number(result.meta?.changes ?? 1) !== 1) {
      throw new Error("The invitation setup record could not be issued.");
    }
    const setupUrl =
      `${this.#webOrigin}/admin/organizations/${encodeURIComponent(input.organizationId)}/members/setup` +
      `?token=${encodeURIComponent(token)}`;
    return { setupUrl, expiresAt: input.expiresAt };
  }

  async consumeSetupLink(
    tokenOrUrl: string,
    organizationId: string,
  ): Promise<SetupLinkClaim | null> {
    const token = tokenFromUrl(tokenOrUrl);
    if (token.length === 0) return null;
    const tokenDigest = await sha256(token);
    const row = await this.database
      .prepare(
        `SELECT id, identifier, token_digest, expires_at, created_at, updated_at
           FROM auth_verifications
          WHERE token_digest = ?
          LIMIT 1`,
      )
      .bind(tokenDigest)
      .first<MemberInvitationRow>();
    if (row === null) return null;
    let parsed: MemberInvitationEnvelope | null;
    try {
      parsed = invitationEnvelope(JSON.parse(row.identifier));
    } catch {
      parsed = null;
    }
    const expiresAt = new Date(row.expires_at);
    if (
      parsed === null ||
      parsed.invitation.id !== row.id ||
      parsed.usedAt !== null ||
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt.getTime() <= Date.now() ||
      parsed.invitation.expiresAt !== row.expires_at
    ) {
      return null;
    }
    if (parsed.invitation.organizationId !== organizationId) return null;
    const user = await this.database
      .prepare("SELECT email FROM auth_users WHERE id = ? LIMIT 1")
      .bind(parsed.invitation.userId)
      .first<{ readonly email: string }>();
    if (
      typeof user?.email !== "string" ||
      user.email.toLowerCase() !== parsed.invitation.email.toLowerCase()
    ) {
      return null;
    }
    if (
      parsed.invitation.status !== "pending" &&
      parsed.invitation.status !== "delivered" &&
      parsed.invitation.status !== "accepted"
    ) {
      return null;
    }
    return {
      invitationId: parsed.invitation.id,
      organizationId: parsed.invitation.organizationId,
      userId: parsed.invitation.userId,
      email: parsed.invitation.email,
      tokenDigest,
      expiresAt: new Date(parsed.invitation.expiresAt),
    };
  }

  async finalizeSetupLink(claim: SetupLinkClaim): Promise<boolean> {
    const row = await this.database
      .prepare(
        `SELECT id, identifier, token_digest, expires_at, created_at, updated_at
           FROM auth_verifications
          WHERE id = ?
          LIMIT 1`,
      )
      .bind(claim.invitationId)
      .first<MemberInvitationRow>();
    if (row === null || row.token_digest !== claim.tokenDigest) return false;
    let parsed: MemberInvitationEnvelope | null;
    try {
      parsed = invitationEnvelope(JSON.parse(row.identifier));
    } catch {
      parsed = null;
    }
    if (
      parsed === null ||
      parsed.invitation.id !== row.id ||
      parsed.usedAt !== null ||
      parsed.invitation.organizationId !== claim.organizationId ||
      parsed.invitation.userId !== claim.userId ||
      parsed.invitation.email.toLowerCase() !== claim.email.toLowerCase() ||
      parsed.invitation.expiresAt !== row.expires_at ||
      parsed.invitation.expiresAt !== claim.expiresAt.toISOString() ||
      parsed.invitation.status !== "accepted"
    ) {
      return false;
    }
    const usedAt = new Date().toISOString();
    const usedEnvelope: MemberInvitationEnvelope = { ...parsed, usedAt };
    const result = await this.database
      .prepare(
        `UPDATE auth_verifications
            SET identifier = ?, updated_at = ?
          WHERE id = ? AND token_digest = ? AND identifier = ?`,
      )
      .bind(invitationIdentifier(usedEnvelope), usedAt, row.id, claim.tokenDigest, row.identifier)
      .run();
    return Number(result.meta?.changes ?? 1) === 1;
  }

  async establishPassword(userId: string, password: string): Promise<void> {
    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();
    await this.database
      .prepare(
        `INSERT INTO auth_accounts
           (id, user_id, provider_id, provider_account_id, password_hash, created_at, updated_at)
         VALUES (?, ?, 'credential', ?, ?, ?, ?)
         ON CONFLICT (provider_id, provider_account_id)
         DO UPDATE SET password_hash = excluded.password_hash, updated_at = excluded.updated_at`,
      )
      .bind(crypto.randomUUID(), userId, userId, passwordHash, now, now)
      .run();
  }
  async revokeSessions(userId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.database
      .prepare("UPDATE auth_sessions SET expires_at = ?, updated_at = ? WHERE user_id = ?")
      .bind(now, now, userId)
      .run();
  }
}

interface CloudflareMemberInvitationQueueMessage extends CloudflareOutboxMessage {
  readonly transient: CloudflareOutboxInvitationTransient;
}

/** Invitation delivery keeps bearer URLs transient in the queue; D1 stores metadata and state only. */
export class CloudflareMemberInvitationDelivery implements MemberInvitationDelivery {
  constructor(
    private readonly database: D1Database,
    private readonly queue: Queue<CloudflareOutboxMessage>,
  ) {}

  async sendMemberInvitation(input: {
    readonly invitationId: string;
    readonly organizationId: string;
    readonly userId: string;
    readonly email: string;
    readonly name: string | null;
    readonly role: "owner" | "admin" | "reviewer";
    readonly setupUrl: string;
    readonly expiresAt: string;
  }): Promise<void> {
    const roleLabel =
      input.role === "reviewer" ? "Evaluator" : input.role === "admin" ? "Administrator" : "Owner";
    const message: OpenSendMessage = {
      from: DEFAULT_OPEN_SEND_SENDERS.auth,
      to: [input.email],
      subject: `You are invited to Open Sessionboard as ${roleLabel}`,
      html:
        `<p>You have been invited to join Open Sessionboard with the assigned role ` +
        `<strong>${escapeHtml(roleLabel)}</strong>.</p>` +
        `<p><a href="${escapeHtml(input.setupUrl)}">Set up ${escapeHtml(roleLabel)} access</a></p>`,
      text: `You have been invited to join Open Sessionboard as ${roleLabel}. Set up ${roleLabel} access: ${input.setupUrl}`,
      idempotencyKey: `member-invitation:${input.invitationId}`,
    };
    const now = new Date().toISOString();
    const jobId = `runtime:${input.organizationId}:communications:member-invitation:${input.invitationId}`;
    const metadata = {
      kind: "member_invitation",
      invitationId: input.invitationId,
      recipient: input.email,
      expiresAt: input.expiresAt,
    } as const;
    const result = await this.database
      .prepare(
        `INSERT INTO outbox_jobs
           (id, tenant_id, topic, deduplication_key, payload_json, state,
            attempt_count, available_at, created_at, updated_at)
         VALUES (?, ?, 'communications', ?, ?, 'pending', 0, ?, ?, ?)
         ON CONFLICT (tenant_id, topic, deduplication_key) DO NOTHING`,
      )
      .bind(
        jobId,
        input.organizationId,
        `member-invitation:${input.invitationId}`,
        JSON.stringify(metadata),
        now,
        now,
        now,
      )
      .run();
    const changes = result.meta?.changes;
    const inserted = changes === undefined || changes > 0;
    const state = inserted
      ? "pending"
      : (
          await this.database
            .prepare("SELECT state FROM outbox_jobs WHERE id = ? LIMIT 1")
            .bind(jobId)
            .first<{ readonly state: string }>()
        )?.state;
    if (state !== "pending") return;
    const queueMessage: CloudflareMemberInvitationQueueMessage = {
      version: 1,
      transient: {
        kind: "member_invitation",
        invitationId: input.invitationId,
        recipient: input.email,
        message,
      },
      jobId,
      tenantId: input.organizationId,
      topic: "communications",
      enqueuedAt: now,
    };
    await this.queue.send(queueMessage);
    await this.database
      .prepare(
        "UPDATE outbox_jobs SET state = 'queued', updated_at = ? WHERE id = ? AND state = 'pending'",
      )
      .bind(now, jobId)
      .run();
  }
}

/** Airtable/evaluation reviewer pools are keyed by organization, event, and round. */
export class AirtableReviewerPoolRepository implements ReviewerPoolRepository {
  readonly #store: AirtableJsonStore<ReviewerPoolRecord>;

  constructor(options: { readonly baseId: string; readonly transport: AirtableTransport }) {
    this.#store = new AirtableJsonStore({
      ...options,
      table: "Reviewer Pools",
      jsonField: "Pool JSON",
    });
  }

  async getReviewerPool(
    organizationId: string,
    eventId: string,
    roundId: string,
  ): Promise<ReviewerPool | null> {
    const record = await this.#store.find(this.poolKey(organizationId, eventId, roundId));
    if (record === undefined) return null;
    if (
      record.organizationId !== organizationId ||
      record.eventId !== eventId ||
      record.roundId !== roundId
    ) {
      return null;
    }
    const { id: _id, ...pool } = record;
    return cloneValue(pool);
  }

  async saveReviewerPool(pool: ReviewerPool, expectedVersion: number | null): Promise<void> {
    const id = this.poolKey(pool.organizationId, pool.eventId, pool.roundId);
    const current = await this.#store.find(id);
    if ((current?.version ?? null) !== expectedVersion) {
      throw new MemberRepositoryConflictError("The reviewer pool changed.");
    }
    const record: ReviewerPoolRecord = { ...cloneValue(pool), id };
    if (current === undefined) await this.#store.create(record);
    else await this.#store.update(id, record);
  }

  private poolKey(organizationId: string, eventId: string, roundId: string): string {
    return `reviewer-pool:${organizationId}:${eventId}:${roundId}`;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function scopesFrom(value: string): ApiKeyScope[] | null {
  let candidate: unknown;
  try {
    candidate = JSON.parse(value);
  } catch {
    return null;
  }
  if (!Array.isArray(candidate)) return null;
  const validScopes = new Set<string>(apiKeyScopes);
  if (!candidate.every((scope) => typeof scope === "string" && validScopes.has(scope))) return null;
  return [...new Set(candidate)] as ApiKeyScope[];
}

export class D1ApiKeyAuthenticatorGateway implements D1ApiKeyGateway {
  constructor(private readonly database: D1Database) {}

  async findByPresentedKey(presentedKey: string): Promise<StoredApiKey | null> {
    const digest = await sha256(presentedKey);
    const row = await this.database
      .prepare(
        `SELECT id, organization_id, label, scopes_json, expires_at, revoked_at
           FROM api_keys
          WHERE key_digest = ?
          LIMIT 1`,
      )
      .bind(digest)
      .first<ApiKeyRow>();
    if (row === null) return null;
    const scopes = scopesFrom(row.scopes_json);
    if (scopes === null || !nonEmpty(row.id) || !nonEmpty(row.organization_id)) return null;
    const expiresAt = row.expires_at === null ? null : validDate(row.expires_at);
    const revokedAt = row.revoked_at === null ? null : validDate(row.revoked_at);
    if (
      (row.expires_at !== null && expiresAt === null) ||
      (row.revoked_at !== null && revokedAt === null)
    ) {
      return null;
    }
    return {
      id: row.id,
      organizationId: row.organization_id,
      label: row.label,
      scopes,
      expiresAt,
      revokedAt,
    };
  }

  async recordSuccessfulUse(apiKeyId: string, usedAt: Date): Promise<void> {
    await this.database
      .prepare("UPDATE api_keys SET last_used_at = ?, updated_at = ? WHERE id = ?")
      .bind(usedAt.toISOString(), usedAt.toISOString(), apiKeyId)
      .run();
  }
}

const fixedOrigins = {
  staging: {
    web: "https://open-sessionboard-web-staging.ashleyha0317.workers.dev",
    api: "https://open-sessionboard-api-staging.ashleyha0317.workers.dev",
  },
  production: {
    web: "https://open-sessionboard-web-production.ashleyha0317.workers.dev",
    api: "https://open-sessionboard-api-production.ashleyha0317.workers.dev",
  },
} as const;

function authEnvironment(value: string): keyof typeof fixedOrigins | null {
  return value === "staging" || value === "production" ? value : null;
}

function configuredApiOrigin(bindings: RuntimeBindings): string | null {
  const environment = authEnvironment(bindings.APP_ENV);
  if (environment === null) return null;
  const expected = fixedOrigins[environment].api;
  return bindings.API_ORIGIN === undefined ? expected : bindings.API_ORIGIN;
}

export function inspectProductionRuntime(
  bindings: RuntimeBindings,
): RuntimeConfigurationInspection {
  const issues: string[] = [];
  const cloudflare = inspectCloudflareBindings(bindings);
  if (!cloudflare.success) issues.push(...cloudflare.issues);

  const environment = authEnvironment(bindings.APP_ENV);
  if (environment !== null) {
    const origins = fixedOrigins[environment];
    if (bindings.WEB_ORIGIN !== origins.web) {
      issues.push("WEB_ORIGIN does not match the fixed deployment origin.");
    }
    if (bindings.API_ORIGIN !== undefined && bindings.API_ORIGIN !== origins.api) {
      issues.push("API_ORIGIN does not match the fixed deployment origin.");
    }
  }
  if (environment !== null) {
    if (bindings.AI === undefined || typeof bindings.AI.run !== "function") {
      issues.push("AI must be a Cloudflare Workers AI binding outside local development");
    }
    if (!nonEmpty(bindings.AI_MODEL)) {
      issues.push("AI_MODEL is required outside local development");
    }
  }
  if (
    organizerAutojoinConfigurationProvided(bindings) &&
    parseOrganizerAutojoinConfiguration(bindings) === null
  ) {
    issues.push(
      "ORGANIZER_AUTOJOIN_DOMAINS and ORGANIZER_AUTOJOIN_ORGANIZATION_ID must be configured as a valid pair.",
    );
  }

  if (!nonEmpty(bindings.AIRTABLE_ACCESS_TOKEN)) {
    issues.push("AIRTABLE_ACCESS_TOKEN is required outside local development");
  }
  if (!nonEmpty(bindings.AIRTABLE_BASE_ID)) {
    issues.push("AIRTABLE_BASE_ID is required outside local development");
  }
  if (!nonEmpty(bindings.BETTER_AUTH_SECRET) || bindings.BETTER_AUTH_SECRET.trim().length < 32) {
    issues.push("BETTER_AUTH_SECRET must contain at least 32 characters outside local development");
  }

  const openSendKey = (bindings.OPENSEND_API_KEY ?? bindings.OPENSEND_SENDING_API_KEY)?.trim();
  if (!openSendKey || !nonEmpty(bindings.OPENSEND_API_URL)) {
    issues.push("OPENSEND_API_URL and OPENSEND_API_KEY are required outside local development");
  }
  const configuredSenders = [
    ["AUTH_FROM_EMAIL", bindings.AUTH_FROM_EMAIL, DEFAULT_OPEN_SEND_SENDERS.auth],
    ["SPEAKERS_FROM_EMAIL", bindings.SPEAKERS_FROM_EMAIL, DEFAULT_OPEN_SEND_SENDERS.speakers],
    ["CALENDAR_FROM_EMAIL", bindings.CALENDAR_FROM_EMAIL, DEFAULT_OPEN_SEND_SENDERS.calendar],
  ] as const;
  for (const [name, value, expected] of configuredSenders) {
    if (value !== undefined && (typeof value !== "string" || value.trim() !== expected)) {
      issues.push(`${name} must be an approved OpenSend sender address.`);
    }
  }

  const apiOrigin = configuredApiOrigin(bindings);
  if (apiOrigin === null || !nonEmpty(bindings.WEB_ORIGIN)) {
    issues.push("Better Auth web and API origins are required outside local development");
  } else {
    try {
      createBetterAuthRuntimeConfiguration({
        secret: bindings.BETTER_AUTH_SECRET ?? "",
        baseUrl: bindings.WEB_ORIGIN,
        trustedOrigins: [bindings.WEB_ORIGIN, apiOrigin],
      });
    } catch (error) {
      if (error instanceof AuthConfigurationError) {
        issues.push("Better Auth configuration is invalid.");
      } else {
        issues.push("Better Auth configuration could not be initialized.");
      }
    }
  }
  return { success: issues.length === 0, issues };
}

export function createCloudflareDependencies(bindings: RuntimeBindings): ApiDependencies {
  const inspection = inspectProductionRuntime(bindings);
  if (!inspection.success) {
    throw new TypeError("The production runtime is not configured.");
  }
  if (bindings.DB === undefined) {
    throw new TypeError("The D1 binding is required for Cloudflare authentication.");
  }
  if (bindings.AGENDA_COORDINATOR === undefined) {
    throw new TypeError("The agenda coordinator binding is required outside local development.");
  }
  if (bindings.PRIVATE_FILES === undefined) {
    throw new TypeError("The private files binding is required outside local development.");
  }
  if (bindings.OUTBOX_QUEUE === undefined) {
    throw new TypeError("The outbox queue binding is required outside local development.");
  }

  const authEnvironmentValue = authEnvironment(bindings.APP_ENV);
  const apiOrigin = configuredApiOrigin(bindings);
  const openSendKey = (bindings.OPENSEND_API_KEY ?? bindings.OPENSEND_SENDING_API_KEY)?.trim();
  if (
    authEnvironmentValue === null ||
    apiOrigin === null ||
    !nonEmpty(openSendKey) ||
    !nonEmpty(bindings.OPENSEND_API_URL)
  ) {
    throw new TypeError("The production authentication runtime is not configured.");
  }
  const organizerAutojoin = parseOrganizerAutojoinConfiguration(bindings);
  const model = bindings.AI_MODEL?.trim();
  const aiProviders = createCloudflareAiProviders(
    bindings.AI,
    model === undefined ? {} : { model },
  );

  const authConfiguration = createBetterAuthRuntimeConfiguration({
    secret: bindings.BETTER_AUTH_SECRET ?? "",
    baseUrl: bindings.WEB_ORIGIN,
    trustedOrigins: [bindings.WEB_ORIGIN, apiOrigin],
  });
  const openSend = new OpenSendClient({
    sendingApiKey: openSendKey,
    baseUrl: bindings.OPENSEND_API_URL,
    senderAddresses: {
      ...(nonEmpty(bindings.AUTH_FROM_EMAIL) ? { auth: bindings.AUTH_FROM_EMAIL } : {}),
      ...(nonEmpty(bindings.SPEAKERS_FROM_EMAIL) ? { speakers: bindings.SPEAKERS_FROM_EMAIL } : {}),
      ...(nonEmpty(bindings.CALENDAR_FROM_EMAIL) ? { calendar: bindings.CALENDAR_FROM_EMAIL } : {}),
    },
  });
  const betterAuthRuntime = createBetterAuthRuntime({
    database: bindings.DB,
    configuration: authConfiguration,
    environment: authEnvironmentValue,
    sendMagicLink: async (input) => {
      await openSend.send(
        createOpenSendMagicLinkMessage({
          email: input.email,
          url: input.url,
          sender: openSend.senderFor("auth"),
        }),
      );
    },
  });

  const authenticator = new RequestAuthenticator(
    new D1BetterAuthGateway(bindings.DB, betterAuthRuntime, organizerAutojoin),
    new D1ApiKeyAuthenticatorGateway(bindings.DB),
    { sessionCookieName: "__Secure-better-auth.session_token" },
  );
  const transport =
    bindings.AIRTABLE_TRANSPORT ??
    new RetryingAirtableTransport(
      new FetchAirtableTransport({
        token: bindings.AIRTABLE_ACCESS_TOKEN ?? "",
        ...(bindings.AIRTABLE_API_ORIGIN === undefined
          ? {}
          : { apiOrigin: bindings.AIRTABLE_API_ORIGIN }),
      }),
    );
  const dependencies = createAirtableDependencies({
    authenticator,
    baseId: bindings.AIRTABLE_BASE_ID ?? "",
    transport,
    database: bindings.DB,
    agendaCoordinator: bindings.AGENDA_COORDINATOR,
    privateFiles: bindings.PRIVATE_FILES,
    outboxQueue: bindings.OUTBOX_QUEUE,
    webOrigin: bindings.WEB_ORIGIN,
    aiProviders,
  });
  const memberService = new MemberService({
    identity: new D1MemberIdentityRepository(bindings.DB),
    auth: new D1MemberAuthBoundary(bindings.DB, bindings.WEB_ORIGIN),
    invitationDelivery: new CloudflareMemberInvitationDelivery(bindings.DB, bindings.OUTBOX_QUEUE),
    reviewerPools: new AirtableReviewerPoolRepository({
      baseId: bindings.AIRTABLE_BASE_ID ?? "",
      transport,
    }),
  });
  return { ...dependencies, auth: betterAuthRuntime, members: { service: memberService } };
}
