import { describe, expect, it } from "vitest";
import {
  type AgendaCatalog,
  type AgendaClock,
  AgendaEngine,
  type AgendaEntryInput,
  type AgendaError,
  type AgendaIdGenerator,
  type AgendaTimeZoneError,
  AgendaValidationError,
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

function createEngine(): AgendaEngine {
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
    expect(outbox).toHaveLength(4);
    expect(new Set(outbox.map((event) => event.idempotencyKey))).toHaveLength(4);
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
    expect(await engine.getOutbox("event-1")).toHaveLength(12);
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
