export type EventSettingsResourceKind = "track" | "format" | "level" | "tag";

export const defaultSessionStatuses = [
  "Draft",
  "Submitted",
  "Accepted",
  "Waitlisted",
  "Rejected",
  "Withdrawn",
] as const;

export const defaultAgendaEligibleStatuses = ["Accepted"] as const;

export interface EventSettingsHistoryEntry {
  readonly id: string;
  readonly action: "created" | "updated" | "deleted" | "settings.updated";
  readonly version: number;
  readonly actorId: string;
  readonly occurredAt: string;
}

export interface SessionSettingsRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly eventId: string;
  readonly statuses: readonly string[];
  readonly agendaEligibleStatuses: readonly string[];
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdBy: string;
  readonly updatedBy: string;
  readonly history: readonly EventSettingsHistoryEntry[];
}

export interface EventRoom {
  readonly id: string;
  readonly tenantId: string;
  readonly eventId: string;
  readonly name: string;
  readonly capacity: number;
  readonly resources: readonly string[];
  readonly resourceIds?: readonly string[];
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdBy: string;
  readonly updatedBy: string;
  readonly history: readonly EventSettingsHistoryEntry[];
}

export interface EventTaxonomyResource {
  readonly id: string;
  readonly tenantId: string;
  readonly eventId: string;
  readonly name: string;
  readonly description: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdBy: string;
  readonly updatedBy: string;
  readonly history: readonly EventSettingsHistoryEntry[];
}

export interface EventSettingsAuditEntry {
  readonly id: string;
  readonly tenantId: string;
  readonly eventId: string;
  readonly entityType: "session" | "room" | "track" | "format" | "level" | "tag" | "settings";
  readonly entityId: string;
  readonly action: "created" | "updated" | "deleted" | "settings.updated";
  readonly version: number;
  readonly actorId: string;
  readonly occurredAt: string;
  readonly before?: unknown;
  readonly after?: unknown;
}
export type SessionAuditEntry = EventSettingsAuditEntry;

export interface EventSettingsData {
  readonly organizationId: string;
  readonly eventId: string;
  readonly settings: SessionSettingsRecord;
  readonly rooms: readonly EventRoom[];
  readonly tracks: readonly EventTaxonomyResource[];
  readonly formats: readonly EventTaxonomyResource[];
  readonly levels: readonly EventTaxonomyResource[];
  readonly tags: readonly EventTaxonomyResource[];
  readonly audit: readonly EventSettingsAuditEntry[];
}

