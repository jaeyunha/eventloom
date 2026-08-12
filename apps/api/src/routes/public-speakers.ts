import { apiErrorSchema } from "@open-sessionboard/contracts";
import { type Context, Hono } from "hono";
import { z } from "zod";

export interface PublishedSpeaker {
  readonly id: string;
  readonly displayName: string;
  readonly pronouns: string | null;
  readonly jobTitle: string | null;
  readonly organization: string | null;
  readonly biography: string;
  /** Stable URL for an approved public rendition; never a private or signed asset URL. */
  readonly photoUrl: string | null;
  readonly sessionIds: readonly string[];
  readonly sessionTitles: readonly string[];
  readonly trackNames: readonly string[];
}

export interface PublishedSpeakerProjection {
  readonly event: {
    readonly slug: string;
    readonly name: string;
    readonly timeZone: string;
    readonly startsOn: string;
    readonly endsOn: string;
    readonly venueName: string | null;
  };
  readonly revision: {
    readonly id: string;
    readonly number: number;
    readonly publishedAt: string;
  };
  readonly speakers: readonly PublishedSpeaker[];
}

/**
 * The source must return a materialized immutable publication. It must not
 * read draft, task, review, or mutable profile state while serving this route.
 */
export interface PublishedSpeakerRouteDependencies {
  readonly getPublishedSpeakers: (eventSlug: string) => Promise<PublishedSpeakerProjection | null>;
}

interface PublishedSpeakerRouteEnvironment {
  Variables: {
    traceId: string;
  };
}

type PublishedSpeakerContext = Context<PublishedSpeakerRouteEnvironment>;
const eventSlugSchema = z.string().trim().min(1).max(200);
const PUBLIC_SPEAKER_CACHE_CONTROL =
  "public, max-age=0, s-maxage=60, stale-while-revalidate=30, must-revalidate";
const PUBLIC_SPEAKER_CACHE_ORIGIN = "https://sessionboard-public-cache.invalid/v2";
const PUBLIC_SPEAKER_CACHE_TTL_MS = 60_000;
const PUBLIC_SPEAKER_CACHE_MAX_ENTRIES = 128;

function stablePublicPhotoUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.search.length > 0 ||
      url.hash.length > 0
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

const publishedSpeakerProjectionSchema = z.object({
  event: z.object({
    slug: z.string().trim().min(1),
    name: z.string(),
    timeZone: z.string().trim().min(1),
    startsOn: z.string(),
    endsOn: z.string(),
    venueName: z.string().nullable(),
  }),
  revision: z.object({
    id: z.string().trim().min(1),
    number: z.number().int().positive(),
    publishedAt: z.string(),
  }),
  speakers: z.array(
    z.object({
      id: z.string().trim().min(1),
      displayName: z.string().trim().min(1),
      pronouns: z.string().nullable(),
      jobTitle: z.string().nullable(),
      organization: z.string().nullable(),
      biography: z.string(),
      photoUrl: z.unknown().transform(stablePublicPhotoUrl),
      sessionIds: z.array(z.string().trim().min(1)),
      sessionTitles: z.array(z.string()),
      trackNames: z.array(z.string()),
    }),
  ),
});

interface SpeakerResponseCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
  delete?(request: Request): Promise<boolean>;
}

interface SpeakerCachedResponse {
  readonly body: string;
  readonly contentType: string;
}

interface SpeakerCacheEntry extends SpeakerCachedResponse {
  readonly expiresAt: number;
  readonly revisionNumber: number;
}

interface SpeakerCacheState {
  readonly entries: Map<string, SpeakerCacheEntry>;
  readonly generations: Map<string, number>;
  readonly persistence: Map<string, Promise<void>>;
  readonly latestRevisions: Map<string, number>;
}

const speakerCacheStates = new WeakMap<object, SpeakerCacheState>();

