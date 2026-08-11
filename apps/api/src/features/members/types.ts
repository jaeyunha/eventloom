export const memberRoles = ["owner", "admin", "reviewer"] as const;
export type MemberRole = (typeof memberRoles)[number];

export const memberStatuses = ["pending", "active"] as const;
export type MemberStatus = (typeof memberStatuses)[number];

/** The only actor accepted by member-management operations. */
export interface MemberActor {
  readonly kind: "user";
  readonly organizationId: string;
  readonly userId: string;
  readonly role: MemberRole;
}

/** D1 identity state joined to one organization membership. */
export interface Member {
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

export interface MemberUser {
  readonly userId: string;
  readonly email: string;
  readonly name: string | null;
  readonly emailVerified: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MemberMembership {
  readonly organizationId: string;
  readonly userId: string;
  readonly role: MemberRole;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Invitation metadata is safe to persist in D1. It intentionally has no token or URL field. */
export type MemberInvitationStatus = "pending" | "delivered" | "accepted" | "revoked";

export interface MemberInvitation {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly email: string;
  readonly name: string | null;
  readonly role: MemberRole;
  readonly idempotencyKey: string;
  readonly status: MemberInvitationStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt: string;
  readonly deliveredAt: string | null;
  readonly acceptedAt: string | null;
}

export interface InviteMemberInput {
  readonly organizationId: string;
  readonly email: string;
  readonly name?: string | null;
  readonly role: MemberRole;
  readonly idempotencyKey: string;
}

export interface InviteMemberResult {
  readonly member: Member;
  readonly invitation: MemberInvitation | null;
  readonly created: boolean;
}

export interface ActivateMemberInput {
  readonly organizationId: string;
  readonly token: string;
  readonly name?: string | null;
  readonly password: string;
}

export interface ActivateMemberResult {
  readonly member: Member;
  readonly invitation: MemberInvitation;
}

export interface UpdateMemberRoleInput {
  readonly organizationId: string;
  readonly userId: string;
  readonly role: MemberRole;
}

export interface RevokeMemberInput {
  readonly organizationId: string;
  readonly userId: string;
}

export interface ReviewerPoolGrant {
  readonly reviewerId: string;
  readonly maxAssignments: number;
  readonly assignedCount: number;
}

/** Airtable/evaluation business state, keyed by all three tenant dimensions. */
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
  readonly maxAssignments?: number;
}

export interface SetReviewerPoolInput {
  readonly organizationId: string;
  readonly eventId: string;
  readonly roundId: string;
  readonly reviewerIds?: readonly string[];
  readonly reviewers?: readonly ReviewerPoolGrantInput[];
  readonly maxAssignmentsPerReviewer?: number;
  readonly expectedVersion?: number;
}

export interface GrantReviewerInput {
  readonly organizationId: string;
  readonly eventId: string;
  readonly roundId: string;
  readonly reviewerId: string;
  readonly maxAssignments: number;
}

export interface RevokeReviewerGrantInput {
  readonly organizationId: string;
  readonly eventId: string;
  readonly roundId: string;
  readonly reviewerId: string;
  readonly expectedVersion?: number;
}

export interface ReserveReviewerAssignmentInput {
  readonly organizationId: string;
  readonly eventId: string;
  readonly roundId: string;
  readonly reviewerId: string;
}

export interface SetupLinkIssueInput {
  readonly invitationId: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly email: string;
  readonly expiresAt: Date;
}

export interface SetupLinkClaim {
  readonly invitationId: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly email: string;
  readonly tokenDigest: string;
  readonly expiresAt: Date;
}

/** Better Auth owns setup-token state, password establishment, and session invalidation. */
export interface MemberAuthBoundary {
  issueSetupLink(input: SetupLinkIssueInput): Promise<{ setupUrl: string; expiresAt: Date }>;
  consumeSetupLink(tokenOrUrl: string, organizationId: string): Promise<SetupLinkClaim | null>;
  finalizeSetupLink(claim: SetupLinkClaim): Promise<boolean>;
  establishPassword(userId: string, password: string): Promise<void>;
  revokeSessions(userId: string): Promise<void>;
}

/** The API hands delivery a complete one-time URL; no email provider is coupled here. */
export interface MemberInvitationDelivery {
  sendMemberInvitation(input: {
    readonly invitationId: string;
    readonly organizationId: string;
    readonly userId: string;
    readonly email: string;
    readonly name: string | null;
    readonly role: MemberRole;
    readonly setupUrl: string;
    readonly expiresAt: string;
  }): Promise<void>;
}

/** D1-owned identity, membership, and invitation boundary. */
export interface MemberIdentityRepository {
  listMembers(organizationId: string): Promise<readonly Member[]>;
  getMember(organizationId: string, userId: string): Promise<Member | null>;
  findMemberByEmail(organizationId: string, email: string): Promise<Member | null>;
  findUserByEmail(email: string): Promise<MemberUser | null>;
  createUser(input: {
    readonly userId: string;
    readonly email: string;
    readonly name: string | null;
    readonly emailVerified: boolean;
    readonly createdAt: string;
    readonly updatedAt: string;
  }): Promise<MemberUser>;
  createMembership(input: MemberMembership): Promise<void>;
  updateMembershipRole(
    organizationId: string,
    userId: string,
    role: MemberRole,
    updatedAt: string,
  ): Promise<void>;
  removeMembership(organizationId: string, userId: string): Promise<void>;
  countOwners(organizationId: string): Promise<number>;
  findInvitationByIdempotencyKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<MemberInvitation | null>;
  findPendingInvitation(organizationId: string, email: string): Promise<MemberInvitation | null>;
  listPendingInvitations(organizationId: string): Promise<readonly MemberInvitation[]>;
  revokePendingInvitations(
    organizationId: string,
    email: string,
    revokedAt: string,
  ): Promise<readonly MemberInvitation[]>;
  getInvitation(invitationId: string): Promise<MemberInvitation | null>;
  createInvitation(input: MemberInvitation): Promise<void>;
  markInvitationDelivered(invitationId: string, deliveredAt: string): Promise<MemberInvitation>;
  claimInvitationActivation(
    invitationId: string,
    activationDigest: string,
    acceptedAt: string,
  ): Promise<MemberInvitation>;
  activateUser(userId: string, name: string | null, updatedAt: string): Promise<MemberUser>;
}

/** Airtable/evaluation-owned event-round reviewer pool boundary. */
export interface ReviewerPoolRepository {
  getReviewerPool(
    organizationId: string,
    eventId: string,
    roundId: string,
  ): Promise<ReviewerPool | null>;
  saveReviewerPool(pool: ReviewerPool, expectedVersion: number | null): Promise<void>;
}

export interface MemberRepositorySeed {
  readonly users?: readonly MemberUser[];
  readonly memberships?: readonly MemberMembership[];
  readonly invitations?: readonly MemberInvitation[];
  readonly pools?: readonly ReviewerPool[];
}

/** Stored setup state deliberately contains only a digest, never a raw token. */
export interface StoredSetupLink {
  readonly invitationId: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly email: string;
  readonly tokenDigest: string;
  readonly expiresAt: string;
  readonly usedAt: string | null;
}

export type MemberServiceErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "LAST_OWNER"
  | "INVITATION_INVALID"
  | "INVITATION_EXPIRED"
  | "REVIEWER_NOT_ACTIVE"
  | "ASSIGNMENT_CAP_REACHED";

/** Kept as a named error contract so routes and callers can map failures without string matching. */
export class MemberServiceError extends Error {
  readonly code: MemberServiceErrorCode;
  readonly status: 400 | 403 | 404 | 409;
  readonly details?: unknown;

  constructor(
    code: MemberServiceErrorCode,
    status: 400 | 403 | 404 | 409,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "MemberServiceError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
