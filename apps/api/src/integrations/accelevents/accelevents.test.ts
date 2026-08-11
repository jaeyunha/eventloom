import {
  agendaVersionIdSchema,
  eventIdSchema,
  integrationPublicationIdSchema,
  participantIdSchema,
  sessionIdSchema,
} from "@open-sessionboard/contracts";
import { describe, expect, it } from "vitest";
import {
  type AcceleventsClock,
  type AcceleventsProgramSource,
  AcceleventsProviderError,
  AcceleventsPublicationService,
  FakeAcceleventsProvider,
  HmacAcceleventsConfirmationTokens,
  InMemoryAcceleventsPublicationLock,
  InMemoryAcceleventsStateRepository,
  mapAcceptedProgram,
} from "./index";

const EVENT_ID = eventIdSchema.parse(stableId("evt", "0"));
const AGENDA_REVISION_ID = agendaVersionIdSchema.parse(stableId("agv", "0"));
const PUBLICATION_ID = integrationPublicationIdSchema.parse(stableId("pub", "0"));
const SECOND_PUBLICATION_ID = integrationPublicationIdSchema.parse(stableId("pub", "1"));
const SPEAKER_ONE_ID = participantIdSchema.parse(stableId("par", "1"));
const SPEAKER_TWO_ID = participantIdSchema.parse(stableId("par", "2"));
const DECLINED_SPEAKER_ID = participantIdSchema.parse(stableId("par", "3"));
const EXTRA_SPEAKER_ID = participantIdSchema.parse(stableId("par", "4"));
const SESSION_ID = sessionIdSchema.parse(stableId("ses", "1"));
const EXTRA_SESSION_ID = sessionIdSchema.parse(stableId("ses", "2"));

function stableId(prefix: string, finalCharacter: string): string {
  return `${prefix}_${"0".repeat(25)}${finalCharacter}`;
}

function programSource(): AcceleventsProgramSource {
  return {
    eventId: EVENT_ID,
    agendaRevisionId: AGENDA_REVISION_ID,
    speakers: [
      {
        participantId: SPEAKER_TWO_ID,
        decision: "accepted",
        email: "GRACE@example.com ",
        firstName: " Grace ",
        lastName: " Hopper ",
        biography: " Compiler pioneer ",
        company: " Navy ",
        jobTitle: " Rear Admiral ",
        headshotUrl: " https://example.com/grace.jpg ",
      },
      {
        participantId: SPEAKER_ONE_ID,
        decision: "accepted",
        email: "ada@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
        biography: "Computing pioneer",
        company: null,
        jobTitle: "Mathematician",
        headshotUrl: null,
      },
      {
        participantId: DECLINED_SPEAKER_ID,
        decision: "declined",
        email: "declined@example.com",
        firstName: "Not",
        lastName: "Published",
        biography: "",
        company: null,
        jobTitle: null,
        headshotUrl: null,
      },
    ],
    sessions: [
      {
        sessionId: SESSION_ID,
        decision: "accepted",
        title: " Computing Then and Now ",
        description: " A conversation without trailing provider markup. ",
        startsAt: "2026-11-01T16:00:00.000Z",
        endsAt: "2026-11-01T17:00:00.000Z",
        timeZone: "America/New_York",
        location: " Main venue ",
        room: " Hall A ",
        track: " Engineering ",
        tags: ["history", " engineering ", "history"],
        speakerParticipantIds: [SPEAKER_TWO_ID, SPEAKER_ONE_ID, SPEAKER_TWO_ID],
      },
      {
        sessionId: EXTRA_SESSION_ID,
        decision: "waitlisted",
        title: "Not accepted",
        description: "",
        startsAt: "2026-11-01T18:00:00.000Z",
        endsAt: "2026-11-01T19:00:00.000Z",
        timeZone: "America/New_York",
        location: null,
        room: "Hall B",
        track: null,
        tags: [],
        speakerParticipantIds: [DECLINED_SPEAKER_ID],
      },
    ],
  };
}

function createFixture() {
  const provider = new FakeAcceleventsProvider();
  const repository = new InMemoryAcceleventsStateRepository();
  const clock = new IncrementingClock();
  const service = new AcceleventsPublicationService({
    provider,
    repository,
    confirmationTokens: new HmacAcceleventsConfirmationTokens(
      "test-confirmation-secret-with-at-least-thirty-two-bytes",
    ),
    lock: new InMemoryAcceleventsPublicationLock(),
    clock,
  });
  return { provider, repository, service };
}

