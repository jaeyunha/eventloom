import {
  type EvaluationExport,
  type EvaluationExportArtifactStore,
  type EvaluationExportCoordinatorDependencies,
  type EvaluationExportDownload,
  EvaluationExportError,
  EvaluationExportGenerationError,
  type EvaluationExportGeneration,
  type EvaluationExportGenerator,
  type EvaluationExportQueue,
  type EvaluationExportRequest,
  type EvaluationExportScope,
  type EvaluationExportStore,
  type QueuedEvaluationExport,
} from "./export-job-types";

function requestFingerprint(input: EvaluationExportRequest): string {
  return JSON.stringify({
    tenantId: input.tenantId,
    eventId: input.eventId,
    planId: input.planId,
    planVersion: input.planVersion,
    requestedBy: input.requestedBy,
  });
}

function requireText(value: string, label: string): string {
  const result = value.trim();
  if (result.length === 0) {
    throw new EvaluationExportError(
      "EVALUATION_EXPORT_INVALID_INPUT",
      `${label} is required.`,
      400,
    );
  }
  return result;
}

function normalizeRequest(input: EvaluationExportRequest): EvaluationExportRequest {
  if (!Number.isSafeInteger(input.planVersion) || input.planVersion < 1) {
    throw new EvaluationExportError(
      "EVALUATION_EXPORT_INVALID_INPUT",
      "Plan version must be a positive integer.",
      400,
    );
  }
  return {
    tenantId: requireText(input.tenantId, "Tenant ID"),
    eventId: requireText(input.eventId, "Event ID"),
    planId: requireText(input.planId, "Plan ID"),
    planVersion: input.planVersion,
    requestedBy: requireText(input.requestedBy, "Requester ID"),
    idempotencyKey: requireText(input.idempotencyKey, "Idempotency key"),
  };
}

function artifactKey(job: EvaluationExport, processorAttempt: number): string {
  return [
    "evaluation-exports",
    job.tenantId,
    job.eventId,
    job.planId,
    job.id,
    `attempt-${processorAttempt}.csv`,
  ]
    .map(encodeURIComponent)
    .join("/");
}

function exportFileName(planId: string): string {
  const safePlanId = planId
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 96);
  return `evaluation-${safePlanId || "review-results"}.csv`;
}

const PUBLIC_FAILURE_MESSAGE = "The evaluation export could not be generated. Retry the export.";

function reportGenerationFailure(error: unknown, job: EvaluationExport): void {
  const reportedError =
    error instanceof Error && error.cause instanceof Error ? error.cause : error;
  console.error(
    JSON.stringify({
      level: "error",
      event: "evaluation_export_generation_failed",
      runId: job.id,
      tenantId: job.tenantId,
      eventId: job.eventId,
      planId: job.planId,
      errorName: reportedError instanceof Error ? reportedError.name : "UnknownError",
      errorMessage:
        reportedError instanceof Error
          ? reportedError.message.slice(0, 500)
          : "Unknown export error",
    }),
  );
}

function notFound(): EvaluationExportError {
  return new EvaluationExportError(
    "EVALUATION_EXPORT_NOT_FOUND",
    "The evaluation export was not found in this tenant, event, and review plan.",
    404,
  );
}

function isInScope(job: EvaluationExport, scope: EvaluationExportScope): boolean {
  return (
    job.tenantId === scope.tenantId && job.eventId === scope.eventId && job.planId === scope.planId
  );
}

export class EvaluationExportCoordinator {
  readonly #store: EvaluationExportStore;
  readonly #artifacts: EvaluationExportArtifactStore;
  readonly #queue: EvaluationExportQueue;
  readonly #generator: EvaluationExportGenerator;
  readonly #clock: () => Date;
  readonly #idFactory: () => string;

  constructor(dependencies: EvaluationExportCoordinatorDependencies) {
    this.#store = dependencies.store;
    this.#artifacts = dependencies.artifacts;
    this.#queue = dependencies.queue;
    this.#generator = dependencies.generator;
    this.#clock = dependencies.clock;
    this.#idFactory = dependencies.idFactory;
  }

