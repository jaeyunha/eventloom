import type { D1Database } from "@cloudflare/workers-types";
import { describe, expect, it, vi } from "vitest";
import type { EvaluationDecision } from "../../features/evaluations/types";
import { D1EvaluationRepository } from "./repositories/evaluations";
import type { CloudflareOutboxMessage } from "./bindings";
import {
  dispatchPendingEvaluationDecisionJobs,
  evaluationDecisionOutboxJobId,
} from "./evaluation-decision-outbox";
import { evaluationExportDatabase, migration, NOW } from "./evaluation-export-jobs.test-support";
import {
  consumeOutboxQueue,
  D1OutboxJobRepository,
  type OutboxQueueMessage,
} from "./outbox-consumer";

function decision(version = 1): EvaluationDecision {
  const history = [
    {
      from: null,
      to: "accepted" as const,
      reason: "Strong program fit.",
      decidedBy: "organizer-1",
      decidedAt: NOW,
      idempotencyKey: "decision-request-1",
    },
    {
      from: "accepted" as const,
      to: "rejected" as const,
      reason: "The program scope changed.",
      decidedBy: "organizer-1",
      decidedAt: "2026-08-16T12:05:00.000Z",
      idempotencyKey: "decision-request-2",
    },
  ];
  return {
    id: "decision-1",
    tenantId: "tenant-1",
    eventId: "event-1",
    planId: "plan-1",
    submissionId: "submission-1",
    status: history[version - 1]?.to ?? "accepted",
    version,
    history: history.slice(0, version),
    updatedAt: history[version - 1]?.decidedAt ?? NOW,
  };
}

function decisionDatabase() {
  const database = evaluationExportDatabase();
  database.executeScript(migration("0046_evaluation_decision_outbox.sql"));
  database.executeScript(`
    CREATE TABLE organizations (organization_id TEXT PRIMARY KEY NOT NULL);
    CREATE TABLE events (
      organization_id TEXT NOT NULL,
      id TEXT NOT NULL,
      PRIMARY KEY (organization_id, id)
    );
    CREATE TABLE submissions (
      organization_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      id TEXT NOT NULL,
      PRIMARY KEY (organization_id, event_id, id)
    );
    ${migration("0009_evaluations.sql")}
    INSERT INTO organizations (organization_id) VALUES ('tenant-1');
    INSERT INTO events (organization_id,id) VALUES ('tenant-1','event-1');
    INSERT INTO submissions (organization_id,event_id,id)
    VALUES ('tenant-1','event-1','submission-1');
    INSERT INTO review_plans
      (id,organization_id,event_id,name,status,blind_review,closes_at,reviews_per_submission,
       max_assignments_per_reviewer,track_filter,auto_distribute,
       reviewer_projection_field_ids_json,reviewer_projection_file_ids_json,
       grading_revision,grading_locked_at,version,created_at,updated_at)
    VALUES
      ('plan-1','tenant-1','event-1','Review','closed',0,NULL,1,5,NULL,0,'[]','[]',
       NULL,NULL,1,'${NOW}','${NOW}');
  `);
  return database;
}

function queueMessage(body: CloudflareOutboxMessage): OutboxQueueMessage & {
  acked: boolean;
  retryDelaySeconds: number | null;
} {
  return {
    body,
    attempts: 0,
    acked: false,
    retryDelaySeconds: null,
    ack() {
      this.acked = true;
    },
    retry(options) {
      this.retryDelaySeconds = options?.delaySeconds ?? 0;
    },
  };
}

