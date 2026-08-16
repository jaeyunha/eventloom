/**
 * Canonical non-React models, transport helpers, and public embed output builders.
 *
 * Keep this module free of React exports so feature-model consumers can use it directly.
 */

export type EmbedWidgetId = "sessions" | "speakers" | "agenda" | "itinerary" | "gallery";
export type EmbedTheme = "auto" | "light" | "dark";
export type EmbedAccent = string;
export type EmbedLayout = "comfortable" | "compact" | "list" | "grid" | "timeline";
export type EmbedOutputFormat = "styled-html" | "basic-html" | "json" | "xml" | "ical";
export type EmbedFieldId =
  | "title"
  | "date-time"
  | "room"
  | "speakers"
  | "format"
  | "track"
  | "summary"
  | "company"
  | "bio";

export const EMBED_OUTPUT_FORMATS: readonly {
  readonly value: EmbedOutputFormat;
  readonly label: string;
  readonly description: string;
}[] = [
  {
    value: "styled-html",
    label: "Styled HTML",
    description: "Responsive iframe markup using the published public view.",
  },
  {
    value: "basic-html",
    label: "Basic HTML",
    description: "A plain link to the published public view.",
  },
  {
    value: "json",
    label: "JSON",
    description: "Configuration preview for the published public URL.",
  },
  {
    value: "xml",
    label: "XML",
    description: "Configuration preview for the published public URL.",
  },
  {
    value: "ical",
    label: "iCal",
    description: "Link to the published calendar source when available.",
  },
] as const;

export interface EmbedFieldDefinition {
  readonly id: EmbedFieldId;
  readonly label: string;
  readonly required: boolean;
}

export const EMBED_DISPLAY_FIELDS: readonly EmbedFieldDefinition[] = [
  { id: "title", label: "Title", required: true },
  { id: "date-time", label: "Date and time", required: true },
  { id: "room", label: "Room", required: false },
  { id: "speakers", label: "Speakers", required: false },
  { id: "format", label: "Format", required: false },
  { id: "track", label: "Track", required: false },
  { id: "summary", label: "Description", required: false },
  { id: "company", label: "Company", required: false },
  { id: "bio", label: "Biography", required: false },
] as const;

export const DEFAULT_EMBED_DISPLAY_FIELDS: readonly EmbedFieldId[] = [
  "title",
  "date-time",
  "room",
  "speakers",
  "format",
  "track",
  "summary",
  "company",
  "bio",
];

export interface EmbedWidgetDefinition {
  readonly id: EmbedWidgetId;
  readonly label: string;
  readonly description: string;
  /** The anonymous public route. */
  readonly publicView: "sessions" | "speakers-list" | "speakers" | "agenda" | "itinerary";
  /** The existing script route only supports the Agenda and Speaker Gallery views. */
  readonly scriptView: "agenda" | "speakers" | null;
  readonly layouts: readonly EmbedLayout[];
  readonly defaultLayout: EmbedLayout;
  readonly minHeight: string;
}

export const EMBED_WIDGETS: readonly EmbedWidgetDefinition[] = [
  {
    id: "sessions",
    label: "Sessions List",
    description: "A searchable list of published sessions and speakers.",
    publicView: "sessions",
    scriptView: null,
    layouts: ["comfortable", "compact"],
    defaultLayout: "comfortable",
    minHeight: "720px",
  },
  {
    id: "speakers",
    label: "Speakers List",
    description: "A directory pairing published speakers with their sessions.",
    publicView: "speakers-list",
    scriptView: null,
    layouts: ["list"],
    defaultLayout: "list",
    minHeight: "720px",
  },
  {
    id: "agenda",
    label: "Agenda",
    description: "The published agenda with day and track filters.",
    publicView: "agenda",
    scriptView: "agenda",
    layouts: ["timeline", "list"],
    defaultLayout: "timeline",
    minHeight: "720px",
  },
  {
    id: "itinerary",
    label: "Schedule Itinerary",
    description: "A schedule view visitors can personalize and download.",
    publicView: "itinerary",
    scriptView: null,
    layouts: ["timeline", "compact"],
    defaultLayout: "timeline",
    minHeight: "720px",
  },
  {
    id: "gallery",
    label: "Speaker Gallery",
    description: "A visual gallery of the published speaker roster.",
    publicView: "speakers",
    scriptView: "speakers",
    layouts: ["grid", "list"],
    defaultLayout: "grid",
    minHeight: "760px",
  },
] as const;

