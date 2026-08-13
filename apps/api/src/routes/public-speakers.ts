import { apiErrorSchema } from "@eventloom/contracts";
import { type Context, Hono } from "hono";
import { z } from "zod";
import type { ProgramPublicationManifest } from "../features/events/types";

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
  /** Hash of the immutable materialized speaker source; validated but never exposed. */
  readonly sourceHash?: string;
}

/**
 * The source must return a materialized immutable publication. It must not
 * read draft, task, review, or mutable profile state while serving this route.
 */
export interface PublishedSpeakerRouteDependencies {
  /**
   * Resolves the immutable program release selected for the public URL.
   * Adapters that have not yet been wired to publication manifests may omit it;
   * public reads fail closed until it is supplied.
   */
  readonly getProgramPublicationManifest?: (
    eventSlug: string,
  ) => Promise<ProgramPublicationManifest | null>;
  /**
   * The source must return the exact speaker projection selected by the served
   * manifest. Existing adapters may ignore the revision arguments while they
   * are being migrated; the route still validates the returned child revision.
   */
  readonly getPublishedSpeakers: (
    eventSlug: string,
    speakerRevisionId?: string,
    speakerRevisionNumber?: number,
  ) => Promise<PublishedSpeakerProjection | null>;
  readonly getPublishedSpeakerHeadshot?: (
    eventSlug: string,
    speakerId: string,
    programRevision?: number,
    speakerRevisionId?: string,
    speakerRevisionNumber?: number,
  ) => Promise<PublishedSpeakerHeadshot | null>;
}

export interface PublishedSpeakerHeadshot {
  readonly body: ArrayBuffer;
  readonly contentType: "image/jpeg" | "image/png" | "image/webp";
  readonly sizeBytes: number;
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
const PUBLIC_SPEAKER_CACHE_ORIGIN = "https://eventloom-public-cache.invalid/v2";
const PUBLIC_SPEAKER_CACHE_TTL_MS = 60_000;
const PUBLIC_SPEAKER_CACHE_MAX_ENTRIES = 128;

export function publishedSpeakerPhotoPath(eventSlug: string, speakerId: string): string {
  return `/api/public/events/${encodeURIComponent(eventSlug)}/speakers/${encodeURIComponent(speakerId)}/headshot`;
}

function stablePublicPhotoUrl(value: unknown, eventSlug: string, speakerId: string): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  return candidate === publishedSpeakerPhotoPath(eventSlug, speakerId) ? candidate : null;
}

const publishedSpeakerProjectionSchema = z
  .object({
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
        photoUrl: z.unknown(),
        sessionIds: z.array(z.string().trim().min(1)),
        sessionTitles: z.array(z.string()),
        trackNames: z.array(z.string()),
      }),
    ),
  })
  .transform(
    (projection): PublishedSpeakerProjection => ({
      ...projection,
      speakers: projection.speakers.map((speaker) => ({
        ...speaker,
        photoUrl: stablePublicPhotoUrl(speaker.photoUrl, projection.event.slug, speaker.id),
      })),
    }),
  );
type ServedProgramPublicationManifest = ProgramPublicationManifest & {
  readonly lifecycle: "served";
};

function isServedProgramPublicationManifest(
  manifest: ProgramPublicationManifest | null,
): manifest is ServedProgramPublicationManifest {
  return (
    manifest !== null &&
    manifest.lifecycle === "served" &&
    typeof manifest.id === "string" &&
    manifest.id.trim().length > 0 &&
    Number.isSafeInteger(manifest.revision) &&
    manifest.revision > 0 &&
    Number.isSafeInteger(manifest.cacheRevision) &&
    manifest.cacheRevision > 0 &&
    typeof manifest.publishedAt === "string" &&
    manifest.publishedAt.trim().length > 0 &&
    typeof manifest.speakerProjectionId === "string" &&
    manifest.speakerProjectionId.trim().length > 0 &&
    Number.isSafeInteger(manifest.speakerRevisionNumber) &&
    manifest.speakerRevisionNumber > 0
  );
}

