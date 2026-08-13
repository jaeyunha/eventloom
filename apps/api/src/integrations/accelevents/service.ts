import type { IntegrationPublicationId, IntegrationRecordError } from "@eventloom/contracts";
import {
  diffAcceleventsProgram,
  mapAcceptedProgram,
  sha256Hex,
  unexpectedExternalIds,
} from "./mapper";
import {
  type AcceleventsClock,
  type AcceleventsConfirmationTokens,
  type AcceleventsDiffRecord,
  type AcceleventsPreview,
  type AcceleventsProgramSource,
  type AcceleventsProvider,
  AcceleventsProviderError,
  type AcceleventsPublicationLock,
  type AcceleventsPublishReceipt,
  type AcceleventsPublishRequest,
  type AcceleventsReconciliation,
  type AcceleventsRecordKind,
  type AcceleventsRecordResult,
  AcceleventsServiceError,
  type AcceleventsStateRepository,
  type AcceleventsSyncAttempt,
} from "./types";

export interface PreviewAcceleventsPublicationInput {
  readonly publicationId: IntegrationPublicationId;
  readonly source: AcceleventsProgramSource;
}

export class AcceleventsPublicationService {
  private readonly provider: AcceleventsProvider;
  private readonly repository: AcceleventsStateRepository;
  private readonly confirmationTokens: AcceleventsConfirmationTokens;
  private readonly lock: AcceleventsPublicationLock;
  private readonly clock: AcceleventsClock;

  constructor(options: {
    readonly provider: AcceleventsProvider;
    readonly repository: AcceleventsStateRepository;
    readonly confirmationTokens: AcceleventsConfirmationTokens;
    readonly lock: AcceleventsPublicationLock;
    readonly clock?: AcceleventsClock;
  }) {
    this.provider = options.provider;
    this.repository = options.repository;
    this.confirmationTokens = options.confirmationTokens;
    this.lock = options.lock;
    this.clock = options.clock ?? { now: () => new Date() };
  }

  async preview(input: PreviewAcceleventsPublicationInput): Promise<AcceleventsPreview> {
    const mapped = mapAcceptedProgram(input.source);
    const snapshotHash = await sha256Hex({
      eventId: mapped.eventId,
      agendaRevisionId: mapped.agendaRevisionId,
      speakers: mapped.speakers,
      sessions: mapped.sessions,
      mappings: mapped.mappings,
    });
    const current = await this.provider.getSnapshot(mapped.eventId);
    const preview: AcceleventsPreview = {
      publicationId: input.publicationId,
      eventId: mapped.eventId,
      agendaRevisionId: mapped.agendaRevisionId,
      speakers: [...mapped.speakers],
      sessions: [...mapped.sessions],
      mappings: [...mapped.mappings],
      validationErrors: [...mapped.validationErrors],
      snapshotHash,
      confirmationToken: await this.confirmationTokens.issue(input.publicationId, snapshotHash),
      diff: diffAcceleventsProgram(mapped, current),
      createdAt: this.clock.now().toISOString(),
    };
    await this.repository.savePreview(preview);
    return preview;
  }

  async publish(request: AcceleventsPublishRequest): Promise<AcceleventsPublishReceipt> {
    return this.lock.runExclusive(request.publicationId, () => this.publishExclusive(request));
  }

  async retry(
    publicationId: IntegrationPublicationId,
    confirmationToken: string,
    idempotencyKey: string,
  ): Promise<AcceleventsPublishReceipt> {
    const preview = await this.requirePreview(publicationId);
    return this.publish({
      publicationId,
      snapshotHash: preview.snapshotHash,
      confirmationToken,
      idempotencyKey,
    });
  }