export const EMBED_THEMES: readonly { readonly value: EmbedTheme; readonly label: string }[] = [
  { value: "auto", label: "Match visitor preference" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

export const DEFAULT_EMBED_ACCENT = "#4f5ee8";

export interface EmbedConfiguration {
  readonly id: string;
  readonly name: string;
  readonly widgetId: EmbedWidgetId;
  readonly enabled: boolean;
  readonly theme: EmbedTheme;
  readonly outputFormat: EmbedOutputFormat;
  readonly layout: EmbedLayout;
  readonly accent: EmbedAccent;
  readonly backgroundColor: string;
  readonly textColor: string;
  readonly customCss: string;
  readonly displayFields: readonly EmbedFieldId[];
  readonly trackIds: readonly string[];
  readonly statuses: readonly string[];
  readonly revision: number | null;
}

export interface EmbedTrackOption {
  readonly id: string;
  readonly name: string;
}

export interface EmbedEventRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly slug: string;
  readonly name: string;
  readonly status: "draft" | "active" | "archived";
  readonly timeZone: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly venue: string | null;
  readonly cfpSettings: Readonly<{
    enabled: boolean;
    opensAt: string | null;
    closesAt: string | null;
  }>;
  readonly defaultCalendarSettings: Readonly<{
    durationMinutes: number;
    timeZone: string;
    location: string | null;
  }>;
  readonly embedConfigurations: readonly EmbedConfiguration[];
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdBy: string;
  readonly updatedBy: string;
}

export type EmbedEventUpdateInput = Readonly<{
  expectedVersion: number;
  embedConfigurations: readonly EmbedConfiguration[];
}>;

export interface EmbedReleaseRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly eventId: string;
  readonly revision: number;
  readonly lifecycle: "pending" | "served" | "failed";
  readonly agendaProjectionId: string;
  readonly agendaRevisionNumber: number;
  readonly agendaSourceHash: string;
  readonly speakerProjectionId: string;
  readonly speakerRevisionNumber: number;
  readonly speakerSourceHash: string;
  readonly approvedContentRevision: number;
  readonly approvedProfileRevision: number;
  readonly releasedAssetRevision: number;
  readonly actorId: string;
  readonly publishedAt: string;
  readonly parentServedRevision: number | null;
  readonly rollbackTargetRevision: number | null;
  readonly cacheRevision: number;
  readonly sourceTrigger:
    | "initial-publication"
    | "approved-content-change"
    | "confirmed-profile-change"
    | "released-asset-change"
    | "released-schedule-change";
  readonly failureReason: string | null;
}

export interface EmbedPublicationState {
  readonly organizationId: string;
  readonly eventId: string;
  readonly version: number;
  readonly servedRevision: number | null;
  readonly servedManifest: EmbedReleaseRecord | null;
  readonly pendingRevision: number | null;
  readonly pendingReleaseId: string | null;
  readonly releases: readonly EmbedReleaseRecord[];
}

export interface EmbedAgendaData {
  readonly tracks: readonly EmbedTrackOption[];
}

export type EmbedWorkspaceFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface EmbedWorkspaceApi {
  readonly getEvent: (eventId: string, signal?: AbortSignal) => Promise<EmbedEventRecord>;
  readonly updateEvent: (
    eventId: string,
    input: EmbedEventUpdateInput,
    signal?: AbortSignal,
  ) => Promise<EmbedEventRecord>;
  readonly getPublication: (
    eventId: string,
    signal?: AbortSignal,
  ) => Promise<EmbedPublicationState | null>;
  readonly getAgenda: (eventId: string, signal?: AbortSignal) => Promise<EmbedAgendaData>;
}

export const EMPTY_EMBED_CONFIGURATIONS: readonly EmbedConfiguration[] = [];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  return candidate ? candidate : null;
}

function responseError(message: string): TypeError {
  return new TypeError(`The embed organizer response is invalid: ${message}`);
}

function requiredResponseString(value: unknown, field: string): string {
  const result = nonEmptyString(value);
  if (!result) throw responseError(`${field} must be a non-empty string.`);
  return result;
}

function nullableResponseString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw responseError(`${field} must be a string or null.`);
  return value;
}

function positiveResponseInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw responseError(`${field} must be a positive integer.`);
  }
  return value;
}

function nullablePositiveResponseInteger(value: unknown, field: string): number | null {
  if (value === null) return null;
  return positiveResponseInteger(value, field);
}

function responseData(payload: unknown, field: string): Record<string, unknown> {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw responseError(`${field} must contain a data object.`);
  }
  return payload.data;
}

function parseEmbedConfiguration(value: unknown, field: string): EmbedConfiguration {
  if (!isRecord(value)) throw responseError(`${field} must be an object.`);
  const normalized = normalizeEmbedConfiguration(value);
  if (!normalized || normalized.revision === null) {
    throw responseError(`${field} is not a valid saved configuration.`);
  }
  return normalized;
}

function parseEmbedConfigurations(value: unknown, field: string): readonly EmbedConfiguration[] {
  if (!Array.isArray(value)) throw responseError(`${field} must be an array.`);
  const configurations = value.map((item, index) =>
    parseEmbedConfiguration(item, `${field}[${index}]`),
  );
  if (new Set(configurations.map((item) => item.id)).size !== configurations.length) {
    throw responseError(`${field} must not contain duplicate IDs.`);
  }
  return configurations;
}

