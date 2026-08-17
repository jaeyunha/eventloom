import {
  type CalendarInvitationPayload,
  createCalendarInvitation,
  validateCalendarInvitationPayload,
} from "../../integrations/calendar";
import {
  OpenSendClient,
  type OpenSendMessage,
  type OpenSendSenderAddresses,
  type OpenSendSenderPurpose,
} from "../../integrations/opensend";
import { createCalendarOpenSendMessage } from "../../integrations/opensend/calendar-email";
import { OpenSendError, openSendMessageSchema } from "../../integrations/opensend/types";
import {
  type CloudflareBindings,
  type CloudflareFileScanPayload,
  type CloudflareOutboxInvitationTransient,
  type CloudflareOutboxMessage,
  type CloudflareOutboxTopic,
  type CloudflareReportsPayload,
  cloudflareOutboxTopics,
} from "./bindings";
import { D1PrivateObjectDeletionGateway } from "./private-object-cleanup";

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_RETRY_DELAY_MS = 1_000;
const DEFAULT_MAX_RETRY_DELAY_MS = 60_000;
const DEFAULT_LEASE_MS = 5 * 60_000;
const MAX_LOG_CODE_LENGTH = 64;

const outboxTopicSet = new Set<string>(cloudflareOutboxTopics);

export interface OutboxJob {
  readonly id: string;
  readonly tenantId: string;
  readonly deduplicationKey?: string;
  readonly topic: CloudflareOutboxTopic;
  readonly payload: unknown;
  readonly state: "pending" | "queued" | "processing" | "delivered" | "failed" | "dead-letter";
  readonly attemptCount: number;
  readonly availableAt: Date;
  readonly leaseOwner: string | null;
  readonly leaseExpiresAt: Date | null;
}

export type OutboxJobClaim =
  | { readonly outcome: "claimed"; readonly job: OutboxJob }
  | { readonly outcome: "busy" | "not_due"; readonly retryAt: Date }
  | { readonly outcome: "missing" | "completed" | "dead_lettered" };

export interface OutboxJobRepository {
  claim(jobId: string, now: Date, leaseMs: number, leaseOwner: string): Promise<OutboxJobClaim>;
  markDelivered(job: OutboxJob, completedAt: Date): Promise<void>;
  markRetry(job: OutboxJob, availableAt: Date, errorCode: string): Promise<void>;
  markFailed(job: OutboxJob, errorCode: string, deadLetter: boolean): Promise<void>;
}

interface OutboxJobRow {
  readonly id: string;
  readonly deduplication_key?: string;
  readonly tenant_id: string;
  readonly topic: string;
  readonly payload_json: string;
  readonly state: string;
  readonly attempt_count: number;
  readonly available_at: string;
  readonly lease_owner: string | null;
  readonly lease_expires_at: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeCode(value: unknown): string {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "UNEXPECTED_ERROR";
  const normalized = code.replaceAll(/[^A-Z0-9_]+/gu, "_").slice(0, MAX_LOG_CODE_LENGTH);
  return /^[A-Z][A-Z0-9_]*$/u.test(normalized) ? normalized : "UNEXPECTED_ERROR";
}

function validDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? new Date(value) : null;
  }
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function parsePayload(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function rowToJob(row: OutboxJobRow): OutboxJob | null {
  if (!outboxTopicSet.has(row.topic)) return null;
  const topic = row.topic as CloudflareOutboxTopic;
  const availableAt = validDate(row.available_at);
  if (
    typeof row.id !== "string" ||
    row.id.trim().length === 0 ||
    typeof row.tenant_id !== "string" ||
    row.tenant_id.trim().length === 0 ||
    availableAt === null ||
    !Number.isSafeInteger(row.attempt_count) ||
    row.attempt_count < 0
  ) {
    return null;
  }
  const leaseExpiresAt = row.lease_expires_at === null ? null : validDate(row.lease_expires_at);
  if (row.lease_expires_at !== null && leaseExpiresAt === null) return null;
  const states = new Set<OutboxJob["state"]>([
    "pending",
    "queued",
    "processing",
    "delivered",
    "failed",
    "dead-letter",
  ]);
  if (!states.has(row.state as OutboxJob["state"])) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    ...(typeof row.deduplication_key === "string" && row.deduplication_key.length > 0
      ? { deduplicationKey: row.deduplication_key }
      : {}),
    topic,
    payload: parsePayload(row.payload_json),
    state: row.state as OutboxJob["state"],
    attemptCount: row.attempt_count,
    availableAt,
    leaseOwner: row.lease_owner,
    leaseExpiresAt,
  };
}

/** D1-backed claim and state transitions. Claiming is conditional to prevent duplicate sends. */
export class D1OutboxJobRepository implements OutboxJobRepository {
  constructor(private readonly database: D1Database) {}

  async claim(
    jobId: string,
    now: Date,
    leaseMs: number,
    leaseOwner: string,
  ): Promise<OutboxJobClaim> {
    const row = await this.database
      .prepare(
        `SELECT id, deduplication_key, tenant_id, topic, payload_json, state, attempt_count,
                available_at, lease_owner, lease_expires_at
           FROM outbox_jobs
          WHERE id = ?
          LIMIT 1`,
      )
      .bind(jobId)
      .first<OutboxJobRow>();
    if (row === null) return { outcome: "missing" };
    const job = rowToJob(row);
    if (job === null) return { outcome: "missing" };
    if (job.state === "delivered" || job.state === "failed") {
      return { outcome: "completed" };
    }
    if (job.state === "dead-letter") {
      return { outcome: "dead_lettered" };
    }
    if (job.state === "pending" || job.state === "queued") {
      if (job.availableAt.getTime() > now.getTime()) {
        return { outcome: "not_due", retryAt: job.availableAt };
      }
    } else if (
      job.state === "processing" &&
      job.leaseExpiresAt !== null &&
      job.leaseExpiresAt.getTime() > now.getTime()
    ) {
      return { outcome: "busy", retryAt: job.leaseExpiresAt };
    }

    const leaseExpiresAt = new Date(now.getTime() + leaseMs).toISOString();
    const result = await this.database
      .prepare(
        `UPDATE outbox_jobs
            SET state = 'processing',
                attempt_count = attempt_count + 1,
                lease_owner = ?,
                lease_expires_at = ?,
                updated_at = ?
          WHERE id = ?
            AND (
              (state IN ('pending', 'queued') AND available_at <= ?)
              OR (state = 'processing' AND (lease_expires_at IS NULL OR lease_expires_at <= ?))
            )`,
      )
      .bind(
        leaseOwner,
        leaseExpiresAt,
        now.toISOString(),
        jobId,
        now.toISOString(),
        now.toISOString(),
      )
      .run();
    if ((result.meta.changes ?? 0) !== 1) {
      return { outcome: "busy", retryAt: new Date(now.getTime() + leaseMs) };
    }

    return {
      outcome: "claimed",
      job: {
        ...job,
        state: "processing",
        attemptCount: job.attemptCount + 1,
        leaseOwner,
        leaseExpiresAt: new Date(leaseExpiresAt),
      },
    };
  }

