import type {
  EvaluationExport,
  EvaluationExportCreateResult,
  EvaluationExportFailure,
  EvaluationExportStore,
  QueuedEvaluationExport,
  RunningEvaluationExport,
} from "../../features/evaluations/export-jobs";
import { EvaluationExportError } from "../../features/evaluations/export-jobs";

interface EvaluationExportRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly event_id: string;
  readonly plan_id: string;
  readonly plan_version: number;
  readonly requested_by: string;
  readonly idempotency_key: string;
  readonly request_fingerprint: string;
  readonly file_name: string;
  readonly status: string;
  readonly requested_at: string;
  readonly started_at: string | null;
  readonly processor_attempt: number | null;
  readonly completed_at: string | null;
  readonly artifact_key: string | null;
  readonly row_count: number | null;
  readonly error_code: string | null;
  readonly error_message: string | null;
  readonly error_retryable: number | null;
}

const exportColumns = `id, tenant_id, event_id, plan_id, plan_version, requested_by,
  idempotency_key, request_fingerprint, file_name, status, requested_at, started_at,
  processor_attempt, completed_at, artifact_key, row_count, error_code, error_message,
  error_retryable`;

function baseExport(row: EvaluationExportRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    eventId: row.event_id,
    planId: row.plan_id,
    planVersion: row.plan_version,
    requestedBy: row.requested_by,
    idempotencyKey: row.idempotency_key,
    requestFingerprint: row.request_fingerprint,
    fileName: row.file_name,
    requestedAt: row.requested_at,
  } as const;
}

function rowToExport(row: EvaluationExportRow): EvaluationExport {
  const base = baseExport(row);
  if (row.status === "queued") return { ...base, status: "queued" };
  if (row.status === "running" && row.started_at !== null && row.processor_attempt !== null) {
    return {
      ...base,
      status: "running",
      startedAt: row.started_at,
      processorAttempt: row.processor_attempt,
    };
  }
  if (
    row.status === "ready" &&
    row.started_at !== null &&
    row.processor_attempt !== null &&
    row.completed_at !== null &&
    row.artifact_key !== null &&
    row.row_count !== null
  ) {
    return {
      ...base,
      status: "ready",
      startedAt: row.started_at,
      processorAttempt: row.processor_attempt,
      completedAt: row.completed_at,
      artifactKey: row.artifact_key,
      rowCount: row.row_count,
    };
  }
  if (
    row.status === "failed" &&
    row.started_at !== null &&
    row.processor_attempt !== null &&
    row.completed_at !== null &&
    (row.error_code === "EVALUATION_EXPORT_GENERATION_FAILED" ||
      row.error_code === "EVALUATION_EXPORT_PROCESSING_EXHAUSTED") &&
    row.error_message !== null &&
    row.error_retryable === 1
  ) {
    return {
      ...base,
      status: "failed",
      startedAt: row.started_at,
      processorAttempt: row.processor_attempt,
      completedAt: row.completed_at,
      error: {
        code: row.error_code,
        message: row.error_message,
        retryable: true,
      },
    };
  }
  throw new Error(`Evaluation export run ${row.id} has invalid persisted state.`);
}

/** D1 persistence with an export run and its durable reports outbox row committed together. */
export class D1EvaluationExportStore implements EvaluationExportStore {
  constructor(private readonly database: D1Database) {}

