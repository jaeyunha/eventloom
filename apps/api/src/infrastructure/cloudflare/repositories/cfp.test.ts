import type { D1Database } from "@cloudflare/workers-types";
import { afterEach, describe, expect, it } from "vitest";
import type { EventCfp } from "../../../features/cfp/model";
import { SqliteD1 } from "../../../test-support/sqlite-d1";
import { D1CfpRepository, eventCfpFromRow } from "./cfp";

const eventRow = {
  id: "event-1",
  organizationId: "organization-1",
  version: 1,
  slug: "future-conf",
  name: "Future Conf",
  timeZone: "UTC",
  startsAt: "2026-11-05T09:00:00.000Z",
  endsAt: "2026-11-07T17:00:00.000Z",
  cfpOpensAt: null,
  cfpClosesAt: null,
};

const databases: SqliteD1[] = [];

function createDatabase(): SqliteD1 {
  const database = new SqliteD1(
    "eventloom-cfp-authority-",
    `
      CREATE TABLE events (
        id TEXT PRIMARY KEY NOT NULL,
        organization_id TEXT NOT NULL,
        slug TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        time_zone TEXT NOT NULL,
        starts_at TEXT NOT NULL,
        ends_at TEXT NOT NULL,
        schedule_dates_json TEXT NOT NULL,
        venue TEXT,
        cfp_enabled INTEGER NOT NULL,
        cfp_opens_at TEXT,
        cfp_closes_at TEXT,
        default_duration_minutes INTEGER NOT NULL,
        default_calendar_time_zone TEXT NOT NULL,
        default_calendar_location TEXT,
        version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        created_by TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        UNIQUE (organization_id, id),
        CHECK (cfp_opens_at IS NULL OR cfp_closes_at > cfp_opens_at)
      ) STRICT;
      INSERT INTO events (
        id, organization_id, slug, name, status, time_zone, starts_at, ends_at,
        schedule_dates_json, venue, cfp_enabled, cfp_opens_at, cfp_closes_at,
        default_duration_minutes, default_calendar_time_zone, default_calendar_location,
        version, created_at, updated_at, created_by, updated_by
      ) VALUES (
        'event-1', 'organization-1', 'future-conf', 'Future Conf', 'active', 'UTC',
        '2026-11-05T09:00:00.000Z', '2026-11-07T17:00:00.000Z', '["2026-11-05"]',
        NULL, 1, '2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z',
        30, 'UTC', NULL, 1, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z',
        'organizer-1', 'organizer-1'
      );
    `,
  );
  databases.push(database);
  return database;
}

afterEach(() => {
  for (const database of databases.splice(0)) database.dispose();
});

describe("D1 CFP event mapping", () => {
  it("uses event dates when a new event has no CFP window yet", () => {
    expect(eventCfpFromRow(eventRow)).toMatchObject({
      opensAt: eventRow.startsAt,
      closesAt: eventRow.endsAt,
    });
  });

  it("preserves an explicitly configured CFP window", () => {
    expect(
      eventCfpFromRow({
        ...eventRow,
        cfpOpensAt: "2026-09-01T00:00:00.000Z",
        cfpClosesAt: "2026-10-01T00:00:00.000Z",
      }),
    ).toMatchObject({
      opensAt: "2026-09-01T00:00:00.000Z",
      closesAt: "2026-10-01T00:00:00.000Z",
    });
  });
});

describe("D1 CFP authoritative event bounds", () => {
  it("does not create an authoritative event through CFP persistence", async () => {
    const database = createDatabase();
    const repository = new D1CfpRepository(database as unknown as D1Database);

    await expect(
      repository.saveEvent(
        {
          id: "missing-event",
          tenantId: "organization-1",
          version: 1,
          slug: "missing-event",
          name: "Missing Event",
          timezone: "UTC",
          opensAt: "2026-09-01T00:00:00.000Z",
          closesAt: "2026-10-01T00:00:00.000Z",
        },
        null,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(database.query<{ count: number }>("SELECT COUNT(*) AS count FROM events")).toEqual([
      { count: 1 },
    ]);
  });

  it("updates only CFP-owned fields and preserves authoritative event identity", async () => {
    const database = createDatabase();
    const repository = new D1CfpRepository(database as unknown as D1Database, {
      now: () => "2026-08-02T00:00:00.000Z",
    });
    const current = await repository.getEvent("organization-1", "event-1");
    if (current === null) throw new Error("Expected the event fixture.");

    await repository.saveEvent(
      {
        ...current,
        version: 2,
        slug: "forged-slug",
        name: "Forged name",
        timezone: "America/New_York",
        opensAt: "2026-09-02T00:00:00.000Z",
        closesAt: "2026-10-02T00:00:00.000Z",
      },
      1,
    );

    expect(
      database.query<{
        slug: string;
        name: string;
        time_zone: string;
        starts_at: string;
        ends_at: string;
        cfp_opens_at: string;
        cfp_closes_at: string;
        version: number;
      }>(
        "SELECT slug, name, time_zone, starts_at, ends_at, cfp_opens_at, cfp_closes_at, version FROM events",
      ),
    ).toEqual([
      {
        slug: "future-conf",
        name: "Future Conf",
        time_zone: "UTC",
        starts_at: "2026-11-05T09:00:00.000Z",
        ends_at: "2026-11-07T17:00:00.000Z",
        cfp_opens_at: "2026-09-02T00:00:00.000Z",
        cfp_closes_at: "2026-10-02T00:00:00.000Z",
        version: 2,
      },
    ]);
  });

  it("rejects CFP boundaries that exceed a concurrently changed authoritative event start", async () => {
    const database = createDatabase();
    const repository = new D1CfpRepository(database as unknown as D1Database, {
      now: () => "2026-08-02T00:00:00.000Z",
    });
    const current = await repository.getEvent("organization-1", "event-1");
    if (current === null) throw new Error("Expected the event fixture.");
    const update: EventCfp = {
      ...current,
      version: 2,
      opensAt: "2026-09-01T00:00:00.000Z",
      closesAt: "2026-10-02T00:00:00.000Z",
    };

    database.beforeNextBatch(() => {
      database.run(
        "UPDATE events SET starts_at = '2026-09-15T00:00:00.000-07:00' WHERE organization_id = 'organization-1' AND id = 'event-1'",
      );
    });

    await expect(repository.saveEvent(update, 1)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      database.query<{ cfp_opens_at: string; cfp_closes_at: string; version: number }>(
        "SELECT cfp_opens_at, cfp_closes_at, version FROM events",
      ),
    ).toEqual([
      {
        cfp_opens_at: "2026-09-01T00:00:00.000Z",
        cfp_closes_at: "2026-10-01T00:00:00.000Z",
        version: 1,
      },
    ]);
  });
});
