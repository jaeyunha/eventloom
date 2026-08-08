import type { AirtableRequest, AirtableResponse, AirtableTransport } from "./types";

export interface AirtableRetryOptions {
  /** Total attempts, including the first request. */
  readonly maxAttempts?: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly jitterRatio?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly random?: () => number;
  readonly now?: () => number;
}

const IDEMPOTENT_RETRY_METHODS = new Set(["GET", "PATCH"]);

export class RetryingAirtableTransport implements AirtableTransport {
  readonly #transport: AirtableTransport;
  readonly #maxAttempts: number;
  readonly #baseDelayMs: number;
  readonly #maxDelayMs: number;
  readonly #jitterRatio: number;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  readonly #random: () => number;
  readonly #now: () => number;

  constructor(transport: AirtableTransport, options: AirtableRetryOptions = {}) {
    this.#transport = transport;
    this.#maxAttempts = positiveInteger(options.maxAttempts ?? 5, "maxAttempts");
    this.#baseDelayMs = nonNegativeNumber(options.baseDelayMs ?? 250, "baseDelayMs");
    this.#maxDelayMs = nonNegativeNumber(options.maxDelayMs ?? 5_000, "maxDelayMs");
    this.#jitterRatio = ratio(options.jitterRatio ?? 0.2);
    this.#sleep = options.sleep ?? defaultSleep;
    this.#random = options.random ?? Math.random;
    this.#now = options.now ?? Date.now;
  }

  async request<TBody = unknown>(request: AirtableRequest): Promise<AirtableResponse<TBody>> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        const response = await this.#transport.request<TBody>(request);
        if (!this.#shouldRetryResponse(request, response, attempt)) {
          return response;
        }

        await this.#sleep(this.#delayFor(response, attempt));
      } catch (error) {
        if (!this.#shouldRetryError(request, attempt)) {
          throw error;
        }
        await this.#sleep(this.#backoff(attempt));
      }
    }
  }

  #shouldRetryResponse(
    request: AirtableRequest,
    response: AirtableResponse,
    attempt: number,
  ): boolean {
    if (attempt >= this.#maxAttempts || request.signal?.aborted === true) {
      return false;
    }
    if (response.status === 429) {
      return true;
    }
    return response.status >= 500 && IDEMPOTENT_RETRY_METHODS.has(request.method);
  }

  #shouldRetryError(request: AirtableRequest, attempt: number): boolean {
    return (
      attempt < this.#maxAttempts &&
      request.signal?.aborted !== true &&
      IDEMPOTENT_RETRY_METHODS.has(request.method)
    );
  }

  #delayFor(response: AirtableResponse, attempt: number): number {
    const retryAfter = parseRetryAfter(response.headers["retry-after"], this.#now());
    return retryAfter ?? this.#backoff(attempt);
  }

  #backoff(attempt: number): number {
    const exponential = Math.min(this.#maxDelayMs, this.#baseDelayMs * 2 ** (attempt - 1));
    const jitter = 1 + this.#jitterRatio * (clamp(this.#random(), 0, 1) * 2 - 1);
    return Math.round(exponential * jitter);
  }
}

export function parseRetryAfter(value: string | undefined, now: number): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1_000);
  }

  const at = Date.parse(value);
  if (Number.isNaN(at)) {
    return undefined;
  }
  return Math.max(0, at - now);
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
  return value;
}

function nonNegativeNumber(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative finite number.`);
  }
  return value;
}

function ratio(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError("jitterRatio must be between 0 and 1.");
  }
  return value;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
