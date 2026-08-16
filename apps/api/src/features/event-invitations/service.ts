import {
  type EventInvitationActor,
  type EventInvitationView,
  type EventRoleInvitation,
  type EventRoleInvitationRepository,
  EventRoleInvitationRepositoryConflictError,
  type EventRoleInvitationServiceOptions,
  type InvitationMutationInput,
} from "./types";

export type EventRoleInvitationServiceErrorCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "VERSION_CONFLICT";

export class EventRoleInvitationServiceError extends Error {
  readonly status: 400 | 403 | 404 | 409;
  constructor(
    readonly code: EventRoleInvitationServiceErrorCode,
    status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "EventRoleInvitationServiceError";
    this.status = status;
  }
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function verifiedActor(actor: EventInvitationActor): EventInvitationActor {
  if (actor.kind !== "user" || !actor.emailVerified || normalizeEmail(actor.email).length === 0) {
    throw new EventRoleInvitationServiceError(
      "FORBIDDEN",
      403,
      "A verified user account is required.",
    );
  }
  return { ...actor, email: normalizeEmail(actor.email) };
}

function validateMutation(input: InvitationMutationInput): void {
  if (input.invitationId.trim().length === 0) {
    throw new EventRoleInvitationServiceError("VALIDATION_ERROR", 400, "invitationId is required.");
  }
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new EventRoleInvitationServiceError(
      "VALIDATION_ERROR",
      400,
      "expectedVersion must be a positive integer.",
    );
  }
}

function notFound(): EventRoleInvitationServiceError {
  return new EventRoleInvitationServiceError(
    "NOT_FOUND",
    404,
    "The event invitation was not found.",
  );
}

function versionConflict(): EventRoleInvitationServiceError {
  return new EventRoleInvitationServiceError(
    "VERSION_CONFLICT",
    409,
    "The event invitation changed. Reload it before continuing.",
  );
}

function matchesActor(invitation: EventRoleInvitation, actor: EventInvitationActor): boolean {
  return (
    invitation.recipientUserId === actor.userId &&
    (invitation.status === "accepted" ||
      normalizeEmail(invitation.normalizedEmail ?? invitation.recipientEmail) === actor.email)
  );
}

function view(invitation: EventRoleInvitation): EventInvitationView {
  const workspaceHref =
    invitation.status !== "accepted"
      ? null
      : invitation.role === "reviewer"
        ? `/review?eventId=${encodeURIComponent(invitation.eventId)}`
        : `/portal?event=${encodeURIComponent(invitation.eventId)}`;
  return {
    invitationId: invitation.id,
    role: invitation.role,
    status: invitation.status,
    version: invitation.version,
    organizationId: invitation.organizationId,
    organizationName: invitation.organizationName,
    eventId: invitation.eventId,
    eventName: invitation.eventName,
    workspaceHref,
  };
}

function repositoryConflict(error: unknown): boolean {
  return (
    error instanceof EventRoleInvitationRepositoryConflictError ||
    (error instanceof Error &&
      (error.name === "EventRoleInvitationConflictError" ||
        error.name === "EventRoleInvitationRepositoryConflictError"))
  );
}

export class EventInvitationService {
  readonly #clock: () => Date;

  constructor(
    private readonly repository: EventRoleInvitationRepository,
    options: EventRoleInvitationServiceOptions = {},
  ) {
    this.#clock = options.clock ?? (() => new Date());
  }

  async list(actorInput: EventInvitationActor): Promise<readonly EventInvitationView[]> {
    const actor = verifiedActor(actorInput);
    await this.repository.reconcileForVerifiedAccount?.({
      recipientUserId: actor.userId,
      normalizedEmail: actor.email,
      occurredAt: this.#clock().toISOString(),
    });
    const records = this.repository.listForVerifiedAccount
      ? await this.repository.listForVerifiedAccount(actor.userId, actor.email)
      : await this.repository.listForRecipient?.(actor.userId);
    if (records === undefined) throw new Error("The invitation repository cannot list records.");
    return records
      .filter(
        (invitation) =>
          matchesActor(invitation, actor) &&
          (invitation.status === "pending" || invitation.status === "accepted"),
      )
      .sort((left, right) => {
        const leftAt = left.invitedAt ?? left.createdAt;
        const rightAt = right.invitedAt ?? right.createdAt;
        return leftAt === rightAt ? left.id.localeCompare(right.id) : leftAt.localeCompare(rightAt);
      })
      .map(view);
  }

  async accept(
    actor: EventInvitationActor,
    input: InvitationMutationInput,
  ): Promise<EventInvitationView> {
    return this.transition(actor, input, "accepted");
  }

  async decline(
    actor: EventInvitationActor,
    input: InvitationMutationInput,
  ): Promise<EventInvitationView> {
    return this.transition(actor, input, "declined");
  }

  async listAcceptedReviewerEventIds(
    organizationId: string,
    actorInput: EventInvitationActor,
  ): Promise<readonly string[]> {
    const actor = verifiedActor(actorInput);
    if (this.repository.listAcceptedReviewerEventIds) {
      return this.repository.listAcceptedReviewerEventIds(organizationId, actor.userId);
    }
    const records = await this.list(actor);
    return records
      .filter(
        (record) =>
          record.organizationId === organizationId &&
          record.role === "reviewer" &&
          record.status === "accepted",
      )
      .map((record) => record.eventId);
  }

  private async transition(
    actorInput: EventInvitationActor,
    input: InvitationMutationInput,
    status: "accepted" | "declined",
  ): Promise<EventInvitationView> {
    validateMutation(input);
    const actor = verifiedActor(actorInput);
    const current = this.repository.findForVerifiedAccount
      ? await this.repository.findForVerifiedAccount(input.invitationId, actor.userId, actor.email)
      : await this.repository.getById?.(input.invitationId);
    if (current === undefined || current === null || !matchesActor(current, actor)) {
      throw notFound();
    }
    if (status === "accepted" && current.status === "accepted") return view(current);
    if (current.status !== "pending") throw notFound();
    if (current.version !== input.expectedVersion) throw versionConflict();

    try {
      let updated: EventRoleInvitation | null | undefined;
      const modernTransition =
        status === "accepted" ? this.repository.accept : this.repository.decline;
      if (modernTransition !== undefined) {
        updated = await modernTransition.call(this.repository, {
          invitationId: current.id,
          recipientUserId: actor.userId,
          normalizedEmail: actor.email,
          expectedVersion: input.expectedVersion,
          occurredAt: this.#clock().toISOString(),
        });
      } else if (this.repository.save !== undefined) {
        const occurredAt = this.#clock().toISOString();
        updated = await this.repository.save(
          {
            ...current,
            status,
            version: current.version + 1,
            updatedAt: occurredAt,
            ...(status === "accepted" ? { acceptedAt: occurredAt } : { declinedAt: occurredAt }),
          },
          input.expectedVersion,
        );
      } else {
        throw new Error("The invitation repository cannot transition records.");
      }
      if (updated !== null && updated !== undefined) return view(updated);
    } catch (error) {
      if (!repositoryConflict(error)) throw error;
    }

    const latest = this.repository.findForVerifiedAccount
      ? await this.repository.findForVerifiedAccount(input.invitationId, actor.userId, actor.email)
      : await this.repository.getById?.(input.invitationId);
    if (
      status === "accepted" &&
      latest !== undefined &&
      latest !== null &&
      matchesActor(latest, actor) &&
      latest.status === "accepted"
    ) {
      return view(latest);
    }
    throw versionConflict();
  }
}

export { EventInvitationService as EventRoleInvitationService };
