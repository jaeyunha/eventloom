import {
  type ActivateMemberInput,
  type ActivateMemberResult,
  type GrantReviewerInput,
  type InviteMemberInput,
  type InviteMemberResult,
  type Member,
  type MemberActor,
  type MemberAuthBoundary,
  type MemberIdentityRepository,
  type MemberInvitation,
  type MemberInvitationDelivery,
  type MemberMembership,
  type MemberRepositorySeed,
  type MemberRole,
  MemberServiceError,
  type MemberServiceErrorCode,
  type MemberUser,
  memberRoles,
  type ReserveReviewerAssignmentInput,
  type ReviewerPool,
  type ReviewerPoolGrant,
  type ReviewerPoolGrantInput,
  type ReviewerPoolRepository,
  type RevokeMemberInput,
  type RevokeReviewerGrantInput,
  type SetReviewerPoolInput,
  type SetupLinkClaim,
  type StoredSetupLink,
  type UpdateMemberRoleInput,
} from "./types";

export type { MemberServiceErrorCode } from "./types";
export { MemberServiceError };

export interface OrganizationRecord {
  readonly organizationId: string;
  readonly slug: string;
  readonly name: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export type Organization = OrganizationRecord;

export interface OrganizationMembership extends OrganizationRecord {
  readonly role: MemberRole;
}
export type OrganizationAccess = OrganizationMembership;

export interface CreateOrganizationInput {
  readonly organizationId: string;
  readonly slug: string;
  readonly name: string;
  readonly config?: Readonly<Record<string, unknown>>;
  readonly idempotencyKey?: string;
}

export interface UpdateOrganizationInput {
  readonly organizationId: string;
  readonly slug?: string;
  readonly name?: string;
  readonly config?: Readonly<Record<string, unknown>>;
}
export interface OrganizationRepositorySeed {
  readonly organizations?: readonly OrganizationRecord[];
}

export interface MemberOrganizationRepository {
  createOrganizationWithOwner(input: {
    readonly organization: OrganizationRecord;
    readonly membership: MemberMembership;
    readonly idempotencyKey?: string;
  }): Promise<OrganizationRecord>;
  listOrganizationsForUser(userId: string): Promise<readonly OrganizationMembership[]>;
  readonly getOrganization?: (organizationId: string) => Promise<OrganizationRecord | null>;
  updateOrganization(input: {
    readonly organizationId: string;
    readonly slug?: string;
    readonly name?: string;
    readonly config?: Readonly<Record<string, unknown>>;
    readonly updatedAt: string;
  }): Promise<OrganizationRecord>;
}

export class MemberRepositoryConflictError extends Error {
  constructor(message = "The member record already exists or changed.") {
    super(message);
    this.name = "MemberRepositoryConflictError";
  }
}

export interface MemberServiceDependencies {
  readonly identity: MemberIdentityRepository;
  readonly organizations?: MemberOrganizationRepository;
  readonly auth: MemberAuthBoundary;
  readonly invitationDelivery: MemberInvitationDelivery;
  readonly reviewerPools: ReviewerPoolRepository;
}

export interface MemberServiceOptions {
  readonly clock?: () => Date;
  readonly generateId?: () => string;
  readonly invitationTtlMs?: number;
}

const IDENTIFIER_MAX = 200;
const EMAIL_MAX = 320;
const DEFAULT_INVITATION_TTL_MS = 60 * 60 * 24 * 7 * 1_000;
const MEMBER_FIELDS = ["organizationId"] as const;
const INVITE_FIELDS = ["organizationId", "email", "name", "role", "idempotencyKey"] as const;
const ROLE_FIELDS = ["organizationId", "userId", "role"] as const;
const REVOKE_FIELDS = ["organizationId", "userId"] as const;
const POOL_FIELDS = [
  "organizationId",
  "eventId",
  "roundId",
  "reviewerIds",
  "reviewers",
  "maxAssignmentsPerReviewer",
  "expectedVersion",
] as const;
const GRANT_FIELDS = [
  "organizationId",
  "eventId",
  "roundId",
  "reviewerId",
  "maxAssignments",
] as const;
const REVOKE_GRANT_FIELDS = [
  "organizationId",
  "eventId",
  "roundId",
  "reviewerId",
  "expectedVersion",
] as const;
const RESERVE_FIELDS = ["organizationId", "eventId", "roundId", "reviewerId"] as const;
const ORGANIZATION_FIELDS = ["organizationId", "slug", "name", "config", "idempotencyKey"] as const;
const ORGANIZATION_UPDATE_FIELDS = ["organizationId", "slug", "name", "config"] as const;
const ORGANIZATION_ID_MAX = 128;
const ORGANIZATION_SLUG_MAX = 64;
const ORGANIZATION_NAME_MAX = 200;
const ORGANIZATION_CONFIG_MAX_BYTES = 32_000;

type ObjectValue = Record<string, unknown>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function objectValue(value: unknown, field: string): ObjectValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw validation(`${field} must be an object.`);
  }
  return value as ObjectValue;
}

function assertFields(value: ObjectValue, field: string, allowed: readonly string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw validation(`${field}.${key} is not supported.`);
  }
}

function text(value: unknown, field: string, maximum = IDENTIFIER_MAX): string {
  if (typeof value !== "string") throw validation(`${field} must be a string.`);
  const result = value.trim();
  if (result.length === 0 || result.length > maximum) {
    throw validation(`${field} must contain between 1 and ${maximum} characters.`);
  }
  return result;
}

function nullableText(value: unknown, field: string, maximum = IDENTIFIER_MAX): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw validation(`${field} must be a string or null.`);
  const result = value.trim();
  if (result.length > maximum)
    throw validation(`${field} must contain at most ${maximum} characters.`);
  return result.length === 0 ? null : result;
}
function password(value: unknown): string {
  if (typeof value !== "string") throw validation("password must be a string.");
  if (
    value.length < 8 ||
    value.length > 128 ||
    !/[A-Z]/u.test(value) ||
    !/[a-z]/u.test(value) ||
    !/[0-9]/u.test(value) ||
    !/[^A-Za-z0-9]/u.test(value)
  ) {
    throw validation(
      "password must be between 8 and 128 characters and include uppercase, lowercase, number, and special character.",
    );
  }
  return value;
}

function email(value: unknown): string {
  const result = text(value, "email", EMAIL_MAX).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(result)) throw validation("email must be a valid email address.");
  return result;
}

function identifier(value: unknown, field: string): string {
  return text(value, field, IDENTIFIER_MAX);
}
function organizationId(value: unknown, field: string): string {
  const normalized = text(value, field, ORGANIZATION_ID_MAX).toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9_-]{0,126}[a-z0-9])?$/u.test(normalized)) {
    throw validation(
      `${field} must use letters, numbers, underscores, or hyphens and start and end with a letter or number.`,
    );
  }
  return normalized;
}

function organizationSlug(value: unknown, field: string): string {
  const normalized = text(value, field, ORGANIZATION_SLUG_MAX).toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u.test(normalized)) {
    throw validation(`${field} must be a safe lowercase slug.`);
  }
  return normalized;
}

function organizationName(value: unknown, field: string): string {
  const normalized = text(value, field, ORGANIZATION_NAME_MAX);
  if (
    [...normalized].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return (code < 32 && code !== 9) || code === 127;
    })
  ) {
    throw validation(`${field} contains unsupported control characters.`);
  }
  return normalized;
}

function organizationConfig(value: unknown, field: string): Readonly<Record<string, unknown>> {
  if (value === undefined) return {};
  const config = objectValue(value, field);
  for (const key of Object.keys(config)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      throw validation(`${field}.${key} is not supported.`);
    }
  }
  let encoded: string | undefined;
  try {
    encoded = JSON.stringify(config);
  } catch {
    throw validation(`${field} must be JSON serializable.`);
  }
  if (
    encoded === undefined ||
    new TextEncoder().encode(encoded).byteLength > ORGANIZATION_CONFIG_MAX_BYTES
  ) {
    throw validation(
      `${field} must be a JSON object no larger than ${ORGANIZATION_CONFIG_MAX_BYTES} bytes.`,
    );
  }
  return clone(config);
}

