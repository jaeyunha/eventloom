import { describe, expect, it } from "vitest";
import { EventInvitationService } from "./service";
import type {
  EventInvitationActor,
  EventRoleInvitation,
  EventRoleInvitationRepository,
} from "./types";

const now = "2026-08-16T12:00:00.000Z";

const recipient: EventInvitationActor = {
  kind: "user",
  userId: "account-1",
  email: "recipient@example.test",
  emailVerified: true,
};

const anotherRecipient: EventInvitationActor = {
  kind: "user",
  userId: "account-2",
  email: "other@example.test",
  emailVerified: true,
};

function invitation(overrides: Partial<EventRoleInvitation> = {}): EventRoleInvitation {
  return {
    id: "invitation-reviewer",
    organizationId: "organization/research",
    organizationName: "Open Research Network",
    eventId: "event/review",
    eventName: "Research Exchange 2027",
    role: "reviewer",
    recipientUserId: recipient.userId,
    recipientEmail: recipient.email,
    participantId: null,
    status: "pending",
    version: 3,
    createdBy: "organizer-1",
    createdAt: now,
    updatedAt: now,
    acceptedAt: null,
    declinedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

class TestEventRoleInvitationRepository implements EventRoleInvitationRepository {
  readonly #records = new Map<string, EventRoleInvitation>();

  constructor(records: readonly EventRoleInvitation[]) {
    for (const record of records) this.#records.set(record.id, structuredClone(record));
  }

  async listForRecipient(userId: string): Promise<readonly EventRoleInvitation[]> {
    return [...this.#records.values()]
      .filter((record) => record.recipientUserId === userId)
      .map((record) => structuredClone(record));
  }

  async getById(invitationId: string): Promise<EventRoleInvitation | null> {
    const record = this.#records.get(invitationId);
    return record === undefined ? null : structuredClone(record);
  }

  async save(next: EventRoleInvitation, expectedVersion: number): Promise<EventRoleInvitation> {
    const current = this.#records.get(next.id);
    if (current === undefined || current.version !== expectedVersion) {
      const error = new Error("The invitation version is stale.");
      error.name = "EventRoleInvitationConflictError";
      throw error;
    }
    const saved = structuredClone(next);
    this.#records.set(saved.id, saved);
    return structuredClone(saved);
  }
}

function fixture(records: readonly EventRoleInvitation[]) {
  const repository = new TestEventRoleInvitationRepository(records);
  const service = new EventInvitationService(repository, {
    clock: () => new Date(now),
  });
  return { repository, service };
}

describe("event invitation account service", () => {
  it("lists only pending and accepted invitations bound to the verified account", async () => {
    const pending = invitation();
    const accepted = invitation({
      id: "invitation-speaker",
      eventId: "event/speaker",
      eventName: "Human-Centered Summit",
      role: "speaker",
      participantId: "participant-1",
      status: "accepted",
      version: 5,
      acceptedAt: now,
    });
    const declined = invitation({ id: "invitation-declined", status: "declined" });
    const revoked = invitation({ id: "invitation-revoked", status: "revoked" });
    const other = invitation({
      id: "invitation-other",
      recipientUserId: anotherRecipient.userId,
      recipientEmail: anotherRecipient.email,
    });
    const { service } = fixture([pending, accepted, declined, revoked, other]);

    await expect(service.list(recipient)).resolves.toEqual([
      {
        invitationId: pending.id,
        role: "reviewer",
        status: "pending",
        version: 3,
        organizationId: "organization/research",
        organizationName: "Open Research Network",
        eventId: "event/review",
        eventName: "Research Exchange 2027",
        workspaceHref: null,
      },
      {
        invitationId: accepted.id,
        role: "speaker",
        status: "accepted",
        version: 5,
        organizationId: "organization/research",
        organizationName: "Open Research Network",
        eventId: "event/speaker",
        eventName: "Human-Centered Summit",
        workspaceHref: "/portal?event=event%2Fspeaker",
      },
    ]);
  });

  it("keeps accepted invitations visible by account after the verified email changes", async () => {
    const accepted = invitation({ status: "accepted", version: 4, acceptedAt: now });
    const { service } = fixture([accepted]);

    await expect(
      service.list({ ...recipient, email: "recipient-new@example.test" }),
    ).resolves.toEqual([
      expect.objectContaining({
        invitationId: accepted.id,
        status: "accepted",
        workspaceHref: "/review?eventId=event%2Freview",
      }),
    ]);
  });

  it("returns exact event destinations after reviewer and speaker acceptance", async () => {
    const reviewer = invitation();
    const speaker = invitation({
      id: "invitation-speaker",
      eventId: "event/speaker",
      eventName: "Human-Centered Summit",
      role: "speaker",
      participantId: "participant-1",
    });
    const { service } = fixture([reviewer, speaker]);

    await expect(
      service.accept(recipient, {
        invitationId: reviewer.id,
        expectedVersion: reviewer.version,
      }),
    ).resolves.toMatchObject({
      invitationId: reviewer.id,
      status: "accepted",
      version: 4,
      workspaceHref: "/review?eventId=event%2Freview",
    });
    await expect(
      service.accept(recipient, {
        invitationId: speaker.id,
        expectedVersion: speaker.version,
      }),
    ).resolves.toMatchObject({
      invitationId: speaker.id,
      status: "accepted",
      version: 4,
      workspaceHref: "/portal?event=event%2Fspeaker",
    });
  });

  it("accepts idempotently for the same account without another version increment", async () => {
    const accepted = invitation({ status: "accepted", version: 4, acceptedAt: now });
    const { service } = fixture([accepted]);

    const first = await service.accept(recipient, {
      invitationId: accepted.id,
      expectedVersion: accepted.version,
    });
    const replay = await service.accept(recipient, {
      invitationId: accepted.id,
      expectedVersion: accepted.version,
    });

    expect(first).toEqual(replay);
    expect(replay).toMatchObject({ status: "accepted", version: 4 });
  });

  it("returns the same generic not-found for a missing invitation and another recipient's invitation", async () => {
    const other = invitation({
      recipientUserId: anotherRecipient.userId,
      recipientEmail: anotherRecipient.email,
    });
    const { service } = fixture([other]);

    for (const invitationId of ["missing-invitation", other.id]) {
      await expect(
        service.accept(recipient, { invitationId, expectedVersion: other.version }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        status: 404,
        message: "The event invitation was not found.",
      });
    }
  });

  it("rejects a stale version without changing the invitation", async () => {
    const pending = invitation();
    const { service } = fixture([pending]);

    await expect(
      service.accept(recipient, {
        invitationId: pending.id,
        expectedVersion: pending.version - 1,
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409 });
    await expect(service.list(recipient)).resolves.toEqual([
      expect.objectContaining({
        invitationId: pending.id,
        status: "pending",
        version: pending.version,
      }),
    ]);
  });

  it("declines with only invitation identity and version and never exposes a workspace", async () => {
    const pending = invitation();
    const { service } = fixture([pending]);

    await expect(
      service.decline(recipient, {
        invitationId: pending.id,
        expectedVersion: pending.version,
      }),
    ).resolves.toMatchObject({
      invitationId: pending.id,
      status: "declined",
      version: 4,
      workspaceHref: null,
    });
    await expect(service.list(recipient)).resolves.toEqual([]);
  });

  it("requires a verified user actor", async () => {
    const { service } = fixture([invitation()]);

    await expect(service.list({ ...recipient, emailVerified: false })).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
  });
});
