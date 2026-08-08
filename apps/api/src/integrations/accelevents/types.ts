import type {
  AcceleventsPublicationPreview,
  AcceleventsSessionPayload,
  AcceleventsSpeakerPayload,
  AgendaVersionId,
  EventId,
  IntegrationFieldMapping,
  IntegrationPublicationId,
  IntegrationPublicationStatus,
  IntegrationRecordError,
  ParticipantId,
  SessionId,
} from "@open-sessionboard/contracts";

export type AcceleventsSourceDecision = "accepted" | "declined" | "pending" | "waitlisted";

export interface AcceleventsSpeakerSource {
  readonly participantId: ParticipantId;
  readonly decision: AcceleventsSourceDecision;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly biography: string;
  readonly company: string | null;
  readonly jobTitle: string | null;
  readonly headshotUrl: string | null;
}

export interface AcceleventsSessionSource {
  readonly sessionId: SessionId;
  readonly decision: AcceleventsSourceDecision;
  readonly title: string;
  readonly description: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timeZone: string;
  readonly location: string | null;
  readonly room: string;
  readonly track: string | null;
  readonly tags: readonly string[];
  readonly speakerParticipantIds: readonly ParticipantId[];
}

export interface AcceleventsProgramSource {
  readonly eventId: EventId;
  readonly agendaRevisionId: AgendaVersionId;
  readonly speakers: readonly AcceleventsSpeakerSource[];
  readonly sessions: readonly AcceleventsSessionSource[];
}

export interface AcceleventsMappedProgram {
  readonly eventId: EventId;
  readonly agendaRevisionId: AgendaVersionId;
  readonly speakers: readonly AcceleventsSpeakerPayload[];
  readonly sessions: readonly AcceleventsSessionPayload[];
  readonly mappings: readonly IntegrationFieldMapping[];
  readonly validationErrors: readonly IntegrationRecordError[];
}

export type AcceleventsRecordKind = "session" | "speaker";
export type AcceleventsDiffOperation = "create" | "unchanged" | "update";

export interface AcceleventsDiffRecord {
  readonly kind: AcceleventsRecordKind;
  readonly externalId: string;
  readonly operation: AcceleventsDiffOperation;
  readonly changedFields: readonly string[];
}

export interface AcceleventsPreviewDiff {
  readonly records: readonly AcceleventsDiffRecord[];
  readonly summary: Readonly<Record<AcceleventsDiffOperation, number>>;
}

export interface AcceleventsPreview extends AcceleventsPublicationPreview {
  readonly confirmationToken: string;
  readonly diff: AcceleventsPreviewDiff;
}

export interface AcceleventsPublishRequest {
  readonly publicationId: IntegrationPublicationId;
  readonly snapshotHash: string;
  readonly confirmationToken: string;
  readonly idempotencyKey: string;
}

export interface AcceleventsProviderSnapshot {
  readonly speakers: readonly AcceleventsSpeakerPayload[];
  readonly sessions: readonly AcceleventsSessionPayload[];
}

export type AcceleventsUpsertOutcome = "created" | "unchanged" | "updated";

export interface AcceleventsUpsertResult {
  readonly externalId: string;
  readonly providerId: string;
  readonly outcome: AcceleventsUpsertOutcome;
}

export interface AcceleventsProvider {
  /** Provider reads are used only to preview/reconcile; they never update source records. */
  getSnapshot(eventId: EventId): Promise<AcceleventsProviderSnapshot>;
  upsertSpeaker(
    eventId: EventId,
    payload: AcceleventsSpeakerPayload,
    idempotencyKey: string,
  ): Promise<AcceleventsUpsertResult>;
  upsertSession(
    eventId: EventId,
    payload: AcceleventsSessionPayload,
    idempotencyKey: string,
  ): Promise<AcceleventsUpsertResult>;
}

export interface AcceleventsRecordResult extends AcceleventsUpsertResult {
  readonly kind: AcceleventsRecordKind;
}

export interface AcceleventsSyncAttempt {
  readonly attempt: number;
  readonly publicationId: IntegrationPublicationId;
  readonly idempotencyKey: string;
  readonly status: "failed" | "running" | "succeeded";
  readonly results: readonly AcceleventsRecordResult[];
  readonly errors: readonly IntegrationRecordError[];
  readonly startedAt: string;
  readonly completedAt: string | null;
}

export interface AcceleventsPublishReceipt {
  readonly publicationId: IntegrationPublicationId;
  readonly eventId: EventId;
  readonly agendaRevisionId: AgendaVersionId;
  readonly snapshotHash: string;
  readonly idempotencyKey: string;
  readonly status: Extract<
    IntegrationPublicationStatus,
    "failed" | "partially_failed" | "succeeded"
  >;
  readonly attempt: number;
  readonly results: readonly AcceleventsRecordResult[];
  readonly errors: readonly IntegrationRecordError[];
  readonly startedAt: string;
  readonly completedAt: string;
}

export interface AcceleventsReconciliation {
  readonly publicationId: IntegrationPublicationId;
  readonly snapshotHash: string;
  readonly inSync: boolean;
  readonly diff: AcceleventsPreviewDiff;
  readonly unexpectedSpeakerExternalIds: readonly string[];
  readonly unexpectedSessionExternalIds: readonly string[];
  readonly checkedAt: string;
}

export interface AcceleventsStateRepository {
  savePreview(preview: AcceleventsPreview): Promise<void>;
  getPreview(publicationId: IntegrationPublicationId): Promise<AcceleventsPreview | null>;
  saveAttempt(attempt: AcceleventsSyncAttempt): Promise<void>;
  listAttempts(publicationId: IntegrationPublicationId): Promise<readonly AcceleventsSyncAttempt[]>;
  saveReceipt(receipt: AcceleventsPublishReceipt): Promise<void>;
  getReceiptByIdempotencyKey(idempotencyKey: string): Promise<AcceleventsPublishReceipt | null>;
  saveReconciliation(reconciliation: AcceleventsReconciliation): Promise<void>;
  getLatestReconciliation(
    publicationId: IntegrationPublicationId,
  ): Promise<AcceleventsReconciliation | null>;
}

export interface AcceleventsConfirmationTokens {
  issue(publicationId: IntegrationPublicationId, snapshotHash: string): Promise<string>;
  verify(
    token: string,
    publicationId: IntegrationPublicationId,
    snapshotHash: string,
  ): Promise<boolean>;
}

export interface AcceleventsPublicationLock {
  runExclusive<T>(publicationId: IntegrationPublicationId, operation: () => Promise<T>): Promise<T>;
}

export interface AcceleventsClock {
  now(): Date;
}

export class AcceleventsProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(
    code: string,
    message: string,
    options: { readonly retryable?: boolean; readonly cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AcceleventsProviderError";
    this.code = code;
    this.retryable = options.retryable ?? false;
  }
}

export type AcceleventsServiceErrorCode =
  | "CONFIRMATION_REQUIRED"
  | "IDEMPOTENCY_KEY_REUSED"
  | "PREVIEW_INVALID"
  | "PREVIEW_NOT_FOUND"
  | "SNAPSHOT_MISMATCH";

export class AcceleventsServiceError extends Error {
  readonly code: AcceleventsServiceErrorCode;

  constructor(code: AcceleventsServiceErrorCode, message: string) {
    super(message);
    this.name = "AcceleventsServiceError";
    this.code = code;
  }
}
