import { describe, expect, it } from "vitest";
import {
  type AgendaCatalog,
  type AgendaClock,
  AgendaEngine,
  type AgendaEntryInput,
  type AgendaError,
  type AgendaIdGenerator,
  type AgendaSuggestionProvider,
  type AgendaTimeZoneError,
  AgendaValidationError,
  DeterministicAgendaSuggestionProvider,
  InMemoryAgendaMutationLock,
  InMemoryAgendaRepository,
  resolveLocalDateTime,
} from "./index";

const catalog: AgendaCatalog = {
  sessions: [
    {
      id: "session-1",
      title: "Opening",
      status: "accepted",
      participantIds: ["speaker-1"],
      resourceIds: ["projector-1"],
      capacityRequired: 120,
    },
    {
      id: "session-2",
      title: "Panel",
      status: "accepted",
      participantIds: ["speaker-2"],
      resourceIds: [],
      capacityRequired: 40,
    },
    {
      id: "session-3",
      title: "Deep dive",
      status: "accepted",
      participantIds: ["speaker-1"],
      resourceIds: ["projector-1"],
      capacityRequired: 30,
    },
  ],
  rooms: [
    { id: "room-small", name: "Small room", capacity: 100 },
    { id: "room-large", name: "Large room", capacity: 200 },
  ],
  tracks: [
    { id: "track-a", name: "Track A" },
    { id: "track-b", name: "Track B" },
  ],
};

function entry(
  id: string,
  sessionId: string,
  roomId: string,
  startsAtLocal: string,
  endsAtLocal: string,
  trackIds: readonly string[] = [],
): AgendaEntryInput {
  return { id, sessionId, roomId, startsAtLocal, endsAtLocal, trackIds };
}

function createEngine(provider?: AgendaSuggestionProvider): AgendaEngine {
  let nextId = 0;
  const clock: AgendaClock = { now: () => new Date("2026-08-08T18:00:00.000Z") };
  const idGenerator: AgendaIdGenerator = {
    nextId: (prefix) => {
      nextId += 1;
      return `${prefix}-${nextId}`;
    },
  };
  return new AgendaEngine(new InMemoryAgendaRepository(), new InMemoryAgendaMutationLock(), {
    clock,
    idGenerator,
    ...(provider === undefined ? {} : { suggestionProvider: provider }),
  });
}

async function initialize(engine: AgendaEngine): Promise<void> {
  await engine.createAgenda({
    eventId: "event-1",
    timeZone: "America/Los_Angeles",
    minimumTravelMinutes: 15,
    actorId: "organizer-1",
    ...catalog,
  });
}

function suggestionInput(baseDraftVersion = 1) {
  return {
    eventId: "event-1",
    actorId: "organizer-1",
    baseDraftVersion,
    dates: ["2026-08-10"],
    eligibleStatuses: ["accepted"],
    rooms: ["room-large"],
    dayWindows: [{ date: "2026-08-10", startLocal: "09:00", endLocal: "17:00" }],
    orderedRules: ["avoid hard conflicts", "prefer larger rooms"],
    ignoreExistingTimes: false,
    ignoreExistingRooms: false,
  } as const;
}

describe("agenda time zones", () => {
  it("rejects nonexistent DST wall times and requires fall-back disambiguation", () => {
    expect(() => resolveLocalDateTime("2026-03-08T02:30", "America/Los_Angeles")).toThrowError(
      expect.objectContaining<Partial<AgendaTimeZoneError>>({ code: "NONEXISTENT_LOCAL_TIME" }),
    );
    expect(() => resolveLocalDateTime("2026-11-01T01:30", "America/Los_Angeles")).toThrowError(
      expect.objectContaining<Partial<AgendaTimeZoneError>>({ code: "AMBIGUOUS_LOCAL_TIME" }),
    );

    const earlier = resolveLocalDateTime("2026-11-01T01:30", "America/Los_Angeles", "earlier");
    const later = resolveLocalDateTime("2026-11-01T01:30", "America/Los_Angeles", "later");
    expect(Date.parse(later.instant) - Date.parse(earlier.instant)).toBe(60 * 60 * 1000);
  });
});

