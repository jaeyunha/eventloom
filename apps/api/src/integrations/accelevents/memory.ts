import type {
  AcceleventsSessionPayload,
  AcceleventsSpeakerPayload,
  EventId,
  IntegrationPublicationId,
} from "@open-sessionboard/contracts";
import { canonicalJson } from "./mapper";
import {
  type AcceleventsPreview,
  type AcceleventsProvider,
  AcceleventsProviderError,
  type AcceleventsProviderSnapshot,
  type AcceleventsPublicationLock,
  type AcceleventsPublishReceipt,
  type AcceleventsReconciliation,
  type AcceleventsStateRepository,
  type AcceleventsSyncAttempt,
  type AcceleventsUpsertResult,
} from "./types";

export class InMemoryAcceleventsStateRepository implements AcceleventsStateRepository {
  private readonly previews = new Map<IntegrationPublicationId, AcceleventsPreview>();
  private readonly attempts = new Map<
    IntegrationPublicationId,
    Map<number, AcceleventsSyncAttempt>
  >();
  private readonly receipts = new Map<string, AcceleventsPublishReceipt>();
  private readonly reconciliations = new Map<IntegrationPublicationId, AcceleventsReconciliation>();

  async savePreview(preview: AcceleventsPreview): Promise<void> {
    this.previews.set(preview.publicationId, clone(preview));
  }

  async getPreview(publicationId: IntegrationPublicationId): Promise<AcceleventsPreview | null> {
    const preview = this.previews.get(publicationId);
    return preview === undefined ? null : clone(preview);
  }

  async saveAttempt(attempt: AcceleventsSyncAttempt): Promise<void> {
    let publicationAttempts = this.attempts.get(attempt.publicationId);
    if (publicationAttempts === undefined) {
      publicationAttempts = new Map();
      this.attempts.set(attempt.publicationId, publicationAttempts);
    }
    publicationAttempts.set(attempt.attempt, clone(attempt));
  }

  async listAttempts(
    publicationId: IntegrationPublicationId,
  ): Promise<readonly AcceleventsSyncAttempt[]> {
    const attempts = this.attempts.get(publicationId);
    if (attempts === undefined) {
      return [];
    }
    return [...attempts.values()].sort((left, right) => left.attempt - right.attempt).map(clone);
  }

  async saveReceipt(receipt: AcceleventsPublishReceipt): Promise<void> {
    const existing = this.receipts.get(receipt.idempotencyKey);
    if (
      existing !== undefined &&
      (existing.publicationId !== receipt.publicationId ||
        existing.snapshotHash !== receipt.snapshotHash)
    ) {
      throw new Error("Accelevents receipt idempotency key conflict.");
    }
    this.receipts.set(receipt.idempotencyKey, clone(receipt));
  }

  async getReceiptByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<AcceleventsPublishReceipt | null> {
    const receipt = this.receipts.get(idempotencyKey);
    return receipt === undefined ? null : clone(receipt);
  }

  async saveReconciliation(reconciliation: AcceleventsReconciliation): Promise<void> {
    this.reconciliations.set(reconciliation.publicationId, clone(reconciliation));
  }

  async getLatestReconciliation(
    publicationId: IntegrationPublicationId,
  ): Promise<AcceleventsReconciliation | null> {
    const reconciliation = this.reconciliations.get(publicationId);
    return reconciliation === undefined ? null : clone(reconciliation);
  }
}

export class InMemoryAcceleventsPublicationLock implements AcceleventsPublicationLock {
  private readonly tails = new Map<IntegrationPublicationId, Promise<void>>();

  async runExclusive<T>(
    publicationId: IntegrationPublicationId,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.tails.get(publicationId) ?? Promise.resolve();
    let release = (): void => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.tails.set(publicationId, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.tails.get(publicationId) === current) {
        this.tails.delete(publicationId);
      }
    }
  }
}

export interface FakeAcceleventsProviderCall {
  readonly kind: "read" | "session" | "speaker";
  readonly eventId: EventId;
  readonly externalId: string | null;
  readonly idempotencyKey: string | null;
}

interface MutableProviderEvent {
  readonly speakers: Map<string, AcceleventsSpeakerPayload>;
  readonly sessions: Map<string, AcceleventsSessionPayload>;
}

interface StoredProviderResult {
  readonly fingerprint: string;
  readonly result: AcceleventsUpsertResult;
}

