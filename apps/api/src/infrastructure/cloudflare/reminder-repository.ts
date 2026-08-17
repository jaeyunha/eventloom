import type {
  ReminderDispatch,
  ReminderOutboxDelivery,
  ReminderOutboxEnqueueInput,
  ReminderRepository,
  ReminderRun,
  ReminderSubject,
} from "../../features/communications/types";
import type { CloudflareOutboxMessage } from "./bindings";

type ReminderRunRow = {
  id: string;
  organization_id: string;
  event_id: string;
  trigger_type: ReminderRun["triggerType"];
  audience_type: ReminderRun["audienceType"];
  audience_revision: string;
  candidate_count: number;
  eligible_count: number;
  queued_count: number;
  skipped_count: number;
  failed_count: number;
  state: ReminderRun["state"];
  configuration_failure: string | null;
  actor_id: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type ReminderDispatchRow = {
  id: string;
  run_id: string;
  organization_id: string;
  event_id: string;
  recipient: string;
  task_id: string | null;
  review_assignment_id: string | null;
  eligibility_reason: string;
  cadence_window: string;
  idempotency_key: string;
  provider_message_id: string | null;
  status: ReminderDispatch["status"];
  skip_metadata_json: string | null;
  failure_metadata_json: string | null;
  created_at: string;
  updated_at: string;
  eligible_at: string | null;
  skipped_at: string | null;
  queued_at: string | null;
  provider_accepted_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  bounced_at: string | null;
  completed_at: string | null;
  outbox_job_id: string | null;
};

const runColumns = `id, organization_id, event_id, trigger_type, audience_type,
  audience_revision, candidate_count, eligible_count, queued_count, skipped_count,
  failed_count, state, configuration_failure, actor_id, started_at, completed_at,
  created_at, updated_at`;

const dispatchColumns = `id, run_id, organization_id, event_id, recipient, task_id,
  review_assignment_id, eligibility_reason, cadence_window, idempotency_key,
  provider_message_id, status, skip_metadata_json, failure_metadata_json, created_at,
  updated_at, eligible_at, skipped_at, queued_at, provider_accepted_at, delivered_at,
  failed_at, bounced_at, completed_at, outbox_job_id`;

function metadata(value: string | null): Readonly<Record<string, unknown>> | null {
  if (value === null) return null;
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Reminder metadata is not an object.");
  }
  return parsed as Readonly<Record<string, unknown>>;
}

function subject(row: ReminderDispatchRow): ReminderSubject {
  if (row.task_id !== null && row.review_assignment_id === null) {
    return { type: "task", taskId: row.task_id };
  }
  if (row.review_assignment_id !== null && row.task_id === null) {
    return { type: "review", reviewAssignmentId: row.review_assignment_id };
  }
  throw new Error("Reminder dispatch subject is invalid.");
}

