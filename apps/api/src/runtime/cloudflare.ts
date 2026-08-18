import {
  deploymentEnvironmentSchema,
  deploymentModeSchema,
  type OrganizationEntitlement,
  organizationEntitlementSchema,
  resolveDeploymentMode,
} from "@eventloom/contracts";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import type { ApiBindings, ApiDependencies } from "../app";
import { parseCommunicationIdentityEnvironment } from "../env";
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
  ReviewerGrant,
  SpeakerGrant,
  StoredApiKey,
} from "../features/auth/types";
import { apiKeyScopes, organizationRoles } from "../features/auth/types";
import type { EventRepository } from "../features/events/types";
import { createOrganizationPolicy } from "../features/organizations/policy";
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
  SetupLinkClaim,
} from "../features/members/types";
import {
  type CloudflareBindings,
  type CloudflareOutboxInvitationTransient,
  type CloudflareOutboxMessage,
  inspectCloudflareBindings,
} from "../infrastructure/cloudflare/bindings";
import { D1OrganizationEntitlementRepository } from "../infrastructure/cloudflare/repositories/organization-entitlements";
import {
  type AdvisoryAiReasoningEffort,
  type CloudflareAiBinding,
  createCloudflareAiProviders,
  createOpenAiResponsesBinding,
  DEFAULT_OPENAI_EVALUATION_MODEL,
  DEFAULT_OPENAI_RESPONSES_MODEL,
} from "../integrations/ai";
import { createAirtableIntegrationDependencies } from "../integrations/airtable/runtime";
import {
  OpenSendClient,
  type OpenSendSenderAddress,
  type OpenSendSenderAddresses,
} from "../integrations/opensend/client";
import type { OpenSendMessage } from "../integrations/opensend/types";
import type {
  IntegrationAdminRouteDependencies,
  IntegrationApiKeyCreation,
  IntegrationApiKeySummary,
  IntegrationDeliveryStatus,
} from "../routes/integrations";
import { createD1ApplicationDependencies, D1IdempotencyStore } from "./airtable";
import { createD1RuntimeDependencies, createRuntimeEventRoleInvitationAdapters } from "./d1";

export type RuntimeBindings = ApiBindings &
  Partial<Omit<CloudflareBindings, keyof ApiBindings>> & {
    readonly API_ORIGIN?: string;
    readonly DEPLOYMENT_MODE?: string;
    readonly RUNTIME_PROFILE?: string;
    /** Legacy global Airtable bindings are ignored; each connection chooses its own credential and base. */
    readonly AIRTABLE_ACCESS_TOKEN?: string;
    readonly AIRTABLE_BASE_ID?: string;
    readonly AIRTABLE_BASE_DEV_ID?: string;
    readonly AIRTABLE_CREDENTIAL_ENCRYPTION_KEY?: string;
    readonly AIRTABLE_PAT_CONNECTION_ENABLED?: string;
    readonly BETTER_AUTH_SECRET?: string;
    readonly OPENSEND_API_KEY?: string;
    readonly OPENSEND_SENDING_API_KEY?: string;
    readonly OPENSEND_API_URL?: string;
    readonly ORGANIZATION_PROVISIONING_TOKEN?: string;
    readonly CACHE_INVALIDATION_URL?: string;
    readonly CACHE_INVALIDATION_TOKEN?: string;
    readonly AUTH_FROM_EMAIL?: string;
    readonly SPEAKERS_FROM_EMAIL?: string;
    readonly CALENDAR_FROM_EMAIL?: string;
    readonly CALENDAR_UID_DOMAIN?: string;
    readonly AIRTABLE_API_ORIGIN?: string;
    readonly AIRTABLE_OAUTH_CLIENT_ID?: string;
    readonly AIRTABLE_OAUTH_CLIENT_SECRET?: string;
    readonly AI?: CloudflareAiBinding;
    readonly AI_MODEL?: string;
    readonly AI_PROVIDER?: string;
    readonly OPENAI_API_KEY?: string;
    readonly OPENAI_MODEL?: string;
    readonly OPENAI_AGENDA_MODEL?: string;
    readonly OPENAI_EVALUATION_MODEL?: string;
    readonly OPENAI_REMIX_MODEL?: string;
    readonly OPENAI_AGENDA_REASONING_EFFORT?: string;
    readonly OPENAI_EVALUATION_REASONING_EFFORT?: string;
    readonly OPENAI_REMIX_REASONING_EFFORT?: string;
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

interface SessionScopeRow extends SessionRow {
  readonly scope_type: "session" | "membership" | "reviewer_grant" | "speaker_grant";
  readonly scope_order: number;
  readonly organization_id: string | null;
  readonly event_id: string | null;
  readonly role: string | null;
  readonly speaker_profile_id: string | null;
}

interface MembershipRow {
  readonly organization_id: string;
  readonly role: string;
}

interface ReviewerGrantRow {
  readonly organization_id: string;
  readonly event_id: string;
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
  readonly activationCredentialHash: string | null;
  /** Temporary dual-read field for pre-0025 envelopes. New writes keep it null. */
  readonly activationDigest: string | null;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isHttpsOrigin(value: unknown): value is string {
  if (!nonEmpty(value)) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.pathname === "/" &&
      parsed.search === "" &&
      parsed.hash === ""
    );
  } catch {
    return false;
  }
}

function isLoopbackOrigin(value: unknown): value is string {
  if (!nonEmpty(value)) return false;
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.pathname === "/" &&
      parsed.search === "" &&
      parsed.hash === "" &&
      (hostname === "127.0.0.1" ||
        hostname === "localhost" ||
        hostname.endsWith(".localhost") ||
        hostname === "[::1]")
    );
  } catch {
    return false;
  }
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