  async markDelivered(job: OutboxJob, completedAt: Date): Promise<void> {
    const result = await this.database
      .prepare(
        `UPDATE outbox_jobs
            SET state = 'delivered',
                lease_owner = NULL,
                lease_expires_at = NULL,
                completed_at = ?,
                updated_at = ?
          WHERE id = ? AND state = 'processing'
            AND attempt_count = ? AND lease_owner = ?`,
      )
      .bind(
        completedAt.toISOString(),
        completedAt.toISOString(),
        job.id,
        job.attemptCount,
        job.leaseOwner,
      )
      .run();
    if ((result.meta.changes ?? 0) !== 1) {
      throw new Error("Outbox delivery state could not be persisted.");
    }
  }

  async markRetry(job: OutboxJob, availableAt: Date, errorCode: string): Promise<void> {
    const result = await this.database
      .prepare(
        `UPDATE outbox_jobs
            SET state = 'queued',
                available_at = ?,
                lease_owner = NULL,
                lease_expires_at = NULL,
                last_error_code = ?,
                updated_at = ?
          WHERE id = ? AND state = 'processing'
            AND attempt_count = ? AND lease_owner = ?`,
      )
      .bind(
        availableAt.toISOString(),
        safeCode(errorCode),
        availableAt.toISOString(),
        job.id,
        job.attemptCount,
        job.leaseOwner,
      )
      .run();
    if ((result.meta.changes ?? 0) !== 1) {
      throw new Error("Outbox retry state could not be persisted.");
    }
  }

  async markFailed(job: OutboxJob, errorCode: string, deadLetter: boolean): Promise<void> {
    const result = await this.database
      .prepare(
        `UPDATE outbox_jobs
            SET state = ?,
                lease_owner = NULL,
                lease_expires_at = NULL,
                last_error_code = ?,
                updated_at = ?
          WHERE id = ? AND state = 'processing'
            AND attempt_count = ? AND lease_owner = ?`,
      )
      .bind(
        deadLetter ? "dead-letter" : "failed",
        safeCode(errorCode),
        new Date().toISOString(),
        job.id,
        job.attemptCount,
        job.leaseOwner,
      )
      .run();
    if ((result.meta.changes ?? 0) !== 1) {
      throw new Error("Outbox failure state could not be persisted.");
    }
  }
}

/** Small deterministic repository useful for focused queue tests and local adapters. */
export class InMemoryOutboxJobRepository implements OutboxJobRepository {
  readonly #jobs = new Map<string, OutboxJob>();

  constructor(jobs: readonly OutboxJob[] = []) {
    for (const job of jobs) this.#jobs.set(job.id, { ...job });
  }

  seed(job: OutboxJob): void {
    this.#jobs.set(job.id, { ...job });
  }

  get(jobId: string): OutboxJob | undefined {
    const job = this.#jobs.get(jobId);
    return job === undefined ? undefined : { ...job };
  }

  async claim(
    jobId: string,
    now: Date,
    leaseMs: number,
    leaseOwner: string,
  ): Promise<OutboxJobClaim> {
    const job = this.#jobs.get(jobId);
    if (job === undefined) return { outcome: "missing" };
    if (job.state === "delivered" || job.state === "failed") {
      return { outcome: "completed" };
    }
    if (job.state === "dead-letter") {
      return { outcome: "dead_lettered" };
    }
    if (job.availableAt.getTime() > now.getTime()) {
      return { outcome: "not_due", retryAt: job.availableAt };
    }
    if (
      job.state === "processing" &&
      job.leaseExpiresAt !== null &&
      job.leaseExpiresAt.getTime() > now.getTime()
    ) {
      return { outcome: "busy", retryAt: job.leaseExpiresAt };
    }
    const claimed: OutboxJob = {
      ...job,
      state: "processing",
      attemptCount: job.attemptCount + 1,
      leaseOwner,
      leaseExpiresAt: new Date(now.getTime() + leaseMs),
    };
    this.#jobs.set(jobId, claimed);
    return { outcome: "claimed", job: { ...claimed } };
  }

  async markDelivered(claimed: OutboxJob, _completedAt: Date): Promise<void> {
    const job = this.requireClaim(claimed, "Outbox delivery state could not be persisted.");
    this.#jobs.set(job.id, {
      ...job,
      state: "delivered",
      leaseOwner: null,
      leaseExpiresAt: null,
    });
  }

  async markRetry(claimed: OutboxJob, availableAt: Date, errorCode: string): Promise<void> {
    const job = this.requireClaim(claimed, "Outbox retry state could not be persisted.");
    this.#jobs.set(job.id, {
      ...job,
      state: "queued",
      availableAt,
      leaseOwner: null,
      leaseExpiresAt: null,
    });
    void errorCode;
  }

  async markFailed(claimed: OutboxJob, _errorCode: string, deadLetter: boolean): Promise<void> {
    const job = this.requireClaim(claimed, "Outbox failure state could not be persisted.");
    this.#jobs.set(job.id, {
      ...job,
      state: deadLetter ? "dead-letter" : "failed",
      leaseOwner: null,
      leaseExpiresAt: null,
    });
  }

  private require(jobId: string): OutboxJob {
    const job = this.#jobs.get(jobId);
    if (job === undefined) throw new Error("Outbox job is missing.");
    return job;
  }

  private requireClaim(claimed: OutboxJob, message: string): OutboxJob {
    const current = this.require(claimed.id);
    if (
      current.state !== "processing" ||
      current.attemptCount !== claimed.attemptCount ||
      current.leaseOwner !== claimed.leaseOwner
    ) {
      throw new Error(message);
    }
    return current;
  }
}

