export const memberRoles = ["owner", "admin", "reviewer"] as const;
export type MemberRole = (typeof memberRoles)[number];

export type MemberStatus = "pending" | "active" | string;

export interface OrganizationMember {
  readonly organizationId: string;
  readonly userId: string;
  readonly email: string;
  readonly name: string | null;
  readonly emailVerified: boolean;
  readonly status: MemberStatus;
  readonly role: MemberRole;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function activeVerifiedReviewers(
  members: readonly OrganizationMember[],
): readonly OrganizationMember[] {
  return members.filter(
    (member) => member.role === "reviewer" && member.status === "active" && member.emailVerified,
  );
}
export type MemberRecord = OrganizationMember;
export type Member = OrganizationMember;

export interface MemberRosterEnvelope {
  readonly organizationId: string;
  readonly members: readonly OrganizationMember[];
}

export interface MemberInvitation {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly email: string;
  readonly name: string | null;
  readonly role: MemberRole;
  readonly idempotencyKey: string;
  readonly status: "pending" | "delivered" | "accepted" | "revoked" | string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt: string;
  readonly deliveredAt: string | null;
  readonly acceptedAt: string | null;
}

export interface InviteMemberInput {
  readonly email: string;
  readonly name?: string | null;
  readonly role: MemberRole;
  readonly idempotencyKey?: string;
}

export interface InviteMemberResult {
  readonly member: OrganizationMember;
  readonly invitation: MemberInvitation | null;
  readonly created: boolean;
}

export interface ActivateMemberInput {
  readonly token: string;
  readonly name?: string | null;
  readonly password: string;
}

export interface ActivateMemberResult {
  readonly member: OrganizationMember;
  readonly invitation: MemberInvitation;
}

export interface ReviewerPoolGrant {
  readonly reviewerId: string;
  readonly maxAssignments: number;
  readonly assignedCount: number;
}

export interface ReviewerPool {
  readonly organizationId: string;
  readonly eventId: string;
  readonly roundId: string;
  readonly reviewerIds: readonly string[];
  readonly grants: readonly ReviewerPoolGrant[];
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ReviewerPoolGrantInput {
  readonly reviewerId: string;
  readonly maxAssignments: number;
}

export interface SetReviewerPoolInput {
  readonly reviewerIds?: readonly string[];
  readonly reviewers?: readonly ReviewerPoolGrantInput[];
  readonly maxAssignmentsPerReviewer?: number;
  readonly expectedVersion?: number;
}

export interface MemberErrorDetail {
  readonly path?: readonly (string | number)[];
  readonly message?: string;
}

export class MemberApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly traceId: string | undefined;
  readonly details: readonly MemberErrorDetail[] | undefined;

  constructor(
    code: string,
    message: string,
    status: number,
    traceId?: string,
    details?: readonly MemberErrorDetail[],
  ) {
    super(message);
    this.name = "MemberApiError";
    this.code = code;
    this.status = status;
    this.traceId = traceId;
    this.details = details;
  }
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type UnknownRecord = Record<string, unknown>;

interface ErrorEnvelope {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly traceId?: string;
    readonly details?: readonly MemberErrorDetail[];
  };
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`The member response is missing ${field}.`);
  }
  return value;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string")
    throw new TypeError(`The member response contains an invalid ${field}.`);
  return value;
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean")
    throw new TypeError(`The member response contains an invalid ${field}.`);
  return value;
}

function requiredInteger(value: unknown, field: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`The member response contains an invalid ${field}.`);
  }
  return value;
}

function memberRole(value: unknown): MemberRole {
  if (typeof value !== "string" || !memberRoles.includes(value as MemberRole)) {
    throw new TypeError("The member response contains an invalid role.");
  }
  return value as MemberRole;
}

