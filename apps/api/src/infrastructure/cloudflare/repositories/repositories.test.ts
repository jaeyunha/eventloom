import { describe, expect, it, vi } from "vitest";

import type { Event, EventAuditEntry } from "../../../features/events/types";
import {
  EventRepositoryCapacityError,
  EventRepositoryConflictError,
} from "../../../features/events/types";
import type { Session, SessionAuditEntry, SessionSettings } from "../../../features/sessions/types";
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
  timeZone: "UTC",
  startsAt: now,
  endsAt: "2026-08-14T12:00:00.000Z",
  scheduleDates: ["2026-08-13", "2026-08-14"],
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
  it("guards managed event creation against the current entitlement in the same batch", async () => {
    const db = database();
    await new D1EventRepository(db).commitEvent({
      event: { ...event, version: 1 },
      expectedVersion: null,
      creationEntitlement: {
        revision: 7,
        activeEventLimit: 3,
      },
    });

    const batch = db.batch.mock.calls[0]?.[0] as readonly ReturnType<typeof statement>[];
    expect(batch[1]?.bound.query).toContain("FROM organization_entitlements");
    expect(batch[1]?.bound.query).toContain("COUNT(*)");
    expect(batch[1]?.bound.values).toEqual(["org-1", 7, now, now, "org-1"]);
  });

  it("reports entitlement admission failures as capacity errors", async () => {
    const db = database();
    db.batch.mockRejectedValueOnce(new Error("D1_CAS_CONFLICT"));

    await expect(
      new D1EventRepository(db).commitEvent({
        event: { ...event, version: 1 },
        expectedVersion: null,
        creationEntitlement: {
          revision: 7,
          activeEventLimit: 0,
        },
      }),
    ).rejects.toBeInstanceOf(EventRepositoryCapacityError);
  });

  it("batches tenant-scoped CAS, audit, and sync-job persistence", async () => {
    const db = database();
    await new D1EventRepository(db).commitEvent({ event, expectedVersion: 1, audit: eventAudit });
    expect(db.batch).toHaveBeenCalledOnce();
    const queries = db.statements.map((item) => item.bound.query).join("\n");
    expect(queries).toContain("WHERE organization_id = ? AND id = ? AND version = ?");
    expect(queries).toContain("schedule_dates_json = ?");
    expect(queries).toContain("FROM review_plans p");
    expect(queries).toContain("FROM review_rounds r");
    expect(queries).toContain("FROM agenda_states s");
    expect(queries).toContain("s.time_zone <> ?");
    expect(queries).toContain("FROM agenda_entries e");
    expect(queries).toContain("FROM json_each(?)");
    expect(db.statements[0]?.bound.values[5]).toBe('["2026-08-13","2026-08-14"]');
    expect(queries).toContain("INSERT INTO audit_events");
    expect(queries).toContain("INSERT INTO airtable_sync_jobs");
    expect(queries).toContain("attempt_count");
    expect(queries).toContain("payload_hash");
    expect(queries).toContain("connection.status = 'connected'");
    expect(queries).not.toContain("attempts");
    expect(queries).not.toContain("c.state");
  });

  it("guards event shortening against evaluation boundaries in the same atomic batch", async () => {
    const db = database();
    const shortened = { ...event, endsAt: "2026-08-14T08:00:00.000Z", version: 3 };

    await new D1EventRepository(db).commitEvent({ event: shortened, expectedVersion: 2 });

    const evaluationGuard = db.statements.find(
      (item) =>
        item.bound.query.includes("FROM review_plans p") &&
        item.bound.query.includes("FROM review_rounds r"),
    );
    expect(evaluationGuard?.bound.query).toContain("p.closes_at > ?");
    expect(evaluationGuard?.bound.query).toContain("r.opens_at > ?");
    expect(evaluationGuard?.bound.query).toContain("r.closes_at > ?");
    expect(evaluationGuard?.bound.values.slice(0, 7)).toEqual([
      "org-1",
      "event-1",
      shortened.endsAt,
      "org-1",
      "event-1",
      shortened.endsAt,
      shortened.endsAt,
    ]);
  });

  it("guards event timezone changes against agenda state in the same atomic batch", async () => {
    const db = database();
    const updated = { ...event, timeZone: "America/Los_Angeles", version: 3 };

    await new D1EventRepository(db).commitEvent({ event: updated, expectedVersion: 2 });

    const temporalGuard = db.statements.find((item) =>
      item.bound.query.includes("FROM agenda_states s"),
    );
    expect(temporalGuard?.bound.query).toContain("s.time_zone <> ?");
    expect(temporalGuard?.bound.values.slice(7, 10)).toEqual([
      "org-1",
      "event-1",
      updated.timeZone,
    ]);
  });

  it("initializes one empty agenda in the event creation batch", async () => {
    const db = database();
    await new D1EventRepository(db).commitEvent({
      event: { ...event, version: 1 },
      expectedVersion: null,
      audit: { ...eventAudit, action: "created", version: 1 },
    });
    const queries = db.statements.map((item) => item.bound.query).join("\n");
    expect(db.statements[0]?.bound.query).toContain("name, status, time_zone");
    expect(db.statements[0]?.bound.values[4]).toBe("active");
    expect(queries).toContain("INSERT INTO agenda_states");
    expect(queries).toContain("INSERT INTO agenda_drafts");
    expect(queries).not.toContain("INSERT INTO agenda_revisions");
    expect(queries).toContain(
      "EXISTS (SELECT 1 FROM events WHERE organization_id = ? AND id = ? AND version = ?)",
    );
    expect(queries).not.toContain("changes()");
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
  it("lists event-qualified active speaker profile IDs", async () => {
    const db = database();

    await new D1SessionRepository(db).listSpeakerIds("tenant-a", "event-a");

    expect(db.statements).toHaveLength(1);
    expect(db.statements[0]?.bound.query).toContain("FROM speaker_profiles");
    expect(db.statements[0]?.bound.query).toContain("organization_id = ?");
    expect(db.statements[0]?.bound.query).toContain("event_id = ?");
    expect(db.statements[0]?.bound.query).toContain("status <> 'revoked'");
    expect(db.statements[0]?.bound.values).toEqual(["tenant-a", "event-a"]);
  });

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
    expect(queries).toContain("INSERT INTO airtable_sync_jobs");
    expect(queries).toContain("attempt_count");
    expect(queries).toContain("payload_hash");
    expect(queries).toContain("connection.status = 'connected'");
    expect(queries).not.toContain("attempts");
    expect(queries).not.toContain("c.state");
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

  it("updates status rows without deleting values referenced by sessions", async () => {
    const db = database();
    const settings: SessionSettings = {
      id: "settings-1",
      tenantId: "tenant-1",
      eventId: "event-1",
      statuses: ["Draft", "Accepted"],
      agendaEligibleStatuses: ["Accepted"],
      version: 2,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      createdBy: "user-1",
      updatedBy: "user-1",
      history: [],
    };
    await new D1SessionRepository(db).commit?.({
      operation: "putSettings",
      value: settings,
      expectedVersion: 1,
      audit: {
        ...sessionAudit,
        entityType: "settings",
        entityId: settings.id,
        version: settings.version,
        after: settings,
      },
    });

    const queries = db.statements.map((item) => item.bound.query).join("\n");
    expect(queries).not.toContain("DELETE FROM session_statuses");
    expect(queries).toContain("UPDATE session_statuses SET active = 0");
    expect(queries).toContain("UPDATE session_statuses SET name = ?");
    expect(queries).toContain("INSERT INTO session_statuses");
    expect(queries).toContain("NOT EXISTS");
  });
});