export function parseEmbedEventRecord(
  value: unknown,
  expectedOrganizationId?: string,
  expectedEventId?: string,
): EmbedEventRecord {
  if (!isRecord(value)) throw responseError("event must be an object.");
  const id = requiredResponseString(value.id, "event.id");
  const organizationId = requiredResponseString(value.organizationId, "event.organizationId");
  if (expectedOrganizationId !== undefined && organizationId !== expectedOrganizationId) {
    throw new Error("The organizer event response does not match this organization.");
  }
  if (expectedEventId !== undefined && id !== expectedEventId) {
    throw new Error("The organizer event response does not match this event.");
  }
  const status = value.status;
  if (status !== "draft" && status !== "active" && status !== "archived") {
    throw responseError("event.status is invalid.");
  }
  if (!isRecord(value.cfpSettings) || typeof value.cfpSettings.enabled !== "boolean") {
    throw responseError("event.cfpSettings is invalid.");
  }
  if (!isRecord(value.defaultCalendarSettings)) {
    throw responseError("event.defaultCalendarSettings is invalid.");
  }
  const durationMinutes = positiveResponseInteger(
    value.defaultCalendarSettings.durationMinutes,
    "event.defaultCalendarSettings.durationMinutes",
  );
  const embedConfigurations = parseEmbedConfigurations(
    value.embedConfigurations,
    "event.embedConfigurations",
  );
  return {
    id,
    organizationId,
    slug: requiredResponseString(value.slug, "event.slug"),
    name: requiredResponseString(value.name, "event.name"),
    status,
    timeZone: requiredResponseString(value.timeZone, "event.timeZone"),
    startsAt: requiredResponseString(value.startsAt, "event.startsAt"),
    endsAt: requiredResponseString(value.endsAt, "event.endsAt"),
    venue: nullableResponseString(value.venue, "event.venue"),
    cfpSettings: {
      enabled: value.cfpSettings.enabled,
      opensAt: nullableResponseString(value.cfpSettings.opensAt, "event.cfpSettings.opensAt"),
      closesAt: nullableResponseString(value.cfpSettings.closesAt, "event.cfpSettings.closesAt"),
    },
    defaultCalendarSettings: {
      durationMinutes,
      timeZone: requiredResponseString(
        value.defaultCalendarSettings.timeZone,
        "event.defaultCalendarSettings.timeZone",
      ),
      location: nullableResponseString(
        value.defaultCalendarSettings.location,
        "event.defaultCalendarSettings.location",
      ),
    },
    embedConfigurations,
    version: positiveResponseInteger(value.version, "event.version"),
    createdAt: requiredResponseString(value.createdAt, "event.createdAt"),
    updatedAt: requiredResponseString(value.updatedAt, "event.updatedAt"),
    createdBy: requiredResponseString(value.createdBy, "event.createdBy"),
    updatedBy: requiredResponseString(value.updatedBy, "event.updatedBy"),
  };
}

function parseEmbedTrackOptions(value: unknown): readonly EmbedTrackOption[] {
  if (!Array.isArray(value)) throw responseError("agenda.tracks must be an array.");
  const tracks = value.map((item, index) => {
    if (!isRecord(item)) throw responseError(`agenda.tracks[${index}] must be an object.`);
    return {
      id: requiredResponseString(item.id, `agenda.tracks[${index}].id`),
      name: requiredResponseString(item.name, `agenda.tracks[${index}].name`),
    };
  });
  if (new Set(tracks.map((track) => track.id)).size !== tracks.length) {
    throw responseError("agenda.tracks must not contain duplicate IDs.");
  }
  return tracks;
}

export function parseEmbedEventResponse(
  payload: unknown,
  expectedOrganizationId?: string,
  expectedEventId?: string,
): EmbedEventRecord {
  return parseEmbedEventRecord(
    responseData(payload, "event response"),
    expectedOrganizationId,
    expectedEventId,
  );
}

export function parseEmbedAgendaResponse(payload: unknown): EmbedAgendaData {
  const data = responseData(payload, "agenda response");
  return { tracks: parseEmbedTrackOptions(data.tracks) };
}

function parseEmbedReleaseRecord(value: unknown, field: string): EmbedReleaseRecord {
  if (!isRecord(value)) throw responseError(`${field} must be an object.`);
  const id = requiredResponseString(value.id, `${field}.id`);
  const organizationId = requiredResponseString(value.organizationId, `${field}.organizationId`);
  const eventId = requiredResponseString(value.eventId, `${field}.eventId`);
  const lifecycle = value.lifecycle;
  if (lifecycle !== "pending" && lifecycle !== "served" && lifecycle !== "failed") {
    throw responseError(`${field}.lifecycle is invalid.`);
  }
  const sourceTrigger = value.sourceTrigger;
  if (
    sourceTrigger !== "initial-publication" &&
    sourceTrigger !== "approved-content-change" &&
    sourceTrigger !== "confirmed-profile-change" &&
    sourceTrigger !== "released-asset-change" &&
    sourceTrigger !== "released-schedule-change"
  ) {
    throw responseError(`${field}.sourceTrigger is invalid.`);
  }
  return {
    id,
    organizationId,
    eventId,
    revision: positiveResponseInteger(value.revision, `${field}.revision`),
    lifecycle,
    agendaProjectionId: requiredResponseString(
      value.agendaProjectionId,
      `${field}.agendaProjectionId`,
    ),
    agendaRevisionNumber: positiveResponseInteger(
      value.agendaRevisionNumber,
      `${field}.agendaRevisionNumber`,
    ),
    agendaSourceHash: requiredResponseString(value.agendaSourceHash, `${field}.agendaSourceHash`),
    speakerProjectionId: requiredResponseString(
      value.speakerProjectionId,
      `${field}.speakerProjectionId`,
    ),
    speakerRevisionNumber: positiveResponseInteger(
      value.speakerRevisionNumber,
      `${field}.speakerRevisionNumber`,
    ),
    speakerSourceHash: requiredResponseString(
      value.speakerSourceHash,
      `${field}.speakerSourceHash`,
    ),
    approvedContentRevision: positiveResponseInteger(
      value.approvedContentRevision,
      `${field}.approvedContentRevision`,
    ),
    approvedProfileRevision: positiveResponseInteger(
      value.approvedProfileRevision,
      `${field}.approvedProfileRevision`,
    ),
    releasedAssetRevision: positiveResponseInteger(
      value.releasedAssetRevision,
      `${field}.releasedAssetRevision`,
    ),
    actorId: requiredResponseString(value.actorId, `${field}.actorId`),
    publishedAt: requiredResponseString(value.publishedAt, `${field}.publishedAt`),
    parentServedRevision: nullablePositiveResponseInteger(
      value.parentServedRevision,
      `${field}.parentServedRevision`,
    ),
    rollbackTargetRevision: nullablePositiveResponseInteger(
      value.rollbackTargetRevision,
      `${field}.rollbackTargetRevision`,
    ),
    cacheRevision: positiveResponseInteger(value.cacheRevision, `${field}.cacheRevision`),
    sourceTrigger,
    failureReason: nullableResponseString(value.failureReason, `${field}.failureReason`),
  };
}

