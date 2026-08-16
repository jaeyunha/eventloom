import { describe, expect, it, vi } from "vitest";

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
  });
});
