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

function invalidPublicResponse(message: string): PublicEmbedApiError {
  return new PublicEmbedApiError("PUBLIC_EMBED_INVALID_RESPONSE", message, 502);
}

type PublicProjection = "agenda" | "speakers";

interface PublicReleaseHeaders {
  readonly servedProgramRevision?: number;
  readonly cacheRevision?: number;
}

interface LoadedPublicProjection<T> {
  readonly data: T;
  readonly release: PublicReleaseHeaders;
}

function publicRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidPublicResponse(`The published ${context} response body is malformed.`);
  }
  return value as Record<string, unknown>;
}

function publicString(
  record: Record<string, unknown>,
  key: string,
  context: string,
  options: { readonly allowEmpty?: boolean } = {},
): string {
  const value = record[key];
  if (typeof value !== "string" || (!options.allowEmpty && value.trim().length === 0)) {
    throw invalidPublicResponse(`The published ${context}.${key} field is malformed.`);
  }
  return value;
}

function publicNullableString(
  record: Record<string, unknown>,
  key: string,
  context: string,
): string | null {
  const value = record[key];
  if (value !== null && typeof value !== "string") {
    throw invalidPublicResponse(`The published ${context}.${key} field is malformed.`);
  }
  return value;
}

function publicStringArray(
  value: unknown,
  context: string,
  requireNonEmpty = false,
): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.some(
      (item) => typeof item !== "string" || (requireNonEmpty && item.trim().length === 0),
    )
  ) {
    throw invalidPublicResponse(`The published ${context} field is malformed.`);
  }
  return value;
}

function publicEvent(value: unknown): PublishedAgenda["event"] {
  const record = publicRecord(value, "event");
  return {
    slug: publicString(record, "slug", "event"),
    name: publicString(record, "name", "event"),
    timeZone: publicString(record, "timeZone", "event"),
    startsOn: publicString(record, "startsOn", "event"),
    endsOn: publicString(record, "endsOn", "event"),
    venueName: publicNullableString(record, "venueName", "event"),
  };
}

function publicRevision(value: unknown, context: string): PublishedAgenda["revision"] {
  const record = publicRecord(value, context);
  const number = record.number;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number <= 0) {
    throw invalidPublicResponse(`The published ${context}.number field is malformed.`);
  }
  return {
    id: publicString(record, "id", context),
    number,
    publishedAt: publicString(record, "publishedAt", context),
  };
}

function publicAgendaEntry(value: unknown): PublishedAgenda["entries"][number] {
  const record = publicRecord(value, "agenda entry");
  const trackIds =
    record.trackIds === undefined
      ? []
      : publicStringArray(record.trackIds, "agenda entry.trackIds", true);
  return {
    id: publicString(record, "id", "agenda entry"),
    sessionId: publicString(record, "sessionId", "agenda entry"),
    title: publicString(record, "title", "agenda entry", { allowEmpty: true }),
    summary: publicString(record, "summary", "agenda entry", { allowEmpty: true }),
    format: publicString(record, "format", "agenda entry", { allowEmpty: true }),
    speakerNames: publicStringArray(record.speakerNames, "agenda entry.speakerNames"),
    roomName: publicString(record, "roomName", "agenda entry", { allowEmpty: true }),
    trackNames: publicStringArray(record.trackNames, "agenda entry.trackNames"),
    trackIds,
    startsAt: publicString(record, "startsAt", "agenda entry"),
    endsAt: publicString(record, "endsAt", "agenda entry"),
  };
}

function publicAgenda(value: unknown): PublishedAgenda {
  const record = publicRecord(value, "agenda");
  if (!Array.isArray(record.entries)) {
    throw invalidPublicResponse("The published agenda.entries field is malformed.");
  }
  return {
    event: publicEvent(record.event),
    revision: publicRevision(record.revision, "agenda revision"),
    entries: record.entries.map(publicAgendaEntry),
  };
}

function publicSpeaker(value: unknown): PublishedSpeakerGallery["speakers"][number] {
  const record = publicRecord(value, "speaker");
  return {
    id: publicString(record, "id", "speaker"),
    displayName: publicString(record, "displayName", "speaker"),
    pronouns: publicNullableString(record, "pronouns", "speaker"),
    jobTitle: publicNullableString(record, "jobTitle", "speaker"),
    organization: publicNullableString(record, "organization", "speaker"),
    biography: publicString(record, "biography", "speaker", { allowEmpty: true }),
    photoUrl: publicNullableString(record, "photoUrl", "speaker"),
    sessionIds: publicStringArray(record.sessionIds, "speaker.sessionIds", true),
    sessionTitles: publicStringArray(record.sessionTitles, "speaker.sessionTitles"),
    trackNames: publicStringArray(record.trackNames, "speaker.trackNames"),
  };
}

