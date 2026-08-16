import {
  type CreateEventRoleInvitationInput,
  type EventRoleInvitation,
  type EventRoleInvitationRepository,
  EventRoleInvitationRepositoryConflictError,
  type EventRoleInvitationTransitionInput,
  type ReconcileEventRoleInvitationsInput,
  type RevokeEventReviewerInvitationInput,
  type RevokeReviewerInvitationsInput,
} from "./types";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

export class InMemoryEventRoleInvitationRepository implements EventRoleInvitationRepository {
  readonly #invitations = new Map<string, EventRoleInvitation>();

  constructor(seed: readonly EventRoleInvitation[] = []) {
    for (const invitation of seed) this.#invitations.set(invitation.id, clone(invitation));
  }

  seed(invitation: EventRoleInvitation): void {
    this.#invitations.set(invitation.id, clone(invitation));
  }

  async create(input: CreateEventRoleInvitationInput): Promise<EventRoleInvitation> {
    const replay = [...this.#invitations.values()].find(
      (candidate) =>
        candidate.organizationId === input.organizationId &&
        candidate.eventId === input.eventId &&
        candidate.creationIdempotencyKey === input.creationIdempotencyKey,
    );
    if (replay !== undefined) {
      if (
        replay.role !== input.role ||
        replay.recipientUserId !== input.recipientUserId ||
        replay.normalizedEmail !== normalized(input.normalizedEmail) ||
        replay.participantId !== (input.participantId ?? null)
      ) {
        throw new EventRoleInvitationRepositoryConflictError(
          "The invitation idempotency key is already bound to another recipient.",
        );
      }
      return clone(replay);
    }
    const live = [...this.#invitations.values()].find(
      (candidate) =>
        candidate.organizationId === input.organizationId &&
        candidate.eventId === input.eventId &&
        candidate.role === input.role &&
        candidate.recipientUserId === input.recipientUserId &&
        candidate.participantId === (input.participantId ?? null) &&
        (candidate.status === "pending" || candidate.status === "accepted"),
    );
    if (live !== undefined) {
      if (
        live.status === "accepted" ||
        live.normalizedEmail === normalized(input.normalizedEmail)
      ) {
        return clone(live);
      }
      throw new EventRoleInvitationRepositoryConflictError(
        "A live invitation is already bound to another recipient email.",
      );
    }
    const invitation: EventRoleInvitation = {
      id: input.id,
      organizationId: input.organizationId,
      organizationName: null,
      eventId: input.eventId,
      eventName: input.eventId,
      role: input.role,
      recipientUserId: input.recipientUserId,
      recipientEmail: normalized(input.normalizedEmail),
      normalizedEmail: normalized(input.normalizedEmail),
      participantId: input.participantId ?? null,
      status: "pending",
      creationIdempotencyKey: input.creationIdempotencyKey,
      invitedByActorType: input.invitedByActorType,
      invitedByActorId: input.invitedByActorId ?? null,
      invitedAt: input.invitedAt,
      createdBy: input.invitedByActorId ?? null,
      createdAt: input.invitedAt,
      acceptedByUserId: null,
      acceptedAt: null,
      declinedByUserId: null,
      declinedAt: null,
      revokedByActorType: null,
      revokedByActorId: null,
      revokedAt: null,
      version: 1,
      updatedAt: input.invitedAt,
    };
    this.#invitations.set(invitation.id, invitation);
    return clone(invitation);
  }

  async reconcileForVerifiedAccount(_input: ReconcileEventRoleInvitationsInput): Promise<void> {}

