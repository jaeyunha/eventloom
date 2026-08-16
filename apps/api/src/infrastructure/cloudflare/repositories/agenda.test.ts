import { describe, expect, it, vi } from "vitest";

import { AgendaRepositoryConflictError } from "../../../features/agenda/infrastructure";
import type { AgendaState } from "../../../features/agenda/types";
import { D1AgendaRepository } from "./agenda";

function statement(query: string) {
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

function database() {
  const statements: ReturnType<typeof statement>[] = [];
  const batch = vi.fn(async (items: readonly ReturnType<typeof statement>[]) =>
    items.map(() => ({ meta: { changes: 1 } })),
  );
  return {
    prepare(query: string) {
      const prepared = statement(query);
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
    const initial = agendaState(1, "2026-08-13T12:00:00.000Z", "user-1");

    await repository.compareAndSwap("event-1", null, initial);

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
    const next = agendaState(2, "2026-08-13T13:00:00.000Z", "user-2");

    await repository.compareAndSwap("event-1", 1, next);

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
});
