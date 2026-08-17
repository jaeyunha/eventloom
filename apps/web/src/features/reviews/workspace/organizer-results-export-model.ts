export interface OrganizerResultsExportRunBase {
  readonly id: string;
  readonly fileName: string;
  readonly createdAt: string;
}

export interface QueuedOrganizerResultsExportRun extends OrganizerResultsExportRunBase {
  readonly status: "queued";
}

export interface RunningOrganizerResultsExportRun extends OrganizerResultsExportRunBase {
  readonly status: "running";
  readonly startedAt?: string;
}

export interface ReadyOrganizerResultsExportRun extends OrganizerResultsExportRunBase {
  readonly status: "ready";
  readonly startedAt?: string;
  readonly completedAt: string;
  readonly downloadUrl: string;
  readonly rowCount?: number;
}

export interface OrganizerResultsExportFailure {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

export interface FailedOrganizerResultsExportRun extends OrganizerResultsExportRunBase {
  readonly status: "failed";
  readonly startedAt?: string;
  readonly completedAt: string;
  readonly error: OrganizerResultsExportFailure;
}

export type OrganizerResultsExportRun =
  | QueuedOrganizerResultsExportRun
  | RunningOrganizerResultsExportRun
  | ReadyOrganizerResultsExportRun
  | FailedOrganizerResultsExportRun;

export type PendingOrganizerResultsExportRun =
  | QueuedOrganizerResultsExportRun
  | RunningOrganizerResultsExportRun;

export type TerminalOrganizerResultsExportRun =
  | ReadyOrganizerResultsExportRun
  | FailedOrganizerResultsExportRun;

export class OrganizerResultsExportApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly traceId: string | undefined;
  readonly details: unknown;

  constructor(input: {
    readonly code: string;
    readonly message: string;
    readonly status: number;
    readonly retryable: boolean;
    readonly traceId?: string;
    readonly details?: unknown;
  }) {
    super(input.message);
    this.name = "OrganizerResultsExportApiError";
    this.code = input.code;
    this.status = input.status;
    this.retryable = input.retryable;
    this.traceId = input.traceId;
    this.details = input.details;
  }
}
