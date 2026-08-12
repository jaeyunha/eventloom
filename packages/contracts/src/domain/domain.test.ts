import { describe, expect, it } from "vitest";
import {
  acceleventsPublicationPreviewSchema,
  aggregateReviewScoreSchema,
  agendaVersionIdSchema,
  apiErrorResponseSchema,
  assetFamilySchema,
  assetVersionSchema,
  speakerProfileSchema,
  casMutationSchema,
  calendarInvitationPayloadSchema,
  createTaskRequestSchema,
  eventIdSchema,
  evaluationPlanSchema,
  eventRoleSchema,
  mutationEnvelopeSchema,
  openSendSenderSchema,
  paginatedResponseSchema,
  paginationRequestSchema,
  participantGrantSchema,
  replaceReviewAssignmentRequestSchema,
  reviewAssignmentSchema,
  reviewScoreSchema,
  rubricCriterionIdSchema,
  scheduledSessionSchema,
  submissionIdSchema,
  speakerWorkspaceExpectedVersionSchema,
  submissionParticipantSchema,
  taskAssignmentMappingsSchema,
  taskSubjectSchema,
  taskStatusSchema,
  updateEvaluationPlanRequestSchema,
  updateSubmissionDraftRequestSchema,
  webhookSignatureHeadersSchema,
} from "../index";

