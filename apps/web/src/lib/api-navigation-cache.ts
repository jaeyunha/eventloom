type Fetcher = typeof globalThis.fetch;

export interface ApiNavigationCacheOptions {
  readonly maxEntries?: number;
  readonly now?: () => number;
  readonly origin: string;
  readonly ttlMs?: number;
}

type CachedResponse = {
  readonly expiresAt: number;
  readonly response: Response;
};

type BrowserNavigationCache = {
  readonly fetch: Fetcher;
};

const DEFAULT_MAX_ENTRIES = 128;
const DEFAULT_TTL_MS = 60_000;
const BROWSER_CACHE_KEY = "__eventloomApiNavigationFetch";

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  return (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
}

function requestUrl(input: RequestInfo | URL, origin: string): URL {
  return new URL(input instanceof Request ? input.url : String(input), origin);
}

function requestHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  return new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
}

function requestSignal(input: RequestInfo | URL, init?: RequestInit): AbortSignal | null {
  return init?.signal ?? (input instanceof Request ? input.signal : null);
}

function isCacheableApiRead(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  origin: string,
): boolean {
  if (requestMethod(input, init) !== "GET") return false;
  if (init?.cache === "no-cache" || init?.cache === "reload") return false;

  const url = requestUrl(input, origin);
  if (url.origin !== origin || !url.pathname.startsWith("/api/")) return false;
  if (url.pathname.startsWith("/api/auth/") || url.pathname.startsWith("/api/internal/")) {
    return false;
  }
  return !requestHeaders(input, init).has("authorization");
}

function cacheKey(input: RequestInfo | URL, init: RequestInit | undefined, origin: string): string {
  const url = requestUrl(input, origin);
  const headers = requestHeaders(input, init);
  const credentials =
    init?.credentials ?? (input instanceof Request ? input.credentials : "same-origin");
  return `${url.href}\u0000${credentials}\u0000${headers.get("accept") ?? ""}`;
}

function abortedFetch(signal: AbortSignal): Promise<Response> {
  return Promise.reject(
    signal.reason ?? new DOMException("The operation was aborted.", "AbortError"),
  );
}

export function createApiNavigationCachedFetch(
  fetcher: Fetcher,
  options: ApiNavigationCacheOptions,
): Fetcher {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const responses = new Map<string, CachedResponse>();

  function clear(): void {
    responses.clear();
  }

  function pruneExpired(currentTime: number): void {
    for (const [key, entry] of responses) {
      if (entry.expiresAt <= currentTime) responses.delete(key);
    }
  }

  function store(key: string, response: Response, currentTime: number): void {
    responses.delete(key);
    responses.set(key, { expiresAt: currentTime + ttlMs, response });
    while (responses.size > maxEntries) {
      const oldestKey = responses.keys().next().value;
      if (oldestKey === undefined) return;
      responses.delete(oldestKey);
    }
  }

  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = requestMethod(input, init);
    const url = requestUrl(input, options.origin);
    if (url.origin === options.origin && url.pathname.startsWith("/api/") && method !== "GET") {
      clear();
    }

    if (!isCacheableApiRead(input, init, options.origin)) {
      return fetcher(input, init);
    }

    const signal = requestSignal(input, init);
    if (signal?.aborted) return abortedFetch(signal);

    const currentTime = now();
    pruneExpired(currentTime);
    const key = cacheKey(input, init, options.origin);
    const cached = responses.get(key);
    if (cached !== undefined) {
      responses.delete(key);
      responses.set(key, cached);
      return cached.response.clone();
    }

    const response = await fetcher(input, init);
    if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
      store(key, response.clone(), currentTime);
    }
    return response;
  }) as Fetcher;
}

function browserApiNavigationFetch(): Fetcher {
  const globalWithCache = globalThis as typeof globalThis & {
    [BROWSER_CACHE_KEY]?: BrowserNavigationCache;
  };
  const existing = globalWithCache[BROWSER_CACHE_KEY];
  if (existing !== undefined) return existing.fetch;

  const fetch = createApiNavigationCachedFetch(globalThis.fetch.bind(globalThis), {
    origin: window.location.origin,
  });
  globalWithCache[BROWSER_CACHE_KEY] = { fetch };
  return fetch;
}

export function installApiNavigationCache(): void {
  if (typeof window === "undefined") return;
  globalThis.fetch = browserApiNavigationFetch();
}