function workerSpeakerCache(): SpeakerResponseCache | null {
  const workerCaches = (
    globalThis as unknown as {
      caches?: { readonly default?: SpeakerResponseCache };
    }
  ).caches;
  return workerCaches?.default ?? null;
}

function speakerCacheState(dependencies: PublishedSpeakerRouteDependencies): SpeakerCacheState {
  const key = dependencies as unknown as object;
  const existing = speakerCacheStates.get(key);
  if (existing !== undefined) return existing;
  const created: SpeakerCacheState = {
    entries: new Map(),
    generations: new Map(),
    persistence: new Map(),
    latestRevisions: new Map(),
  };
  speakerCacheStates.set(key, created);
  return created;
}

function speakerCachePath(context: PublishedSpeakerContext): string {
  return new URL(context.req.url).pathname;
}

function speakerCacheRequest(pathname: string): Request {
  return new Request(`${PUBLIC_SPEAKER_CACHE_ORIGIN}${pathname}`, { method: "GET" });
}

function anonymousSpeakerRequest(context: PublishedSpeakerContext): boolean {
  const principal = (context as unknown as { get(name: string): unknown }).get("authPrincipal");
  return principal === null || principal === undefined;
}

function removeExpiredSpeakerEntries(state: SpeakerCacheState, now = Date.now()): void {
  for (const [path, entry] of state.entries) {
    if (entry.expiresAt <= now) state.entries.delete(path);
  }
}

function speakerCacheResponse(entry: SpeakerCachedResponse): Response {
  return new Response(entry.body, {
    status: 200,
    headers: {
      "cache-control": PUBLIC_SPEAKER_CACHE_CONTROL,
      "content-type": entry.contentType,
    },
  });
}

async function readSpeakerCache(
  state: SpeakerCacheState,
  path: string,
): Promise<SpeakerCachedResponse | null> {
  removeExpiredSpeakerEntries(state);
  const memoryEntry = state.entries.get(path);
  if (memoryEntry !== undefined) return memoryEntry;
  const workerCache = workerSpeakerCache();
  if (workerCache !== null) {
    try {
      const cached = await workerCache.match(speakerCacheRequest(path));
      if (cached !== undefined && cached.status === 200) {
        const contentType = cached.headers.get("content-type");
        if (contentType !== null) {
          return {
            body: await cached.clone().text(),
            contentType,
          };
        }
      }
    } catch {
      // Cache API failures must never turn a public read into an error.
    }
  }
  return null;
}

function nextSpeakerCacheGeneration(state: SpeakerCacheState, path: string): number {
  const generation = (state.generations.get(path) ?? 0) + 1;
  state.generations.set(path, generation);
  return generation;
}

function enqueueSpeakerCachePut(
  state: SpeakerCacheState,
  path: string,
  operation: () => Promise<void>,
): Promise<void> {
  const previous = state.persistence.get(path) ?? Promise.resolve();
  const persistence = previous
    .catch(() => undefined)
    .then(operation)
    .catch(() => undefined);
  state.persistence.set(path, persistence);
  void persistence.finally(() => {
    if (state.persistence.get(path) === persistence) state.persistence.delete(path);
  });
  return persistence;
}

function scheduleSpeakerCachePut(
  context: PublishedSpeakerContext,
  state: SpeakerCacheState,
  workerCache: SpeakerResponseCache,
  path: string,
  entry: SpeakerCacheEntry,
  generation: number,
): void {
  const persistence = enqueueSpeakerCachePut(state, path, async () => {
    if (state.generations.get(path) !== generation) return;
    await workerCache.put(speakerCacheRequest(path), speakerCacheResponse(entry));
  });
  try {
    context.executionCtx.waitUntil(persistence);
  } catch {
    // Hono tests and local invocations may not attach an execution context.
  }
}