function reviewerGrantsFrom(rows: readonly ReviewerGrantRow[]): ReviewerGrant[] {
  return rows.flatMap((row) =>
    nonEmpty(row.organization_id) && nonEmpty(row.event_id)
      ? [{ organizationId: row.organization_id, eventId: row.event_id }]
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

  constructor(
    private readonly database: D1Database,
    magicLinks: MagicLinkOperations = unavailableMagicLinks,
  ) {
    this.#magicLinks = magicLinks;
  }

  async resolveSession(sessionToken: string): Promise<AuthSession | null> {
    const tokenDigest = await sha256(sessionToken);
    const result = await this.database
      .prepare(
        `WITH session_base AS (
           SELECT sessions.id AS session_id,
                  sessions.user_id AS user_id,
                  users.email AS email,
                  users.email_verified AS email_verified,
                  sessions.expires_at AS expires_at
             FROM auth_sessions AS sessions
             JOIN auth_users AS users ON users.id = sessions.user_id
            WHERE sessions.token_digest = ?
            LIMIT 1
         )
         SELECT session_id,
                user_id,
                email,
                email_verified,
                expires_at,
                'session' AS scope_type,
                0 AS scope_order,
                NULL AS organization_id,
                NULL AS event_id,
                NULL AS role,
                NULL AS speaker_profile_id
           FROM session_base
         UNION ALL
         SELECT base.session_id,
                base.user_id,
                base.email,
                base.email_verified,
                base.expires_at,
                'membership' AS scope_type,
                1 AS scope_order,
                memberships.organization_id,
                NULL AS event_id,
                memberships.role,
                NULL AS speaker_profile_id
           FROM session_base AS base
           JOIN organization_memberships AS memberships
             ON memberships.user_id = base.user_id
         UNION ALL
         SELECT base.session_id,
                base.user_id,
                base.email,
                base.email_verified,
                base.expires_at,
                'reviewer_grant' AS scope_type,
                2 AS scope_order,
                invitations.organization_id,
                invitations.event_id,
                NULL AS role,
                NULL AS speaker_profile_id
           FROM session_base AS base
           JOIN event_role_invitations AS invitations
             ON invitations.recipient_user_id = base.user_id
            AND invitations.role = 'reviewer'
            AND invitations.status = 'accepted'
          WHERE base.email_verified = 1
         UNION ALL
         SELECT base.session_id,
                base.user_id,
                base.email,
                base.email_verified,
                base.expires_at,
                'speaker_grant' AS scope_type,
                3 AS scope_order,
                grants.organization_id,
                grants.event_id,
                NULL AS role,
                profiles.id AS speaker_profile_id
           FROM session_base AS base
           JOIN participant_grants AS grants
             ON grants.user_id = base.user_id
            AND grants.revoked_at IS NULL
           JOIN event_role_invitations AS invitations
             ON invitations.organization_id = grants.organization_id
            AND invitations.event_id = grants.event_id
            AND invitations.role = 'speaker'
            AND invitations.recipient_user_id = grants.user_id
            AND invitations.participant_id = grants.participant_id
            AND invitations.status = 'accepted'
           JOIN speaker_profiles AS profiles
             ON profiles.organization_id = grants.organization_id
            AND profiles.event_id = grants.event_id
            AND profiles.participant_id = grants.participant_id
            AND profiles.status <> 'revoked'
          WHERE base.email_verified = 1
          ORDER BY scope_order, organization_id, event_id, speaker_profile_id`,
      )
      .bind(tokenDigest)
      .all<SessionScopeRow>();
    const row = result.results.find((candidate) => candidate.scope_type === "session") ?? null;
    if (row === null) return null;
    const expiresAt = validDate(row.expires_at);
    if (expiresAt === null || !nonEmpty(row.session_id) || !nonEmpty(row.user_id)) return null;

    const membershipRows: MembershipRow[] = result.results.flatMap((scope) =>
      scope.scope_type === "membership" && scope.organization_id !== null && scope.role !== null
        ? [{ organization_id: scope.organization_id, role: scope.role }]
        : [],
    );
    const reviewerGrantRows: ReviewerGrantRow[] = result.results.flatMap((scope) =>
      scope.scope_type === "reviewer_grant" &&
      scope.organization_id !== null &&
      scope.event_id !== null
        ? [{ organization_id: scope.organization_id, event_id: scope.event_id }]
        : [],
    );
    const speakerGrantRows: SpeakerGrantRow[] = result.results.flatMap((scope) =>
      scope.scope_type === "speaker_grant" &&
      scope.organization_id !== null &&
      scope.speaker_profile_id !== null
        ? [
            {
              organization_id: scope.organization_id,
              speaker_profile_id: scope.speaker_profile_id,
            },
          ]
        : [],
    );

    const memberships = membershipsFrom(membershipRows);

    return {
      sessionId: row.session_id,
      userId: row.user_id,
      email: row.email,
      emailVerified: row.email_verified === 1,
      expiresAt,
      memberships,
      reviewerGrants: reviewerGrantsFrom(reviewerGrantRows),
      speakerGrants: speakerGrantsFrom(speakerGrantRows),
    };
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

function organizationFingerprint(
  organization: OrganizationRecord,
  ownerUserId: string,
  entitlement: OrganizationEntitlement,
): string {
  return JSON.stringify({
    organizationId: organization.organizationId,
    slug: organization.slug,
    name: organization.name,
    config: organization.config,
    ownerUserId,
    entitlement,
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
    (value.usedAt !== null && typeof value.usedAt !== "string")
  ) {
    return null;
  }
  const activationDigest = value.activationDigest === undefined ? null : value.activationDigest;
  const activationCredentialHash =
    value.activationCredentialHash === undefined ? null : value.activationCredentialHash;
  if (
    (activationDigest !== null && typeof activationDigest !== "string") ||
    (activationCredentialHash !== null && typeof activationCredentialHash !== "string") ||
    (activationDigest !== null && activationCredentialHash !== null)
  ) {
    return null;
  }
  return {
    kind: "member_invitation",
    invitation: candidate as unknown as MemberInvitation,
    activationCredentialHash: activationCredentialHash as string | null,
    activationDigest: activationDigest as string | null,
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

function secretEquals(candidate: string | null, expected: string): boolean {
  if (candidate === null) return false;
  const candidateBytes = new TextEncoder().encode(candidate);
  const expectedBytes = new TextEncoder().encode(expected);
  let difference = candidateBytes.length ^ expectedBytes.length;
  const length = Math.max(candidateBytes.length, expectedBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (candidateBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0);
  }
  return difference === 0;
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
    readonly entitlement: OrganizationEntitlement;
    readonly idempotencyKey?: string;
  }): Promise<OrganizationRecord> {
    const organization = cloneValue(input.organization);
    const membership = cloneValue(input.membership);
    const entitlement = organizationEntitlementSchema.parse(input.entitlement);
    if (
      membership.organizationId !== organization.organizationId ||
      membership.role !== "owner" ||
      entitlement.organizationId !== organization.organizationId ||
      !nonEmpty(membership.userId)
    ) {
      throw new MemberRepositoryConflictError("The organization owner membership is invalid.");
    }

    const allowExisting = input.idempotencyKey !== undefined;
    const operation = () =>
      this.insertOrganizationWithOwner({ organization, membership, entitlement, allowExisting });
    if (input.idempotencyKey === undefined) return operation();

    const scope = `${encodeURIComponent(membership.userId)}:organization-create`;
    const key = input.idempotencyKey;
    const fingerprint = organizationFingerprint(organization, membership.userId, entitlement);
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
    readonly entitlement: OrganizationEntitlement;
    readonly allowExisting: boolean;
  }): Promise<OrganizationRecord> {
    const existing = await this.readOrganization(input.organization.organizationId);
    if (existing !== null) {
      if (!input.allowExisting || !sameOrganization(existing, input.organization)) {
        throw new MemberRepositoryConflictError("The organization ID already exists.");
      }
      const owners = await this.organizationOwnerIds(input.organization.organizationId);
      const entitlement = await new D1OrganizationEntitlementRepository(
        this.database,
      ).getEntitlement(input.organization.organizationId);
      if (
        owners.includes(input.membership.userId) &&
        entitlement !== null &&
        JSON.stringify(entitlement) === JSON.stringify(input.entitlement)
      ) {
        return cloneValue(existing);
      }
      if (owners.includes(input.membership.userId)) {
        throw new MemberRepositoryConflictError(
          "The organization entitlement differs from the idempotent request.",
        );
      }
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
        this.database
          .prepare(
            `INSERT INTO organization_entitlements (
               organization_id, schema_version, revision, state, capabilities_json,
               active_event_limit, organizer_seat_limit, not_before, expires_at,
               created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            input.entitlement.organizationId,
            input.entitlement.schemaVersion,
            input.entitlement.revision,
            input.entitlement.state,
            JSON.stringify(input.entitlement.capabilities),
            input.entitlement.limits.activeEvents,
            input.entitlement.limits.organizerSeats,
            input.entitlement.notBefore,
            input.entitlement.expiresAt,
            input.organization.createdAt,
            input.organization.updatedAt,
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
    const entitlement = await new D1OrganizationEntitlementRepository(this.database).getEntitlement(
      input.organization.organizationId,
    );
    if (entitlement === null) {
      throw new MemberRepositoryConflictError("The organization entitlement was not created.");
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
      const guardedInsert = this.database
        .prepare(
          `INSERT INTO organization_memberships
             (organization_id, user_id, role, created_at, updated_at)
           SELECT ?, ?, ?, ?, ?
            WHERE ? NOT IN ('owner', 'admin')
               OR NOT EXISTS (
                    SELECT 1
                      FROM organization_entitlements entitlement
                     WHERE entitlement.organization_id = ?
                       AND entitlement.state = 'active'
                       AND entitlement.not_before <= ?
                       AND (entitlement.expires_at IS NULL OR entitlement.expires_at > ?)
                       AND entitlement.organizer_seat_limit IS NOT NULL
                       AND (
                         (SELECT COUNT(*)
                            FROM organization_memberships member
                           WHERE member.organization_id = ?
                             AND member.role IN ('owner', 'admin'))
                         +
                         (SELECT COUNT(*)
                            FROM auth_verifications invitation
                           WHERE invitation.identifier LIKE '{"kind":"member_invitation",%'
                             AND json_extract(invitation.identifier, '$.invitation.organizationId') = ?
                             AND json_extract(invitation.identifier, '$.invitation.role') IN ('owner', 'admin')
                             AND json_extract(invitation.identifier, '$.invitation.status') IN ('pending', 'delivered')
                         ) < entitlement.organizer_seat_limit
                       )
               )`,
        )
        .bind(
          input.organizationId,
          input.userId,
          input.role,
          input.createdAt,
          input.updatedAt,
          input.role,
          input.organizationId,
          input.updatedAt,
          input.updatedAt,
          input.organizationId,
          input.organizationId,
        );
      const result = await guardedInsert.run();
      if (Number(result.meta?.changes ?? 1) === 0) {
        throw new MemberRepositoryConflictError("The organizer seat limit has been reached.");
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
    const guardedUpdate = await this.database
      .prepare(
        `UPDATE organization_memberships
              SET role = ?, updated_at = ?
            WHERE organization_id = ? AND user_id = ?
              AND (
                ? NOT IN ('owner', 'admin')
                OR role IN ('owner', 'admin')
                OR NOT EXISTS (
                  SELECT 1
                    FROM organization_entitlements entitlement
                   WHERE entitlement.organization_id = ?
                     AND entitlement.state = 'active'
                     AND entitlement.not_before <= ?
                     AND (entitlement.expires_at IS NULL OR entitlement.expires_at > ?)
                     AND entitlement.organizer_seat_limit IS NOT NULL
                     AND (
                       (SELECT COUNT(*)
                          FROM organization_memberships member
                         WHERE member.organization_id = ?
                           AND member.role IN ('owner', 'admin'))
                       +
                       (SELECT COUNT(*)
                          FROM auth_verifications invitation
                         WHERE invitation.identifier LIKE '{"kind":"member_invitation",%'
                           AND json_extract(invitation.identifier, '$.invitation.organizationId') = ?
                           AND json_extract(invitation.identifier, '$.invitation.role') IN ('owner', 'admin')
                           AND json_extract(invitation.identifier, '$.invitation.status') IN ('pending', 'delivered')
                       ) < entitlement.organizer_seat_limit
                     )
                )
              )`,
      )
      .bind(
        role,
        updatedAt,
        organizationId,
        userId,
        role,
        organizationId,
        updatedAt,
        updatedAt,
        organizationId,
        organizationId,
      )
      .run();
    if (Number(guardedUpdate.meta?.changes ?? 1) === 0) {
      throw new MemberRepositoryConflictError("The organizer seat limit has been reached.");
    }
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
      activationCredentialHash: null,
      activationDigest: null,
    };
    const temporaryDigest = await sha256(randomToken());
    try {
      const guardedInsert = this.database
        .prepare(
          `INSERT INTO auth_verifications
             (id, identifier, token_digest, expires_at, created_at, updated_at)
           SELECT ?, ?, ?, ?, ?, ?
            WHERE ? NOT IN ('owner', 'admin')
               OR NOT EXISTS (
                    SELECT 1
                      FROM organization_entitlements entitlement
                     WHERE entitlement.organization_id = ?
                       AND entitlement.state = 'active'
                       AND entitlement.not_before <= ?
                       AND (entitlement.expires_at IS NULL OR entitlement.expires_at > ?)
                       AND entitlement.organizer_seat_limit IS NOT NULL
                       AND (
                         (SELECT COUNT(*)
                            FROM organization_memberships member
                           WHERE member.organization_id = ?
                             AND member.role IN ('owner', 'admin'))
                         +
                         (SELECT COUNT(*)
                            FROM auth_verifications invitation
                           WHERE invitation.identifier LIKE '{"kind":"member_invitation",%'
                             AND json_extract(invitation.identifier, '$.invitation.organizationId') = ?
                             AND json_extract(invitation.identifier, '$.invitation.role') IN ('owner', 'admin')
                             AND json_extract(invitation.identifier, '$.invitation.status') IN ('pending', 'delivered')
                         ) < entitlement.organizer_seat_limit
                       )
               )`,
        )
        .bind(
          input.id,
          invitationIdentifier(envelope),
          temporaryDigest,
          input.expiresAt,
          input.createdAt,
          input.updatedAt,
          input.role,
          input.organizationId,
          input.updatedAt,
          input.updatedAt,
          input.organizationId,
          input.organizationId,
        );
      const result = await guardedInsert.run();
      if (Number(result.meta?.changes ?? 1) === 0) {
        throw new MemberRepositoryConflictError("The organizer seat limit has been reached.");
      }
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
    activationCredential: string,
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
      if (parsed.envelope.activationCredentialHash === null) {
        if (
          parsed.envelope.activationDigest === null ||
          (await sha256(activationCredential)) !== parsed.envelope.activationDigest
        ) {
          throw new MemberRepositoryConflictError(
            "The invitation is already being activated with different account details.",
          );
        }
        const upgradedEnvelope: MemberInvitationEnvelope = {
          ...parsed.envelope,
          activationCredentialHash: await hashPassword(activationCredential),
          activationDigest: null,
        };
        const result = await this.database
          .prepare(
            `UPDATE auth_verifications
                SET identifier = ?, updated_at = ?
              WHERE id = ? AND identifier = ?`,
          )
          .bind(
            invitationIdentifier(upgradedEnvelope),
            parsed.envelope.invitation.updatedAt,
            invitationId,
            row.identifier,
          )
          .run();
        if (Number(result.meta?.changes ?? 1) !== 1) {
          throw new MemberRepositoryConflictError(
            "The invitation activation claim was superseded.",
          );
        }
        return cloneValue(parsed.envelope.invitation);
      }
      if (
        !(await verifyPassword({
          hash: parsed.envelope.activationCredentialHash,
          password: activationCredential,
        }))
      ) {
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
    const activationCredentialHash = await hashPassword(activationCredential);
    const updatedEnvelope: MemberInvitationEnvelope = {
      ...parsed.envelope,
      invitation: updatedInvitation,
      activationCredentialHash,
      activationDigest: null,
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
    const usedEnvelope: MemberInvitationEnvelope = {
      ...parsed,
      usedAt,
      activationCredentialHash: null,
      activationDigest: null,
    };
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
    private readonly authSender: OpenSendSenderAddress,
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
      from: this.authSender,
      to: [input.email],
      subject: `You are invited to Eventloom as ${roleLabel}`,
      html:
        `<p>You have been invited to join Eventloom with the assigned role ` +
        `<strong>${escapeHtml(roleLabel)}</strong>.</p>` +
        `<p><a href="${escapeHtml(input.setupUrl)}">Set up ${escapeHtml(roleLabel)} access</a></p>`,
      text: `You have been invited to join Eventloom as ${roleLabel}. Set up ${roleLabel} access: ${input.setupUrl}`,
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

interface IntegrationApiKeyRow {
  readonly id?: unknown;
  readonly event_id?: unknown;
  readonly label?: unknown;
  readonly key_prefix?: unknown;
  readonly scopes_json?: unknown;
  readonly created_at?: unknown;
  readonly last_used_at?: unknown;
  readonly expires_at?: unknown;
  readonly revoked_at?: unknown;
}

interface IntegrationStatusRow {
  readonly payload_json?: unknown;
}

function integrationDefaultStatus(credentialLastFour: string | null): IntegrationDeliveryStatus {
  return {
    openSend: {
      state: credentialLastFour === null ? "not_configured" : "connected",
      credentialLastFour,
      senderChecks: [],
      deliveredLast24Hours: 0,
      failedLast24Hours: 0,
      lastDeliveryAt: null,
    },
    calendar: {
      state: "not_configured",
      sentLast24Hours: 0,
      failedLast24Hours: 0,
      lastInvitationAt: null,
      lastFailure: null,
    },
  };
}

function integrationApiKey(row: IntegrationApiKeyRow): IntegrationApiKeySummary | null {
  if (
    !nonEmpty(row.id) ||
    !nonEmpty(row.label) ||
    !nonEmpty(row.key_prefix) ||
    !nonEmpty(row.created_at) ||
    !nonEmpty(row.scopes_json)
  ) {
    return null;
  }
  const scopes = scopesFrom(row.scopes_json);
  if (scopes === null) return null;
  return {
    id: row.id,
    label: row.label,
    prefix: row.key_prefix,
    scopes: scopes as IntegrationApiKeySummary["scopes"],
    eventId: nonEmpty(row.event_id) ? row.event_id : null,
    createdAt: row.created_at,
    lastUsedAt: nonEmpty(row.last_used_at) ? row.last_used_at : null,
    expiresAt: nonEmpty(row.expires_at) ? row.expires_at : null,
    revokedAt: nonEmpty(row.revoked_at) ? row.revoked_at : null,
  };
}

async function encryptedIntegrationSecret(secret: string, keyMaterial: string): Promise<string> {
  const keyBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(keyMaterial));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(secret)),
  );
  return `${Buffer.from(iv).toString("base64url")}.${Buffer.from(ciphertext).toString("base64url")}`;
}

export class CloudflareIntegrationAdminRepository
  implements
    Omit<
      IntegrationAdminRouteDependencies,
      "webhooks" | "getWebhookLastDelivery" | "retryCalendarDelivery"
    >
{
  constructor(
    private readonly database: D1Database,
    private readonly events: EventRepository,
    private readonly encryptionKey: string,
  ) {}

  async getEvent(organizationId: string, eventId: string) {
    const event = await this.events.getEvent(organizationId, eventId);
    return event === null
      ? null
      : {
          id: event.id,
          organizationId: event.organizationId,
          name: event.name,
          timeZone: event.timeZone,
          publishedAgendaRevisionId: null,
        };
  }

  async getDeliveryStatus(
    organizationId: string,
    eventId: string,
  ): Promise<IntegrationDeliveryStatus> {
    const [statusRow, credentialRow] = await Promise.all([
      this.database
        .prepare(
          `SELECT payload_json
             FROM integration_delivery_status
            WHERE organization_id = ? AND event_id = ?`,
        )
        .bind(organizationId, eventId)
        .first<IntegrationStatusRow>(),
      this.database
        .prepare(
          `SELECT credential_last_four
             FROM integration_credentials
            WHERE organization_id = ? AND event_id = ? AND provider = 'opensend'`,
        )
        .bind(organizationId, eventId)
        .first<{ credential_last_four?: unknown }>(),
    ]);
    if (statusRow !== null && nonEmpty(statusRow.payload_json)) {
      try {
        return JSON.parse(statusRow.payload_json) as IntegrationDeliveryStatus;
      } catch {
        // Invalid operational state fails closed to a neutral snapshot.
      }
    }
    return integrationDefaultStatus(
      credentialRow !== null && nonEmpty(credentialRow.credential_last_four)
        ? credentialRow.credential_last_four
        : null,
    );
  }

  async saveCredential(
    organizationId: string,
    eventId: string,
    provider: "opensend",
    secret: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    const encrypted = await encryptedIntegrationSecret(secret, this.encryptionKey);
    await this.database
      .prepare(
        `INSERT INTO integration_credentials (
           organization_id, event_id, provider, encrypted_secret, credential_last_four, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(organization_id, event_id, provider) DO UPDATE SET
           encrypted_secret = excluded.encrypted_secret,
           credential_last_four = excluded.credential_last_four,
           updated_at = excluded.updated_at`,
      )
      .bind(organizationId, eventId, provider, encrypted, secret.slice(-4), now)
      .run();
  }

  async listApiKeys(
    organizationId: string,
    eventId?: string,
  ): Promise<readonly IntegrationApiKeySummary[]> {
    const rows = await this.database
      .prepare(
        `SELECT id, event_id, label, key_prefix, scopes_json, created_at, last_used_at, expires_at, revoked_at
           FROM api_keys
          WHERE organization_id = ? AND (? IS NULL OR event_id = ?)
          ORDER BY created_at DESC`,
      )
      .bind(organizationId, eventId ?? null, eventId ?? null)
      .all<IntegrationApiKeyRow>();
    return rows.results.flatMap((row) => {
      const key = integrationApiKey(row);
      return key === null ? [] : [key];
    });
  }

  async createApiKey(input: {
    readonly organizationId: string;
    readonly eventId?: string | null;
    readonly label: string;
    readonly scopes: readonly IntegrationApiKeySummary["scopes"][number][];
    readonly expiresAt: string | null;
  }): Promise<IntegrationApiKeyCreation> {
    const secret = `osb_${randomToken()}`;
    const now = new Date().toISOString();
    const summary: IntegrationApiKeySummary = {
      id: `key_${crypto.randomUUID()}`,
      label: input.label,
      prefix: secret.slice(0, 12),
      scopes: [...new Set(input.scopes)],
      eventId: input.eventId ?? null,
      createdAt: now,
      lastUsedAt: null,
      expiresAt: input.expiresAt,
      revokedAt: null,
    };
    await this.database
      .prepare(
        `INSERT INTO api_keys (
           id, organization_id, event_id, label, key_prefix, key_digest, scopes_json,
           expires_at, revoked_at, last_used_at, created_by_user_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
      )
      .bind(
        summary.id,
        input.organizationId,
        summary.eventId,
        summary.label,
        summary.prefix,
        await sha256(secret),
        JSON.stringify(summary.scopes),
        summary.expiresAt,
        now,
        now,
      )
      .run();
    return { summary, secret };
  }

  async revokeApiKey(organizationId: string, apiKeyId: string, eventId?: string): Promise<boolean> {
    const now = new Date().toISOString();
    const existing = await this.database
      .prepare(
        `SELECT id FROM api_keys
          WHERE id = ? AND organization_id = ? AND (? IS NULL OR event_id = ?) AND revoked_at IS NULL`,
      )
      .bind(apiKeyId, organizationId, eventId ?? null, eventId ?? null)
      .first<{ id?: unknown }>();
    if (existing === null) return false;
    await this.database
      .prepare(
        "UPDATE api_keys SET revoked_at = ?, updated_at = ? WHERE id = ? AND organization_id = ?",
      )
      .bind(now, now, apiKeyId, organizationId)
      .run();
    return true;
  }
}

const fixedOrigins = {
  local: {
    web: "http://127.0.0.1:3015",
    api: "http://127.0.0.1:8787",
  },
} as const;

const LOCAL_BETTER_AUTH_SECRET = "eventloom-integrated-local-auth-secret-v1";
const LOCAL_AIRTABLE_CREDENTIAL_ENCRYPTION_KEY =
  "eventloom-integrated-local-airtable-credential-key-v2";
const LOCAL_CACHE_INVALIDATION_TOKEN = "local-cache-invalidation";

function authEnvironment(value: string): "local" | "staging" | "production" | null {
  return value === "local" || value === "staging" || value === "production" ? value : null;
}

export function runtimeBindingsForEnvironment(source: RuntimeBindings): RuntimeBindings {
  if (source.APP_ENV !== "local") return source;
  const webOrigin = source.WEB_ORIGIN.trim() || fixedOrigins.local.web;
  const apiOrigin = source.API_ORIGIN?.trim() || fixedOrigins.local.api;
  return {
    ...source,
    WEB_ORIGIN: webOrigin,
    API_ORIGIN: apiOrigin,
    AIRTABLE_CREDENTIAL_ENCRYPTION_KEY:
      source.AIRTABLE_CREDENTIAL_ENCRYPTION_KEY?.trim() || LOCAL_AIRTABLE_CREDENTIAL_ENCRYPTION_KEY,
    BETTER_AUTH_SECRET: LOCAL_BETTER_AUTH_SECRET,
    CACHE_INVALIDATION_URL: `${webOrigin}/api/internal/cache-invalidation`,
    CACHE_INVALIDATION_TOKEN: LOCAL_CACHE_INVALIDATION_TOKEN,
  };
}

function patConnectionEnabled(value: string | undefined): boolean | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === undefined || normalized.length === 0 || normalized === "false") return false;
  return normalized === "true" ? true : null;
}

function configuredApiOrigin(bindings: RuntimeBindings): string | null {
  const environment = authEnvironment(bindings.APP_ENV);
  if (environment === null) return null;
  if (environment === "local") return bindings.API_ORIGIN ?? fixedOrigins.local.api;
  return bindings.API_ORIGIN?.trim() || null;
}

const aiReasoningEfforts = new Set<AdvisoryAiReasoningEffort>([
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

function aiReasoningEffort(
  value: string | undefined,
  fallback: AdvisoryAiReasoningEffort,
): AdvisoryAiReasoningEffort | null {
  const normalized = value?.trim().toLowerCase() || fallback;
  return aiReasoningEfforts.has(normalized as AdvisoryAiReasoningEffort)
    ? (normalized as AdvisoryAiReasoningEffort)
    : null;
}
type AiProviderSelection = "auto" | "cloudflare" | "openai" | "disabled";

function aiProviderSelection(value: string | undefined): AiProviderSelection | null {
  const normalized = value?.trim().toLowerCase() || "auto";
  return normalized === "auto" ||
    normalized === "cloudflare" ||
    normalized === "openai" ||
    normalized === "disabled"
    ? normalized
    : null;
}

interface SelectedAiProvider {
  readonly binding: CloudflareAiBinding | undefined;
  readonly model: string | undefined;
  readonly agendaModel?: string;
  readonly evaluationModel?: string;
  readonly remixModel?: string;
  readonly agendaReasoningEffort?: AdvisoryAiReasoningEffort;
  readonly evaluationReasoningEffort?: AdvisoryAiReasoningEffort;
  readonly remixReasoningEffort?: AdvisoryAiReasoningEffort;
  readonly providerName: "cloudflare-workers-ai" | "openai-responses";
  readonly promptVersion: string;
}

function selectedAiProvider(bindings: RuntimeBindings): SelectedAiProvider | null {
  const selection = aiProviderSelection(bindings.AI_PROVIDER);
  if (selection === null || selection === "disabled") return null;
  const openAiKey = bindings.OPENAI_API_KEY?.trim();
  const cloudflareModel = bindings.AI_MODEL?.trim();
  const useOpenAi = selection === "openai" || (selection === "auto" && nonEmpty(openAiKey));
  if (useOpenAi && nonEmpty(openAiKey)) {
    const model = bindings.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_RESPONSES_MODEL;
    const agendaReasoningEffort = aiReasoningEffort(
      bindings.OPENAI_AGENDA_REASONING_EFFORT,
      "high",
    );
    const evaluationReasoningEffort = aiReasoningEffort(
      bindings.OPENAI_EVALUATION_REASONING_EFFORT,
      "high",
    );
    const remixReasoningEffort = aiReasoningEffort(bindings.OPENAI_REMIX_REASONING_EFFORT, "low");
    return {
      binding: createOpenAiResponsesBinding({ apiKey: openAiKey }),
      model,
      agendaModel: bindings.OPENAI_AGENDA_MODEL?.trim() || model,
      evaluationModel: bindings.OPENAI_EVALUATION_MODEL?.trim() || DEFAULT_OPENAI_EVALUATION_MODEL,
      remixModel: bindings.OPENAI_REMIX_MODEL?.trim() || model,
      ...(agendaReasoningEffort === null ? {} : { agendaReasoningEffort }),
      ...(evaluationReasoningEffort === null ? {} : { evaluationReasoningEffort }),
      ...(remixReasoningEffort === null ? {} : { remixReasoningEffort }),
      providerName: "openai-responses",
      promptVersion: "openai-responses-v1",
    };
  }
  const useCloudflare =
    selection === "cloudflare" ||
    (selection === "auto" &&
      bindings.AI !== undefined &&
      typeof bindings.AI.run === "function" &&
      nonEmpty(cloudflareModel));
  if (useCloudflare) {
    return {
      binding: bindings.AI,
      model: cloudflareModel,
      providerName: "cloudflare-workers-ai",
      promptVersion: "cloudflare-workers-ai-v1",
    };
  }
  return null;
}
export function inspectProductionRuntime(source: RuntimeBindings): RuntimeConfigurationInspection {
  const bindings = runtimeBindingsForEnvironment(source);
  const issues: string[] = [];
  const cloudflare = inspectCloudflareBindings(bindings);
  if (!cloudflare.success) issues.push(...cloudflare.issues);

  const environment = authEnvironment(bindings.APP_ENV);
  if (environment !== null) {
    if (environment === "local" && !isLoopbackOrigin(bindings.WEB_ORIGIN)) {
      issues.push("WEB_ORIGIN must be a loopback origin for local.");
    }
    if (
      environment === "local" &&
      bindings.API_ORIGIN !== undefined &&
      !isLoopbackOrigin(bindings.API_ORIGIN)
    ) {
      issues.push("API_ORIGIN must be a loopback origin for local.");
    }
    if (environment !== "local" && !isHttpsOrigin(bindings.WEB_ORIGIN)) {
      issues.push("WEB_ORIGIN must be an HTTPS origin for deployed environments.");
    }
    if (environment !== "local" && !isHttpsOrigin(bindings.API_ORIGIN)) {
      issues.push("API_ORIGIN must be an HTTPS origin for deployed environments.");
    }
  }
  const aiSelection = aiProviderSelection(bindings.AI_PROVIDER);
  if (aiSelection === null) {
    issues.push("AI_PROVIDER must be auto, cloudflare, openai, or disabled");
  } else if (aiSelection === "cloudflare") {
    if (bindings.AI === undefined || typeof bindings.AI.run !== "function") {
      issues.push("AI_PROVIDER=cloudflare requires the Workers AI binding");
    }
    if (!nonEmpty(bindings.AI_MODEL)) {
      issues.push("AI_PROVIDER=cloudflare requires AI_MODEL");
    }
  } else if (aiSelection === "openai" && !nonEmpty(bindings.OPENAI_API_KEY)) {
    issues.push("AI_PROVIDER=openai requires OPENAI_API_KEY");
  }
  if (aiSelection === "openai") {
    for (const [name, value, fallback] of [
      ["OPENAI_AGENDA_REASONING_EFFORT", bindings.OPENAI_AGENDA_REASONING_EFFORT, "medium"],
      ["OPENAI_EVALUATION_REASONING_EFFORT", bindings.OPENAI_EVALUATION_REASONING_EFFORT, "high"],
      ["OPENAI_REMIX_REASONING_EFFORT", bindings.OPENAI_REMIX_REASONING_EFFORT, "low"],
    ] as const) {
      if (aiReasoningEffort(value, fallback) === null) {
        issues.push(`${name} must be none, low, medium, high, xhigh, or max`);
      }
    }
  }
  if (!nonEmpty(bindings.BETTER_AUTH_SECRET) || bindings.BETTER_AUTH_SECRET.trim().length < 32) {
    issues.push("BETTER_AUTH_SECRET must contain at least 32 characters");
  }
  if (
    environment !== "local" &&
    nonEmpty(bindings.AIRTABLE_OAUTH_CLIENT_ID) &&
    (!nonEmpty(bindings.AIRTABLE_CREDENTIAL_ENCRYPTION_KEY) ||
      bindings.AIRTABLE_CREDENTIAL_ENCRYPTION_KEY.trim().length < 32)
  ) {
    issues.push(
      "AIRTABLE_CREDENTIAL_ENCRYPTION_KEY must contain at least 32 characters when Airtable OAuth is configured",
    );
  }
  if (patConnectionEnabled(bindings.AIRTABLE_PAT_CONNECTION_ENABLED) === null) {
    issues.push("AIRTABLE_PAT_CONNECTION_ENABLED must be true or false");
  }
  if (!nonEmpty(bindings.CACHE_INVALIDATION_URL)) {
    issues.push("CACHE_INVALIDATION_URL is required for the integrated runtime");
  } else {
    try {
      const url = new URL(bindings.CACHE_INVALIDATION_URL);
      if (url.protocol !== "https:" && source.APP_ENV !== "local") {
        issues.push("CACHE_INVALIDATION_URL must use HTTPS outside local development");
      }
    } catch {
      issues.push("CACHE_INVALIDATION_URL must be a valid URL");
    }
  }
  if (!nonEmpty(bindings.CACHE_INVALIDATION_TOKEN)) {
    issues.push("CACHE_INVALIDATION_TOKEN is required for the integrated runtime");
  }

  const openSendKey = (bindings.OPENSEND_API_KEY ?? bindings.OPENSEND_SENDING_API_KEY)?.trim();
  if (!openSendKey || !nonEmpty(bindings.OPENSEND_API_URL)) {
    issues.push("OPENSEND_API_URL and OPENSEND_API_KEY are required");
  }
  const identityResult = parseCommunicationIdentityEnvironment(bindings);
  if (!identityResult.success) {
    const invalidNames = new Set(identityResult.error.issues.map((issue) => String(issue.path[0])));
    for (const name of ["AUTH_FROM_EMAIL", "SPEAKERS_FROM_EMAIL", "CALENDAR_FROM_EMAIL"] as const) {
      if (invalidNames.has(name)) issues.push(`${name} must be a valid email address.`);
    }
    if (invalidNames.has("CALENDAR_UID_DOMAIN")) {
      issues.push("CALENDAR_UID_DOMAIN must be a valid domain name");
    }
  }

  const apiOrigin = configuredApiOrigin(bindings);
  if (apiOrigin === null || !nonEmpty(bindings.WEB_ORIGIN)) {
    issues.push("Better Auth web and API origins are required");
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

export function createCloudflareDependencies(source: RuntimeBindings): ApiDependencies {
  const inspection = inspectProductionRuntime(source);
  const bindings = runtimeBindingsForEnvironment(source);
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
  const deploymentMode = resolveDeploymentMode(
    deploymentEnvironmentSchema.parse(bindings.APP_ENV),
    bindings.DEPLOYMENT_MODE === undefined
      ? undefined
      : deploymentModeSchema.parse(bindings.DEPLOYMENT_MODE),
  );
  const provisioningToken = bindings.ORGANIZATION_PROVISIONING_TOKEN?.trim();
  const entitlementRepository = new D1OrganizationEntitlementRepository(bindings.DB);
  const organizationPolicy = createOrganizationPolicy(
    deploymentMode === "managed"
      ? {
          deploymentMode,
          repository: entitlementRepository,
        }
      : { deploymentMode },
  );
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
  const aiSelection = selectedAiProvider(bindings);
  const aiProviders = createCloudflareAiProviders(aiSelection?.binding, {
    ...(aiSelection?.model === undefined ? {} : { model: aiSelection.model }),
    ...(aiSelection?.agendaModel === undefined ? {} : { agendaModel: aiSelection.agendaModel }),
    ...(aiSelection?.evaluationModel === undefined
      ? {}
      : { evaluationModel: aiSelection.evaluationModel }),
    ...(aiSelection?.remixModel === undefined ? {} : { remixModel: aiSelection.remixModel }),
    ...(aiSelection?.agendaReasoningEffort === undefined
      ? {}
      : { agendaReasoningEffort: aiSelection.agendaReasoningEffort }),
    ...(aiSelection?.evaluationReasoningEffort === undefined
      ? {}
      : { evaluationReasoningEffort: aiSelection.evaluationReasoningEffort }),
    ...(aiSelection?.remixReasoningEffort === undefined
      ? {}
      : { remixReasoningEffort: aiSelection.remixReasoningEffort }),
    ...(aiSelection === null
      ? {}
      : {
          providerName: aiSelection.providerName,
          promptVersion: aiSelection.promptVersion,
        }),
  });

  const authConfiguration = createBetterAuthRuntimeConfiguration({
    secret: bindings.BETTER_AUTH_SECRET ?? "",
    baseUrl: bindings.WEB_ORIGIN,
    trustedOrigins: [bindings.WEB_ORIGIN, apiOrigin],
  });
  const identityResult = parseCommunicationIdentityEnvironment(bindings);
  if (!identityResult.success) {
    throw new TypeError("The production communication identities are not configured.");
  }
  const senderAddresses: OpenSendSenderAddresses = {
    auth: identityResult.data.AUTH_FROM_EMAIL,
    speakers: identityResult.data.SPEAKERS_FROM_EMAIL,
    calendar: identityResult.data.CALENDAR_FROM_EMAIL,
  };
  const calendarIntegrationOptions = {
    organizer: senderAddresses.calendar,
    uidDomain: identityResult.data.CALENDAR_UID_DOMAIN,
  };
  const openSend = new OpenSendClient({
    sendingApiKey: openSendKey,
    baseUrl: bindings.OPENSEND_API_URL,
    senderAddresses,
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
    new D1BetterAuthGateway(bindings.DB, betterAuthRuntime),
    new D1ApiKeyAuthenticatorGateway(bindings.DB),
    {
      sessionCookieName:
        new URL(bindings.WEB_ORIGIN).protocol === "https:"
          ? "__Secure-better-auth.session_token"
          : "better-auth.session_token",
    },
  );
  const businessRepositories = createD1RuntimeDependencies({ DB: bindings.DB });
  const eventRoleInvitationAdapters = createRuntimeEventRoleInvitationAdapters(
    businessRepositories.eventRoleInvitations,
  );
  const dependencies = createD1ApplicationDependencies({
    authenticator,
    database: bindings.DB,
    agendaCoordinator: bindings.AGENDA_COORDINATOR,
    privateFiles: bindings.PRIVATE_FILES,
    outboxQueue: bindings.OUTBOX_QUEUE,
    webOrigin: bindings.WEB_ORIGIN,
    aiProviders,
    businessRepositories,
    eventRoleInvitationAdapters,
    senderAddresses,
    calendarIntegrationOptions,
    organizationPolicy,
  });
  const memberService = new MemberService({
    identity: new D1MemberIdentityRepository(bindings.DB),
    organizationEntitlements: entitlementRepository,
    auth: new D1MemberAuthBoundary(bindings.DB, bindings.WEB_ORIGIN),
    invitationDelivery: new CloudflareMemberInvitationDelivery(
      bindings.DB,
      bindings.OUTBOX_QUEUE,
      senderAddresses.auth,
    ),
    reviewerPools: businessRepositories.reviewerPool,
    reviewerEventInvitations: eventRoleInvitationAdapters.reviewerLifecycle,
  });
  const integrationRepository = new CloudflareIntegrationAdminRepository(
    bindings.DB,
    businessRepositories.events,
    bindings.BETTER_AUTH_SECRET ?? "",
  );
  const integrations: IntegrationAdminRouteDependencies = {
    getEvent: integrationRepository.getEvent.bind(integrationRepository),
    getDeliveryStatus: integrationRepository.getDeliveryStatus.bind(integrationRepository),
    saveCredential: integrationRepository.saveCredential.bind(integrationRepository),
    listApiKeys: integrationRepository.listApiKeys.bind(integrationRepository),
    createApiKey: integrationRepository.createApiKey.bind(integrationRepository),
    revokeApiKey: integrationRepository.revokeApiKey.bind(integrationRepository),
    webhooks:
      dependencies.webhooks ??
      (() => {
        throw new Error("The integrated webhook repository is not configured.");
      })(),
    retryCalendarDelivery: async () => false,
  };
  const airtableIntegration = nonEmpty(bindings.AIRTABLE_OAUTH_CLIENT_ID)
    ? createAirtableIntegrationDependencies({
        database: bindings.DB,
        authenticator,
        clientId: bindings.AIRTABLE_OAUTH_CLIENT_ID,
        ...(bindings.AIRTABLE_OAUTH_CLIENT_SECRET === undefined
          ? {}
          : { clientSecret: bindings.AIRTABLE_OAUTH_CLIENT_SECRET }),
        patConnectionsEnabled:
          patConnectionEnabled(bindings.AIRTABLE_PAT_CONNECTION_ENABLED) === true,
        webOrigin: bindings.WEB_ORIGIN,
        redirectUri: `${apiOrigin.replace(/\/$/, "")}/api/integrations/airtable/oauth/callback`,
        cipher: createAirtableSecretCipher({
          credentialEncryptionKey: bindings.AIRTABLE_CREDENTIAL_ENCRYPTION_KEY ?? "",
          ...(bindings.BETTER_AUTH_SECRET === undefined
            ? {}
            : { legacyBetterAuthSecret: bindings.BETTER_AUTH_SECRET }),
        }),
        sessions: businessRepositories.sessions,
        ...(bindings.AIRTABLE_API_ORIGIN === undefined
          ? {}
          : { apiOrigin: bindings.AIRTABLE_API_ORIGIN }),
      })
    : undefined;
  return {
    ...dependencies,
    ...(dependencies.access === undefined ? {} : { access: dependencies.access }),
    auth: betterAuthRuntime,
    members: { service: memberService },
    ...(deploymentMode === "self-hosted" &&
    provisioningToken !== undefined &&
    provisioningToken.length > 0
      ? {
          organizationBootstrap: {
            service: memberService,
            authenticate: (request: Request) =>
              secretEquals(request.headers.get("x-eventloom-bootstrap-token"), provisioningToken),
          },
        }
      : {}),
    ...(provisioningToken !== undefined && provisioningToken.length > 0
      ? {
          organizationProvisioning: {
            service: memberService,
            entitlements: entitlementRepository,
            authenticate: (request: Request) =>
              secretEquals(request.headers.get("authorization"), `Bearer ${provisioningToken}`),
          },
        }
      : {}),
    integrations,
    ...(airtableIntegration === undefined ? {} : { airtableIntegration }),
  };
}

export function createAirtableSecretCipher(input: {
  credentialEncryptionKey: string;
  legacyBetterAuthSecret?: string;
}) {
  const credentialEncryptionKey = input.credentialEncryptionKey.trim();
  if (credentialEncryptionKey.length === 0) {
    throw new TypeError("AIRTABLE_CREDENTIAL_ENCRYPTION_KEY is required for Airtable credentials.");
  }
  const credentialKeyPromise = createAirtableCipherKey(
    `airtable-credential:v2:${credentialEncryptionKey}`,
  );
  // This branch is only for unversioned ciphertext created before v2. New data never derives from
  // BETTER_AUTH_SECRET and legacy data must be reconnected before that secret is rotated.
  const legacyKeyPromise = nonEmpty(input.legacyBetterAuthSecret)
    ? createAirtableCipherKey(`airtable:${input.legacyBetterAuthSecret}`)
    : null;
  return {
    encrypt: async (value: string) => {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await encryptAirtableSecret(credentialKeyPromise, iv, value);
      return `v2.${encodeBase64Url(iv)}.${encodeBase64Url(new Uint8Array(encrypted))}`;
    },
    decrypt: async (value: string) => {
      const segments = value.split(".");
      if (segments[0] === "v2") {
        const [version, iv, encrypted] = segments;
        if (
          version !== "v2" ||
          iv === undefined ||
          encrypted === undefined ||
          segments.length !== 3
        ) {
          throw new Error("Invalid Airtable secret reference.");
        }
        return decryptAirtableSecret(credentialKeyPromise, iv, encrypted);
      }
      const [iv, encrypted] = segments;
      if (
        iv === undefined ||
        encrypted === undefined ||
        segments.length !== 2 ||
        legacyKeyPromise === null
      ) {
        throw new Error("Invalid Airtable secret reference.");
      }
      return decryptAirtableSecret(legacyKeyPromise, iv, encrypted);
    },
  };
}

async function createAirtableCipherKey(keyMaterial: string): Promise<CryptoKey> {
  const rawKey = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(keyMaterial));
  return crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptAirtableSecret(
  keyPromise: Promise<CryptoKey>,
  iv: Uint8Array,
  value: string,
): Promise<ArrayBuffer> {
  return crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await keyPromise,
    new TextEncoder().encode(value),
  );
}

async function decryptAirtableSecret(
  keyPromise: Promise<CryptoKey>,
  iv: string,
  encrypted: string,
): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64Url(iv) as Uint8Array<ArrayBuffer> },
    await keyPromise,
    decodeBase64Url(encrypted),
  );
  return new TextDecoder().decode(decrypted);
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const binary = atob(
    value
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "="),
  );
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