export function parseEmbedPublicationResponse(
  payload: unknown,
  expectedOrganizationId?: string,
  expectedEventId?: string,
): EmbedPublicationState | null {
  if (isRecord(payload) && payload.data === null) return null;
  if (isRecord(payload) && Array.isArray(payload.data)) {
    throw responseError("publication response must contain a data object.");
  }
  const data = responseData(payload, "publication response");
  if (Object.keys(data).length === 0) return null;
  const organizationId = requiredResponseString(data.organizationId, "publication.organizationId");
  const eventId = requiredResponseString(data.eventId, "publication.eventId");
  if (expectedOrganizationId !== undefined && organizationId !== expectedOrganizationId) {
    throw new Error("The publication response does not match this organization.");
  }
  if (expectedEventId !== undefined && eventId !== expectedEventId) {
    throw new Error("The publication response does not match this event.");
  }
  const servedManifest =
    data.servedManifest === null
      ? null
      : parseEmbedReleaseRecord(data.servedManifest, "publication.servedManifest");
  if (!Array.isArray(data.releases)) throw responseError("publication.releases must be an array.");
  const releases = data.releases.map((item, index) =>
    parseEmbedReleaseRecord(item, `publication.releases[${index}]`),
  );
  for (const release of releases) {
    if (release.organizationId !== organizationId || release.eventId !== eventId) {
      throw new Error("The publication release response does not match this event context.");
    }
  }
  if (
    servedManifest !== null &&
    (servedManifest.organizationId !== organizationId || servedManifest.eventId !== eventId)
  ) {
    throw new Error("The served publication response does not match this event context.");
  }
  const servedRevision = nullablePositiveResponseInteger(
    data.servedRevision,
    "publication.servedRevision",
  );
  if (servedManifest !== null && servedRevision !== servedManifest.revision) {
    throw responseError("publication.servedRevision does not match servedManifest.revision.");
  }
  return {
    organizationId,
    eventId,
    version: positiveResponseInteger(data.version, "publication.version"),
    servedRevision,
    servedManifest,
    pendingRevision: nullablePositiveResponseInteger(
      data.pendingRevision,
      "publication.pendingRevision",
    ),
    pendingReleaseId: nullableResponseString(data.pendingReleaseId, "publication.pendingReleaseId"),
    releases,
  };
}

class EmbedWorkspaceApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "EmbedWorkspaceApiError";
    this.code = code;
    this.status = status;
  }
}

async function embedApiError(response: Response): Promise<EmbedWorkspaceApiError> {
  const body = (await response.json().catch(() => undefined)) as unknown;
  const error = isRecord(body) && isRecord(body.error) ? body.error : undefined;
  const code = error && typeof error.code === "string" ? error.code : "EMBED_REQUEST_FAILED";
  const message =
    error && typeof error.message === "string"
      ? error.message
      : `The embed organizer request failed (HTTP ${response.status}).`;
  return new EmbedWorkspaceApiError(code, message, response.status);
}

function embedPathSegment(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`An ${field} is required for embed requests.`);
  return encodeURIComponent(normalized);
}

function embedConfigurationBody(configuration: EmbedConfiguration): Record<string, unknown> {
  return {
    id: configuration.id,
    name: configuration.name,
    widgetId: configuration.widgetId,
    enabled: configuration.enabled,
    theme: configuration.theme,
    outputFormat: configuration.outputFormat,
    layout: configuration.layout,
    accent: configuration.accent,
    backgroundColor: configuration.backgroundColor,
    textColor: configuration.textColor,
    customCss: configuration.customCss,
    displayFields: configuration.displayFields,
    trackIds: configuration.trackIds,
    statuses: configuration.statuses,
    ...(configuration.revision === null ? {} : { revision: configuration.revision }),
  };
}

export function createEmbedWorkspaceApi(
  organizationId: string,
  fetcher: EmbedWorkspaceFetcher = globalThis.fetch,
): EmbedWorkspaceApi {
  const organizationPath = embedPathSegment(organizationId, "organization ID");
  const collectionPath = `/api/admin/organizations/${organizationPath}/events`;

  async function request<T>(
    path: string,
    parser: (payload: unknown) => T,
    init: RequestInit = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body !== undefined) headers.set("content-type", "application/json");
    const response = await fetcher(`${collectionPath}${path}`, {
      ...init,
      credentials: "include",
      headers,
    });
    if (!response.ok) throw await embedApiError(response);
    const payload: unknown = await response.json().catch(() => undefined);
    return parser(payload);
  }

  return {
    getEvent(eventId, signal) {
      return request(
        `/${embedPathSegment(eventId, "event ID")}`,
        (payload) => parseEmbedEventResponse(payload, organizationId, eventId),
        signal === undefined ? { cache: "no-store" } : { cache: "no-store", signal },
      );
    },
    updateEvent(eventId, input, signal) {
      return request(
        `/${embedPathSegment(eventId, "event ID")}`,
        (payload) => parseEmbedEventResponse(payload, organizationId, eventId),
        {
          method: "PATCH",
          body: JSON.stringify({
            expectedVersion: input.expectedVersion,
            embedConfigurations: input.embedConfigurations.map(embedConfigurationBody),
          }),
          ...(signal === undefined ? {} : { signal }),
        },
      );
    },
    getPublication(eventId, signal) {
      return request(
        `/${embedPathSegment(eventId, "event ID")}/publication`,
        (payload) => parseEmbedPublicationResponse(payload, organizationId, eventId),
        signal === undefined ? { cache: "no-store" } : { cache: "no-store", signal },
      );
    },
    getAgenda(eventId, signal) {
      return request(
        `/${embedPathSegment(eventId, "event ID")}/agenda`,
        parseEmbedAgendaResponse,
        signal === undefined ? { cache: "no-store" } : { cache: "no-store", signal },
      );
    },
  };
}