async function servedProgramPublicationManifest(
  dependencies: PublishedSpeakerRouteDependencies,
  eventSlug: string,
): Promise<ServedProgramPublicationManifest | null> {
  if (dependencies.getProgramPublicationManifest === undefined) return null;
  const manifest = await dependencies.getProgramPublicationManifest(eventSlug);
  return isServedProgramPublicationManifest(manifest) ? manifest : null;
}

function projectionBoundToManifest(
  projection: PublishedSpeakerProjection | null,
  eventSlug: string,
  manifest: ServedProgramPublicationManifest,
): PublishedSpeakerProjection | null {
  if (projection === null) return null;
  const parsed = publishedSpeakerProjectionSchema.safeParse(projection);
  if (!parsed.success || projection.sourceHash !== manifest.speakerSourceHash) return null;
  if (
    parsed.data.event.slug.toLocaleLowerCase() !== eventSlug.toLocaleLowerCase() ||
    parsed.data.revision.id !== manifest.speakerProjectionId ||
    parsed.data.revision.number !== manifest.speakerRevisionNumber
  ) {
    return null;
  }
  return {
    ...parsed.data,
    revision: {
      id: manifest.id,
      number: manifest.revision,
      publishedAt: manifest.publishedAt,
    },
  };
}

interface SpeakerResponseCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
  delete?(request: Request): Promise<boolean>;
}

interface SpeakerCachedResponse {
  readonly body: string;
  readonly contentType: string;
  readonly programRevision: number;
  readonly cacheRevision: number;
}

interface SpeakerCacheEntry extends SpeakerCachedResponse {
  readonly expiresAt: number;
}

interface SpeakerCacheState {
  readonly entries: Map<string, SpeakerCacheEntry>;
  readonly generations: Map<string, number>;
  readonly persistence: Map<string, Promise<void>>;
  readonly latestRevisions: Map<string, number>;
}

const speakerCacheStates = new WeakMap<object, SpeakerCacheState>();
const PROGRAM_REVISION_HEADER = "x-sessionboard-program-revision";
const CACHE_REVISION_HEADER = "x-sessionboard-cache-revision";

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

function speakerCacheBasePath(context: PublishedSpeakerContext): string {
  return new URL(context.req.url).pathname;
}

function speakerCachePath(
  basePath: string,
  manifest: Pick<ServedProgramPublicationManifest, "revision" | "cacheRevision">,
): string {
  return `${basePath}?programRevision=${encodeURIComponent(String(manifest.revision))}&cacheRevision=${encodeURIComponent(String(manifest.cacheRevision))}`;
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
      [PROGRAM_REVISION_HEADER]: String(entry.programRevision),
      [CACHE_REVISION_HEADER]: String(entry.cacheRevision),
    },
  });
}

function positiveRevisionHeader(value: string | null): number | null {
  if (value === null) return null;
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision > 0 ? revision : null;
}

async function readSpeakerCache(
  state: SpeakerCacheState,
  path: string,
  programRevision: number,
  cacheRevision: number,
): Promise<SpeakerCachedResponse | null> {
  removeExpiredSpeakerEntries(state);
  const memoryEntry = state.entries.get(path);
  if (
    memoryEntry !== undefined &&
    memoryEntry.programRevision === programRevision &&
    memoryEntry.cacheRevision === cacheRevision
  ) {
    return memoryEntry;
  }
  const workerCache = workerSpeakerCache();
  if (workerCache !== null) {
    try {
      const cached = await workerCache.match(speakerCacheRequest(path));
      if (cached !== undefined && cached.status === 200) {
        const contentType = cached.headers.get("content-type");
        const cachedProgramRevision = positiveRevisionHeader(
          cached.headers.get(PROGRAM_REVISION_HEADER),
        );
        const cachedCacheRevision = positiveRevisionHeader(
          cached.headers.get(CACHE_REVISION_HEADER),
        );
        if (
          contentType !== null &&
          cachedProgramRevision === programRevision &&
          cachedCacheRevision === cacheRevision
        ) {
          return {
            body: await cached.clone().text(),
            contentType,
            programRevision: cachedProgramRevision,
            cacheRevision: cachedCacheRevision,
          };
        }
      }
    } catch {
      // Cache API failures must never turn a public read into an error.
    }
  }
  return null;
}