class IncrementingClock implements AcceleventsClock {
  private tick = 0;

  now(): Date {
    const result = new Date(Date.UTC(2026, 7, 8, 18, 0, this.tick));
    this.tick += 1;
    return result;
  }
}

describe("Accelevents publication", () => {
  it("maps only accepted program records and produces deterministic previews and diffs", async () => {
    const { provider, service } = createFixture();
    const desired = mapAcceptedProgram(programSource());
    const desiredSpeaker = desired.speakers[0];
    if (!desiredSpeaker) {
      throw new Error("Expected an accepted speaker in the fixture.");
    }
    provider.seed(EVENT_ID, {
      speakers: [{ ...desiredSpeaker, biography: "Older biography" }],
      sessions: [...desired.sessions],
    });

    const first = await service.preview({ publicationId: PUBLICATION_ID, source: programSource() });
    const shuffledSource = programSource();
    const second = await service.preview({
      publicationId: SECOND_PUBLICATION_ID,
      source: {
        ...shuffledSource,
        speakers: [...shuffledSource.speakers].reverse(),
        sessions: shuffledSource.sessions.map((session) => ({
          ...session,
          tags: [...session.tags].reverse(),
          speakerParticipantIds: [...session.speakerParticipantIds].reverse(),
        })),
      },
    });

    expect(first.snapshotHash).toBe(second.snapshotHash);
    expect(first.speakers.map(({ externalId }) => externalId)).toEqual([
      SPEAKER_ONE_ID,
      SPEAKER_TWO_ID,
    ]);
    expect(first.sessions).toHaveLength(1);
    expect(first.sessions[0]?.tags).toEqual(["engineering", "history"]);
    expect(first.diff).toEqual({
      records: [
        { kind: "session", externalId: SESSION_ID, operation: "unchanged", changedFields: [] },
        {
          kind: "speaker",
          externalId: SPEAKER_ONE_ID,
          operation: "update",
          changedFields: ["biography"],
        },
        { kind: "speaker", externalId: SPEAKER_TWO_ID, operation: "create", changedFields: [] },
      ],
      summary: { create: 1, unchanged: 1, update: 1 },
    });
    expect(first.mappings.map(({ destinationField }) => destinationField)).toContain(
      "session.speakerExternalIds",
    );
    expect(provider.writes).toEqual([]);
  });

  it("requires the current explicit confirmation token before any outbound write", async () => {
    const { provider, service } = createFixture();
    const preview = await service.preview({
      publicationId: PUBLICATION_ID,
      source: programSource(),
    });

    await expect(
      service.publish({
        publicationId: PUBLICATION_ID,
        snapshotHash: preview.snapshotHash,
        confirmationToken: "accelevents-confirm-v1.invalid",
        idempotencyKey: "publish-confirmation-test",
      }),
    ).rejects.toMatchObject({ code: "CONFIRMATION_REQUIRED" });
    expect(provider.writes).toEqual([]);
  });

  it("serializes concurrent requests and returns the same idempotent publication receipt", async () => {
    const { provider, repository, service } = createFixture();
    const preview = await service.preview({
      publicationId: PUBLICATION_ID,
      source: programSource(),
    });
    const request = {
      publicationId: PUBLICATION_ID,
      snapshotHash: preview.snapshotHash,
      confirmationToken: preview.confirmationToken,
      idempotencyKey: "publish-idempotently-001",
    } as const;

    const [first, second] = await Promise.all([service.publish(request), service.publish(request)]);
    const replay = await service.publish(request);

    expect(second).toEqual(first);
    expect(replay).toEqual(first);
    expect(first.status).toBe("succeeded");
    expect(first.results.map(({ kind, externalId }) => `${kind}:${externalId}`)).toEqual([
      `session:${SESSION_ID}`,
      `speaker:${SPEAKER_ONE_ID}`,
      `speaker:${SPEAKER_TWO_ID}`,
    ]);
    expect(provider.writes).toHaveLength(3);
    expect(await repository.listAttempts(PUBLICATION_ID)).toHaveLength(1);
  });

  it("preserves failure evidence and safely retries only records still out of sync", async () => {
    const { provider, repository, service } = createFixture();
    const source = programSource();
    const originalSource = structuredClone(source);
    const preview = await service.preview({ publicationId: PUBLICATION_ID, source });
    provider.failNext(
      "speaker",
      SPEAKER_ONE_ID,
      new AcceleventsProviderError("RATE_LIMITED", "Provider rate limit exceeded.", {
        retryable: true,
      }),
    );

    const failed = await service.publish({
      publicationId: PUBLICATION_ID,
      snapshotHash: preview.snapshotHash,
      confirmationToken: preview.confirmationToken,
      idempotencyKey: "publish-attempt-001",
    });
    const retried = await service.retry(
      PUBLICATION_ID,
      preview.confirmationToken,
      "publish-attempt-002",
    );

    expect(failed.status).toBe("partially_failed");
    expect(failed.errors).toEqual([
      {
        externalId: SPEAKER_ONE_ID,
        code: "RATE_LIMITED",
        message: "Provider rate limit exceeded.",
        retryable: true,
      },
      {
        externalId: SESSION_ID,
        code: "DEPENDENCY_FAILED",
        message: `Session was not published because new speakers failed: ${SPEAKER_ONE_ID}.`,
        retryable: true,
      },
    ]);
    expect(retried.status).toBe("succeeded");
    expect(retried.attempt).toBe(2);
    expect(retried.results.map(({ externalId }) => externalId)).toEqual([
      SESSION_ID,
      SPEAKER_ONE_ID,
    ]);
    expect(provider.writes).toHaveLength(3);
    expect(source).toEqual(originalSource);
    expect((await repository.getPreview(PUBLICATION_ID))?.snapshotHash).toBe(preview.snapshotHash);
    expect(await repository.listAttempts(PUBLICATION_ID)).toHaveLength(2);
    expect((await service.reconcile(PUBLICATION_ID)).inSync).toBe(true);
  });

  it("blocks invalid mapped records and reports reconciliation drift without deleting provider data", async () => {
    const invalidFixture = createFixture();
    const invalidSource = programSource();
    const invalidPreview = await invalidFixture.service.preview({
      publicationId: PUBLICATION_ID,
      source: {
        ...invalidSource,
        speakers: invalidSource.speakers.map((speaker) =>
          speaker.participantId === SPEAKER_ONE_ID
            ? { ...speaker, email: "not-an-email" }
            : speaker,
        ),
      },
    });
    expect(invalidPreview.validationErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ externalId: SPEAKER_ONE_ID, code: "INVALID_SPEAKER" }),
      ]),
    );
    await expect(
      invalidFixture.service.publish({
        publicationId: PUBLICATION_ID,
        snapshotHash: invalidPreview.snapshotHash,
        confirmationToken: invalidPreview.confirmationToken,
        idempotencyKey: "invalid-publication-001",
      }),
    ).rejects.toMatchObject({ code: "PREVIEW_INVALID" });
    expect(invalidFixture.provider.writes).toEqual([]);

    const { provider, service } = createFixture();
    const desired = mapAcceptedProgram(programSource());
    const preview = await service.preview({
      publicationId: PUBLICATION_ID,
      source: programSource(),
    });
    const desiredSpeakerOne = desired.speakers[0];
    const desiredSpeakerTwo = desired.speakers[1];
    const desiredSession = desired.sessions[0];
    if (!desiredSpeakerOne || !desiredSpeakerTwo || !desiredSession) {
      throw new Error("Expected accepted records in the fixture.");
    }
    provider.seed(EVENT_ID, {
      speakers: [
        { ...desiredSpeakerOne, biography: "Provider drift" },
        desiredSpeakerTwo,
        { ...desiredSpeakerOne, externalId: EXTRA_SPEAKER_ID, email: "extra@example.com" },
      ],
      sessions: [
        ...desired.sessions,
        { ...desiredSession, externalId: EXTRA_SESSION_ID, title: "Provider-only session" },
      ],
    });

    const reconciliation = await service.reconcile(PUBLICATION_ID);
    expect(reconciliation.inSync).toBe(false);
    expect(reconciliation.diff.records).toContainEqual({
      kind: "speaker",
      externalId: SPEAKER_ONE_ID,
      operation: "update",
      changedFields: ["biography"],
    });
    expect(reconciliation.unexpectedSpeakerExternalIds).toEqual([EXTRA_SPEAKER_ID]);
    expect(reconciliation.unexpectedSessionExternalIds).toEqual([EXTRA_SESSION_ID]);
    expect(reconciliation.snapshotHash).toBe(preview.snapshotHash);
    expect(provider.writes).toEqual([]);
  });
});