function isEmbedWidgetId(value: unknown): value is EmbedWidgetId {
  return typeof value === "string" && EMBED_WIDGETS.some((widget) => widget.id === value);
}

function isEmbedTheme(value: unknown): value is EmbedTheme {
  return value === "auto" || value === "light" || value === "dark";
}

function isEmbedOutputFormat(value: unknown): value is EmbedOutputFormat {
  return EMBED_OUTPUT_FORMATS.some((format) => format.value === value);
}

function isEmbedLayout(value: unknown): value is EmbedLayout {
  return (
    value === "comfortable" ||
    value === "compact" ||
    value === "list" ||
    value === "grid" ||
    value === "timeline"
  );
}

function isEmbedFieldId(value: unknown): value is EmbedFieldId {
  return EMBED_DISPLAY_FIELDS.some((field) => field.id === value);
}

function normalizeStringList(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return null;
  const unique: string[] = [];
  for (const item of value) {
    const normalized = item.trim();
    if (normalized && !unique.includes(normalized)) unique.push(normalized);
  }
  return unique;
}

function normalizeDisplayFields(value: unknown): readonly EmbedFieldId[] | null {
  if (!Array.isArray(value) || !value.every(isEmbedFieldId)) return null;
  const unique = [...new Set(value)];
  const required = EMBED_DISPLAY_FIELDS.filter((field) => field.required).map((field) => field.id);
  return [...required, ...unique.filter((field) => !required.includes(field))];
}

function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/u.test(candidate) ? candidate : null;
}

function normalizeEmbedConfiguration(value: unknown): EmbedConfiguration | null {
  if (!isRecord(value)) return null;
  const id = nonEmptyString(value.id);
  const name = nonEmptyString(value.name);
  const accent = normalizeHexColor(value.accent);
  const backgroundColor = normalizeHexColor(value.backgroundColor);
  const textColor = normalizeHexColor(value.textColor);
  const trackIds = normalizeStringList(value.trackIds);
  const statuses = normalizeStringList(value.statuses);
  const displayFields = normalizeDisplayFields(value.displayFields);
  const revision =
    value.revision === undefined || value.revision === null
      ? null
      : typeof value.revision === "number" &&
          Number.isSafeInteger(value.revision) &&
          value.revision > 0
        ? value.revision
        : null;

  if (
    !id ||
    !name ||
    !isEmbedWidgetId(value.widgetId) ||
    typeof value.enabled !== "boolean" ||
    !isEmbedTheme(value.theme) ||
    !isEmbedOutputFormat(value.outputFormat) ||
    !isEmbedLayout(value.layout) ||
    !accent ||
    !backgroundColor ||
    !textColor ||
    typeof value.customCss !== "string" ||
    !trackIds ||
    !statuses ||
    !displayFields ||
    (value.revision !== undefined && value.revision !== null && revision === null)
  ) {
    return null;
  }

  return {
    id,
    name,
    widgetId: value.widgetId,
    enabled: value.enabled,
    theme: value.theme,
    outputFormat: value.outputFormat,
    layout: value.layout,
    accent,
    backgroundColor,
    textColor,
    customCss: value.customCss,
    displayFields,
    trackIds,
    statuses,
    revision,
  };
}

export function eventEmbedConfigurations(
  configurations: readonly EmbedConfiguration[] | undefined,
): readonly EmbedConfiguration[] {
  if (!configurations?.length) return EMPTY_EMBED_CONFIGURATIONS;
  const normalized = configurations
    .map((configuration) => normalizeEmbedConfiguration(configuration))
    .filter((configuration): configuration is EmbedConfiguration => configuration !== null);
  return normalized.length > 0 ? normalized : EMPTY_EMBED_CONFIGURATIONS;
}