  async reconcile(publicationId: IntegrationPublicationId): Promise<AcceleventsReconciliation> {
    const preview = await this.requirePreview(publicationId);
    const current = await this.provider.getSnapshot(preview.eventId);
    const diff = diffAcceleventsProgram(preview, current);
    const unexpected = unexpectedExternalIds(preview, current);
    const reconciliation: AcceleventsReconciliation = {
      publicationId,
      snapshotHash: preview.snapshotHash,
      inSync:
        diff.summary.create === 0 &&
        diff.summary.update === 0 &&
        unexpected.speakers.length === 0 &&
        unexpected.sessions.length === 0,
      diff,
      unexpectedSpeakerExternalIds: unexpected.speakers,
      unexpectedSessionExternalIds: unexpected.sessions,
      checkedAt: this.clock.now().toISOString(),
    };
    await this.repository.saveReconciliation(reconciliation);
    return reconciliation;
  }

  private async publishExclusive(
    request: AcceleventsPublishRequest,
  ): Promise<AcceleventsPublishReceipt> {
    const existing = await this.repository.getReceiptByIdempotencyKey(request.idempotencyKey);
    if (existing !== null) {
      if (
        existing.publicationId !== request.publicationId ||
        existing.snapshotHash !== request.snapshotHash
      ) {
        throw new AcceleventsServiceError(
          "IDEMPOTENCY_KEY_REUSED",
          "The idempotency key was already used for a different Accelevents publication.",
        );
      }
      return existing;
    }

    const preview = await this.requirePreview(request.publicationId);
    if (preview.snapshotHash !== request.snapshotHash) {
      throw new AcceleventsServiceError(
        "SNAPSHOT_MISMATCH",
        "The confirmation is for a different Accelevents preview snapshot.",
      );
    }
    if (preview.validationErrors.length > 0) {
      throw new AcceleventsServiceError(
        "PREVIEW_INVALID",
        "Accelevents publication is blocked until preview validation errors are resolved.",
      );
    }
    if (
      !(await this.confirmationTokens.verify(
        request.confirmationToken,
        request.publicationId,
        request.snapshotHash,
      ))
    ) {
      throw new AcceleventsServiceError(
        "CONFIRMATION_REQUIRED",
        "A valid confirmation token from the current preview is required.",
      );
    }

    const attempts = await this.repository.listAttempts(request.publicationId);
    const attemptNumber = attempts.length + 1;
    const startedAt = this.clock.now().toISOString();
    await this.repository.saveAttempt({
      attempt: attemptNumber,
      publicationId: request.publicationId,
      idempotencyKey: request.idempotencyKey,
      status: "running",
      results: [],
      errors: [],
      startedAt,
      completedAt: null,
    });

    const results: AcceleventsRecordResult[] = [];
    const errors: IntegrationRecordError[] = [];
    let unchangedCount = 0;
    try {
      const current = await this.provider.getSnapshot(preview.eventId);
      const diff = diffAcceleventsProgram(preview, current);
      unchangedCount = diff.summary.unchanged;
      const operations = new Map(
        diff.records.map((record) => [`${record.kind}:${record.externalId}`, record]),
      );
      const failedSpeakerCreates = new Set<string>();

      for (const speaker of preview.speakers) {
        const operation = requireDiffRecord(operations, "speaker", speaker.externalId);
        if (operation.operation === "unchanged") {
          continue;
        }
        try {
          const result = await this.provider.upsertSpeaker(
            preview.eventId,
            speaker,
            providerIdempotencyKey(preview.snapshotHash, "speaker", speaker.externalId),
          );
          results.push({ kind: "speaker", ...result });
        } catch (error) {
          errors.push(toRecordError(speaker.externalId, error));
          if (operation.operation === "create") {
            failedSpeakerCreates.add(speaker.externalId);
          }
        }
      }

      for (const session of preview.sessions) {
        const operation = requireDiffRecord(operations, "session", session.externalId);
        if (operation.operation === "unchanged") {
          continue;
        }
        const unavailableSpeakerIds = session.speakerExternalIds.filter((speakerId) =>
          failedSpeakerCreates.has(speakerId),
        );
        if (unavailableSpeakerIds.length > 0) {
          errors.push({
            externalId: session.externalId,
            code: "DEPENDENCY_FAILED",
            message: `Session was not published because new speakers failed: ${unavailableSpeakerIds.join(", ")}.`,
            retryable: true,
          });
          continue;
        }
        try {
          const result = await this.provider.upsertSession(
            preview.eventId,
            session,
            providerIdempotencyKey(preview.snapshotHash, "session", session.externalId),
          );
          results.push({ kind: "session", ...result });
        } catch (error) {
          errors.push(toRecordError(session.externalId, error));
        }
      }
    } catch (error) {
      errors.push(toRecordError(preview.eventId, error));
    }

    results.sort(compareResults);
    errors.sort(compareErrors);
    const completedAt = this.clock.now().toISOString();
    const hasPreservedRecords = unchangedCount > 0 || results.length > 0;
    const status =
      errors.length === 0 ? "succeeded" : hasPreservedRecords ? "partially_failed" : "failed";
    const finalAttempt: AcceleventsSyncAttempt = {
      attempt: attemptNumber,
      publicationId: request.publicationId,
      idempotencyKey: request.idempotencyKey,
      status: errors.length === 0 ? "succeeded" : "failed",
      results,
      errors,
      startedAt,
      completedAt,
    };
    await this.repository.saveAttempt(finalAttempt);
    const receipt: AcceleventsPublishReceipt = {
      publicationId: request.publicationId,
      eventId: preview.eventId,
      agendaRevisionId: preview.agendaRevisionId,
      snapshotHash: preview.snapshotHash,
      idempotencyKey: request.idempotencyKey,
      status,
      attempt: attemptNumber,
      results,
      errors,
      startedAt,
      completedAt,
    };
    await this.repository.saveReceipt(receipt);
    return receipt;
  }

