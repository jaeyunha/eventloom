import type { EvaluationDecision } from "../../features/evaluations/types";
import type { CloudflareEvaluationDecisionPayload, CloudflareOutboxMessage } from "./bindings";

const DEFAULT_DISPATCH_LIMIT = 50;
const MAX_DISPATCH_LIMIT = 100;

interface RecoverableDecisionJobRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly state: string;
  readonly attempt_count: number;
  readonly lease_owner: string | null;
  readonly lease_expires_at: string | null;
}

export function evaluationDecisionWorkKey(
  planId: string,
  submissionId: string,
  decisionVersion: number,
): string {
  return `evaluation-decision:${planId}:${submissionId}:v${decisionVersion}`;
}

export function evaluationDecisionOutboxJobId(decisionId: string, decisionVersion: number): string {
  return `evaluation-decision:${decisionId}:v${decisionVersion}`;
}

export function evaluationDecisionWorkPayload(
  decision: EvaluationDecision,
): CloudflareEvaluationDecisionPayload {
  const transition = decision.history[decision.version - 1];
  if (transition === undefined) {
    throw new TypeError("The decision version has no matching transition.");
  }
  return {
    kind: "evaluation_decision_work",
    tenantId: decision.tenantId,
    eventId: decision.eventId,
    planId: decision.planId,
    submissionId: decision.submissionId,
    decisionId: decision.id,
    decisionVersion: decision.version,
    status: transition.to,
    priorStatus: transition.from,
    reason: transition.reason,
    decidedBy: transition.decidedBy,
    decidedAt: transition.decidedAt,
    transitionIdempotencyKey: transition.idempotencyKey,
  };
}

export async function publishEvaluationDecisionJob(
  database: D1Database,
  queue: Queue<CloudflareOutboxMessage>,
  jobId: string,
  tenantId: string,
  now: () => Date = () => new Date(),
): Promise<boolean> {
  const row = await database
    .prepare(
      `SELECT id, tenant_id
         FROM outbox_jobs
        WHERE id = ? AND tenant_id = ? AND topic = 'evaluation-decisions'
          AND state IN ('pending', 'queued')
        LIMIT 1`,
    )
    .bind(jobId, tenantId)
    .first<{ id: string; tenant_id: string }>();
  if (row === null) return false;
  const enqueuedAt = now().toISOString();
  await queue.send({
    version: 1,
    jobId: row.id,
    tenantId: row.tenant_id,
    topic: "evaluation-decisions",
    enqueuedAt,
  });
  await database
    .prepare(
      `UPDATE outbox_jobs
          SET state = 'queued', updated_at = ?
        WHERE id = ? AND tenant_id = ? AND topic = 'evaluation-decisions' AND state = 'pending'`,
    )
    .bind(enqueuedAt, row.id, row.tenant_id)
    .run();
  return true;
}

export interface PendingEvaluationDecisionDispatchOptions {
  readonly limit?: number;
  readonly now?: () => Date;
  readonly beforePublish?: (jobId: string) => Promise<void>;
}

export interface PendingEvaluationDecisionDispatchResult {
  readonly selected: number;
  readonly queued: number;
  readonly failed: number;
}

/** Re-publishes committed decision work that was interrupted before Queue accepted it. */
export async function dispatchPendingEvaluationDecisionJobs(
  database: D1Database,
  queue: Queue<CloudflareOutboxMessage>,
  options: PendingEvaluationDecisionDispatchOptions = {},
): Promise<PendingEvaluationDecisionDispatchResult> {
  const limit = options.limit ?? DEFAULT_DISPATCH_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_DISPATCH_LIMIT) {
    throw new TypeError(
      `Pending evaluation decision dispatch limit must be between 1 and ${MAX_DISPATCH_LIMIT}.`,
    );
  }
  const now = options.now ?? (() => new Date());
  const recoveredAt = now();
  const result = await database
    .prepare(
      `SELECT id, tenant_id, state, attempt_count, lease_owner, lease_expires_at
         FROM outbox_jobs
        WHERE topic = 'evaluation-decisions'
          AND available_at <= ?
          AND (
            state = 'pending'
            OR (
              state = 'processing'
              AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
            )
          )
        ORDER BY available_at, created_at, id
        LIMIT ?`,
    )
    .bind(recoveredAt.toISOString(), recoveredAt.toISOString(), limit)
    .all<RecoverableDecisionJobRow>();

  let queued = 0;
  let failed = 0;
  for (const row of result.results) {
    try {
      await options.beforePublish?.(row.id);
      await queue.send({
        version: 1,
        jobId: row.id,
        tenantId: row.tenant_id,
        topic: "evaluation-decisions",
        enqueuedAt: recoveredAt.toISOString(),
      });
      await database
        .prepare(
          `UPDATE outbox_jobs
              SET state = 'queued', lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
            WHERE id = ? AND tenant_id = ? AND topic = 'evaluation-decisions'
              AND state = ? AND attempt_count = ?
              AND lease_owner IS ? AND lease_expires_at IS ?`,
        )
        .bind(
          recoveredAt.toISOString(),
          row.id,
          row.tenant_id,
          row.state,
          row.attempt_count,
          row.lease_owner,
          row.lease_expires_at,
        )
        .run();
      queued += 1;
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "evaluation_decision_recovery_failed",
          jobId: row.id,
          errorName: error instanceof Error ? error.name : "UnknownError",
          errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
        }),
      );
      failed += 1;
    }
  }
  return { selected: result.results.length, queued, failed };
}