function publicSpeakers(value: unknown): PublishedSpeakerGallery {
  const record = publicRecord(value, "speakers");
  if (!Array.isArray(record.speakers)) {
    throw invalidPublicResponse("The published speakers.speakers field is malformed.");
  }
  return {
    event: publicEvent(record.event),
    revision: publicRevision(record.revision, "speaker revision"),
    speakers: record.speakers.map(publicSpeaker),
  };
}

function publicEnvelope(value: unknown, projection: PublicProjection): unknown {
  const record = publicRecord(value, projection);
  if (!Object.prototype.hasOwnProperty.call(record, "data")) {
    throw invalidPublicResponse(`The published ${projection} response envelope is malformed.`);
  }
  return record.data;
}

function parsePublicError(value: unknown): PublicEmbedErrorResponse | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const errorValue = (value as Record<string, unknown>).error;
  if (typeof errorValue !== "object" || errorValue === null || Array.isArray(errorValue)) {
    return undefined;
  }
  const error = errorValue as Record<string, unknown>;
  const code = typeof error.code === "string" ? error.code : undefined;
  const message = typeof error.message === "string" ? error.message : undefined;
  const traceId = typeof error.traceId === "string" ? error.traceId : undefined;
  if (code === undefined && message === undefined && traceId === undefined) return undefined;
  return {
    error: {
      ...(code === undefined ? {} : { code }),
      ...(message === undefined ? {} : { message }),
      ...(traceId === undefined ? {} : { traceId }),
    },
  };
}

function positiveReleaseHeader(value: string, name: string): number {
  const normalized = value.trim();
  if (!/^[1-9]\d*$/u.test(normalized)) {
    throw invalidPublicResponse(`The ${name} response header is malformed.`);
  }
  const number = Number(normalized);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw invalidPublicResponse(`The ${name} response header is malformed.`);
  }
  return number;
}

function publicReleaseHeaders(
  headers: Headers,
  projection: PublicProjection,
): PublicReleaseHeaders {
  const programHeader = headers.get("x-sessionboard-program-revision");
  const cacheHeader = headers.get("x-sessionboard-cache-revision");
  const hasProgramHeader = programHeader !== null;
  const hasCacheHeader = cacheHeader !== null;
  if (projection === "speakers" && (!hasProgramHeader || !hasCacheHeader)) {
    throw invalidPublicResponse(
      "The published speakers response is missing its release headers.",
    );
  }
  if (hasProgramHeader !== hasCacheHeader) {
    throw invalidPublicResponse("The published response has incomplete release headers.");
  }
  if (!hasProgramHeader || !hasCacheHeader) return {};
  return {
    servedProgramRevision: positiveReleaseHeader(
      programHeader,
      "x-sessionboard-program-revision",
    ),
    cacheRevision: positiveReleaseHeader(cacheHeader, "x-sessionboard-cache-revision"),
  };
}

function getPublishedProjection(
  baseUrl: string,
  eventSlug: string,
  projection: "agenda",
  fetcher: PublicFetcher,
  appEnvironment?: string,
  bypassCache?: boolean,
): Promise<LoadedPublicProjection<PublishedAgenda>>;
function getPublishedProjection(
  baseUrl: string,
  eventSlug: string,
  projection: "speakers",
  fetcher: PublicFetcher,
  appEnvironment?: string,
  bypassCache?: boolean,
): Promise<LoadedPublicProjection<PublishedSpeakerGallery>>;
async function getPublishedProjection(
  baseUrl: string,
  eventSlug: string,
  projection: PublicProjection,
  fetcher: PublicFetcher,
  appEnvironment?: string,
  bypassCache = false,
): Promise<LoadedPublicProjection<PublishedAgenda | PublishedSpeakerGallery>> {
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
    const body = parsePublicError(await response.json().catch(() => undefined));
    throw new PublicEmbedApiError(
      body?.error?.code ?? "PUBLIC_EMBED_UNAVAILABLE",
      body?.error?.message ?? "This published event view is not available.",
      response.status,
      body?.error?.traceId,
    );
  }
  const body = await response.json().catch(() => undefined);
  const data =
    projection === "agenda"
      ? publicAgenda(publicEnvelope(body, projection))
      : publicSpeakers(publicEnvelope(body, projection));
  return { data, release: publicReleaseHeaders(response.headers, projection) };
}