export class OutboxDeliveryError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly retryAfterMs: number | undefined;
  readonly status: number | undefined;

  constructor(
    code: string,
    message: string,
    options: {
      readonly retryable: boolean;
      readonly retryAfterMs?: number;
      readonly status?: number;
      readonly cause?: unknown;
    },
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "OutboxDeliveryError";
    this.code = safeCode(code);
    this.retryable = options.retryable;
    this.retryAfterMs = options.retryAfterMs;
    this.status = options.status;
  }
}

export interface OutboxDeliveryContext {
  readonly jobId: string;
  readonly topic: CloudflareOutboxTopic;
  readonly attempt: number;
  readonly idempotencyKey: string;
  readonly leaseOwner: string;
  readonly leaseExpiresAt: Date;
}
export interface OutboxDeliveryReceipt {
  readonly providerMessageId?: string;
}

export type OutboxCommunicationStatusTarget =
  | {
      readonly kind: "communication";
      readonly eventId: string;
      readonly sendId: string;
      readonly recipientId: string;
    }
  | {
      readonly kind: "crm_outreach";
      readonly eventId: string | null;
      readonly outreachId: string;
      readonly contactId: string;
      readonly idempotencyKey: string;
    }
  | {
      readonly kind: "reminder";
      readonly eventId: string;
      readonly runId: string;
      readonly dispatchId: string;
    };

export interface OutboxCommunicationStatusUpdate {
  readonly tenantId: string;
  readonly target: OutboxCommunicationStatusTarget;
  readonly status: "delivered" | "provider_accepted" | "failed" | "bounced" | "complained";
  readonly providerMessageId?: string;
  readonly reason?: string;
  readonly occurredAt: string;
}

export interface OutboxDeliveryStatusRecorder {
  recordCommunicationStatus(input: OutboxCommunicationStatusUpdate): Promise<void>;
}

type TopicAdapter<TPayload = unknown> = (
  payload: TPayload,
  context: OutboxDeliveryContext,
) => Promise<OutboxDeliveryReceipt | undefined>;

/** Adapters are intentionally injectable so production can bind persisted provider services. */
export interface OutboxAdapters {
  readonly communications?: TopicAdapter<OpenSendMessage>;
  readonly email?: TopicAdapter<OpenSendMessage>;
  readonly webhooks?: TopicAdapter<{ readonly deliveryId: string }>;
  readonly webhook?: TopicAdapter<{ readonly deliveryId: string }>;
  readonly calendar?: TopicAdapter<CalendarInvitationPayload>;
  readonly "cache-invalidation"?: TopicAdapter<{ readonly eventId: string }>;
  readonly cacheInvalidation?: TopicAdapter<{ readonly eventId: string }>;
  readonly reports?: TopicAdapter<CloudflareReportsPayload>;
  readonly "file-scan"?: TopicAdapter<CloudflareFileScanPayload>;
}

export interface OutboxConsumerBindings extends CloudflareBindings {
  readonly OPENSEND_API_KEY?: string;
  readonly OPENSEND_SENDING_API_KEY?: string;
  readonly OPENSEND_API_URL?: string;
  readonly AUTH_FROM_EMAIL?: string;
  readonly SPEAKERS_FROM_EMAIL?: string;
  readonly CALENDAR_FROM_EMAIL?: string;
  readonly WEBHOOK_DELIVERY_URL?: string;
  readonly WEBHOOK_DELIVERY_TOKEN?: string;
  readonly CACHE_INVALIDATION_URL?: string;
  readonly CACHE_INVALIDATION_TOKEN?: string;
}

export interface OutboxConsumerLogger {
  info?(message: string, fields?: Readonly<Record<string, unknown>>): void;
  warn?(message: string, fields?: Readonly<Record<string, unknown>>): void;
  error?(message: string, fields?: Readonly<Record<string, unknown>>): void;
}

export interface OutboxConsumerOptions {
  readonly repository?: OutboxJobRepository;
  readonly adapters?: OutboxAdapters;
  readonly statusRecorder?: OutboxDeliveryStatusRecorder;
  readonly now?: () => Date;
  readonly logger?: OutboxConsumerLogger;
  readonly maxAttempts?: number;
  readonly baseRetryDelayMs?: number;
  readonly maxRetryDelayMs?: number;
  readonly leaseMs?: number;
  readonly leaseOwner?: string;
}

export type OutboxMessageAction =
  | { readonly action: "ack"; readonly reason: string }
  | { readonly action: "retry"; readonly delayMs: number; readonly reason: string };

export interface OutboxQueueMessage {
  readonly body: unknown;
  readonly attempts: number;
  ack(): void;
  retry(options?: { readonly delaySeconds?: number }): void;
}

function positiveInteger(value: number, fallback: number): number {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function nonNegativeInteger(value: number, fallback: number): number {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function queueAttempt(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
function isOutboxBindings(value: unknown): value is OutboxConsumerBindings {
  return isRecord(value) && ("DB" in value || "OUTBOX_QUEUE" in value || "APP_ENV" in value);
}
function isOutboxOptions(value: unknown): value is OutboxConsumerOptions {
  if (!isRecord(value) || isOutboxBindings(value)) return false;
  return [
    "repository",
    "adapters",
    "statusRecorder",
    "now",
    "logger",
    "maxAttempts",
    "baseRetryDelayMs",
    "maxRetryDelayMs",
    "leaseMs",
    "leaseOwner",
  ].some((key) => key in value);
}

interface MemberInvitationMetadata {
  readonly kind: "member_invitation";
  readonly invitationId: string;
  readonly recipient: string;
  readonly expiresAt: string;
}

const queueMessageKeys = new Set([
  "version",
  "jobId",
  "tenantId",
  "topic",
  "enqueuedAt",
  "transient",
]);

const invitationTransientKeys = new Set(["kind", "invitationId", "recipient", "message"]);
const invitationMetadataKeys = new Set(["kind", "invitationId", "recipient", "expiresAt"]);
const invitationMessageKeys = new Set(["from", "to", "subject", "html", "text", "idempotencyKey"]);

function hasOnlyKeys(value: Record<string, unknown>, keys: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => keys.has(key));
}

function parseMemberInvitationMetadata(value: unknown): MemberInvitationMetadata | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, invitationMetadataKeys) ||
    value.kind !== "member_invitation" ||
    typeof value.invitationId !== "string" ||
    value.invitationId.trim().length === 0 ||
    typeof value.recipient !== "string" ||
    value.recipient.trim().length === 0 ||
    typeof value.expiresAt !== "string" ||
    validDate(value.expiresAt) === null
  ) {
    return null;
  }
  return {
    kind: "member_invitation",
    invitationId: value.invitationId,
    recipient: value.recipient,
    expiresAt: value.expiresAt,
  };
}

