export const eventRoleInvitationRoles = ["reviewer", "speaker"] as const;
export type EventRoleInvitationRole = (typeof eventRoleInvitationRoles)[number];
export const eventRoleInvitationStatuses = ["pending", "accepted", "declined", "revoked"] as const;
export type EventRoleInvitationStatus = (typeof eventRoleInvitationStatuses)[number];
export type EventRoleInvitationActorType = "user" | "system";

export interface EventInvitationActor {
  readonly kind: "user";
  readonly userId: string;
  readonly email: string;
  readonly emailVerified: boolean;
}

export interface EventRoleInvitation {
  readonly id: string;
  readonly organizationId: string;
  readonly organizationName: string | null;
  readonly eventId: string;
  readonly eventName: string;
  readonly role: EventRoleInvitationRole;
  readonly recipientUserId: string;
  /** Immutable invitation-time email snapshot; only pending actions require it to remain current. */
  readonly recipientEmail: string;
  /** Persistence-facing alias of recipientEmail. */
  readonly normalizedEmail?: string;
  readonly participantId: string | null;
  readonly status: EventRoleInvitationStatus;
  readonly version: number;
  readonly createdBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly acceptedAt: string | null;
  readonly declinedAt: string | null;
  readonly revokedAt: string | null;
  readonly creationIdempotencyKey?: string;
  readonly invitedByActorType?: EventRoleInvitationActorType;
  readonly invitedByActorId?: string | null;
  readonly invitedAt?: string;
  readonly acceptedByUserId?: string | null;
  readonly declinedByUserId?: string | null;
  readonly revokedByActorType?: EventRoleInvitationActorType | null;
  readonly revokedByActorId?: string | null;
}

export interface EventInvitationView {
  readonly invitationId: string;
  readonly role: EventRoleInvitationRole;
  readonly status: EventRoleInvitationStatus;
  readonly version: number;
  readonly organizationId: string;
  readonly organizationName: string | null;
  readonly eventId: string;
  readonly eventName: string;
  readonly workspaceHref: string | null;
}

export interface CreateEventRoleInvitationInput {
  readonly id: string;
  readonly organizationId: string;
  readonly eventId: string;
  readonly role: EventRoleInvitationRole;
  readonly recipientUserId: string;
  readonly normalizedEmail: string;
  readonly participantId?: string | null;
  readonly creationIdempotencyKey: string;
  readonly invitedByActorType: EventRoleInvitationActorType;
  readonly invitedByActorId?: string | null;
  readonly invitedAt: string;
}

export interface EventRoleInvitationTransitionInput {
  readonly invitationId: string;
  readonly recipientUserId: string;
  readonly normalizedEmail: string;
  readonly expectedVersion: number;
  readonly occurredAt: string;
}

export interface ReconcileEventRoleInvitationsInput {
  readonly recipientUserId: string;
  readonly normalizedEmail: string;
  readonly occurredAt: string;
}

export interface RevokeReviewerInvitationsInput {
  readonly organizationId: string;
  readonly recipientUserId: string;
  readonly revokedByActorType: EventRoleInvitationActorType;
  readonly revokedByActorId?: string | null;
  readonly occurredAt: string;
}

export interface RevokeEventReviewerInvitationInput extends RevokeReviewerInvitationsInput {
  readonly eventId: string;
  readonly excludedRoundId: string;
}

export class EventRoleInvitationRepositoryConflictError extends Error {
  constructor(message = "The event invitation changed.") {
    super(message);
    this.name = "EventRoleInvitationRepositoryConflictError";
  }
}

/**
 * The modern methods are used by D1. The small get/save surface remains supported so focused
 * domain tests and non-D1 adapters can keep persistence mechanics outside the service.
 */
export interface EventRoleInvitationRepository {
  create?(input: CreateEventRoleInvitationInput): Promise<EventRoleInvitation>;
  reconcileForVerifiedAccount?(input: ReconcileEventRoleInvitationsInput): Promise<void>;
  listForVerifiedAccount?(
    recipientUserId: string,
    normalizedEmail: string,
  ): Promise<readonly EventRoleInvitation[]>;
  findForVerifiedAccount?(
    invitationId: string,
    recipientUserId: string,
    normalizedEmail: string,
  ): Promise<EventRoleInvitation | null>;
  accept?(input: EventRoleInvitationTransitionInput): Promise<EventRoleInvitation | null>;
  decline?(input: EventRoleInvitationTransitionInput): Promise<EventRoleInvitation | null>;
  listAcceptedReviewerEventIds?(
    organizationId: string,
    recipientUserId: string,
  ): Promise<readonly string[]>;
  revokeReviewerInvitationsForOrganizationUser?(
    input: RevokeReviewerInvitationsInput,
  ): Promise<number>;
  revokeEventReviewerInvitationIfNoPoolGrantsRemain?(
    input: RevokeEventReviewerInvitationInput,
  ): Promise<boolean>;
  listForRecipient?(recipientUserId: string): Promise<readonly EventRoleInvitation[]>;
  getById?(invitationId: string): Promise<EventRoleInvitation | null>;
  save?(invitation: EventRoleInvitation, expectedVersion: number): Promise<EventRoleInvitation>;
}

export interface EventRoleInvitationServiceOptions {
  readonly clock?: () => Date;
}

export interface InvitationMutationInput {
  readonly invitationId: string;
  readonly expectedVersion: number;
}