  async create(job: QueuedEvaluationExport): Promise<EvaluationExportCreateResult> {
    const payload = JSON.stringify({ kind: "evaluation_review_export", runId: job.id });
    const results = await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO evaluation_export_runs
            (id, tenant_id, event_id, plan_id, plan_version, requested_by, idempotency_key,
             request_fingerprint, file_name, status, requested_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)
           ON CONFLICT DO NOTHING`,
        )
        .bind(
          job.id,
          job.tenantId,
          job.eventId,
          job.planId,
          job.planVersion,
          job.requestedBy,
          job.idempotencyKey,
          job.requestFingerprint,
          job.fileName,
          job.requestedAt,
          job.requestedAt,
          job.requestedAt,
        ),
      this.database
        .prepare(
          `INSERT INTO outbox_jobs
            (id, tenant_id, topic, deduplication_key, payload_json, state, attempt_count,
             available_at, created_at, updated_at)
           SELECT id, tenant_id, 'reports', idempotency_key, ?, 'pending', 0,
                  requested_at, requested_at, requested_at
             FROM evaluation_export_runs
            WHERE id = ? AND tenant_id = ? AND idempotency_key = ? AND request_fingerprint = ?
              AND changes() = 1`,
        )
        .bind(payload, job.id, job.tenantId, job.idempotencyKey, job.requestFingerprint),
    ]);

    const persisted = await this.database
      .prepare(
        `SELECT ${exportColumns}
           FROM evaluation_export_runs
          WHERE tenant_id = ? AND idempotency_key = ?
          LIMIT 1`,
      )
      .bind(job.tenantId, job.idempotencyKey)
      .first<EvaluationExportRow>();
    if (persisted === null) {
      throw new EvaluationExportError(
        "EVALUATION_EXPORT_IDEMPOTENCY_CONFLICT",
        "The generated evaluation export ID is already in use. Retry the request.",
        409,
      );
    }
    if (persisted.request_fingerprint !== job.requestFingerprint) return { status: "conflict" };
    const result = rowToExport(persisted);
    return (results[0]?.meta.changes ?? 0) === 1
      ? { status: "created", job: result as QueuedEvaluationExport }
      : { status: "existing", job: result };
  }

  async get(runId: string): Promise<EvaluationExport | undefined> {
    const row = await this.database
      .prepare(`SELECT ${exportColumns} FROM evaluation_export_runs WHERE id = ? LIMIT 1`)
      .bind(runId)
      .first<EvaluationExportRow>();
    return row === null ? undefined : rowToExport(row);
  }

  async claim(
    runId: string,
    startedAt: string,
    processorAttempt: number,
  ): Promise<RunningEvaluationExport | undefined> {
    const update = await this.database
      .prepare(
        `UPDATE evaluation_export_runs
            SET status = 'running', started_at = ?, processor_attempt = ?, updated_at = ?
          WHERE id = ?
            AND (
              status = 'queued'
              OR (status = 'running' AND processor_attempt < ?)
            )`,
      )
      .bind(startedAt, processorAttempt, startedAt, runId, processorAttempt)
      .run();
    if ((update.meta.changes ?? 0) !== 1) return undefined;
    const claimed = await this.get(runId);
    if (claimed?.status !== "running") {
      throw new Error("The claimed evaluation export run could not be read.");
    }
    return claimed;
  }

  async completeReady(
    runId: string,
    processorAttempt: number,
    completion: {
      readonly completedAt: string;
      readonly artifactKey: string;
      readonly rowCount: number;
    },
  ): Promise<boolean> {
    const result = await this.database
      .prepare(
        `UPDATE evaluation_export_runs
            SET status = 'ready', completed_at = ?, artifact_key = ?, row_count = ?,
                error_code = NULL, error_message = NULL, error_retryable = NULL, updated_at = ?
          WHERE id = ? AND status = 'running' AND processor_attempt = ?`,
      )
      .bind(
        completion.completedAt,
        completion.artifactKey,
        completion.rowCount,
        completion.completedAt,
        runId,
        processorAttempt,
      )
      .run();
    return (result.meta.changes ?? 0) === 1;
  }

  async completeFailed(
    runId: string,
    processorAttempt: number,
    completion: { readonly completedAt: string; readonly error: EvaluationExportFailure },
  ): Promise<boolean> {
    const result = await this.database
      .prepare(
        `UPDATE evaluation_export_runs
            SET status = 'failed', completed_at = ?, artifact_key = NULL, row_count = NULL,
                error_code = ?, error_message = ?, error_retryable = 1, updated_at = ?
          WHERE id = ? AND status = 'running' AND processor_attempt = ?`,
      )
      .bind(
        completion.completedAt,
        completion.error.code,
        completion.error.message,
        completion.completedAt,
        runId,
        processorAttempt,
      )
      .run();
    return (result.meta.changes ?? 0) === 1;
  }
}