function parseInvitationTransient(value: unknown): CloudflareOutboxInvitationTransient | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, invitationTransientKeys) ||
    value.kind !== "member_invitation" ||
    typeof value.invitationId !== "string" ||
    value.invitationId.trim().length === 0 ||
    typeof value.recipient !== "string" ||
    value.recipient.trim().length === 0 ||
    !isRecord(value.message) ||
    !hasOnlyKeys(value.message, invitationMessageKeys)
  ) {
    return null;
  }
  const result = openSendMessageSchema.safeParse(value.message);
  if (!result.success) return null;
  const message = value.message as unknown as OpenSendMessage;
  if (
    message.to.length !== 1 ||
    message.to[0] !== value.recipient ||
    message.idempotencyKey !== `member-invitation:${value.invitationId}`
  ) {
    return null;
  }
  return {
    kind: "member_invitation",
    invitationId: value.invitationId,
    recipient: value.recipient,
    message,
  };
}

function assertInvitationTransientMatches(
  job: OutboxJob,
  transient: CloudflareOutboxInvitationTransient,
): void {
  const metadata = parseMemberInvitationMetadata(job.payload);
  if (
    job.topic !== "communications" ||
    metadata === null ||
    metadata.invitationId !== transient.invitationId ||
    metadata.recipient !== transient.recipient ||
    job.deduplicationKey !== `member-invitation:${transient.invitationId}`
  ) {
    throw new OutboxDeliveryError(
      "MESSAGE_MISMATCH",
      "The transient invitation delivery does not match the outbox job.",
      { retryable: false },
    );
  }
}

function parseQueueMessage(value: unknown): CloudflareOutboxMessage | null {
  if (!isRecord(value)) return null;
  if (
    value.version !== 1 ||
    typeof value.jobId !== "string" ||
    value.jobId.trim().length === 0 ||
    typeof value.tenantId !== "string" ||
    value.tenantId.trim().length === 0 ||
    typeof value.topic !== "string" ||
    !outboxTopicSet.has(value.topic) ||
    typeof value.enqueuedAt !== "string" ||
    validDate(value.enqueuedAt) === null
  ) {
    return null;
  }
  const transient = "transient" in value ? parseInvitationTransient(value.transient) : undefined;
  if ("transient" in value && transient === null) return null;
  if (!hasOnlyKeys(value, queueMessageKeys)) return null;
  return {
    version: 1,
    jobId: value.jobId,
    tenantId: value.tenantId,
    topic: value.topic as CloudflareOutboxTopic,
    enqueuedAt: value.enqueuedAt,
    ...(transient == null ? {} : { transient }),
  };
}
function queueMessageFailureReason(value: unknown): "MALFORMED_MESSAGE" | "UNSUPPORTED_TOPIC" {
  if (isRecord(value) && typeof value.topic === "string" && !outboxTopicSet.has(value.topic)) {
    return "UNSUPPORTED_TOPIC";
  }
  return "MALFORMED_MESSAGE";
}

function malformedPayload(topic: CloudflareOutboxTopic): never {
  throw new OutboxDeliveryError("MALFORMED_PAYLOAD", `The ${topic} outbox payload is invalid.`, {
    retryable: true,
  });
}

function emailPayloadEnvelope(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return value.effect === "send_email" ||
    value.effect === "send_communication" ||
    value.effect === "send_crm_outreach" ||
    value.effect === "send_reminder"
    ? value.payload
    : value;
}

function senderPurposeFromMachineMetadata(
  value: Record<string, unknown>,
): OpenSendSenderPurpose | undefined {
  if (value.effect === "send_reminder" || value.effect === "send_crm_outreach") {
    return "speakers";
  }
  if (
    value.effect === "send_email" &&
    typeof value.planId === "string" &&
    typeof value.reviewerId === "string"
  ) {
    return "speakers";
  }
  switch (value.purpose ?? value.templatePurpose) {
    case "verification":
      return "auth";
    case "schedule_publish":
    case "schedule_update":
    case "schedule_cancel":
      return "calendar";
    case "receipt":
    case "reminder":
    case "decision":
    case "task":
    case "organizer_group_email":
      return "speakers";
    default:
      return undefined;
  }
}

function parseEmailPayload(value: unknown): OpenSendMessage {
  const candidate = emailPayloadEnvelope(value);
  if (!isRecord(candidate)) malformedPayload("communications");
  const senderPurpose =
    candidate.senderPurpose ??
    (isRecord(value)
      ? (value.senderPurpose ?? senderPurposeFromMachineMetadata(value))
      : undefined);
  const message = senderPurpose === undefined ? candidate : { ...candidate, senderPurpose };
  const result = openSendMessageSchema.safeParse(message);
  if (!result.success) malformedPayload("communications");
  return message as unknown as OpenSendMessage;
}

function payloadString(value: Record<string, unknown>, key: string): string {
  const candidate = value[key];
  if (typeof candidate !== "string" || candidate.trim().length === 0) {
    malformedPayload("communications");
  }
  return candidate.trim();
}

function communicationStatusTarget(value: unknown): OutboxCommunicationStatusTarget | null {
  if (!isRecord(value)) return null;
  if (value.effect === "send_communication") {
    return {
      kind: "communication",
      eventId: payloadString(value, "eventId"),
      sendId: payloadString(value, "sendId"),
      recipientId: payloadString(value, "recipientId"),
    };
  }
  if (value.effect === "send_crm_outreach") {
    return {
      kind: "crm_outreach",
      eventId: value.eventId === null ? null : payloadString(value, "eventId"),
      outreachId: payloadString(value, "outreachId"),
      contactId: payloadString(value, "contactId"),
      idempotencyKey: payloadString(value, "idempotencyKey"),
    };
  }
  if (value.effect === "send_reminder") {
    return {
      kind: "reminder",
      eventId: payloadString(value, "eventId"),
      runId: payloadString(value, "runId"),
      dispatchId: payloadString(value, "dispatchId"),
    };
  }
  return null;
}