describe("agenda validation", () => {
  it("detects room, participant, and resource overlaps as hard blockers", async () => {
    const engine = createEngine();
    await initialize(engine);

    const report = await engine.validateEntries("event-1", [
      entry("entry-1", "session-1", "room-small", "2026-08-10T09:00", "2026-08-10T10:00"),
      entry("entry-2", "session-2", "room-small", "2026-08-10T09:30", "2026-08-10T10:30"),
      entry("entry-3", "session-3", "room-large", "2026-08-10T09:15", "2026-08-10T09:45"),
    ]);

    expect(new Set(report.conflicts.map((conflict) => conflict.kind))).toEqual(
      new Set(["room", "participant", "resource"]),
    );
    await expect(
      engine.updateDraft({
        eventId: "event-1",
        expectedVersion: 1,
        actorId: "organizer-1",
        entries: [
          entry("entry-1", "session-1", "room-small", "2026-08-10T09:00", "2026-08-10T10:00"),
          entry("entry-2", "session-2", "room-small", "2026-08-10T09:30", "2026-08-10T10:30"),
        ],
      }),
    ).rejects.toBeInstanceOf(AgendaValidationError);
  });

  it("reports track, capacity, and travel constraints as overridable warnings", async () => {
    const engine = createEngine();
    await initialize(engine);

    const trackReport = await engine.validateEntries("event-1", [
      entry("entry-1", "session-1", "room-small", "2026-08-10T09:00", "2026-08-10T10:00", [
        "track-a",
      ]),
      entry("entry-2", "session-2", "room-large", "2026-08-10T09:30", "2026-08-10T10:30", [
        "track-a",
      ]),
    ]);
    const travelReport = await engine.validateEntries("event-1", [
      entry("entry-1", "session-1", "room-small", "2026-08-10T09:00", "2026-08-10T10:00"),
      entry("entry-3", "session-3", "room-large", "2026-08-10T10:05", "2026-08-10T11:00"),
    ]);

    expect(new Set(trackReport.warnings.map((warning) => warning.kind))).toEqual(
      new Set(["capacity", "track"]),
    );
    expect(new Set(travelReport.warnings.map((warning) => warning.kind))).toEqual(
      new Set(["capacity", "travel"]),
    );
    expect(trackReport.conflicts).toEqual([]);
    expect(travelReport.conflicts).toEqual([]);
  });
  it("requires reasoned warning overrides before atomic publication", async () => {
    const engine = createEngine();
    await initialize(engine);
    const draft = await engine.updateDraft({
      eventId: "event-1",
      expectedVersion: 1,
      actorId: "organizer-1",
      entries: [
        entry("entry-1", "session-1", "room-small", "2026-08-10T09:00", "2026-08-10T10:00"),
      ],
    });

    expect(await engine.getPublishedAgenda("event-1")).toBeNull();
    const preview = await engine.preview("event-1");
    expect(preview.validation.warnings.map((warning) => warning.kind)).toEqual(["capacity"]);
    await expect(
      engine.publish({
        eventId: "event-1",
        expectedVersion: draft.version,
        actorId: "organizer-1",
      }),
    ).rejects.toBeInstanceOf(AgendaValidationError);

    const overridden = await engine.overrideWarning({
      eventId: "event-1",
      expectedVersion: draft.version,
      warningId: preview.validation.warnings[0]?.id ?? "missing",
      reason: "Overflow room is reserved and audited",
      actorId: "organizer-1",
    });
    const revision = await engine.publish({
      eventId: "event-1",
      expectedVersion: overridden.version,
      actorId: "organizer-1",
    });
    const retry = await engine.publish({
      eventId: "event-1",
      expectedVersion: overridden.version,
      actorId: "organizer-1",
    });

    expect(retry.id).toBe(revision.id);
    expect(revision.revisionNumber).toBe(1);
    expect(await engine.getPublishedAgenda("event-1")).toEqual(revision);
    const outbox = await engine.getOutbox("event-1");
    expect(outbox).toHaveLength(3);
    expect(new Set(outbox.map((event) => event.idempotencyKey))).toHaveLength(3);
    expect((await engine.getAudit("event-1")).map((audit) => audit.action)).toContain(
      "warning.overridden",
    );
  });
});

