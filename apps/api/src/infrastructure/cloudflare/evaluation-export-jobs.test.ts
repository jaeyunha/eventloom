import type { D1Database } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";
import { D1EvaluationExportStore } from "./evaluation-export-jobs";
import {
  databaseBeforeExportMigration,
  evaluationExportDatabase,
  migration,
  NOW,
  queued,
} from "./evaluation-export-jobs.test-support";

describe("D1 evaluation export jobs", () => {
  it("widens the outbox topic without losing rows, indexes, or foreign-key references", () => {
    const db = databaseBeforeExportMigration();
    db.executeScript(`
      INSERT INTO outbox_jobs
        (id,tenant_id,topic,deduplication_key,payload_json,state,attempt_count,available_at,created_at,updated_at)
      VALUES ('existing-job','tenant-1','communications','existing-key','{}','delivered',1,'${NOW}','${NOW}','${NOW}');
      INSERT INTO delivery_attempts
        (id,outbox_job_id,attempt_number,started_at,completed_at,outcome)
      VALUES ('attempt-1','existing-job',1,'${NOW}','${NOW}','delivered');
      INSERT INTO reminder_runs
        (id,organization_id,event_id,trigger_type,audience_type,audience_revision,state,started_at,created_at,updated_at)
      VALUES ('reminder-run','tenant-1','event-1','manual','task','revision-1','completed','${NOW}','${NOW}','${NOW}');
      INSERT INTO reminder_dispatches
        (id,run_id,organization_id,event_id,recipient,task_id,eligibility_reason,cadence_window,
         idempotency_key,status,created_at,updated_at,outbox_job_id)
      VALUES ('dispatch-1','reminder-run','tenant-1','event-1','person@example.test','task-1',
              'due','window-1','dispatch-key','delivered','${NOW}','${NOW}','existing-job');
      INSERT INTO publication_rebuild_receipts
        (id,organization_id,event_id,trigger_type,source_revision,source_hashes_json,idempotency_key,
         outbox_job_id,state,created_at,updated_at)
      VALUES ('receipt-1','tenant-1','event-1','manual','revision-1','{}','receipt-key',
              'existing-job','pending','${NOW}','${NOW}');
    `);

    db.executeScript(migration("0036_evaluation_export_jobs.sql"));

    expect(db.query<{ id: string }>("SELECT id FROM outbox_jobs")).toEqual([
      { id: "existing-job" },
    ]);
    expect(
      db.query<{ outbox_job_id: string }>("SELECT outbox_job_id FROM delivery_attempts"),
    ).toEqual([{ outbox_job_id: "existing-job" }]);
    expect(
      db.query<{ outbox_job_id: string }>("SELECT outbox_job_id FROM reminder_dispatches"),
    ).toEqual([{ outbox_job_id: "existing-job" }]);
    expect(
      db.query<{ outbox_job_id: string }>("SELECT outbox_job_id FROM publication_rebuild_receipts"),
    ).toEqual([{ outbox_job_id: "existing-job" }]);
    expect(
      db.query<{ table: string }>(
        "SELECT `table` FROM pragma_foreign_key_list('delivery_attempts') WHERE `from`='outbox_job_id'",
      ),
    ).toEqual([{ table: "outbox_jobs" }]);
    expect(
      db.query<{ name: string }>(
        "SELECT name FROM pragma_index_list('outbox_jobs') WHERE name IN ('outbox_jobs_ready_idx','outbox_jobs_tenant_idx') ORDER BY name",
      ),
    ).toEqual([{ name: "outbox_jobs_ready_idx" }, { name: "outbox_jobs_tenant_idx" }]);
    expect(db.query("PRAGMA foreign_key_check")).toEqual([]);
  });

  it("atomically creates one run and reports outbox row with tenant-scoped idempotency", async () => {
    const db = evaluationExportDatabase();
    const store = new D1EvaluationExportStore(db as unknown as D1Database);

    await expect(store.create(queued())).resolves.toMatchObject({ status: "created" });
    await expect(store.create(queued({ id: "run-replay" }))).resolves.toMatchObject({
      status: "existing",
      job: { id: "run-1" },
    });
    await expect(
      store.create(queued({ id: "run-conflict", requestFingerprint: '{"request":"different"}' })),
    ).resolves.toEqual({ status: "conflict" });
    await expect(
      store.create(
        queued({
          id: "run-tenant-2",
          tenantId: "tenant-2",
          requestFingerprint: '{"request":"tenant-two"}',
        }),
      ),
    ).resolves.toMatchObject({ status: "created" });

    expect(
      db.query<Record<string, unknown>>(
        "SELECT id, tenant_id, topic, deduplication_key, payload_json, state FROM outbox_jobs ORDER BY id",
      ),
    ).toEqual([
      {
        id: "run-1",
        tenant_id: "tenant-1",
        topic: "reports",
        deduplication_key: "request-1",
        payload_json: '{"kind":"evaluation_review_export","runId":"run-1"}',
        state: "pending",
      },
      {
        id: "run-tenant-2",
        tenant_id: "tenant-2",
        topic: "reports",
        deduplication_key: "request-1",
        payload_json: '{"kind":"evaluation_review_export","runId":"run-tenant-2"}',
        state: "pending",
      },
    ]);
  });

  it("uses conditional queued-to-running-to-ready-or-failed transitions", async () => {
    const db = evaluationExportDatabase();
    const store = new D1EvaluationExportStore(db as unknown as D1Database);
    await store.create(queued());

    await expect(store.claim("run-1", "2026-08-16T12:01:00.000Z", 1)).resolves.toMatchObject({
      status: "running",
      processorAttempt: 1,
    });
    await expect(store.claim("run-1", "2026-08-16T12:02:00.000Z", 1)).resolves.toBeUndefined();
    await expect(store.claim("run-1", "2026-08-16T12:02:00.000Z", 2)).resolves.toMatchObject({
      status: "running",
      processorAttempt: 2,
    });
    await expect(
      store.completeReady("run-1", 1, {
        completedAt: "2026-08-16T12:03:00.000Z",
        artifactKey: "evaluation-exports/tenant-1/event-1/plan-1/run-1/attempt-1.csv",
        rowCount: 1,
      }),
    ).resolves.toBe(false);
    await expect(
      store.completeReady("run-1", 2, {
        completedAt: "2026-08-16T12:03:00.000Z",
        artifactKey: "evaluation-exports/tenant-1/event-1/plan-1/run-1/attempt-2.csv",
        rowCount: 7,
      }),
    ).resolves.toBe(true);
    await expect(
      store.completeFailed("run-1", 2, {
        completedAt: "2026-08-16T12:04:00.000Z",
        error: {
          code: "EVALUATION_EXPORT_GENERATION_FAILED",
          message: "must not replace ready",
          retryable: true,
        },
      }),
    ).resolves.toBe(false);

    await expect(store.get("run-1")).resolves.toMatchObject({
      status: "ready",
      processorAttempt: 2,
      rowCount: 7,
      completedAt: "2026-08-16T12:03:00.000Z",
    });
  });
});
