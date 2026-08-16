import type { NavigationDataCache } from "@/lib/navigation-data-cache";
import { type AgendaApi, createAgendaApi } from "./api";
import { agendaDays, eventDates, formatLocalDate } from "./model";
import type {
  AgendaCalendarDeliveryState,
  AgendaEntry,
  AgendaEntryInput,
  AgendaPreview,
  AgendaSession,
  AgendaTrack,
  AgendaValidationReport,
  AgendaWorkspaceData,
} from "./types";

export interface AgendaSuggestionOptions {
  ignoreExistingTimes: boolean;
  ignoreExistingRooms: boolean;
}

export type AgendaCandidateDiagnostics = AgendaValidationReport;

export interface AgendaSuggestionChangeView {
  id: string;
  kind: "add" | "move" | "change" | "remove";
  entryId: string;
  sessionId: string;
  summary: string;
}

export interface AgendaSuggestionRunView {
  id: string;
  version: number;
  status: "pending" | "rejected" | "superseded" | "applied" | "stale";
  baseDraftVersion: number;
  diff: {
    summary: string;
    changes: readonly AgendaSuggestionChangeView[];
  };
  candidateDiagnostics?: AgendaCandidateDiagnostics;
  acceptedChangeIds?: readonly string[];
}

export type AgendaBusyOperation =
  | "save"
  | "remove"
  | "validate"
  | "override-warning"
  | "publish"
  | "generate-suggestion"
  | "regenerate-suggestion"
  | "reject-suggestion"
  | "apply-suggestion"
  | "retry-calendar-delivery";

export interface AgendaSuggestionApi {
  generateSuggestion(input: {
    eventId: string;
    baseDraftVersion: number;
    dates: readonly string[];
    eligibleStatuses: readonly string[];
    roomIds: readonly string[];
    dayWindows: readonly { date: string; startLocal: string; endLocal: string }[];
    orderedRules: readonly string[];
    ignoreExistingTimes: boolean;
    ignoreExistingRooms: boolean;
  }): Promise<AgendaSuggestionRunView>;
  regenerateSuggestion(input: {
    eventId: string;
    runId: string;
    baseDraftVersion: number;
  }): Promise<AgendaSuggestionRunView>;
  rejectSuggestion(input: { eventId: string; runId: string }): Promise<AgendaSuggestionRunView>;
  applySuggestion(input: {
    eventId: string;
    runId: string;
    acceptedChangeIds: readonly string[];
  }): Promise<AgendaWorkspaceData>;
}

export function messageFrom(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "The agenda request could not be completed.";
}

export function suggestionApiFor(api: AgendaApi | null): AgendaSuggestionApi | null {
  if (api === null) return null;
  const candidate = api as AgendaApi & Partial<AgendaSuggestionApi>;
  return typeof candidate.generateSuggestion === "function" &&
    typeof candidate.regenerateSuggestion === "function" &&
    typeof candidate.rejectSuggestion === "function" &&
    typeof candidate.applySuggestion === "function"
    ? (candidate as AgendaSuggestionApi)
    : null;
}

export interface EntryFormProps {
  entry?: AgendaEntry;
  sessions: readonly AgendaSession[];
  rooms: AgendaWorkspaceData["rooms"];
  tracks: readonly AgendaTrack[];
  eventStart: string;
  busy: boolean;
  initialPlacement?: import("./agenda-timetable").AgendaTimetablePlacement;
  initialSessionId?: string;
  onSubmit(entry: AgendaEntryInput): Promise<void>;
  onCancel?: () => void;
  onCreateRoom?: (input: {
    name: string;
    capacity: number;
  }) => Promise<AgendaWorkspaceData["rooms"][number] | null>;
  onCreateTrack?: (input: { name: string }) => Promise<AgendaTrack | null>;
}

export type EntryFormState = {
  sessionId: string;
  roomId: string;
  trackIds: readonly string[];
  startsAtLocal: string;
  endsAtLocal: string;
};

export type EntryFormAction =
  | { type: "session-changed"; sessionId: string }
  | { type: "room-changed"; roomId: string }
  | { type: "track-toggled"; trackId: string }
  | { type: "track-added"; trackId: string }
  | { type: "starts-at-changed"; startsAtLocal: string }
  | { type: "ends-at-changed"; endsAtLocal: string };

export function entryFormReducer(state: EntryFormState, action: EntryFormAction): EntryFormState {
  switch (action.type) {
    case "session-changed":
      return { ...state, sessionId: action.sessionId };
    case "room-changed":
      return { ...state, roomId: action.roomId };
    case "track-toggled":
      return {
        ...state,
        trackIds: state.trackIds.includes(action.trackId)
          ? state.trackIds.filter((trackId) => trackId !== action.trackId)
          : [...state.trackIds, action.trackId],
      };
    case "track-added":
      return state.trackIds.includes(action.trackId)
        ? state
        : { ...state, trackIds: [...state.trackIds, action.trackId] };
    case "starts-at-changed":
      return { ...state, startsAtLocal: action.startsAtLocal };
    case "ends-at-changed":
      return { ...state, endsAtLocal: action.endsAtLocal };
  }
}