export interface EventIdentity {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

export type SessionSettings = SessionSettingsRecord;
export type Room = EventRoom;
export type Track = EventTaxonomyResource;
export type Format = EventTaxonomyResource;
export type Level = EventTaxonomyResource;
export type Tag = EventTaxonomyResource;

export interface RoomInput {
  readonly id?: string;
  readonly name: string;
  readonly capacity: number;
  readonly resources?: readonly string[];
}

export interface RoomUpdateInput {
  readonly roomId: string;
  readonly expectedVersion: number;
  readonly name?: string;
  readonly capacity?: number;
  readonly resources?: readonly string[];
}

export interface TaxonomyInput {
  readonly name: string;
  readonly description?: string;
}

export interface TaxonomyUpdateInput {
  readonly resourceId: string;
  readonly expectedVersion: number;
  readonly name?: string;
  readonly description?: string;
}

export interface SettingsUpdateInput {
  readonly expectedVersion: number;
  readonly statuses?: readonly string[];
  readonly agendaEligibleStatuses?: readonly string[];
}

export interface EventSettingsApi {
  getEventIdentity(eventId: string, signal?: AbortSignal): Promise<EventIdentity>;
  getOverview(eventId: string, signal?: AbortSignal): Promise<EventSettingsData>;
  getWorkspace(eventId: string, signal?: AbortSignal): Promise<EventSettingsData>;
  getSettings(eventId: string, signal?: AbortSignal): Promise<SessionSettingsRecord>;
  updateSettings(eventId: string, input: SettingsUpdateInput): Promise<SessionSettingsRecord>;
  listRooms(eventId: string, signal?: AbortSignal): Promise<readonly EventRoom[]>;
  createRoom(eventId: string, input: RoomInput): Promise<EventRoom>;
  updateRoom(eventId: string, input: RoomUpdateInput): Promise<EventRoom>;
  deleteRoom(eventId: string, roomId: string, expectedVersion: number): Promise<EventRoom>;
  listResources(
    eventId: string,
    kind: EventSettingsResourceKind,
    signal?: AbortSignal,
  ): Promise<readonly EventTaxonomyResource[]>;
  listTracks(eventId: string, signal?: AbortSignal): Promise<readonly EventTaxonomyResource[]>;
  listFormats(eventId: string, signal?: AbortSignal): Promise<readonly EventTaxonomyResource[]>;
  listLevels(eventId: string, signal?: AbortSignal): Promise<readonly EventTaxonomyResource[]>;
  listTags(eventId: string, signal?: AbortSignal): Promise<readonly EventTaxonomyResource[]>;
  createResource(
    eventId: string,
    kind: EventSettingsResourceKind,
    input: TaxonomyInput,
  ): Promise<EventTaxonomyResource>;
  createTrack(eventId: string, input: TaxonomyInput): Promise<EventTaxonomyResource>;
  createFormat(eventId: string, input: TaxonomyInput): Promise<EventTaxonomyResource>;
  createLevel(eventId: string, input: TaxonomyInput): Promise<EventTaxonomyResource>;
  createTag(eventId: string, input: TaxonomyInput): Promise<EventTaxonomyResource>;
  updateResource(
    eventId: string,
    kind: EventSettingsResourceKind,
    input: TaxonomyUpdateInput,
  ): Promise<EventTaxonomyResource>;
  updateTrack(eventId: string, input: TaxonomyUpdateInput): Promise<EventTaxonomyResource>;
  updateFormat(eventId: string, input: TaxonomyUpdateInput): Promise<EventTaxonomyResource>;
  updateLevel(eventId: string, input: TaxonomyUpdateInput): Promise<EventTaxonomyResource>;
  updateTag(eventId: string, input: TaxonomyUpdateInput): Promise<EventTaxonomyResource>;
  deleteResource(
    eventId: string,
    kind: EventSettingsResourceKind,
    resourceId: string,
    expectedVersion: number,
  ): Promise<EventTaxonomyResource>;
  deleteTrack(
    eventId: string,
    resourceId: string,
    expectedVersion: number,
  ): Promise<EventTaxonomyResource>;
  deleteFormat(
    eventId: string,
    resourceId: string,
    expectedVersion: number,
  ): Promise<EventTaxonomyResource>;
  deleteLevel(
    eventId: string,
    resourceId: string,
    expectedVersion: number,
  ): Promise<EventTaxonomyResource>;
  deleteTag(
    eventId: string,
    resourceId: string,
    expectedVersion: number,
  ): Promise<EventTaxonomyResource>;
  listAudit(
    eventId: string,
    entityId?: string,
    signal?: AbortSignal,
  ): Promise<readonly EventSettingsAuditEntry[]>;
}

export interface EventSettingsErrorBody {
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

export type EventSettingsErrorDetail = readonly {
  readonly path?: readonly (string | number)[];
  readonly message?: string;
}[];

export class EventSettingsApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly traceId: string | undefined;
  readonly details: EventSettingsErrorDetail | undefined;

  constructor(
    code: string,
    message: string,
    status: number,
    traceId?: string,
    details?: EventSettingsErrorDetail,
  ) {
    super(message);
    this.name = "EventSettingsApiError";
    this.code = code;
    this.status = status;
    this.traceId = traceId;
    this.details = details;
  }
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function segment(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TypeError(`An ${field} is required for event settings requests.`);
  }
  return encodeURIComponent(normalized);
}

function normalizeText(value: string, field: string, maximum = 200): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new TypeError(`${field} is required.`);
  if (normalized.length > maximum)
    throw new TypeError(`${field} must be at most ${maximum} characters.`);
  return normalized;
}

