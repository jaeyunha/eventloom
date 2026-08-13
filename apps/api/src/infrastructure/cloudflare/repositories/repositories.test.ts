import { describe, expect, it, vi } from "vitest";

import type { Event, EventAuditEntry } from "../../../features/events/types";
import { EventRepositoryConflictError } from "../../../features/events/types";
import type { Session, SessionAuditEntry } from "../../../features/sessions/types";
import { SessionRepositoryConflictError } from "../../../features/sessions/types";
import { D1EventRepository } from "./events";
import { D1SessionRepository } from "./sessions";

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

function database(changes = 1) {
  const statements: ReturnType<typeof statement>[] = [];
  const batch = vi.fn(async (items: readonly ReturnType<typeof statement>[]) =>
    items.map((_item, index) => ({ meta: { changes: index === 0 ? changes : 1 } })),
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

const now = "2026-08-13T12:00:00.000Z";
const event: Event = {
  id: "event-1",
  organizationId: "org-1",
  slug: "event-1",
  name: "Event",
  status: "active",
  timeZone: "UTC",
  startsAt: now,
  endsAt: "2026-08-14T12:00:00.000Z",
  venue: null,
  cfpSettings: { enabled: false, opensAt: null, closesAt: null },
  defaultCalendarSettings: { durationMinutes: 30, timeZone: "UTC", location: null },
  embedConfigurations: [],
  version: 2,
  createdAt: now,
  updatedAt: now,
  createdBy: "user-1",
  updatedBy: "user-1",
};
const eventAudit: EventAuditEntry = {
  id: "audit-1",
  organizationId: "org-1",
  eventId: "event-1",
  action: "updated",
  version: 2,
  actorId: "user-1",
  occurredAt: now,
  after: event,
};

const session: Session = {
  id: "session-1",
  tenantId: "org-1",
  eventId: "event-1",
  title: "Session",
  description: "",
  status: "Accepted",
  contentStatus: "Approved",
  durationMinutes: 30,
  capacityRequired: 0,
  trackIds: [],
  tagIds: [],
  speakerIds: [],
  speakerRoster: [],
  resourceIds: [],
  version: 2,
  createdAt: now,
  updatedAt: now,
  createdBy: "user-1",
  updatedBy: "user-1",
  history: [],
};
const sessionAudit: SessionAuditEntry = {
  id: "audit-session-1",
  tenantId: "org-1",
  eventId: "event-1",
  entityType: "session",
  entityId: "session-1",
  action: "updated",
  version: 2,
  actorId: "user-1",
  occurredAt: now,
  after: session,
};

describe("D1 event repository commands", () => {
  it("batches tenant-scoped CAS, audit, and sync-job persistence", async () => {
    const db = database();
    await new D1EventRepository(db).commitEvent({ event, expectedVersion: 1, audit: eventAudit });
    expect(db.batch).toHaveBeenCalledOnce();
    const queries = db.statements.map((item) => item.bound.query).join("\n");
    expect(queries).toContain("WHERE organization_id = ? AND id = ? AND version = ?");
    expect(queries).toContain("INSERT INTO audit_events");
    expect(queries).toContain("INSERT OR IGNORE INTO airtable_sync_jobs");
  });

  it("initializes one empty agenda in the event creation batch", async () => {
    const db = database();
    await new D1EventRepository(db).commitEvent({
      event: { ...event, version: 1 },
      expectedVersion: null,
      audit: { ...eventAudit, action: "created", version: 1 },
    });
    const queries = db.statements.map((item) => item.bound.query).join("\n");
    expect(queries).toContain("INSERT INTO agenda_states");
    expect(queries).toContain("INSERT INTO agenda_drafts");
    expect(queries).not.toContain("INSERT INTO agenda_revisions");
  });

  it("reports a stale compare-and-swap from the first batch result", async () => {
    await expect(
      new D1EventRepository(database(0)).commitEvent({
        event,
        expectedVersion: 1,
        audit: eventAudit,
      }),
    ).rejects.toBeInstanceOf(EventRepositoryConflictError);
  });
});

describe("D1 session repository commands", () => {
  it("batches tenant/event-scoped CAS, normalized joins, audit, and sync-job persistence", async () => {
    const db = database();
    await new D1SessionRepository(db).commit?.({
      operation: "putSession",
      value: session,
      expectedVersion: 1,
      audit: sessionAudit,
    });
    expect(db.batch).toHaveBeenCalledOnce();
    const queries = db.statements.map((item) => item.bound.query).join("\n");
    expect(queries).toContain(
      "WHERE organization_id = ? AND event_id = ? AND id = ? AND version = ?",
    );
    expect(queries).toContain("DELETE FROM session_tracks");
    expect(queries).toContain("INSERT INTO session_history");
    expect(queries).toContain("INSERT OR IGNORE INTO airtable_sync_jobs");
  });

  it("reports a stale compare-and-swap from the first batch result", async () => {
    await expect(
      new D1SessionRepository(database(0)).commit?.({
        operation: "putSession",
        value: session,
        expectedVersion: 1,
        audit: sessionAudit,
      }),
    ).rejects.toBeInstanceOf(SessionRepositoryConflictError);
  });
});