export function getPublishedAgenda(
  baseUrl: string,
  eventSlug: string,
  fetcher: PublicFetcher = fetch,
  appEnvironment?: string,
): Promise<PublishedAgenda> {
  return getPublishedProjection(baseUrl, eventSlug, "agenda", fetcher, appEnvironment).then(
    ({ data }) => data,
  );
}

export function getPublishedSpeakers(
  baseUrl: string,
  eventSlug: string,
  fetcher: PublicFetcher = fetch,
  appEnvironment?: string,
): Promise<PublishedSpeakerGallery> {
  return getPublishedProjection(baseUrl, eventSlug, "speakers", fetcher, appEnvironment).then(
    ({ data }) => data,
  );
}

export function publishedProjectionsMatch(
  agenda: PublishedAgenda,
  speakers: PublishedSpeakerGallery,
): boolean {
  return (
    agenda.event.slug.toLowerCase() === speakers.event.slug.toLowerCase() &&
    agenda.event.name === speakers.event.name &&
    agenda.event.timeZone === speakers.event.timeZone &&
    agenda.event.startsOn === speakers.event.startsOn &&
    agenda.event.endsOn === speakers.event.endsOn &&
    agenda.event.venueName === speakers.event.venueName
  );
}

export interface PublishedProgramRelease {
  readonly servedProgramRevision: number;
  readonly cacheRevision: number;
}

function validProgramRevision(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw invalidPublicResponse(`The ${field} release value is malformed.`);
  }
  return value;
}

export function publishedProgramFromProjections(
  agenda: PublishedAgenda,
  speakers: PublishedSpeakerGallery,
  release?: PublishedProgramRelease,
): PublishedProgram {
  if (!publishedProjectionsMatch(agenda, speakers)) {
    throw new PublicEmbedApiError(
      "PUBLICATION_REVISION_MISMATCH",
      "The published agenda and speaker views do not agree on event metadata.",
      409,
    );
  }
  const servedProgramRevision = validProgramRevision(
    release?.servedProgramRevision ?? agenda.revision.number,
    "servedProgramRevision",
  );
  const cacheRevision = validProgramRevision(
    release?.cacheRevision ?? servedProgramRevision,
    "cacheRevision",
  );
  return { agenda, speakers, servedProgramRevision, cacheRevision };
}

function mergedProgramRelease(
  agenda: PublicReleaseHeaders,
  speakers: PublicReleaseHeaders,
): PublishedProgramRelease {
  const servedProgramRevision = speakers.servedProgramRevision ?? agenda.servedProgramRevision;
  const cacheRevision = speakers.cacheRevision ?? agenda.cacheRevision;
  if (servedProgramRevision === undefined || cacheRevision === undefined) {
    throw invalidPublicResponse("The published program is missing its release headers.");
  }
  if (
    (agenda.servedProgramRevision !== undefined &&
      agenda.servedProgramRevision !== servedProgramRevision) ||
    (agenda.cacheRevision !== undefined && agenda.cacheRevision !== cacheRevision)
  ) {
    throw new PublicEmbedApiError(
      "PUBLICATION_REVISION_MISMATCH",
      "The published agenda and speaker views do not agree on the served release.",
      409,
    );
  }
  return { servedProgramRevision, cacheRevision };
}

export function getPublishedProgram(
  baseUrl: string,
  eventSlug: string,
  fetcher: PublicFetcher = fetch,
  appEnvironment?: string,
): Promise<PublishedProgram> {
  const loadPair = async (
    bypassCache: boolean,
  ): Promise<
    [
      LoadedPublicProjection<PublishedAgenda>,
      LoadedPublicProjection<PublishedSpeakerGallery>,
    ]
  > => {
    const [agenda, speakers] = await Promise.allSettled([
      getPublishedProjection(baseUrl, eventSlug, "agenda", fetcher, appEnvironment, bypassCache),
      getPublishedProjection(baseUrl, eventSlug, "speakers", fetcher, appEnvironment, bypassCache),
    ]);
    if (agenda.status === "fulfilled" && speakers.status === "fulfilled") {
      return [agenda.value, speakers.value];
    }
    throw new PublicEmbedProgramLoadError(
      agenda.status === "rejected" ? agenda.reason : undefined,
      speakers.status === "rejected" ? speakers.reason : undefined,
    );
  };
  return loadPair(true).then(([agenda, speakers]) => {
    const release = mergedProgramRelease(agenda.release, speakers.release);
    return publishedProgramFromProjections(agenda.data, speakers.data, release);
  });
}