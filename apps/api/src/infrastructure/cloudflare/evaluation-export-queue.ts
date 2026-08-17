import type { EvaluationExportQueue } from "../../features/evaluations/export-jobs";
import type { CloudflareOutboxMessage } from "./bindings";

const DEFAULT_DISPATCH_LIMIT = 50;
const MAX_DISPATCH_LIMIT = 100;

interface PendingReportRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly outbox_state: string;
  readonly attempt_count: number;
  readonly lease_owner: string | null;
  readonly lease_expires_at: string | null;
  readonly export_status: string;
  readonly processor_attempt: number | null;
}

/** Publishes only durable pending reports rows and changes state only after Queue accepts them. */
export class CloudflareEvaluationExportQueue implements EvaluationExportQueue {
  constructor(
    private readonly database: D1Database,
    private readonly queue: Queue<CloudflareOutboxMessage>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async enqueue(runId: string): Promise<void> {
    const row = await this.database
      .prepare(
        `SELECT id, tenant_id
           FROM outbox_jobs
          WHERE id = ? AND topic = 'reports' AND state = 'pending'
          LIMIT 1`,
      )
      .bind(runId)
      .first<PendingReportRow>();
    if (row === null) return;
    const enqueuedAt = this.now().toISOString();
    await this.queue.send({
      version: 1,
      jobId: row.id,
      tenantId: row.tenant_id,
      topic: "reports",
      enqueuedAt,
    });
    await this.database
      .prepare(
        `UPDATE outbox_jobs
            SET state = 'queued', updated_at = ?
          WHERE id = ? AND topic = 'reports' AND state = 'pending'`,
      )
      .bind(enqueuedAt, row.id)
      .run();
  }
}

export interface PendingEvaluationExportDispatchOptions {
  readonly limit?: number;
  readonly now?: () => Date;
  readonly beforeRecover?: (runId: string) => Promise<void>;
}

export interface PendingEvaluationExportDispatchResult {
  readonly selected: number;
  readonly queued: number;
  readonly failed: number;
}

/** Bounded replay for reports rows stranded between D1 commit and Queue publication. */
export async function dispatchPendingEvaluationExportJobs(
  database: D1Database,
  queue: Queue<CloudflareOutboxMessage>,
  options: PendingEvaluationExportDispatchOptions = {},
): Promise<PendingEvaluationExportDispatchResult> {
  const limit = options.limit ?? DEFAULT_DISPATCH_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_DISPATCH_LIMIT) {
    throw new TypeError(
      `Pending evaluation export dispatch limit must be between 1 and ${MAX_DISPATCH_LIMIT}.`,
    );
  }
  const now = options.now ?? (() => new Date());
  const recoveryTime = now();
  const rows = await database
    .prepare(
      `SELECT outbox_jobs.id,
              outbox_jobs.tenant_id,
              outbox_jobs.state AS outbox_state,
              outbox_jobs.attempt_count,
              outbox_jobs.lease_owner,
              outbox_jobs.lease_expires_at,
              evaluation_export_runs.status AS export_status,
              evaluation_export_runs.processor_attempt
         FROM outbox_jobs
         JOIN evaluation_export_runs
           ON evaluation_export_runs.id = outbox_jobs.id
          AND evaluation_export_runs.tenant_id = outbox_jobs.tenant_id
        WHERE outbox_jobs.topic = 'reports'
          AND evaluation_export_runs.status IN ('queued', 'running')
          AND outbox_jobs.available_at <= ?
          AND (
            outbox_jobs.state IN ('pending', 'queued', 'failed', 'dead-letter')
            OR (
              outbox_jobs.state = 'processing'
              AND (
                outbox_jobs.lease_expires_at IS NULL
                OR outbox_jobs.lease_expires_at <= ?
              )
            )
            OR (
              outbox_jobs.state = 'delivered'
              AND evaluation_export_runs.status = 'running'
            )
          )
        ORDER BY outbox_jobs.available_at, outbox_jobs.created_at, outbox_jobs.id
        LIMIT ?`,
    )
    .bind(recoveryTime.toISOString(), recoveryTime.toISOString(), limit)
    .all<PendingReportRow>();
  let queued = 0;
  let failed = 0;
  const publisher = new CloudflareEvaluationExportQueue(database, queue, now);
  for (const row of rows.results) {
    try {
      await options.beforeRecover?.(row.id);
      const recoveryResults = await database.batch([
        database
          .prepare(
            `UPDATE evaluation_export_runs
                SET status = 'queued',
                    started_at = NULL,
                    processor_attempt = NULL,
                    updated_at = ?
              WHERE id = ? AND tenant_id = ?
                AND status = ?
                AND processor_attempt IS ?
                AND EXISTS (
                  SELECT 1
                    FROM outbox_jobs
                   WHERE outbox_jobs.id = evaluation_export_runs.id
                     AND outbox_jobs.tenant_id = evaluation_export_runs.tenant_id
                     AND outbox_jobs.topic = 'reports'
                     AND outbox_jobs.state = ?
                     AND outbox_jobs.attempt_count = ?
                     AND outbox_jobs.lease_owner IS ?
                     AND outbox_jobs.lease_expires_at IS ?
                )`,
          )
          .bind(
            recoveryTime.toISOString(),
            row.id,
            row.tenant_id,
            row.export_status,
            row.processor_attempt,
            row.outbox_state,
            row.attempt_count,
            row.lease_owner,
            row.lease_expires_at,
          ),
        database
          .prepare(
            `UPDATE outbox_jobs
                SET state = 'pending',
                    available_at = ?,
                    lease_owner = NULL,
                    lease_expires_at = NULL,
                    completed_at = NULL,
                    updated_at = ?
              WHERE id = ? AND tenant_id = ? AND topic = 'reports'
                AND state = ?
                AND attempt_count = ?
                AND lease_owner IS ?
                AND lease_expires_at IS ?`,
          )
          .bind(
            recoveryTime.toISOString(),
            recoveryTime.toISOString(),
            row.id,
            row.tenant_id,
            row.outbox_state,
            row.attempt_count,
            row.lease_owner,
            row.lease_expires_at,
          ),
      ]);
      const outboxRecovery = recoveryResults[1];
      if (outboxRecovery === undefined) {
        throw new Error("Evaluation export outbox recovery did not return its D1 result.");
      }
      if ((outboxRecovery.meta.changes ?? 0) !== 1) continue;
      await publisher.enqueue(row.id);
      queued += 1;
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "evaluation_export_recovery_failed",
          runId: row.id,
          errorName: error instanceof Error ? error.name : "UnknownError",
          errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
        }),
      );
      failed += 1;
    }
  }
  return { selected: rows.results.length, queued, failed };
}