  private async requirePreview(
    publicationId: IntegrationPublicationId,
  ): Promise<AcceleventsPreview> {
    const preview = await this.repository.getPreview(publicationId);
    if (preview === null) {
      throw new AcceleventsServiceError(
        "PREVIEW_NOT_FOUND",
        "Create an Accelevents preview before publishing.",
      );
    }
    return preview;
  }
}

function requireDiffRecord(
  operations: ReadonlyMap<string, AcceleventsDiffRecord>,
  kind: AcceleventsRecordKind,
  externalId: string,
): AcceleventsDiffRecord {
  const record = operations.get(`${kind}:${externalId}`);
  if (record === undefined) {
    throw new Error(`Missing ${kind} diff for ${externalId}.`);
  }
  return record;
}

function providerIdempotencyKey(
  snapshotHash: string,
  kind: AcceleventsRecordKind,
  externalId: string,
): string {
  return `accelevents:${snapshotHash}:${kind}:${externalId}`;
}

function toRecordError(externalId: string, error: unknown): IntegrationRecordError {
  if (error instanceof AcceleventsProviderError) {
    return {
      externalId,
      code: normalizeErrorCode(error.code),
      message: error.message,
      retryable: error.retryable,
    };
  }
  return {
    externalId,
    code: "PROVIDER_ERROR",
    message: "Accelevents provider request failed.",
    retryable: false,
  };
}

function normalizeErrorCode(code: string): string {
  const normalized = code
    .trim()
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]+/gu, "_");
  return /^[A-Z][A-Z0-9_]*$/u.test(normalized) ? normalized : "PROVIDER_ERROR";
}

function compareResults(left: AcceleventsRecordResult, right: AcceleventsRecordResult): number {
  return left.kind.localeCompare(right.kind) || left.externalId.localeCompare(right.externalId);
}

function compareErrors(left: IntegrationRecordError, right: IntegrationRecordError): number {
  return left.externalId.localeCompare(right.externalId) || left.code.localeCompare(right.code);
}
