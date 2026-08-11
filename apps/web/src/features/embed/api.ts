import type {
  PublicEmbedErrorResponse,
  PublishedAgenda,
  PublishedProgram,
  PublishedSpeakerGallery,
} from "./types";

export class PublicEmbedApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly traceId: string | undefined;

  constructor(code: string, message: string, status: number, traceId?: string) {
    super(message);
    this.name = "PublicEmbedApiError";
    this.code = code;
    this.status = status;
    this.traceId = traceId;
  }
}

type PublicFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const PUBLIC_PROJECTION_REVALIDATE_SECONDS = 60;
export const PUBLIC_PROGRAM_CACHE_TAG = "public-programs";
const REMOTE_API_ORIGINS = {
  staging: [
    "https://open-sessionboard-web-staging.ashleyha0317.workers.dev",
    "https://open-sessionboard-api-staging.ashleyha0317.workers.dev",
  ],
  production: [
    "https://open-sessionboard-web-production.ashleyha0317.workers.dev",
    "https://open-sessionboard-api-production.ashleyha0317.workers.dev",
  ],
} as const;

function configuredEnvironment(): "local" | "staging" | "production" | undefined {
  const value = process.env.APP_ENV?.trim();
  return value === "local" || value === "staging" || value === "production" ? value : undefined;
}

function normalizeApiOrigin(value: string): string {
  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    throw new PublicEmbedApiError("CONFIGURATION_ERROR", "The public API origin is invalid.", 503);
  }

  if (
    origin.origin !== value.replace(/\/+$/u, "") ||
    origin.username.length > 0 ||
    origin.password.length > 0 ||
    origin.search.length > 0 ||
    origin.hash.length > 0 ||
    (origin.pathname !== "/" && origin.pathname !== "")
  ) {
    throw new PublicEmbedApiError(
      "CONFIGURATION_ERROR",
      "The public API origin must not include a path or credentials.",
      503,
    );
  }

  const environment = configuredEnvironment();
  if (environment === "local") {
    if (
      (origin.hostname !== "localhost" && origin.hostname !== "127.0.0.1") ||
      (origin.protocol !== "http:" && origin.protocol !== "https:")
    ) {
      throw new PublicEmbedApiError(
        "CONFIGURATION_ERROR",
        "The local public API origin must use localhost or 127.0.0.1.",
        503,
      );
    }
    return origin.origin;
  }

  if (environment !== undefined) {
    const expected = REMOTE_API_ORIGINS[environment];
    if (!(expected as readonly string[]).includes(origin.origin)) {
      throw new PublicEmbedApiError(
        "CONFIGURATION_ERROR",
        "The public API origin does not match this deployment environment.",
        503,
      );
    }
    return origin.origin;
  }

  if (!(Object.values(REMOTE_API_ORIGINS).flat() as readonly string[]).includes(origin.origin)) {
    const isLocal =
      (origin.hostname === "localhost" || origin.hostname === "127.0.0.1") &&
      (origin.protocol === "http:" || origin.protocol === "https:");
    if (!isLocal) {
      throw new PublicEmbedApiError(
        "CONFIGURATION_ERROR",
        "The public API origin is not an approved deployment origin.",
        503,
      );
    }
  }
  return origin.origin;
}

async function getPublishedProjection<T>(
  baseUrl: string,
  eventSlug: string,
  projection: "agenda" | "speakers",
  fetcher: PublicFetcher,
): Promise<T> {
  const apiOrigin = normalizeApiOrigin(baseUrl);
  const response = await fetcher(
    `${apiOrigin}/api/public/events/${encodeURIComponent(eventSlug)}/${projection}`,
    {
      headers: { accept: "application/json" },
      cache: "force-cache",
      next: {
        revalidate: PUBLIC_PROJECTION_REVALIDATE_SECONDS,
        tags: [PUBLIC_PROGRAM_CACHE_TAG],
      },
    },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | PublicEmbedErrorResponse
      | undefined;
    throw new PublicEmbedApiError(
      body?.error?.code ?? "PUBLIC_EMBED_UNAVAILABLE",
      body?.error?.message ?? "This published event view is not available.",
      response.status,
      body?.error?.traceId,
    );
  }
  const body = (await response.json()) as { data: T };
  return body.data;
}

export function getPublishedAgenda(
  baseUrl: string,
  eventSlug: string,
  fetcher: PublicFetcher = fetch,
): Promise<PublishedAgenda> {
  return getPublishedProjection(baseUrl, eventSlug, "agenda", fetcher);
}

export function getPublishedSpeakers(
  baseUrl: string,
  eventSlug: string,
  fetcher: PublicFetcher = fetch,
): Promise<PublishedSpeakerGallery> {
  return getPublishedProjection(baseUrl, eventSlug, "speakers", fetcher);
}
export function getPublishedProgram(
  baseUrl: string,
  eventSlug: string,
  fetcher: PublicFetcher = fetch,
): Promise<PublishedProgram> {
  return Promise.all([
    getPublishedAgenda(baseUrl, eventSlug, fetcher),
    getPublishedSpeakers(baseUrl, eventSlug, fetcher),
  ]).then(([agenda, speakers]) => ({ agenda, speakers }));
}