export class FakeAcceleventsProvider implements AcceleventsProvider {
  readonly calls: FakeAcceleventsProviderCall[] = [];
  readonly writes: FakeAcceleventsProviderCall[] = [];
  private readonly events = new Map<EventId, MutableProviderEvent>();
  private readonly failures = new Map<string, AcceleventsProviderError[]>();
  private readonly idempotentResults = new Map<string, StoredProviderResult>();

  seed(eventId: EventId, snapshot: AcceleventsProviderSnapshot): void {
    this.events.set(eventId, {
      speakers: new Map(snapshot.speakers.map((record) => [record.externalId, clone(record)])),
      sessions: new Map(snapshot.sessions.map((record) => [record.externalId, clone(record)])),
    });
  }

  failNext(
    kind: "read" | "session" | "speaker",
    externalId: string | null,
    error: AcceleventsProviderError,
  ): void {
    const key = failureKey(kind, externalId);
    const queue = this.failures.get(key) ?? [];
    queue.push(error);
    this.failures.set(key, queue);
  }

  async getSnapshot(eventId: EventId): Promise<AcceleventsProviderSnapshot> {
    this.calls.push({ kind: "read", eventId, externalId: null, idempotencyKey: null });
    this.throwQueuedFailure("read", null);
    const event = this.event(eventId);
    return {
      speakers: [...event.speakers.values()]
        .sort((left, right) => left.externalId.localeCompare(right.externalId))
        .map(clone),
      sessions: [...event.sessions.values()]
        .sort((left, right) => left.externalId.localeCompare(right.externalId))
        .map(clone),
    };
  }

  async upsertSpeaker(
    eventId: EventId,
    payload: AcceleventsSpeakerPayload,
    idempotencyKey: string,
  ): Promise<AcceleventsUpsertResult> {
    return this.upsert("speaker", eventId, payload, idempotencyKey);
  }

  async upsertSession(
    eventId: EventId,
    payload: AcceleventsSessionPayload,
    idempotencyKey: string,
  ): Promise<AcceleventsUpsertResult> {
    return this.upsert("session", eventId, payload, idempotencyKey);
  }

  private async upsert(
    kind: "session" | "speaker",
    eventId: EventId,
    payload: AcceleventsSessionPayload | AcceleventsSpeakerPayload,
    idempotencyKey: string,
  ): Promise<AcceleventsUpsertResult> {
    const call = { kind, eventId, externalId: payload.externalId, idempotencyKey } as const;
    this.calls.push(call);
    this.throwQueuedFailure(kind, payload.externalId);
    const fingerprint = canonicalJson({ kind, eventId, payload });
    const existingResult = this.idempotentResults.get(idempotencyKey);
    if (existingResult !== undefined) {
      if (existingResult.fingerprint !== fingerprint) {
        throw new AcceleventsProviderError(
          "IDEMPOTENCY_CONFLICT",
          "Provider idempotency key was reused with a different payload.",
        );
      }
      return clone(existingResult.result);
    }

    const event = this.event(eventId);
    const records = kind === "speaker" ? event.speakers : event.sessions;
    const current = records.get(payload.externalId);
    const outcome =
      current === undefined
        ? "created"
        : canonicalJson(current) === canonicalJson(payload)
          ? "unchanged"
          : "updated";
    if (kind === "speaker") {
      event.speakers.set(payload.externalId, clone(payload as AcceleventsSpeakerPayload));
    } else {
      event.sessions.set(payload.externalId, clone(payload as AcceleventsSessionPayload));
    }
    const result: AcceleventsUpsertResult = {
      externalId: payload.externalId,
      providerId: `ae_${kind}_${payload.externalId}`,
      outcome,
    };
    this.idempotentResults.set(idempotencyKey, { fingerprint, result: clone(result) });
    this.writes.push(call);
    return result;
  }

  private event(eventId: EventId): MutableProviderEvent {
    let event = this.events.get(eventId);
    if (event === undefined) {
      event = { speakers: new Map(), sessions: new Map() };
      this.events.set(eventId, event);
    }
    return event;
  }

  private throwQueuedFailure(
    kind: "read" | "session" | "speaker",
    externalId: string | null,
  ): void {
    const key = failureKey(kind, externalId);
    const queue = this.failures.get(key);
    const error = queue?.shift();
    if (queue?.length === 0) {
      this.failures.delete(key);
    }
    if (error !== undefined) {
      throw error;
    }
  }
}

function failureKey(kind: "read" | "session" | "speaker", externalId: string | null): string {
  return `${kind}:${externalId ?? "*"}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