export interface AgendaBoardProps {
  organizationId: string;
  data: AgendaWorkspaceData;
  preview: AgendaPreview | null;
  busy: boolean;
  busyOperation?: AgendaBusyOperation | null;
  statusMessage: string | null;
  error: string | null;
  initialView?: AgendaViewMode;
  suggestionRun?: AgendaSuggestionRunView | null;
  onSaveEntry(entry: AgendaEntryInput): Promise<boolean | undefined>;
  onRemoveEntry(entryId: string): Promise<boolean | undefined>;
  onPreview(): Promise<void>;
  onOverrideWarning(warningId: string, reason: string): Promise<boolean | undefined>;
  onPublish(): Promise<boolean | undefined>;
  onDismissError(): void;
  onGenerateSuggestion?: (options: AgendaSuggestionOptions) => Promise<void>;
  onRegenerateSuggestion?: () => Promise<void>;
  onRejectSuggestion?: () => Promise<void>;
  onApplySuggestion?: (changeIds: readonly string[]) => Promise<void>;
  onCreateRoom?: (input: {
    name: string;
    capacity: number;
  }) => Promise<AgendaWorkspaceData["rooms"][number] | null>;
  onCreateTrack?: (input: { name: string }) => Promise<AgendaTrack | null>;
  calendarDelivery?: AgendaCalendarDeliveryState | null;
  onRetryCalendarDelivery?: () => Promise<void>;
}

export interface AgendaSuggestionPanelProps {
  run: AgendaSuggestionRunView | null;
  currentDraftVersion: number;
  busy: boolean;
  busyOperation?: AgendaBusyOperation | null;
  eligibleUnscheduledCount: number;
  selectedChangeIds: readonly string[];
  onSelectionChange: (changeIds: readonly string[]) => void;
  onGenerate: ((options: AgendaSuggestionOptions) => Promise<void>) | undefined;
  onRegenerate: (() => Promise<void>) | undefined;
  onReject: (() => Promise<void>) | undefined;
  onApply: ((changeIds: readonly string[]) => Promise<void>) | undefined;
}

export interface AgendaWorkspaceProps {
  eventId: string;
  organizationId: string;
  api?: AgendaApi;
}

export interface ScopedAgendaSnapshot {
  readonly scopeKey: string;
  readonly api: AgendaApi;
  readonly data: AgendaWorkspaceData;
}

export interface ScopedAgendaWorkspaceProps extends AgendaWorkspaceProps {
  readonly scopeKey: string;
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
  return data.event.scheduleDates?.length
    ? data.event.scheduleDates
    : eventDates(data.event.startsOn, data.event.endsOn);
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

export function agendaWorkspaceCacheKey(organizationId: string, eventId: string): string {
  return `agenda:workspace:${organizationId.trim()}:${eventId.trim()}`;
}

export function agendaWorkspaceCacheTags(
  organizationId: string,
  eventId: string,
): readonly string[] {
  const normalizedOrganizationId = organizationId.trim();
  const normalizedEventId = eventId.trim();
  return [
    `organization:${normalizedOrganizationId}`,
    `event:${normalizedEventId}`,
    `agenda:${normalizedEventId}`,
  ];
}

function agendaWorkspaceAbortedError(): DOMException {
  return new DOMException("The agenda request was aborted.", "AbortError");
}

export async function loadCanonicalAgendaWorkspaceWithCache(
  api: AgendaApi,
  eventId: string,
  cache: NavigationDataCache | null,
  key: string,
  tags: readonly string[],
  signal?: AbortSignal,
  fresh = false,
): Promise<AgendaWorkspaceLoadResult> {
  const load = async (requestSignal?: AbortSignal): Promise<AgendaWorkspaceData> => {
    const loaded = await loadCanonicalAgendaWorkspace(api, eventId, requestSignal);
    if (requestSignal?.aborted) throw agendaWorkspaceAbortedError();
    if (!agendaWorkspaceDataMatchesEvent(loaded.data, eventId)) {
      throw new Error("The agenda response belongs to another event.");
    }
    return loaded.data;
  };
  const data =
    cache === null
      ? await load(signal)
      : await cache.read({ key, tags, load: () => load(), fresh });
  if (!agendaWorkspaceDataMatchesEvent(data, eventId)) {
    throw new Error("The agenda response belongs to another event.");
  }
  return { api, data };
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
