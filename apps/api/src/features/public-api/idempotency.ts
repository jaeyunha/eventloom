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
    const encoded = JSON.stringify(value);
    return encoded === undefined ? "null" : encoded;
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

export function runIdempotent<T>(
  coordinator: IdempotencyCoordinator,
  input: {
    readonly scope: string;
    readonly key: string;
    readonly fingerprint: string;
    readonly operation: () => Promise<T>;
  },
): Promise<IdempotencyOutcome<T>> {
  return coordinator.run(input.scope, input.key, input.fingerprint, input.operation);
}