function parseMember(value: unknown, index?: number): OrganizationMember {
  if (!isRecord(value))
    throw new TypeError(
      `The member response contains an invalid member${index === undefined ? "" : ` at index ${index}`}.`,
    );
  return {
    organizationId: requiredString(value.organizationId, "organizationId"),
    userId: requiredString(value.userId, "userId"),
    email: requiredString(value.email, "email"),
    name: nullableString(value.name, "name"),
    emailVerified: requiredBoolean(value.emailVerified, "emailVerified"),
    status: requiredString(value.status, "status"),
    role: memberRole(value.role),
    createdAt: requiredString(value.createdAt, "createdAt"),
    updatedAt: requiredString(value.updatedAt, "updatedAt"),
  };
}

function parseInvitation(value: unknown): MemberInvitation | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) throw new TypeError("The invitation response is invalid.");
  return {
    id: requiredString(value.id, "invitation.id"),
    organizationId: requiredString(value.organizationId, "invitation.organizationId"),
    userId: requiredString(value.userId, "invitation.userId"),
    email: requiredString(value.email, "invitation.email"),
    name: nullableString(value.name, "invitation.name"),
    role: memberRole(value.role),
    idempotencyKey: requiredString(value.idempotencyKey, "invitation.idempotencyKey"),
    status: requiredString(value.status, "invitation.status"),
    createdAt: requiredString(value.createdAt, "invitation.createdAt"),
    updatedAt: requiredString(value.updatedAt, "invitation.updatedAt"),
    expiresAt: requiredString(value.expiresAt, "invitation.expiresAt"),
    deliveredAt: nullableString(value.deliveredAt, "invitation.deliveredAt"),
    acceptedAt: nullableString(value.acceptedAt, "invitation.acceptedAt"),
  };
}

function parseInviteResult(value: unknown): InviteMemberResult {
  if (!isRecord(value)) throw new TypeError("The member invitation response is invalid.");
  const member = parseMember(value.member);
  const invitation = parseInvitation(value.invitation);
  if (typeof value.created !== "boolean") {
    throw new TypeError("The member invitation response contains an invalid created flag.");
  }
  return { member, invitation, created: value.created };
}

function parseActivateResult(value: unknown): ActivateMemberResult {
  if (!isRecord(value)) throw new TypeError("The member activation response is invalid.");
  const invitation = parseInvitation(value.invitation);
  if (invitation === null) {
    throw new TypeError("The member activation response is missing an invitation.");
  }
  return {
    member: parseMember(value.member),
    invitation,
  };
}

function parsePoolGrant(value: unknown, index: number): ReviewerPoolGrant {
  if (!isRecord(value))
    throw new TypeError(`The reviewer pool grant at index ${index} is invalid.`);
  return {
    reviewerId: requiredString(value.reviewerId, `grants[${index}].reviewerId`),
    maxAssignments: requiredInteger(value.maxAssignments, `grants[${index}].maxAssignments`, 1),
    assignedCount: requiredInteger(value.assignedCount, `grants[${index}].assignedCount`),
  };
}

function parsePool(value: unknown): ReviewerPool | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || !Array.isArray(value.reviewerIds) || !Array.isArray(value.grants)) {
    throw new TypeError("The reviewer pool response is invalid.");
  }
  return {
    organizationId: requiredString(value.organizationId, "pool.organizationId"),
    eventId: requiredString(value.eventId, "pool.eventId"),
    roundId: requiredString(value.roundId, "pool.roundId"),
    reviewerIds: value.reviewerIds.map((reviewerId, index) =>
      requiredString(reviewerId, `reviewerIds[${index}]`),
    ),
    grants: value.grants.map(parsePoolGrant),
    version: requiredInteger(value.version, "pool.version", 1),
    createdAt: requiredString(value.createdAt, "pool.createdAt"),
    updatedAt: requiredString(value.updatedAt, "pool.updatedAt"),
  };
}

function unwrap<T>(payload: unknown): T {
  if (isRecord(payload) && "data" in payload) return payload.data as T;
  return payload as T;
}