describe("evaluation decision outbox", () => {
  it("widens the shared topic constraint without losing existing outbox rows", () => {
    const database = evaluationExportDatabase();
    database.executeScript(`
      INSERT INTO outbox_jobs
        (id,tenant_id,topic,deduplication_key,payload_json,state,attempt_count,
         available_at,created_at,updated_at)
      VALUES
        ('existing-report','tenant-1','reports','report-key',
         '{"kind":"evaluation_review_export","runId":"existing-report"}',
         'queued',0,'${NOW}','${NOW}','${NOW}');
    `);

    database.executeScript(migration("0046_evaluation_decision_outbox.sql"));

    expect(database.query("SELECT id,topic,state FROM outbox_jobs")).toEqual([
      { id: "existing-report", topic: "reports", state: "queued" },
    ]);
    expect(database.query("PRAGMA foreign_key_check")).toEqual([]);
  });

  it("commits decision work atomically and recovers publication after an interruption", async () => {
    const database = decisionDatabase();
    const interruptedQueue = {
      async send() {
        throw new Error("queue unavailable after commit");
      },
    } as unknown as Queue<CloudflareOutboxMessage>;
    const repository = new D1EvaluationRepository(
      database as unknown as D1Database,
      interruptedQueue,
    );

    await repository.putDecision(decision(), null);

    expect(database.query("SELECT id,version,status FROM evaluation_decisions")).toEqual([
      { id: "decision-1", version: 1, status: "accepted" },
    ]);
    expect(
      database.query<Record<string, unknown>>(
        "SELECT id,topic,deduplication_key,state,payload_json FROM outbox_jobs WHERE topic='evaluation-decisions'",
      ),
    ).toEqual([
      {
        id: evaluationDecisionOutboxJobId("decision-1", 1),
        topic: "evaluation-decisions",
        deduplication_key: "evaluation-decision:plan-1:submission-1:v1",
        state: "pending",
        payload_json: JSON.stringify({
          kind: "evaluation_decision_work",
          tenantId: "tenant-1",
          eventId: "event-1",
          planId: "plan-1",
          submissionId: "submission-1",
          decisionId: "decision-1",
          decisionVersion: 1,
          status: "accepted",
          priorStatus: null,
          reason: "Strong program fit.",
          decidedBy: "organizer-1",
          decidedAt: NOW,
          transitionIdempotencyKey: "decision-request-1",
        }),
      },
    ]);

    const published: CloudflareOutboxMessage[] = [];
    await expect(
      dispatchPendingEvaluationDecisionJobs(
        database as unknown as D1Database,
        {
          send: async (message: CloudflareOutboxMessage) => {
            published.push(message);
          },
        } as unknown as Queue<CloudflareOutboxMessage>,
        { now: () => new Date("2026-08-16T12:10:00.000Z") },
      ),
    ).resolves.toEqual({ selected: 1, queued: 1, failed: 0 });
    expect(published).toEqual([
      {
        version: 1,
        jobId: evaluationDecisionOutboxJobId("decision-1", 1),
        tenantId: "tenant-1",
        topic: "evaluation-decisions",
        enqueuedAt: "2026-08-16T12:10:00.000Z",
      },
    ]);
  });

  it("keeps work versioned and processes duplicate queue delivery idempotently", async () => {
    const database = decisionDatabase();
    const repository = new D1EvaluationRepository(database as unknown as D1Database);
    await repository.putDecision(decision(1), null);
    await repository.putDecision(decision(2), 1);

    expect(
      database.query<Record<string, unknown>>(
        "SELECT id,deduplication_key FROM outbox_jobs WHERE topic='evaluation-decisions' ORDER BY id",
      ),
    ).toEqual([
      {
        id: evaluationDecisionOutboxJobId("decision-1", 1),
        deduplication_key: "evaluation-decision:plan-1:submission-1:v1",
      },
      {
        id: evaluationDecisionOutboxJobId("decision-1", 2),
        deduplication_key: "evaluation-decision:plan-1:submission-1:v2",
      },
    ]);

    const payload = {
      version: 1 as const,
      jobId: evaluationDecisionOutboxJobId("decision-1", 2),
      tenantId: "tenant-1",
      topic: "evaluation-decisions" as const,
      enqueuedAt: "2026-08-16T12:10:00.000Z",
    };
    const process = vi
      .fn<(payload: unknown, context: unknown) => Promise<undefined>>()
      .mockRejectedValueOnce(new Error("projection interrupted"))
      .mockResolvedValue(undefined);
    const interrupted = queueMessage(payload);
    await consumeOutboxQueue(
      { messages: [interrupted] } as unknown as MessageBatch<unknown>,
      {} as never,
      undefined,
      {
        repository: new D1OutboxJobRepository(database as unknown as D1Database),
        adapters: { "evaluation-decisions": process },
        now: () => new Date("2026-08-16T12:10:00.000Z"),
        leaseOwner: "decision-worker",
      },
    );
    expect(interrupted.acked).toBe(false);
    expect(interrupted.retryDelaySeconds).toBe(1);

    const recovered = queueMessage(payload);
    await consumeOutboxQueue(
      { messages: [recovered] } as unknown as MessageBatch<unknown>,
      {} as never,
      undefined,
      {
        repository: new D1OutboxJobRepository(database as unknown as D1Database),
        adapters: { "evaluation-decisions": process },
        now: () => new Date("2026-08-16T12:11:00.000Z"),
        leaseOwner: "decision-worker-recovery",
      },
    );
    expect(recovered.acked).toBe(true);

    const replay = queueMessage(payload);
    await consumeOutboxQueue(
      { messages: [replay] } as unknown as MessageBatch<unknown>,
      {} as never,
      undefined,
      {
        repository: new D1OutboxJobRepository(database as unknown as D1Database),
        adapters: { "evaluation-decisions": process },
        now: () => new Date("2026-08-16T12:12:00.000Z"),
        leaseOwner: "decision-worker-replay",
      },
    );
    expect(replay.acked).toBe(true);
    expect(process).toHaveBeenCalledTimes(2);
    expect(process).toHaveBeenLastCalledWith(
      expect.objectContaining({ decisionVersion: 2, status: "rejected" }),
      expect.objectContaining({ idempotencyKey: "evaluation-decision:plan-1:submission-1:v2" }),
    );
  });
});
