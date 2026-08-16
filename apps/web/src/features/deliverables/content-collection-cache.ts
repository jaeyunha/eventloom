export const CONTENT_COLLECTION_NAVIGATION_CACHE_TTL_MS = 60_000;

export interface ContentCollectionNavigationCacheScope {
  readonly organizationId: string;
  readonly eventId: string;
  readonly view: string;
}

export interface ContentCollectionNavigationCacheOptions {
  readonly maxEntries?: number;
  readonly now?: () => number;
  readonly ttlMs?: number;
}

export interface ContentCollectionNavigationCache<Snapshot> {
  get(scope: ContentCollectionNavigationCacheScope): Snapshot | undefined;
  set(scope: ContentCollectionNavigationCacheScope, snapshot: Snapshot): void;
  invalidate(scope: ContentCollectionNavigationCacheScope): void;
  invalidateEvent(scope: Omit<ContentCollectionNavigationCacheScope, "view">): void;
  clear(): void;
}

interface CachedSnapshot<Snapshot> {
  readonly snapshot: Snapshot;
  readonly expiresAt: number;
}

function contentCollectionNavigationScopeKey(scope: ContentCollectionNavigationCacheScope): string {
  return `${scope.organizationId.trim()}\u0000${scope.eventId.trim()}\u0000${scope.view.trim()}`;
}

export function createContentCollectionNavigationCache<Snapshot>(
  options: ContentCollectionNavigationCacheOptions = {},
): ContentCollectionNavigationCache<Snapshot> {
  const entries = new Map<string, CachedSnapshot<Snapshot>>();
  const maxEntries = options.maxEntries ?? 12;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? CONTENT_COLLECTION_NAVIGATION_CACHE_TTL_MS;

  function pruneExpired(currentTime: number): void {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= currentTime) entries.delete(key);
    }
  }

  return {
    get(scope) {
      pruneExpired(now());
      const key = contentCollectionNavigationScopeKey(scope);
      const entry = entries.get(key);
      if (entry === undefined) return undefined;
      return entry.snapshot;
    },
    set(scope, snapshot) {
      const currentTime = now();
      pruneExpired(currentTime);
      const key = contentCollectionNavigationScopeKey(scope);
      entries.delete(key);
      while (entries.size >= maxEntries) {
        const oldestKey = entries.keys().next().value;
        if (oldestKey === undefined) break;
        entries.delete(oldestKey);
      }
      entries.set(key, {
        snapshot,
        expiresAt: currentTime + ttlMs,
      });
    },
    invalidate(scope) {
      entries.delete(contentCollectionNavigationScopeKey(scope));
    },
    invalidateEvent(scope) {
      const prefix = `${scope.organizationId.trim()}\u0000${scope.eventId.trim()}\u0000`;
      for (const key of entries.keys()) {
        if (key.startsWith(prefix)) entries.delete(key);
      }
    },
    clear() {
      entries.clear();
    },
  };
}
