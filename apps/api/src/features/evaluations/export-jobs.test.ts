import { describe, expect, it } from "vitest";
import {
  EvaluationExportCoordinator,
  EvaluationExportGenerationError,
  InMemoryEvaluationExportArtifactStore,
  InMemoryEvaluationExportStore,
} from "./export-jobs";

function deferred<T = void>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function parseCsvLine(line: string): readonly string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"' && value.length === 0) {
      quoted = true;
    } else if (character === ",") {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}

describe("evaluation export jobs", () => {
  it("returns queued before deterministic processing completes and stores one exact artifact", async () => {
    const generationStarted = deferred();
    const releaseGeneration = deferred();
    const enqueuedRunIds: string[] = [];
    let generationCalls = 0;
    const store = new InMemoryEvaluationExportStore();
    const artifacts = new InMemoryEvaluationExportArtifactStore();
    const csv = [
      "Title,Lifecycle status,Decision status,Aggregate score,Recommendation,Quality",
      "Proposal One,submitted,undecided,5,accept,4",
      "",
    ].join("\n");
    const coordinator = new EvaluationExportCoordinator({
      store,
      artifacts,
      queue: {
        enqueue: async (runId) => {
          enqueuedRunIds.push(runId);
        },
      },
      generator: {
        generate: async () => {
          generationCalls += 1;
          generationStarted.resolve();
          await releaseGeneration.promise;
          return { body: csv, rowCount: 1 };
        },
      },
      clock: () => new Date("2026-08-16T20:00:00.000Z"),
      idFactory: () => "evaluation-export-1",
    });

    const requested = await coordinator.request({
      tenantId: "tenant-1",
      eventId: "event-1",
      planId: "plan-1",
      planVersion: 2,
      requestedBy: "organizer-1",
      idempotencyKey: "review-results-plan-1-v2",
    });
    expect(requested).toMatchObject({
      id: "evaluation-export-1",
      status: "queued",
      fileName: "evaluation-plan-1.csv",
    });
    expect(enqueuedRunIds).toEqual(["evaluation-export-1"]);

    const processing = coordinator.process(requested.id);
    await generationStarted.promise;
    await expect(
      coordinator.get({
        tenantId: "tenant-1",
        eventId: "event-1",
        planId: "plan-1",
        runId: requested.id,
      }),
    ).resolves.toMatchObject({ status: "running" });

    releaseGeneration.resolve();
    await processing;
    const ready = await coordinator.get({
      tenantId: "tenant-1",
      eventId: "event-1",
      planId: "plan-1",
      runId: requested.id,
    });
    expect(ready).toMatchObject({
      status: "ready",
      rowCount: 1,
      completedAt: "2026-08-16T20:00:00.000Z",
    });

    const download = await coordinator.download({
      tenantId: "tenant-1",
      eventId: "event-1",
      planId: "plan-1",
      runId: requested.id,
    });
    const [headers, values] = download.body.trim().split("\n").map(parseCsvLine);
    expect(
      Object.fromEntries((headers ?? []).map((header, index) => [header, values?.[index]])),
    ).toEqual({
      Title: "Proposal One",
      "Lifecycle status": "submitted",
      "Decision status": "undecided",
      "Aggregate score": "5",
      Recommendation: "accept",
      Quality: "4",
    });

    await coordinator.process(requested.id);
    expect(generationCalls).toBe(1);
    expect(artifacts.putCount).toBe(1);
  });

  it("uses a safe ASCII filename for unsafe plan identifiers", async () => {
    const coordinator = new EvaluationExportCoordinator({
      store: new InMemoryEvaluationExportStore(),
      artifacts: new InMemoryEvaluationExportArtifactStore(),
      queue: { enqueue: async () => undefined },
      generator: {
        generate: async () => ({ body: "Title\nProposal One\n", rowCount: 1 }),
      },
      clock: () => new Date("2026-08-16T20:00:00.000Z"),
      idFactory: () => "evaluation-export-1",
    });

    await expect(
      coordinator.request({
        tenantId: "tenant-1",
        eventId: "event-1",
        planId: 'plan"\r\n unsafe',
        planVersion: 2,
        requestedBy: "organizer-1",
        idempotencyKey: "unsafe-plan-filename",
      }),
    ).resolves.toMatchObject({
      fileName: "evaluation-plan-unsafe.csv",
    });
  });

  it("fences concurrent processors and preserves the newest attempt artifact", async () => {
    const firstStarted = deferred();
    const releaseFirst = deferred();
    const store = new InMemoryEvaluationExportStore();
    const artifacts = new InMemoryEvaluationExportArtifactStore();
    const attempts: number[] = [];
    const coordinator = new EvaluationExportCoordinator({
      store,
      artifacts,
      queue: { enqueue: async () => undefined },
      generator: {
        generate: async (job) => {
          attempts.push(job.processorAttempt);
          if (job.processorAttempt === 1) {
            firstStarted.resolve();
            await releaseFirst.promise;
            return { body: "Title\nstale\n", rowCount: 1 };
          }
          return { body: "Title\ncurrent\n", rowCount: 2 };
        },
      },
      clock: () => new Date("2026-08-16T20:00:00.000Z"),
      idFactory: () => "evaluation-export-1",
    });
    const request = {
      tenantId: "tenant-1",
      eventId: "event-1",
      planId: "plan-1",
      planVersion: 2,
      requestedBy: "organizer-1",
      idempotencyKey: "attempt-1",
    };
    const queued = await coordinator.request(request);

    const first = coordinator.process(queued.id, 1);
    await firstStarted.promise;
    await coordinator.process(queued.id, 1);
    await coordinator.process(queued.id, 2);
    releaseFirst.resolve();
    await first;

    await expect(coordinator.get({ ...request, runId: queued.id })).resolves.toMatchObject({
      status: "ready",
      processorAttempt: 2,
      rowCount: 2,
    });
    await expect(coordinator.download({ ...request, runId: queued.id })).resolves.toMatchObject({
      body: "Title\ncurrent\n",
    });
    expect(attempts).toEqual([1, 2]);
    expect(artifacts.putCount).toBe(2);
  });

  it("propagates artifact and ready-persistence failures for outbox retry", async () => {
    const request = {
      tenantId: "tenant-1",
      eventId: "event-1",
      planId: "plan-1",
      planVersion: 2,
      requestedBy: "organizer-1",
      idempotencyKey: "attempt-1",
    };
    const artifactStore = new InMemoryEvaluationExportArtifactStore();
    const artifactFailureStore = new InMemoryEvaluationExportStore();
    const artifactCoordinator = new EvaluationExportCoordinator({
      store: artifactFailureStore,
      artifacts: {
        put: async () => {
          throw new Error("R2 unavailable");
        },
        get: (key) => artifactStore.get(key),
      },
      queue: { enqueue: async () => undefined },
      generator: {
        generate: async () => ({ body: "Title\nProposal One\n", rowCount: 1 }),
      },
      clock: () => new Date("2026-08-16T20:00:00.000Z"),
      idFactory: () => "artifact-failure",
    });
    const artifactRun = await artifactCoordinator.request(request);
    await expect(artifactCoordinator.process(artifactRun.id, 1)).rejects.toThrow("R2 unavailable");
    await expect(
      artifactCoordinator.get({ ...request, runId: artifactRun.id }),
    ).resolves.toMatchObject({ status: "running", processorAttempt: 1 });

    const readyFailureStore = new InMemoryEvaluationExportStore();
    const readyCoordinator = new EvaluationExportCoordinator({
      store: {
        create: (job) => readyFailureStore.create(job),
        get: (runId) => readyFailureStore.get(runId),
        claim: (runId, startedAt, attempt) => readyFailureStore.claim(runId, startedAt, attempt),
        completeReady: async () => {
          throw new Error("D1 ready transition unavailable");
        },
        completeFailed: (runId, attempt, completion) =>
          readyFailureStore.completeFailed(runId, attempt, completion),
      },
      artifacts: artifactStore,
      queue: { enqueue: async () => undefined },
      generator: {
        generate: async () => ({ body: "Title\nProposal One\n", rowCount: 1 }),
      },
      clock: () => new Date("2026-08-16T20:00:00.000Z"),
      idFactory: () => "ready-failure",
    });
    const readyRun = await readyCoordinator.request({
      ...request,
      idempotencyKey: "attempt-2",
    });
    await expect(readyCoordinator.process(readyRun.id, 1)).rejects.toThrow(
      "D1 ready transition unavailable",
    );
    await expect(
      readyCoordinator.get({
        tenantId: request.tenantId,
        eventId: request.eventId,
        planId: request.planId,
        runId: readyRun.id,
      }),
    ).resolves.toMatchObject({ status: "running", processorAttempt: 1 });
  });

  it("persists an actionable failure and permits a distinct retry", async () => {
    const enqueuedRunIds: string[] = [];
    let nextId = 0;
    const coordinator = new EvaluationExportCoordinator({
      store: new InMemoryEvaluationExportStore(),
      artifacts: new InMemoryEvaluationExportArtifactStore(),
      queue: {
        enqueue: async (runId) => {
          enqueuedRunIds.push(runId);
        },
      },
      generator: {
        generate: async () => {
          throw new EvaluationExportGenerationError(
            "D1_ERROR: no such table evaluation_review_scores; bucket=private-files",
          );
        },
      },
      clock: () => new Date("2026-08-16T20:00:00.000Z"),
      idFactory: () => {
        nextId += 1;
        return `evaluation-export-${nextId}`;
      },
    });
    const request = {
      tenantId: "tenant-1",
      eventId: "event-1",
      planId: "plan-1",
      planVersion: 2,
      requestedBy: "organizer-1",
    } as const;

    const failedAttempt = await coordinator.request({
      ...request,
      idempotencyKey: "review-results-plan-1-v2-attempt-1",
    });
    await coordinator.process(failedAttempt.id);
    await expect(coordinator.get({ ...request, runId: failedAttempt.id })).resolves.toMatchObject({
      status: "failed",
      error: {
        code: "EVALUATION_EXPORT_GENERATION_FAILED",
        message: "The evaluation export could not be generated. Retry the export.",
        retryable: true,
      },
    });
    await expect(
      coordinator.download({ ...request, runId: failedAttempt.id }),
    ).rejects.toMatchObject({
      code: "EVALUATION_EXPORT_FAILED",
      message: "The evaluation export failed. Request a new export to retry.",
    });

    const retry = await coordinator.request({
      ...request,
      idempotencyKey: "review-results-plan-1-v2-attempt-2",
    });
    expect(retry.id).not.toBe(failedAttempt.id);
    expect(retry.status).toBe("queued");
    expect(enqueuedRunIds).toEqual([failedAttempt.id, retry.id]);
  });

  it("republishes the same queued job after a transient queue failure", async () => {
    let enqueueAttempts = 0;
    const coordinator = new EvaluationExportCoordinator({
      store: new InMemoryEvaluationExportStore(),
      artifacts: new InMemoryEvaluationExportArtifactStore(),
      queue: {
        enqueue: async () => {
          enqueueAttempts += 1;
          if (enqueueAttempts === 1) throw new Error("Queue unavailable.");
        },
      },
      generator: {
        generate: async () => ({ body: "Title\nProposal One\n", rowCount: 1 }),
      },
      clock: () => new Date("2026-08-16T20:00:00.000Z"),
      idFactory: () => "evaluation-export-1",
    });
    const request = {
      tenantId: "tenant-1",
      eventId: "event-1",
      planId: "plan-1",
      planVersion: 2,
      requestedBy: "organizer-1",
      idempotencyKey: "review-results-plan-1-v2",
    } as const;

    await expect(coordinator.request(request)).rejects.toThrow("Queue unavailable.");
    await expect(coordinator.request(request)).resolves.toMatchObject({
      id: "evaluation-export-1",
      status: "queued",
    });
    expect(enqueueAttempts).toBe(2);
  });
});
