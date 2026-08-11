import { describe, expect, it } from "vitest";
import {
  acceleventsPublicationPreviewSchema,
  agendaVersionIdSchema,
  apiErrorResponseSchema,
  calendarInvitationPayloadSchema,
  eventIdSchema,
  eventRoleSchema,
  openSendSenderSchema,
  paginatedResponseSchema,
  paginationRequestSchema,
  reviewScoreSchema,
  rubricCriterionIdSchema,
  scheduledSessionSchema,
  submissionIdSchema,
  taskStatusSchema,
  updateSubmissionDraftRequestSchema,
  webhookSignatureHeadersSchema,
} from "../index";

const ulid = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const id = (prefix: string) => `${prefix}_${ulid}`;
const now = "2026-08-08T18:00:00.000Z";
const later = "2026-08-08T19:00:00.000Z";

const participant = (position: number) => ({
  role: position === 0 ? "primary_speaker" : "co_speaker",
  firstName: `Speaker ${position}`,
  lastName: "Example",
  email: `speaker-${position}@example.com`,
});

describe("stable IDs and common API contracts", () => {
  it("accepts only the application ID namespace for each entity", () => {
    expect(eventIdSchema.parse(id("evt"))).toBe(id("evt"));
    expect(() => eventIdSchema.parse(id("sub"))).toThrow();
    expect(() => eventIdSchema.parse("recAirtableIdentifier")).toThrow();
    expect(submissionIdSchema.parse(id("sub"))).toBe(id("sub"));
  });

  it("keeps roles and error codes closed to documented values", () => {
    expect(eventRoleSchema.parse("secondary_contact")).toBe("secondary_contact");
    expect(() => eventRoleSchema.parse("super_admin")).toThrow();

    expect(() =>
      apiErrorResponseSchema.parse({
        error: {
          code: "ARBITRARY_ERROR",
          message: "Nope",
          traceId: "65f8d9b5-6862-4bbc-973c-f728e9185c22",
        },
      }),
    ).toThrow();
  });

  it("applies bounded pagination defaults and validates response cursors", () => {
    expect(paginationRequestSchema.parse({})).toEqual({ limit: 25, direction: "asc" });
    expect(() => paginationRequestSchema.parse({ limit: 101 })).toThrow();

    const responseSchema = paginatedResponseSchema(eventIdSchema);
    expect(
      responseSchema.parse({
        data: [id("evt")],
        page: { nextCursor: "next-page", hasMore: true },
      }).page.hasMore,
    ).toBe(true);
  });
});

describe("submission and task lifecycles", () => {
  it("enforces the fifteen-speaker submission limit", () => {
    expect(
      updateSubmissionDraftRequestSchema.parse({
        expectedVersion: 1,
        idempotencyKey: "save-draft-0001",
        step: "participants",
        participants: Array.from({ length: 15 }, (_, index) => participant(index)),
      }).participants,
    ).toHaveLength(15);

    expect(() =>
      updateSubmissionDraftRequestSchema.parse({
        expectedVersion: 1,
        idempotencyKey: "save-draft-0002",
        step: "participants",
        participants: Array.from({ length: 16 }, (_, index) => participant(index)),
      }),
    ).toThrow();
  });

  it("exposes the complete audited speaker-task state vocabulary", () => {
    for (const status of [
      "not_started",
      "in_progress",
      "submitted",
      "needs_changes",
      "completed",
      "waived",
      "overdue",
      "reopened",
    ]) {
      expect(taskStatusSchema.parse(status)).toBe(status);
    }
    expect(() => taskStatusSchema.parse("done")).toThrow();
  });
});

describe("review authority", () => {
  it("never counts an AI-prefilled score before a human confirms or edits it", () => {
    const unconfirmed = {
      criterionId: id("rub"),
      score: 4,
      source: "ai_prefill",
      counted: true,
      humanConfirmation: null,
    };
    expect(() => reviewScoreSchema.parse(unconfirmed)).toThrow(
      "A counted score requires human confirmation",
    );

    expect(
      reviewScoreSchema.parse({
        ...unconfirmed,
        humanConfirmation: {
          confirmedBy: id("usr"),
          confirmedAt: now,
          action: "edited",
        },
      }).counted,
    ).toBe(true);
    expect(rubricCriterionIdSchema.parse(id("rub"))).toBe(id("rub"));
  });
});