  async listForVerifiedAccount(
    recipientUserId: string,
    normalizedEmail: string,
  ): Promise<readonly EventRoleInvitation[]> {
    const email = normalized(normalizedEmail);
    return [...this.#invitations.values()]
      .filter(
        (invitation) =>
          invitation.recipientUserId === recipientUserId &&
          (invitation.status === "accepted" ||
            (invitation.status === "pending" && invitation.normalizedEmail === email)),
      )
      .sort((left, right) => {
        const leftAt = left.invitedAt ?? left.createdAt;
        const rightAt = right.invitedAt ?? right.createdAt;
        return leftAt === rightAt ? left.id.localeCompare(right.id) : leftAt.localeCompare(rightAt);
      })
      .map(clone);
  }

  async findForVerifiedAccount(
    invitationId: string,
    recipientUserId: string,
    normalizedEmail: string,
  ): Promise<EventRoleInvitation | null> {
    const invitation = this.#invitations.get(invitationId);
    return invitation !== undefined &&
      invitation.recipientUserId === recipientUserId &&
      (invitation.status === "accepted" ||
        invitation.normalizedEmail === normalized(normalizedEmail))
      ? clone(invitation)
      : null;
  }

  async accept(input: EventRoleInvitationTransitionInput): Promise<EventRoleInvitation | null> {
    return this.transition(input, "accepted");
  }

  async decline(input: EventRoleInvitationTransitionInput): Promise<EventRoleInvitation | null> {
    return this.transition(input, "declined");
  }

  async listAcceptedReviewerEventIds(
    organizationId: string,
    recipientUserId: string,
  ): Promise<readonly string[]> {
    return [
      ...new Set(
        [...this.#invitations.values()]
          .filter(
            (invitation) =>
              invitation.organizationId === organizationId &&
              invitation.recipientUserId === recipientUserId &&
              invitation.role === "reviewer" &&
              invitation.status === "accepted",
          )
          .map((invitation) => invitation.eventId),
      ),
    ].sort();
  }

  async revokeReviewerInvitationsForOrganizationUser(
    input: RevokeReviewerInvitationsInput,
  ): Promise<number> {
    return this.revokeReviewers(input, () => true);
  }

  async revokeEventReviewerInvitationIfNoPoolGrantsRemain(
    input: RevokeEventReviewerInvitationInput,
  ): Promise<boolean> {
    return (
      (await this.revokeReviewers(input, (invitation) => invitation.eventId === input.eventId)) > 0
    );
  }

  private async revokeReviewers(
    input: RevokeReviewerInvitationsInput,
    matchesScope: (invitation: EventRoleInvitation) => boolean,
  ): Promise<number> {
    let revoked = 0;
    for (const current of this.#invitations.values()) {
      if (
        current.organizationId !== input.organizationId ||
        current.recipientUserId !== input.recipientUserId ||
        current.role !== "reviewer" ||
        (current.status !== "pending" && current.status !== "accepted") ||
        !matchesScope(current)
      ) {
        continue;
      }
      this.#invitations.set(current.id, {
        ...current,
        status: "revoked",
        revokedByActorType: input.revokedByActorType,
        revokedByActorId: input.revokedByActorId ?? null,
        revokedAt: input.occurredAt,
        version: current.version + 1,
        updatedAt: input.occurredAt,
      });
      revoked += 1;
    }
    return revoked;
  }

  private async transition(
    input: EventRoleInvitationTransitionInput,
    status: "accepted" | "declined",
  ): Promise<EventRoleInvitation | null> {
    const current = this.#invitations.get(input.invitationId);
    if (
      current === undefined ||
      current.recipientUserId !== input.recipientUserId ||
      current.normalizedEmail !== normalized(input.normalizedEmail)
    ) {
      return null;
    }
    if (status === "accepted" && current.status === "accepted") return clone(current);
    if (current.status !== "pending" || current.version !== input.expectedVersion) {
      throw new EventRoleInvitationRepositoryConflictError();
    }
    const updated: EventRoleInvitation = {
      ...current,
      status,
      ...(status === "accepted"
        ? { acceptedByUserId: input.recipientUserId, acceptedAt: input.occurredAt }
        : { declinedByUserId: input.recipientUserId, declinedAt: input.occurredAt }),
      version: current.version + 1,
      updatedAt: input.occurredAt,
    };
    this.#invitations.set(updated.id, updated);
    return clone(updated);
  }
}
