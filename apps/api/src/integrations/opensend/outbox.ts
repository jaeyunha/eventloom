import {
  OpenSendError,
  type OpenSendErrorCode,
  type OpenSendMessage,
  type OpenSendSender,
} from "./types";

export type OpenSendOutboxStatus =
  | "queued"
  | "processing"
  | "retry_scheduled"
  | "delivered"
  | "failed";

export interface OpenSendDeliveryAttempt {
  readonly attempt: number;
  readonly completedAt: string;
  readonly outcome: "delivered" | "retry_scheduled" | "failed";
  readonly providerMessageId: string | null;
  readonly errorCode: OpenSendErrorCode | "UNEXPECTED_ERROR" | null;
  readonly responseStatus: number | null;
  readonly retryable: boolean | null;
}

export interface OpenSendOutboxJob {
  readonly id: string;
  readonly message: OpenSendMessage;
  readonly status: OpenSendOutboxStatus;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly nextAttemptAt: string | null;
  readonly leaseExpiresAt: string | null;
  readonly providerMessageId: string | null;
  readonly lastError: string | null;
  readonly attempts: readonly OpenSendDeliveryAttempt[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface CreateOpenSendOutboxJobInput {
  readonly id: string;
  readonly message: OpenSendMessage;
  readonly createdAt: string;
  readonly maxAttempts?: number;
}

export interface OpenSendOutboxRepository {
  insert(job: OpenSendOutboxJob): Promise<void>;
  find(id: string): Promise<OpenSendOutboxJob | undefined>;
  claim(id: string, now: Date, leaseExpiresAt: Date): Promise<OpenSendOutboxJob | undefined>;
  save(job: OpenSendOutboxJob): Promise<void>;
}

export interface OpenSendOutboxQueue {
  enqueue(jobId: string, delayMs: number): Promise<void>;
}

export interface OpenSendOutboxProcessorOptions {
  readonly repository: OpenSendOutboxRepository;
  readonly queue: OpenSendOutboxQueue;
  readonly sender: OpenSendSender;
  readonly now?: () => Date;
  readonly baseRetryDelayMs?: number;
  readonly maxRetryDelayMs?: number;
  readonly leaseMs?: number;
}

export type OpenSendProcessResult =
  | { readonly outcome: "skipped" }
  | { readonly outcome: "delivered"; readonly providerMessageId: string }
  | { readonly outcome: "retry_scheduled"; readonly delayMs: number }
  | { readonly outcome: "failed"; readonly errorCode: string };

export function createOpenSendOutboxJob(input: CreateOpenSendOutboxJobInput): OpenSendOutboxJob {
  if (input.id.trim().length === 0) {
    throw new TypeError("An OpenSend outbox job ID is required.");
  }
  if (Number.isNaN(new Date(input.createdAt).getTime())) {
    throw new TypeError("OpenSend outbox creation time must be an ISO timestamp.");
  }

  const maxAttempts = input.maxAttempts ?? 5;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new TypeError("OpenSend outbox max attempts must be a positive integer.");
  }

  return {
    id: input.id,
    message: cloneMessage(input.message),
    status: "queued",
    attemptCount: 0,
    maxAttempts,
    nextAttemptAt: null,
    leaseExpiresAt: null,
    providerMessageId: null,
    lastError: null,
    attempts: [],
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    version: 0,
  };
}
export async function enqueueOpenSendOutboxJob(
  input: CreateOpenSendOutboxJobInput,
  repository: OpenSendOutboxRepository,
  queue: OpenSendOutboxQueue,
): Promise<OpenSendOutboxJob> {
  const job = createOpenSendOutboxJob(input);
  await repository.insert(job);
  await queue.enqueue(job.id, 0);
  return job;
}

export class OpenSendOutboxProcessor {
  readonly #repository: OpenSendOutboxRepository;
  readonly #queue: OpenSendOutboxQueue;
  readonly #sender: OpenSendSender;
  readonly #now: () => Date;
  readonly #baseRetryDelayMs: number;
  readonly #maxRetryDelayMs: number;
  readonly #leaseMs: number;

  constructor(options: OpenSendOutboxProcessorOptions) {
    this.#repository = options.repository;
    this.#queue = options.queue;
    this.#sender = options.sender;
    this.#now = options.now ?? (() => new Date());
    this.#baseRetryDelayMs = positiveInteger(options.baseRetryDelayMs ?? 1_000, "base delay");
    this.#maxRetryDelayMs = positiveInteger(
      options.maxRetryDelayMs ?? 60 * 60 * 1_000,
      "maximum delay",
    );
    this.#leaseMs = positiveInteger(options.leaseMs ?? 5 * 60 * 1_000, "lease");
    if (this.#maxRetryDelayMs < this.#baseRetryDelayMs) {
      throw new TypeError("OpenSend maximum retry delay must not be shorter than its base delay.");
    }
  }

