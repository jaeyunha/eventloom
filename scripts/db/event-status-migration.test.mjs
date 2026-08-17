import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const migrationDirectory = resolve(repositoryRoot, "apps/api/migrations");

test("preserves rollback columns while quarantining formerly archived events", () => {
  const database = new DatabaseSync(":memory:");
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

  const eventColumns = database.prepare("PRAGMA table_info(events)").all();
  const portalContextColumns = database.prepare("PRAGMA table_info(portal_contexts)").all();
  const events = database
    .prepare("SELECT id, name, status, legacy_retired_at FROM events ORDER BY id")
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

  database.close();
});
