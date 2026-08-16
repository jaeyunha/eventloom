export interface NavigationDataCacheOptions {
  readonly maxEntries?: number;
  readonly now?: () => number;
  readonly ttlMs?: number;
}

export interface NavigationDataCacheRead<T> {
  readonly key: string;
  readonly tags: readonly string[];
  readonly load: () => Promise<T>;
  readonly fresh?: boolean;
}

export interface NavigationDataCache {
  peek<T>(key: string): T | undefined;
  read<T>(input: NavigationDataCacheRead<T>): Promise<T>;
  write<T>(key: string, value: T, tags: readonly string[]): void;
  invalidate(tags: readonly string[]): void;
  clear(): void;
}

type CompletedEntry = {
  readonly expiresAt: number;
  readonly tags: readonly string[];
  readonly value: unknown;
};

type PendingEntry = {
  readonly epoch: number;
  readonly generations: readonly (readonly [string, number])[];
  readonly key: string;
  readonly promise: Promise<unknown>;
  readonly tags: readonly string[];
};

const DEFAULT_MAX_ENTRIES = 128;
const DEFAULT_TTL_MS = 60_000;

function normalizeKey(key: string): string {
  if (typeof key !== "string") {
    throw new TypeError("Navigation data cache keys must be non-empty strings.");
  }
  const normalized = key.trim();
  if (normalized.length === 0) {
    throw new TypeError("Navigation data cache keys must be non-empty strings.");
  }
  return normalized;
}

function normalizeTags(tags: readonly string[]): readonly string[] {
  if (!Array.isArray(tags)) {
    throw new TypeError("Navigation data cache tags must be an array of non-empty strings.");
  }

  const normalized = new Set<string>();
  for (const tag of tags) {
    if (typeof tag !== "string") {
      throw new TypeError("Navigation data cache tags must be non-empty strings.");
    }
    const value = tag.trim();
    if (value.length === 0) {
      throw new TypeError("Navigation data cache tags must be non-empty strings.");
    }
    normalized.add(value);
  }
  return [...normalized].sort();
}

function validateOptions(options: NavigationDataCacheOptions): {
  readonly maxEntries: number;
  readonly now: () => number;
  readonly ttlMs: number;
} {
  const requestedMaxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  if (!Number.isSafeInteger(requestedMaxEntries) || requestedMaxEntries < 0) {
    throw new RangeError("Navigation data cache maxEntries must be a non-negative integer.");
  }
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  if (!Number.isFinite(ttlMs) || ttlMs < 0) {
    throw new RangeError("Navigation data cache ttlMs must be a non-negative number.");
  }
  return {
    maxEntries: Math.min(requestedMaxEntries, DEFAULT_MAX_ENTRIES),
    now: options.now ?? Date.now,
    ttlMs,
  };
}