function normalizeResources(resources: readonly string[] | undefined): string[] {
  if (resources === undefined) return [];
  if (!Array.isArray(resources) || resources.length > 100) {
    throw new TypeError("Resources must contain at most 100 values.");
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (const resource of resources) {
    const normalized = normalizeText(resource, "Each resource", 128);
    if (seen.has(normalized)) throw new TypeError("Resources cannot contain duplicates.");
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${field} must be a positive integer.`);
  }
  return value;
}

export function validateRoomInput(input: RoomInput): RoomInput {
  const id = input.id === undefined ? undefined : normalizeText(input.id, "Room ID", 128);
  const name = normalizeText(input.name, "Room name");
  const capacity = positiveInteger(input.capacity, "Room capacity");
  if (capacity > 1_000_000) throw new TypeError("Room capacity must be at most 1000000.");
  return {
    ...(id === undefined ? {} : { id }),
    name,
    capacity,
    resources: normalizeResources(input.resources),
  };
}

export function validateSettingsUpdate(input: SettingsUpdateInput): SettingsUpdateInput {
  const expectedVersion = positiveInteger(input.expectedVersion, "Expected version");
  const statuses =
    input.statuses === undefined ? undefined : normalizeStatusList(input.statuses, "Statuses");
  const agendaEligibleStatuses =
    input.agendaEligibleStatuses === undefined
      ? undefined
      : normalizeStatusList(input.agendaEligibleStatuses, "Agenda-eligible statuses");
  if (statuses !== undefined) {
    for (const status of agendaEligibleStatuses ?? []) {
      if (!statuses.some((candidate) => candidate.toLowerCase() === status.toLowerCase())) {
        throw new TypeError("Every agenda-eligible status must be configured in statuses.");
      }
    }
  }
  return {
    expectedVersion,
    ...(statuses === undefined ? {} : { statuses }),
    ...(agendaEligibleStatuses === undefined ? {} : { agendaEligibleStatuses }),
  };
}

function normalizeStatusList(values: readonly string[], field: string): string[] {
  if (!Array.isArray(values) || values.length === 0 || values.length > 64) {
    throw new TypeError(`${field} must contain between 1 and 64 values.`);
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeText(value, "Status", 64);
    const key = normalized.toLowerCase();
    if (seen.has(key)) throw new TypeError(`${field} cannot contain duplicates.`);
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function validateTaxonomyInput(input: TaxonomyInput): TaxonomyInput {
  return {
    name: normalizeText(input.name, "Name"),
    ...(input.description === undefined ? {} : { description: input.description.trim() }),
  };
}

function validateExpectedVersion(value: number): number {
  return positiveInteger(value, "Expected version");
}

async function toApiError(response: Response): Promise<EventSettingsApiError> {
  const body = (await response.json().catch(() => undefined)) as EventSettingsErrorBody | undefined;
  return new EventSettingsApiError(
    body?.error?.code ?? "EVENT_SETTINGS_REQUEST_FAILED",
    body?.error?.message ?? "The event settings request could not be completed.",
    response.status,
    body?.error?.traceId,
    body?.error?.details,
  );
}

export function createEventSettingsApi(
  baseUrl: string,
  organizationId: string,
  fetcher: Fetcher = fetch,
): EventSettingsApi {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl.trim());
  const adminBaseUrl = `${normalizedBaseUrl}/api/admin/organizations/${segment(organizationId, "organization ID")}/events`;
  const normalizedOrganizationId = organizationId.trim();

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body !== undefined) headers.set("content-type", "application/json");
    const response = await fetcher(`${adminBaseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: Object.fromEntries(headers.entries()),
    });
    if (!response.ok) throw await toApiError(response);
    if (response.status === 204) return undefined as T;
    const body = (await response.json()) as { data: T };
    if (!body || !("data" in body))
      throw new EventSettingsApiError(
        "INVALID_RESPONSE",
        "The event settings response was invalid.",
        response.status,
      );
    return body.data;
  }

  function eventPath(eventId: string): string {
    return `/${segment(eventId, "event ID")}`;
  }

  function resourcePath(kind: EventSettingsResourceKind): string {
    return `${kind === "track" ? "tracks" : `${kind}s`}`;
  }

  async function listResource(
    eventId: string,
    kind: EventSettingsResourceKind,
    signal?: AbortSignal,
  ): Promise<readonly EventTaxonomyResource[]> {
    return request<readonly EventTaxonomyResource[]>(
      `${eventPath(eventId)}/sessions/${resourcePath(kind)}`,
      {
        cache: "no-store",
        ...(signal === undefined ? {} : { signal }),
      },
    );
  }

  const api: EventSettingsApi = {
    async getEventIdentity(eventId, signal) {
      const normalizedEventId = eventId.trim();
      const events = await request<readonly EventIdentity[]>("", {
        cache: "no-store",
        ...(signal === undefined ? {} : { signal }),
      });
      const event = events.find((candidate) => candidate.id === normalizedEventId);
      if (event === undefined) {
        throw new EventSettingsApiError(
          "EVENT_NOT_FOUND",
          "The selected event is no longer available.",
          404,
        );
      }
      return {
        id: event.id,
        name: event.name,
        slug: event.slug,
      };
    },
    getOverview(eventId, signal) {
      const path = eventPath(eventId);
      return Promise.all([
        request<SessionSettingsRecord>(`${path}/sessions/settings`, {
          cache: "no-store",
          ...(signal === undefined ? {} : { signal }),
        }),
        request<readonly EventRoom[]>(`${path}/sessions/rooms`, {
          cache: "no-store",
          ...(signal === undefined ? {} : { signal }),
        }),
        listResource(eventId, "track", signal),
        listResource(eventId, "format", signal),
        listResource(eventId, "level", signal),
        listResource(eventId, "tag", signal),
        request<readonly EventSettingsAuditEntry[]>(`${path}/sessions/audit`, {
          cache: "no-store",
          ...(signal === undefined ? {} : { signal }),
        }),
      ]).then(([settings, rooms, tracks, formats, levels, tags, audit]) => ({
        organizationId: normalizedOrganizationId,
        eventId: eventId.trim(),
        settings,
        rooms,
        tracks,
        formats,
        levels,
        tags,
        audit,
      }));
    },
    getWorkspace(eventId, signal) {
      return api.getOverview(eventId, signal);
    },
    getSettings(eventId, signal) {
      return request<SessionSettingsRecord>(`${eventPath(eventId)}/sessions/settings`, {
        cache: "no-store",
        ...(signal === undefined ? {} : { signal }),
      });
    },
    updateSettings(eventId, input) {
      const normalized = validateSettingsUpdate(input);
      return request<SessionSettingsRecord>(`${eventPath(eventId)}/sessions/settings`, {
        method: "PATCH",
        body: JSON.stringify(normalized),
      });
    },
    listRooms(eventId, signal) {
      return request<readonly EventRoom[]>(`${eventPath(eventId)}/sessions/rooms`, {
        cache: "no-store",
        ...(signal === undefined ? {} : { signal }),
      });
    },
    createRoom(eventId, input) {
      const normalized = validateRoomInput(input);
      return request<EventRoom>(`${eventPath(eventId)}/sessions/rooms`, {
        method: "POST",
        body: JSON.stringify(normalized),
      });
    },
    updateRoom(eventId, input) {
      const normalized = validateRoomInput({
        name: input.name ?? "Room",
        capacity: input.capacity ?? 1,
        ...(input.resources === undefined ? {} : { resources: input.resources }),
      });
      const expectedVersion = validateExpectedVersion(input.expectedVersion);
      return request<EventRoom>(
        `${eventPath(eventId)}/sessions/rooms/${segment(input.roomId, "room ID")}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            expectedVersion,
            ...(input.name === undefined ? {} : { name: normalized.name }),
            ...(input.capacity === undefined ? {} : { capacity: normalized.capacity }),
            ...(input.resources === undefined ? {} : { resources: normalized.resources }),
          }),
        },
      );
    },
    deleteRoom(eventId, roomId, expectedVersion) {
      return request<EventRoom>(
        `${eventPath(eventId)}/sessions/rooms/${segment(roomId, "room ID")}`,
        {
          method: "DELETE",
          body: JSON.stringify({ expectedVersion: validateExpectedVersion(expectedVersion) }),
        },
      );
    },
    listResources: listResource,
    listTracks(eventId, signal) {
      return listResource(eventId, "track", signal);
    },
    listFormats(eventId, signal) {
      return listResource(eventId, "format", signal);
    },
    listLevels(eventId, signal) {
      return listResource(eventId, "level", signal);
    },
    listTags(eventId, signal) {
      return listResource(eventId, "tag", signal);
    },
    createResource(eventId, kind, input) {
      return request<EventTaxonomyResource>(
        `${eventPath(eventId)}/sessions/${resourcePath(kind)}`,
        {
          method: "POST",
          body: JSON.stringify(validateTaxonomyInput(input)),
        },
      );
    },
    createTrack(eventId, input) {
      return api.createResource(eventId, "track", input);
    },
    createFormat(eventId, input) {
      return api.createResource(eventId, "format", input);
    },
    createLevel(eventId, input) {
      return api.createResource(eventId, "level", input);
    },
    createTag(eventId, input) {
      return api.createResource(eventId, "tag", input);
    },
    updateResource(eventId, kind, input) {
      const resourceId = segment(input.resourceId, `${kind} ID`);
      const expectedVersion = validateExpectedVersion(input.expectedVersion);
      const normalized = validateTaxonomyInput({
        name: input.name ?? "Resource",
        ...(input.description === undefined ? {} : { description: input.description }),
      });
      return request<EventTaxonomyResource>(
        `${eventPath(eventId)}/sessions/${resourcePath(kind)}/${resourceId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            expectedVersion,
            ...(input.name === undefined ? {} : { name: normalized.name }),
            ...(input.description === undefined ? {} : { description: normalized.description }),
          }),
        },
      );
    },
    updateTrack(eventId, input) {
      return api.updateResource(eventId, "track", input);
    },
    updateFormat(eventId, input) {
      return api.updateResource(eventId, "format", input);
    },
    updateLevel(eventId, input) {
      return api.updateResource(eventId, "level", input);
    },
    updateTag(eventId, input) {
      return api.updateResource(eventId, "tag", input);
    },
    deleteResource(eventId, kind, resourceId, expectedVersion) {
      return request<EventTaxonomyResource>(
        `${eventPath(eventId)}/sessions/${resourcePath(kind)}/${segment(resourceId, `${kind} ID`)}`,
        {
          method: "DELETE",
          body: JSON.stringify({ expectedVersion: validateExpectedVersion(expectedVersion) }),
        },
      );
    },
    deleteTrack(eventId, resourceId, expectedVersion) {
      return api.deleteResource(eventId, "track", resourceId, expectedVersion);
    },
    deleteFormat(eventId, resourceId, expectedVersion) {
      return api.deleteResource(eventId, "format", resourceId, expectedVersion);
    },
    deleteLevel(eventId, resourceId, expectedVersion) {
      return api.deleteResource(eventId, "level", resourceId, expectedVersion);
    },
    deleteTag(eventId, resourceId, expectedVersion) {
      return api.deleteResource(eventId, "tag", resourceId, expectedVersion);
    },
    listAudit(eventId, entityId, signal) {
      const suffix =
        entityId === undefined ? "" : `?entityId=${encodeURIComponent(entityId.trim())}`;
      return request<readonly EventSettingsAuditEntry[]>(
        `${eventPath(eventId)}/sessions/audit${suffix}`,
        {
          cache: "no-store",
          ...(signal === undefined ? {} : { signal }),
        },
      );
    },
  };
  return api;
}
