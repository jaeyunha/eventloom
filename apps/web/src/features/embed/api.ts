import type {
  PublicEmbedErrorResponse,
  PublishedAgenda,
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

type PublicFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit & { next?: { revalidate: number } },
) => Promise<Response>;

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

async function getPublishedProjection<T>(
  baseUrl: string,
  eventSlug: string,
  projection: "agenda" | "speakers",
  fetcher: PublicFetcher,
): Promise<T> {
  const response = await fetcher(
    `${trimTrailingSlash(baseUrl)}/api/public/events/${encodeURIComponent(eventSlug)}/${projection}`,
    {
      headers: { accept: "application/json" },
      cache: "force-cache",
      next: { revalidate: 60 },
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