export function createEmbedConfigurationId(): string {
  const browserCrypto = typeof globalThis.crypto !== "undefined" ? globalThis.crypto : undefined;
  if (browserCrypto?.randomUUID) return browserCrypto.randomUUID();
  return `embed-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function builderConfiguration(
  id: string,
  name: string,
  values: Readonly<{
    widgetId: EmbedWidgetId;
    enabled: boolean;
    theme: EmbedTheme;
    outputFormat: EmbedOutputFormat;
    layout: EmbedLayout;
    accent: EmbedAccent;
    backgroundColor: string;
    textColor: string;
    customCss: string;
    displayFields: readonly EmbedFieldId[];
    trackIds: readonly string[];
    statuses: readonly string[];
    revision: number | null;
  }>,
): EmbedConfiguration {
  return {
    id,
    name,
    widgetId: values.widgetId,
    enabled: values.enabled,
    theme: values.theme,
    outputFormat: values.outputFormat,
    layout: values.layout,
    accent: values.accent,
    backgroundColor: values.backgroundColor,
    textColor: values.textColor,
    customCss: values.customCss,
    displayFields: values.displayFields,
    trackIds: values.trackIds,
    statuses: values.statuses,
    revision: values.revision,
  };
}

export type EmbedSnippetSettings = Readonly<{
  widget: EmbedWidgetDefinition;
  eventSlug: string;
  publicOrigin: string;
  theme: EmbedTheme;
  outputFormat?: EmbedOutputFormat;
  displayFields?: readonly EmbedFieldId[];
  accent?: EmbedAccent;
  backgroundColor?: string;
  textColor?: string;
  customCss?: string;
  trackIds?: readonly string[];
  statuses?: readonly string[];
  layout?: EmbedLayout;
  configurationId?: string;
  configurationRevision?: number;
  programRevision?: number;
}>;

export function widgetFor(id: EmbedWidgetId): EmbedWidgetDefinition {
  const widget = EMBED_WIDGETS.find((candidate) => candidate.id === id);
  if (widget) return widget;
  const first = EMBED_WIDGETS[0];
  if (!first) throw new Error("At least one public embed widget is required.");
  return first;
}

function normalizeOrigin(value: string): string {
  const candidate = value.trim().replace(/\/+$/u, "");
  if (!candidate) return "";
  try {
    const origin = new URL(candidate);
    if (
      (origin.protocol !== "https:" && origin.protocol !== "http:") ||
      origin.username ||
      origin.password ||
      origin.search ||
      origin.hash ||
      (origin.pathname !== "/" && origin.pathname !== "")
    ) {
      return "";
    }
    return origin.origin;
  } catch {
    return "";
  }
}

export function configuredPublicOrigin(explicit?: string): string {
  return normalizeOrigin(explicit ?? process.env.NEXT_PUBLIC_APP_URL ?? "");
}

function queryForSettings(settings: EmbedSnippetSettings): string {
  const query = new URLSearchParams();
  query.set("theme", settings.theme);
  query.set("outputFormat", settings.outputFormat ?? "styled-html");
  query.set("layout", settings.layout ?? settings.widget.defaultLayout);
  query.set("displayFields", (settings.displayFields ?? DEFAULT_EMBED_DISPLAY_FIELDS).join(","));

  const accent = normalizeHexColor(settings.accent ?? DEFAULT_EMBED_ACCENT);
  const backgroundColor = normalizeHexColor(settings.backgroundColor ?? "#ffffff");
  const textColor = normalizeHexColor(settings.textColor ?? "#20232b");
  if (accent) query.set("accent", accent);
  if (backgroundColor) query.set("backgroundColor", backgroundColor);
  if (textColor) query.set("textColor", textColor);

  const trackIds = normalizeStringList(settings.trackIds ?? []);
  const statuses = normalizeStringList(settings.statuses ?? []);
  if (settings.configurationId?.trim())
    query.set("configurationId", settings.configurationId.trim());
  if (settings.configurationRevision !== undefined) {
    query.set("configurationRevision", String(settings.configurationRevision));
  }
  if (settings.programRevision !== undefined) {
    query.set("programRevision", String(settings.programRevision));
  }
  if (trackIds?.length) query.set("trackIds", trackIds.join(","));
  if (statuses?.length) query.set("statuses", statuses.join(","));

  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

export function publicEmbedUrl(settings: EmbedSnippetSettings): string {
  const origin = configuredPublicOrigin(settings.publicOrigin);
  const slug = encodeURIComponent(settings.eventSlug.trim());
  if (!origin || !slug) return "";
  return `${origin}/embed/${slug}/${settings.widget.publicView}${queryForSettings(settings)}`;
}

export function publicAgendaCalendarUrl(settings: EmbedSnippetSettings): string {
  const origin = configuredPublicOrigin(settings.publicOrigin);
  const slug = encodeURIComponent(settings.eventSlug.trim());
  if (!origin || !slug) return "";
  return `${origin}/api/public/events/${slug}/agenda.ics${queryForSettings(settings)}`;
}

export function publicAgendaJsonUrl(settings: EmbedSnippetSettings): string {
  const origin = configuredPublicOrigin(settings.publicOrigin);
  const slug = encodeURIComponent(settings.eventSlug.trim());
  if (!origin || !slug) return "";
  return `${origin}/api/public/events/${slug}/agenda.json${queryForSettings(settings)}`;
}

export function iframeSandbox(widget: EmbedWidgetDefinition): string {
  if (widget.id === "itinerary") {
    return "allow-downloads allow-same-origin allow-scripts";
  }
  return widget.id === "agenda"
    ? "allow-downloads allow-same-origin allow-scripts"
    : "allow-same-origin allow-scripts";
}

export function iframeSnippet(settings: EmbedSnippetSettings): string {
  const src = publicEmbedUrl(settings);
  if (!src) return "";
  const widget = settings.widget;
  return [
    "<iframe",
    `  src="${src}"`,
    `  title="Eventloom ${widget.label}"`,
    '  loading="lazy"',
    '  referrerpolicy="no-referrer"',
    `  sandbox="${iframeSandbox(widget)}"`,
    `  style="width:100%;min-height:${widget.minHeight};border:0;display:block"`,
    "></iframe>",
  ].join("\n");
}

export function scriptSnippet(settings: EmbedSnippetSettings): string {
  if (!settings.widget.scriptView) return "";
  const origin = configuredPublicOrigin(settings.publicOrigin);
  const slug = encodeURIComponent(settings.eventSlug.trim());
  if (!origin || !slug) return "";
  return [
    `<script src="${origin}/embed/${slug}/script${queryForSettings(settings)}"`,
    `  data-view="${settings.widget.scriptView}"`,
    `  data-theme="${settings.theme}"`,
    "  defer>",
    "</script>",
  ].join("\n");
}

export function outputFormatLabel(value: EmbedOutputFormat): string {
  return EMBED_OUTPUT_FORMATS.find((option) => option.value === value)?.label ?? "Styled HTML";
}

export function embedCodePreview(settings: EmbedSnippetSettings): string {
  const source = publicEmbedUrl(settings);
  if (!source) return "";
  const format = settings.outputFormat ?? "styled-html";
  const fields = settings.displayFields ?? DEFAULT_EMBED_DISPLAY_FIELDS;
  const metadata = [
    `<!-- ${outputFormatLabel(format)} preview for ${settings.widget.label}. -->`,
    "<!-- Selected safe options are encoded in the live URL. Custom CSS is not sent to the public URL. -->",
    `<!-- Display fields: ${fields.join(", ")} -->`,
    `<!-- Tracks: ${settings.trackIds?.join(", ") || "all"}; statuses: ${settings.statuses?.join(", ") || "all"} -->`,
    `<!-- Accent: ${settings.accent ?? DEFAULT_EMBED_ACCENT}; custom CSS: ${settings.customCss?.trim() ? "provided for host markup" : "none"} -->`,
    `<!-- Surface: ${settings.backgroundColor ?? "#ffffff"}; text: ${settings.textColor ?? "#20232b"} -->`,
  ].join("\n");

  switch (format) {
    case "styled-html":
      return [
        metadata,
        settings.widget.scriptView ? scriptSnippet(settings) : iframeSnippet(settings),
      ]
        .filter(Boolean)
        .join("\n");
    case "basic-html":
      return [metadata, `<a href="${source}">Open ${settings.widget.label}</a>`].join("\n");
    case "json":
      return JSON.stringify(
        {
          source,
          theme: settings.theme,
          format,
          widget: settings.widget.id,
          layout: settings.layout ?? settings.widget.defaultLayout,
          displayFields: fields,
          trackIds: settings.trackIds ?? [],
          accent: settings.accent ?? DEFAULT_EMBED_ACCENT,
          backgroundColor: settings.backgroundColor ?? "#ffffff",
          textColor: settings.textColor ?? "#20232b",
          statuses: settings.statuses ?? [],
        },
        null,
        2,
      );
    case "xml":
      return [
        `<!-- ${outputFormatLabel(format)} configuration preview. -->`,
        `<embed widget="${settings.widget.id}" source="${source}" format="${format}">`,
        `  <display-fields>${fields.join(", ")}</display-fields>`,
        "</embed>",
      ].join("\n");
    case "ical": {
      const calendarSource = publicAgendaCalendarUrl(settings);
      return [
        `# ${outputFormatLabel(format)} source preview`,
        "# Published calendar feed for the current agenda revision.",
        calendarSource,
      ].join("\n");
    }
  }
}

