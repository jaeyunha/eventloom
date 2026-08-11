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
const PUBLIC_SPEAKER_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=30";
const PUBLIC_SPEAKER_CACHE_ORIGIN = "https://sessionboard-public-cache.invalid";
const PUBLIC_SPEAKER_CACHE_TTL_MS = 60_000;
const PUBLIC_SPEAKER_CACHE_MAX_ENTRIES = 128;

interface SpeakerResponseCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

interface SpeakerCacheEntry {
  readonly body: string;
  readonly contentType: string;
  readonly expiresAt: number;
}

interface SpeakerCacheState {
  readonly entries: Map<string, SpeakerCacheEntry>;
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
  const created: SpeakerCacheState = { entries: new Map() };
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

function speakerCacheResponse(entry: SpeakerCacheEntry): Response {
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
): Promise<SpeakerCacheEntry | null> {
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
            expiresAt: Date.now() + PUBLIC_SPEAKER_CACHE_TTL_MS,
          };
        }
      }
    } catch {
      // Cache API failures must never turn a public read into an error.
    }
  }
  removeExpiredSpeakerEntries(state);
  return state.entries.get(path) ?? null;
}

async function writeSpeakerCache(
  state: SpeakerCacheState,
  path: string,
  entry: SpeakerCacheEntry,
): Promise<void> {
  removeExpiredSpeakerEntries(state);
  state.entries.set(path, entry);
  while (state.entries.size > PUBLIC_SPEAKER_CACHE_MAX_ENTRIES) {
    const oldestPath = state.entries.keys().next().value;
    if (typeof oldestPath !== "string") break;
    state.entries.delete(oldestPath);
  }
  const workerCache = workerSpeakerCache();
  if (workerCache === null) return;
  try {
    await workerCache.put(speakerCacheRequest(path), speakerCacheResponse(entry));
  } catch {
    // Cache API failures must never turn a successful public read into an error.
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
    const data = await dependencies.getPublishedSpeakers(parsedSlug.data);
    if (data === null) {
      return errorResponse(context, 404, "NOT_FOUND", "The published event was not found.");
    }
    context.header("cache-control", PUBLIC_SPEAKER_CACHE_CONTROL);
    const response = context.json({ data });
    if (cacheable) {
      const body = await response.clone().text();
      await writeSpeakerCache(cacheState, path, {
        body,
        contentType: response.headers.get("content-type") ?? "application/json; charset=UTF-8",
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
