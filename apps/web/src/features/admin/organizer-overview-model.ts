import {
  analyzeLocalDateTime,
  disambiguationForInstant,
  resolveLocalDateTime,
  type TimeDisambiguation,
} from "@eventloom/contracts";

export interface OrganizerOverviewCoreMetrics {
  readonly eventCount: number;
}

export interface OrganizerOverviewActivityMetrics {
  readonly submissionCount: number;
  readonly pendingReviewCount: number;
  readonly outstandingSpeakerTaskCount: number;
  readonly publishedSessionCount: number;
}

export interface OrganizerOverviewEvent {
  readonly id: string;
  readonly name: string;
  readonly slug: string | null;
  readonly status: string | null;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
}

export type OrganizerOverviewActionType = "reviews" | "speaker_tasks" | "agenda";

export interface OrganizerOverviewActionItem {
  readonly id: string;
  readonly type: OrganizerOverviewActionType;
  readonly eventId: string;
  readonly title: string;
  readonly description: string;
  readonly count: number;
  readonly priority: number;
  readonly dueAt: string | null;
  readonly href: string;
}

export interface OrganizerOverviewCoreData {
  readonly organizationId: string;
  readonly metrics: OrganizerOverviewCoreMetrics;
  readonly events: readonly OrganizerOverviewEvent[];
}

export interface OrganizerOverviewActivityData {
  readonly organizationId: string;
  readonly metrics: OrganizerOverviewActivityMetrics;
  readonly actionItems: readonly OrganizerOverviewActionItem[];
}

export interface OrganizerOverviewApi {
  getCore(): Promise<OrganizerOverviewCoreData>;
  getActivity(): Promise<OrganizerOverviewActivityData>;
}

export interface OrganizerOverviewConfig {
  readonly apiBaseUrl: string;
  readonly organizationId: string;
}

export type OrganizerOverviewConfigResult = OrganizerOverviewConfig | { readonly error: string };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`The organizer overview response is missing ${field}.`);
  }
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`The organizer overview response contains an invalid ${field}.`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`The organizer overview response contains an invalid ${field}.`);
  }
  return value;
}

function integer(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`The organizer overview response contains an invalid ${field}.`);
  }
  return value;
}

function responseData(payload: unknown): UnknownRecord {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw new Error("The organizer overview response was not valid.");
  }
  return payload.data;
}

function responseOrganizationId(data: UnknownRecord, expectedOrganizationId?: string): string {
  const organizationId = requiredString(data.organizationId, "organizationId");
  if (expectedOrganizationId !== undefined && organizationId !== expectedOrganizationId) {
    throw new Error("The organizer overview returned data for another organization.");
  }
  return organizationId;
}

function parseOrganizerOverviewEvent(event: unknown, index: number): OrganizerOverviewEvent {
  if (!isRecord(event)) {
    throw new Error(`The organizer overview response contains an invalid event at index ${index}.`);
  }
  return {
    id: requiredString(event.id, `events[${index}].id`),
    name: requiredString(event.name, `events[${index}].name`),
    slug: nullableString(event.slug, `events[${index}].slug`),
    status: nullableString(event.status, `events[${index}].status`),
    startsAt: nullableString(event.startsAt, `events[${index}].startsAt`),
    endsAt: nullableString(event.endsAt, `events[${index}].endsAt`),
  };
}

function parseOrganizerOverviewActionItem(
  item: unknown,
  index: number,
): OrganizerOverviewActionItem {
  if (!isRecord(item)) {
    throw new Error(
      `The organizer overview response contains an invalid action item at index ${index}.`,
    );
  }
  const type = requiredString(item.type, `actionItems[${index}].type`);
  if (type !== "reviews" && type !== "speaker_tasks" && type !== "agenda") {
    throw new Error(`The organizer overview response contains an invalid action item type.`);
  }
  return {
    id: requiredString(item.id, `actionItems[${index}].id`),
    type,
    eventId: requiredString(item.eventId, `actionItems[${index}].eventId`),
    title: requiredString(item.title, `actionItems[${index}].title`),
    description: requiredString(item.description, `actionItems[${index}].description`),
    count: nonNegativeInteger(item.count, `actionItems[${index}].count`),
    priority: integer(item.priority, `actionItems[${index}].priority`),
    dueAt: nullableString(item.dueAt, `actionItems[${index}].dueAt`),
    href: requiredString(item.href, `actionItems[${index}].href`),
  };
}

/** Parse and validate the organization-scoped core response envelope. */
export function parseOrganizerOverviewCoreResponse(
  payload: unknown,
  expectedOrganizationId?: string,
): OrganizerOverviewCoreData {
  const data = responseData(payload);
  if (!isRecord(data.metrics) || !Array.isArray(data.events)) {
    throw new Error("The organizer overview core response was not valid.");
  }
  return {
    organizationId: responseOrganizationId(data, expectedOrganizationId),
    metrics: {
      eventCount: nonNegativeInteger(data.metrics.eventCount, "metrics.eventCount"),
    },
    events: data.events.map(parseOrganizerOverviewEvent),
  };
}