function organizationRecord(value: unknown, field = "organization"): OrganizationRecord {
  const input = objectValue(value, field);
  return {
    organizationId: organizationId(input.organizationId, `${field}.organizationId`),
    slug: organizationSlug(input.slug, `${field}.slug`),
    name: organizationName(input.name, `${field}.name`),
    config: organizationConfig(input.config, `${field}.config`),
    createdAt: text(input.createdAt, `${field}.createdAt`, 128),
    updatedAt: text(input.updatedAt, `${field}.updatedAt`, 128),
  };
}

function organizationMembership(
  value: unknown,
  field = "organization membership",
): OrganizationMembership {
  const input = objectValue(value, field);
  return {
    ...organizationRecord(input, field),
    role: role(input.role),
  };
}

function role(value: unknown): MemberRole {
  if (typeof value !== "string" || !memberRoles.includes(value as MemberRole)) {
    throw validation(`role must be one of: ${memberRoles.join(", ")}.`);
  }
  return value as MemberRole;
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw validation(`${field} must be a positive integer.`);
  }
  return value;
}

function isoDate(value: Date, field: string): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw validation(`${field} must be a valid date.`);
  }
  return value.toISOString();
}

function validation(message: string, details?: unknown): MemberServiceError {
  return new MemberServiceError("VALIDATION_ERROR", 400, message, details);
}

function forbidden(message = "An owner or administrator is required."): MemberServiceError {
  return new MemberServiceError("FORBIDDEN", 403, message);
}

function notFound(message = "The member record was not found."): MemberServiceError {
  return new MemberServiceError("NOT_FOUND", 404, message);
}

function conflict(message: string, code: MemberServiceErrorCode = "CONFLICT"): MemberServiceError {
  return new MemberServiceError(code, 409, message);
}

function repositoryConflict(error: unknown): boolean {
  return (
    error instanceof MemberRepositoryConflictError ||
    (error instanceof Error &&
      (error.name === "MemberRepositoryConflictError" ||
        /constraint|unique|duplicate|already exists|already in use/i.test(error.message)))
  );
}

function actorOrganization(actor: MemberActor): string {
  if (
    actor === null ||
    typeof actor !== "object" ||
    actor.kind !== "user" ||
    typeof actor.organizationId !== "string" ||
    actor.organizationId.trim().length === 0
  ) {
    throw forbidden("An organization-scoped user identity is required.");
  }
  return actor.organizationId.trim();
}

function actorUser(actor: MemberActor): string {
  if (
    actor === null ||
    typeof actor !== "object" ||
    actor.kind !== "user" ||
    typeof actor.userId !== "string" ||
    actor.userId.trim().length === 0
  ) {
    throw forbidden("An authenticated user identity is required.");
  }
  return actor.userId.trim();
}

function assertOrganizer(actor: MemberActor, organizationId: string): void {
  const actorOrg = actorOrganization(actor);
  if (actorOrg !== organizationId) {
    throw forbidden("The authenticated organizer cannot access this organization.");
  }
  actorUser(actor);
  if (actor.role !== "owner" && actor.role !== "admin") throw forbidden();
}

function poolKey(organizationId: string, eventId: string, roundId: string): string {
  return `${organizationId}\u0000${eventId}\u0000${roundId}`;
}

function normalizeGrant(grant: ReviewerPoolGrant): ReviewerPoolGrant {
  return {
    reviewerId: grant.reviewerId,
    maxAssignments: grant.maxAssignments,
    assignedCount: grant.assignedCount,
  };
}

function poolWithReviewerIds(pool: ReviewerPool): ReviewerPool {
  const grants = pool.grants
    .map(normalizeGrant)
    .sort((left, right) => left.reviewerId.localeCompare(right.reviewerId));
  return {
    ...clone(pool),
    grants,
    reviewerIds: grants.map((grant) => grant.reviewerId),
  };
}

function setupTokenFromUrl(tokenOrUrl: string): string {
  const candidate = tokenOrUrl.trim();
  if (candidate.length === 0) return candidate;
  try {
    const parsed = new URL(candidate);
    const token = parsed.searchParams.get("token");
    return token === null ? candidate : token;
  } catch {
    return candidate;
  }
}