function nextSpeakerCacheGeneration(state: SpeakerCacheState, basePath: string): number {
  const generation = (state.generations.get(basePath) ?? 0) + 1;
  state.generations.set(basePath, generation);
  return generation;
}

function enqueueSpeakerCachePut(
  state: SpeakerCacheState,
  basePath: string,
  operation: () => Promise<void>,
): Promise<void> {
  const previous = state.persistence.get(basePath) ?? Promise.resolve();
  const persistence = previous
    .catch(() => undefined)
    .then(operation)
    .catch(() => undefined);
  state.persistence.set(basePath, persistence);
  void persistence.finally(() => {
    if (state.persistence.get(basePath) === persistence) state.persistence.delete(basePath);
  });
  return persistence;
}

function scheduleSpeakerCachePut(
  context: PublishedSpeakerContext,
  state: SpeakerCacheState,
  workerCache: SpeakerResponseCache,
  basePath: string,
  path: string,
  entry: SpeakerCacheEntry,
  generation: number,
): void {
  const persistence = enqueueSpeakerCachePut(state, basePath, async () => {
    if (state.generations.get(basePath) !== generation) return;
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
  basePath: string,
  path: string,
  entry: SpeakerCacheEntry,
): void {
  if ((state.latestRevisions.get(basePath) ?? 0) > entry.cacheRevision) return;
  state.latestRevisions.set(basePath, entry.cacheRevision);
  const generation = nextSpeakerCacheGeneration(state, basePath);
  removeExpiredSpeakerEntries(state);
  for (const existingPath of state.entries.keys()) {
    if (existingPath === basePath || existingPath.startsWith(`${basePath}?`)) {
      state.entries.delete(existingPath);
    }
  }
  state.entries.set(path, entry);
  while (state.entries.size > PUBLIC_SPEAKER_CACHE_MAX_ENTRIES) {
    const oldestPath = state.entries.keys().next().value;
    if (typeof oldestPath !== "string") break;
    state.entries.delete(oldestPath);
  }
  const workerCache = workerSpeakerCache();
  if (workerCache === null) return;
  scheduleSpeakerCachePut(context, state, workerCache, basePath, path, entry, generation);
}

export async function invalidatePublishedSpeakerCache(
  dependencies: PublishedSpeakerRouteDependencies,
  eventSlug: string,
  servedProgramRevision?: number,
  cacheRevision?: number,
): Promise<void> {
  const normalizedSlug = eventSlug.trim();
  if (normalizedSlug.length === 0) return;
  const basePath = `/api/public/events/${encodeURIComponent(normalizedSlug)}/speakers`;
  const state = speakerCacheState(dependencies);
  nextSpeakerCacheGeneration(state, basePath);
  const normalizedProgramRevision =
    typeof servedProgramRevision === "number" &&
    Number.isSafeInteger(servedProgramRevision) &&
    servedProgramRevision > 0
      ? servedProgramRevision
      : null;
  const normalizedCacheRevision =
    typeof cacheRevision === "number" && Number.isSafeInteger(cacheRevision) && cacheRevision > 0
      ? cacheRevision
      : null;
  if (normalizedCacheRevision !== null) {
    state.latestRevisions.set(
      basePath,
      Math.max(state.latestRevisions.get(basePath) ?? 0, normalizedCacheRevision),
    );
  }
  for (const path of state.entries.keys()) {
    if (path === basePath || path.startsWith(`${basePath}?`)) state.entries.delete(path);
  }
  const workerCache = workerSpeakerCache();
  if (workerCache?.delete !== undefined) {
    const path =
      normalizedProgramRevision !== null && normalizedCacheRevision !== null
        ? speakerCachePath(basePath, {
            revision: normalizedProgramRevision,
            cacheRevision: normalizedCacheRevision,
          })
        : basePath;
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
    const manifest = await servedProgramPublicationManifest(dependencies, parsedSlug.data);
    if (manifest === null) {
      return errorResponse(context, 404, "NOT_FOUND", "The published event was not found.");
    }
    const cacheable = anonymousSpeakerRequest(context);
    const basePath = speakerCacheBasePath(context);
    const path = speakerCachePath(basePath, manifest);
    if (cacheable) {
      const cached = await readSpeakerCache(
        cacheState,
        path,
        manifest.revision,
        manifest.cacheRevision,
      );
      if (cached !== null) return speakerCacheResponse(cached);
    }
    const projection = await dependencies.getPublishedSpeakers(
      parsedSlug.data,
      manifest.speakerProjectionId,
      manifest.speakerRevisionNumber,
    );
    const data = projectionBoundToManifest(projection, parsedSlug.data, manifest);
    if (data === null) {
      return errorResponse(context, 404, "NOT_FOUND", "The published event was not found.");
    }
    context.header("cache-control", PUBLIC_SPEAKER_CACHE_CONTROL);
    context.header(PROGRAM_REVISION_HEADER, String(manifest.revision));
    context.header(CACHE_REVISION_HEADER, String(manifest.cacheRevision));
    const body = JSON.stringify({ data });
    const contentType = "application/json";
    const response = context.body(body, 200, { "content-type": contentType });
    if (cacheable) {
      writeSpeakerCache(context, cacheState, basePath, path, {
        body,
        contentType,
        programRevision: manifest.revision,
        cacheRevision: manifest.cacheRevision,
        expiresAt: Date.now() + PUBLIC_SPEAKER_CACHE_TTL_MS,
      });
    }
    return response;
  });

  routes.get("/:speakerId/headshot", async (context) => {
    const parsedSlug = eventSlugSchema.safeParse(context.req.param("eventSlug"));
    const parsedSpeakerId = z
      .string()
      .trim()
      .min(1)
      .max(200)
      .safeParse(context.req.param("speakerId"));
    if (
      !parsedSlug.success ||
      !parsedSpeakerId.success ||
      dependencies.getPublishedSpeakerHeadshot === undefined
    ) {
      return errorResponse(context, 404, "NOT_FOUND", "The published headshot was not found.");
    }
    const manifest = await servedProgramPublicationManifest(dependencies, parsedSlug.data);
    if (manifest === null) {
      return errorResponse(context, 404, "NOT_FOUND", "The published headshot was not found.");
    }
    const projection = await dependencies.getPublishedSpeakers(
      parsedSlug.data,
      manifest.speakerProjectionId,
      manifest.speakerRevisionNumber,
    );
    const data = projectionBoundToManifest(projection, parsedSlug.data, manifest);
    const approvedPhotoPath = publishedSpeakerPhotoPath(parsedSlug.data, parsedSpeakerId.data);
    const speaker = data?.speakers.find((candidate) => candidate.id === parsedSpeakerId.data);
    if (speaker === undefined || speaker.photoUrl !== approvedPhotoPath) {
      return errorResponse(context, 404, "NOT_FOUND", "The published headshot was not found.");
    }
    const headshot = await dependencies.getPublishedSpeakerHeadshot(
      parsedSlug.data,
      parsedSpeakerId.data,
      manifest.revision,
      manifest.speakerProjectionId,
      manifest.speakerRevisionNumber,
    );
    if (headshot === null) {
      return errorResponse(context, 404, "NOT_FOUND", "The published headshot was not found.");
    }
    return new Response(headshot.body, {
      status: 200,
      headers: {
        "cache-control": PUBLIC_SPEAKER_CACHE_CONTROL,
        "content-length": String(headshot.sizeBytes),
        "content-type": headshot.contentType,
        "x-content-type-options": "nosniff",
        [PROGRAM_REVISION_HEADER]: String(manifest.revision),
        [CACHE_REVISION_HEADER]: String(manifest.cacheRevision),
      },
    });
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
