export type EvaluationExportStatus = "queued" | "running" | "ready" | "failed";

export interface EvaluationExportFailure {
  readonly code: "EVALUATION_EXPORT_GENERATION_FAILED" | "EVALUATION_EXPORT_PROCESSING_EXHAUSTED";
  readonly message: string;
  readonly retryable: true;
}

interface EvaluationExportBase {
  readonly id: string;
  readonly tenantId: string;
  readonly eventId: string;
  readonly planId: string;
  readonly planVersion: number;
  readonly requestedBy: string;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly fileName: string;
  readonly requestedAt: string;
}

export interface QueuedEvaluationExport extends EvaluationExportBase {
  readonly status: "queued";
}

export interface RunningEvaluationExport extends EvaluationExportBase {
  readonly status: "running";
  readonly startedAt: string;
  readonly processorAttempt: number;
}

export interface ReadyEvaluationExport extends EvaluationExportBase {
  readonly status: "ready";
  readonly startedAt: string;
  readonly completedAt: string;
  readonly artifactKey: string;
  readonly processorAttempt: number;
  readonly rowCount: number;
}

export interface FailedEvaluationExport extends EvaluationExportBase {
  readonly status: "failed";
  readonly startedAt: string;
  readonly completedAt: string;
  readonly processorAttempt: number;
  readonly error: EvaluationExportFailure;
}

export type EvaluationExport =
  | QueuedEvaluationExport
  | RunningEvaluationExport
  | ReadyEvaluationExport
  | FailedEvaluationExport;

export type EvaluationExportErrorCode =
  | "EVALUATION_EXPORT_INVALID_INPUT"
  | "EVALUATION_EXPORT_IDEMPOTENCY_CONFLICT"
  | "EVALUATION_EXPORT_NOT_FOUND"
  | "EVALUATION_EXPORT_NOT_READY"
  | "EVALUATION_EXPORT_FAILED"
  | "EVALUATION_EXPORT_UNAVAILABLE"
  | "EVALUATION_EXPORT_ARTIFACT_UNAVAILABLE";

export class EvaluationExportError extends Error {
  readonly code: EvaluationExportErrorCode;
  readonly status: 400 | 404 | 409 | 503;

  constructor(code: EvaluationExportErrorCode, message: string, status: 400 | 404 | 409 | 503) {
    super(message);
    this.name = "EvaluationExportError";
    this.code = code;
    this.status = status;
  }
}

export class EvaluationExportGenerationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EvaluationExportGenerationError";
  }
}

export interface EvaluationExportRequest {
  readonly tenantId: string;
  readonly eventId: string;
  readonly planId: string;
  readonly planVersion: number;
  readonly requestedBy: string;
  readonly idempotencyKey: string;
}

export interface EvaluationExportScope {
  readonly tenantId: string;
  readonly eventId: string;
  readonly planId: string;
  readonly runId: string;
}

export type EvaluationExportCreateResult =
  | { readonly status: "created"; readonly job: QueuedEvaluationExport }
  | { readonly status: "existing"; readonly job: EvaluationExport }
  | { readonly status: "conflict" };

export interface EvaluationExportStore {
  create(job: QueuedEvaluationExport): Promise<EvaluationExportCreateResult>;
  get(runId: string): Promise<EvaluationExport | undefined>;
  claim(
    runId: string,
    startedAt: string,
    processorAttempt: number,
  ): Promise<RunningEvaluationExport | undefined>;
  completeReady(
    runId: string,
    processorAttempt: number,
    completion: {
      readonly completedAt: string;
      readonly artifactKey: string;
      readonly rowCount: number;
    },
  ): Promise<boolean>;
  completeFailed(
    runId: string,
    processorAttempt: number,
    completion: {
      readonly completedAt: string;
      readonly error: EvaluationExportFailure;
    },
  ): Promise<boolean>;
}

export interface EvaluationExportArtifact {
  readonly body: string;
  readonly contentType: "text/csv; charset=utf-8";
}

export interface EvaluationExportArtifactStore {
  put(key: string, artifact: EvaluationExportArtifact): Promise<void>;
  get(key: string): Promise<EvaluationExportArtifact | undefined>;
}

export interface EvaluationExportQueue {
  enqueue(runId: string): Promise<void>;
}

export interface EvaluationExportGeneration {
  readonly body: string;
  readonly rowCount: number;
}

export interface EvaluationExportGenerator {
  generate(job: RunningEvaluationExport): Promise<EvaluationExportGeneration>;
}

export interface EvaluationExportDownload extends EvaluationExportArtifact {
  readonly fileName: string;
}

export interface EvaluationExportCoordinatorDependencies {
  readonly store: EvaluationExportStore;
  readonly artifacts: EvaluationExportArtifactStore;
  readonly queue: EvaluationExportQueue;
  readonly generator: EvaluationExportGenerator;
  readonly clock: () => Date;
  readonly idFactory: () => string;
}
