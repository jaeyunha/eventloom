export const CONTENT_COLLECTION_NAVIGATION_CACHE_TTL_MS = 60_000;

export interface ContentCollectionNavigationCacheScope {
  readonly organizationId: string;
  readonly eventId: string;
  readonly view: string;
}

export interface ContentCollectionNavigationCacheOptions {
  readonly now?: () => number;
  readonly ttlMs?: number;
}

export interface ContentCollectionNavigationCache<Snapshot> {
  get(scope: ContentCollectionNavigationCacheScope): Snapshot | undefined;
  set(scope: ContentCollectionNavigationCacheScope, snapshot: Snapshot): void;
  invalidate(scope: ContentCollectionNavigationCacheScope): void;
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
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? CONTENT_COLLECTION_NAVIGATION_CACHE_TTL_MS;

  return {
    get(scope) {
      const key = contentCollectionNavigationScopeKey(scope);
      const entry = entries.get(key);
      if (entry === undefined) return undefined;
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return undefined;
      }
      return entry.snapshot;
    },
    set(scope, snapshot) {
      entries.set(contentCollectionNavigationScopeKey(scope), {
        snapshot,
        expiresAt: now() + ttlMs,
      });
    },
    invalidate(scope) {
      entries.delete(contentCollectionNavigationScopeKey(scope));
    },
    clear() {
      entries.clear();
    },
  };
}
