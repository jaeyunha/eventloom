import {
  type EvaluationExport,
  type EvaluationExportArtifact,
  type EvaluationExportArtifactStore,
  type EvaluationExportCreateResult,
  EvaluationExportError,
  type EvaluationExportFailure,
  type EvaluationExportStore,
  type FailedEvaluationExport,
  type QueuedEvaluationExport,
  type ReadyEvaluationExport,
  type RunningEvaluationExport,
} from "./export-job-types";

function idempotencyScope(job: EvaluationExport): string {
  return `${job.tenantId}\u0000${job.idempotencyKey}`;
}

export class InMemoryEvaluationExportStore implements EvaluationExportStore {
  readonly #jobs = new Map<string, EvaluationExport>();
  readonly #idempotency = new Map<string, string>();

  async create(job: QueuedEvaluationExport): Promise<EvaluationExportCreateResult> {
    const scope = idempotencyScope(job);
    const existingId = this.#idempotency.get(scope);
    if (existingId !== undefined) {
      const existing = this.#jobs.get(existingId);
      if (existing === undefined) {
        throw new Error("Evaluation export idempotency index is inconsistent.");
      }
      return existing.requestFingerprint === job.requestFingerprint
        ? { status: "existing", job: existing }
        : { status: "conflict" };
    }
    if (this.#jobs.has(job.id)) {
      throw new EvaluationExportError(
        "EVALUATION_EXPORT_IDEMPOTENCY_CONFLICT",
        "The generated evaluation export ID is already in use. Retry the request.",
        409,
      );
    }
    this.#jobs.set(job.id, job);
    this.#idempotency.set(scope, job.id);
    return { status: "created", job };
  }

  async get(runId: string): Promise<EvaluationExport | undefined> {
    return this.#jobs.get(runId);
  }

  async claim(
    runId: string,
    startedAt: string,
    processorAttempt: number,
  ): Promise<RunningEvaluationExport | undefined> {
    const current = this.#jobs.get(runId);
    if (
      current === undefined ||
      current.status === "ready" ||
      current.status === "failed" ||
      (current.status === "running" && current.processorAttempt >= processorAttempt)
    ) {
      return undefined;
    }
    const running: RunningEvaluationExport = {
      ...current,
      status: "running",
      startedAt,
      processorAttempt,
    };
    this.#jobs.set(runId, running);
    return running;
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
    const current = this.#jobs.get(runId);
    if (
      current === undefined ||
      current.status !== "running" ||
      current.processorAttempt !== processorAttempt
    ) {
      return false;
    }
    const ready: ReadyEvaluationExport = {
      ...current,
      status: "ready",
      completedAt: completion.completedAt,
      artifactKey: completion.artifactKey,
      rowCount: completion.rowCount,
    };
    this.#jobs.set(runId, ready);
    return true;
  }

  async completeFailed(
    runId: string,
    processorAttempt: number,
    completion: {
      readonly completedAt: string;
      readonly error: EvaluationExportFailure;
    },
  ): Promise<boolean> {
    const current = this.#jobs.get(runId);
    if (
      current === undefined ||
      current.status !== "running" ||
      current.processorAttempt !== processorAttempt
    ) {
      return false;
    }
    const failed: FailedEvaluationExport = {
      ...current,
      status: "failed",
      completedAt: completion.completedAt,
      error: completion.error,
    };
    this.#jobs.set(runId, failed);
    return true;
  }
}

export class InMemoryEvaluationExportArtifactStore implements EvaluationExportArtifactStore {
  readonly #artifacts = new Map<string, EvaluationExportArtifact>();
  putCount = 0;

  async put(key: string, artifact: EvaluationExportArtifact): Promise<void> {
    this.putCount += 1;
    this.#artifacts.set(key, artifact);
  }

  async get(key: string): Promise<EvaluationExportArtifact | undefined> {
    return this.#artifacts.get(key);
  }
}