describe("agenda and integration boundaries", () => {
  const scheduledSession = {
    sessionId: id("ses"),
    roomId: id("rom"),
    trackId: id("trk"),
    participantIds: [id("par")],
    startsAt: { instant: now, timeZone: "America/Los_Angeles" },
    endsAt: { instant: later, timeZone: "America/Los_Angeles" },
    capacity: 100,
  };

  it("rejects inverted session instants and mismatched event timezones", () => {
    expect(scheduledSessionSchema.parse(scheduledSession).sessionId).toBe(id("ses"));
    expect(() =>
      scheduledSessionSchema.parse({
        ...scheduledSession,
        startsAt: { instant: later, timeZone: "America/Los_Angeles" },
        endsAt: { instant: now, timeZone: "America/New_York" },
      }),
    ).toThrow();
  });
  it("locks integration sender and organizer identities to sessionboard", () => {
    const senders = [
      "auth@sessionboard.namuh.co",
      "speakers@sessionboard.namuh.co",
      "calendar@sessionboard.namuh.co",
    ] as const;
    expect(senders.map((sender) => openSendSenderSchema.parse(sender))).toEqual(senders);
    for (const sender of [
      "auth@foreverbrowsing.com",
      "speakers@foreverbrowsing.com",
      "calendar@foreverbrowsing.com",
    ]) {
      expect(() => openSendSenderSchema.parse(sender)).toThrow();
    }

    const invitation = calendarInvitationPayloadSchema.parse({
      method: "REQUEST",
      uid: "session.uid@calendar.sessionboard.namuh.co",
      sequence: 0,
      timeZone: "America/Los_Angeles",
      startsAt: now,
      endsAt: later,
      organizer: "calendar@sessionboard.namuh.co",
      attendees: ["speaker@example.com"],
      summary: "Session",
      location: "Room 1",
      idempotencyKey: "calendar-0001",
    });
    expect(invitation.organizer).toBe("calendar@sessionboard.namuh.co");
    expect(() =>
      calendarInvitationPayloadSchema.parse({
        ...invitation,
        organizer: "calendar@foreverbrowsing.com",
      }),
    ).toThrow();
  });
  it("validates signed webhook headers as a closed transport contract", () => {
    expect(
      webhookSignatureHeadersSchema.parse({
        "webhook-id": id("whd"),
        "webhook-timestamp": "1786212000",
        "webhook-signature": "v1,c2lnbmF0dXJl",
      })["webhook-id"],
    ).toBe(id("whd"));
    expect(() =>
      webhookSignatureHeadersSchema.parse({
        "webhook-id": id("whd"),
        "webhook-timestamp": "today",
        "webhook-signature": "unsigned",
      }),
    ).toThrow();
  });

  it("keeps Accelevents previews tied to immutable agenda and application IDs", () => {
    const preview = acceleventsPublicationPreviewSchema.parse({
      publicationId: id("pub"),
      eventId: id("evt"),
      agendaRevisionId: id("agv"),
      speakers: [
        {
          externalId: id("par"),
          email: "speaker@example.com",
          firstName: "Speaker",
          lastName: "Example",
          biography: "Biography",
          company: null,
          jobTitle: null,
          headshotUrl: null,
        },
      ],
      sessions: [
        {
          externalId: id("ses"),
          title: "A durable contract",
          description: "Description",
          startsAt: now,
          endsAt: later,
          timeZone: "America/Los_Angeles",
          location: "Conference Center",
          room: "Main stage",
          track: "Engineering",
          tags: ["contracts"],
          speakerExternalIds: [id("par")],
        },
      ],
      mappings: [{ sourceField: "biography", destinationField: "bio", required: false }],
      validationErrors: [],
      snapshotHash: "a".repeat(64),
      createdAt: now,
    });

    expect(preview.agendaRevisionId).toBe(agendaVersionIdSchema.parse(id("agv")));
  });
});