export function normalizeEmbedSlug(value: string | null | undefined): string | null {
  const candidate = value?.trim() || "";
  return candidate ? candidate : null;
}
export type EmbedExpectedPublishedRevision = Readonly<{
  readonly id: string;
  readonly number: number;
}>;

export interface EmbedPublishedRevision extends EmbedExpectedPublishedRevision {
  readonly publishedAt: string;
}

type EmbedPublicationProjection = Readonly<{
  readonly event: Readonly<{ readonly slug: string }>;
  readonly revision: EmbedPublishedRevision;
}> &
  Record<string, unknown>;

export type EmbedPublicationFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface VerifyEmbedPublicationOptions {
  readonly eventSlug: string;
  readonly expectedPublishedRevision?: EmbedExpectedPublishedRevision | null;
  readonly fetcher?: EmbedPublicationFetcher;
}

export interface VerifiedEmbedPublication {
  readonly agenda: EmbedPublicationProjection;
  readonly speakers: EmbedPublicationProjection;
  readonly revision: EmbedPublishedRevision;
}

function projectionVerificationError(projection: "agenda" | "speakers", message: string): Error {
  return new Error(`The published ${projection} projection could not be verified: ${message}`);
}

async function parseEmbedProjection(
  response: Response,
  projection: "agenda" | "speakers",
): Promise<EmbedPublicationProjection> {
  if (!response.ok) {
    throw projectionVerificationError(projection, `the server returned HTTP ${response.status}.`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw projectionVerificationError(projection, "the response was not valid JSON.");
  }

  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw projectionVerificationError(projection, "the response did not contain a data envelope.");
  }

  const data = payload.data;
  if (!isRecord(data.event) || !isRecord(data.revision)) {
    throw projectionVerificationError(
      projection,
      "the response omitted event or revision identity.",
    );
  }

  const eventSlug = nonEmptyString(data.event.slug);
  const revisionId = nonEmptyString(data.revision.id);
  const revisionNumber = data.revision.number;
  const publishedAt = nonEmptyString(data.revision.publishedAt);

  if (!eventSlug || !revisionId || !publishedAt) {
    throw projectionVerificationError(
      projection,
      "the event slug or revision identity is invalid.",
    );
  }
  if (typeof revisionNumber !== "number" || !Number.isInteger(revisionNumber)) {
    throw projectionVerificationError(projection, "the published revision number is invalid.");
  }

  return {
    ...data,
    event: { ...data.event, slug: eventSlug },
    revision: {
      ...data.revision,
      id: revisionId,
      number: revisionNumber,
      publishedAt,
    },
  };
}