const ulid = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const id = (prefix: string) => `${prefix}_${ulid}`;
const alternateId = (prefix: string) => `${prefix}_01ARZ3NDEKTSV4RRFFQ69G5FAW`;
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
describe("C0 contract gate invariants", () => {
  const organizationId = id("org");
  const eventId = id("evt");
  const participantId = id("par");
  const submissionId = id("sub");

  it("requires canonical participant scope, identity metadata, and exact grant anchors", () => {
    const record = submissionParticipantSchema.parse({
      id: participantId,
      organizationId,
      eventId,
      submissionId,
      profileId: null,
      crmContactId: id("crm"),
      role: "primary_speaker",
      firstName: "Speaker",
      lastName: "Example",
      normalizedEmail: "Speaker@Example.com",
      identityState: "resolved",
      sourceType: "cfp",
      sourceId: "cfp-row-1",
      claimedUserId: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    expect(record.normalizedEmail).toBe("speaker@example.com");
    expect(() =>
      submissionParticipantSchema.parse({
        ...record,
        userId: id("usr"),
      }),
    ).toThrow();

    expect(
      participantGrantSchema.parse({
        organizationId,
        eventId,
        participantId,
        userId: id("usr"),
        permissions: ["view_submission"],
        grantedAt: now,
        revokedAt: null,
      }),
    ).toMatchObject({ organizationId, eventId, participantId });
  });

  it("requires participant/session task subjects and rejects global assignee shapes", () => {
    expect(taskSubjectSchema.parse({ type: "participant", participantId })).toEqual({
      type: "participant",
      participantId,
    });
    expect(
      taskSubjectSchema.parse({ type: "session", participantId, submissionId }),
    ).toEqual({ type: "session", participantId, submissionId });
    expect(() =>
      taskSubjectSchema.parse({ type: "participant", participantId, submissionId: null }),
    ).toThrow();

    const request = {
      organizationId,
      eventId,
      title: "Upload slides",
      description: "Upload the final deck",
      type: "upload",
      assignments: [{ participantId, submissionId }],
      dueAt: null,
      dependencyIds: [],
      reminderTimes: [],
      expectedVersion: 1,
      idempotencyKey: "task-create-0001",
    };
    expect(createTaskRequestSchema.parse(request).assignments).toHaveLength(1);
    expect(() =>
      taskAssignmentMappingsSchema.parse([
        { participantId, submissionId },
        { participantId, submissionId },
      ]),
    ).toThrow();
    expect(() =>
      createTaskRequestSchema.parse({
        ...request,
        assigneeIds: [participantId],
        submissionId,
      }),
    ).toThrow();
  });

  it("returns an authoritative mutation envelope with operation state and revision", () => {
    expect(
      mutationEnvelopeSchema(submissionIdSchema).parse({
        data: submissionId,
        operation: { id: id("opr"), state: "completed", revision: 2 },
      }),
    ).toEqual({
      data: submissionId,
      operation: { id: id("opr"), state: "completed", revision: 2 },
    });
  });

  it("requires tenant-scoped compare-and-swap mutation metadata", () => {
    expect(
      casMutationSchema.parse({
        organizationId,
        eventId,
        expectedVersion: 3,
        idempotencyKey: "cas-mutation-0001",
      }),
    ).toMatchObject({ organizationId, eventId, expectedVersion: 3 });
    expect(() =>
      casMutationSchema.parse({
        organizationId,
        eventId,
        expectedVersion: 3,
        idempotencyKey: "cas-mutation-0002",
        version: 3,
      }),
    ).toThrow();
  });
  it("keeps roster and profile compare-and-swap versions separate", () => {
    expect(
      speakerWorkspaceExpectedVersionSchema.parse({
        expectedRosterVersion: 7,
        expectedProfileVersion: 3,
      }),
    ).toEqual({ expectedRosterVersion: 7, expectedProfileVersion: 3 });
    expect(() =>
      speakerWorkspaceExpectedVersionSchema.parse({
        expectedVersion: 7,
      }),
    ).toThrow();
    expect(() =>
      speakerWorkspaceExpectedVersionSchema.parse({
        expectedRosterVersion: 7,
      }),
    ).toThrow();
  });
  it("keeps asset version identity immutable and pointers explicit", () => {
    const versionId = id("asv");
    const family = assetFamilySchema.parse({
      id: id("asf"),
      organizationId,
      eventId,
      participantId,
      submissionId,
      taskId: id("tsk"),
      latestVersionId: versionId,
      currentVersionId: versionId,
      approvedVersionId: null,
      releasedVersionId: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    expect(family.latestVersionId).toBe(versionId);
    expect(
      speakerProfileSchema.parse({
        id: id("spk"),
        organizationId,
        eventId,
        participantId,
        biography: "A speaker",
        company: null,
        jobTitle: null,
        location: null,
        websiteUrl: null,
        socialUrl: null,
        headshotAssetId: id("ast"),
        version: 1,
        createdAt: now,
        updatedAt: now,
      }).headshotAssetId,
    ).toBe(id("ast"));
    expect(
      assetVersionSchema.parse({
        id: versionId,
        assetFamilyId: family.id,
        organizationId,
        eventId,
        participantId,
        submissionId,
        taskId: id("tsk"),
        version: 1,
        createdAt: now,
      }).assetFamilyId,
    ).toBe(family.id);
  });

  it("retains superseded assignment lineage and versioned aggregates", () => {
    const oldAssignment = reviewAssignmentSchema.parse({
      id: id("ras"),
      organizationId,
      eventId,
      planId: id("evp"),
      planVersion: 3,
      roundId: id("rnd"),
      roundVersion: 2,
      submissionId,
      reviewerId: id("usr"),
      status: "superseded",
      version: 4,
      predecessorAssignmentId: null,
      successorAssignmentId: alternateId("ras"),
      supersededReason: "Reviewer unavailable",
      supersededAt: now,
      assignedAt: now,
      startedAt: null,
      submittedAt: null,
    });
    expect(oldAssignment.status).toBe("superseded");
    expect(() =>
      replaceReviewAssignmentRequestSchema.parse({
        organizationId,
        eventId,
        oldAssignmentId: oldAssignment.id,
        replacementReviewerId: id("usr"),
        expectedVersion: 4,
        reason: "",
        idempotencyKey: "replace-review-0001",
      }),
    ).toThrow();
    expect(
      replaceReviewAssignmentRequestSchema.parse({
        organizationId,
        eventId,
        oldAssignmentId: oldAssignment.id,
        replacementReviewerId: id("usr"),
        expectedVersion: 4,
        reason: "Reviewer unavailable",
        idempotencyKey: "replace-review-0002",
      }).oldAssignmentId,
    ).toBe(oldAssignment.id);

    expect(
      aggregateReviewScoreSchema.parse({
        organizationId,
        eventId,
        planId: id("evp"),
        planVersion: 3,
        submissionId,
        roundId: id("rnd"),
        roundVersion: 2,
        weightedScore: 4.5,
        countedReviewCount: 2,
        abstentionCount: 0,
        calculatedAt: now,
      }),
    ).toMatchObject({ planVersion: 3, roundVersion: 2 });
  });

  it("freezes grading and round configuration when a plan opens", () => {
    const round = {
      id: id("rnd"),
      organizationId,
      planId: id("evp"),
      eventId,
      name: "Round one",
      sequence: 1,
      opensAt: now,
      closesAt: later,
      blindReview: true,
      rubric: [
        {
          id: id("rub"),
          label: "Quality",
          description: "Overall proposal quality",
          minimumScore: 1,
          maximumScore: 5,
          weight: 1,
          required: true,
        },
      ],
      version: 2,
    };
    expect(
      evaluationPlanSchema.parse({
        id: id("evp"),
        organizationId,
        eventId,
        name: "Main review",
        status: "active",
        rounds: [round],
        frozenGradingVersion: 3,
        frozenRoundsVersion: 2,
        frozenBy: id("usr"),
        frozenAt: now,
        version: 4,
        createdAt: now,
        updatedAt: now,
      }),
    ).toMatchObject({
      status: "active",
      frozenGradingVersion: 3,
      frozenRoundsVersion: 2,
    });
    expect(() =>
      evaluationPlanSchema.parse({
        id: id("evp"),
        organizationId,
        eventId,
        name: "Main review",
        status: "active",
        rounds: [round],
        frozenGradingVersion: null,
        frozenRoundsVersion: null,
        frozenBy: null,
        frozenAt: null,
        version: 4,
        createdAt: now,
        updatedAt: now,
      }),
    ).toThrow("An opened evaluation plan requires frozen grading and round versions");
    expect(() =>
      updateEvaluationPlanRequestSchema.parse({
        organizationId,
        eventId,
        status: "active",
        rounds: [round],
        expectedVersion: 1,
        idempotencyKey: "plan-update-0001",
      }),
    ).toThrow("Evaluation grading and round configuration may only change while draft");
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
