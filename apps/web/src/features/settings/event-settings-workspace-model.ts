import {
  defaultAgendaEligibleStatuses,
  defaultSessionStatuses,
  type EventSettingsApi,
  type EventSettingsData,
  type RoomInput,
  type SessionSettingsRecord,
} from "./api";
import { eventSettingsNavigationScopeKey } from "./event-settings-navigation-cache-model";
import { eventSettingsSections } from "./event-settings-sections";

function normalizedSettings(settings: SessionSettingsRecord): SessionSettingsRecord {
  return {
    ...settings,
    statuses: settings.statuses.length > 0 ? settings.statuses : [...defaultSessionStatuses],
    agendaEligibleStatuses:
      settings.agendaEligibleStatuses.length > 0
        ? settings.agendaEligibleStatuses
        : [...defaultAgendaEligibleStatuses],
  };
}

export function normalizeData(
  data: EventSettingsData,
  organizationId: string,
  eventId: string,
): EventSettingsData {
  if (data.organizationId && data.organizationId !== organizationId) {
    throw new TypeError("The settings response belongs to a different organization.");
  }
  if (data.eventId && data.eventId !== eventId) {
    throw new TypeError("The settings response belongs to a different event.");
  }
  return {
    ...data,
    organizationId,
    eventId,
    settings: normalizedSettings(data.settings),
    rooms: data.rooms ?? [],
    tracks: data.tracks ?? [],
    formats: data.formats ?? [],
    levels: data.levels ?? [],
    tags: data.tags ?? [],
    audit: data.audit ?? [],
  };
}

export function canCommitEventSettingsAsyncCompletion(
  requestId: number,
  currentRequestId: number,
  mounted: boolean,
  aborted = false,
): boolean {
  return mounted && !aborted && requestId === currentRequestId;
}

export async function loadEventSettingsProgressively(
  api: EventSettingsApi,
  organizationId: string,
  eventId: string,
  onCore: (data: EventSettingsData) => void,
  signal?: AbortSignal,
): Promise<EventSettingsData> {
  const corePromise = Promise.all([
    api.getSettings(eventId, signal),
    api.listRooms(eventId, signal),
  ]);
  const detailsResultPromise = Promise.all([
    api.listTracks(eventId, signal),
    api.listFormats(eventId, signal),
    api.listLevels(eventId, signal),
    api.listTags(eventId, signal),
    api.listAudit(eventId, undefined, signal),
  ]).then(
    ([tracks, formats, levels, tags, audit]) => ({
      status: "loaded" as const,
      tracks,
      formats,
      levels,
      tags,
      audit,
    }),
    (error: unknown) => ({ status: "error" as const, error }),
  );

  const [settings, rooms] = await corePromise;
  const core = normalizeData(
    {
      organizationId,
      eventId,
      settings,
      rooms,
      tracks: [],
      formats: [],
      levels: [],
      tags: [],
      audit: [],
    },
    organizationId,
    eventId,
  );
  onCore(core);

  const detailsResult = await detailsResultPromise;
  if (detailsResult.status === "error") throw detailsResult.error;
  return {
    ...core,
    tracks: detailsResult.tracks,
    formats: detailsResult.formats,
    levels: detailsResult.levels,
    tags: detailsResult.tags,
    audit: detailsResult.audit,
  };
}

export async function persistEventSettingsMutation(
  operation: () => Promise<void>,
  refresh: () => Promise<void>,
): Promise<"refreshed" | "refresh-failed"> {
  await operation();
  try {
    await refresh();
    return "refreshed";
  } catch {
    return "refresh-failed";
  }
}

export const eventSettingsSectionNavigation = eventSettingsSections;

export function parseRoomResources(value: string): { resources: string[]; error?: string } {
  if (value.trim() === "") return { resources: [] };
  const parts = value.split(",").map((part) => part.trim());
  if (parts.some((part) => part.length === 0))
    return { resources: [], error: "Resource names cannot be empty." };
  const seen = new Set<string>();
  for (const resource of parts) {
    const key = resource.toLowerCase();
    if (seen.has(key)) return { resources: [], error: "Resource names must be unique." };
    seen.add(key);
  }
  return { resources: parts };
}

export function validateRoomForm(
  name: string,
  capacity: string,
  resourcesText: string,
): { input?: RoomInput; error?: string } {
  const normalizedName = name.trim();
  if (!normalizedName) return { error: "Room name is required." };
  const parsedCapacity = Number(capacity);
  if (!Number.isSafeInteger(parsedCapacity) || parsedCapacity < 1 || parsedCapacity > 1_000_000)
    return { error: "Room capacity must be between 1 and 1000000." };
  const parsedResources = parseRoomResources(resourcesText);
  if (parsedResources.error) return { error: parsedResources.error };
  return {
    input: { name: normalizedName, capacity: parsedCapacity, resources: parsedResources.resources },
  };
}

export function eventSettingsWorkspaceScopeKey(organizationId: string, eventId: string): string {
  return eventSettingsNavigationScopeKey(organizationId, eventId);
}