export async function verifyEmbedPublication({
  eventSlug,
  expectedPublishedRevision = null,
  fetcher = fetch,
}: VerifyEmbedPublicationOptions): Promise<VerifiedEmbedPublication> {
  const expectedSlug = eventSlug.trim();
  if (!expectedSlug) {
    throw new Error("A public event slug is required before the preview can be refreshed.");
  }

  const encodedSlug = encodeURIComponent(expectedSlug);
  const requestInit: RequestInit = {
    cache: "no-store",
    credentials: "same-origin",
  };

  let agendaResponse: Response;
  let speakersResponse: Response;
  try {
    [agendaResponse, speakersResponse] = await Promise.all([
      fetcher(`/api/public/events/${encodedSlug}/agenda.json`, requestInit),
      fetcher(`/api/public/events/${encodedSlug}/speakers`, requestInit),
    ]);
  } catch (error) {
    const detail = error instanceof Error && error.message ? ` ${error.message}` : "";
    throw new Error(`The published agenda and speaker projections could not be reached.${detail}`);
  }

  const [agenda, speakers] = await Promise.all([
    parseEmbedProjection(agendaResponse, "agenda"),
    parseEmbedProjection(speakersResponse, "speakers"),
  ]);

  if (agenda.event.slug !== expectedSlug || speakers.event.slug !== expectedSlug) {
    throw new Error("The published projection event slug does not match this embed event.");
  }
  if (agenda.event.slug !== speakers.event.slug) {
    throw new Error("The published agenda and speaker event slugs do not match.");
  }

  if (
    agenda.revision.id !== speakers.revision.id ||
    agenda.revision.number !== speakers.revision.number ||
    agenda.revision.publishedAt !== speakers.revision.publishedAt
  ) {
    throw new Error("The published agenda and speaker projections are from different revisions.");
  }

  if (
    expectedPublishedRevision !== null &&
    (agenda.revision.id !== expectedPublishedRevision.id ||
      agenda.revision.number !== expectedPublishedRevision.number)
  ) {
    throw new Error("The published projections do not match the expected published revision.");
  }

  return { agenda, speakers, revision: agenda.revision };
}

export function workspaceScopeKey(organizationId: string, eventId: string): string {
  return `${organizationId}\u0000${eventId}`;
}

export interface EmbedPublicRevision {
  readonly id: string;
  readonly number: number;
  readonly publishedAt: string;
}

export type EmbedPreviewAvailability = "checking" | "available" | "unavailable" | "failed";

export interface EmbedPublicationMetadata {
  readonly state: EmbedPublicationState | null;
  readonly status: "loading" | "none" | "unavailable" | "pending" | "failed" | "served";
  readonly servedRevision: number | null;
  readonly pendingRevision: number | null;
  readonly failedReason: string | null;
  readonly agendaDraftVersion: number | null;
  readonly publicRevision: EmbedPublicRevision | null;
  readonly previewAvailability: EmbedPreviewAvailability;
  readonly message?: string;
}

export type EmbedLoadState =
  | { readonly status: "loading"; readonly scopeKey: string }
  | {
      readonly status: "loaded";
      readonly scopeKey: string;
      readonly event: EmbedEventRecord;
      readonly eventSlug: string;
      readonly eventName: string;
    }
  | { readonly status: "error"; readonly scopeKey: string; readonly message: string };

export function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "The organizer event could not be loaded.";
}

export function revisionFromProjection(value: unknown): EmbedPublicRevision | null {
  if (!isRecord(value)) return null;
  const id = nonEmptyString(value.id);
  const publishedAt = nonEmptyString(value.publishedAt);
  const revisionNumber = value.number;
  if (
    !id ||
    !publishedAt ||
    typeof revisionNumber !== "number" ||
    !Number.isFinite(revisionNumber)
  ) {
    return null;
  }
  return { id, number: revisionNumber, publishedAt };
}

export function publicationMetadataFromState(
  state: EmbedPublicationState | null,
  status: "loading" | "none" | "unavailable" | "pending" | "failed" | "served",
  message?: string,
): EmbedPublicationMetadata {
  const servedRevision = state?.servedRevision ?? null;
  const pendingRevision = state?.pendingRevision ?? null;
  const failedRelease = [...(state?.releases ?? [])]
    .filter((release) => release.lifecycle === "failed")
    .sort((left, right) => right.revision - left.revision)[0];
  const effectiveStatus =
    status !== "loading" && status !== "unavailable" && state !== null
      ? failedRelease !== undefined && failedRelease.revision > (servedRevision ?? 0)
        ? "failed"
        : pendingRevision !== null
          ? "pending"
          : servedRevision !== null
            ? "served"
            : "none"
      : status;
  return {
    state,
    status: effectiveStatus,
    servedRevision,
    pendingRevision,
    failedReason: failedRelease?.failureReason ?? null,
    agendaDraftVersion: null,
    publicRevision:
      state?.servedManifest === null || state?.servedManifest === undefined
        ? null
        : {
            id: state.servedManifest.id,
            number: state.servedManifest.revision,
            publishedAt: state.servedManifest.publishedAt,
          },
    previewAvailability:
      effectiveStatus === "served" || effectiveStatus === "pending" || effectiveStatus === "failed"
        ? "available"
        : effectiveStatus === "loading"
          ? "checking"
          : effectiveStatus === "unavailable"
            ? "failed"
            : "unavailable",
    ...(message === undefined ? {} : { message }),
  };
}

export async function loadEmbedPublication(
  api: Pick<EmbedWorkspaceApi, "getPublication">,
  eventId: string,
  signal: AbortSignal,
): Promise<EmbedPublicationMetadata> {
  try {
    const publication = await api.getPublication(eventId, signal);
    return publicationMetadataFromState(
      publication,
      publication === null ? "none" : "served",
      publication === null ? "No publication has been created for this event." : undefined,
    );
  } catch (error) {
    if (signal.aborted) throw new DOMException("The request was aborted.", "AbortError");
    return publicationMetadataFromState(
      null,
      "unavailable",
      error instanceof Error ? error.message : "The publication API is unavailable.",
    );
  }
}
