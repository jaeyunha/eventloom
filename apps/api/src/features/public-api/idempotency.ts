import { PublicApiError } from "./errors";

export interface IdempotencyStoredResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface IdempotencyRecord extends IdempotencyStoredResponse {
  readonly scope: string;
  readonly key: string;
  readonly fingerprint: string;
}

export type IdempotencyBeginResult =
  | {
      readonly status: "acquired";
      readonly leaseId?: string;
    }
  | {
      readonly status: "replay";
      readonly response: IdempotencyStoredResponse;
    }
  | {
      readonly status: "conflict";
    }
  | {
      readonly status: "pending";
      readonly wait: () => Promise<IdempotencyStoredResponse>;
    };

/**
 * D1/Durable Object adapters implement this interface with a unique
 * (scope,key) constraint and an atomic claim. No production in-memory store is
 * supplied by the public API module.
 */
export interface IdempotencyStore {
  begin(input: {
    readonly scope: string;
    readonly key: string;
    readonly fingerprint: string;
  }): Promise<IdempotencyBeginResult>;
  complete(input: {
    readonly scope: string;
    readonly key: string;
    readonly fingerprint: string;
    readonly leaseId?: string;
    readonly response: IdempotencyStoredResponse;
  }): Promise<void>;
  release?(input: {
    readonly scope: string;
    readonly key: string;
    readonly fingerprint: string;
    readonly leaseId?: string;
  }): Promise<void>;
}

export interface IdempotencyOutcome<T> {
  readonly value: T;
  readonly replayed: boolean;
}

/** The canonical coordinator contract consumed by the public API router. */
export interface IdempotencyCoordinator {
  run<T>(
    scope: string,
    key: string,
    fingerprint: string,
    operation: () => Promise<T>,
  ): Promise<IdempotencyOutcome<T>>;
}

export interface LegacyIdempotencyCoordinator {
  run<T>(scope: string, key: string, operation: () => Promise<T>): Promise<T>;
}

export type IdempotencyCoordinatorLike =
  | IdempotencyCoordinator
  | LegacyIdempotencyCoordinator
  | {
      execute<T>(input: {
        readonly scope: string;
        readonly key: string;
        readonly fingerprint: string;
        readonly operation: () => Promise<T>;
      }): Promise<IdempotencyOutcome<T> | T>;
    };

export class IdempotencyConflictError extends PublicApiError {
  constructor() {
    super(
      "IDEMPOTENCY_CONFLICT",
      "The idempotency key was already used with a different request.",
    );
  }
}

export function createIdempotencyCoordinator(store: IdempotencyStore): IdempotencyCoordinator {
  return new AtomicIdempotencyCoordinator(store);
}

export class AtomicIdempotencyCoordinator implements IdempotencyCoordinator {
  readonly #store: IdempotencyStore;

  constructor(store: IdempotencyStore) {
    this.#store = store;
  }

  async run<T>(
    scope: string,
    key: string,
    fingerprint: string,
    operation: () => Promise<T>,
  ): Promise<IdempotencyOutcome<T>> {
    const claim = await this.#store.begin({ scope, key, fingerprint });
    if (claim.status === "conflict") {
      throw new IdempotencyConflictError();
    }
    if (claim.status === "replay") {
      return {
        value: claim.response.body as T,
        replayed: true,
      };
    }
    if (claim.status === "pending") {
      const response = await claim.wait();
      return {
        value: response.body as T,
        replayed: true,
      };
    }

    try {
      const value = await operation();
      const response: IdempotencyStoredResponse = { status: 200, body: value };
      const completeInput = {
        scope,
        key,
        fingerprint,
        response,
        ...(claim.leaseId === undefined ? {} : { leaseId: claim.leaseId }),
      };
      await this.#store.complete(completeInput);
      return { value, replayed: false };
    } catch (error) {
      if (this.#store.release !== undefined) {
        const releaseInput = {
          scope,
          key,
          fingerprint,
          ...(claim.leaseId === undefined ? {} : { leaseId: claim.leaseId }),
        };
        await this.#store.release(releaseInput);
      }
      throw error;
    }
  }
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function requestFingerprint(input: {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}): string {
  return stableStringify({
    method: input.method.toUpperCase(),
    path: input.path,
    body: input.body,
  });
}

function isOutcome<T>(value: unknown): value is IdempotencyOutcome<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    "replayed" in value &&
    typeof (value as { replayed?: unknown }).replayed === "boolean"
  );
}

/**
 * Supports the canonical coordinator and the small legacy run shape used by
 * older services while keeping the router's production dependency explicit.
 */
export async function runIdempotent<T>(
  coordinator: IdempotencyCoordinatorLike,
  input: {
    readonly scope: string;
    readonly key: string;
    readonly fingerprint: string;
    readonly operation: () => Promise<T>;
  },
): Promise<IdempotencyOutcome<T>> {
  if ("execute" in coordinator && typeof coordinator.execute === "function") {
    const result = await coordinator.execute(input);
    return isOutcome<T>(result) ? result : { value: result as T, replayed: false };
  }

  const runner = coordinator.run as (...args: unknown[]) => Promise<unknown>;
  if (runner.length <= 3) {
    const result = await runner(input.scope, input.key, input.operation);
    return isOutcome<T>(result) ? result : { value: result as T, replayed: false };
  }
  const result = await runner(input.scope, input.key, input.fingerprint, input.operation);
  return isOutcome<T>(result) ? result : { value: result as T, replayed: false };
}