async function requestError(response: Response): Promise<MemberApiError> {
  const body = (await response.json().catch(() => undefined)) as ErrorEnvelope | undefined;
  return new MemberApiError(
    body?.error?.code ?? "MEMBER_REQUEST_FAILED",
    body?.error?.message ?? `The member request failed (HTTP ${response.status}).`,
    response.status,
    body?.error?.traceId,
    body?.error?.details,
  );
}

function pathSegment(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new TypeError(`An ${field} is required for member requests.`);
  return encodeURIComponent(normalized);
}

function idempotencyKey(input: string | undefined): string {
  const value =
    input?.trim() || (typeof crypto !== "undefined" ? crypto.randomUUID() : `invite-${Date.now()}`);
  if (value.length === 0)
    throw new TypeError("An idempotency key is required for member invitations.");
  return value;
}

export interface MemberApi {
  listMembers(signal?: AbortSignal): Promise<readonly OrganizationMember[]>;
  inviteMember(input: InviteMemberInput): Promise<InviteMemberResult>;
  activateMember(input: ActivateMemberInput): Promise<ActivateMemberResult>;
  updateMemberRole(userId: string, role: MemberRole): Promise<OrganizationMember>;
  revokeMember(userId: string): Promise<OrganizationMember>;
  getReviewerPool(
    eventId: string,
    roundId: string,
    signal?: AbortSignal,
  ): Promise<ReviewerPool | null>;
  setReviewerPool(
    eventId: string,
    roundId: string,
    input: SetReviewerPoolInput,
  ): Promise<ReviewerPool>;
  grantReviewer(
    eventId: string,
    roundId: string,
    reviewerId: string,
    maxAssignments: number,
  ): Promise<ReviewerPool>;
  revokeReviewerGrant(
    eventId: string,
    roundId: string,
    reviewerId: string,
    expectedVersion?: number,
  ): Promise<ReviewerPool>;
  reserveReviewerAssignment(
    eventId: string,
    roundId: string,
    reviewerId: string,
  ): Promise<ReviewerPoolGrant>;
  /** Short aliases keep the adapter pleasant to use in small custom workspaces. */
  list(signal?: AbortSignal): Promise<readonly OrganizationMember[]>;
  updateRole(userId: string, role: MemberRole): Promise<OrganizationMember>;
  revoke(userId: string): Promise<OrganizationMember>;
  getPool(eventId: string, roundId: string, signal?: AbortSignal): Promise<ReviewerPool | null>;
  setPool(eventId: string, roundId: string, input: SetReviewerPoolInput): Promise<ReviewerPool>;
}