function writeSpeakerCache(
  context: PublishedSpeakerContext,
  state: SpeakerCacheState,
  path: string,
  entry: SpeakerCacheEntry,
): void {
  if ((state.latestRevisions.get(path) ?? 0) > entry.revisionNumber) return;
  state.latestRevisions.set(path, entry.revisionNumber);
  const generation = nextSpeakerCacheGeneration(state, path);
  removeExpiredSpeakerEntries(state);
  state.entries.set(path, entry);
  while (state.entries.size > PUBLIC_SPEAKER_CACHE_MAX_ENTRIES) {
    const oldestPath = state.entries.keys().next().value;
    if (typeof oldestPath !== "string") break;
    state.entries.delete(oldestPath);
  }
  const workerCache = workerSpeakerCache();
  if (workerCache === null) return;
  scheduleSpeakerCachePut(context, state, workerCache, path, entry, generation);
}
export async function invalidatePublishedSpeakerCache(
  dependencies: PublishedSpeakerRouteDependencies,
  eventSlug: string,
): Promise<void> {
  const normalizedSlug = eventSlug.trim();
  if (normalizedSlug.length === 0) return;
  const path = `/api/public/events/${encodeURIComponent(normalizedSlug)}/speakers`;
  const state = speakerCacheState(dependencies);
  nextSpeakerCacheGeneration(state, path);
  state.entries.delete(path);
  const workerCache = workerSpeakerCache();
  if (workerCache?.delete !== undefined) {
    await workerCache.delete(speakerCacheRequest(path)).catch(() => false);
  }
}

function traceId(context: PublishedSpeakerContext): string {
  return context.get("traceId") ?? crypto.randomUUID();
}

function errorResponse(
  context: PublishedSpeakerContext,
  status: 404 | 500,
  code: "NOT_FOUND" | "INTERNAL_ERROR",
  message: string,
): Response {
  return context.json(
    apiErrorSchema.parse({
      error: { code, message, traceId: traceId(context) },
    }),
    status,
  );
}

/** Anonymous route for the current immutable published speaker projection. */
export function createPublishedSpeakerRoutes(
  dependencies: PublishedSpeakerRouteDependencies,
): Hono<PublishedSpeakerRouteEnvironment> {
  const routes = new Hono<PublishedSpeakerRouteEnvironment>();
  const cacheState = speakerCacheState(dependencies);

  routes.get("/", async (context) => {
    const parsedSlug = eventSlugSchema.safeParse(context.req.param("eventSlug"));
    if (!parsedSlug.success) {
      return errorResponse(context, 404, "NOT_FOUND", "The published event was not found.");
    }
    const cacheable = anonymousSpeakerRequest(context);
    const path = speakerCachePath(context);
    if (cacheable) {
      const cached = await readSpeakerCache(cacheState, path);
      if (cached !== null) return speakerCacheResponse(cached);
    }
    const projection = await dependencies.getPublishedSpeakers(parsedSlug.data);
    if (
      projection === null ||
      projection.event.slug.toLocaleLowerCase() !== parsedSlug.data.toLocaleLowerCase()
    ) {
      return errorResponse(context, 404, "NOT_FOUND", "The published event was not found.");
    }
    const data = publishedSpeakerProjectionSchema.parse(projection);
    context.header("cache-control", PUBLIC_SPEAKER_CACHE_CONTROL);
    const body = JSON.stringify({ data });
    const contentType = "application/json";
    const response = context.body(body, 200, { "content-type": contentType });
    if (cacheable) {
      writeSpeakerCache(context, cacheState, path, {
        body,
        contentType,
        revisionNumber: data.revision.number,
        expiresAt: Date.now() + PUBLIC_SPEAKER_CACHE_TTL_MS,
      });
    }
    return response;
  });

  routes.onError((error, context) => {
    console.error(
      JSON.stringify({
        level: "error",
        event: "published_speaker_projection_failed",
        traceId: traceId(context),
        errorName: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    return errorResponse(
      context,
      500,
      "INTERNAL_ERROR",
      "The published speaker view could not be completed.",
    );
  });

  return routes;
}
