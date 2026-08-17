import type { D1Database } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";
import type { CloudflareOutboxMessage } from "./bindings";
import {
  CloudflareEvaluationExportQueue,
  D1EvaluationExportStore,
  dispatchPendingEvaluationExportJobs,
} from "./evaluation-export-jobs";
import { D1OutboxJobRepository } from "./outbox-consumer";
import {
  evaluationExportDatabase,
  evaluationExportQueue,
  NOW,
  queued,
} from "./evaluation-export-jobs.test-support";

describe("Cloudflare evaluation export queue", () => {
  it("leaves pending work replayable after queue failure and marks queued only after send", async () => {
    const db = evaluationExportDatabase();
    const store = new D1EvaluationExportStore(db as unknown as D1Database);
    await store.create(queued());
    const failing = new CloudflareEvaluationExportQueue(
      db as unknown as D1Database,
      evaluationExportQueue(async () => {
        throw new Error("queue unavailable");
      }),
      () => new Date(NOW),
    );

    await expect(failing.enqueue("run-1")).rejects.toThrow("queue unavailable");
    expect(db.query<{ state: string }>("SELECT state FROM outbox_jobs WHERE id='run-1'")).toEqual([
      { state: "pending" },
    ]);

    const sent: CloudflareOutboxMessage[] = [];
    const replay = new CloudflareEvaluationExportQueue(
      db as unknown as D1Database,
      evaluationExportQueue(async (message) => {
        sent.push(message);
      }),
      () => new Date(NOW),
    );
    await replay.enqueue("run-1");
    await replay.enqueue("run-1");

    expect(sent).toEqual([
      {
        version: 1,
        jobId: "run-1",
        tenantId: "tenant-1",
        topic: "reports",
        enqueuedAt: NOW,
      },
    ]);
    expect(db.query<{ state: string }>("SELECT state FROM outbox_jobs WHERE id='run-1'")).toEqual([
      { state: "queued" },
    ]);
  });

  it("dispatches a bounded set of stranded pending reports jobs and continues after failures", async () => {
    const db = evaluationExportDatabase();
    const store = new D1EvaluationExportStore(db as unknown as D1Database);
    for (const id of ["run-1", "run-2", "run-3"]) {
      await store.create(queued({ id, idempotencyKey: id, requestFingerprint: id }));
    }
    const sent: string[] = [];
    const result = await dispatchPendingEvaluationExportJobs(
      db as unknown as D1Database,
      evaluationExportQueue(async (message) => {
        if (message.jobId === "run-1") throw new Error("temporary failure");
        sent.push(message.jobId);
      }),
      { limit: 2, now: () => new Date(NOW) },
    );

    expect(result).toEqual({ selected: 2, queued: 1, failed: 1 });
    expect(sent).toEqual(["run-2"]);
    expect(
      db.query<{ id: string; state: string }>(
        "SELECT id,state FROM outbox_jobs WHERE topic='reports' ORDER BY id",
      ),
    ).toEqual([
      { id: "run-1", state: "pending" },
      { id: "run-2", state: "queued" },
      { id: "run-3", state: "pending" },
    ]);
  });

  it("recovers an expired processing report and republishes the same export run", async () => {
    const db = evaluationExportDatabase();
    const store = new D1EvaluationExportStore(db as unknown as D1Database);
    await store.create(queued());
    await store.claim("run-1", "2026-08-16T11:50:00.000Z", 1);
    db.executeScript(`
      UPDATE outbox_jobs
         SET state = 'processing',
             attempt_count = 1,
             lease_owner = 'expired-worker',
             lease_expires_at = '2026-08-16T11:59:00.000Z'
       WHERE id = 'run-1';
    `);
    const sent: string[] = [];

    const result = await dispatchPendingEvaluationExportJobs(
      db as unknown as D1Database,
      evaluationExportQueue(async (message) => {
        sent.push(message.jobId);
      }),
      { now: () => new Date(NOW) },
    );

    expect(result).toEqual({ selected: 1, queued: 1, failed: 0 });
    expect(sent).toEqual(["run-1"]);
    expect(
      db.query<{ status: string; processor_attempt: number | null; started_at: string | null }>(
        "SELECT status, processor_attempt, started_at FROM evaluation_export_runs WHERE id='run-1'",
      ),
    ).toEqual([{ status: "queued", processor_attempt: null, started_at: null }]);
    expect(
      db.query<{ state: string; lease_owner: string | null; lease_expires_at: string | null }>(
        "SELECT state, lease_owner, lease_expires_at FROM outbox_jobs WHERE id='run-1'",
      ),
    ).toEqual([{ state: "queued", lease_owner: null, lease_expires_at: null }]);
  });

  it("does not reset a successor claim acquired after stale selection", async () => {
    const db = evaluationExportDatabase();
    const store = new D1EvaluationExportStore(db as unknown as D1Database);
    await store.create(queued());
    await store.claim("run-1", "2026-08-16T11:50:00.000Z", 1);
    db.executeScript(`
      UPDATE outbox_jobs
         SET state = 'processing',
             attempt_count = 1,
             lease_owner = 'expired-worker',
             lease_expires_at = '2026-08-16T11:59:00.000Z'
       WHERE id = 'run-1';
    `);
    const sent: string[] = [];

    const result = await dispatchPendingEvaluationExportJobs(
      db as unknown as D1Database,
      evaluationExportQueue(async (message) => {
        sent.push(message.jobId);
      }),
      {
        now: () => new Date(NOW),
        beforeRecover: async (runId) => {
          const claim = await new D1OutboxJobRepository(db as unknown as D1Database).claim(
            runId,
            new Date(NOW),
            5 * 60_000,
            "successor-worker",
          );
          expect(claim).toMatchObject({
            outcome: "claimed",
            job: { attemptCount: 2, leaseOwner: "successor-worker" },
          });
          await store.claim(runId, NOW, 2);
        },
      },
    );

    expect(result).toEqual({ selected: 1, queued: 0, failed: 0 });
    expect(sent).toEqual([]);
    expect(
      db.query<{ status: string; processor_attempt: number | null }>(
        "SELECT status, processor_attempt FROM evaluation_export_runs WHERE id='run-1'",
      ),
    ).toEqual([{ status: "running", processor_attempt: 2 }]);
    expect(
      db.query<{ state: string; attempt_count: number; lease_owner: string | null }>(
        "SELECT state, attempt_count, lease_owner FROM outbox_jobs WHERE id='run-1'",
      ),
    ).toEqual([{ state: "processing", attempt_count: 2, lease_owner: "successor-worker" }]);
  });
});