  async request(input: EvaluationExportRequest): Promise<EvaluationExport> {
    const request = normalizeRequest(input);
    const id = requireText(this.#idFactory(), "Export ID");
    const job: QueuedEvaluationExport = {
      id,
      tenantId: request.tenantId,
      eventId: request.eventId,
      planId: request.planId,
      planVersion: request.planVersion,
      requestedBy: request.requestedBy,
      idempotencyKey: request.idempotencyKey,
      requestFingerprint: requestFingerprint(request),
      fileName: exportFileName(request.planId),
      requestedAt: this.#clock().toISOString(),
      status: "queued",
    };
    const result = await this.#store.create(job);
    if (result.status === "conflict") {
      throw new EvaluationExportError(
        "EVALUATION_EXPORT_IDEMPOTENCY_CONFLICT",
        "The idempotency key was already used for a different evaluation export request.",
        409,
      );
    }
    if (result.status === "existing") {
      if (result.job.status === "queued") {
        await this.#queue.enqueue(result.job.id);
      }
      return result.job;
    }
    await this.#queue.enqueue(result.job.id);
    return result.job;
  }

  async process(runId: string, processorAttempt = 1): Promise<void> {
    const normalizedRunId = requireText(runId, "Export run ID");
    const running = await this.#store.claim(
      normalizedRunId,
      this.#clock().toISOString(),
      processorAttempt,
    );
    if (running === undefined) return;
    let generated: EvaluationExportGeneration;
    try {
      generated = await this.#generator.generate(running);
    } catch (error) {
      if (!(error instanceof EvaluationExportGenerationError)) throw error;
      reportGenerationFailure(error, running);
      await this.#store.completeFailed(running.id, processorAttempt, {
        completedAt: this.#clock().toISOString(),
        error: {
          code: "EVALUATION_EXPORT_GENERATION_FAILED",
          message: PUBLIC_FAILURE_MESSAGE,
          retryable: true,
        },
      });
      return;
    }
    const key = artifactKey(running, processorAttempt);
    await this.#artifacts.put(key, {
      body: generated.body,
      contentType: "text/csv; charset=utf-8",
    });
    await this.#store.completeReady(running.id, processorAttempt, {
      completedAt: this.#clock().toISOString(),
      artifactKey: key,
      rowCount: generated.rowCount,
    });
  }

  async failProcessing(runId: string, processorAttempt: number): Promise<boolean> {
    return this.#store.completeFailed(runId, processorAttempt, {
      completedAt: this.#clock().toISOString(),
      error: {
        code: "EVALUATION_EXPORT_PROCESSING_EXHAUSTED",
        message:
          "The evaluation export could not be completed after repeated service failures. Retry the export.",
        retryable: true,
      },
    });
  }

  async get(scope: EvaluationExportScope): Promise<EvaluationExport> {
    const job = await this.#store.get(scope.runId);
    if (job === undefined || !isInScope(job, scope)) {
      throw notFound();
    }
    return job;
  }

  async download(scope: EvaluationExportScope): Promise<EvaluationExportDownload> {
    const job = await this.get(scope);
    if (job.status === "failed") {
      throw new EvaluationExportError(
        "EVALUATION_EXPORT_FAILED",
        "The evaluation export failed. Request a new export to retry.",
        409,
      );
    }
    if (job.status !== "ready") {
      throw new EvaluationExportError(
        "EVALUATION_EXPORT_NOT_READY",
        "The evaluation export is still processing. Retry the download after it is ready.",
        409,
      );
    }
    const artifact = await this.#artifacts.get(job.artifactKey);
    if (artifact === undefined) {
      throw new EvaluationExportError(
        "EVALUATION_EXPORT_ARTIFACT_UNAVAILABLE",
        "The completed evaluation export artifact is unavailable. Request a new export.",
        503,
      );
    }
    return { ...artifact, fileName: job.fileName };
  }
}