/** Parse and validate the organization-scoped activity response envelope. */
export function parseOrganizerOverviewActivityResponse(
  payload: unknown,
  expectedOrganizationId?: string,
): OrganizerOverviewActivityData {
  const data = responseData(payload);
  if (!isRecord(data.metrics) || !Array.isArray(data.actionItems)) {
    throw new Error("The organizer overview activity response was not valid.");
  }
  return {
    organizationId: responseOrganizationId(data, expectedOrganizationId),
    metrics: {
      submissionCount: nonNegativeInteger(data.metrics.submissionCount, "metrics.submissionCount"),
      pendingReviewCount: nonNegativeInteger(
        data.metrics.pendingReviewCount,
        "metrics.pendingReviewCount",
      ),
      outstandingSpeakerTaskCount: nonNegativeInteger(
        data.metrics.outstandingSpeakerTaskCount,
        "metrics.outstandingSpeakerTaskCount",
      ),
      publishedSessionCount: nonNegativeInteger(
        data.metrics.publishedSessionCount,
        "metrics.publishedSessionCount",
      ),
    },
    actionItems: data.actionItems.map(parseOrganizerOverviewActionItem),
  };
}

export function resolveOrganizerOverviewConfig(
  authenticatedOrganizationId?: string,
): OrganizerOverviewConfigResult {
  const apiBaseUrl = "";
  const organizationId = authenticatedOrganizationId?.trim() ?? "";

  if (!organizationId) {
    return {
      error:
        "Organizer overview is unavailable because the authenticated organizer membership has no organization.",
    };
  }

  return { apiBaseUrl, organizationId };
}

async function responseErrorMessage(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string") {
      return payload.error.message;
    }
  } catch {
    // Use the status fallback below when the response is not JSON.
  }
  return `The organizer overview request failed (HTTP ${response.status}).`;
}

