import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const migrationDirectory = resolve(repositoryRoot, "apps/api/migrations");

test("preserves rollback columns while quarantining formerly archived events", () => {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA recursive_triggers = ON");
  const migrations = readdirSync(migrationDirectory)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name) && name < "0028_remove_event_status.sql")
    .sort();

  for (const migration of migrations) {
    database.exec(readFileSync(resolve(migrationDirectory, migration), "utf8"));
  }
  database.exec(
    readFileSync(resolve(migrationDirectory, "0033_private_download_capabilities.sql"), "utf8"),
  );

  database
    .prepare(
      `INSERT INTO organizations (organization_id, slug, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run("org-1", "org-1", "Organization", "2026-08-17T00:00:00.000Z", "2026-08-17T00:00:00.000Z");
  const insertEvent = database.prepare(
    `INSERT INTO events (
       id, organization_id, slug, name, status, time_zone, starts_at, ends_at, venue,
       cfp_enabled, cfp_opens_at, cfp_closes_at, default_duration_minutes,
       default_calendar_time_zone, default_calendar_location, version, created_at,
       updated_at, created_by, updated_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL, NULL, 30, ?, NULL, 1, ?, ?, ?, ?)`,
  );
  for (const status of ["draft", "active", "archived"]) {
    insertEvent.run(
      `event-${status}`,
      "org-1",
      `event-${status}`,
      `Event ${status}`,
      status,
      "UTC",
      "2027-05-12T00:00:00.000Z",
      "2027-05-13T00:00:00.000Z",
      "UTC",
      "2026-08-17T00:00:00.000Z",
      "2026-08-17T00:00:00.000Z",
      "owner",
      "owner",
    );
  }
  insertEvent.run(
    "event-gap-archive",
    "org-1",
    "gap-archive",
    "Gap archive",
    "active",
    "UTC",
    "2027-05-12T00:00:00.000Z",
    "2027-05-13T00:00:00.000Z",
    "UTC",
    "2026-08-17T00:00:00.000Z",
    "2026-08-17T00:00:00.000Z",
    "owner",
    "owner",
  );
  insertEvent.run(
    "event-gap-reactivate",
    "org-1",
    "gap-reactivate",
    "Gap reactivate",
    "archived",
    "UTC",
    "2027-05-12T00:00:00.000Z",
    "2027-05-13T00:00:00.000Z",
    "UTC",
    "2026-08-17T00:00:00.000Z",
    "2026-08-17T00:00:00.000Z",
    "owner",
    "owner",
  );

  database.exec(`
    INSERT INTO airtable_connections (
      id, organization_id, status, auth_mode, granted_scopes_json,
      connection_version, created_at, updated_at
    ) VALUES (
      'connection-1','org-1','connected','oauth','[]',
      1,'2026-08-17T00:00:00.000Z','2026-08-17T00:00:00.000Z'
    );

    INSERT INTO airtable_sync_jobs (
      id, organization_id, connection_id, connection_version, entity_type,
      application_id, source_version, operation, state, deduplication_key,
      attempt_count, available_at, payload_json, payload_hash, created_at, updated_at
    ) VALUES
      ('job-archive','org-1','connection-1',1,'event','event-archived',1,'archive','pending','archive-key',0,'2026-08-17T00:00:00.000Z','{}','hash-archive','2026-08-17T00:00:00.000Z','2026-08-17T00:00:00.000Z'),
      ('job-upsert','org-1','connection-1',1,'event','event-active',1,'upsert','pending','upsert-key',0,'2026-08-17T00:00:00.000Z','{}','hash-upsert','2026-08-17T00:00:00.000Z','2026-08-17T00:00:00.000Z');
  `);

  database.exec(readFileSync(resolve(migrationDirectory, "0028_remove_event_status.sql"), "utf8"));
  database.exec(`
    UPDATE events
    SET status = 'archived',
        updated_at = '2026-02-05T00:00:00.000Z'
    WHERE id = 'event-gap-archive';
    UPDATE events
    SET status = 'active'
    WHERE id = 'event-gap-reactivate';
  `);
  database.exec(
    readFileSync(resolve(migrationDirectory, "0044_event_retirement_compatibility.sql"), "utf8"),
  );

  const eventColumns = database.prepare("PRAGMA table_info(events)").all();
  const portalContextColumns = database.prepare("PRAGMA table_info(portal_contexts)").all();
  const events = database
    .prepare(
      "SELECT id, name, status, legacy_retired_at FROM events WHERE id IN ('event-active', 'event-archived', 'event-draft') ORDER BY id",
    )
    .all()
    .map(({ id, name, status, legacy_retired_at }) => ({
      id,
      name,
      status,
      legacy_retired_at,
    }));
  const syncJobs = database
    .prepare("SELECT id, state, last_error_code FROM airtable_sync_jobs ORDER BY id")
    .all()
    .map(({ id, state, last_error_code }) => ({ id, state, last_error_code }));

  assert.equal(
    eventColumns.some(({ name }) => name === "status"),
    true,
  );
  assert.equal(
    eventColumns.some(({ name }) => name === "legacy_retired_at"),
    true,
  );
  assert.equal(
    portalContextColumns.some(({ name }) => name === "status"),
    true,
  );
  assert.deepEqual(events, [
    {
      id: "event-active",
      name: "Event active",
      status: "active",
      legacy_retired_at: null,
    },
    {
      id: "event-archived",
      name: "Event archived",
      status: "archived",
      legacy_retired_at: "2026-08-17T00:00:00.000Z",
    },
    {
      id: "event-draft",
      name: "Event draft",
      status: "draft",
      legacy_retired_at: null,
    },
  ]);
  assert.deepEqual(syncJobs, [
    { id: "job-archive", state: "cancelled", last_error_code: "event_status_removed" },
    { id: "job-upsert", state: "pending", last_error_code: null },
  ]);
  const lifecycleFor = (eventId) => ({
    ...database.prepare("SELECT status, legacy_retired_at FROM events WHERE id = ?").get(eventId),
  });
  assert.deepEqual(lifecycleFor("event-gap-archive"), {
    status: "archived",
    legacy_retired_at: "2026-02-05T00:00:00.000Z",
  });
  assert.deepEqual(lifecycleFor("event-gap-reactivate"), {
    status: "active",
    legacy_retired_at: null,
  });

  database.exec(`
    BEGIN IMMEDIATE;
    UPDATE events
    SET status = 'archived',
        updated_at = '2026-02-01T00:00:00.000Z'
    WHERE id = 'event-active';
    ROLLBACK;
  `);
  assert.deepEqual(lifecycleFor("event-active"), { status: "active", legacy_retired_at: null });

  database.exec(`
    UPDATE events
    SET status = 'archived',
        updated_at = '2026-02-02T00:00:00.000Z'
    WHERE id = 'event-active';
  `);
  assert.deepEqual(lifecycleFor("event-active"), {
    status: "archived",
    legacy_retired_at: "2026-02-02T00:00:00.000Z",
  });

  database.exec(`
    BEGIN IMMEDIATE;
    UPDATE events SET status = 'active' WHERE id = 'event-active';
    ROLLBACK;
  `);
  assert.deepEqual(lifecycleFor("event-active"), {
    status: "archived",
    legacy_retired_at: "2026-02-02T00:00:00.000Z",
  });

  database.exec("UPDATE events SET status = 'active' WHERE id = 'event-active'");
  assert.deepEqual(lifecycleFor("event-active"), { status: "active", legacy_retired_at: null });

  database.exec(`
    UPDATE events
    SET legacy_retired_at = '2026-02-03T00:00:00.000Z'
    WHERE id = 'event-draft';
  `);
  assert.deepEqual(lifecycleFor("event-draft"), {
    status: "archived",
    legacy_retired_at: "2026-02-03T00:00:00.000Z",
  });

  database.exec("UPDATE events SET legacy_retired_at = NULL WHERE id = 'event-draft'");
  assert.deepEqual(lifecycleFor("event-draft"), { status: "active", legacy_retired_at: null });

  database.exec(`
    INSERT INTO events (
      organization_id,
      id,
      slug,
      name,
      status,
      time_zone,
      starts_at,
      ends_at,
      schedule_dates_json,
      venue,
      cfp_enabled,
      default_duration_minutes,
      default_calendar_time_zone,
      default_calendar_location,
      version,
      created_at,
      updated_at,
      created_by,
      updated_by
    ) VALUES (
      'org-1',
      'event-created-archived',
      'created-archived',
      'Created archived',
      'archived',
      'UTC',
      '2026-08-21T09:00:00.000Z',
      '2026-08-21T17:00:00.000Z',
      '["2026-08-21"]',
      'Main Hall',
      0,
      30,
      'UTC',
      'Main Hall',
      1,
      '2026-02-04T00:00:00.000Z',
      '2026-02-04T00:00:00.000Z',
      'user-1',
      'user-1'
    )
  `);
  assert.deepEqual(lifecycleFor("event-created-archived"), {
    status: "archived",
    legacy_retired_at: "2026-02-04T00:00:00.000Z",
  });

  database.close();
});