export function createMemberApi(
  baseUrl: string,
  organizationId: string,
  fetcher: Fetcher = globalThis.fetch,
): MemberApi {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/u, "");
  if (normalizedBaseUrl.length === 0)
    throw new TypeError("An API URL is required for member requests.");
  const organizationSegment = pathSegment(organizationId, "organization ID");
  const endpoint = `${normalizedBaseUrl}/api/admin/organizations/${organizationSegment}/members`;

  async function request<T>(
    path: string,
    parser: (value: unknown) => T,
    init: RequestInit = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body !== undefined) headers.set("content-type", "application/json");
    const response = await fetcher(`${endpoint}${path}`, {
      ...init,
      cache: "no-store",
      credentials: init.credentials ?? "include",
      headers,
    });
    if (!response.ok) throw await requestError(response);
    if (response.status === 204) return undefined as T;
    return parser(unwrap(await response.json().catch(() => undefined)));
  }

  function memberPath(userId: string): string {
    return `/${pathSegment(userId, "user ID")}`;
  }

  function poolPath(eventId: string, roundId: string): string {
    return `/events/${pathSegment(eventId, "event ID")}/rounds/${pathSegment(roundId, "round ID")}/reviewer-pool`;
  }

  async function listMembers(signal?: AbortSignal): Promise<readonly OrganizationMember[]> {
    const members = await request(
      "",
      (value) => {
        if (!Array.isArray(value)) throw new TypeError("The member list response is invalid.");
        return value.map((member, index) => parseMember(member, index));
      },
      signal === undefined ? {} : { signal },
    );
    if (members.some((member) => member.organizationId !== organizationId.trim())) {
      throw new TypeError("The member list response belongs to another organization.");
    }
    return members;
  }

  async function inviteMember(input: InviteMemberInput): Promise<InviteMemberResult> {
    const key = idempotencyKey(input.idempotencyKey);
    const body = {
      email: input.email.trim(),
      ...(input.name === undefined ? {} : { name: input.name === null ? null : input.name.trim() }),
      role: input.role,
    };
    return request(
      "/invitations",
      (value) => {
        const result = parseInviteResult(value);
        const requestedOrganizationId = organizationId.trim();
        const requestedEmail = normalizeEmail(body.email);
        const memberEmail = normalizeEmail(result.member.email);
        if (
          result.member.organizationId !== requestedOrganizationId ||
          memberEmail !== requestedEmail ||
          result.member.role !== body.role
        ) {
          throw new TypeError(
            "The invitation response does not match the requested organization, email, and role.",
          );
        }
        if (result.invitation !== null) {
          const invitationEmail = normalizeEmail(result.invitation.email);
          if (
            result.invitation.organizationId !== requestedOrganizationId ||
            result.invitation.userId !== result.member.userId ||
            invitationEmail !== memberEmail ||
            invitationEmail !== requestedEmail ||
            result.invitation.role !== result.member.role ||
            result.invitation.role !== body.role
          ) {
            throw new TypeError("The invitation response does not match the returned member.");
          }
        }
        return result;
      },
      { method: "POST", headers: { "idempotency-key": key }, body: JSON.stringify(body) },
    );
  }

  async function activateMember(input: ActivateMemberInput): Promise<ActivateMemberResult> {
    const token = input.token.trim();
    if (token.length === 0) throw new TypeError("A setup token is required.");
    if (input.password.length === 0) throw new TypeError("A setup password is required.");
    const body = {
      token,
      ...(input.name === undefined ? {} : { name: input.name === null ? null : input.name.trim() }),
      password: input.password,
    };
    return request(
      "/setup/activate",
      (value) => {
        const result = parseActivateResult(value);
        const requestedOrganizationId = organizationId.trim();
        const memberEmail = normalizeEmail(result.member.email);
        const invitationEmail = normalizeEmail(result.invitation.email);
        if (
          result.member.organizationId !== requestedOrganizationId ||
          result.invitation.organizationId !== requestedOrganizationId
        ) {
          throw new TypeError("The activation response belongs to another organization.");
        }
        if (
          result.invitation.userId !== result.member.userId ||
          invitationEmail !== memberEmail ||
          result.invitation.role !== result.member.role
        ) {
          throw new TypeError("The activation response does not match the returned member.");
        }
        return result;
      },
      {
        method: "POST",
        credentials: "omit",
        body: JSON.stringify(body),
      },
    );
  }

  async function updateMemberRole(userId: string, role: MemberRole): Promise<OrganizationMember> {
    const result = await request(`${memberPath(userId)}/role`, (value) => parseMember(value), {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
    if (result.organizationId !== organizationId.trim()) {
      throw new TypeError("The role response belongs to another organization.");
    }
    return result;
  }

  async function revokeMember(userId: string): Promise<OrganizationMember> {
    const result = await request(memberPath(userId), (value) => parseMember(value), {
      method: "DELETE",
    });
    if (result.organizationId !== organizationId.trim()) {
      throw new TypeError("The revocation response belongs to another organization.");
    }
    return result;
  }

  async function getReviewerPool(
    eventId: string,
    roundId: string,
    signal?: AbortSignal,
  ): Promise<ReviewerPool | null> {
    const result = await request(
      poolPath(eventId, roundId),
      parsePool,
      signal === undefined ? {} : { signal },
    );
    if (
      result !== null &&
      (result.organizationId !== organizationId.trim() ||
        result.eventId !== eventId.trim() ||
        result.roundId !== roundId.trim())
    ) {
      throw new TypeError(
        "The reviewer pool response is not scoped to the requested organization, event, and round.",
      );
    }
    return result;
  }

  async function setReviewerPool(
    eventId: string,
    roundId: string,
    input: SetReviewerPoolInput,
  ): Promise<ReviewerPool> {
    const result = await request(poolPath(eventId, roundId), parsePool, {
      method: "PUT",
      body: JSON.stringify(input),
    });
    if (
      result === null ||
      result.organizationId !== organizationId.trim() ||
      result.eventId !== eventId.trim() ||
      result.roundId !== roundId.trim()
    ) {
      throw new TypeError(
        "The saved reviewer pool is not scoped to the requested organization, event, and round.",
      );
    }
    return result;
  }

  async function grantReviewer(
    eventId: string,
    roundId: string,
    reviewerId: string,
    maxAssignments: number,
  ): Promise<ReviewerPool> {
    const result = await request(`${poolPath(eventId, roundId)}/grants`, parsePool, {
      method: "POST",
      body: JSON.stringify({ reviewerId, maxAssignments }),
    });
    if (
      result === null ||
      result.organizationId !== organizationId.trim() ||
      result.eventId !== eventId.trim() ||
      result.roundId !== roundId.trim()
    ) {
      throw new TypeError(
        "The reviewer grant response is not scoped to the requested organization, event, and round.",
      );
    }
    return result;
  }

  async function revokeReviewerGrant(
    eventId: string,
    roundId: string,
    reviewerId: string,
    expectedVersion?: number,
  ): Promise<ReviewerPool> {
    const query =
      expectedVersion === undefined
        ? ""
        : `?expectedVersion=${encodeURIComponent(String(expectedVersion))}`;
    const result = await request(
      `${poolPath(eventId, roundId)}/grants/${pathSegment(reviewerId, "reviewer ID")}${query}`,
      parsePool,
      { method: "DELETE" },
    );
    if (
      result === null ||
      result.organizationId !== organizationId.trim() ||
      result.eventId !== eventId.trim() ||
      result.roundId !== roundId.trim()
    ) {
      throw new TypeError(
        "The reviewer grant response is not scoped to the requested organization, event, and round.",
      );
    }
    return result;
  }

  async function reserveReviewerAssignment(
    eventId: string,
    roundId: string,
    reviewerId: string,
  ): Promise<ReviewerPoolGrant> {
    return request(
      `${poolPath(eventId, roundId)}/assignments/${pathSegment(reviewerId, "reviewer ID")}/reserve`,
      (value) => {
        if (!isRecord(value)) throw new TypeError("The reviewer assignment response is invalid.");
        return {
          reviewerId: requiredString(value.reviewerId, "reviewerId"),
          maxAssignments: requiredInteger(value.maxAssignments, "maxAssignments", 1),
          assignedCount: requiredInteger(value.assignedCount, "assignedCount"),
        };
      },
      { method: "POST" },
    );
  }

  return {
    listMembers,
    inviteMember,
    activateMember,
    updateMemberRole,
    revokeMember,
    getReviewerPool,
    setReviewerPool,
    grantReviewer,
    revokeReviewerGrant,
    reserveReviewerAssignment,
    list: listMembers,
    updateRole: updateMemberRole,
    revoke: revokeMember,
    getPool: getReviewerPool,
    setPool: setReviewerPool,
  };
}

export const createOrganizationMemberApi = createMemberApi;
export const createOrganizationMembersApi = createMemberApi;
export const createMembersApi = createMemberApi;