function parseCalendarPayload(value: unknown): CalendarInvitationPayload {
  const candidate =
    isRecord(value) && value.effect === "deliver_calendar_updates" ? value.payload : value;
  if (!isRecord(candidate)) malformedPayload("calendar");
  try {
    return validateCalendarInvitationPayload(candidate as unknown as CalendarInvitationPayload);
  } catch {
    return malformedPayload("calendar");
  }
}

function parseWebhookPayload(value: unknown): { readonly deliveryId: string } {
  const candidate =
    isRecord(value) && value.effect === "deliver_webhook"
      ? "payload" in value
        ? value.payload
        : value
      : value;
  const deliveryId = isRecord(candidate) ? candidate.deliveryId : undefined;
  if (typeof deliveryId !== "string" || deliveryId.trim().length === 0) {
    malformedPayload("webhooks");
  }
  return { deliveryId };
}

function unsupportedTopic(topic: CloudflareOutboxTopic): never {
  throw new OutboxDeliveryError(
    "UNSUPPORTED_TOPIC",
    `The ${topic} outbox topic is not enabled for production dispatch.`,
    { retryable: true },
  );
}

function parseCachePayload(value: unknown): { readonly eventId: string } {
  const candidate =
    isRecord(value) && value.effect === "invalidate_public_feeds"
      ? "payload" in value
        ? value.payload
        : value
      : value;
  const eventId = isRecord(candidate) ? candidate.eventId : undefined;
  if (typeof eventId !== "string" || eventId.trim().length === 0) {
    malformedPayload("cache-invalidation");
  }
  return { eventId };
}

const reportsPayloadKeys = new Set(["kind", "runId"]);
const fileScanBaseKeys = new Set(["kind", "source", "tenantId", "eventId", "assetId", "objectKey"]);
const cfpFileScanKeys = new Set([...fileScanBaseKeys, "submissionId"]);
const privateUploadFileScanKeys = new Set([...fileScanBaseKeys, "expiresAt"]);

function parseFileScanPayload(value: unknown): CloudflareFileScanPayload {
  if (
    !isRecord(value) ||
    value.kind !== "private_object_delete" ||
    (value.source !== "speaker" && value.source !== "cfp" && value.source !== "private-upload") ||
    typeof value.tenantId !== "string" ||
    value.tenantId.trim().length === 0 ||
    typeof value.eventId !== "string" ||
    value.eventId.trim().length === 0 ||
    typeof value.assetId !== "string" ||
    value.assetId.trim().length === 0 ||
    typeof value.objectKey !== "string" ||
    value.objectKey.trim().length === 0
  ) {
    malformedPayload("file-scan");
  }
  if (value.source === "speaker") {
    if (!hasOnlyKeys(value, fileScanBaseKeys)) malformedPayload("file-scan");
    return value as unknown as CloudflareFileScanPayload;
  }
  if (value.source === "cfp") {
    if (
      !hasOnlyKeys(value, cfpFileScanKeys) ||
      typeof value.submissionId !== "string" ||
      value.submissionId.trim().length === 0
    ) {
      malformedPayload("file-scan");
    }
    return value as unknown as CloudflareFileScanPayload;
  }
  if (
    !hasOnlyKeys(value, privateUploadFileScanKeys) ||
    typeof value.expiresAt !== "string" ||
    validDate(value.expiresAt) === null
  ) {
    malformedPayload("file-scan");
  }
  return value as unknown as CloudflareFileScanPayload;
}

function parseReportsPayload(value: unknown): CloudflareReportsPayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, reportsPayloadKeys) ||
    value.kind !== "evaluation_review_export" ||
    typeof value.runId !== "string" ||
    value.runId.trim().length === 0
  ) {
    malformedPayload("reports");
  }
  return { kind: "evaluation_review_export", runId: value.runId };
}

function normalizeFailure(cause: unknown): OutboxDeliveryError {
  if (cause instanceof OutboxDeliveryError) return cause;
  if (cause instanceof OpenSendError) {
    return new OutboxDeliveryError(cause.code, "Configured email delivery failed.", {
      retryable: cause.retryable,
      ...(cause.retryAfterMs === undefined ? {} : { retryAfterMs: cause.retryAfterMs }),
      ...(cause.status === undefined ? {} : { status: cause.status }),
      cause,
    });
  }
  if (isRecord(cause)) {
    const retryable = typeof cause.retryable === "boolean" ? cause.retryable : true;
    const status = typeof cause.status === "number" ? cause.status : undefined;
    return new OutboxDeliveryError(safeCode(cause.code), "Configured outbox adapter failed.", {
      retryable,
      ...(status === undefined ? {} : { status }),
      cause,
    });
  }
  return new OutboxDeliveryError("UNEXPECTED_ERROR", "Outbox delivery failed unexpectedly.", {
    retryable: true,
    cause,
  });
}

function retryDelayMs(
  attempt: number,
  baseRetryDelayMs: number,
  maxRetryDelayMs: number,
  retryAfterMs?: number,
): number {
  const exponential = Math.min(
    maxRetryDelayMs,
    baseRetryDelayMs * 2 ** Math.max(0, Math.min(attempt - 1, 30)),
  );
  return Math.min(maxRetryDelayMs, Math.max(exponential, retryAfterMs ?? 0));
}

function defaultLogger(): OutboxConsumerLogger {
  return {
    info: (message, fields) => console.info(message, fields),
    warn: (message, fields) => console.warn(message, fields),
    error: (message, fields) => console.error(message, fields),
  };
}

function log(
  logger: OutboxConsumerLogger,
  level: "info" | "warn" | "error",
  message: string,
  fields: Readonly<Record<string, unknown>>,
): void {
  logger[level]?.(message, fields);
}

function adapterError(topic: CloudflareOutboxTopic): OutboxDeliveryError {
  return new OutboxDeliveryError(
    "ADAPTER_UNAVAILABLE",
    `No configured adapter is available for ${topic}.`,
    { retryable: true },
  );
}