  async process(jobId: string): Promise<OpenSendProcessResult> {
    const claimedAt = this.#now();
    const job = await this.#repository.claim(
      jobId,
      claimedAt,
      new Date(claimedAt.getTime() + this.#leaseMs),
    );
    if (job === undefined) {
      return { outcome: "skipped" };
    }

    const attempt = job.attemptCount + 1;
    try {
      const result = await this.#sender.send(job.message);
      const completedAt = this.#now().toISOString();
      await this.#repository.save({
        ...job,
        status: "delivered",
        attemptCount: attempt,
        nextAttemptAt: null,
        leaseExpiresAt: null,
        providerMessageId: result.providerMessageId,
        lastError: null,
        attempts: [
          ...job.attempts,
          {
            attempt,
            completedAt,
            outcome: "delivered",
            providerMessageId: result.providerMessageId,
            errorCode: null,
            responseStatus: null,
            retryable: null,
          },
        ],
        updatedAt: completedAt,
      });
      return { outcome: "delivered", providerMessageId: result.providerMessageId };
    } catch (cause) {
      const error = normalizeDeliveryError(cause);
      const completedAt = this.#now();
      const canRetry = error.retryable && attempt < job.maxAttempts;
      if (!canRetry) {
        await this.#repository.save({
          ...job,
          status: "failed",
          attemptCount: attempt,
          nextAttemptAt: null,
          leaseExpiresAt: null,
          lastError: error.message,
          attempts: [...job.attempts, failedAttempt(attempt, completedAt, "failed", error)],
          updatedAt: completedAt.toISOString(),
        });
        return { outcome: "failed", errorCode: error.code };
      }

      const delayMs = this.#retryDelay(attempt, error.retryAfterMs);
      const nextAttemptAt = new Date(completedAt.getTime() + delayMs).toISOString();
      await this.#repository.save({
        ...job,
        status: "retry_scheduled",
        attemptCount: attempt,
        nextAttemptAt,
        leaseExpiresAt: null,
        lastError: error.message,
        attempts: [...job.attempts, failedAttempt(attempt, completedAt, "retry_scheduled", error)],
        updatedAt: completedAt.toISOString(),
      });
      await this.#queue.enqueue(job.id, delayMs);
      return { outcome: "retry_scheduled", delayMs };
    }
  }

  #retryDelay(attempt: number, retryAfterMs: number | undefined): number {
    const exponential = Math.min(
      this.#maxRetryDelayMs,
      this.#baseRetryDelayMs * 2 ** Math.max(0, attempt - 1),
    );
    return Math.min(this.#maxRetryDelayMs, Math.max(exponential, retryAfterMs ?? 0));
  }
}

export class InMemoryOpenSendOutboxRepository implements OpenSendOutboxRepository {
  readonly #jobs = new Map<string, OpenSendOutboxJob>();

  async insert(job: OpenSendOutboxJob): Promise<void> {
    if (this.#jobs.has(job.id)) {
      throw new Error(`OpenSend outbox job ${job.id} already exists.`);
    }
    this.#jobs.set(job.id, cloneJob(job));
  }

  async find(id: string): Promise<OpenSendOutboxJob | undefined> {
    const job = this.#jobs.get(id);
    return job === undefined ? undefined : cloneJob(job);
  }

  async claim(id: string, now: Date, leaseExpiresAt: Date): Promise<OpenSendOutboxJob | undefined> {
    const job = this.#jobs.get(id);
    if (job === undefined || !isClaimable(job, now)) {
      return undefined;
    }

    const claimed: OpenSendOutboxJob = {
      ...job,
      status: "processing",
      leaseExpiresAt: leaseExpiresAt.toISOString(),
      updatedAt: now.toISOString(),
      version: job.version + 1,
    };
    this.#jobs.set(id, cloneJob(claimed));
    return cloneJob(claimed);
  }

  async save(job: OpenSendOutboxJob): Promise<void> {
    const current = this.#jobs.get(job.id);
    if (current === undefined) {
      throw new Error(`OpenSend outbox job ${job.id} does not exist.`);
    }
    if (current.status !== "processing" || current.version !== job.version) {
      throw new Error(`OpenSend outbox job ${job.id} has a stale processing lease.`);
    }
    this.#jobs.set(job.id, cloneJob(job));
  }
}

function isClaimable(job: OpenSendOutboxJob, now: Date): boolean {
  if (job.status === "queued") {
    return true;
  }
  if (job.status === "retry_scheduled") {
    return job.nextAttemptAt !== null && new Date(job.nextAttemptAt).getTime() <= now.getTime();
  }
  if (job.status === "processing") {
    return job.leaseExpiresAt !== null && new Date(job.leaseExpiresAt).getTime() <= now.getTime();
  }
  return false;
}

function failedAttempt(
  attempt: number,
  completedAt: Date,
  outcome: "retry_scheduled" | "failed",
  error: NormalizedDeliveryError,
): OpenSendDeliveryAttempt {
  return {
    attempt,
    completedAt: completedAt.toISOString(),
    outcome,
    providerMessageId: null,
    errorCode: error.code,
    responseStatus: error.status,
    retryable: error.retryable,
  };
}

interface NormalizedDeliveryError {
  readonly code: OpenSendErrorCode | "UNEXPECTED_ERROR";
  readonly message: string;
  readonly retryable: boolean;
  readonly status: number | null;
  readonly retryAfterMs: number | undefined;
}

function normalizeDeliveryError(cause: unknown): NormalizedDeliveryError {
  if (cause instanceof OpenSendError) {
    return {
      code: cause.code,
      message: cause.message,
      retryable: cause.retryable,
      status: cause.status ?? null,
      retryAfterMs: cause.retryAfterMs,
    };
  }
  return {
    code: "UNEXPECTED_ERROR",
    message: "OpenSend delivery failed unexpectedly.",
    retryable: true,
    status: null,
    retryAfterMs: undefined,
  };
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`OpenSend ${label} must be a positive integer.`);
  }
  return value;
}

function cloneJob(job: OpenSendOutboxJob): OpenSendOutboxJob {
  return {
    ...job,
    message: cloneMessage(job.message),
    attempts: job.attempts.map((attempt) => ({ ...attempt })),
  };
}

function cloneMessage(message: OpenSendMessage): OpenSendMessage {
  return {
    ...message,
    to: [...message.to],
    ...(message.headers === undefined ? {} : { headers: { ...message.headers } }),
    ...(message.attachments === undefined
      ? {}
      : { attachments: message.attachments.map((attachment) => ({ ...attachment })) }),
  };
}