describe("agenda concurrency and revisions", () => {
  it("serializes concurrent mutations and rejects the stale draft version", async () => {
    const engine = createEngine();
    await initialize(engine);

    const updates = await Promise.allSettled([
      engine.updateDraft({
        eventId: "event-1",
        expectedVersion: 1,
        actorId: "organizer-1",
        entries: [
          entry("entry-2", "session-2", "room-large", "2026-08-10T09:00", "2026-08-10T10:00"),
        ],
      }),
      engine.updateDraft({
        eventId: "event-1",
        expectedVersion: 1,
        actorId: "organizer-2",
        entries: [
          entry("entry-3", "session-3", "room-large", "2026-08-10T11:00", "2026-08-10T12:00"),
        ],
      }),
    ]);

    expect(updates.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejection = updates.find((result) => result.status === "rejected");
    expect(rejection).toEqual(
      expect.objectContaining({
        reason: expect.objectContaining<Partial<AgendaError>>({
          code: "CONCURRENT_MODIFICATION",
        }),
      }),
    );
    expect((await engine.getDraft("event-1")).version).toBe(2);
  });

  it("publishes immutable revisions and rolls back through a corrective revision", async () => {
    const engine = createEngine();
    await initialize(engine);
    const firstDraft = await engine.updateDraft({
      eventId: "event-1",
      expectedVersion: 1,
      actorId: "organizer-1",
      entries: [
        entry("entry-2", "session-2", "room-large", "2026-08-10T09:00", "2026-08-10T10:00"),
      ],
    });
    const first = await engine.publish({
      eventId: "event-1",
      expectedVersion: firstDraft.version,
      actorId: "organizer-1",
    });
    const secondDraft = await engine.updateDraft({
      eventId: "event-1",
      expectedVersion: firstDraft.version,
      actorId: "organizer-1",
      entries: [
        entry("entry-2", "session-2", "room-large", "2026-08-10T11:00", "2026-08-10T12:00"),
      ],
    });

    expect((await engine.getPublishedAgenda("event-1"))?.entries[0]?.startsAt).toBe(
      first.entries[0]?.startsAt,
    );
    const second = await engine.publish({
      eventId: "event-1",
      expectedVersion: secondDraft.version,
      actorId: "organizer-1",
    });
    const rollback = await engine.rollback({
      eventId: "event-1",
      expectedVersion: secondDraft.version,
      revisionId: first.id,
      actorId: "organizer-1",
    });

    expect(second.revisionNumber).toBe(2);
    expect(rollback.revisionNumber).toBe(3);
    expect(rollback.rollbackOfRevisionId).toBe(first.id);
    expect(rollback.entries).toEqual(first.entries);
    expect(await engine.getPublishedAgenda("event-1")).toEqual(rollback);
    expect(await engine.getOutbox("event-1")).toHaveLength(9);
  });

  it("executes a Durable Object lock contract one mutation at a time", async () => {
    const lock = new InMemoryAgendaMutationLock();
    let active = 0;
    let maximumActive = 0;
    const operation = async (): Promise<void> => {
      await lock.runExclusive("event-1", async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
      });
    };

    await Promise.all([operation(), operation(), operation()]);
    expect(maximumActive).toBe(1);
  });
});
describe("advisory agenda suggestions", () => {
  it("fails closed when no suggestion provider is injected", async () => {
    const engine = createEngine();
    await initialize(engine);

    await expect(engine.generateSuggestion(suggestionInput())).rejects.toMatchObject({
      code: "SUGGESTION_PROVIDER_UNAVAILABLE",
    });
    expect(await engine.getSuggestionRuns("event-1")).toEqual([]);
  });
  it("captures criteria and leaves the private draft unchanged during generation", async () => {
    const engine = createEngine(new DeterministicAgendaSuggestionProvider());
    await initialize(engine);
    const before = await engine.getDraft("event-1");

    const run = await engine.generateSuggestion(suggestionInput());
    const after = await engine.getDraft("event-1");

    expect(after).toEqual(before);
    expect(run.status).toBe("pending");
    expect(run.baseDraftVersion).toBe(before.version);
    expect(run.baseDraftRevision).toBe(before.version);
    expect(run.criteria.dates).toEqual(["2026-08-10"]);
    expect(run.criteria.eligibleStatuses).toEqual(["accepted"]);
    expect(run.criteria.roomIds).toEqual(["room-large"]);
    expect(run.criteria.dayWindows[0]).toEqual({
      date: "2026-08-10",
      startLocal: "09:00",
      endLocal: "17:00",
    });
    expect(run.criteria.orderedRules).toEqual(["avoid hard conflicts", "prefer larger rooms"]);
    expect(run.diff.summary).toContain("proposed agenda change");
  });

  it("rejects applying a run after its base draft revision becomes stale", async () => {
    const provider: AgendaSuggestionProvider = {
      suggest: () => ({
        placements: [
          {
            sessionId: "session-2",
            roomId: "room-large",
            startsAtLocal: "2026-08-10T09:00",
            endsAtLocal: "2026-08-10T10:00",
          },
        ],
      }),
    };
    const engine = createEngine(provider);
    await initialize(engine);
    const run = await engine.generateSuggestion(suggestionInput());

    const changedDraft = await engine.updateDraft({
      eventId: "event-1",
      expectedVersion: 1,
      actorId: "organizer-1",
      entries: [
        entry("entry-3", "session-3", "room-large", "2026-08-10T11:00", "2026-08-10T12:00"),
      ],
    });
    const changeId = run.diff.changes[0]?.id ?? "missing";

    await expect(
      engine.applySuggestion({
        eventId: "event-1",
        runId: run.id,
        actorId: "organizer-1",
        expectedDraftVersion: changedDraft.version,
        acceptedChangeIds: [changeId],
      }),
    ).rejects.toMatchObject({ code: "CONCURRENT_MODIFICATION" });
    expect((await engine.getDraft("event-1")).entries).toEqual(changedDraft.entries);
    expect((await engine.getSuggestion("event-1", run.id)).status).toBe("pending");
  });

  it("re-runs hard-conflict validation and never publishes while applying", async () => {
    const provider: AgendaSuggestionProvider = {
      suggest: () => ({
        placements: [
          {
            sessionId: "session-2",
            roomId: "room-small",
            startsAtLocal: "2026-08-10T09:30",
            endsAtLocal: "2026-08-10T10:30",
          },
        ],
      }),
    };
    const engine = createEngine(provider);
    await initialize(engine);
    const existing = await engine.updateDraft({
      eventId: "event-1",
      expectedVersion: 1,
      actorId: "organizer-1",
      entries: [
        entry("entry-1", "session-1", "room-small", "2026-08-10T09:00", "2026-08-10T10:00"),
      ],
    });
    const run = await engine.generateSuggestion({
      ...suggestionInput(existing.version),
      rooms: ["room-small"],
    });
    const changeId = run.diff.changes[0]?.id ?? "missing";

    await expect(
      engine.applySuggestion({
        eventId: "event-1",
        runId: run.id,
        actorId: "organizer-1",
        acceptedChangeIds: [changeId],
      }),
    ).rejects.toBeInstanceOf(AgendaValidationError);
    expect((await engine.getDraft("event-1")).entries).toEqual(existing.entries);
    expect(await engine.getPublishedAgenda("event-1")).toBeNull();
    expect(await engine.getOutbox("event-1")).toEqual([]);
  });

  it("applies only selected changes and records the human acceptance audit", async () => {
    const provider: AgendaSuggestionProvider = {
      suggest: () => ({
        placements: [
          {
            sessionId: "session-2",
            roomId: "room-large",
            startsAtLocal: "2026-08-10T09:00",
            endsAtLocal: "2026-08-10T10:00",
          },
          {
            sessionId: "session-3",
            roomId: "room-large",
            startsAtLocal: "2026-08-10T11:00",
            endsAtLocal: "2026-08-10T12:00",
          },
        ],
      }),
    };
    const engine = createEngine(provider);
    await initialize(engine);
    const run = await engine.generateSuggestion(suggestionInput());
    const selected = run.diff.changes.find((change) => change.sessionId === "session-2");
    const unselected = run.diff.changes.find((change) => change.sessionId === "session-3");
    expect(selected).toBeDefined();
    expect(unselected).toBeDefined();

    const draft = await engine.applySuggestion({
      eventId: "event-1",
      runId: run.id,
      actorId: "organizer-1",
      acceptedChangeIds: [selected?.id ?? "missing"],
    });

    expect(draft.entries.map((candidate) => candidate.sessionId)).toEqual(["session-2"]);
    const appliedRun = await engine.getSuggestion("event-1", run.id);
    expect(appliedRun.status).toBe("applied");
    expect(appliedRun.acceptedChangeIds).toEqual([selected?.id]);
    expect((await engine.getAudit("event-1")).at(-1)?.details).toMatchObject({
      runId: run.id,
      acceptedChangeIds: selected?.id,
    });
    expect(await engine.getPublishedAgenda("event-1")).toBeNull();
    expect(await engine.getOutbox("event-1")).toEqual([]);
  });

  it("regenerates a pending run as a new version and supersedes the prior run", async () => {
    let generation = 0;
    const provider: AgendaSuggestionProvider = {
      suggest: () => {
        generation += 1;
        const start = generation === 1 ? "09:00" : "10:00";
        return {
          placements: [
            {
              sessionId: "session-2",
              roomId: "room-large",
              startsAtLocal: `2026-08-10T${start}`,
              endsAtLocal: `2026-08-10T${generation === 1 ? "10:00" : "11:00"}`,
            },
          ],
        };
      },
    };
    const engine = createEngine(provider);
    await initialize(engine);
    const first = await engine.generateSuggestion(suggestionInput());
    const second = await engine.regenerateSuggestion({
      eventId: "event-1",
      runId: first.id,
      actorId: "organizer-1",
    });

    expect(generation).toBe(2);
    expect(second.version).toBe(first.version + 1);
    expect(second.regenerationOfRunId).toBe(first.id);
    expect((await engine.getSuggestion("event-1", first.id)).status).toBe("superseded");
    expect((await engine.getSuggestionRuns("event-1")).map((run) => run.version)).toEqual([1, 2]);
    expect(second.diff.summary).toContain("Add");
  });
});
