import { describe, expect, it, vi } from "vitest";

import { AgendaRepositoryConflictError } from "../../../features/agenda/infrastructure";
import type { AgendaState, AgendaSuggestionRun } from "../../../features/agenda/types";
import { D1AgendaRepository } from "./agenda";

function statement(query: string, agendaState: Record<string, unknown> | null = null) {
  const bound = { query, values: [] as unknown[] };
  return {
    bind(...values: unknown[]) {
      bound.values = values;
      return this;
    },
    async all() {
      return { results: [] };
    },
    async first() {
      if (query.includes("SELECT * FROM agenda_states")) return agendaState;
      if (query.includes("SELECT starts_at,ends_at,time_zone,schedule_dates_json FROM events")) {
        return {
          starts_at: "2026-08-13T00:00:00.000Z",
          ends_at: "2026-08-14T23:59:00.000Z",
          time_zone: "UTC",
          schedule_dates_json: "[]",
        };
      }
      return null;
    },
    async run() {
      return { meta: { changes: 0 } };
    },
    bound,
  };
}

function database(agendaState: Record<string, unknown> | null = null) {
  const statements: ReturnType<typeof statement>[] = [];
  const batch = vi.fn(async (items: readonly ReturnType<typeof statement>[]) =>
    items.map(() => ({ meta: { changes: 1 } })),
  );
  return {
    prepare(query: string) {
      const prepared = statement(query, agendaState);
      statements.push(prepared);
      return prepared;
    },
    batch,
    statements,
  } as unknown as D1Database & {
    statements: ReturnType<typeof statement>[];
    batch: ReturnType<typeof vi.fn>;
  };
}

function agendaState(stateVersion: number, updatedAt: string, updatedBy: string): AgendaState {
  return {
    eventId: "event-1",
    stateVersion,
    timeZone: "UTC",
    minimumTravelMinutes: 0,
    sessions: [],
    rooms: [],
    tracks: [],
    draft: {
      eventId: "event-1",
      version: stateVersion,
      timeZone: "UTC",
      entries: [],
      warningOverrides: [],
      updatedAt,
      updatedBy,
    },
    revisions: [],
    currentPublishedRevisionId: null,
    outbox: [],
    audit: [],
    suggestionRuns: [],
  };
}
function suggestionRun(id: string): AgendaSuggestionRun {
  const criteria = {
    dates: ["2026-08-13"],
    eligibleStatuses: ["accepted"],
    roomIds: [],
    rooms: [],
    dayWindows: [],
    orderedRules: [],
    ignoreExistingTimes: false,
    ignoreExistingRooms: false,
    ignoreExistingSchedule: { times: false, rooms: false },
  } as const;
  return {
    id,
    eventId: "event-1",
    version: 1,
    status: "pending",
    baseDraftVersion: 1,
    baseDraftRevision: 1,
    baseEntries: [],
    criteria,
    criteriaSnapshot: criteria,
    placements: [],
    proposedEntries: [],
    diff: {
      summary: "No agenda changes were proposed.",
      description: "No agenda changes were proposed.",
      changes: [],
      addedEntryIds: [],
      removedEntryIds: [],
      changedEntryIds: [],
    },
    candidateDiagnostics: { conflicts: [], warnings: [] },
    generatedAt: "2026-08-13T12:00:00.000Z",
    generatedBy: "organizer-1",
    regenerationOfRunId: null,
    acceptedChangeIds: [],
    appliedChangeIds: [],
  };
}

function findStatement(
  db: ReturnType<typeof database>,
  fragment: string,
): ReturnType<typeof statement> | undefined {
  return db.statements.find((item) => item.bound.query.includes(fragment));
}