export function createOrganizerOverviewApi(
  apiBaseUrl: string,
  organizationId: string,
  fetcher: typeof fetch = globalThis.fetch,
): OrganizerOverviewApi {
  const endpoint = `${apiBaseUrl.replace(/\/+$/u, "")}/api/admin/organizations/${encodeURIComponent(organizationId)}/overview`;
  let coreInFlight: Promise<OrganizerOverviewCoreData> | null = null;
  let activityInFlight: Promise<OrganizerOverviewActivityData> | null = null;

  const request = async <T>(
    path: string,
    parser: (payload: unknown, expectedOrganizationId: string) => T,
  ): Promise<T> => {
    const response = await fetcher(`${endpoint}${path}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(await responseErrorMessage(response));
    }
    return parser(await response.json(), organizationId);
  };

  return {
    getCore() {
      if (coreInFlight !== null) {
        return coreInFlight;
      }
      coreInFlight = request("/core", parseOrganizerOverviewCoreResponse).finally(() => {
        coreInFlight = null;
      });
      return coreInFlight;
    },
    getActivity() {
      if (activityInFlight !== null) {
        return activityInFlight;
      }
      activityInFlight = request("/activity", parseOrganizerOverviewActivityResponse).finally(
        () => {
          activityInFlight = null;
        },
      );
      return activityInFlight;
    },
  };
}

export type OrganizerOverviewStatusClass = "statusLive" | "statusDraft" | "statusArchived";

export function eventStatusClass(status: string | null): OrganizerOverviewStatusClass {
  switch (status?.toLowerCase()) {
    case "live":
    case "published":
    case "active":
      return "statusLive";
    case "draft":
      return "statusDraft";
    case "archived":
      return "statusArchived";
    default:
      return "statusArchived";
  }
}

const organizerEventStatuses = ["draft", "active", "archived"] as const;

export type OrganizerEventStatus = (typeof organizerEventStatuses)[number];

export interface OrganizerEventCfpSettings {
  readonly enabled: boolean;
  readonly opensAt: string | null;
  readonly closesAt: string | null;
}

export interface OrganizerEventDefaultCalendarSettings {
  readonly durationMinutes: number;
  readonly timeZone: string;
  readonly location: string | null;
}

export type OrganizerEventEmbedWidgetId =
  | "sessions"
  | "speakers"
  | "agenda"
  | "itinerary"
  | "gallery";
export type OrganizerEventEmbedTheme = "auto" | "light" | "dark";
export type OrganizerEventEmbedOutputFormat =
  | "styled-html"
  | "basic-html"
  | "json"
  | "xml"
  | "ical";
export type OrganizerEventEmbedLayout = "comfortable" | "compact" | "list" | "grid" | "timeline";

export interface OrganizerEventEmbedConfiguration {
  readonly id: string;
  readonly name: string;
  readonly widgetId: OrganizerEventEmbedWidgetId;
  readonly enabled: boolean;
  readonly theme: OrganizerEventEmbedTheme;
  readonly outputFormat: OrganizerEventEmbedOutputFormat;
  readonly layout: OrganizerEventEmbedLayout;
  readonly accent: string;
  readonly backgroundColor: string;
  readonly textColor: string;
  readonly customCss: string;
  readonly displayFields: readonly string[];
  readonly trackIds: readonly string[];
  readonly statuses: readonly string[];
}

export type EventEmbedConfiguration = OrganizerEventEmbedConfiguration;

export interface OrganizerEventRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly slug: string;
  readonly name: string;
  readonly status: OrganizerEventStatus;
  readonly timeZone: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly scheduleDates?: readonly string[];
  readonly venue: string | null;
  readonly cfpSettings: OrganizerEventCfpSettings;
  readonly defaultCalendarSettings: OrganizerEventDefaultCalendarSettings;
  readonly embedConfigurations?: readonly OrganizerEventEmbedConfiguration[];
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdBy: string;
  readonly updatedBy: string;
}

export type EventRecord = OrganizerEventRecord;

export interface OrganizerEventCreateInput {
  readonly name: string;
  readonly timeZone: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly scheduleDates?: readonly string[];
  readonly venue?: string | null;
  readonly cfpSettings: OrganizerEventCfpSettings;
  readonly defaultCalendarSettings: OrganizerEventDefaultCalendarSettings;
  readonly slug?: string;
  readonly status?: OrganizerEventStatus;
}

export interface OrganizerEventUpdateInput {
  readonly expectedVersion: number;
  readonly name?: string;
  readonly slug?: string;
  readonly status?: OrganizerEventStatus;
  readonly timeZone?: string;
  readonly startsAt?: string;
  readonly endsAt?: string;
  readonly scheduleDates?: readonly string[];
  readonly venue?: string | null;
  readonly cfpSettings?: OrganizerEventCfpSettings;
  readonly defaultCalendarSettings?: OrganizerEventDefaultCalendarSettings;
  readonly embedConfigurations?: readonly OrganizerEventEmbedConfiguration[];
}

export interface OrganizerEventsApi {
  listEvents(signal?: AbortSignal): Promise<readonly OrganizerEventRecord[]>;
  getEvent(eventId: string, signal?: AbortSignal): Promise<OrganizerEventRecord>;
  createEvent(input: OrganizerEventCreateInput): Promise<OrganizerEventRecord>;
  updateEvent(eventId: string, input: OrganizerEventUpdateInput): Promise<OrganizerEventRecord>;
  archiveEvent(eventId: string, expectedVersion: number): Promise<OrganizerEventRecord>;
}

type OrganizerEventsFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface OrganizerEventsErrorBody {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly traceId?: string;
    readonly details?: readonly {
      readonly path?: readonly (string | number)[];
      readonly message?: string;
    }[];
  };
}

export class OrganizerEventsApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly traceId: string | undefined;
  readonly details:
    | readonly {
        readonly path?: readonly (string | number)[];
        readonly message?: string;
      }[]
    | undefined;

  constructor(
    code: string,
    message: string,
    status: number,
    traceId?: string,
    details?: readonly {
      readonly path?: readonly (string | number)[];
      readonly message?: string;
    }[],
  ) {
    super(message);
    this.name = "OrganizerEventsApiError";
    this.code = code;
    this.status = status;
    this.traceId = traceId;
    this.details = details;
  }
}

function eventRecordError(message: string): TypeError {
  return new TypeError(`The organizer event response is invalid: ${message}`);
}

function eventRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw eventRecordError(`${field} is required.`);
  }
  return value;
}

function eventNullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw eventRecordError(`${field} must be a string or null.`);
  }
  return value;
}

function eventRequiredInteger(value: unknown, field: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw eventRecordError(`${field} must be an integer of at least ${minimum}.`);
  }
  return value;
}

function eventStatus(value: unknown, field: string): OrganizerEventStatus {
  if (
    typeof value !== "string" ||
    !organizerEventStatuses.includes(value as OrganizerEventStatus)
  ) {
    throw eventRecordError(`${field} must be draft, active, or archived.`);
  }
  return value as OrganizerEventStatus;
}

function eventScheduleDates(value: unknown, field: string): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw eventRecordError(`${field} must be an array of calendar dates.`);
  }
  const dates = value.map((date, index) => {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
      throw eventRecordError(`${field}[${index}] must use YYYY-MM-DD.`);
    }
    return date;
  });
  if (new Set(dates).size !== dates.length) {
    throw eventRecordError(`${field} must not contain duplicate dates.`);
  }
  if (dates.some((date, index) => index > 0 && date <= (dates[index - 1] ?? ""))) {
    throw eventRecordError(`${field} must be ordered from earliest to latest.`);
  }
  return dates.length === 0 ? undefined : dates;
}

function parseOrganizerEventEmbedConfiguration(
  value: unknown,
  field: string,
): OrganizerEventEmbedConfiguration {
  if (!isRecord(value)) {
    throw eventRecordError(`${field} must be an object.`);
  }
  const id = eventRequiredString(value.id, `${field}.id`);
  const name = eventRequiredString(value.name, `${field}.name`);
  const widgetId = eventRequiredString(value.widgetId, `${field}.widgetId`);
  const theme = eventRequiredString(value.theme, `${field}.theme`);
  const outputFormat = eventRequiredString(value.outputFormat, `${field}.outputFormat`);
  const layout = eventRequiredString(value.layout, `${field}.layout`);
  const accent = eventRequiredString(value.accent, `${field}.accent`);
  const backgroundColor = eventRequiredString(value.backgroundColor, `${field}.backgroundColor`);
  const textColor = eventRequiredString(value.textColor, `${field}.textColor`);
  const customCss = typeof value.customCss === "string" ? value.customCss : null;

  if (
    !["sessions", "speakers", "agenda", "itinerary", "gallery"].includes(widgetId) ||
    !["auto", "light", "dark"].includes(theme) ||
    !["styled-html", "basic-html", "json", "xml", "ical"].includes(outputFormat) ||
    !["comfortable", "compact", "list", "grid", "timeline"].includes(layout) ||
    !/^#[0-9a-f]{6}$/iu.test(accent) ||
    !/^#[0-9a-f]{6}$/iu.test(backgroundColor) ||
    !/^#[0-9a-f]{6}$/iu.test(textColor) ||
    customCss === null ||
    typeof value.enabled !== "boolean"
  ) {
    throw eventRecordError(`${field} contains an unsupported embed configuration value.`);
  }

  const stringList = (listValue: unknown, listField: string): readonly string[] => {
    if (!Array.isArray(listValue) || !listValue.every((item) => typeof item === "string")) {
      throw eventRecordError(`${listField} must be an array of strings.`);
    }
    return listValue
      .map((item) => item.trim())
      .filter((item, index, list) => {
        return item.length > 0 && list.indexOf(item) === index;
      });
  };

  return {
    id,
    name,
    widgetId: widgetId as OrganizerEventEmbedWidgetId,
    enabled: value.enabled,
    theme: theme as OrganizerEventEmbedTheme,
    outputFormat: outputFormat as OrganizerEventEmbedOutputFormat,
    layout: layout as OrganizerEventEmbedLayout,
    accent: accent.toLowerCase(),
    backgroundColor: backgroundColor.toLowerCase(),
    textColor: textColor.toLowerCase(),
    customCss,
    displayFields: stringList(value.displayFields, `${field}.displayFields`),
    trackIds: stringList(value.trackIds, `${field}.trackIds`),
    statuses: stringList(value.statuses, `${field}.statuses`),
  };
}

function parseOrganizerEventEmbedConfigurations(
  value: unknown,
  field: string,
): readonly OrganizerEventEmbedConfiguration[] {
  if (!Array.isArray(value)) {
    throw eventRecordError(`${field} must be an array.`);
  }
  const configurations = value.map((configuration, index) =>
    parseOrganizerEventEmbedConfiguration(configuration, `${field}[${index}]`),
  );
  if (
    new Set(configurations.map((configuration) => configuration.id)).size !== configurations.length
  ) {
    throw eventRecordError(`${field} must not contain duplicate configuration IDs.`);
  }
  return configurations;
}

function parseOrganizerEventCfpSettings(value: unknown, field: string): OrganizerEventCfpSettings {
  if (!isRecord(value)) {
    throw eventRecordError(`${field} must be an object.`);
  }
  if (typeof value.enabled !== "boolean") {
    throw eventRecordError(`${field}.enabled must be a boolean.`);
  }
  return {
    enabled: value.enabled,
    opensAt: eventNullableString(value.opensAt, `${field}.opensAt`),
    closesAt: eventNullableString(value.closesAt, `${field}.closesAt`),
  };
}

function parseOrganizerEventCalendarSettings(
  value: unknown,
  field: string,
): OrganizerEventDefaultCalendarSettings {
  if (!isRecord(value)) {
    throw eventRecordError(`${field} must be an object.`);
  }
  if ("timezone" in value) {
    throw eventRecordError(`${field}.timeZone is required; timezone is not supported.`);
  }
  return {
    durationMinutes: eventRequiredInteger(value.durationMinutes, `${field}.durationMinutes`, 1),
    timeZone: eventRequiredString(value.timeZone, `${field}.timeZone`),
    location: eventNullableString(value.location, `${field}.location`),
  };
}

export function parseOrganizerEventRecord(payload: unknown): OrganizerEventRecord {
  if (!isRecord(payload)) {
    throw eventRecordError("the event must be an object.");
  }
  const scheduleDates = eventScheduleDates(payload.scheduleDates, "scheduleDates");
  return {
    id: eventRequiredString(payload.id, "id"),
    organizationId: eventRequiredString(payload.organizationId, "organizationId"),
    slug: eventRequiredString(payload.slug, "slug"),
    name: eventRequiredString(payload.name, "name"),
    status: eventStatus(payload.status, "status"),
    timeZone: eventRequiredString(payload.timeZone, "timeZone"),
    startsAt: eventRequiredString(payload.startsAt, "startsAt"),
    endsAt: eventRequiredString(payload.endsAt, "endsAt"),
    ...(scheduleDates === undefined ? {} : { scheduleDates }),
    venue: eventNullableString(payload.venue, "venue"),
    cfpSettings: parseOrganizerEventCfpSettings(payload.cfpSettings, "cfpSettings"),
    defaultCalendarSettings: parseOrganizerEventCalendarSettings(
      payload.defaultCalendarSettings,
      "defaultCalendarSettings",
    ),
    version: eventRequiredInteger(payload.version, "version", 1),
    createdAt: eventRequiredString(payload.createdAt, "createdAt"),
    updatedAt: eventRequiredString(payload.updatedAt, "updatedAt"),
    createdBy: eventRequiredString(payload.createdBy, "createdBy"),
    updatedBy: eventRequiredString(payload.updatedBy, "updatedBy"),
    ...("embedConfigurations" in payload
      ? {
          embedConfigurations: parseOrganizerEventEmbedConfigurations(
            payload.embedConfigurations,
            "embedConfigurations",
          ),
        }
      : {}),
  };
}

export function parseOrganizerEventsResponse(payload: unknown): readonly OrganizerEventRecord[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw eventRecordError("data must be an array.");
  }
  return payload.data.map((event, index) => {
    try {
      return parseOrganizerEventRecord(event);
    } catch (error) {
      if (error instanceof TypeError) {
        throw new TypeError(`${error.message} (events[${index}])`);
      }
      throw error;
    }
  });
}

export function parseOrganizerEventResponse(payload: unknown): OrganizerEventRecord {
  if (!isRecord(payload) || !("data" in payload)) {
    throw eventRecordError("data must contain one event.");
  }
  return parseOrganizerEventRecord(payload.data);
}

async function organizerEventsApiError(response: Response): Promise<OrganizerEventsApiError> {
  const body = (await response.json().catch(() => undefined)) as
    | OrganizerEventsErrorBody
    | undefined;
  return new OrganizerEventsApiError(
    body?.error?.code ?? "EVENT_REQUEST_FAILED",
    body?.error?.message ?? `The event request failed (HTTP ${response.status}).`,
    response.status,
    body?.error?.traceId,
    body?.error?.details,
  );
}

function eventPathSegment(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TypeError(`An ${field} is required for organizer event requests.`);
  }
  return encodeURIComponent(normalized);
}

function eventCreateBody(input: OrganizerEventCreateInput): Record<string, unknown> {
  return {
    name: input.name,
    timeZone: input.timeZone,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    ...(input.scheduleDates === undefined || input.scheduleDates.length === 0
      ? {}
      : { scheduleDates: input.scheduleDates }),
    venue: input.venue ?? null,
    cfpSettings: {
      enabled: input.cfpSettings.enabled,
      opensAt: input.cfpSettings.opensAt,
      closesAt: input.cfpSettings.closesAt,
    },
    defaultCalendarSettings: {
      durationMinutes: input.defaultCalendarSettings.durationMinutes,
      timeZone: input.defaultCalendarSettings.timeZone,
      location: input.defaultCalendarSettings.location,
    },
    ...(input.slug === undefined ? {} : { slug: input.slug }),
    ...(input.status === undefined ? {} : { status: input.status }),
  };
}

function eventUpdateBody(input: OrganizerEventUpdateInput): Record<string, unknown> {
  return {
    expectedVersion: input.expectedVersion,
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.slug === undefined ? {} : { slug: input.slug }),
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.timeZone === undefined ? {} : { timeZone: input.timeZone }),
    ...(input.startsAt === undefined ? {} : { startsAt: input.startsAt }),
    ...(input.endsAt === undefined ? {} : { endsAt: input.endsAt }),
    ...(input.scheduleDates === undefined ? {} : { scheduleDates: input.scheduleDates }),
    ...(input.venue === undefined ? {} : { venue: input.venue }),
    ...(input.cfpSettings === undefined
      ? {}
      : {
          cfpSettings: {
            enabled: input.cfpSettings.enabled,
            opensAt: input.cfpSettings.opensAt,
            closesAt: input.cfpSettings.closesAt,
          },
        }),
    ...(input.defaultCalendarSettings === undefined
      ? {}
      : {
          defaultCalendarSettings: {
            durationMinutes: input.defaultCalendarSettings.durationMinutes,
            timeZone: input.defaultCalendarSettings.timeZone,
            location: input.defaultCalendarSettings.location,
          },
        }),
    ...(input.embedConfigurations === undefined
      ? {}
      : { embedConfigurations: input.embedConfigurations }),
  };
}

export function createOrganizerEventsApi(
  apiBaseUrl: string,
  organizationId: string,
  fetcher: OrganizerEventsFetcher = globalThis.fetch,
): OrganizerEventsApi {
  const normalizedBaseUrl = apiBaseUrl.trim().replace(/\/+$/u, "");
  const normalizedOrganizationId = organizationId.trim();
  if (normalizedOrganizationId.length === 0) {
    throw new TypeError("An organization ID is required for organizer event requests.");
  }
  const collectionEndpoint = `${normalizedBaseUrl}/api/admin/organizations/${eventPathSegment(normalizedOrganizationId, "organization ID")}/events`;

  async function request<T>(
    path: string,
    parser: (payload: unknown) => T,
    init: RequestInit = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body !== undefined) headers.set("content-type", "application/json");
    const response = await fetcher(`${collectionEndpoint}${path}`, {
      ...init,
      credentials: "include",
      headers: Object.fromEntries(headers.entries()),
    });
    if (!response.ok) {
      throw await organizerEventsApiError(response);
    }
    const payload: unknown = await response.json().catch(() => undefined);
    return parser(payload);
  }

  return {
    listEvents(signal) {
      return request(
        "",
        parseOrganizerEventsResponse,
        signal === undefined ? { cache: "no-store" } : { cache: "no-store", signal },
      );
    },
    getEvent(eventId, signal) {
      return request(
        `/${eventPathSegment(eventId, "event ID")}`,
        parseOrganizerEventResponse,
        signal === undefined ? { cache: "no-store" } : { cache: "no-store", signal },
      );
    },
    createEvent(input) {
      return request("", parseOrganizerEventResponse, {
        method: "POST",
        body: JSON.stringify(eventCreateBody(input)),
      });
    },
    updateEvent(eventId, input) {
      return request(`/${eventPathSegment(eventId, "event ID")}`, parseOrganizerEventResponse, {
        method: "PATCH",
        body: JSON.stringify(eventUpdateBody(input)),
      });
    },
    archiveEvent(eventId, expectedVersion) {
      return request(
        `/${eventPathSegment(eventId, "event ID")}/archive`,
        parseOrganizerEventResponse,
        { method: "POST", body: JSON.stringify({ expectedVersion }) },
      );
    },
  };
}

export type OrganizerEventDateMode = "range" | "individual";

export interface OrganizerEventFormValues {
  readonly name: string;
  readonly slug: string;
  readonly status: OrganizerEventStatus;
  readonly timeZone: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly startDisambiguation?: TimeDisambiguation | undefined;
  readonly endDisambiguation?: TimeDisambiguation | undefined;
  readonly dateMode: OrganizerEventDateMode;
  readonly scheduleDates: readonly string[];
  readonly venue: string;
  readonly cfpEnabled: boolean;
  readonly cfpOpensAt: string;
  readonly cfpClosesAt: string;
  readonly cfpOpenDisambiguation?: TimeDisambiguation | undefined;
  readonly cfpCloseDisambiguation?: TimeDisambiguation | undefined;
  readonly defaultCalendarDurationMinutes: string;
  readonly defaultCalendarTimeZone: string;
  readonly defaultCalendarLocation: string;
}

export interface OrganizerEventTemporalBaseline {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly cfpOpensAt: string | null;
  readonly cfpClosesAt: string | null;
}

function browserEventTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone?.trim() || "UTC";
  } catch {
    return "UTC";
  }
}

function validEventTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function normalizeOrganizerEventSlug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return normalized;
}

function localDateTimeToIso(
  value: string,
  timeZone: string,
  disambiguation?: TimeDisambiguation,
): string | null {
  try {
    return resolveLocalDateTime(value.trim(), timeZone, disambiguation).instant;
  } catch {
    return null;
  }
}

function localDateTimeIssue(
  value: string,
  timeZone: string,
  disambiguation?: TimeDisambiguation,
): string | null {
  const analysis = analyzeLocalDateTime(value.trim(), timeZone);
  if (analysis.state === "nonexistent") return "does not exist in the event time zone.";
  if (analysis.state === "ambiguous" && disambiguation === undefined) {
    return "occurs twice in the event time zone; choose the first or second occurrence.";
  }
  if (analysis.state === "invalid") return "is not a valid local date and time.";
  return null;
}

function isoToLocalDateTime(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf()) || !validEventTimeZone(timeZone)) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  if (!parts.year || !parts.month || !parts.day || !parts.hour || !parts.minute) return "";
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function organizerEventEditorFormValues(
  event?: OrganizerEventRecord,
): OrganizerEventFormValues {
  const timeZone = event?.timeZone ?? browserEventTimeZone();
  return {
    name: event?.name ?? "",
    slug: event?.slug ?? "",
    status: event?.status ?? "draft",
    timeZone,
    startsAt: event ? isoToLocalDateTime(event.startsAt, timeZone) : "",
    endsAt: event ? isoToLocalDateTime(event.endsAt, timeZone) : "",
    startDisambiguation: event
      ? disambiguationForInstant(
          isoToLocalDateTime(event.startsAt, timeZone),
          timeZone,
          event.startsAt,
        )
      : undefined,
    endDisambiguation: event
      ? disambiguationForInstant(isoToLocalDateTime(event.endsAt, timeZone), timeZone, event.endsAt)
      : undefined,
    dateMode: event?.scheduleDates?.length ? "individual" : "range",
    scheduleDates: event?.scheduleDates ?? [],
    venue: event?.venue ?? "",
    cfpEnabled: event?.cfpSettings.enabled ?? false,
    cfpOpensAt: event?.cfpSettings.opensAt
      ? isoToLocalDateTime(event.cfpSettings.opensAt, timeZone)
      : "",
    cfpClosesAt: event?.cfpSettings.closesAt
      ? isoToLocalDateTime(event.cfpSettings.closesAt, timeZone)
      : "",
    cfpOpenDisambiguation: event?.cfpSettings.opensAt
      ? disambiguationForInstant(
          isoToLocalDateTime(event.cfpSettings.opensAt, timeZone),
          timeZone,
          event.cfpSettings.opensAt,
        )
      : undefined,
    cfpCloseDisambiguation: event?.cfpSettings.closesAt
      ? disambiguationForInstant(
          isoToLocalDateTime(event.cfpSettings.closesAt, timeZone),
          timeZone,
          event.cfpSettings.closesAt,
        )
      : undefined,
    defaultCalendarDurationMinutes: String(event?.defaultCalendarSettings.durationMinutes ?? 30),
    defaultCalendarTimeZone: event?.defaultCalendarSettings.timeZone ?? timeZone,
    defaultCalendarLocation: event?.defaultCalendarSettings.location ?? "",
  };
}

export function organizerEventMinimumDateTimeLocal(
  timeZone: string,
  now: Date = new Date(),
): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const values = new Map(parts.map((part) => [part.type, part.value]));
    const year = values.get("year");
    const month = values.get("month");
    const day = values.get("day");
    if (year !== undefined && month !== undefined && day !== undefined) {
      return `${year}-${month}-${day}T00:00`;
    }
  } catch {
    // Fall through to a stable UTC date boundary for an unsupported time zone.
  }
  return `${now.toISOString().slice(0, 10)}T00:00`;
}

export function validateOrganizerEventForm(
  values: OrganizerEventFormValues,
  options: Readonly<{
    now?: Date;
    allowPastDates?: boolean;
    currentEvent?: OrganizerEventTemporalBaseline;
  }> = {},
): {
  readonly input?: OrganizerEventCreateInput;
  readonly error?: string;
} {
  const name = values.name.trim();
  if (!name) return { error: "Event name is required." };
  const timeZone = values.timeZone.trim();
  if (!validEventTimeZone(timeZone)) return { error: "Enter a valid IANA time zone." };
  const temporalInputs = [
    {
      label: "Event start",
      value: values.startsAt,
      disambiguation: values.startDisambiguation,
    },
    {
      label: "Event end",
      value: values.endsAt,
      disambiguation: values.endDisambiguation,
    },
    ...(values.cfpEnabled && values.cfpOpensAt.trim() !== ""
      ? [
          {
            label: "CFP opening",
            value: values.cfpOpensAt,
            disambiguation: values.cfpOpenDisambiguation,
          },
        ]
      : []),
    ...(values.cfpEnabled && values.cfpClosesAt.trim() !== ""
      ? [
          {
            label: "CFP closing",
            value: values.cfpClosesAt,
            disambiguation: values.cfpCloseDisambiguation,
          },
        ]
      : []),
  ] as const;
  for (const temporalInput of temporalInputs) {
    const issue = localDateTimeIssue(temporalInput.value, timeZone, temporalInput.disambiguation);
    if (issue !== null) return { error: `${temporalInput.label} ${issue}` };
  }
  const scheduleDates =
    values.dateMode === "individual"
      ? [...new Set(values.scheduleDates)].sort((left, right) => left.localeCompare(right))
      : [];
  if (values.dateMode === "individual" && scheduleDates.length === 0) {
    return { error: "Select at least one event day." };
  }
  if (
    scheduleDates.some((date) => !/^\d{4}-\d{2}-\d{2}$/u.test(date)) ||
    scheduleDates.length !== values.scheduleDates.length
  ) {
    return { error: "Selected event days must be valid and unique." };
  }
  const startsAt = localDateTimeToIso(values.startsAt, timeZone, values.startDisambiguation);
  if (!startsAt) return { error: "Enter a valid event start date and time." };
  const minimumStartsAt = localDateTimeToIso(
    organizerEventMinimumDateTimeLocal(timeZone, options.now ?? new Date()),
    timeZone,
  );
  if (
    options.allowPastDates !== true &&
    minimumStartsAt !== null &&
    Date.parse(startsAt) < Date.parse(minimumStartsAt) &&
    startsAt !== options.currentEvent?.startsAt
  ) {
    return { error: "Event start cannot be before today." };
  }
  const endsAt = localDateTimeToIso(values.endsAt, timeZone, values.endDisambiguation);
  if (!endsAt) return { error: "Enter a valid event end date and time." };
  if (
    options.allowPastDates !== true &&
    minimumStartsAt !== null &&
    Date.parse(endsAt) < Date.parse(minimumStartsAt) &&
    endsAt !== options.currentEvent?.endsAt
  ) {
    return { error: "Event end cannot be before today." };
  }
  if (Date.parse(startsAt) >= Date.parse(endsAt)) {
    return { error: "Event end must be after event start." };
  }
  if (
    scheduleDates.length > 0 &&
    (scheduleDates[0] !== values.startsAt.slice(0, 10) ||
      scheduleDates.at(-1) !== values.endsAt.slice(0, 10))
  ) {
    return { error: "Selected event days must include the first and last event date." };
  }

  const slug = values.slug.trim().toLowerCase();
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) {
    return {
      error: "Slug must use lowercase letters, numbers, and single hyphens.",
    };
  }

  const defaultCalendarTimeZone = timeZone;
  const durationMinutes = Number(values.defaultCalendarDurationMinutes);
  if (!Number.isSafeInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1_440) {
    return {
      error: "Default calendar duration must be between 1 and 1440 minutes.",
    };
  }

  const cfpOpensAt = values.cfpOpensAt.trim()
    ? localDateTimeToIso(values.cfpOpensAt, timeZone, values.cfpOpenDisambiguation)
    : null;
  if (values.cfpOpensAt.trim() && !cfpOpensAt) {
    return { error: "Enter a valid CFP opening date and time." };
  }
  if (
    options.allowPastDates !== true &&
    minimumStartsAt !== null &&
    cfpOpensAt !== null &&
    Date.parse(cfpOpensAt) < Date.parse(minimumStartsAt) &&
    cfpOpensAt !== options.currentEvent?.cfpOpensAt
  ) {
    return { error: "CFP opening cannot be before today." };
  }
  const cfpClosesAt = values.cfpClosesAt.trim()
    ? localDateTimeToIso(values.cfpClosesAt, timeZone, values.cfpCloseDisambiguation)
    : null;
  if (values.cfpClosesAt.trim() && !cfpClosesAt) {
    return { error: "Enter a valid CFP closing date and time." };
  }
  if (
    options.allowPastDates !== true &&
    minimumStartsAt !== null &&
    cfpClosesAt !== null &&
    Date.parse(cfpClosesAt) < Date.parse(minimumStartsAt) &&
    cfpClosesAt !== options.currentEvent?.cfpClosesAt
  ) {
    return { error: "CFP closing cannot be before today." };
  }
  if (
    cfpOpensAt !== null &&
    cfpClosesAt !== null &&
    Date.parse(cfpOpensAt) >= Date.parse(cfpClosesAt)
  ) {
    return { error: "CFP closing must be after CFP opening." };
  }
  if (
    (cfpOpensAt !== null && Date.parse(cfpOpensAt) > Date.parse(startsAt)) ||
    (cfpClosesAt !== null && Date.parse(cfpClosesAt) > Date.parse(startsAt))
  ) {
    return { error: "The CFP window must finish before the event begins." };
  }

  const input: OrganizerEventCreateInput = {
    name,
    timeZone,
    startsAt,
    endsAt,
    scheduleDates,
    venue: values.venue.trim() || null,
    cfpSettings: {
      enabled: values.cfpEnabled,
      opensAt: cfpOpensAt,
      closesAt: cfpClosesAt,
    },
    defaultCalendarSettings: {
      durationMinutes,
      timeZone: defaultCalendarTimeZone,
      location: values.defaultCalendarLocation.trim() || values.venue.trim() || null,
    },
    ...(slug ? { slug } : {}),
    status: values.status,
  };
  return { input };
}

export interface OrganizerCalendarDateCell {
  readonly date: Date;
  readonly dateKey: string;
  readonly isCurrentMonth: boolean;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calendarDateStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function parseCalendarInstant(value: string | null | undefined): Date | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const normalized = value.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(normalized);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]) - 1;
    const day = Number(dateOnly[3]);
    const parsed = new Date(year, month, day);
    return parsed.getFullYear() === year && parsed.getMonth() === month && parsed.getDate() === day
      ? parsed
      : null;
  }
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

export function getCalendarMonthCells(month: Date): readonly OrganizerCalendarDateCell[] {
  const safeMonth = Number.isNaN(month.valueOf()) ? new Date() : month;
  const monthStart = new Date(safeMonth.getFullYear(), safeMonth.getMonth(), 1);
  const firstCell = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth(),
    1 - monthStart.getDay(),
  );
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(
      firstCell.getFullYear(),
      firstCell.getMonth(),
      firstCell.getDate() + index,
    );
    return {
      date,
      dateKey: localDateKey(date),
      isCurrentMonth:
        date.getFullYear() === monthStart.getFullYear() &&
        date.getMonth() === monthStart.getMonth(),
    };
  });
}

export function organizerEventIntersectsCalendarDate(
  event: Pick<OrganizerEventRecord, "startsAt" | "endsAt" | "scheduleDates">,
  date: Date | string,
): boolean {
  const cellDate = typeof date === "string" ? parseCalendarInstant(date) : date;
  if (cellDate === null || Number.isNaN(cellDate.valueOf())) return false;
  if (event.scheduleDates !== undefined && event.scheduleDates.length > 0) {
    return event.scheduleDates.includes(localDateKey(cellDate));
  }
  const startsAt = parseCalendarInstant(event.startsAt);
  const endsAt = parseCalendarInstant(event.endsAt);
  if (startsAt === null || endsAt === null || startsAt > endsAt) return false;
  const dayStart = calendarDateStart(cellDate);
  const dayEnd = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1);
  return startsAt < dayEnd && endsAt >= dayStart;
}

export function initialCalendarMonth(
  events: readonly Pick<OrganizerEventRecord, "status" | "startsAt">[],
): Date {
  let earliest: Date | null = null;
  for (const event of events) {
    if (event.status === "archived") continue;
    const startsAt = parseCalendarInstant(event.startsAt);
    if (startsAt !== null && (earliest === null || startsAt < earliest)) {
      earliest = startsAt;
    }
  }
  const source = earliest ?? new Date();
  return new Date(source.getFullYear(), source.getMonth(), 1);
}
