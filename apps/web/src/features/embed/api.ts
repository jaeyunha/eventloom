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
export class PublicEmbedProgramLoadError extends PublicEmbedApiError {
  readonly agendaError: unknown;
  readonly speakersError: unknown;

  constructor(agendaError: unknown, speakersError: unknown) {
    const errors = [agendaError, speakersError].filter(
      (error): error is PublicEmbedApiError => error instanceof PublicEmbedApiError,
    );
    const primary =
      errors.find((error) => error.status !== 404 && error.status !== 503) ?? errors[0];

    super(
      primary?.code ?? "PUBLIC_EMBED_UNAVAILABLE",
      primary?.message ?? "The published event views are not available.",
      primary?.status ?? 503,
      primary?.traceId,
    );
    this.name = "PublicEmbedProgramLoadError";
    this.agendaError = agendaError;
    this.speakersError = speakersError;
  }
}

type PublicFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type PublicEmbedEnvironment = "local" | "staging" | "production" | undefined;
const PUBLIC_PROJECTION_REVALIDATE_SECONDS = 60;
export const PUBLIC_PROGRAM_CACHE_TAG = "public-programs";
function configuredEnvironment(
  value: string | undefined = process.env.APP_ENV,
): PublicEmbedEnvironment {
  const normalized = value?.trim();
  return normalized === "local" || normalized === "staging" || normalized === "production"
    ? normalized
    : undefined;
}

function normalizeApiOrigin(
  value: string,
  configuredAppEnvironment: string | undefined = process.env.APP_ENV,
): string {
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

  const environment = configuredEnvironment(configuredAppEnvironment);
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
    if (origin.protocol !== "https:") {
      throw new PublicEmbedApiError(
        "CONFIGURATION_ERROR",
        "The public API origin must use HTTPS outside local development.",
        503,
      );
    }
    return origin.origin;
  }

  if (origin.protocol !== "https:") {
    const isLocal =
      (origin.hostname === "localhost" || origin.hostname === "127.0.0.1") &&
      (origin.protocol === "http:" || origin.protocol === "https:");
    if (!isLocal) {
      throw new PublicEmbedApiError(
        "CONFIGURATION_ERROR",
        "The public API origin must use HTTPS outside local development.",
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
  appEnvironment?: string,
  bypassCache = false,
): Promise<T> {
  const apiOrigin = normalizeApiOrigin(baseUrl, appEnvironment);
  const response = await fetcher(
    `${apiOrigin}/api/public/events/${encodeURIComponent(eventSlug)}/${projection}`,
    bypassCache
      ? {
          headers: { accept: "application/json" },
          cache: "no-store",
        }
      : {
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
  appEnvironment?: string,
): Promise<PublishedAgenda> {
  return getPublishedProjection(baseUrl, eventSlug, "agenda", fetcher, appEnvironment);
}

export function getPublishedSpeakers(
  baseUrl: string,
  eventSlug: string,
  fetcher: PublicFetcher = fetch,
  appEnvironment?: string,
): Promise<PublishedSpeakerGallery> {
  return getPublishedProjection(baseUrl, eventSlug, "speakers", fetcher, appEnvironment);
}

export function publishedProjectionsMatch(
  agenda: PublishedAgenda,
  speakers: PublishedSpeakerGallery,
): boolean {
  return (
    agenda.revision.id === speakers.revision.id &&
    agenda.revision.number === speakers.revision.number &&
    agenda.revision.publishedAt === speakers.revision.publishedAt &&
    agenda.event.slug.toLowerCase() === speakers.event.slug.toLowerCase() &&
    agenda.event.name === speakers.event.name &&
    agenda.event.timeZone === speakers.event.timeZone &&
    agenda.event.startsOn === speakers.event.startsOn &&
    agenda.event.endsOn === speakers.event.endsOn &&
    agenda.event.venueName === speakers.event.venueName
  );
}

export function publishedProgramFromProjections(
  agenda: PublishedAgenda,
  speakers: PublishedSpeakerGallery,
): PublishedProgram {
  if (!publishedProjectionsMatch(agenda, speakers)) {
    throw new PublicEmbedApiError(
      "PUBLICATION_REVISION_MISMATCH",
      "The published agenda and speaker views are not from the same revision.",
      409,
    );
  }
  return { agenda, speakers };
}
export function getPublishedProgram(
  baseUrl: string,
  eventSlug: string,
  fetcher: PublicFetcher = fetch,
  appEnvironment?: string,
): Promise<PublishedProgram> {
  const loadPair = async (
    bypassCache: boolean,
  ): Promise<[PublishedAgenda, PublishedSpeakerGallery]> => {
    const [agenda, speakers] = await Promise.allSettled([
      getPublishedProjection<PublishedAgenda>(
        baseUrl,
        eventSlug,
        "agenda",
        fetcher,
        appEnvironment,
        bypassCache,
      ),
      getPublishedProjection<PublishedSpeakerGallery>(
        baseUrl,
        eventSlug,
        "speakers",
        fetcher,
        appEnvironment,
        bypassCache,
      ),
    ]);
    if (agenda.status === "fulfilled" && speakers.status === "fulfilled") {
      return [agenda.value, speakers.value];
    }
    throw new PublicEmbedProgramLoadError(
      agenda.status === "rejected" ? agenda.reason : undefined,
      speakers.status === "rejected" ? speakers.reason : undefined,
    );
  };
  return loadPair(true).then(async ([agenda, speakers]) => {
    if (publishedProjectionsMatch(agenda, speakers)) {
      return { agenda, speakers };
    }

    if (agenda.revision.number < speakers.revision.number) {
      const refreshedAgenda = await getPublishedProjection<PublishedAgenda>(
        baseUrl,
        eventSlug,
        "agenda",
        fetcher,
        appEnvironment,
        true,
      );
      if (refreshedAgenda.revision.number > speakers.revision.number) {
        const refreshedSpeakers = await getPublishedProjection<PublishedSpeakerGallery>(
          baseUrl,
          eventSlug,
          "speakers",
          fetcher,
          appEnvironment,
          true,
        );
        return publishedProgramFromProjections(refreshedAgenda, refreshedSpeakers);
      }
      return publishedProgramFromProjections(refreshedAgenda, speakers);
    }

    if (speakers.revision.number < agenda.revision.number) {
      const refreshedSpeakers = await getPublishedProjection<PublishedSpeakerGallery>(
        baseUrl,
        eventSlug,
        "speakers",
        fetcher,
        appEnvironment,
        true,
      );
      if (refreshedSpeakers.revision.number > agenda.revision.number) {
        const refreshedAgenda = await getPublishedProjection<PublishedAgenda>(
          baseUrl,
          eventSlug,
          "agenda",
          fetcher,
          appEnvironment,
          true,
        );
        return publishedProgramFromProjections(refreshedAgenda, refreshedSpeakers);
      }
      return publishedProgramFromProjections(agenda, refreshedSpeakers);
    }

    const [refreshedAgenda, refreshedSpeakers] = await loadPair(true);
    return publishedProgramFromProjections(refreshedAgenda, refreshedSpeakers);
  });
}
