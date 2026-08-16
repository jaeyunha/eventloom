import { type AgendaApi, createAgendaApi } from "./api";
import { agendaDays, eventDates, formatLocalDate } from "./model";
import type { AgendaEntry, AgendaWorkspaceData } from "./types";

export interface AgendaSuggestionOptions {
  ignoreExistingTimes: boolean;
  ignoreExistingRooms: boolean;
}

export type ExistingSessionTimesSelection = "keep" | "move";

export function serializeAgendaSuggestionOptions(
  existingSessionTimes: ExistingSessionTimesSelection,
  ignoreExistingRooms: boolean,
): AgendaSuggestionOptions {
  return {
    ignoreExistingTimes: existingSessionTimes === "move",
    ignoreExistingRooms,
  };
}

export type AgendaViewMode = "list" | "day" | "week" | "track" | "room";

export const AGENDA_VIEW_MODES: readonly AgendaViewMode[] = [
  "day",
  "week",
  "list",
  "track",
  "room",
];

export const agendaViewLabels: Record<AgendaViewMode, string> = {
  list: "List",
  day: "Timetable",
  week: "All days",
  track: "Tracks",
  room: "Rooms",
};

export interface AgendaViewGroup {
  id: string;
  label: string;
  entries: readonly AgendaEntry[];
  emptyMessage: string;
}

function compareAgendaEntries(left: AgendaEntry, right: AgendaEntry): number {
  const startOrder = left.startsAtLocal.localeCompare(right.startsAtLocal);
  if (startOrder !== 0) return startOrder;
  const endOrder = left.endsAtLocal.localeCompare(right.endsAtLocal);
  if (endOrder !== 0) return endOrder;
  const roomOrder = left.roomName.localeCompare(right.roomName);
  if (roomOrder !== 0) return roomOrder;
  const titleOrder = left.title.localeCompare(right.title);
  return titleOrder === 0 ? left.id.localeCompare(right.id) : titleOrder;
}

function sortedAgendaEntries(entries: readonly AgendaEntry[]): readonly AgendaEntry[] {
  return [...entries].sort(compareAgendaEntries);
}

export function scheduleDate(entry: AgendaEntry): string {
  return entry.startsAtLocal.slice(0, 10);
}

export function formatScheduleDate(date: string): string {
  return formatLocalDate(`${date}T12:00`);
}

export function safeScheduleId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function scheduleDates(data: AgendaWorkspaceData): readonly string[] {
  return eventDates(data.event.startsOn, data.event.endsOn);
}

export function deriveAgendaViewGroups(
  data: AgendaWorkspaceData,
  mode: AgendaViewMode,
): readonly AgendaViewGroup[] {
  const entries = sortedAgendaEntries(data.draft.entries);
  if (mode === "list") {
    return [
      {
        id: "list",
        label: "All scheduled sessions",
        entries,
        emptyMessage: "No sessions scheduled yet.",
      },
    ];
  }

  if (mode === "day") {
    return agendaDays(entries, data.event).map((day) => ({
      id: day.date,
      label: day.label,
      entries: day.entries,
      emptyMessage: "No sessions scheduled on this day.",
    }));
  }

  if (mode === "week") {
    const entriesByDate = new Map<string, AgendaEntry[]>();
    for (const entry of entries) {
      const dateEntries = entriesByDate.get(scheduleDate(entry)) ?? [];
      dateEntries.push(entry);
      entriesByDate.set(scheduleDate(entry), dateEntries);
    }
    return scheduleDates(data).map((date) => ({
      id: `week-${date}`,
      label: formatScheduleDate(date),
      entries: entriesByDate.get(date) ?? [],
      emptyMessage: "No sessions scheduled on this day.",
    }));
  }

  if (mode === "track") {
    const knownTrackIds = new Set(data.tracks.map((track) => track.id));
    const groups = [...data.tracks]
      .sort((left, right) => {
        const nameOrder = left.name.localeCompare(right.name);
        return nameOrder === 0 ? left.id.localeCompare(right.id) : nameOrder;
      })
      .map((track) => ({
        id: `track-${track.id}`,
        label: track.name,
        entries: entries.filter((entry) => entry.trackIds.includes(track.id)),
        emptyMessage: "No sessions scheduled in this track.",
      }));
    const unassigned = entries.filter(
      (entry) => !entry.trackIds.some((trackId) => knownTrackIds.has(trackId)),
    );
    if (groups.length === 0 || unassigned.length > 0) {
      groups.push({
        id: "track-unassigned",
        label: "Unassigned track",
        entries: unassigned,
        emptyMessage: "No sessions without a track.",
      });
    }
    return groups;
  }

  const knownRoomIds = new Set(data.rooms.map((room) => room.id));
  const groups = [...data.rooms]
    .sort((left, right) => {
      const nameOrder = left.name.localeCompare(right.name);
      return nameOrder === 0 ? left.id.localeCompare(right.id) : nameOrder;
    })
    .map((room) => ({
      id: `room-${room.id}`,
      label: room.name,
      entries: entries.filter((entry) => entry.roomId === room.id),
      emptyMessage: "No sessions scheduled in this room.",
    }));
  const unassigned = entries.filter((entry) => !knownRoomIds.has(entry.roomId));
  if (groups.length === 0 || unassigned.length > 0) {
    groups.push({
      id: "room-unassigned",
      label: "Unassigned room",
      entries: unassigned,
      emptyMessage: "No sessions without a room.",
    });
  }
  return groups;
}

export interface AgendaWorkspaceLoadResult {
  readonly api: AgendaApi;
  readonly data: AgendaWorkspaceData;
}

export function createCanonicalAgendaWorkspaceApi(
  organizationId: string,
  providedApi?: AgendaApi,
): AgendaApi {
  return providedApi ?? createAgendaApi("", organizationId);
}

export async function loadCanonicalAgendaWorkspace(
  api: AgendaApi,
  eventId: string,
  signal?: AbortSignal,
): Promise<AgendaWorkspaceLoadResult> {
  return { api, data: await api.getWorkspace(eventId, signal) };
}

export interface AgendaAsyncScopeToken {
  readonly scopeKey: string;
  readonly generation: number;
}

export function agendaWorkspaceScopeKey(organizationId: string, eventId: string): string {
  return `${organizationId}\u0000${eventId}`;
}

export function isAgendaAsyncScopeTokenCurrent(
  token: AgendaAsyncScopeToken,
  scopeKey: string,
  generation: number,
): boolean {
  return token.scopeKey === scopeKey && token.generation === generation;
}

export function canCommitAgendaAsyncCompletion(
  token: AgendaAsyncScopeToken,
  scopeKey: string,
  generation: number,
  mounted: boolean,
  aborted = false,
): boolean {
  return mounted && !aborted && isAgendaAsyncScopeTokenCurrent(token, scopeKey, generation);
}

export function agendaWorkspaceDataMatchesEvent(
  data: AgendaWorkspaceData,
  eventId: string,
): boolean {
  return data.event.id === eventId;
}