function toRun(row: ReminderRunRow): ReminderRun {
  return {
    id: row.id,
    organizationId: row.organization_id,
    eventId: row.event_id,
    triggerType: row.trigger_type,
    audienceType: row.audience_type,
    audienceRevision: row.audience_revision,
    candidateCount: row.candidate_count,
    eligibleCount: row.eligible_count,
    queuedCount: row.queued_count,
    skippedCount: row.skipped_count,
    failedCount: row.failed_count,
    state: row.state,
    configurationFailure: row.configuration_failure,
    actorId: row.actor_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDispatch(row: ReminderDispatchRow): ReminderDispatch {
  return {
    id: row.id,
    runId: row.run_id,
    organizationId: row.organization_id,
    eventId: row.event_id,
    recipient: row.recipient,
    subject: subject(row),
    eligibilityReason: row.eligibility_reason,
    cadenceWindow: row.cadence_window,
    idempotencyKey: row.idempotency_key,
    providerMessageId: row.provider_message_id,
    status: row.status,
    skipMetadata: metadata(row.skip_metadata_json),
    failureMetadata: metadata(row.failure_metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    eligibleAt: row.eligible_at,
    skippedAt: row.skipped_at,
    queuedAt: row.queued_at,
    providerAcceptedAt: row.provider_accepted_at,
    deliveredAt: row.delivered_at,
    failedAt: row.failed_at,
    bouncedAt: row.bounced_at,
    completedAt: row.completed_at,
    outboxJobId: row.outbox_job_id,
  };
}

function subjectColumns(value: ReminderSubject): readonly [string | null, string | null] {
  return value.type === "task" ? [value.taskId, null] : [null, value.reviewAssignmentId];
}

function json(value: Readonly<Record<string, unknown>> | null): string | null {
  return value === null ? null : JSON.stringify(value);
}

export class D1ReminderRepository implements ReminderRepository {
  constructor(private readonly database: D1Database) {}

  async getRun(
    organizationId: string,
    eventId: string,
    runId: string,
  ): Promise<ReminderRun | undefined> {
    const row = await this.database
      .prepare(
        `SELECT ${runColumns} FROM reminder_runs WHERE organization_id = ? AND event_id = ? AND id = ? LIMIT 1`,
      )
      .bind(organizationId, eventId, runId)
      .first<ReminderRunRow>();
    return row === null ? undefined : toRun(row);
  }

  async listRuns(organizationId: string, eventId: string): Promise<readonly ReminderRun[]> {
    const rows = await this.database
      .prepare(
        `SELECT ${runColumns} FROM reminder_runs WHERE organization_id = ? AND event_id = ? ORDER BY started_at DESC, id DESC`,
      )
      .bind(organizationId, eventId)
      .all<ReminderRunRow>();
    return rows.results.map(toRun);
  }

  async insertRun(run: ReminderRun): Promise<ReminderRun> {
    await this.database
      .prepare(
        `INSERT INTO reminder_runs (${runColumns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        run.id,
        run.organizationId,
        run.eventId,
        run.triggerType,
        run.audienceType,
        run.audienceRevision,
        run.candidateCount,
        run.eligibleCount,
        run.queuedCount,
        run.skippedCount,
        run.failedCount,
        run.state,
        run.configurationFailure,
        run.actorId,
        run.startedAt,
        run.completedAt,
        run.createdAt,
        run.updatedAt,
      )
      .run();
    return run;
  }

  async updateRun(run: ReminderRun): Promise<ReminderRun> {
    const result = await this.database
      .prepare(
        `UPDATE reminder_runs SET trigger_type = ?, audience_type = ?, audience_revision = ?, candidate_count = ?, eligible_count = ?, queued_count = ?, skipped_count = ?, failed_count = ?, state = ?, configuration_failure = ?, actor_id = ?, started_at = ?, completed_at = ?, created_at = ?, updated_at = ? WHERE id = ? AND organization_id = ? AND event_id = ?`,
      )
      .bind(
        run.triggerType,
        run.audienceType,
        run.audienceRevision,
        run.candidateCount,
        run.eligibleCount,
        run.queuedCount,
        run.skippedCount,
        run.failedCount,
        run.state,
        run.configurationFailure,
        run.actorId,
        run.startedAt,
        run.completedAt,
        run.createdAt,
        run.updatedAt,
        run.id,
        run.organizationId,
        run.eventId,
      )
      .run();
    if ((result.meta.changes ?? 0) !== 1) throw new Error("Reminder run was not updated.");
    return run;
  }

  async getDispatch(
    organizationId: string,
    eventId: string,
    dispatchId: string,
  ): Promise<ReminderDispatch | undefined> {
    const row = await this.database
      .prepare(
        `SELECT ${dispatchColumns} FROM reminder_dispatches WHERE organization_id = ? AND event_id = ? AND id = ? LIMIT 1`,
      )
      .bind(organizationId, eventId, dispatchId)
      .first<ReminderDispatchRow>();
    return row === null ? undefined : toDispatch(row);
  }

  async findDispatchByIdempotency(
    organizationId: string,
    eventId: string,
    idempotencyKey: string,
  ): Promise<ReminderDispatch | undefined> {
    const row = await this.database
      .prepare(
        `SELECT ${dispatchColumns} FROM reminder_dispatches WHERE organization_id = ? AND event_id = ? AND idempotency_key = ? LIMIT 1`,
      )
      .bind(organizationId, eventId, idempotencyKey)
      .first<ReminderDispatchRow>();
    return row === null ? undefined : toDispatch(row);
  }

  async findDispatchByProviderMessageId(
    organizationId: string,
    eventId: string,
    providerMessageId: string,
  ): Promise<ReminderDispatch | undefined> {
    const row = await this.database
      .prepare(
        `SELECT ${dispatchColumns} FROM reminder_dispatches WHERE organization_id = ? AND event_id = ? AND provider_message_id = ? LIMIT 1`,
      )
      .bind(organizationId, eventId, providerMessageId)
      .first<ReminderDispatchRow>();
    return row === null ? undefined : toDispatch(row);
  }

  async listDispatches(
    organizationId: string,
    eventId: string,
    runId?: string,
  ): Promise<readonly ReminderDispatch[]> {
    const statement =
      runId === undefined
        ? this.database
            .prepare(
              `SELECT ${dispatchColumns} FROM reminder_dispatches WHERE organization_id = ? AND event_id = ? ORDER BY created_at DESC, id DESC`,
            )
            .bind(organizationId, eventId)
        : this.database
            .prepare(
              `SELECT ${dispatchColumns} FROM reminder_dispatches WHERE organization_id = ? AND event_id = ? AND run_id = ? ORDER BY created_at DESC, id DESC`,
            )
            .bind(organizationId, eventId, runId);
    const rows = await statement.all<ReminderDispatchRow>();
    return rows.results.map(toDispatch);
  }

  async insertDispatch(dispatch: ReminderDispatch): Promise<ReminderDispatch> {
    const [taskId, reviewAssignmentId] = subjectColumns(dispatch.subject);
    await this.database
      .prepare(
        `INSERT INTO reminder_dispatches (${dispatchColumns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        dispatch.id,
        dispatch.runId,
        dispatch.organizationId,
        dispatch.eventId,
        dispatch.recipient,
        taskId,
        reviewAssignmentId,
        dispatch.eligibilityReason,
        dispatch.cadenceWindow,
        dispatch.idempotencyKey,
        dispatch.providerMessageId,
        dispatch.status,
        json(dispatch.skipMetadata),
        json(dispatch.failureMetadata),
        dispatch.createdAt,
        dispatch.updatedAt,
        dispatch.eligibleAt,
        dispatch.skippedAt,
        dispatch.queuedAt,
        dispatch.providerAcceptedAt,
        dispatch.deliveredAt,
        dispatch.failedAt,
        dispatch.bouncedAt,
        dispatch.completedAt,
        dispatch.outboxJobId,
      )
      .run();
    return dispatch;
  }

  async updateDispatch(dispatch: ReminderDispatch): Promise<ReminderDispatch> {
    const [taskId, reviewAssignmentId] = subjectColumns(dispatch.subject);
    const result = await this.database
      .prepare(
        `UPDATE reminder_dispatches SET run_id = ?, recipient = ?, task_id = ?, review_assignment_id = ?, eligibility_reason = ?, cadence_window = ?, idempotency_key = ?, provider_message_id = ?, status = ?, skip_metadata_json = ?, failure_metadata_json = ?, created_at = ?, updated_at = ?, eligible_at = ?, skipped_at = ?, queued_at = ?, provider_accepted_at = ?, delivered_at = ?, failed_at = ?, bounced_at = ?, completed_at = ?, outbox_job_id = ? WHERE id = ? AND organization_id = ? AND event_id = ?`,
      )
      .bind(
        dispatch.runId,
        dispatch.recipient,
        taskId,
        reviewAssignmentId,
        dispatch.eligibilityReason,
        dispatch.cadenceWindow,
        dispatch.idempotencyKey,
        dispatch.providerMessageId,
        dispatch.status,
        json(dispatch.skipMetadata),
        json(dispatch.failureMetadata),
        dispatch.createdAt,
        dispatch.updatedAt,
        dispatch.eligibleAt,
        dispatch.skippedAt,
        dispatch.queuedAt,
        dispatch.providerAcceptedAt,
        dispatch.deliveredAt,
        dispatch.failedAt,
        dispatch.bouncedAt,
        dispatch.completedAt,
        dispatch.outboxJobId,
        dispatch.id,
        dispatch.organizationId,
        dispatch.eventId,
      )
      .run();
    if ((result.meta.changes ?? 0) !== 1) throw new Error("Reminder dispatch was not updated.");
    return dispatch;
  }
}

type OutboxStateRow = { id: string; state: string };
type PendingOutboxRow = { id: string };

export class CloudflareReminderOutbox implements ReminderOutboxDelivery {
  constructor(
    private readonly database: D1Database,
    private readonly queue: Queue<CloudflareOutboxMessage>,
  ) {}

  async requeuePending(input: {
    organizationId: string;
    eventId?: string;
  }): Promise<{ requeued: number }> {
    const rows = await this.database
      .prepare(
        `SELECT id
           FROM outbox_jobs
          WHERE tenant_id = ?
            AND topic = 'communications'
            AND state = 'pending'
            AND json_extract(payload_json, '$.effect') = 'send_reminder'
            AND (? IS NULL OR json_extract(payload_json, '$.eventId') = ?)
          ORDER BY created_at, id`,
      )
      .bind(input.organizationId, input.eventId ?? null, input.eventId ?? null)
      .all<PendingOutboxRow>();
    let requeued = 0;
    for (const row of rows.results) {
      const now = new Date().toISOString();
      await this.queue.send({
        version: 1,
        jobId: row.id,
        tenantId: input.organizationId,
        topic: "communications",
        enqueuedAt: now,
      });
      const result = await this.database
        .prepare(
          "UPDATE outbox_jobs SET state = 'queued', updated_at = ? WHERE id = ? AND tenant_id = ? AND topic = 'communications' AND state = 'pending'",
        )
        .bind(now, row.id, input.organizationId)
        .run();
      requeued += result.meta.changes ?? 0;
    }
    return { requeued };
  }

  async enqueue(input: ReminderOutboxEnqueueInput): Promise<{ outboxJobId: string }> {
    const now = new Date().toISOString();
    const outboxJobId = `reminder-outbox:${input.dispatchId}`;
    await this.database
      .prepare(
        `INSERT INTO outbox_jobs (id, tenant_id, topic, deduplication_key, payload_json, state, attempt_count, available_at, created_at, updated_at) VALUES (?, ?, 'communications', ?, ?, 'pending', 0, ?, ?, ?) ON CONFLICT (tenant_id, topic, deduplication_key) DO NOTHING`,
      )
      .bind(
        outboxJobId,
        input.organizationId,
        input.idempotencyKey,
        JSON.stringify({
          effect: "send_reminder",
          eventId: input.eventId,
          runId: input.runId,
          dispatchId: input.dispatchId,
          payload: {
            from: input.from,
            senderPurpose: input.senderPurpose,
            to: [input.recipient],
            subject: input.subject,
            html: input.html,
            text: input.text,
            idempotencyKey: input.idempotencyKey,
          },
        }),
        now,
        now,
        now,
      )
      .run();
    const row = await this.database
      .prepare(
        "SELECT id, state FROM outbox_jobs WHERE tenant_id = ? AND topic = 'communications' AND deduplication_key = ? LIMIT 1",
      )
      .bind(input.organizationId, input.idempotencyKey)
      .first<OutboxStateRow>();
    if (row === null) throw new Error("The reminder outbox job was not persisted.");
    if (row.state === "pending") {
      await this.queue.send({
        version: 1,
        jobId: row.id,
        tenantId: input.organizationId,
        topic: "communications",
        enqueuedAt: now,
      });
      await this.database
        .prepare(
          "UPDATE outbox_jobs SET state = 'queued', updated_at = ? WHERE id = ? AND state = 'pending'",
        )
        .bind(now, row.id)
        .run();
    }
    return { outboxJobId: row.id };
  }
}