export function createNavigationDataCache(
  options: NavigationDataCacheOptions = {},
): NavigationDataCache {
  const { maxEntries, now, ttlMs } = validateOptions(options);
  const completed = new Map<string, CompletedEntry>();
  const pending = new Map<string, PendingEntry>();
  const tagGenerations = new Map<string, number>();
  let epoch = 0;

  function generationFor(tag: string): number {
    return tagGenerations.get(tag) ?? 0;
  }

  function snapshotGenerations(tags: readonly string[]): readonly (readonly [string, number])[] {
    return tags.map((tag) => [tag, generationFor(tag)] as const);
  }

  function pruneExpired(currentTime: number): void {
    for (const [key, entry] of completed) {
      if (entry.expiresAt <= currentTime) {
        completed.delete(key);
      }
    }
  }

  function touch(key: string, entry: CompletedEntry): void {
    completed.delete(key);
    completed.set(key, entry);
  }

  function storeCompleted(
    key: string,
    value: unknown,
    tags: readonly string[],
    completedAt: number,
  ): void {
    if (maxEntries === 0) return;
    completed.delete(key);
    completed.set(key, {
      expiresAt: completedAt + ttlMs,
      tags,
      value,
    });
    while (completed.size > maxEntries) {
      const oldestKey = completed.keys().next().value;
      if (oldestKey === undefined) return;
      completed.delete(oldestKey);
    }
  }

  function pendingMatches(
    key: string,
    tags: readonly string[],
    entry: PendingEntry,
  ): boolean {
    if (pending.get(key) !== entry || entry.epoch !== epoch || entry.tags.length !== tags.length) {
      return false;
    }
    for (let index = 0; index < tags.length; index += 1) {
      const tag = tags[index];
      const snapshot = entry.generations[index];
      if (
        tag === undefined ||
        snapshot === undefined ||
        snapshot[0] !== tag ||
        snapshot[1] !== generationFor(tag)
      ) {
        return false;
      }
    }
    return true;
  }

  function pendingCanCommit(entry: PendingEntry): boolean {
    if (pending.get(entry.key) !== entry || entry.epoch !== epoch) return false;
    for (const [tag, generation] of entry.generations) {
      if (generationFor(tag) !== generation) return false;
    }
    return true;
  }

  function clearPendingIfCurrent(entry: PendingEntry | undefined): void {
    if (entry === undefined) return;
    if (pending.get(entry.key) === entry) {
      pending.delete(entry.key);
    }
  }

  return {
    peek<T>(key: string): T | undefined {
      const normalizedKey = normalizeKey(key);
      const currentTime = now();
      const entry = completed.get(normalizedKey);
      if (entry === undefined) return undefined;
      if (entry.expiresAt <= currentTime) {
        completed.delete(normalizedKey);
        return undefined;
      }
      touch(normalizedKey, entry);
      return entry.value as T;
    },

    read<T>({ key, tags, load, fresh = false }: NavigationDataCacheRead<T>): Promise<T> {
      const normalizedKey = normalizeKey(key);
      const normalizedTags = normalizeTags(tags);
      const existingPending = pending.get(normalizedKey);
      if (existingPending !== undefined) {
        if (pendingMatches(normalizedKey, normalizedTags, existingPending)) {
          return existingPending.promise as Promise<T>;
        }
        clearPendingIfCurrent(existingPending);
      }

      const currentTime = now();
      pruneExpired(currentTime);
      if (!fresh) {
        const cached = completed.get(normalizedKey);
        if (cached !== undefined) {
          touch(normalizedKey, cached);
          return Promise.resolve(cached.value as T);
        }
      }

      const entryEpoch = epoch;
      const entryGenerations = snapshotGenerations(normalizedTags);
      let resolvePromise!: (value: T | PromiseLike<T>) => void;
      let rejectPromise!: (reason?: unknown) => void;
      const promise = new Promise<T>((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
      });
      const pendingEntry: PendingEntry = {
        epoch: entryEpoch,
        generations: entryGenerations,
        key: normalizedKey,
        promise,
        tags: normalizedTags,
      };
      pending.set(normalizedKey, pendingEntry);

      const settleLoaded = (value: T): void => {
        try {
          if (pendingCanCommit(pendingEntry)) {
            clearPendingIfCurrent(pendingEntry);
            const completedAt = now();
            pruneExpired(completedAt);
            storeCompleted(normalizedKey, value, normalizedTags, completedAt);
          } else {
            clearPendingIfCurrent(pendingEntry);
          }
          resolvePromise(value);
        } catch (error: unknown) {
          clearPendingIfCurrent(pendingEntry);
          rejectPromise(error);
        }
      };
      const settleRejected = (error: unknown): void => {
        clearPendingIfCurrent(pendingEntry);
        rejectPromise(error);
      };

      try {
        void Promise.resolve(load()).then(settleLoaded, settleRejected);
      } catch (error: unknown) {
        settleRejected(error);
      }
      return promise;
    },

    write<T>(key: string, value: T, tags: readonly string[]): void {
      const normalizedKey = normalizeKey(key);
      const normalizedTags = normalizeTags(tags);
      clearPendingIfCurrent(pending.get(normalizedKey));
      const currentTime = now();
      pruneExpired(currentTime);
      storeCompleted(normalizedKey, value, normalizedTags, currentTime);
    },

    invalidate(tags: readonly string[]): void {
      const normalizedTags = normalizeTags(tags);
      if (normalizedTags.length === 0) return;
      const invalidated = new Set(normalizedTags);
      for (const [tag, generation] of tagGenerations) {
        if (invalidated.has(tag)) {
          tagGenerations.set(tag, generation + 1);
        }
      }
      for (const tag of normalizedTags) {
        if (!tagGenerations.has(tag)) tagGenerations.set(tag, 1);
      }

      for (const [key, entry] of completed) {
        if (entry.tags.some((tag) => invalidated.has(tag))) {
          completed.delete(key);
        }
      }
      for (const [key, entry] of pending) {
        if (entry.tags.some((tag) => invalidated.has(tag))) {
          pending.delete(key);
        }
      }
    },

    clear(): void {
      completed.clear();
      pending.clear();
      tagGenerations.clear();
      epoch += 1;
    },
  };
}