function requireUrl(value: string | undefined, label: string): URL {
  if (value === undefined || value.trim().length === 0) {
    throw new OutboxDeliveryError("CONFIGURATION_ERROR", `${label} is not configured.`, {
      retryable: true,
    });
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new OutboxDeliveryError("CONFIGURATION_ERROR", `${label} is invalid.`, {
      retryable: true,
      cause,
    });
  }
  const localHttp =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
  if (
    (url.protocol !== "https:" && !localHttp) ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new OutboxDeliveryError("CONFIGURATION_ERROR", `${label} must use HTTPS.`, {
      retryable: true,
    });
  }
  return url;
}

function responseFailure(status: number, label: string): OutboxDeliveryError | null {
  if (status >= 200 && status < 300) return null;
  const retryable = status === 408 || status === 425 || status === 429 || status >= 500;
  return new OutboxDeliveryError(
    retryable ? "PROVIDER_UNAVAILABLE" : "REQUEST_REJECTED",
    `${label} returned HTTP ${status}.`,
    { retryable, status },
  );
}

function senderPurposeForMessage(message: OpenSendMessage): OpenSendSenderPurpose {
  if (message.senderPurpose !== undefined) return message.senderPurpose;
  throw new OutboxDeliveryError(
    "SENDER_PURPOSE_UNRESOLVED",
    "The persisted email sender purpose cannot be determined safely.",
    { retryable: false },
  );
}

function createConfiguredAdapters(
  bindings: OutboxConsumerBindings,
  now: () => Date,
): OutboxAdapters {
  let client: OpenSendClient | undefined;
  let privateObjectDeletion: D1PrivateObjectDeletionGateway | undefined;
  const senderAddresses: OpenSendSenderAddresses = {
    auth: bindings.AUTH_FROM_EMAIL ?? "",
    speakers: bindings.SPEAKERS_FROM_EMAIL ?? "",
    calendar: bindings.CALENDAR_FROM_EMAIL ?? "",
  };
  const openSend = (): OpenSendClient => {
    if (client !== undefined) return client;
    const key = bindings.OPENSEND_API_KEY ?? bindings.OPENSEND_SENDING_API_KEY;
    if (key === undefined || key.trim().length === 0) {
      throw new OutboxDeliveryError("CONFIGURATION_ERROR", "OpenSend is not configured.", {
        retryable: true,
      });
    }
    client = new OpenSendClient({
      sendingApiKey: key,
      ...(bindings.OPENSEND_API_URL === undefined ? {} : { baseUrl: bindings.OPENSEND_API_URL }),
      senderAddresses,
    });
    return client;
  };

  const sendCalendar: TopicAdapter<CalendarInvitationPayload> = async (payload) => {
    const invitation = createCalendarInvitation(payload, { generatedAt: now().toISOString() });
    await openSend().send(createCalendarOpenSendMessage(payload, invitation), "calendar");
    return undefined;
  };

  // The configured delivery service owns the persisted subscription allowlist and signing secret.
  const deliverWebhook: TopicAdapter<{ readonly deliveryId: string }> = async (
    payload,
    context,
  ) => {
    const url = requireUrl(bindings.WEBHOOK_DELIVERY_URL, "WEBHOOK_DELIVERY_URL");
    const headers = new Headers({ "content-type": "application/json" });
    if (bindings.WEBHOOK_DELIVERY_TOKEN !== undefined) {
      headers.set("authorization", `Bearer ${bindings.WEBHOOK_DELIVERY_TOKEN}`);
    }
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          deliveryId: payload.deliveryId,
          idempotencyKey: context.idempotencyKey,
        }),
      });
    } catch (cause) {
      throw new OutboxDeliveryError("NETWORK_ERROR", "Webhook delivery could not be reached.", {
        retryable: true,
        cause,
      });
    }
    const failure = responseFailure(response.status, "Webhook delivery");
    if (failure !== null) throw failure;
    return undefined;
  };
  const invalidateCache: TopicAdapter<{ readonly eventId: string }> = async (payload, context) => {
    const url = requireUrl(bindings.CACHE_INVALIDATION_URL, "CACHE_INVALIDATION_URL");
    const headers = new Headers({ "content-type": "application/json" });
    if (bindings.CACHE_INVALIDATION_TOKEN !== undefined) {
      headers.set("authorization", `Bearer ${bindings.CACHE_INVALIDATION_TOKEN}`);
    }
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ eventId: payload.eventId, idempotencyKey: context.idempotencyKey }),
      });
    } catch (cause) {
      throw new OutboxDeliveryError("NETWORK_ERROR", "Cache invalidation could not be reached.", {
        retryable: true,
        cause,
      });
    }
    const failure = responseFailure(response.status, "Cache invalidation");
    if (failure !== null) throw failure;
    return undefined;
  };

  return {
    communications: async (payload) => {
      const purpose = senderPurposeForMessage(payload);
      const result = await openSend().send(payload, purpose);
      return { providerMessageId: result.providerMessageId };
    },
    calendar: sendCalendar,
    webhooks: deliverWebhook,
    "cache-invalidation": invalidateCache,
    "file-scan": async (payload) => {
      if (bindings.DB === undefined || bindings.PRIVATE_FILES === undefined) {
        throw new OutboxDeliveryError(
          "CONFIGURATION_ERROR",
          "D1 and R2 are required for private object cleanup.",
          { retryable: true },
        );
      }
      privateObjectDeletion ??= new D1PrivateObjectDeletionGateway(
        bindings.DB,
        bindings.PRIVATE_FILES,
        now,
      );
      await privateObjectDeletion.deleteIfAuthorized(payload);
      return undefined;
    },
  };
}

export class OutboxConsumer {
  readonly #repository: OutboxJobRepository;
  readonly #adapters: OutboxAdapters;
  readonly #statusRecorder: OutboxDeliveryStatusRecorder | undefined;
  readonly #now: () => Date;
  readonly #logger: OutboxConsumerLogger;
  readonly #maxAttempts: number;
  readonly #baseRetryDelayMs: number;
  readonly #maxRetryDelayMs: number;
  readonly #leaseMs: number;
  readonly #leaseOwner: string;