describe("D1 agenda repository commands", () => {
  it("persists the draft timestamp supplied by a new agenda state", async () => {
    const db = database();
    const repository = new D1AgendaRepository(db, "org-1");
    vi.spyOn(repository, "load").mockResolvedValue(null);
    const initial: AgendaState = {
      ...agendaState(1, "2026-08-13T12:00:00.000Z", "user-1"),
      validatedDraftVersion: 1,
      validatedAt: "2026-08-13T12:05:00.000Z",
    };

    await repository.compareAndSwap("event-1", null, initial);

    const stateInsert = findStatement(db, "INSERT INTO agenda_states");
    expect(stateInsert?.bound.values.slice(0, 8)).toEqual([
      "org-1",
      "event-1",
      1,
      "UTC",
      0,
      1,
      initial.validatedAt,
      null,
    ]);
    const draftInsert = findStatement(db, "INSERT INTO agenda_drafts");
    expect(draftInsert?.bound.values.slice(0, 6)).toEqual([
      "org-1",
      "event-1",
      1,
      "UTC",
      initial.draft.updatedAt,
      initial.draft.updatedBy,
    ]);
  });

  it("rejects agenda state whose timezone differs from the authoritative event", async () => {
    const db = database();
    const repository = new D1AgendaRepository(db, "org-1");
    const current = agendaState(1, "2026-08-13T12:00:00.000Z", "user-1");
    vi.spyOn(repository, "load").mockResolvedValue(current);
    const next = agendaState(2, "2026-08-13T13:00:00.000Z", "user-2");
    next.timeZone = "America/Los_Angeles";
    next.draft.timeZone = "America/Los_Angeles";

    await expect(repository.compareAndSwap("event-1", 1, next)).rejects.toBeInstanceOf(
      AgendaRepositoryConflictError,
    );
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("rejects an out-of-bounds draft before issuing a D1 write batch", async () => {
    const db = database();
    const repository = new D1AgendaRepository(db, "org-1");
    const current = agendaState(1, "2026-08-13T12:00:00.000Z", "user-1");
    vi.spyOn(repository, "load").mockResolvedValue(current);
    const next = agendaState(2, "2026-08-13T13:00:00.000Z", "user-2");
    next.draft.entries = [
      {
        id: "entry-outside",
        sessionId: "session-1",
        roomId: "room-1",
        trackIds: [],
        startsAt: "2026-08-15T09:00:00.000Z",
        endsAt: "2026-08-15T10:00:00.000Z",
        startsAtLocal: "2026-08-15T09:00:00",
        endsAtLocal: "2026-08-15T10:00:00",
        timeZone: "UTC",
      },
    ];

    await expect(repository.compareAndSwap("event-1", 1, next)).rejects.toBeInstanceOf(
      AgendaRepositoryConflictError,
    );
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("persists the draft timestamp supplied by the next agenda state", async () => {
    const db = database();
    const repository = new D1AgendaRepository(db, "org-1");
    const current = agendaState(1, "2026-08-13T12:00:00.000Z", "user-1");
    vi.spyOn(repository, "load").mockResolvedValue(current);
    const next: AgendaState = {
      ...agendaState(2, "2026-08-13T13:00:00.000Z", "user-2"),
      validatedDraftVersion: 2,
      validatedAt: "2026-08-13T13:05:00.000Z",
    };

    await repository.compareAndSwap("event-1", 1, next);

    const stateUpdate = findStatement(db, "UPDATE agenda_states SET");
    expect(stateUpdate?.bound.values.slice(0, 6)).toEqual([2, "UTC", 0, 2, next.validatedAt, null]);
    const draftUpdate = findStatement(db, "UPDATE agenda_drafts SET");
    expect(draftUpdate?.bound.values.slice(0, 4)).toEqual([
      2,
      "UTC",
      next.draft.updatedAt,
      next.draft.updatedBy,
    ]);
    const queries = db.statements.map((item) => item.bound.query).join("\n");
    expect(queries).toContain("starts_at = ?");
    expect(queries).toContain("time_zone = ?");
    expect(queries).toContain("schedule_dates_json");
    const eventGuard = findStatement(db, "SELECT CASE WHEN");
    expect(eventGuard?.bound.values).toContain(next.timeZone);
  });

  it("rejects an incomplete validation marker before issuing a D1 write", async () => {
    const db = database();
    const repository = new D1AgendaRepository(db, "org-1");
    const invalid = {
      ...agendaState(1, "2026-08-13T12:00:00.000Z", "user-1"),
      validatedDraftVersion: 1,
    } as unknown as AgendaState;

    await expect(repository.compareAndSwap("event-1", null, invalid)).rejects.toThrow(
      "Invalid agenda validation marker.",
    );
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("uses a neutral D1 speaker-name fallback without exposing speaker ids", async () => {
    const db = database({ state_version: 1 });
    const repository = new D1AgendaRepository(db, "org-1");

    await expect(repository.load("event-1")).rejects.toThrow("Agenda event-1 has no draft row");

    const speakerProjection = findStatement(db, "speaker_names_json");
    expect(speakerProjection?.bound.query).toContain(
      "CASE WHEN NULLIF(TRIM(display_name),'') IS NULL OR TRIM(display_name)=speaker_id THEN 'Speaker' ELSE display_name END",
    );
    expect(speakerProjection?.bound.query).not.toContain("COALESCE(display_name,speaker_id)");
  });
  it("uses the loaded aggregate and avoids rewriting unchanged suggestion history", async () => {
    const db = database();
    const repository = new D1AgendaRepository(db, "org-1");
    const draftEntry = {
      id: "entry-1",
      sessionId: "session-1",
      roomId: "room-1",
      trackIds: [],
      startsAt: "2026-08-13T09:00:00.000Z",
      endsAt: "2026-08-13T10:00:00.000Z",
      startsAtLocal: "2026-08-13T09:00",
      endsAtLocal: "2026-08-13T10:00",
      timeZone: "UTC",
    };
    const current: AgendaState = {
      ...agendaState(1, "2026-08-13T12:00:00.000Z", "user-1"),
      draft: {
        ...agendaState(1, "2026-08-13T12:00:00.000Z", "user-1").draft,
        entries: [draftEntry],
      },
      suggestionRuns: Array.from({ length: 200 }, (_, index) => suggestionRun(`run-${index}`)),
    };
    const next: AgendaState = {
      ...current,
      stateVersion: 2,
      draft: {
        ...current.draft,
        version: 2,
        updatedAt: "2026-08-13T12:01:00.000Z",
        entries: [
          {
            ...draftEntry,
            startsAt: "2026-08-13T10:00:00.000Z",
            endsAt: "2026-08-13T11:00:00.000Z",
            startsAtLocal: "2026-08-13T10:00",
            endsAtLocal: "2026-08-13T11:00",
          },
        ],
      },
    };
    const loadSpy = vi.spyOn(repository, "load");

    await repository.compareAndSwap("event-1", 1, next, {
      priorState: current,
    });

    expect(loadSpy).not.toHaveBeenCalled();
    expect(
      db.statements.filter((item) => item.bound.query.includes("UPDATE agenda_suggestion_runs")),
    ).toHaveLength(0);
    expect(db.statements.length).toBeLessThan(30);
  });
});
