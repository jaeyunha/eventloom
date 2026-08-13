"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import styles from "@/features/admin/admin-shell.module.css";
import workspaceStyles from "./embed-workspace.module.css";

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

const EMPTY_EMBED_CONFIGURATIONS: readonly EmbedConfiguration[] = [];
const EMPTY_TRACK_OPTIONS: readonly EmbedTrackOption[] = [];

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

function eventEmbedConfigurations(
  configurations: readonly EmbedConfiguration[] | undefined,
): readonly EmbedConfiguration[] {
  if (!configurations?.length) return EMPTY_EMBED_CONFIGURATIONS;
  const normalized = configurations
    .map((configuration) => normalizeEmbedConfiguration(configuration))
    .filter((configuration): configuration is EmbedConfiguration => configuration !== null);
  return normalized.length > 0 ? normalized : EMPTY_EMBED_CONFIGURATIONS;
}

function createEmbedConfigurationId(): string {
  const browserCrypto = typeof globalThis.crypto !== "undefined" ? globalThis.crypto : undefined;
  if (browserCrypto?.randomUUID) return browserCrypto.randomUUID();
  return `embed-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function builderConfiguration(
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

function widgetFor(id: EmbedWidgetId): EmbedWidgetDefinition {
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

function configuredPublicOrigin(explicit?: string): string {
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

function iframeSandbox(widget: EmbedWidgetDefinition): string {
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

function outputFormatLabel(value: EmbedOutputFormat): string {
  return EMBED_OUTPUT_FORMATS.find((option) => option.value === value)?.label ?? "Styled HTML";
}

function embedCodePreview(settings: EmbedSnippetSettings): string {
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

function workspaceScopeKey(organizationId: string, eventId: string): string {
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

export interface EmbedWorkspaceViewProps {
  readonly organizationId: string;
  readonly eventId: string;
  readonly eventSlug: string | null;
  readonly publicOrigin?: string;
  readonly eventName?: string;
  readonly eventVersion?: number | null;
  readonly expectedPublishedRevision?: EmbedExpectedPublishedRevision | null;
  readonly initialConfigurations?: readonly EmbedConfiguration[];
  readonly api?: Pick<EmbedWorkspaceApi, "updateEvent">;
  readonly publication?: EmbedPublicationMetadata;
  readonly loading?: boolean;
  readonly errorMessage?: string | null;
}

function CopyButton({ label, value }: Readonly<{ label: string; value: string }>) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  async function copy() {
    if (!value || typeof navigator === "undefined" || !navigator.clipboard) {
      setError(true);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setError(false);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(true);
      setCopied(false);
    }
  }

  return (
    <div className={workspaceStyles.copyRow}>
      <Button
        variant="outline"
        size="sm"
        type="button"
        onClick={() => void copy()}
        disabled={!value}
      >
        {copied ? "Copied" : `Copy ${label}`}
      </Button>
      <span role="status" aria-live="polite" className={workspaceStyles.muted}>
        {copied
          ? `${label} copied to clipboard.`
          : error
            ? "Clipboard access is unavailable. Select the code to copy it."
            : ""}
      </span>
    </div>
  );
}

function WidgetChooser({
  selected,
  onChange,
}: Readonly<{ selected: EmbedWidgetId; onChange: (value: EmbedWidgetId) => void }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a public widget</CardTitle>
        <CardDescription>
          Pick the public projection your visitors should see. This choice is saved with the
          configuration, not in browser-only state.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ToggleGroup
          type="single"
          value={selected}
          onValueChange={(value) => {
            if (value) onChange(value as EmbedWidgetId);
          }}
          orientation="vertical"
          className={workspaceStyles.optionGrid}
          aria-label="Public widget"
        >
          {EMBED_WIDGETS.map((widget) => (
            <ToggleGroupItem
              key={widget.id}
              value={widget.id}
              className={workspaceStyles.option}
              aria-label={widget.label}
            >
              <span className={workspaceStyles.optionCopy}>
                <strong>{widget.label}</strong>
                <span>{widget.description}</span>
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardContent>
    </Card>
  );
}

function EmbedConfigurationLibrary({
  configurations,
  selectedConfigurationId,
  configurationName,
  statusMessage,
  persistenceReady,
  onConfigurationName,
  onSelectConfiguration,
  onNewConfiguration,
  onSaveConfiguration,
  onToggleConfiguration,
}: Readonly<{
  configurations: readonly EmbedConfiguration[];
  selectedConfigurationId: string | null;
  configurationName: string;
  statusMessage: string;
  persistenceReady: boolean;
  onConfigurationName: (value: string) => void;
  onSelectConfiguration: (value: string) => void;
  onNewConfiguration: () => void;
  onSaveConfiguration: () => void;
  onToggleConfiguration: (id: string, enabled: boolean) => void;
}>) {
  return (
    <Card>
      <CardHeader>
        <div className={workspaceStyles.cardHeadingRow}>
          <div>
            <CardTitle>Choose or save a configuration</CardTitle>
            <CardDescription>
              Saved configurations belong to this event and are persisted through the organizer API.
            </CardDescription>
          </div>
          <Badge variant={persistenceReady ? "outline" : "secondary"}>
            {persistenceReady ? "Ready to save" : "Read-only"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className={workspaceStyles.sectionStack}>
        <div className={workspaceStyles.field}>
          <label htmlFor="embed-saved-configurations" className={workspaceStyles.label}>
            Saved configurations
          </label>
          <Select
            {...(selectedConfigurationId === null ? {} : { value: selectedConfigurationId })}
            onValueChange={onSelectConfiguration}
          >
            <SelectTrigger id="embed-saved-configurations" aria-label="Saved widget configurations">
              <SelectValue placeholder="New widget configuration" />
            </SelectTrigger>
            <SelectContent>
              {configurations.map((configuration) => (
                <SelectItem key={configuration.id} value={configuration.id}>
                  {configuration.name} · {widgetFor(configuration.widgetId).label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {configurations.length > 0 ? (
          <fieldset className={workspaceStyles.savedList}>
            <legend className="sr-only">Saved configuration availability</legend>
            {configurations.map((configuration) => {
              const checkboxId = `embed-configuration-enabled-${configuration.id}`;
              return (
                <div key={`${configuration.id}-enabled`} className={workspaceStyles.checkRow}>
                  <Checkbox
                    id={checkboxId}
                    aria-label={`${configuration.enabled ? "Disable" : "Enable"} ${configuration.name}`}
                    checked={configuration.enabled}
                    disabled={!persistenceReady}
                    onCheckedChange={(checked) =>
                      onToggleConfiguration(configuration.id, checked === true)
                    }
                  />
                  <Label htmlFor={checkboxId}>
                    <strong>{configuration.name}</strong>
                    <span className={workspaceStyles.muted}>
                      {configuration.enabled ? "Enabled" : "Disabled"} ·{" "}
                      {widgetFor(configuration.widgetId).label}
                    </span>
                  </Label>
                </div>
              );
            })}
          </fieldset>
        ) : (
          <p className={workspaceStyles.emptyNote}>No saved configurations yet.</p>
        )}

        <div className={workspaceStyles.field}>
          <label htmlFor="embed-configuration-name" className={workspaceStyles.label}>
            Configuration name
          </label>
          <Input
            id="embed-configuration-name"
            aria-label="Configuration name"
            value={configurationName}
            onChange={(event) => onConfigurationName(event.target.value)}
            placeholder="e.g. Main schedule"
            maxLength={120}
          />
        </div>

        <div className={workspaceStyles.actionRow}>
          <Button type="button" onClick={onNewConfiguration}>
            New widget
          </Button>
          <Button
            variant="secondary"
            type="button"
            onClick={onSaveConfiguration}
            disabled={!persistenceReady}
          >
            {selectedConfigurationId ? "Update configuration" : "Save configuration"}
          </Button>
          <span className={workspaceStyles.muted}>
            {selectedConfigurationId
              ? `Saved configuration revision ${
                  configurations.find(
                    (configuration) => configuration.id === selectedConfigurationId,
                  )?.revision ?? "unknown"
                } is authoritative. Updates require that revision.`
              : "New configurations start at revision 1. Saved configurations are immutable; disable one instead of deleting it."}
          </span>
        </div>

        <p role="status" aria-live="polite" className={workspaceStyles.statusMessage}>
          {statusMessage ||
            (persistenceReady
              ? "Save creates a configuration on the event. Select one to update or disable it."
              : "Loading event configurations…")}
        </p>
      </CardContent>
    </Card>
  );
}

function EmbedControls({
  widget,
  theme,
  outputFormat,
  layout,
  accent,
  backgroundColor,
  textColor,
  customCss,
  displayFields,
  trackIds,
  statuses,
  cacheRefreshMessage,
  cacheRefreshBusy: _cacheRefreshBusy,
  cacheRefreshError: _cacheRefreshError,
  onTheme,
  onOutputFormat,
  onLayout,
  onAccent,
  onBackgroundColor,
  onTextColor,
  onCustomCss,
  onDisplayFields,
  onTracks,
  onStatuses,
  onRefresh,
}: Readonly<{
  widget: EmbedWidgetDefinition;
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
  cacheRefreshMessage: string;
  cacheRefreshBusy: boolean;
  cacheRefreshError: boolean;
  onTheme: (value: EmbedTheme) => void;
  onOutputFormat: (value: EmbedOutputFormat) => void;
  onLayout: (value: EmbedLayout) => void;
  onAccent: (value: EmbedAccent) => void;
  onBackgroundColor: (value: string) => void;
  onTextColor: (value: string) => void;
  onCustomCss: (value: string) => void;
  onDisplayFields: (value: readonly EmbedFieldId[]) => void;
  onTracks: (value: readonly string[]) => void;
  onStatuses: (value: readonly string[]) => void;
  onRefresh: () => void;
}>) {
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const setListValue = (value: string, onChange: (next: readonly string[]) => void): void => {
    onChange(
      value
        .split(",")
        .map((item) => item.trim())
        .filter((item, index, items) => item.length > 0 && items.indexOf(item) === index),
    );
  };

  return (
    <div className={workspaceStyles.sectionStack}>
      <Card>
        <CardHeader>
          <CardTitle>Configure the public widget</CardTitle>
          <CardDescription>
            These controls are safe public options. They are encoded in links and snippets without
            exposing organizer-only fields.
          </CardDescription>
        </CardHeader>
        <CardContent className={workspaceStyles.fieldGrid}>
          <div className={workspaceStyles.field}>
            <label htmlFor="embed-output-format" className={workspaceStyles.label}>
              Output format
            </label>
            <Select
              value={outputFormat}
              onValueChange={(value) => onOutputFormat(value as EmbedOutputFormat)}
            >
              <SelectTrigger id="embed-output-format" aria-label="Output format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMBED_OUTPUT_FORMATS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className={workspaceStyles.muted}>
              {EMBED_OUTPUT_FORMATS.find((option) => option.value === outputFormat)?.description}
            </p>
          </div>

          <div className={workspaceStyles.field}>
            <label htmlFor="embed-layout" className={workspaceStyles.label}>
              Layout
            </label>
            <Select value={layout} onValueChange={(value) => onLayout(value as EmbedLayout)}>
              <SelectTrigger id="embed-layout">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {widget.layouts.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className={workspaceStyles.field}>
            <label htmlFor="embed-theme" className={workspaceStyles.label}>
              Theme
            </label>
            <Select value={theme} onValueChange={(value) => onTheme(value as EmbedTheme)}>
              <SelectTrigger id="embed-theme">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMBED_THEMES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className={workspaceStyles.colorGrid}>
            <label htmlFor="embed-accent" className={workspaceStyles.field}>
              <span className={workspaceStyles.label}>Accent color</span>
              <Input
                id="embed-accent"
                aria-label="Accent color"
                type="color"
                value={accent}
                onChange={(event) => onAccent(event.target.value)}
              />
            </label>
            <label htmlFor="embed-background-color" className={workspaceStyles.field}>
              <span className={workspaceStyles.label}>Background color</span>
              <Input
                id="embed-background-color"
                aria-label="Background color"
                type="color"
                value={backgroundColor}
                onChange={(event) => onBackgroundColor(event.target.value)}
              />
            </label>
            <label htmlFor="embed-text-color" className={workspaceStyles.field}>
              <span className={workspaceStyles.label}>Text color</span>
              <Input
                id="embed-text-color"
                aria-label="Text color"
                type="color"
                value={textColor}
                onChange={(event) => onTextColor(event.target.value)}
              />
            </label>
          </div>
        </CardContent>
      </Card>

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <Card>
          <CardHeader>
            <div className={workspaceStyles.cardHeadingRow}>
              <div>
                <CardTitle>Advanced public options</CardTitle>
                <CardDescription>
                  Optional filters, display fields, host CSS, and a local preview refresh.
                </CardDescription>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" type="button">
                  {advancedOpen ? "Collapse" : "Expand"}
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className={workspaceStyles.sectionStack}>
              <fieldset className={workspaceStyles.fieldset}>
                <legend className={workspaceStyles.label}>Display fields</legend>
                <p className={workspaceStyles.muted}>
                  Required fields stay enabled; optional fields are included in copied links.
                </p>
                <div className={workspaceStyles.checkGrid}>
                  {EMBED_DISPLAY_FIELDS.map((field) => {
                    const checked = field.required || displayFields.includes(field.id);
                    return (
                      <div
                        key={field.id}
                        className={workspaceStyles.checkRow}
                        data-disabled={field.required ? "true" : undefined}
                      >
                        <Checkbox
                          id={`embed-field-${field.id}`}
                          name={`embed-field-${field.id}`}
                          checked={checked}
                          disabled={field.required}
                          onCheckedChange={(value) => {
                            const next = displayFields.filter((item) => item !== field.id);
                            onDisplayFields(value === true ? [...next, field.id] : next);
                          }}
                        />
                        <Label htmlFor={`embed-field-${field.id}`}>
                          {field.label}
                          {field.required ? " (required)" : ""}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </fieldset>

              <div className={workspaceStyles.fieldGrid}>
                <div className={workspaceStyles.field}>
                  <label htmlFor="embed-track-filter" className={workspaceStyles.label}>
                    Track filters
                  </label>
                  <Input
                    id="embed-track-filter"
                    aria-label="Track filters"
                    value={trackIds.join(", ")}
                    placeholder="All tracks"
                    onChange={(event) => setListValue(event.target.value, onTracks)}
                  />
                </div>
                <div className={workspaceStyles.field}>
                  <label htmlFor="embed-status-filter" className={workspaceStyles.label}>
                    Session status filters
                  </label>
                  <Input
                    id="embed-status-filter"
                    aria-label="Session status filters"
                    value={statuses.join(", ")}
                    placeholder="Approved"
                    onChange={(event) => setListValue(event.target.value, onStatuses)}
                  />
                </div>
              </div>

              <label htmlFor="embed-custom-css" className={workspaceStyles.field}>
                <span className={workspaceStyles.label}>Custom CSS for the host page</span>
                <textarea
                  id="embed-custom-css"
                  aria-label="Custom CSS"
                  value={customCss}
                  onChange={(event) => onCustomCss(event.target.value)}
                  placeholder="Optional CSS for your host page"
                  rows={4}
                  className={workspaceStyles.textarea}
                />
              </label>

              <Alert>
                <AlertTitle>Boundary and cache rules</AlertTitle>
                <AlertDescription>
                  Safe theme, layout, output, field, filter, and color choices are encoded in copied
                  URLs. Custom CSS stays in host markup and is never sent as executable URL content.
                  Refresh only updates this local preview; no remote cache mutation is claimed.
                </AlertDescription>
              </Alert>

              <Button variant="outline" type="button" onClick={onRefresh}>
                Refresh local preview
              </Button>
              <p role="status" aria-live="polite" className={workspaceStyles.muted}>
                {cacheRefreshMessage ||
                  "Manual cache refresh is available for this preview; no remote cache mutation is claimed."}
              </p>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}

function PublicationStatus({
  eventVersion,
  publication,
}: Readonly<{
  eventVersion: number | null | undefined;
  publication: EmbedPublicationMetadata;
}>) {
  const statusLabel =
    publication.status === "served"
      ? "Served"
      : publication.status === "pending"
        ? "Pending rebuild"
        : publication.status === "failed"
          ? "Rebuild failed"
          : publication.status === "loading"
            ? "Loading publication"
            : publication.status === "unavailable"
              ? "Publication unavailable"
              : "No publication";
  const servedRevision = publication.servedRevision;
  return (
    <Card aria-labelledby="embed-publication-status-heading">
      <CardHeader>
        <div className={workspaceStyles.cardHeadingRow}>
          <div>
            <CardTitle id="embed-publication-status-heading">Publication truth</CardTitle>
            <CardDescription>
              Served, pending, and failed program releases are authoritative. A pending or failed
              rebuild keeps the previously served revision.
            </CardDescription>
          </div>
          <Badge variant={publication.status === "served" ? "default" : "secondary"}>
            {statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className={workspaceStyles.statusGrid}>
        <div className={workspaceStyles.statusItem}>
          <span className={workspaceStyles.statusLabel}>Draft event</span>
          <strong>
            {eventVersion === null || eventVersion === undefined
              ? "Version not loaded"
              : `Event version ${eventVersion}`}
          </strong>
          <span className={workspaceStyles.muted}>Private organizer record.</span>
        </div>
        <div className={workspaceStyles.statusItem}>
          <span className={workspaceStyles.statusLabel}>Served program revision</span>
          <strong>
            {servedRevision === null ? "No served revision" : `Revision ${servedRevision}`}
          </strong>
          <span className={workspaceStyles.muted}>
            {publication.status === "pending"
              ? `Rebuild ${publication.pendingRevision ?? "pending"} is in progress; revision ${servedRevision ?? "none"} remains served.`
              : publication.status === "failed"
                ? `${publication.failedReason ?? "The latest rebuild failed."} Previously served revision remains active.`
                : (publication.message ?? "Public outputs use this served program release.")}
          </span>
        </div>
        <div className={workspaceStyles.statusItem}>
          <span className={workspaceStyles.statusLabel}>Publication state</span>
          <strong>{statusLabel}</strong>
          <span className={workspaceStyles.muted}>
            {publication.pendingRevision === null
              ? "No pending rebuild."
              : `Pending rebuild revision ${publication.pendingRevision}.`}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function CodePanel({
  settings,
  publication,
}: Readonly<{
  settings: EmbedSnippetSettings;
  publication: EmbedPublicationMetadata;
}>) {
  const iframe = iframeSnippet(settings);
  const script = scriptSnippet(settings);
  const preview = embedCodePreview(settings);
  const format = outputFormatLabel(settings.outputFormat ?? "styled-html");
  const revision = publication.servedRevision;
  const publicUrl = publicEmbedUrl(settings);
  const jsonUrl = publicAgendaJsonUrl(settings);
  const calendarUrl = publicAgendaCalendarUrl(settings);

  return (
    <Card aria-labelledby="embed-code-heading">
      <CardHeader>
        <div className={workspaceStyles.cardHeadingRow}>
          <div>
            <p className={styles.panelEyebrow}>Step 4 · export</p>
            <CardTitle id="embed-code-heading">Share or embed</CardTitle>
            <CardDescription>
              Share the public URL now. Expand developer snippets only when a host needs embed code.
            </CardDescription>
          </div>
          {revision !== null ? <Badge variant="outline">Program revision {revision}</Badge> : null}
          {revision !== null ? (
            <p className={workspaceStyles.muted}>
              Served program revision {revision} is used by every output.
            </p>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className={workspaceStyles.sectionStack}>
        <div className={workspaceStyles.shareBlock}>
          <div className={workspaceStyles.cardHeadingRow}>
            <div>
              <h3 className={workspaceStyles.subheading}>Live public URL</h3>
              <p className={workspaceStyles.muted}>
                Anyone with this link can open the confirmed public revision.
              </p>
            </div>
            <Badge variant="secondary">Revision {revision}</Badge>
          </div>
          <Input aria-label="Live public embed URL" readOnly value={publicUrl} />
          <div className={workspaceStyles.actionRow}>
            <CopyButton label="public URL" value={publicUrl} />
            <Button asChild variant="outline">
              <a href={publicUrl} target="_blank" rel="noreferrer">
                Open public view ↗
              </a>
            </Button>
          </div>
        </div>

        <div className={workspaceStyles.codeBlock}>
          <div>
            <h3 className={workspaceStyles.subheading}>JSON feed</h3>
            <p className={workspaceStyles.muted}>
              Machine-readable published agenda using this configuration and program revision.
            </p>
          </div>
          <Input aria-label="JSON feed URL" readOnly value={jsonUrl} />
          <CopyButton label="JSON feed URL" value={jsonUrl} />
        </div>

        <div className={workspaceStyles.codeBlock}>
          <div>
            <h3 className={workspaceStyles.subheading}>iCal feed</h3>
            <p className={workspaceStyles.muted}>
              Calendar output using this configuration and program revision.
            </p>
          </div>
          <Input aria-label="iCal feed URL" readOnly value={calendarUrl} />
          <CopyButton label="iCal feed URL" value={calendarUrl} />
        </div>

        <Collapsible>
          <div className={workspaceStyles.developerDisclosure}>
            <div>
              <h3 className={workspaceStyles.subheading}>Developer embed code</h3>
              <p className={workspaceStyles.muted}>
                Iframe, script, and {format} output for websites that accept embed markup.
              </p>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="outline">Show code</Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent forceMount className={workspaceStyles.developerContent}>
            <div className={workspaceStyles.codeBlock}>
              <div>
                <h3 className={workspaceStyles.subheading}>Code preview · {format}</h3>
                <p className={workspaceStyles.muted}>
                  Safe options are encoded in the public URL; no private fields or executable custom
                  CSS are copied.
                </p>
              </div>
              <ScrollArea className={workspaceStyles.codeScroll}>
                <textarea
                  aria-label="Embed code preview"
                  readOnly
                  value={preview}
                  rows={8}
                  className={workspaceStyles.codeArea}
                />
              </ScrollArea>
              <CopyButton label="code preview" value={preview} />
            </div>

            <div className={workspaceStyles.codeBlock}>
              <div>
                <h3 className={workspaceStyles.subheading}>Iframe snippet</h3>
                <p className={workspaceStyles.muted}>
                  Paste this sandboxed, responsive iframe into a page that accepts HTML.
                </p>
              </div>
              <textarea
                aria-label="Iframe embed snippet"
                readOnly
                value={iframe}
                rows={6}
                className={workspaceStyles.codeArea}
              />
              <CopyButton label="iframe code" value={iframe} />
            </div>

            {settings.widget.scriptView ? (
              <div className={workspaceStyles.codeBlock}>
                <div>
                  <h3 className={workspaceStyles.subheading}>Script snippet</h3>
                  <p className={workspaceStyles.muted}>
                    Use the fixed loader for supported Agenda and Speaker Gallery views.
                  </p>
                </div>
                <textarea
                  aria-label="Script embed snippet"
                  readOnly
                  value={script}
                  rows={6}
                  className={workspaceStyles.codeArea}
                />
                <CopyButton label="script code" value={script} />
              </div>
            ) : (
              <Alert>
                <AlertTitle>Iframe mode is the supported option for this widget.</AlertTitle>
                <AlertDescription>
                  The script loader supports Agenda and Speaker Gallery. Use the generated iframe
                  for this view.
                </AlertDescription>
              </Alert>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

function agendaValidationHref(organizationId: string, eventId: string): string {
  return `/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}/agenda`;
}

function MissingPublicProjection({
  organizationId,
  eventId,
  publication,
  settingsAvailable = true,
}: Readonly<{
  organizationId: string;
  eventId: string;
  publication: EmbedPublicationMetadata;
  settingsAvailable?: boolean;
}>) {
  const checking = publication.status === "loading";
  const needsConfiguration =
    (publication.status === "served" ||
      publication.status === "pending" ||
      publication.status === "failed") &&
    !settingsAvailable;
  const title = checking
    ? "Loading publication state"
    : needsConfiguration
      ? "Preview needs a saved enabled configuration"
      : publication.status === "failed"
        ? "Rebuild failed; previous revision retained"
        : publication.status === "pending"
          ? "Rebuild pending; previous revision retained"
          : publication.status === "unavailable"
            ? "Publication API unavailable"
            : publication.status === "none"
              ? "No published program revision"
              : "Preview unavailable";
  const description =
    publication.message ??
    publication.failedReason ??
    (checking
      ? "The current organizer publication state is loading."
      : "Preview and outputs remain withheld until a saved enabled configuration and served program revision are available.");
  return (
    <Alert
      variant={
        publication.status === "failed" || publication.status === "unavailable"
          ? "destructive"
          : "default"
      }
    >
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {description}
        {!checking && !needsConfiguration ? (
          <div className={workspaceStyles.alertAction}>
            <Button asChild variant="outline" size="sm">
              <a href={agendaValidationHref(organizationId, eventId)}>
                Open Agenda validation and publish
              </a>
            </Button>
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

export function EmbedWorkspaceView({
  organizationId,
  eventId,
  eventSlug,
  publicOrigin,
  eventName,
  eventVersion,
  expectedPublishedRevision: _expectedPublishedRevision = null,
  initialConfigurations,
  api,
  publication,
  loading = false,
  errorMessage = null,
}: EmbedWorkspaceViewProps) {
  const scopeKey = workspaceScopeKey(organizationId, eventId);
  const serverConfigurationList = useMemo(
    () => eventEmbedConfigurations(initialConfigurations),
    [initialConfigurations],
  );
  const initialConfiguration =
    serverConfigurationList.find((configuration) => configuration.enabled) ??
    serverConfigurationList[0];
  const initialWidget = widgetFor(initialConfiguration?.widgetId ?? "sessions");
  const initialLayout =
    initialConfiguration && initialWidget.layouts.includes(initialConfiguration.layout)
      ? initialConfiguration.layout
      : initialWidget.defaultLayout;
  const [widgetId, setWidgetId] = useState<EmbedWidgetId>(
    initialConfiguration?.widgetId ?? "sessions",
  );
  const [theme, setTheme] = useState<EmbedTheme>(initialConfiguration?.theme ?? "auto");
  const [outputFormat, setOutputFormat] = useState<EmbedOutputFormat>(
    initialConfiguration?.outputFormat ?? "styled-html",
  );
  const [layout, setLayout] = useState<EmbedLayout>(initialLayout);
  const [accent, setAccent] = useState<EmbedAccent>(
    initialConfiguration?.accent ?? DEFAULT_EMBED_ACCENT,
  );
  const [backgroundColor, setBackgroundColor] = useState(
    initialConfiguration?.backgroundColor ?? "#ffffff",
  );
  const [textColor, setTextColor] = useState(initialConfiguration?.textColor ?? "#20232b");
  const [customCss, setCustomCss] = useState(initialConfiguration?.customCss ?? "");
  const [displayFields, setDisplayFields] = useState<readonly EmbedFieldId[]>(
    initialConfiguration?.displayFields ?? DEFAULT_EMBED_DISPLAY_FIELDS,
  );
  const [trackIds, setTrackIds] = useState<readonly string[]>(initialConfiguration?.trackIds ?? []);
  const [statuses, setStatuses] = useState<readonly string[]>(
    initialConfiguration?.statuses ?? ["Approved"],
  );
  const [cacheRefreshMessage, setCacheRefreshMessage] = useState("");
  const [previewNonce, setPreviewNonce] = useState(0);
  const [configurations, setConfigurations] =
    useState<readonly EmbedConfiguration[]>(serverConfigurationList);
  const [selectedConfigurationId, setSelectedConfigurationId] = useState<string | null>(
    initialConfiguration?.id ?? null,
  );
  const [configurationName, setConfigurationName] = useState(initialConfiguration?.name ?? "");
  const [configurationStatusMessage, setConfigurationStatusMessage] = useState("");
  const [eventVersionState, setEventVersionState] = useState<number | null>(eventVersion ?? null);
  const [persistenceBusy, setPersistenceBusy] = useState(false);
  const [snapshotScopeKey, setSnapshotScopeKey] = useState<string | null>(
    initialConfigurations === undefined ? null : scopeKey,
  );
  const activeScopeRef = useRef(scopeKey);
  const installedConfigurationScopeRef = useRef<string | null>(
    initialConfigurations === undefined ? null : scopeKey,
  );
  const currentScopeRef = useRef(scopeKey);
  currentScopeRef.current = scopeKey;

  const resetBuilder = useCallback((message = "") => {
    setSelectedConfigurationId(null);
    setConfigurationName("");
    setWidgetId("sessions");
    setTheme("auto");
    setOutputFormat("styled-html");
    setLayout(widgetFor("sessions").defaultLayout);
    setAccent(DEFAULT_EMBED_ACCENT);
    setBackgroundColor("#ffffff");
    setTextColor("#20232b");
    setCustomCss("");
    setDisplayFields(DEFAULT_EMBED_DISPLAY_FIELDS);
    setTrackIds([]);
    setStatuses(["Approved"]);
    setConfigurationStatusMessage(message);
  }, []);

  const applyConfiguration = useCallback((configuration: EmbedConfiguration) => {
    const configurationWidget = widgetFor(configuration.widgetId);
    setSelectedConfigurationId(configuration.id);
    setConfigurationName(configuration.name);
    setWidgetId(configuration.widgetId);
    setTheme(configuration.theme);
    setOutputFormat(configuration.outputFormat);
    setLayout(
      configurationWidget.layouts.includes(configuration.layout)
        ? configuration.layout
        : configurationWidget.defaultLayout,
    );
    setAccent(configuration.accent);
    setBackgroundColor(configuration.backgroundColor);
    setTextColor(configuration.textColor);
    setCustomCss(configuration.customCss);
    setDisplayFields(configuration.displayFields);
    setTrackIds(configuration.trackIds);
    setStatuses(configuration.statuses);
  }, []);

  useEffect(() => {
    if (activeScopeRef.current !== scopeKey) {
      activeScopeRef.current = scopeKey;
      installedConfigurationScopeRef.current = null;
      setConfigurations(EMPTY_EMBED_CONFIGURATIONS);
      setEventVersionState(null);
      setPersistenceBusy(false);
      setPreviewNonce(0);
      setCacheRefreshMessage("");
      setSnapshotScopeKey(null);
      resetBuilder();
      return;
    }
    if (
      initialConfigurations === undefined ||
      installedConfigurationScopeRef.current === scopeKey
    ) {
      return;
    }

    installedConfigurationScopeRef.current = scopeKey;
    setConfigurations(serverConfigurationList);
    setEventVersionState(eventVersion ?? null);
    const activeConfiguration =
      serverConfigurationList.find((configuration) => configuration.enabled) ??
      serverConfigurationList[0];
    if (activeConfiguration) {
      applyConfiguration(activeConfiguration);
      setConfigurationStatusMessage(`Loaded "${activeConfiguration.name}" from the event.`);
    } else {
      resetBuilder();
    }
    setSnapshotScopeKey(scopeKey);
  }, [
    applyConfiguration,
    eventVersion,
    initialConfigurations,
    resetBuilder,
    scopeKey,
    serverConfigurationList,
  ]);

  const persistConfigurations = useCallback(
    async (nextConfigurations: readonly EmbedConfiguration[]): Promise<boolean> => {
      const requestScopeKey = scopeKey;
      const expectedVersion = eventVersionState;
      if (
        !api ||
        expectedVersion === null ||
        snapshotScopeKey !== requestScopeKey ||
        loading ||
        errorMessage
      ) {
        setConfigurationStatusMessage("Event configuration transport is unavailable.");
        return false;
      }

      setPersistenceBusy(true);
      setConfigurationStatusMessage("Saving event configuration…");
      try {
        const updatedEvent = await api.updateEvent(eventId, {
          expectedVersion,
          embedConfigurations: nextConfigurations,
        });
        if (currentScopeRef.current !== requestScopeKey) return false;
        if (
          updatedEvent.organizationId !== organizationId ||
          updatedEvent.id !== eventId ||
          updatedEvent.embedConfigurations === undefined
        ) {
          throw new Error("The event configuration response does not match this event context.");
        }
        const authoritativeConfigurations = eventEmbedConfigurations(
          updatedEvent.embedConfigurations,
        );
        installedConfigurationScopeRef.current = requestScopeKey;
        setConfigurations(authoritativeConfigurations);
        setEventVersionState(updatedEvent.version);
        setSnapshotScopeKey(requestScopeKey);
        return true;
      } catch (error) {
        if (currentScopeRef.current === requestScopeKey) {
          setConfigurationStatusMessage(messageFrom(error));
        }
        return false;
      } finally {
        setPersistenceBusy(false);
      }
    },
    [
      api,
      errorMessage,
      eventId,
      eventVersionState,
      loading,
      organizationId,
      scopeKey,
      snapshotScopeKey,
    ],
  );

  const startNewConfiguration = useCallback(() => {
    resetBuilder("New widget configuration ready. Saved configurations remain on the event.");
  }, [resetBuilder]);

  const selectConfiguration = useCallback(
    (id: string) => {
      if (!id) {
        startNewConfiguration();
        return;
      }
      const configuration = configurations.find((candidate) => candidate.id === id);
      if (!configuration) {
        resetBuilder("That saved configuration is no longer available.");
        return;
      }
      applyConfiguration(configuration);
      setConfigurationStatusMessage(`Loaded "${configuration.name}".`);
    },
    [applyConfiguration, configurations, resetBuilder, startNewConfiguration],
  );

  const saveConfiguration = useCallback(async () => {
    const name = configurationName.trim();
    if (!name) {
      setConfigurationStatusMessage("Enter a configuration name before saving.");
      return;
    }

    const existing = selectedConfigurationId
      ? configurations.find((configuration) => configuration.id === selectedConfigurationId)
      : undefined;
    const configurationId = existing?.id ?? createEmbedConfigurationId();
    const nextConfiguration = builderConfiguration(configurationId, name, {
      widgetId,
      enabled: existing?.enabled ?? true,
      theme,
      outputFormat,
      layout,
      accent,
      backgroundColor,
      textColor,
      customCss,
      displayFields,
      trackIds,
      statuses,
      revision: existing?.revision ?? null,
    });
    const nextConfigurations = existing
      ? configurations.map((configuration) =>
          configuration.id === existing.id ? nextConfiguration : configuration,
        )
      : [...configurations, nextConfiguration];

    if (!(await persistConfigurations(nextConfigurations))) return;
    setSelectedConfigurationId(configurationId);
    setConfigurationName(name);
    setConfigurationStatusMessage(
      existing ? `Updated "${name}" successfully.` : `Saved "${name}" successfully.`,
    );
  }, [
    accent,
    backgroundColor,
    configurationName,
    configurations,
    customCss,
    displayFields,
    layout,
    outputFormat,
    persistConfigurations,
    selectedConfigurationId,
    statuses,
    textColor,
    theme,
    trackIds,
    widgetId,
  ]);

  const toggleConfiguration = useCallback(
    async (id: string, enabled: boolean) => {
      const configuration = configurations.find((candidate) => candidate.id === id);
      if (!configuration) return;
      const nextConfigurations = configurations.map((candidate) =>
        candidate.id === id ? { ...candidate, enabled } : candidate,
      );
      if (!(await persistConfigurations(nextConfigurations))) return;
      setConfigurationStatusMessage(
        `${enabled ? "Enabled" : "Disabled"} "${configuration.name}" successfully.`,
      );
    },
    [configurations, persistConfigurations],
  );

  const changeWidget = useCallback((nextWidgetId: EmbedWidgetId) => {
    setWidgetId(nextWidgetId);
    setLayout(widgetFor(nextWidgetId).defaultLayout);
  }, []);

  const widget = widgetFor(widgetId);
  const origin = configuredPublicOrigin(publicOrigin);
  const normalizedSlug = normalizeEmbedSlug(eventSlug ?? undefined);
  const selectedConfiguration =
    snapshotScopeKey === scopeKey && selectedConfigurationId !== null
      ? (configurations.find((configuration) => configuration.id === selectedConfigurationId) ??
        null)
      : null;
  const settings = useMemo<EmbedSnippetSettings | null>(() => {
    if (loading || errorMessage || snapshotScopeKey !== scopeKey || !normalizedSlug || !origin) {
      return null;
    }
    return {
      widget,
      eventSlug: normalizedSlug,
      publicOrigin: origin,
      theme,
      outputFormat,
      layout,
      accent,
      backgroundColor,
      textColor,
      customCss,
      displayFields,
      trackIds,
      statuses,
    };
  }, [
    accent,
    backgroundColor,
    customCss,
    displayFields,
    errorMessage,
    layout,
    loading,
    normalizedSlug,
    origin,
    outputFormat,
    scopeKey,
    snapshotScopeKey,
    statuses,
    textColor,
    theme,
    trackIds,
    widget,
  ]);
  const authoritativePublication =
    snapshotScopeKey === scopeKey && !loading && !errorMessage ? publication : undefined;
  const publicationState: EmbedPublicationMetadata = authoritativePublication ?? {
    state: null,
    status: loading ? "loading" : "none",
    servedRevision: null,
    pendingRevision: null,
    failedReason: null,
    agendaDraftVersion: null,
    publicRevision: null,
    previewAvailability: loading ? "checking" : "unavailable",
    message: loading
      ? "Loading the current organizer publication state."
      : "No publication has been confirmed for this event.",
  };
  const settingsWithIdentity =
    settings !== null &&
    selectedConfiguration !== null &&
    selectedConfiguration.revision !== null &&
    publicationState.servedRevision !== null
      ? {
          ...settings,
          configurationId: selectedConfiguration.id,
          configurationRevision: selectedConfiguration.revision,
          programRevision: publicationState.servedRevision,
        }
      : null;
  const canDistribute = settingsWithIdentity !== null && selectedConfiguration?.enabled === true;
  const previewUrl = canDistribute ? publicEmbedUrl(settingsWithIdentity) : "";
  const refreshPreview = () => {
    setPreviewNonce((value) => value + 1);
    setCacheRefreshMessage(
      `Local preview refreshed at ${new Date().toLocaleTimeString()}. No remote cache was changed.`,
    );
  };
  const persistenceReady =
    api !== undefined &&
    eventVersionState !== null &&
    snapshotScopeKey === scopeKey &&
    !loading &&
    !errorMessage &&
    !persistenceBusy;
  const scopedConfigurations =
    snapshotScopeKey === scopeKey && !loading && !errorMessage
      ? configurations
      : EMPTY_EMBED_CONFIGURATIONS;
  const scopedEventVersion =
    snapshotScopeKey === scopeKey && !loading && !errorMessage ? eventVersionState : null;

  return (
    <main id="embeds-content" tabIndex={-1} className={workspaceStyles.root}>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderCopy}>
          <p className={styles.eyebrow}>Public distribution</p>
          <h1 className={styles.pageTitle}>Embed widgets</h1>
          <p className={styles.pageDescription}>
            Build a public widget from the event&apos;s published projection without exposing
            organizer-only data.
          </p>
          <p className={workspaceStyles.muted}>
            Organization {organizationId} · Event {eventId}
            {eventName ? ` · ${eventName}` : ""}
          </p>
        </div>
      </header>

      <Alert className={workspaceStyles.boundaryAlert}>
        <AlertTitle>Public boundary</AlertTitle>
        <AlertDescription>
          These widgets read a confirmed published event projection. Draft sessions, reviewer notes,
          speaker contact details, private files, and other organizer-only fields never cross this
          boundary. Local refresh does not mutate a remote cache.
        </AlertDescription>
      </Alert>

      {loading ? (
        <Alert>
          <AlertTitle>Loading event context</AlertTitle>
          <AlertDescription>
            Embed configuration and publication metadata are loaded from the organizer event record
            and public projection.
          </AlertDescription>
        </Alert>
      ) : null}
      {errorMessage ? (
        <Alert variant="destructive">
          <AlertTitle>Embed workspace unavailable</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}
      {!loading && !errorMessage && !normalizedSlug ? (
        <Alert variant="destructive">
          <AlertTitle>No public event slug</AlertTitle>
          <AlertDescription>
            Configure a public event slug before generating a public URL. The event ID is never used
            as a guessed public path.
          </AlertDescription>
        </Alert>
      ) : null}
      {!loading && !errorMessage && normalizedSlug && !origin ? (
        <Alert variant="destructive">
          <AlertTitle>Public app URL is not configured</AlertTitle>
          <AlertDescription>
            Set NEXT_PUBLIC_APP_URL to the approved web origin before copying embed code.
          </AlertDescription>
        </Alert>
      ) : null}

      <nav className={workspaceStyles.workflowSteps} aria-label="Embed workflow">
        <div className={workspaceStyles.workflowStep}>
          <Badge>1</Badge>
          <span>Choose/save configuration</span>
        </div>
        <div className={workspaceStyles.workflowStep}>
          <Badge variant="secondary">2</Badge>
          <span>Configure public widget</span>
        </div>
        <div className={workspaceStyles.workflowStep}>
          <Badge variant="secondary">3</Badge>
          <span>Live published preview</span>
        </div>
        <div className={workspaceStyles.workflowStep}>
          <Badge variant="secondary">4</Badge>
          <span>Copy code/export link</span>
        </div>
      </nav>

      <PublicationStatus eventVersion={scopedEventVersion} publication={publicationState} />

      <div className={workspaceStyles.workspaceGrid}>
        <section className={workspaceStyles.builderColumn} aria-label="Embed builder">
          <Tabs defaultValue="choose" className={workspaceStyles.builderTabs}>
            <TabsList className={workspaceStyles.tabsList}>
              <TabsTrigger value="choose">1 Choose and save</TabsTrigger>
              <TabsTrigger value="configure">2 Configure widget</TabsTrigger>
            </TabsList>
            <TabsContent value="choose" forceMount className={workspaceStyles.tabContent}>
              <div className={workspaceStyles.sectionStack}>
                <EmbedConfigurationLibrary
                  configurations={scopedConfigurations}
                  selectedConfigurationId={selectedConfigurationId}
                  configurationName={configurationName}
                  statusMessage={configurationStatusMessage}
                  persistenceReady={persistenceReady}
                  onConfigurationName={setConfigurationName}
                  onSelectConfiguration={selectConfiguration}
                  onNewConfiguration={startNewConfiguration}
                  onSaveConfiguration={saveConfiguration}
                  onToggleConfiguration={toggleConfiguration}
                />
                <WidgetChooser selected={widgetId} onChange={changeWidget} />
              </div>
            </TabsContent>
            <TabsContent value="configure" forceMount className={workspaceStyles.tabContent}>
              <EmbedControls
                widget={widget}
                theme={theme}
                outputFormat={outputFormat}
                layout={layout}
                accent={accent}
                backgroundColor={backgroundColor}
                textColor={textColor}
                customCss={customCss}
                displayFields={displayFields}
                trackIds={trackIds}
                statuses={statuses}
                cacheRefreshMessage={cacheRefreshMessage}
                cacheRefreshBusy={false}
                cacheRefreshError={false}
                onTheme={setTheme}
                onOutputFormat={setOutputFormat}
                onLayout={setLayout}
                onAccent={setAccent}
                onBackgroundColor={setBackgroundColor}
                onTextColor={setTextColor}
                onCustomCss={setCustomCss}
                onDisplayFields={setDisplayFields}
                onTracks={setTrackIds}
                onStatuses={setStatuses}
                onRefresh={refreshPreview}
              />
            </TabsContent>
          </Tabs>
        </section>

        <aside className={workspaceStyles.rail} aria-label="Live preview workspace">
          <div className={workspaceStyles.previewRail}>
            <Card aria-labelledby="embed-preview-heading">
              <CardHeader>
                <div className={workspaceStyles.cardHeadingRow}>
                  <div>
                    <p className={styles.panelEyebrow}>Step 3 · public revision</p>
                    <CardTitle id="embed-preview-heading">
                      {canDistribute ? "Live published preview" : "Preview unavailable"}
                    </CardTitle>
                    <CardDescription>
                      Preview is rendered only when the public projection and its revision metadata
                      are confirmed.
                    </CardDescription>
                    {publicationState.servedRevision !== null ? (
                      <p className={workspaceStyles.muted}>
                        Served program revision {publicationState.servedRevision} · configuration{" "}
                        {selectedConfiguration?.revision ?? "unknown"}
                      </p>
                    ) : null}
                  </div>
                  {publicationState.servedRevision !== null ? (
                    <Badge variant="outline">
                      Program revision {publicationState.servedRevision}
                    </Badge>
                  ) : null}
                </div>
                {canDistribute && previewUrl ? (
                  <div className={workspaceStyles.previewActions}>
                    <CopyButton label="public URL" value={previewUrl} />
                    <Button asChild variant="outline">
                      <a href={previewUrl} target="_blank" rel="noreferrer">
                        Open public view ↗
                      </a>
                    </Button>
                  </div>
                ) : null}
              </CardHeader>
              <CardContent>
                {canDistribute && settingsWithIdentity ? (
                  <iframe
                    key={`${previewUrl}-${previewNonce}`}
                    src={previewUrl}
                    title={`Live preview: ${widget.label}`}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    sandbox={iframeSandbox(widget)}
                    className={workspaceStyles.previewFrame}
                  />
                ) : (
                  <MissingPublicProjection
                    organizationId={organizationId}
                    eventId={eventId}
                    publication={publicationState}
                    settingsAvailable={settings !== null}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </aside>
      </div>

      {canDistribute && settings ? (
        <CodePanel settings={settings} publication={publicationState} />
      ) : (
        <Card aria-labelledby="embed-code-unavailable-heading">
          <CardHeader>
            <p className={styles.panelEyebrow}>Step 4 · export</p>
            <CardTitle id="embed-code-unavailable-heading">Copy code/export link</CardTitle>
            <CardDescription>
              Snippets and links are withheld until they can point at the same confirmed published
              revision as the preview.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MissingPublicProjection
              organizationId={organizationId}
              eventId={eventId}
              publication={publicationState}
              settingsAvailable={settings !== null}
            />
          </CardContent>
        </Card>
      )}
    </main>
  );
}

export interface EmbedWorkspaceProps {
  readonly organizationId: string;
  readonly eventId: string;
  readonly eventSlug?: string;
  readonly initialEvent?: Pick<EmbedEventRecord, "id" | "organizationId" | "slug" | "name">;
  readonly api?: Pick<EmbedWorkspaceApi, "getEvent" | "updateEvent" | "getPublication">;
  readonly publicOrigin?: string;
}

type EmbedLoadState =
  | { readonly status: "loading"; readonly scopeKey: string }
  | {
      readonly status: "loaded";
      readonly scopeKey: string;
      readonly event: EmbedEventRecord;
      readonly eventSlug: string;
      readonly eventName: string;
    }
  | { readonly status: "error"; readonly scopeKey: string; readonly message: string };

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "The organizer event could not be loaded.";
}
type EmbedProjectionEnvelope = {
  readonly data?: {
    readonly revision?: {
      readonly id?: unknown;
      readonly number?: unknown;
      readonly publishedAt?: unknown;
    };
  };
  readonly error?: {
    readonly code?: unknown;
    readonly message?: unknown;
  };
};

function revisionFromProjection(value: unknown): EmbedPublicRevision | null {
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

function publicationMetadataFromState(
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

async function loadEmbedPublication(
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

export function EmbedWorkspace({
  organizationId,
  eventId,
  api: providedApi,
  publicOrigin,
}: EmbedWorkspaceProps) {
  const scopeKey = workspaceScopeKey(organizationId, eventId);
  const [state, setState] = useState<EmbedLoadState>({ status: "loading", scopeKey });
  const [loadedApi, setLoadedApi] = useState<Pick<
    EmbedWorkspaceApi,
    "getEvent" | "updateEvent" | "getPublication"
  > | null>(providedApi ?? null);
  const [publication, setPublication] = useState<EmbedPublicationMetadata | undefined>();

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!organizationId.trim() || !eventId.trim()) {
        setState({
          status: "error",
          scopeKey,
          message: "An organization and event context are required.",
        });
        return;
      }
      let api = providedApi;
      if (!api) {
        try {
          api = createEmbedWorkspaceApi(organizationId);
        } catch (error) {
          setState({ status: "error", scopeKey, message: messageFrom(error) });
          return;
        }
      }
      setLoadedApi(api);
      setState({ status: "loading", scopeKey });
      try {
        const event = await api.getEvent(eventId, signal);
        if (signal?.aborted) return;
        if (event.organizationId !== organizationId || event.id !== eventId) {
          throw new Error(
            "The organizer event response does not match this organization and event context.",
          );
        }
        const resolvedSlug = normalizeEmbedSlug(event.slug);
        if (!resolvedSlug) throw new Error("The organizer event has no public slug.");
        setState({
          status: "loaded",
          scopeKey,
          event,
          eventSlug: resolvedSlug,
          eventName: event.name,
        });
      } catch (error) {
        if (signal?.aborted) return;
        setState({ status: "error", scopeKey, message: messageFrom(error) });
      }
    },
    [eventId, organizationId, providedApi, scopeKey],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    if (state.scopeKey !== scopeKey) {
      setPublication(undefined);
      return;
    }
    if (state.status !== "loaded") {
      if (state.status === "loading") {
        setPublication(
          publicationMetadataFromState(
            null,
            "loading",
            "Loading the current organizer publication state.",
          ),
        );
      } else {
        setPublication(undefined);
      }
      return;
    }

    const controller = new AbortController();
    setPublication(
      publicationMetadataFromState(
        null,
        "loading",
        "Loading the current organizer publication state.",
      ),
    );
    if (loadedApi === null) return () => controller.abort();
    void loadEmbedPublication(loadedApi, eventId, controller.signal).then(
      (nextPublication) => {
        if (!controller.signal.aborted) setPublication(nextPublication);
      },
      () => {
        if (!controller.signal.aborted) {
          setPublication(
            publicationMetadataFromState(
              null,
              "unavailable",
              "The publication API could not be checked.",
            ),
          );
        }
      },
    );
    return () => controller.abort();
  }, [eventId, loadedApi, scopeKey, state]);

  const eventLoaded = state.scopeKey === scopeKey && state.status === "loaded" ? state : null;
  const isLoading = state.scopeKey !== scopeKey || state.status === "loading";
  const errorMessage =
    state.scopeKey === scopeKey && state.status === "error" ? state.message : null;

  return (
    <EmbedWorkspaceView
      key={scopeKey}
      organizationId={organizationId}
      eventId={eventId}
      eventSlug={eventLoaded?.eventSlug ?? null}
      eventName={eventLoaded?.eventName ?? ""}
      eventVersion={eventLoaded?.event.version ?? null}
      {...(eventLoaded
        ? {
            initialConfigurations: eventLoaded.event.embedConfigurations,
          }
        : {})}
      {...(state.scopeKey === scopeKey && publication !== undefined ? { publication } : {})}
      {...(loadedApi === null ? {} : { api: loadedApi })}
      {...(publicOrigin === undefined ? {} : { publicOrigin })}
      loading={isLoading}
      errorMessage={errorMessage}
    />
  );
}