  constructor(
    bindingsOrOptions: OutboxConsumerBindings | OutboxConsumerOptions,
    options: OutboxConsumerOptions = {},
  ) {
    const optionsOnly = isOutboxOptions(bindingsOrOptions);
    const bindings = optionsOnly ? ({} as OutboxConsumerBindings) : bindingsOrOptions;
    const effectiveOptions = optionsOnly ? bindingsOrOptions : options;
    this.#repository = effectiveOptions.repository ?? new D1OutboxJobRepository(bindings.DB);
    this.#statusRecorder = effectiveOptions.statusRecorder;
    this.#now = effectiveOptions.now ?? (() => new Date());
    this.#logger = effectiveOptions.logger ?? defaultLogger();
    this.#maxAttempts = positiveInteger(
      effectiveOptions.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      DEFAULT_MAX_ATTEMPTS,
    );
    this.#baseRetryDelayMs = nonNegativeInteger(
      effectiveOptions.baseRetryDelayMs ?? DEFAULT_BASE_RETRY_DELAY_MS,
      DEFAULT_BASE_RETRY_DELAY_MS,
    );
    this.#maxRetryDelayMs = positiveInteger(
      effectiveOptions.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS,
      DEFAULT_MAX_RETRY_DELAY_MS,
    );
    this.#leaseMs = positiveInteger(effectiveOptions.leaseMs ?? DEFAULT_LEASE_MS, DEFAULT_LEASE_MS);
    if (this.#maxRetryDelayMs < this.#baseRetryDelayMs) {
      throw new TypeError("Outbox maximum retry delay must not be shorter than its base delay.");
    }
    this.#leaseOwner = effectiveOptions.leaseOwner ?? `worker-${crypto.randomUUID()}`;
    const configured = createConfiguredAdapters(bindings, this.#now);
    this.#adapters = { ...configured, ...(effectiveOptions.adapters ?? {}) };
  }

  async process(message: OutboxQueueMessage): Promise<OutboxMessageAction> {
    const queueAttempts = queueAttempt(message.attempts);
    const queueMessage = parseQueueMessage(message.body);
    if (queueMessage === null) {
      const reason = queueMessageFailureReason(message.body);
      log(this.#logger, "error", "outbox message rejected", {
        reason,
        attempt: queueAttempts,
      });
      return this.retryForMessage(message, undefined, reason.toLowerCase(), true);
    }
    const now = this.#now();
    let claim: OutboxJobClaim;
    try {
      claim = await this.#repository.claim(
        queueMessage.jobId,
        now,
        this.#leaseMs,
        this.#leaseOwner,
      );
    } catch (cause) {
      const failure = normalizeFailure(cause);
      log(this.#logger, "error", "outbox claim failed", {
        topic: queueMessage.topic,
        jobId: queueMessage.jobId,
        attempt: queueAttempts,
        code: failure.code,
      });
      return this.retryForMessage(message, failure.retryAfterMs, "claim_failed", true);
    }

    if (claim.outcome === "missing") {
      log(this.#logger, "error", "outbox job missing", {
        topic: queueMessage.topic,
        jobId: queueMessage.jobId,
        reason: "MISSING_JOB",
      });
      return this.retryForMessage(message, undefined, "missing_job", true);
    }
    if (claim.outcome === "completed") {
      log(this.#logger, "info", "duplicate outbox delivery acknowledged", {
        topic: queueMessage.topic,
        jobId: queueMessage.jobId,
        reason: "IDEMPOTENT_REPLAY",
      });
      return { action: "ack", reason: "already_completed" };
    }
    if (claim.outcome === "dead_lettered") {
      log(this.#logger, "error", "outbox dead-letter is awaiting queue disposal", {
        topic: queueMessage.topic,
        jobId: queueMessage.jobId,
        reason: "DEAD_LETTERED",
      });
      return this.retryForMessage(message, undefined, "dead_lettered", true);
    }
    if (claim.outcome === "busy" || claim.outcome === "not_due") {
      const delay = Math.max(1_000, claim.retryAt.getTime() - this.#now().getTime());
      return { action: "retry", delayMs: delay, reason: claim.outcome };
    }
    if (claim.outcome !== "claimed") {
      return { action: "retry", delayMs: DEFAULT_BASE_RETRY_DELAY_MS, reason: "claim_unhandled" };
    }

    const job = claim.job;
    if (
      job.tenantId !== queueMessage.tenantId ||
      job.topic !== queueMessage.topic ||
      (queueMessage.transient !== undefined && queueMessage.topic !== "communications")
    ) {
      try {
        await this.#repository.markFailed(job, "MESSAGE_MISMATCH", true);
      } catch (cause) {
        const failure = normalizeFailure(cause);
        log(this.#logger, "error", "outbox message mismatch could not be persisted", {
          topic: queueMessage.topic,
          jobId: queueMessage.jobId,
          code: failure.code,
        });
        return this.retryForMessage(message, failure.retryAfterMs, "state_persist_failed", true);
      }
      log(this.#logger, "error", "outbox message rejected", {
        topic: queueMessage.topic,
        jobId: queueMessage.jobId,
        reason: "MESSAGE_MISMATCH",
      });
      return this.retryForMessage(message, undefined, "message_mismatch", true);
    }
    const context: OutboxDeliveryContext = {
      jobId: job.id,
      topic: job.topic,
      attempt: job.attemptCount,
      idempotencyKey: job.deduplicationKey ?? `${job.tenantId}:${job.id}`,
      leaseOwner: job.leaseOwner ?? this.#leaseOwner,
      leaseExpiresAt: job.leaseExpiresAt ?? new Date(this.#now().getTime() + this.#leaseMs),
    };
    try {
      const receipt = await this.dispatch(job, context, queueMessage.transient);
      await this.recordCommunicationStatus(job, {
        status:
          isRecord(job.payload) && job.payload.effect === "send_reminder"
            ? "provider_accepted"
            : "delivered",
        ...(receipt?.providerMessageId === undefined
          ? {}
          : { providerMessageId: receipt.providerMessageId }),
      });
      await this.#repository.markDelivered(job, this.#now());
      log(this.#logger, "info", "outbox side effect delivered", {
        topic: job.topic,
        jobId: job.id,
        attempt: job.attemptCount,
      });
      return { action: "ack", reason: "delivered" };
    } catch (cause) {
      const failure = normalizeFailure(cause);
      const exhausted = !failure.retryable || job.attemptCount >= this.#maxAttempts;
      if (exhausted) {
        try {
          await this.recordCommunicationStatus(job, {
            status: "failed",
            reason: failure.code,
          });
          await this.#repository.markFailed(job, failure.code, failure.retryable);
        } catch (markCause) {
          const markFailure = normalizeFailure(markCause);
          log(this.#logger, "error", "outbox terminal state could not be persisted", {
            topic: job.topic,
            jobId: job.id,
            attempt: job.attemptCount,
            code: markFailure.code,
          });
          return this.retryForMessage(
            message,
            markFailure.retryAfterMs,
            "state_persist_failed",
            true,
          );
        }
        log(this.#logger, "error", "outbox side effect failed", {
          topic: job.topic,
          jobId: job.id,
          attempt: job.attemptCount,
          code: failure.code,
          terminal: true,
        });
        if (failure.retryable) {
          return this.retryForMessage(message, undefined, "dead_lettered", true);
        }
        return { action: "ack", reason: "terminal_failure" };
      }

      const delayMs = retryDelayMs(
        job.attemptCount,
        this.#baseRetryDelayMs,
        this.#maxRetryDelayMs,
        failure.retryAfterMs,
      );
      try {
        await this.#repository.markRetry(
          job,
          new Date(this.#now().getTime() + delayMs),
          failure.code,
        );
      } catch (markCause) {
        const markFailure = normalizeFailure(markCause);
        log(this.#logger, "error", "outbox retry state could not be persisted", {
          topic: job.topic,
          jobId: job.id,
          attempt: job.attemptCount,
          code: markFailure.code,
        });
        return this.retryForMessage(
          message,
          markFailure.retryAfterMs,
          "state_persist_failed",
          true,
        );
      }
      log(this.#logger, "warn", "outbox side effect scheduled for retry", {
        topic: job.topic,
        jobId: job.id,
        attempt: job.attemptCount,
        code: failure.code,
        delayMs,
      });
      return { action: "retry", delayMs, reason: "retryable_failure" };
    }
  }

  private async recordCommunicationStatus(
    job: OutboxJob,
    input: {
      readonly status: "delivered" | "provider_accepted" | "failed" | "bounced" | "complained";
      readonly providerMessageId?: string;
      readonly reason?: string;
    },
  ): Promise<void> {
    if (job.topic !== "communications" || this.#statusRecorder === undefined) return;
    const target = communicationStatusTarget(job.payload);
    if (target === null) return;
    await this.#statusRecorder.recordCommunicationStatus({
      tenantId: job.tenantId,
      target,
      status: input.status,
      ...(input.providerMessageId === undefined
        ? {}
        : { providerMessageId: input.providerMessageId }),
      ...(input.reason === undefined ? {} : { reason: input.reason }),
      occurredAt: this.#now().toISOString(),
    });
  }

  private retryForMessage(
    message: OutboxQueueMessage,
    retryAfterMs: number | undefined,
    reason: string,
    force = false,
  ): OutboxMessageAction {
    if (!force && queueAttempt(message.attempts) + 1 >= this.#maxAttempts) {
      return { action: "ack", reason: "retry_exhausted" };
    }
    const delayMs = retryDelayMs(
      queueAttempt(message.attempts) + 1,
      this.#baseRetryDelayMs,
      this.#maxRetryDelayMs,
      retryAfterMs,
    );
    return { action: "retry", delayMs, reason };
  }

  private async dispatch(
    job: OutboxJob,
    context: OutboxDeliveryContext,
    transient?: CloudflareOutboxInvitationTransient,
  ): Promise<OutboxDeliveryReceipt | undefined> {
    switch (job.topic) {
      case "communications": {
        let payload: OpenSendMessage;
        if (transient === undefined) {
          payload = parseEmailPayload(job.payload);
        } else {
          assertInvitationTransientMatches(job, transient);
          payload = { ...transient.message, senderPurpose: "auth" };
        }
        const adapter = this.#adapters.communications ?? this.#adapters.email;
        if (adapter === undefined) throw adapterError(job.topic);
        return adapter(payload, context);
      }
      case "calendar": {
        const payload = parseCalendarPayload(job.payload);
        const adapter = this.#adapters.calendar;
        if (adapter === undefined) throw adapterError(job.topic);
        await adapter(payload, context);
        return;
      }
      case "webhooks": {
        const payload = parseWebhookPayload(job.payload);
        const adapter = this.#adapters.webhooks ?? this.#adapters.webhook;
        if (adapter === undefined) throw adapterError(job.topic);
        await adapter(payload, context);
        return;
      }
      case "cache-invalidation": {
        const payload = parseCachePayload(job.payload);
        const adapter = this.#adapters["cache-invalidation"] ?? this.#adapters.cacheInvalidation;
        if (adapter === undefined) throw adapterError(job.topic);
        await adapter(payload, context);
        return;
      }
      case "reports": {
        const payload = parseReportsPayload(job.payload);
        const adapter = this.#adapters.reports;
        if (adapter === undefined) throw adapterError(job.topic);
        await adapter(payload, context);
        return;
      }
      case "file-scan": {
        const payload = parseFileScanPayload(job.payload);
        const adapter = this.#adapters["file-scan"];
        if (adapter === undefined) throw adapterError(job.topic);
        await adapter(payload, context);
        return;
      }
      default: {
        throw unsupportedTopic(job.topic);
      }
    }
  }
}

export function createOutboxConsumer(
  bindingsOrOptions: OutboxConsumerBindings | OutboxConsumerOptions,
  options: OutboxConsumerOptions = {},
): OutboxConsumer {
  return new OutboxConsumer(bindingsOrOptions, options);
}

export async function consumeOutboxQueue(
  batch: MessageBatch<unknown>,
  bindingsOrOptions: OutboxConsumerBindings | OutboxConsumerOptions,
  _executionContext?: ExecutionContext,
  options: OutboxConsumerOptions = {},
): Promise<void> {
  const consumer = createOutboxConsumer(bindingsOrOptions, options);
  for (const message of batch.messages) {
    const action = await consumer.process(message);
    if (action.action === "ack") {
      message.ack();
    } else {
      message.retry({ delaySeconds: action.delayMs / 1_000 });
    }
  }
}