async function sha256(value: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class MemberService {
  readonly #identity: MemberIdentityRepository;
  readonly #organizations: MemberOrganizationRepository | null;
  readonly #auth: MemberAuthBoundary;
  readonly #invitationDelivery: MemberInvitationDelivery;
  readonly #reviewerPools: ReviewerPoolRepository;
  readonly #clock: () => Date;
  readonly #generateId: () => string;
  readonly #invitationTtlMs: number;
  readonly #invitationLocks = new Map<string, Promise<InviteMemberResult>>();
  readonly #organizationCreateLocks = new Map<string, Promise<OrganizationRecord>>();
  readonly #organizationCreateResults = new Map<
    string,
    { readonly fingerprint: string; readonly result: OrganizationRecord }
  >();

  constructor(dependencies: MemberServiceDependencies, options: MemberServiceOptions = {}) {
    this.#identity = dependencies.identity;
    this.#organizations = dependencies.organizations ?? null;
    this.#auth = dependencies.auth;
    this.#invitationDelivery = dependencies.invitationDelivery;
    this.#reviewerPools = dependencies.reviewerPools;
    this.#clock = options.clock ?? (() => new Date());
    this.#generateId = options.generateId ?? (() => crypto.randomUUID());
    this.#invitationTtlMs = options.invitationTtlMs ?? DEFAULT_INVITATION_TTL_MS;
    if (!Number.isInteger(this.#invitationTtlMs) || this.#invitationTtlMs < 1_000) {
      throw new TypeError("invitationTtlMs must be at least one second.");
    }
  }
  #organizationMethod<K extends keyof MemberOrganizationRepository>(
    name: K,
  ): MemberOrganizationRepository[K] {
    const repository =
      this.#organizations ??
      (this.#identity as MemberIdentityRepository & Partial<MemberOrganizationRepository>);
    const method = repository[name];
    if (typeof method !== "function") {
      throw new Error(`The identity repository does not implement ${String(name)}.`);
    }
    return Function.prototype.bind.call(method, repository) as MemberOrganizationRepository[K];
  }

  async createOrganization(
    actor: MemberActor,
    input: CreateOrganizationInput,
  ): Promise<OrganizationRecord> {
    const inputValue = objectValue(input, "organization creation");
    assertFields(inputValue, "organization creation", ORGANIZATION_FIELDS);
    const normalized = {
      organizationId: organizationId(input.organizationId, "organization id"),
      slug: organizationSlug(input.slug, "organization slug"),
      name: organizationName(input.name, "organization name"),
      config: organizationConfig(input.config, "organization config"),
      ...(input.idempotencyKey === undefined
        ? {}
        : { idempotencyKey: text(input.idempotencyKey, "idempotency key", 512) }),
    };
    const organizationIdValue = actorOrganization(actor);
    const userId = actorUser(actor);
    if (actor.role !== "owner") {
      throw forbidden("Only an organization owner can create another organization.");
    }
    const current = await this.#identity.getMember(organizationIdValue, userId);
    if (current === null || current.role !== "owner") {
      throw forbidden("Only an organization owner can create another organization.");
    }

    const idempotencyKey = normalized.idempotencyKey;
    if (idempotencyKey === undefined) {
      return this.#createOrganization(actor, normalized, userId);
    }
    const cacheKey = `${userId}\u0000${idempotencyKey}`;
    const fingerprint = JSON.stringify(normalized);
    const previous = this.#organizationCreateResults.get(cacheKey);
    if (previous !== undefined) {
      if (previous.fingerprint !== fingerprint) {
        throw conflict("The idempotency key was already used for another organization.");
      }
      return clone(previous.result);
    }
    const active = this.#organizationCreateLocks.get(cacheKey);
    if (active !== undefined) {
      await active;
      return this.createOrganization(actor, input);
    }
    const operation = this.#createOrganization(actor, normalized, userId);
    this.#organizationCreateLocks.set(cacheKey, operation);
    try {
      const result = await operation;
      this.#organizationCreateResults.set(cacheKey, { fingerprint, result: clone(result) });
      return result;
    } finally {
      if (this.#organizationCreateLocks.get(cacheKey) === operation) {
        this.#organizationCreateLocks.delete(cacheKey);
      }
    }
  }

  async #createOrganization(
    _actor: MemberActor,
    input: {
      readonly organizationId: string;
      readonly slug: string;
      readonly name: string;
      readonly config: Readonly<Record<string, unknown>>;
      readonly idempotencyKey?: string;
    },
    userId: string,
  ): Promise<OrganizationRecord> {
    const now = isoDate(this.#clock(), "clock");
    const organization: OrganizationRecord = {
      organizationId: input.organizationId,
      slug: input.slug,
      name: input.name,
      config: clone(input.config),
      createdAt: now,
      updatedAt: now,
    };
    const membership: MemberMembership = {
      organizationId: input.organizationId,
      userId,
      role: "owner",
      createdAt: now,
      updatedAt: now,
    };
    try {
      const created = await this.#organizationMethod("createOrganizationWithOwner")({
        organization,
        membership,
        ...(input.idempotencyKey === undefined ? {} : { idempotencyKey: input.idempotencyKey }),
      });
      const normalized = organizationRecord(created);
      if (normalized.organizationId !== organization.organizationId) {
        throw conflict("The organization repository returned a different organization.");
      }
      return clone(normalized);
    } catch (error) {
      if (error instanceof MemberServiceError) throw error;
      if (repositoryConflict(error)) {
        throw conflict("The organization ID or slug is already in use.");
      }
      throw error;
    }
  }

  async listOrganizations(actor: MemberActor): Promise<readonly OrganizationMembership[]> {
    const userId = actorUser(actor);
    const organizations = await this.#organizationMethod("listOrganizationsForUser")(userId);
    return organizations.map((organization) => clone(organizationMembership(organization)));
  }

  async switchOrganization(
    actor: MemberActor,
    input: { readonly organizationId: string },
  ): Promise<OrganizationMembership> {
    const inputValue = objectValue(input, "organization switch");
    assertFields(inputValue, "organization switch", ["organizationId"]);
    const targetOrganizationId = organizationId(input.organizationId, "organization id");
    const userId = actorUser(actor);
    const organizations = await this.#organizationMethod("listOrganizationsForUser")(userId);
    const selected = organizations.find(
      (organization) => organization.organizationId === targetOrganizationId,
    );
    if (selected === undefined) {
      throw forbidden("The authenticated user is not a member of this organization.");
    }
    return clone(organizationMembership(selected));
  }
  async getOrganization(
    actor: MemberActor,
    input: { readonly organizationId: string },
  ): Promise<OrganizationMembership> {
    return this.switchOrganization(actor, input);
  }

  async updateOrganization(
    actor: MemberActor,
    input: UpdateOrganizationInput,
  ): Promise<OrganizationRecord> {
    const inputValue = objectValue(input, "organization update");
    assertFields(inputValue, "organization update", ORGANIZATION_UPDATE_FIELDS);
    const targetOrganizationId = organizationId(input.organizationId, "organization id");
    const userId = actorUser(actor);
    const actorOrganizationId = actorOrganization(actor);
    const current = await this.#identity.getMember(targetOrganizationId, userId);
    let ownerAuthorized =
      targetOrganizationId === actorOrganizationId
        ? actor.role === "owner" && current?.role === "owner"
        : current?.role === "owner";
    if (!ownerAuthorized && targetOrganizationId !== actorOrganizationId) {
      const organizations = await this.#organizationMethod("listOrganizationsForUser")(userId);
      ownerAuthorized =
        organizations.find((organization) => organization.organizationId === targetOrganizationId)
          ?.role === "owner";
    }
    if (!ownerAuthorized) {
      throw forbidden("Only an owner of this organization can update its configuration.");
    }
    if (input.slug === undefined && input.name === undefined && input.config === undefined) {
      throw validation("At least one organization field must be updated.");
    }
    const update = {
      organizationId: targetOrganizationId,
      ...(input.slug === undefined
        ? {}
        : { slug: organizationSlug(input.slug, "organization slug") }),
      ...(input.name === undefined
        ? {}
        : { name: organizationName(input.name, "organization name") }),
      ...(input.config === undefined
        ? {}
        : { config: organizationConfig(input.config, "organization config") }),
      updatedAt: isoDate(this.#clock(), "clock"),
    };
    try {
      return clone(
        organizationRecord(await this.#organizationMethod("updateOrganization")(update)),
      );
    } catch (error) {
      if (error instanceof MemberServiceError) throw error;
      if (repositoryConflict(error)) {
        throw conflict("The organization slug is already in use.");
      }
      throw error;
    }
  }

  async listMembers(
    actor: MemberActor,
    input: { readonly organizationId?: string } = {},
  ): Promise<readonly Member[]> {
    const inputValue = objectValue(input, "member list");
    assertFields(inputValue, "member list", MEMBER_FIELDS);
    const organizationId =
      input.organizationId === undefined
        ? actorOrganization(actor)
        : identifier(input.organizationId, "organization id");
    assertOrganizer(actor, organizationId);
    const [members, invitations] = await Promise.all([
      this.#identity.listMembers(organizationId),
      this.#identity.listPendingInvitations(organizationId),
    ]);
    const scopedMembers = members.filter((member) => member.organizationId === organizationId);
    const memberIds = new Set(scopedMembers.map((member) => member.userId));
    const pendingMembers = await Promise.all(
      invitations
        .filter(
          (invitation) =>
            invitation.organizationId === organizationId && !memberIds.has(invitation.userId),
        )
        .map((invitation) => this.#pendingMember(invitation)),
    );
    return [...scopedMembers, ...pendingMembers]
      .sort((left, right) => left.email.localeCompare(right.email))
      .map(clone);
  }

  async inviteMember(actor: MemberActor, input: InviteMemberInput): Promise<InviteMemberResult> {
    const inputValue = objectValue(input, "member invitation");
    assertFields(inputValue, "member invitation", INVITE_FIELDS);
    const organizationId = identifier(input.organizationId, "organization id");
    const idempotencyKey = text(input.idempotencyKey, "idempotency key", 512);
    const lockKey = `${organizationId}\u0000${idempotencyKey}`;
    const active = this.#invitationLocks.get(lockKey);
    if (active !== undefined) {
      await active;
      return this.inviteMember(actor, input);
    }
    const operation = this.#inviteMember(actor, input);
    this.#invitationLocks.set(lockKey, operation);
    try {
      return await operation;
    } finally {
      if (this.#invitationLocks.get(lockKey) === operation) this.#invitationLocks.delete(lockKey);
    }
  }

  async #inviteMember(actor: MemberActor, input: InviteMemberInput): Promise<InviteMemberResult> {
    const inputValue = objectValue(input, "member invitation");
    assertFields(inputValue, "member invitation", INVITE_FIELDS);
    const organizationId = identifier(input.organizationId, "organization id");
    const requestedRole = role(input.role);
    assertOrganizer(actor, organizationId);
    if (actor.role === "admin" && requestedRole !== "reviewer") {
      throw forbidden("Administrators can invite reviewer memberships only.");
    }
    const normalizedEmail = email(input.email);
    const normalizedName = nullableText(input.name, "name", 200);
    const idempotencyKey = text(input.idempotencyKey, "idempotency key", 512);

    const existingByKey = await this.#identity.findInvitationByIdempotencyKey(
      organizationId,
      idempotencyKey,
    );
    if (existingByKey !== null) {
      if (
        existingByKey.email !== normalizedEmail ||
        existingByKey.name !== normalizedName ||
        existingByKey.role !== requestedRole
      ) {
        throw conflict("The idempotency key was already used for another member invitation.");
      }
      return this.#replayInvitation(existingByKey);
    }

    const existingMember = await this.#identity.findMemberByEmail(organizationId, normalizedEmail);
    if (existingMember !== null) {
      if (existingMember.role !== requestedRole) {
        throw conflict("That email already belongs to a member with another role.");
      }
      return {
        member: clone(existingMember),
        invitation: null,
        created: false,
      };
    }

    const existingInvitation = await this.#identity.findPendingInvitation(
      organizationId,
      normalizedEmail,
    );
    if (existingInvitation !== null) {
      await this.#identity.revokePendingInvitations(
        organizationId,
        normalizedEmail,
        isoDate(this.#clock(), "clock"),
      );
    }

    const nowDate = this.#clock();
    const now = isoDate(nowDate, "clock");
    const expiresAtDate = new Date(nowDate.getTime() + this.#invitationTtlMs);
    const expiresAt = isoDate(expiresAtDate, "invitation expiry");
    let user = await this.#identity.findUserByEmail(normalizedEmail);
    if (user === null) {
      try {
        user = await this.#identity.createUser({
          userId: text(this.#generateId(), "user id"),
          email: normalizedEmail,
          name: normalizedName,
          emailVerified: false,
          createdAt: now,
          updatedAt: now,
        });
      } catch (error) {
        if (!repositoryConflict(error)) throw error;
        user = await this.#identity.findUserByEmail(normalizedEmail);
        if (user === null) throw conflict("The invited user could not be created.");
      }
    }

    const invitation: MemberInvitation = {
      id: await sha256(`member-invitation:${organizationId}\u0000${idempotencyKey}`),
      organizationId,
      userId: user.userId,
      email: normalizedEmail,
      name: normalizedName,
      role: requestedRole,
      idempotencyKey,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      expiresAt,
      deliveredAt: null,
      acceptedAt: null,
    };
    try {
      await this.#identity.createInvitation(invitation);
    } catch (error) {
      if (!repositoryConflict(error)) throw error;
      const concurrent = await this.#identity.getInvitation(invitation.id);
      if (concurrent === null) {
        throw conflict("The invitation could not be claimed. Retry with the same key.");
      }
      if (
        concurrent.email !== normalizedEmail ||
        concurrent.name !== normalizedName ||
        concurrent.role !== requestedRole
      ) {
        throw conflict("The idempotency key was already used for another member invitation.");
      }
      return this.#replayInvitation(concurrent);
    }

    const delivered = await this.#deliverInvitation(invitation, expiresAtDate);
    return {
      member: clone(await this.#pendingMember(delivered)),
      invitation: clone(delivered),
      created: true,
    };
  }

  async #replayInvitation(invitation: MemberInvitation): Promise<InviteMemberResult> {
    const user = await this.#userForInvitation(invitation);
    if (invitation.status === "pending" && invitation.deliveredAt === null) {
      const delivered = await this.#deliverInvitation(invitation, new Date(invitation.expiresAt));
      return {
        member: clone(await this.#pendingMember(delivered, user)),
        invitation: clone(delivered),
        created: false,
      };
    }
    const member = await this.#identity.getMember(invitation.organizationId, invitation.userId);
    return {
      member: member === null ? clone(await this.#pendingMember(invitation, user)) : clone(member),
      invitation: clone(invitation),
      created: false,
    };
  }

  async #deliverInvitation(
    invitation: MemberInvitation,
    expiresAtDate: Date,
  ): Promise<MemberInvitation> {
    const issued = await this.#auth.issueSetupLink({
      invitationId: invitation.id,
      organizationId: invitation.organizationId,
      userId: invitation.userId,
      email: invitation.email,
      expiresAt: expiresAtDate,
    });
    if (typeof issued.setupUrl !== "string" || issued.setupUrl.trim().length === 0) {
      throw new Error("The auth boundary returned an empty setup URL.");
    }
    await this.#invitationDelivery.sendMemberInvitation({
      invitationId: invitation.id,
      organizationId: invitation.organizationId,
      userId: invitation.userId,
      email: invitation.email,
      name: invitation.name,
      role: invitation.role,
      setupUrl: issued.setupUrl,
      expiresAt: invitation.expiresAt,
    });
    return this.#identity.markInvitationDelivered(invitation.id, isoDate(this.#clock(), "clock"));
  }

  async #userForInvitation(invitation: MemberInvitation): Promise<MemberUser> {
    const user = await this.#identity.findUserByEmail(invitation.email);
    if (user === null || user.userId !== invitation.userId) {
      throw notFound("The invited user no longer exists.");
    }
    return user;
  }

  async #pendingMember(invitation: MemberInvitation, user?: MemberUser): Promise<Member> {
    const resolvedUser = user ?? (await this.#userForInvitation(invitation));
    return {
      organizationId: invitation.organizationId,
      userId: invitation.userId,
      email: invitation.email,
      name: invitation.name ?? resolvedUser.name,
      emailVerified: resolvedUser.emailVerified,
      status: "pending",
      role: invitation.role,
      createdAt: invitation.createdAt,
      updatedAt:
        invitation.updatedAt > resolvedUser.updatedAt
          ? invitation.updatedAt
          : resolvedUser.updatedAt,
    };
  }
  async #ensureMembership(invitation: MemberInvitation, updatedAt: string): Promise<void> {
    const membership: MemberMembership = {
      organizationId: invitation.organizationId,
      userId: invitation.userId,
      role: invitation.role,
      createdAt: invitation.createdAt,
      updatedAt,
    };
    try {
      await this.#identity.createMembership(membership);
    } catch (error) {
      if (!repositoryConflict(error)) throw error;
      const existing = await this.#identity.getMember(invitation.organizationId, invitation.userId);
      if (existing === null || existing.role !== invitation.role) {
        throw conflict("The membership already exists with another role.");
      }
    }
  }

  async activateMember(input: ActivateMemberInput): Promise<ActivateMemberResult> {
    const inputValue = objectValue(input, "member activation");
    assertFields(inputValue, "member activation", ["organizationId", "token", "name", "password"]);
    const requestedOrganizationId = identifier(input.organizationId, "organization id");
    const token = text(input.token, "setup token", 2_000);
    const passwordValue = password(input.password);
    const claim = await this.#auth.consumeSetupLink(
      setupTokenFromUrl(token),
      requestedOrganizationId,
    );
    if (claim === null)
      throw new MemberServiceError(
        "INVITATION_INVALID",
        400,
        "The setup link is invalid or has already been used.",
      );
    if (claim.expiresAt.getTime() <= this.#clock().getTime()) {
      throw new MemberServiceError("INVITATION_EXPIRED", 409, "The setup link has expired.");
    }
    const invitation = await this.#identity.getInvitation(claim.invitationId);
    const invitationExpiresAt = invitation === null ? null : new Date(invitation.expiresAt);
    if (
      invitation === null ||
      invitation.organizationId !== requestedOrganizationId ||
      invitation.organizationId !== claim.organizationId ||
      invitation.userId !== claim.userId ||
      invitation.email.toLowerCase() !== claim.email.toLowerCase() ||
      invitationExpiresAt === null ||
      !Number.isFinite(invitationExpiresAt.getTime()) ||
      invitationExpiresAt.getTime() !== claim.expiresAt.getTime() ||
      (invitation.status !== "pending" &&
        invitation.status !== "delivered" &&
        invitation.status !== "accepted")
    ) {
      throw new MemberServiceError("INVITATION_INVALID", 400, "The setup link is invalid.");
    }
    const user = await this.#userForInvitation(invitation);
    const name = input.name === undefined ? user.name : nullableText(input.name, "name", 200);
    const activationDigest = await sha256(JSON.stringify([claim.tokenDigest, name, passwordValue]));
    let accepted: MemberInvitation;
    try {
      accepted = await this.#identity.claimInvitationActivation(
        invitation.id,
        activationDigest,
        isoDate(this.#clock(), "clock"),
      );
    } catch (error) {
      if (!repositoryConflict(error)) throw error;
      throw new MemberServiceError(
        "INVITATION_INVALID",
        400,
        "The setup link is already being activated with different account details.",
      );
    }
    await this.#auth.establishPassword(invitation.userId, passwordValue);
    await this.#identity.activateUser(invitation.userId, name, isoDate(this.#clock(), "clock"));
    await this.#ensureMembership(invitation, isoDate(this.#clock(), "clock"));
    await this.#auth.revokeSessions(invitation.userId);
    const finalized = await this.#auth.finalizeSetupLink(claim);
    if (!finalized) {
      throw new MemberServiceError("INVITATION_INVALID", 400, "The setup link is invalid.");
    }
    const member = await this.#identity.getMember(invitation.organizationId, invitation.userId);
    if (member === null) throw notFound("The activated member no longer exists.");
    return { member: clone(member), invitation: clone(accepted) };
  }

  async updateMemberRole(actor: MemberActor, input: UpdateMemberRoleInput): Promise<Member> {
    const inputValue = objectValue(input, "member role");
    assertFields(inputValue, "member role", ROLE_FIELDS);
    const organizationId = identifier(input.organizationId, "organization id");
    const userId = identifier(input.userId, "user id");
    const nextRole = role(input.role);
    assertOrganizer(actor, organizationId);
    const current = await this.#identity.getMember(organizationId, userId);
    if (current === null) throw notFound();
    if (actor.role === "admin" && (current.role !== "reviewer" || nextRole !== "reviewer")) {
      throw forbidden("Administrators can manage reviewer memberships only.");
    }
    if (current.role === "owner" && actor.role !== "owner") {
      throw forbidden("Only an owner can change an owner membership.");
    }
    if (nextRole === "owner" && actor.role !== "owner") {
      throw forbidden("Only an owner can grant owner membership.");
    }
    if (current.role === "owner" && nextRole !== "owner") {
      const owners = await this.#identity.countOwners(organizationId);
      if (owners <= 1)
        throw conflict("An organization must retain at least one owner.", "LAST_OWNER");
    }
    if (current.role !== nextRole) {
      await this.#identity.updateMembershipRole(
        organizationId,
        userId,
        nextRole,
        isoDate(this.#clock(), "clock"),
      );
    }
    const updated = await this.#identity.getMember(organizationId, userId);
    if (updated === null) throw notFound();
    return clone(updated);
  }

  async revokeMember(actor: MemberActor, input: RevokeMemberInput): Promise<Member> {
    const inputValue = objectValue(input, "member revocation");
    assertFields(inputValue, "member revocation", REVOKE_FIELDS);
    const organizationId = identifier(input.organizationId, "organization id");
    const userId = identifier(input.userId, "user id");
    assertOrganizer(actor, organizationId);
    const activeMember = await this.#identity.getMember(organizationId, userId);
    const pendingInvitation =
      activeMember === null
        ? (await this.#identity.listPendingInvitations(organizationId)).find(
            (invitation) => invitation.userId === userId,
          )
        : undefined;
    const member =
      activeMember ??
      (pendingInvitation === undefined ? null : await this.#pendingMember(pendingInvitation));
    if (member === null) throw notFound();
    if (actor.role === "admin" && member.role !== "reviewer") {
      throw forbidden("Administrators can revoke reviewer memberships only.");
    }
    if (member.role === "owner") {
      if (activeMember !== null) {
        const owners = await this.#identity.countOwners(organizationId);
        if (owners <= 1) {
          throw conflict("An organization must retain at least one owner.", "LAST_OWNER");
        }
      }
      if (actor.role !== "owner") throw forbidden("Only an owner can revoke an owner membership.");
    }
    await this.#identity.revokePendingInvitations(
      organizationId,
      member.email,
      isoDate(this.#clock(), "clock"),
    );
    if (activeMember !== null) {
      await this.#identity.removeMembership(organizationId, userId);
    }
    await this.#auth.revokeSessions(userId);
    return clone(member);
  }

  async getReviewerPool(
    actor: MemberActor,
    input: { readonly organizationId: string; readonly eventId: string; readonly roundId: string },
  ): Promise<ReviewerPool | null> {
    const inputValue = objectValue(input, "reviewer pool");
    assertFields(inputValue, "reviewer pool", ["organizationId", "eventId", "roundId"]);
    const organizationId = identifier(input.organizationId, "organization id");
    const eventId = identifier(input.eventId, "event id");
    const roundId = identifier(input.roundId, "round id");
    assertOrganizer(actor, organizationId);
    const pool = await this.#reviewerPools.getReviewerPool(organizationId, eventId, roundId);
    return pool === null ? null : poolWithReviewerIds(pool);
  }

  async setReviewerPool(actor: MemberActor, input: SetReviewerPoolInput): Promise<ReviewerPool> {
    const inputValue = objectValue(input, "reviewer pool");
    assertFields(inputValue, "reviewer pool", POOL_FIELDS);
    const organizationId = identifier(input.organizationId, "organization id");
    const eventId = identifier(input.eventId, "event id");
    const roundId = identifier(input.roundId, "round id");
    assertOrganizer(actor, organizationId);
    const current = await this.#reviewerPools.getReviewerPool(organizationId, eventId, roundId);
    const expectedVersion = input.expectedVersion;
    if (expectedVersion !== undefined) {
      positiveInteger(expectedVersion, "expectedVersion");
      if (current === null || current.version !== expectedVersion) {
        throw conflict("The reviewer pool changed. Reload it before saving.");
      }
    }
    if (input.reviewerIds !== undefined && !Array.isArray(input.reviewerIds)) {
      throw validation("reviewerIds must be an array.");
    }
    if (input.reviewers !== undefined && !Array.isArray(input.reviewers)) {
      throw validation("reviewers must be an array.");
    }
    if (input.reviewerIds !== undefined && input.reviewers !== undefined) {
      throw validation("Provide reviewerIds or reviewers, not both.");
    }
    const globalCap =
      input.maxAssignmentsPerReviewer === undefined
        ? undefined
        : positiveInteger(input.maxAssignmentsPerReviewer, "maxAssignmentsPerReviewer");
    const reviewerInputs: ReviewerPoolGrantInput[] =
      input.reviewers !== undefined
        ? input.reviewers.map((candidate, index) => {
            const value = objectValue(candidate, `reviewers[${index}]`);
            assertFields(value, `reviewers[${index}]`, ["reviewerId", "maxAssignments"]);
            return {
              reviewerId: identifier(candidate.reviewerId, `reviewers[${index}].reviewerId`),
              ...(candidate.maxAssignments === undefined
                ? {}
                : {
                    maxAssignments: positiveInteger(
                      candidate.maxAssignments,
                      `reviewers[${index}].maxAssignments`,
                    ),
                  }),
            };
          })
        : (input.reviewerIds ?? []).map((reviewerId) => ({
            reviewerId: identifier(reviewerId, "reviewer id"),
          }));
    const ids = reviewerInputs.map((candidate) => candidate.reviewerId);
    if (new Set(ids).size !== ids.length) throw validation("Reviewer ids must be unique.");
    const previous = new Map((current?.grants ?? []).map((grant) => [grant.reviewerId, grant]));
    const grants: ReviewerPoolGrant[] = [];
    for (const candidate of reviewerInputs) {
      const member = await this.#identity.getMember(organizationId, candidate.reviewerId);
      if (member === null) {
        const pendingReviewer = (await this.#identity.listPendingInvitations(organizationId)).some(
          (invitation) =>
            invitation.userId === candidate.reviewerId && invitation.role === "reviewer",
        );
        if (pendingReviewer) {
          throw conflict(
            "The reviewer must verify the setup invitation before receiving assignments.",
            "REVIEWER_NOT_ACTIVE",
          );
        }
        throw forbidden("Only reviewer memberships can enter a reviewer pool.");
      }
      if (member.role !== "reviewer") {
        throw forbidden("Only reviewer memberships can enter a reviewer pool.");
      }
      if (!member.emailVerified) {
        throw conflict(
          "The reviewer must verify the setup invitation before receiving assignments.",
          "REVIEWER_NOT_ACTIVE",
        );
      }
      const previousGrant = previous.get(candidate.reviewerId);
      const maxAssignments = candidate.maxAssignments ?? globalCap ?? previousGrant?.maxAssignments;
      if (maxAssignments === undefined) {
        throw validation("Each reviewer needs a positive assignment cap.");
      }
      const cap = positiveInteger(maxAssignments, "maxAssignments");
      const assignedCount = previousGrant?.assignedCount ?? 0;
      if (cap < assignedCount) {
        throw conflict("A reviewer cap cannot be lower than assignments already reserved.");
      }
      grants.push({ reviewerId: candidate.reviewerId, maxAssignments: cap, assignedCount });
    }
    const now = isoDate(this.#clock(), "clock");
    const next: ReviewerPool = {
      organizationId,
      eventId,
      roundId,
      reviewerIds: grants
        .map((grant) => grant.reviewerId)
        .sort((left, right) => left.localeCompare(right)),
      grants: grants.sort((left, right) => left.reviewerId.localeCompare(right.reviewerId)),
      version: current === null ? 1 : current.version + 1,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await this.#reviewerPools.saveReviewerPool(next, current?.version ?? null);
    } catch (error) {
      if (repositoryConflict(error))
        throw conflict("The reviewer pool changed. Reload it before saving.");
      throw error;
    }
    return clone(next);
  }

  async grantReviewer(actor: MemberActor, input: GrantReviewerInput): Promise<ReviewerPool> {
    const inputValue = objectValue(input, "reviewer pool grant");
    assertFields(inputValue, "reviewer pool grant", GRANT_FIELDS);
    positiveInteger(input.maxAssignments, "maxAssignments");
    const organizationId = identifier(input.organizationId, "organization id");
    const eventId = identifier(input.eventId, "event id");
    const roundId = identifier(input.roundId, "round id");
    const reviewerId = identifier(input.reviewerId, "reviewer id");
    assertOrganizer(actor, organizationId);
    const current = await this.#reviewerPools.getReviewerPool(organizationId, eventId, roundId);
    const grants = [...(current?.grants ?? [])]
      .filter((grant) => grant.reviewerId !== reviewerId)
      .map((grant) => ({ reviewerId: grant.reviewerId, maxAssignments: grant.maxAssignments }));
    grants.push({ reviewerId, maxAssignments: input.maxAssignments });
    const poolInput: SetReviewerPoolInput = {
      organizationId,
      eventId,
      roundId,
      reviewers: grants,
      ...(current === null ? {} : { expectedVersion: current.version }),
    };
    return this.setReviewerPool(actor, poolInput);
  }

  async revokeReviewerGrant(
    actor: MemberActor,
    input: RevokeReviewerGrantInput,
  ): Promise<ReviewerPool> {
    const inputValue = objectValue(input, "reviewer pool grant revocation");
    assertFields(inputValue, "reviewer pool grant revocation", REVOKE_GRANT_FIELDS);
    const organizationId = identifier(input.organizationId, "organization id");
    const eventId = identifier(input.eventId, "event id");
    const roundId = identifier(input.roundId, "round id");
    const reviewerId = identifier(input.reviewerId, "reviewer id");
    assertOrganizer(actor, organizationId);
    const current = await this.#reviewerPools.getReviewerPool(organizationId, eventId, roundId);
    if (current === null || !current.grants.some((grant) => grant.reviewerId === reviewerId)) {
      throw notFound("The reviewer pool grant was not found.");
    }
    return this.setReviewerPool(actor, {
      organizationId,
      eventId,
      roundId,
      reviewers: current.grants
        .filter((grant) => grant.reviewerId !== reviewerId)
        .map((grant) => ({ reviewerId: grant.reviewerId, maxAssignments: grant.maxAssignments })),
      expectedVersion: input.expectedVersion ?? current.version,
    });
  }

  /** Reserve one assignment while enforcing the round-specific reviewer cap. */
  async reserveReviewerAssignment(
    actor: MemberActor,
    input: ReserveReviewerAssignmentInput,
  ): Promise<ReviewerPoolGrant> {
    const inputValue = objectValue(input, "reviewer assignment");
    assertFields(inputValue, "reviewer assignment", RESERVE_FIELDS);
    const organizationId = identifier(input.organizationId, "organization id");
    const eventId = identifier(input.eventId, "event id");
    const roundId = identifier(input.roundId, "round id");
    const reviewerId = identifier(input.reviewerId, "reviewer id");
    assertOrganizer(actor, organizationId);
    const current = await this.#reviewerPools.getReviewerPool(organizationId, eventId, roundId);
    if (current === null) throw notFound("The reviewer pool was not found.");
    const existing = current.grants.find((grant) => grant.reviewerId === reviewerId);
    if (existing === undefined)
      throw forbidden("The reviewer is not granted access to this round.");
    if (existing.assignedCount >= existing.maxAssignments) {
      throw conflict("The reviewer assignment cap has been reached.", "ASSIGNMENT_CAP_REACHED");
    }
    const updatedGrant = { ...existing, assignedCount: existing.assignedCount + 1 };
    const next: ReviewerPool = {
      ...current,
      grants: current.grants.map((grant) =>
        grant.reviewerId === reviewerId ? updatedGrant : grant,
      ),
      reviewerIds: current.reviewerIds.slice(),
      version: current.version + 1,
      updatedAt: isoDate(this.#clock(), "clock"),
    };
    try {
      await this.#reviewerPools.saveReviewerPool(next, current.version);
    } catch (error) {
      if (repositoryConflict(error))
        throw conflict("The reviewer pool changed. Retry the assignment.");
      throw error;
    }
    return clone(updatedGrant);
  }

  async assertReviewerAssignment(
    actor: MemberActor,
    input: ReserveReviewerAssignmentInput,
  ): Promise<void> {
    const inputValue = objectValue(input, "reviewer assignment");
    assertFields(inputValue, "reviewer assignment", RESERVE_FIELDS);
    const organizationId = identifier(input.organizationId, "organization id");
    const eventId = identifier(input.eventId, "event id");
    const roundId = identifier(input.roundId, "round id");
    const reviewerId = identifier(input.reviewerId, "reviewer id");
    assertOrganizer(actor, organizationId);
    const pool = await this.#reviewerPools.getReviewerPool(organizationId, eventId, roundId);
    const grant = pool?.grants.find((candidate) => candidate.reviewerId === reviewerId);
    if (grant === undefined) throw forbidden("The reviewer is not granted access to this round.");
    if (grant.assignedCount >= grant.maxAssignments) {
      throw conflict("The reviewer assignment cap has been reached.", "ASSIGNMENT_CAP_REACHED");
    }
  }
}

/** Deterministic D1-shaped test double. It never returns records outside the requested organization. */
export class InMemoryMemberIdentityRepository implements MemberIdentityRepository {
  readonly #users = new Map<string, MemberUser>();
  readonly #memberships = new Map<string, MemberMembership>();
  readonly #invitations = new Map<string, MemberInvitation>();
  readonly #activationDigests = new Map<string, string>();
  readonly #organizations = new Map<string, OrganizationRecord>();

  constructor(seed: MemberRepositorySeed & OrganizationRepositorySeed = {}) {
    const organizationSeed = seed.organizations;
    for (const organization of organizationSeed ?? []) {
      this.#organizations.set(organization.organizationId, clone(organizationRecord(organization)));
    }
    for (const user of seed.users ?? []) this.#users.set(user.userId, clone(user));
    for (const membership of seed.memberships ?? []) {
      this.#memberships.set(
        this.memberKey(membership.organizationId, membership.userId),
        clone(membership),
      );
      this.ensureOrganization(
        membership.organizationId,
        membership.createdAt,
        membership.updatedAt,
      );
    }
    for (const invitation of seed.invitations ?? [])
      this.#invitations.set(invitation.id, clone(invitation));
  }
  async createOrganizationWithOwner(input: {
    readonly organization: OrganizationRecord;
    readonly membership: MemberMembership;
    readonly idempotencyKey?: string;
  }): Promise<OrganizationRecord> {
    const organization = organizationRecord(input.organization);
    const membership = clone(input.membership);
    if (
      membership.organizationId !== organization.organizationId ||
      membership.role !== "owner" ||
      !this.#users.has(membership.userId)
    ) {
      throw new MemberRepositoryConflictError("The organization owner membership is invalid.");
    }
    if (this.#organizations.has(organization.organizationId)) {
      throw new MemberRepositoryConflictError("The organization ID already exists.");
    }
    if (
      [...this.#organizations.values()].some(
        (candidate) => candidate.slug.toLowerCase() === organization.slug.toLowerCase(),
      )
    ) {
      throw new MemberRepositoryConflictError("The organization slug already exists.");
    }
    const membershipKey = this.memberKey(membership.organizationId, membership.userId);
    if (this.#memberships.has(membershipKey)) {
      throw new MemberRepositoryConflictError("The owner membership already exists.");
    }
    this.#organizations.set(organization.organizationId, clone(organization));
    this.#memberships.set(membershipKey, membership);
    return clone(organization);
  }

  async listOrganizationsForUser(userId: string): Promise<readonly OrganizationMembership[]> {
    const organizations: OrganizationMembership[] = [];
    for (const membership of this.#memberships.values()) {
      if (membership.userId !== userId) continue;
      const organization = this.#organizations.get(membership.organizationId);
      if (organization === undefined) continue;
      organizations.push({ ...clone(organization), role: membership.role });
    }
    return organizations.sort((left, right) => left.name.localeCompare(right.name)).map(clone);
  }

  async getOrganization(organizationIdValue: string): Promise<OrganizationRecord | null> {
    const organization = this.#organizations.get(organizationIdValue);
    return organization === undefined ? null : clone(organization);
  }

  async updateOrganization(input: {
    readonly organizationId: string;
    readonly slug?: string;
    readonly name?: string;
    readonly config?: Readonly<Record<string, unknown>>;
    readonly updatedAt: string;
  }): Promise<OrganizationRecord> {
    const current = this.#organizations.get(input.organizationId);
    if (current === undefined) {
      throw new MemberRepositoryConflictError("The organization does not exist.");
    }
    const nextSlug = input.slug;
    if (
      nextSlug !== undefined &&
      [...this.#organizations.values()].some(
        (candidate) =>
          candidate.organizationId !== input.organizationId &&
          candidate.slug.toLowerCase() === nextSlug.toLowerCase(),
      )
    ) {
      throw new MemberRepositoryConflictError("The organization slug already exists.");
    }
    const next: OrganizationRecord = {
      ...current,
      ...(input.slug === undefined ? {} : { slug: input.slug }),
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.config === undefined ? {} : { config: clone(input.config) }),
      updatedAt: input.updatedAt,
    };
    this.#organizations.set(input.organizationId, clone(next));
    return clone(next);
  }

  async listMembers(organizationId: string): Promise<readonly Member[]> {
    const members: Member[] = [];
    for (const membership of this.#memberships.values()) {
      if (membership.organizationId !== organizationId) continue;
      const user = this.#users.get(membership.userId);
      if (user === undefined) continue;
      members.push(this.member(membership, user));
    }
    return members.sort((left, right) => left.email.localeCompare(right.email)).map(clone);
  }

  async getMember(organizationId: string, userId: string): Promise<Member | null> {
    const membership = this.#memberships.get(this.memberKey(organizationId, userId));
    if (membership === undefined) return null;
    const user = this.#users.get(userId);
    return user === undefined ? null : clone(this.member(membership, user));
  }

  async findMemberByEmail(organizationId: string, emailValue: string): Promise<Member | null> {
    const normalized = emailValue.toLowerCase();
    for (const membership of this.#memberships.values()) {
      if (membership.organizationId !== organizationId) continue;
      const user = this.#users.get(membership.userId);
      if (user?.email.toLowerCase() === normalized) return clone(this.member(membership, user));
    }
    return null;
  }

  async findUserByEmail(emailValue: string): Promise<MemberUser | null> {
    const normalized = emailValue.toLowerCase();
    const user = [...this.#users.values()].find(
      (candidate) => candidate.email.toLowerCase() === normalized,
    );
    return user === undefined ? null : clone(user);
  }

  async createUser(input: {
    readonly userId: string;
    readonly email: string;
    readonly name: string | null;
    readonly emailVerified: boolean;
    readonly createdAt: string;
    readonly updatedAt: string;
  }): Promise<MemberUser> {
    if (
      [...this.#users.values()].some(
        (user) => user.email.toLowerCase() === input.email.toLowerCase(),
      )
    ) {
      throw new MemberRepositoryConflictError("A user with that email already exists.");
    }
    const user: MemberUser = { ...input };
    this.#users.set(user.userId, clone(user));
    return clone(user);
  }

  async createMembership(input: MemberMembership): Promise<void> {
    const key = this.memberKey(input.organizationId, input.userId);
    if (!this.#users.has(input.userId))
      throw new MemberRepositoryConflictError("The user does not exist.");
    if (this.#memberships.has(key))
      throw new MemberRepositoryConflictError("The membership already exists.");
    this.#memberships.set(key, clone(input));
    this.ensureOrganization(input.organizationId, input.createdAt, input.updatedAt);
  }

  async updateMembershipRole(
    organizationId: string,
    userId: string,
    nextRole: MemberRole,
    updatedAt: string,
  ): Promise<void> {
    const key = this.memberKey(organizationId, userId);
    const current = this.#memberships.get(key);
    if (current === undefined)
      throw new MemberRepositoryConflictError("The membership does not exist.");
    this.#memberships.set(key, { ...current, role: nextRole, updatedAt });
  }

  async removeMembership(organizationId: string, userId: string): Promise<void> {
    this.#memberships.delete(this.memberKey(organizationId, userId));
  }

  async countOwners(organizationId: string): Promise<number> {
    return [...this.#memberships.values()].filter(
      (membership) => membership.organizationId === organizationId && membership.role === "owner",
    ).length;
  }

  async findInvitationByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<MemberInvitation | null> {
    const invitation = [...this.#invitations.values()].find(
      (candidate) =>
        candidate.organizationId === organizationId && candidate.idempotencyKey === idempotencyKey,
    );
    return invitation === undefined ? null : clone(invitation);
  }

  async findPendingInvitation(
    organizationId: string,
    emailValue: string,
  ): Promise<MemberInvitation | null> {
    const normalized = emailValue.toLowerCase();
    const invitation = [...this.#invitations.values()]
      .filter(
        (candidate) =>
          candidate.organizationId === organizationId &&
          candidate.email.toLowerCase() === normalized &&
          (candidate.status === "pending" || candidate.status === "delivered"),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    return invitation === undefined ? null : clone(invitation);
  }
  async listPendingInvitations(organizationId: string): Promise<readonly MemberInvitation[]> {
    return [...this.#invitations.values()]
      .filter(
        (invitation) =>
          invitation.organizationId === organizationId &&
          (invitation.status === "pending" || invitation.status === "delivered"),
      )
      .sort((left, right) => left.email.localeCompare(right.email))
      .map(clone);
  }
  async revokePendingInvitations(
    organizationId: string,
    emailValue: string,
    revokedAt: string,
  ): Promise<readonly MemberInvitation[]> {
    const normalized = emailValue.toLowerCase();
    const revoked: MemberInvitation[] = [];
    for (const [id, current] of this.#invitations) {
      if (
        current.organizationId !== organizationId ||
        current.email.toLowerCase() !== normalized ||
        (current.status !== "pending" && current.status !== "delivered")
      ) {
        continue;
      }
      const updated: MemberInvitation = {
        ...current,
        status: "revoked",
        updatedAt: revokedAt,
      };
      this.#invitations.set(id, updated);
      revoked.push(clone(updated));
    }
    return revoked;
  }

  async getInvitation(invitationId: string): Promise<MemberInvitation | null> {
    const invitation = this.#invitations.get(invitationId);
    return invitation === undefined ? null : clone(invitation);
  }

  async createInvitation(input: MemberInvitation): Promise<void> {
    if (this.#invitations.has(input.id))
      throw new MemberRepositoryConflictError("The invitation already exists.");
    if (
      [...this.#invitations.values()].some(
        (candidate) =>
          candidate.organizationId === input.organizationId &&
          candidate.idempotencyKey === input.idempotencyKey,
      )
    ) {
      throw new MemberRepositoryConflictError("The idempotency key is already in use.");
    }
    this.#invitations.set(input.id, clone(input));
  }

  async markInvitationDelivered(
    invitationId: string,
    deliveredAt: string,
  ): Promise<MemberInvitation> {
    const current = this.#invitations.get(invitationId);
    if (current === undefined)
      throw new MemberRepositoryConflictError("The invitation does not exist.");
    if (current.status !== "pending") {
      throw new MemberRepositoryConflictError("The invitation is not pending delivery.");
    }
    const updated: MemberInvitation = {
      ...current,
      status: "delivered",
      deliveredAt,
      updatedAt: deliveredAt,
    };
    this.#invitations.set(invitationId, updated);
    return clone(updated);
  }

  async claimInvitationActivation(
    invitationId: string,
    activationDigest: string,
    acceptedAt: string,
  ): Promise<MemberInvitation> {
    const current = this.#invitations.get(invitationId);
    if (current === undefined) {
      throw new MemberRepositoryConflictError("The invitation does not exist.");
    }
    if (current.status === "accepted") {
      if (this.#activationDigests.get(invitationId) !== activationDigest) {
        throw new MemberRepositoryConflictError(
          "The invitation is already being activated with different account details.",
        );
      }
      return clone(current);
    }
    if (current.status !== "pending" && current.status !== "delivered") {
      throw new MemberRepositoryConflictError("The invitation cannot be activated.");
    }
    const updated: MemberInvitation = {
      ...current,
      status: "accepted",
      acceptedAt,
      updatedAt: acceptedAt,
    };
    this.#invitations.set(invitationId, updated);
    this.#activationDigests.set(invitationId, activationDigest);
    return clone(updated);
  }

  async activateUser(userId: string, name: string | null, updatedAt: string): Promise<MemberUser> {
    const current = this.#users.get(userId);
    if (current === undefined) throw new MemberRepositoryConflictError("The user does not exist.");
    const updated: MemberUser = { ...current, name, emailVerified: true, updatedAt };
    this.#users.set(userId, updated);
    return clone(updated);
  }

  private ensureOrganization(
    organizationIdValue: string,
    createdAt: string,
    updatedAt: string,
  ): void {
    if (this.#organizations.has(organizationIdValue)) return;
    const baseSlug =
      organizationIdValue
        .toLowerCase()
        .replace(/[^a-z0-9-]+/gu, "-")
        .replace(/^-+|-+$/gu, "") || "organization";
    let slug = baseSlug.slice(0, ORGANIZATION_SLUG_MAX).replace(/-+$/u, "") || "organization";
    let suffix = 1;
    while (
      [...this.#organizations.values()].some(
        (candidate) => candidate.slug.toLowerCase() === slug.toLowerCase(),
      )
    ) {
      const suffixValue = `-${suffix++}`;
      slug = `${baseSlug.slice(0, ORGANIZATION_SLUG_MAX - suffixValue.length)}${suffixValue}`;
    }
    this.#organizations.set(organizationIdValue, {
      organizationId: organizationIdValue,
      slug,
      name: organizationIdValue,
      config: {},
      createdAt,
      updatedAt,
    });
  }

  private member(membership: MemberMembership, user: MemberUser): Member {
    return {
      organizationId: membership.organizationId,
      userId: membership.userId,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      status: user.emailVerified ? "active" : "pending",
      role: membership.role,
      createdAt: membership.createdAt,
      updatedAt: membership.updatedAt > user.updatedAt ? membership.updatedAt : user.updatedAt,
    };
  }

  private memberKey(organizationId: string, userId: string): string {
    return `${organizationId}\u0000${userId}`;
  }
}

/** In-memory auth boundary for tests; only a SHA-256 token digest is retained. */
export class InMemoryMemberAuthBoundary implements MemberAuthBoundary {
  readonly #links = new Map<string, StoredSetupLink>();
  readonly #baseUrl: string;
  readonly #revokedUsers = new Set<string>();
  readonly #passwordDigests = new Map<string, string>();
  readonly #clock: () => Date;
  readonly #generateToken: () => string;

  constructor(
    options: {
      readonly baseUrl?: string;
      readonly clock?: () => Date;
      readonly generateToken?: () => string;
    } = {},
  ) {
    this.#baseUrl = options.baseUrl ?? "https://eventloom.test/setup";
    this.#clock = options.clock ?? (() => new Date());
    this.#generateToken = options.generateToken ?? randomToken;
  }

  async issueSetupLink(input: {
    readonly invitationId: string;
    readonly organizationId: string;
    readonly userId: string;
    readonly email: string;
    readonly expiresAt: Date;
  }): Promise<{ setupUrl: string; expiresAt: Date }> {
    const token = this.#generateToken();
    const tokenDigest = await sha256(token);
    const stored: StoredSetupLink = {
      invitationId: input.invitationId,
      organizationId: input.organizationId,
      userId: input.userId,
      email: input.email,
      tokenDigest,
      expiresAt: input.expiresAt.toISOString(),
      usedAt: null,
    };
    this.#links.set(input.invitationId, stored);
    return {
      setupUrl: `${this.#baseUrl}?token=${encodeURIComponent(token)}`,
      expiresAt: input.expiresAt,
    };
  }

  async consumeSetupLink(
    tokenOrUrl: string,
    organizationId: string,
  ): Promise<SetupLinkClaim | null> {
    const token = setupTokenFromUrl(tokenOrUrl);
    const digest = await sha256(token);
    const stored = [...this.#links.values()].find((candidate) => candidate.tokenDigest === digest);
    if (stored === undefined || stored.usedAt !== null) return null;
    if (stored.organizationId !== organizationId) return null;
    const expiresAt = new Date(stored.expiresAt);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= this.#clock().getTime())
      return null;
    return {
      invitationId: stored.invitationId,
      organizationId: stored.organizationId,
      userId: stored.userId,
      email: stored.email,
      tokenDigest: stored.tokenDigest,
      expiresAt,
    };
  }

  async finalizeSetupLink(claim: SetupLinkClaim): Promise<boolean> {
    const stored = this.#links.get(claim.invitationId);
    if (
      stored === undefined ||
      stored.usedAt !== null ||
      stored.tokenDigest !== claim.tokenDigest ||
      stored.organizationId !== claim.organizationId ||
      stored.userId !== claim.userId ||
      stored.email.toLowerCase() !== claim.email.toLowerCase() ||
      stored.expiresAt !== claim.expiresAt.toISOString()
    ) {
      return false;
    }
    this.#links.set(stored.invitationId, {
      ...stored,
      usedAt: this.#clock().toISOString(),
    });
    return true;
  }
  async establishPassword(userId: string, passwordValue: string): Promise<void> {
    this.#passwordDigests.set(userId, await sha256(passwordValue));
  }

  async revokeSessions(userId: string): Promise<void> {
    this.#revokedUsers.add(userId);
  }

  storedSetupLink(invitationId: string): StoredSetupLink | null {
    const link = this.#links.get(invitationId);
    return link === undefined ? null : clone(link);
  }

  hasEstablishedPassword(userId: string): boolean {
    return this.#passwordDigests.has(userId);
  }
  hasRevokedSessions(userId: string): boolean {
    return this.#revokedUsers.has(userId);
  }
}

export interface SentMemberInvitation {
  readonly invitationId: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly email: string;
  readonly name: string | null;
  readonly role: MemberRole;
  readonly setupUrl: string;
  readonly expiresAt: string;
}

export class InMemoryMemberInvitationDelivery implements MemberInvitationDelivery {
  readonly messages: SentMemberInvitation[] = [];

  async sendMemberInvitation(input: SentMemberInvitation): Promise<void> {
    this.messages.push(clone(input));
  }
}

export class InMemoryReviewerPoolRepository implements ReviewerPoolRepository {
  readonly #pools = new Map<string, ReviewerPool>();

  constructor(seed: MemberRepositorySeed = {}) {
    for (const pool of seed.pools ?? [])
      this.#pools.set(
        poolKey(pool.organizationId, pool.eventId, pool.roundId),
        poolWithReviewerIds(pool),
      );
  }

  async getReviewerPool(
    organizationId: string,
    eventId: string,
    roundId: string,
  ): Promise<ReviewerPool | null> {
    const pool = this.#pools.get(poolKey(organizationId, eventId, roundId));
    return pool === undefined ? null : clone(pool);
  }

  async saveReviewerPool(pool: ReviewerPool, expectedVersion: number | null): Promise<void> {
    const key = poolKey(pool.organizationId, pool.eventId, pool.roundId);
    const current = this.#pools.get(key);
    if (expectedVersion === null ? current !== undefined : current?.version !== expectedVersion) {
      throw new MemberRepositoryConflictError("The reviewer pool changed.");
    }
    this.#pools.set(key, poolWithReviewerIds(pool));
  }
}
