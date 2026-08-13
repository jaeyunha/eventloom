"use client";

import { CheckCircle2 } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  StatusBadge,
  WorkspaceBreadcrumb,
  WorkspaceHeader,
  WorkspaceMetaItem,
} from "@/components/workspace/workspace-ui";
import {
  createScopedReadFlightCoordinator,
  type ScopedReadFlightCoordinator,
} from "@/lib/scoped-read-flight";
import styles from "./agenda-workspace.module.css";
import { type AgendaApi, AgendaApiError, createAgendaApi } from "./api";
import {
  createLocalAgendaDemoApi,
  loadAgendaWorkspace,
  resolveAgendaAppEnvironment,
} from "./demo/agenda-demo-api";
import {
  agendaDays,
  conflictsForEntry,
  eventDates,
  formatLocalDate,
  formatLocalTime,
  formatRevisionTimestamp,
  publicationReadiness,
  warningsForEntry,
} from "./model";
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

function messageFrom(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "The agenda request could not be completed.";
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
interface AgendaSuggestionApi {
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

function suggestionApiFor(api: AgendaApi | null): AgendaSuggestionApi | null {
  if (api === null) return null;
  const candidate = api as AgendaApi & Partial<AgendaSuggestionApi>;
  return typeof candidate.generateSuggestion === "function" &&
    typeof candidate.regenerateSuggestion === "function" &&
    typeof candidate.rejectSuggestion === "function" &&
    typeof candidate.applySuggestion === "function"
    ? (candidate as AgendaSuggestionApi)
    : null;
}

interface EntryFormProps {
  entry?: AgendaEntry;
  sessions: readonly AgendaSession[];
  rooms: AgendaWorkspaceData["rooms"];
  tracks: readonly AgendaTrack[];
  eventStart: string;
  busy: boolean;
  initialSessionId?: string;
  onSubmit(entry: AgendaEntryInput): Promise<void>;
  onCancel?: () => void;
  onCreateRoom?: (input: {
    name: string;
    capacity: number;
  }) => Promise<AgendaWorkspaceData["rooms"][number] | null>;
  onCreateTrack?: (input: { name: string }) => Promise<AgendaTrack | null>;
}

function EntryForm({
  entry,
  sessions,
  rooms,
  tracks,
  eventStart,
  busy,
  initialSessionId,
  onSubmit,
  onCancel,
  onCreateRoom,
  onCreateTrack,
}: EntryFormProps) {
  const firstSession = entry?.sessionId ?? initialSessionId ?? sessions[0]?.id ?? "";
  const [sessionId, setSessionId] = useState(firstSession);
  const [roomId, setRoomId] = useState(entry?.roomId ?? rooms[0]?.id ?? "");
  const [trackIds, setTrackIds] = useState<readonly string[]>(
    entry?.trackIds ?? (tracks[0] ? [tracks[0].id] : []),
  );
  const [startsAtLocal, setStartsAtLocal] = useState(entry?.startsAtLocal ?? `${eventStart}T09:00`);
  const [endsAtLocal, setEndsAtLocal] = useState(entry?.endsAtLocal ?? `${eventStart}T10:00`);
  const [formError, setFormError] = useState<string | null>(null);
  const [roomCreatorOpen, setRoomCreatorOpen] = useState(false);
  const [trackCreatorOpen, setTrackCreatorOpen] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [roomCapacity, setRoomCapacity] = useState("");
  const [trackName, setTrackName] = useState("");
  useEffect(() => {
    if (!entry && initialSessionId) setSessionId(initialSessionId);
  }, [entry, initialSessionId]);

  function toggleTrack(trackId: string) {
    setTrackIds((current) =>
      current.includes(trackId)
        ? current.filter((candidate) => candidate !== trackId)
        : [...current, trackId],
    );
  }

  async function createRoom() {
    if (!onCreateRoom) return;
    const name = roomName.trim();
    const capacity = Number(roomCapacity);
    if (!name || !Number.isFinite(capacity) || capacity < 1) {
      setFormError("Enter a room name and capacity of at least 1.");
      return;
    }
    const room = await onCreateRoom({ name, capacity });
    if (room) {
      setRoomId(room.id);
      setRoomName("");
      setRoomCapacity("");
      setRoomCreatorOpen(false);
      setFormError(null);
    }
  }

  async function createTrack() {
    if (!onCreateTrack) return;
    const name = trackName.trim();
    if (!name) {
      setFormError("Enter a track name.");
      return;
    }
    const track = await onCreateTrack({ name });
    if (track) {
      setTrackIds((current) => (current.includes(track.id) ? current : [...current, track.id]));
      setTrackName("");
      setTrackCreatorOpen(false);
      setFormError(null);
    }
  }
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!sessionId || !roomId) {
      setFormError("Choose an accepted session and room.");
      return;
    }
    if (endsAtLocal <= startsAtLocal) {
      setFormError("End time must be after start time.");
      return;
    }
    setFormError(null);
    await onSubmit({
      ...(entry ? { id: entry.id } : {}),
      sessionId,
      roomId,
      trackIds,
      startsAtLocal,
      endsAtLocal,
    });
  }

  return (
    <form className={styles.entryForm} onSubmit={(event) => void submit(event)}>
      {entry ? (
        <div className={styles.fixedSession}>
          <span>Session</span>
          <strong>{entry.title}</strong>
        </div>
      ) : (
        <label>
          <span>Accepted session</span>
          <select value={sessionId} onChange={(event) => setSessionId(event.target.value)}>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.title} · {session.format} ·{" "}
                {session.speakerNames.length > 0
                  ? session.speakerNames.join(", ")
                  : "No speakers listed"}{" "}
                ({session.durationMinutes} min)
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        <span>Room</span>
        <select value={roomId} onChange={(event) => setRoomId(event.target.value)}>
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name} ({room.capacity} seats)
            </option>
          ))}
        </select>
      </label>
      {onCreateRoom ? (
        <div className={styles.inlineCreate}>
          <button
            className={styles.textButton}
            type="button"
            onClick={() => setRoomCreatorOpen((open) => !open)}
            aria-expanded={roomCreatorOpen}
          >
            {roomCreatorOpen ? "Cancel new room" : "Create room"}
          </button>
          {roomCreatorOpen ? (
            <div className={styles.inlineCreateFields}>
              <label>
                <span>Room name</span>
                <input value={roomName} onChange={(event) => setRoomName(event.target.value)} />
              </label>
              <label>
                <span>Capacity</span>
                <input
                  type="number"
                  min={1}
                  value={roomCapacity}
                  onChange={(event) => setRoomCapacity(event.target.value)}
                />
              </label>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => void createRoom()}
              >
                Save room
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <fieldset className={styles.trackOptions}>
        <legend>Tracks</legend>
        {tracks.map((track) => (
          <label key={track.id}>
            <input
              type="checkbox"
              checked={trackIds.includes(track.id)}
              onChange={() => toggleTrack(track.id)}
            />
            <span style={{ "--track-color": track.color } as React.CSSProperties}>
              {track.name}
            </span>
          </label>
        ))}
      </fieldset>
      {onCreateTrack ? (
        <div className={styles.inlineCreate}>
          <button
            className={styles.textButton}
            type="button"
            onClick={() => setTrackCreatorOpen((open) => !open)}
            aria-expanded={trackCreatorOpen}
          >
            {trackCreatorOpen ? "Cancel new track" : "Create track"}
          </button>
          {trackCreatorOpen ? (
            <div className={styles.inlineCreateFields}>
              <label>
                <span>Track name</span>
                <input value={trackName} onChange={(event) => setTrackName(event.target.value)} />
              </label>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => void createTrack()}
              >
                Save track
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={styles.timeFields}>
        <label>
          <span>Starts</span>
          <input
            type="datetime-local"
            value={startsAtLocal}
            onChange={(event) => setStartsAtLocal(event.target.value)}
          />
        </label>
        <label>
          <span>Ends</span>
          <input
            type="datetime-local"
            value={endsAtLocal}
            onChange={(event) => setEndsAtLocal(event.target.value)}
          />
        </label>
      </div>
      {formError ? <p className={styles.formError}>{formError}</p> : null}
      <div className={styles.formActions}>
        {onCancel ? (
          <button className={styles.secondaryButton} type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button className={styles.primaryButton} type="submit" disabled={busy}>
          {busy ? "Saving..." : entry ? "Save changes" : "Add to draft"}
        </button>
      </div>
    </form>
  );
}

export type AgendaViewMode = "list" | "day" | "week" | "track" | "room";

export const AGENDA_VIEW_MODES: readonly AgendaViewMode[] = [
  "list",
  "day",
  "week",
  "track",
  "room",
];

const agendaViewLabels: Record<AgendaViewMode, string> = {
  list: "List",
  day: "Day",
  week: "Week",
  track: "Track",
  room: "Room",
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

function scheduleDate(entry: AgendaEntry): string {
  return entry.startsAtLocal.slice(0, 10);
}

function formatScheduleDate(date: string): string {
  return formatLocalDate(`${date}T12:00`);
}

function formatCompactScheduleDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function safeScheduleId(value: string): string {
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

interface AgendaBoardProps {
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

export function AgendaBoard({
  organizationId,
  data,
  preview,
  busy,
  busyOperation = null,
  statusMessage,
  error,
  initialView = "day",
  suggestionRun,
  onSaveEntry,
  onRemoveEntry,
  onPreview,
  onOverrideWarning,
  onPublish,
  onDismissError,
  onGenerateSuggestion,
  onRegenerateSuggestion,
  onRejectSuggestion,
  onApplySuggestion,
  onCreateRoom,
  onCreateTrack,
  calendarDelivery,
  onRetryCalendarDelivery,
}: AgendaBoardProps) {
  const readiness = publicationReadiness(data, preview);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [placementSessionId, setPlacementSessionId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<AgendaViewMode>(initialView);
  const { startsOn, endsOn } = data.event;
  const eventDays = useMemo(
    () => agendaDays(data.draft.entries, { startsOn, endsOn }),
    [data.draft.entries, endsOn, startsOn],
  );
  const [selectedDay, setSelectedDay] = useState(() => eventDays[0]?.date ?? "");
  const [selectedSuggestionChanges, setSelectedSuggestionChanges] = useState<readonly string[]>([]);
  const viewTabRefs = useRef<Partial<Record<AgendaViewMode, HTMLButtonElement | null>>>({});
  const dateRailRef = useRef<HTMLElement | null>(null);
  const currentRevision = data.currentPublishedRevision;
  const isBusyFor = (operation: AgendaBusyOperation): boolean =>
    busy && (busyOperation === undefined || busyOperation === null || busyOperation === operation);
  const settingsHref = `/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(data.event.id)}/settings`;
  const hasRooms = data.rooms.length > 0;

  useEffect(() => {
    const suggestionId = suggestionRun?.id;
    if (suggestionId || suggestionRun === null || suggestionRun === undefined) {
      setSelectedSuggestionChanges([]);
    }
  }, [suggestionRun]);
  useEffect(() => {
    if (!eventDays.some((day) => day.date === selectedDay)) {
      setSelectedDay(eventDays[0]?.date ?? "");
    }
  }, [eventDays, selectedDay]);
  useEffect(() => {
    if (viewMode !== "day") return;
    dateRailRef.current
      ?.querySelector<HTMLElement>(`[data-date="${safeScheduleId(selectedDay)}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedDay, viewMode]);

  function selectView(nextView: AgendaViewMode) {
    setViewMode(nextView);
  }

  function moveView(event: React.KeyboardEvent<HTMLButtonElement>, currentView: AgendaViewMode) {
    const currentIndex = AGENDA_VIEW_MODES.indexOf(currentView);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % AGENDA_VIEW_MODES.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + AGENDA_VIEW_MODES.length) % AGENDA_VIEW_MODES.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = AGENDA_VIEW_MODES.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const nextView = AGENDA_VIEW_MODES[nextIndex];
    if (!nextView) return;
    setViewMode(nextView);
    viewTabRefs.current[nextView]?.focus();
  }

  function renderEntryCard(entry: AgendaEntry, key: string, showDate = false): React.ReactNode {
    const entryConflicts = conflictsForEntry(entry.id, preview?.conflicts ?? []);
    const entryReleaseConflicts = conflictsForEntry(entry.id, preview?.releaseConflicts ?? []);
    const entryWarnings = warningsForEntry(entry.id, preview?.warnings ?? []);
    const hasIssues =
      entryConflicts.length + entryReleaseConflicts.length + entryWarnings.length > 0;
    const editExpanded = viewMode === "day" && editingEntryId === entry.id;
    return (
      <li key={key}>
        <article
          className={`${styles.sessionCard} ${hasIssues ? styles.sessionIssue : ""}`}
          style={
            {
              "--session-accent":
                data.tracks.find((track) => entry.trackIds.includes(track.id))?.color ??
                "var(--color-border-strong)",
            } as React.CSSProperties
          }
        >
          <div className={styles.sessionTime}>
            {showDate ? (
              <time className={styles.entryDate} dateTime={scheduleDate(entry)}>
                {formatScheduleDate(scheduleDate(entry))}
              </time>
            ) : null}
            <time dateTime={entry.startsAtLocal}>{formatLocalTime(entry.startsAtLocal)}</time>
            <span aria-hidden="true">–</span>
            <time dateTime={entry.endsAtLocal}>{formatLocalTime(entry.endsAtLocal)}</time>
          </div>
          <div className={styles.sessionDetails}>
            <div className={styles.sessionMeta}>
              <span>{entry.format}</span>
              {entry.trackNames.map((track) => (
                <span key={track}>{track}</span>
              ))}
            </div>
            <h4>{entry.title}</h4>
            <p>{entry.speakerNames.join(", ")}</p>
            <p className={styles.roomName}>{entry.roomName}</p>
            {entryConflicts.map((conflict) => (
              <p className={styles.inlineConflict} key={conflict.id}>
                Hard conflict: {conflict.message}
              </p>
            ))}
            {entryReleaseConflicts.map((conflict) => (
              <p className={styles.inlineConflict} key={conflict.id}>
                Released commitment conflict: {conflict.message}
              </p>
            ))}
            {entryWarnings.map((warning) => (
              <p className={styles.inlineWarning} key={warning.id}>
                Warning: {warning.message}
              </p>
            ))}
          </div>
          <div className={styles.cardActions}>
            <button
              type="button"
              className={styles.textButton}
              onClick={() => {
                if (viewMode !== "day") {
                  setViewMode("day");
                  setEditingEntryId(entry.id);
                  const entryDay = eventDays.find((day) => day.date === scheduleDate(entry));
                  if (entryDay) setSelectedDay(entryDay.date);
                } else {
                  setEditingEntryId((current) => (current === entry.id ? null : entry.id));
                }
              }}
              aria-expanded={editExpanded}
              aria-controls={`edit-${entry.id}`}
            >
              Edit
            </button>
            <button
              type="button"
              className={styles.dangerButton}
              disabled={busy}
              onClick={() => void onRemoveEntry(entry.id)}
            >
              Remove
            </button>
          </div>
        </article>
        {editExpanded ? (
          <div id={`edit-${entry.id}`} className={styles.editPanel}>
            <EntryForm
              entry={entry}
              sessions={[]}
              rooms={data.rooms}
              tracks={data.tracks}
              eventStart={data.event.startsOn}
              busy={busy}
              onCancel={() => setEditingEntryId(null)}
              {...(onCreateRoom === undefined ? {} : { onCreateRoom })}
              {...(onCreateTrack === undefined ? {} : { onCreateTrack })}
              onSubmit={async (input) => {
                const saved = await onSaveEntry(input);
                if (saved !== false) setEditingEntryId(null);
              }}
            />
          </div>
        ) : null}
      </li>
    );
  }

  function renderGroup(group: AgendaViewGroup, showDate = false) {
    const headingId = `agenda-group-${safeScheduleId(group.id)}`;
    return (
      <section
        key={group.id}
        className={`${styles.day} ${styles.viewGroup}`}
        aria-labelledby={headingId}
      >
        <header className={styles.viewGroupHeader}>
          <h3 id={headingId}>{group.label}</h3>
          <span>
            {group.entries.length} session{group.entries.length === 1 ? "" : "s"}
          </span>
        </header>
        {group.entries.length === 0 ? (
          <p className={styles.viewGroupEmpty}>{group.emptyMessage}</p>
        ) : (
          <ol className={styles.sessionList}>
            {group.entries.map((entry) =>
              renderEntryCard(entry, `${group.id}-${entry.id}`, showDate),
            )}
          </ol>
        )}
      </section>
    );
  }

  function renderUnscheduledGroup() {
    const sessions = [...data.unscheduledSessions].sort((left, right) => {
      const titleOrder = left.title.localeCompare(right.title);
      return titleOrder === 0 ? left.id.localeCompare(right.id) : titleOrder;
    });
    return (
      <section className={styles.unscheduledGroup} aria-labelledby="agenda-unscheduled-heading">
        <header className={styles.viewGroupHeader}>
          <div>
            <p className={styles.eyebrow}>Placement queue</p>
            <h3 id="agenda-unscheduled-heading">Sessions to place</h3>
          </div>
          <span>
            {sessions.length} session{sessions.length === 1 ? "" : "s"}
          </span>
        </header>
        <p className={styles.viewContext}>
          {sessions.length === 0
            ? "No accepted sessions are waiting for a time and room."
            : "Accepted sessions waiting for a time and room."}
        </p>
        {sessions.length === 0 ? (
          <p className={styles.emptyPool}>No unscheduled accepted sessions.</p>
        ) : (
          <ul className={styles.unscheduledList}>
            {sessions.map((session) => (
              <li
                className={styles.unscheduledItem}
                key={session.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", session.id);
                  event.dataTransfer.effectAllowed = "move";
                }}
              >
                <strong>{session.title}</strong>
                <span>
                  {session.format} · {session.durationMinutes} minutes ·{" "}
                  {session.speakerNames.join(", ")}
                </span>
                <button
                  className={styles.textButton}
                  type="button"
                  onClick={() => {
                    setPlacementSessionId(session.id);
                    setShowAddForm(true);
                  }}
                >
                  Choose time and room
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  function renderDayNavigation(groups: readonly AgendaViewGroup[]) {
    const currentIndex = groups.findIndex((group) => group.id === selectedDay);
    const activeIndex = currentIndex >= 0 ? currentIndex : 0;
    const currentGroup = groups[activeIndex];
    const previousGroup = groups[activeIndex - 1];
    const nextGroup = groups[activeIndex + 1];

    return (
      <nav className={styles.dayPager} aria-label="Event day navigation">
        <span className={styles.viewLabel}>Event days</span>
        <div className={styles.dayPagerControls}>
          <button
            className={styles.secondaryButton}
            type="button"
            disabled={previousGroup === undefined}
            onClick={() => {
              if (previousGroup) setSelectedDay(previousGroup.id);
            }}
          >
            Previous day
          </button>
          <p className={styles.dayPagerCurrent} aria-live="polite">
            {currentGroup
              ? `${currentGroup.label} · Day ${activeIndex + 1} of ${groups.length}`
              : "No event days available"}
          </p>
          <button
            className={styles.secondaryButton}
            type="button"
            disabled={nextGroup === undefined}
            onClick={() => {
              if (nextGroup) setSelectedDay(nextGroup.id);
            }}
          >
            Next day
          </button>
        </div>
        {groups.length > 1 ? (
          <nav ref={dateRailRef} className={styles.dateRail} aria-label="Choose an event day">
            {groups.map((group, index) => (
              <button
                key={group.id}
                className={styles.dateRailItem}
                type="button"
                data-date={safeScheduleId(group.id)}
                aria-current={group.id === currentGroup?.id ? "date" : undefined}
                onClick={() => setSelectedDay(group.id)}
              >
                <span>Day {index + 1}</span>
                <strong>{formatCompactScheduleDate(group.id)}</strong>
                <small>
                  {group.entries.length} {group.entries.length === 1 ? "session" : "sessions"}
                </small>
              </button>
            ))}
          </nav>
        ) : null}
      </nav>
    );
  }

  function renderScheduleView() {
    const groups = deriveAgendaViewGroups(data, viewMode);
    if (viewMode === "list") {
      const entries = groups[0]?.entries ?? [];
      return (
        <>
          {entries.length === 0 ? (
            <div className={styles.emptySchedule}>
              <strong>No sessions scheduled yet</strong>
              <p>Add an accepted session to begin the private agenda draft.</p>
            </div>
          ) : (
            <section aria-labelledby="agenda-list-heading">
              <header className={styles.viewGroupHeader}>
                <h3 id="agenda-list-heading">All scheduled sessions</h3>
                <span>
                  {entries.length} session{entries.length === 1 ? "" : "s"}
                </span>
              </header>
              <ol className={styles.sessionList}>
                {entries.map((entry) => renderEntryCard(entry, `list-${entry.id}`, true))}
              </ol>
            </section>
          )}
          {renderUnscheduledGroup()}
        </>
      );
    }

    if (viewMode === "day") {
      const currentIndex = groups.findIndex((group) => group.id === selectedDay);
      const currentGroup = groups[currentIndex >= 0 ? currentIndex : 0];
      return (
        <>
          {renderDayNavigation(groups)}
          {currentGroup ? (
            <div className={styles.days}>{renderGroup(currentGroup)}</div>
          ) : (
            <div className={styles.emptySchedule}>
              <strong>No event days are available</strong>
              <p>The event start and end dates do not define a navigable calendar range.</p>
            </div>
          )}
          {renderUnscheduledGroup()}
        </>
      );
    }

    if (viewMode === "week") {
      const firstDate = groups[0]?.label;
      const lastDate = groups.at(-1)?.label;
      return (
        <>
          <div className={styles.weekView}>
            <p className={styles.viewContext}>
              {firstDate && lastDate && firstDate !== lastDate
                ? `Week: ${firstDate} – ${lastDate}`
                : "Week schedule"}
            </p>
            <div className={styles.weekGroups}>{groups.map((group) => renderGroup(group))}</div>
          </div>
          {renderUnscheduledGroup()}
        </>
      );
    }

    return (
      <div className={styles.groupedView}>
        <div className={styles.groupGroups}>{groups.map((group) => renderGroup(group))}</div>
        {renderUnscheduledGroup()}
      </div>
    );
  }

  return (
    <div className={styles.workspaceRoot}>
      <a className={styles.skipLink} href="#agenda-content">
        Skip to agenda workspace
      </a>
      <main id="agenda-content" className={styles.workspace} tabIndex={-1}>
        <WorkspaceHeader
          breadcrumb={
            <WorkspaceBreadcrumb>
              <a
                href={`/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(data.event.id)}`}
              >
                {data.event.name}
              </a>
              <span>/</span>
              <strong>Agenda</strong>
            </WorkspaceBreadcrumb>
          }
          title="Agenda"
          status={
            <StatusBadge tone={readiness.ready ? "info" : "warning"}>
              Draft v{data.draft.version}
            </StatusBadge>
          }
          description="Place accepted sessions into rooms and times, resolve conflicts, and publish with confidence."
          metadata={
            <>
              <WorkspaceMetaItem>{data.draft.entries.length} scheduled</WorkspaceMetaItem>
              <WorkspaceMetaItem>{data.unscheduledSessions.length} unscheduled</WorkspaceMetaItem>
              <WorkspaceMetaItem>
                Updated {formatRevisionTimestamp(data.draft.updatedAt)} by {data.draft.updatedBy}
              </WorkspaceMetaItem>
            </>
          }
          actions={
            <Button asChild size="sm" variant="outline">
              <a href={settingsHref}>Rooms and tracks</a>
            </Button>
          }
        />

        {error ? (
          <div className={styles.errorBanner} role="alert">
            <div>
              <strong>Agenda request failed</strong>
              <p>{error}</p>
              <small>
                The authoritative private draft remains visible as Draft v{data.draft.version}.
              </small>
            </div>
            <button type="button" onClick={onDismissError} aria-label="Dismiss error">
              Close
            </button>
          </div>
        ) : null}
        <div className={styles.srOnly} role="status" aria-live="polite">
          {statusMessage}
        </div>

        <section className={styles.agendaSummary} aria-label="Schedule at a glance">
          <div>
            <span>Schedule at a glance</span>
            <strong>
              {data.draft.entries.length} scheduled · {data.unscheduledSessions.length} to place
            </strong>
          </div>
          <div>
            <span>Event dates</span>
            <strong>
              {formatScheduleDate(data.event.startsOn)}
              {data.event.endsOn === data.event.startsOn
                ? ""
                : ` – ${formatScheduleDate(data.event.endsOn)}`}
            </strong>
          </div>
          <div>
            <span>Timezone</span>
            <strong>{data.event.timeZone}</strong>
          </div>
          <div>
            <span>Publication</span>
            <strong>
              {currentRevision ? `Revision ${currentRevision.number} is live` : "Not published"}
            </strong>
          </div>
        </section>

        <section className={styles.releaseCenter} aria-label="Agenda release center">
          <header className={styles.releaseCenterHeader}>
            <div>
              <p className={styles.eyebrow}>Release center</p>
              <h2>Prepare the public agenda</h2>
              <p>Validate the private draft, then publish when every requirement is clear.</p>
            </div>
            <div className={styles.releaseStatus}>
              <StatusBadge tone={readiness.ready ? "info" : "warning"}>
                Draft v{data.draft.version}
              </StatusBadge>
              <span>
                {readiness.ready
                  ? "Ready to publish"
                  : `${readiness.reasons.length} requirement${
                      readiness.reasons.length === 1 ? "" : "s"
                    } remaining`}
              </span>
            </div>
          </header>

          <div className={styles.releaseCenterGrid}>
            <section className={styles.releaseAction} aria-labelledby="validation-heading">
              <div className={styles.inspectorHeading}>
                <div>
                  <p className={styles.eyebrow}>Required check</p>
                  <h3 id="validation-heading">Validate draft</h3>
                </div>
                <span
                  className={
                    preview?.draftVersion === data.draft.version
                      ? styles.validatedBadge
                      : styles.draftBadge
                  }
                >
                  {preview?.draftVersion === data.draft.version ? "Validated" : "Needs validation"}
                </span>
              </div>
              <p>Check conflicts and release rules for draft v{data.draft.version}.</p>
              <button
                className={styles.secondaryButton}
                type="button"
                disabled={busy || data.draft.entries.length === 0}
                onClick={() => void onPreview()}
              >
                {isBusyFor("validate") ? "Checking..." : "Preview and validate"}
              </button>
              {preview ? (
                <fieldset className={styles.diffSummary}>
                  <legend className={styles.srOnly}>Changes from published revision</legend>
                  <span>
                    <strong>{preview.diff.added}</strong> added
                  </span>
                  <span>
                    <strong>{preview.diff.changed}</strong> changed
                  </span>
                  <span>
                    <strong>{preview.diff.removed}</strong> removed
                  </span>
                </fieldset>
              ) : null}
            </section>

            {hasRooms ? (
              <AgendaSuggestionPanel
                run={suggestionRun ?? null}
                currentDraftVersion={data.draft.version}
                busy={busy}
                busyOperation={busyOperation}
                eligibleUnscheduledCount={data.unscheduledSessions.length}
                selectedChangeIds={selectedSuggestionChanges}
                onSelectionChange={setSelectedSuggestionChanges}
                onGenerate={onGenerateSuggestion}
                onRegenerate={onRegenerateSuggestion}
                onReject={onRejectSuggestion}
                onApply={onApplySuggestion}
              />
            ) : null}

            <Card className={styles.publishCard} size="sm">
              <div className={styles.inspectorHeading}>
                <div>
                  <p className={styles.eyebrow}>Public release</p>
                  <h3 id="publish-heading">Publish agenda</h3>
                </div>
                {currentRevision ? (
                  <Badge variant="outline">Revision {currentRevision.number} live</Badge>
                ) : (
                  <Badge variant="outline">Not published</Badge>
                )}
              </div>
              {!readiness.ready ? (
                <ul className={styles.readinessList} aria-label="Publication requirements">
                  {readiness.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : (
                <p className={styles.readyMessage}>
                  Draft v{data.draft.version} is ready to publish.
                </p>
              )}
              <Button
                className={styles.publishButton}
                type="button"
                disabled={busy || !readiness.ready}
                onClick={() => void onPublish()}
              >
                {isBusyFor("publish") ? "Publishing..." : "Publish agenda"}
              </Button>
              <small>
                {currentRevision
                  ? `Current public revision: ${currentRevision.sessionCount} sessions, published ${formatRevisionTimestamp(
                      currentRevision.publishedAt,
                    )}.`
                  : "Publishing creates the first immutable public revision."}
              </small>
            </Card>
          </div>

          {preview?.conflicts.length ? (
            <Alert variant="destructive" className={styles.conflictPanel}>
              <AlertTitle>
                {preview.conflicts.length} hard conflict
                {preview.conflicts.length === 1 ? "" : "s"}
              </AlertTitle>
              <AlertDescription>
                <p>Hard conflicts block publication and cannot be overridden.</p>
                <ul>
                  {preview.conflicts.map((conflict) => (
                    <li key={conflict.id}>
                      <strong>{conflict.kind.replace("_", " ")}</strong>
                      <span>{conflict.message}</span>
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}
          {preview?.releaseConflicts.length ? (
            <Alert variant="destructive" className={styles.conflictPanel}>
              <AlertTitle>
                {preview.releaseConflicts.length} released commitment conflict
                {preview.releaseConflicts.length === 1 ? "" : "s"}
              </AlertTitle>
              <AlertDescription>
                <p>Released commitment conflicts block publication until resolved.</p>
                <ul>
                  {preview.releaseConflicts.map((conflict) => (
                    <li key={conflict.id}>
                      <strong>{conflict.kind.replace("_", " ")}</strong>
                      <span>{conflict.message}</span>
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}
          {preview?.warnings.length ? (
            <section className={styles.warningPanel} aria-labelledby="warnings-heading">
              <h2 id="warnings-heading">
                {preview.warnings.length} warning{preview.warnings.length === 1 ? "" : "s"}
              </h2>
              <p>Warnings require a recorded organizer reason before publication.</p>
              <ul>
                {preview.warnings.map((warning) => (
                  <li key={warning.id}>
                    <strong>{warning.kind}</strong>
                    <span>{warning.message}</span>
                    {warning.overridden ? (
                      <p className={styles.overrideRecorded}>
                        Override recorded: {warning.overrideReason}
                      </p>
                    ) : (
                      <WarningOverrideForm
                        busy={busy}
                        onSubmit={async (reason) => {
                          await onOverrideWarning(warning.id, reason);
                        }}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {calendarDelivery ? (
            <div className={styles.calendarDelivery} aria-live="polite">
              <strong>Released commitment calendar delivery</strong>
              <span>Calendar: {calendarDelivery.state.replace("_", " ")}</span>
              <span>Sent last 24 hours: {calendarDelivery.sentLast24Hours}</span>
              <span>Failed last 24 hours: {calendarDelivery.failedLast24Hours}</span>
              <span>
                Last invitation:{" "}
                {calendarDelivery.lastInvitationAt
                  ? formatRevisionTimestamp(calendarDelivery.lastInvitationAt)
                  : "None"}
              </span>
              {calendarDelivery.lastFailure ? (
                <div role="alert">
                  <span>Last failure: {calendarDelivery.lastFailure.summary}</span>
                  <small>
                    Committed UID and sequence are retained for repair; this does not claim delivery
                    success.
                  </small>
                  {calendarDelivery.lastFailure.retryable && onRetryCalendarDelivery ? (
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      disabled={busy}
                      onClick={() => void onRetryCalendarDelivery()}
                    >
                      {isBusyFor("retry-calendar-delivery")
                        ? "Retrying..."
                        : "Retry calendar delivery"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {data.revisions.length > 0 ? (
            <Collapsible>
              <div className={styles.historyDisclosure}>
                <div>
                  <strong>Revision history</strong>
                  <small>
                    {data.revisions.length} published revision
                    {data.revisions.length === 1 ? "" : "s"}
                  </small>
                </div>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" type="button">
                    View history
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className={styles.historyContent}>
                <ol>
                  {data.revisions.map((revision) => (
                    <li key={revision.id}>
                      <div>
                        <strong>Revision {revision.number}</strong>
                        {revision.current ? <Badge variant="outline">Current</Badge> : null}
                      </div>
                      <small>
                        {revision.sessionCount} sessions,{" "}
                        {formatRevisionTimestamp(revision.publishedAt)}
                      </small>
                    </li>
                  ))}
                </ol>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </section>

        <div className={styles.workspaceGrid}>
          <section className={styles.boardColumn} aria-labelledby="schedule-heading">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>Schedule builder</p>
                <h2 id="schedule-heading">Build the event day</h2>
                <p>Choose a day, then place accepted sessions into the schedule.</p>
              </div>
              {data.unscheduledSessions.length === 0 ? (
                <div className={styles.placementComplete} role="status">
                  <CheckCircle2 aria-hidden="true" />
                  <span>
                    <strong>Schedule complete</strong>
                    All accepted sessions placed
                  </span>
                </div>
              ) : (
                <button
                  className={styles.primaryButton}
                  type="button"
                  disabled={busy || !hasRooms}
                  onClick={() => setShowAddForm((current) => !current)}
                  aria-expanded={showAddForm}
                  aria-controls="add-session-panel"
                >
                  {showAddForm ? "Close form" : "Schedule session"}
                </button>
              )}
            </div>
            {!hasRooms ? (
              <p className={styles.formError} role="status">
                Scheduling is unavailable until you create a room.{" "}
                <a href={settingsHref}>Create a room in Rooms and tracks settings</a> before
                scheduling accepted sessions.
              </p>
            ) : null}

            <div className={styles.scheduleToolbar}>
              <span id="agenda-view-label" className={styles.viewLabel}>
                Schedule view
              </span>
              <div
                className={styles.viewTablist}
                role="tablist"
                aria-labelledby="agenda-view-label"
                aria-orientation="horizontal"
              >
                {AGENDA_VIEW_MODES.map((mode) => (
                  <button
                    key={mode}
                    id={`agenda-view-${mode}`}
                    className={styles.viewTab}
                    type="button"
                    role="tab"
                    aria-selected={viewMode === mode}
                    aria-controls="agenda-view-panel"
                    tabIndex={viewMode === mode ? 0 : -1}
                    ref={(node) => {
                      viewTabRefs.current[mode] = node;
                    }}
                    onClick={() => selectView(mode)}
                    onKeyDown={(event) => moveView(event, mode)}
                  >
                    {agendaViewLabels[mode]}
                  </button>
                ))}
              </div>
            </div>

            {showAddForm && hasRooms ? (
              <div id="add-session-panel" className={styles.addPanel}>
                <h3>Schedule a session</h3>
                <EntryForm
                  sessions={data.unscheduledSessions}
                  rooms={data.rooms}
                  tracks={data.tracks}
                  eventStart={data.event.startsOn}
                  busy={busy}
                  onCancel={() => {
                    setShowAddForm(false);
                    setPlacementSessionId(null);
                  }}
                  {...(placementSessionId === null ? {} : { initialSessionId: placementSessionId })}
                  {...(onCreateRoom === undefined ? {} : { onCreateRoom })}
                  {...(onCreateTrack === undefined ? {} : { onCreateTrack })}
                  onSubmit={async (entry) => {
                    const saved = await onSaveEntry(entry);
                    if (saved !== false) {
                      setShowAddForm(false);
                      setPlacementSessionId(null);
                    }
                  }}
                />
              </div>
            ) : null}

            <div
              id="agenda-view-panel"
              className={styles.viewPanel}
              role="tabpanel"
              aria-labelledby={`agenda-view-${viewMode}`}
              aria-label="Schedule canvas"
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                const sessionId = event.dataTransfer.getData("text/plain");
                if (data.unscheduledSessions.some((session) => session.id === sessionId)) {
                  setPlacementSessionId(sessionId);
                  setShowAddForm(true);
                }
              }}
            >
              {renderScheduleView()}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
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

export function AgendaSuggestionPanel({
  run,
  currentDraftVersion,
  busy,
  busyOperation,
  eligibleUnscheduledCount,
  selectedChangeIds,
  onSelectionChange,
  onGenerate,
  onRegenerate,
  onReject,
  onApply,
}: AgendaSuggestionPanelProps) {
  const blockers = run?.candidateDiagnostics?.conflicts ?? [];
  const stale = run !== null && run.baseDraftVersion !== currentDraftVersion;
  const selectedAvailableChangeIds =
    run?.diff.changes
      .filter((change) => selectedChangeIds.includes(change.id))
      .map((change) => change.id) ?? [];
  const canApply =
    run?.status === "pending" &&
    !busy &&
    !stale &&
    selectedAvailableChangeIds.length > 0 &&
    blockers.length === 0 &&
    onApply !== undefined;
  const isBusyFor = (operation: AgendaBusyOperation): boolean =>
    busy && (busyOperation === undefined || busyOperation === null || busyOperation === operation);
  const [existingSessionTimes, setExistingSessionTimes] =
    useState<ExistingSessionTimesSelection>("keep");
  const [ignoreExistingRooms, setIgnoreExistingRooms] = useState(false);
  const suggestionOptionsDisabled = busy || onGenerate === undefined;
  const [suggestionsOpen, setSuggestionsOpen] = useState(run !== null);
  useEffect(() => {
    if (run !== null) setSuggestionsOpen(true);
  }, [run]);

  function toggleChange(changeId: string) {
    onSelectionChange(
      selectedChangeIds.includes(changeId)
        ? selectedChangeIds.filter((current) => current !== changeId)
        : [...selectedChangeIds, changeId],
    );
  }

  return (
    <Card className={styles.suggestionCard} size="sm">
      <Collapsible open={suggestionsOpen} onOpenChange={setSuggestionsOpen}>
        <div className={styles.inspectorHeading}>
          <div>
            <p className={styles.eyebrow}>Optional advisory</p>
            <h2 id="suggestion-heading">Suggestions</h2>
          </div>
          {run ? <Badge variant="outline">Run v{run.version}</Badge> : null}
        </div>
        <CollapsibleTrigger asChild>
          <Button className={styles.suggestionToggle} variant="outline" type="button">
            {suggestionsOpen
              ? "Hide suggestions"
              : run
                ? "Review suggestions"
                : "Configure suggestions"}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className={styles.suggestionContent}>
          <p>
            Suggestions are private candidates only. They never change this draft or publish
            anything until an organizer explicitly selects and applies individual changes.
          </p>
          {run === null ? (
            eligibleUnscheduledCount === 0 ? (
              <div className={styles.suggestionEmpty} role="status">
                <strong>No eligible unscheduled sessions</strong>
                <p>
                  No eligible unscheduled accepted sessions are currently available. Accept a
                  session before generating private placement suggestions. The current draft already
                  contains every accepted session available to this assistant.
                </p>
              </div>
            ) : (
              <>
                <p role="status">No advisory suggestion run has been generated.</p>
                <div className={styles.suggestionOptions}>
                  <fieldset className={styles.scheduleOptions}>
                    <legend>Existing session times</legend>
                    <label
                      className={`${styles.scheduleOption} ${
                        existingSessionTimes === "keep" ? styles.scheduleOptionSelected : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="existing-session-times"
                        value="keep"
                        checked={existingSessionTimes === "keep"}
                        disabled={suggestionOptionsDisabled}
                        onChange={() => setExistingSessionTimes("keep")}
                      />
                      <span className={styles.scheduleOptionCopy}>
                        <strong>Keep scheduled sessions fixed</strong>
                        <small>The generator preserves their current times.</small>
                      </span>
                    </label>
                    <label
                      className={`${styles.scheduleOption} ${
                        existingSessionTimes === "move" ? styles.scheduleOptionSelected : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="existing-session-times"
                        value="move"
                        checked={existingSessionTimes === "move"}
                        disabled={suggestionOptionsDisabled}
                        onChange={() => setExistingSessionTimes("move")}
                      />
                      <span className={styles.scheduleOptionCopy}>
                        <strong>Allow scheduled sessions to move</strong>
                        <small>The generator may assign them different times.</small>
                      </span>
                    </label>
                  </fieldset>
                  <fieldset className={styles.roomOptions}>
                    <legend>Existing room occupancy</legend>
                    <label className={styles.roomOption}>
                      <input
                        type="checkbox"
                        checked={ignoreExistingRooms}
                        disabled={suggestionOptionsDisabled}
                        onChange={(event) => setIgnoreExistingRooms(event.target.checked)}
                      />
                      <span className={styles.scheduleOptionCopy}>
                        <strong>Ignore existing room occupancy when generating</strong>
                        <small>
                          The generator may place sessions in rooms that already have a scheduled
                          session.
                        </small>
                      </span>
                    </label>
                  </fieldset>
                </div>
                <Button
                  variant="outline"
                  type="button"
                  disabled={suggestionOptionsDisabled}
                  onClick={() =>
                    onGenerate
                      ? void onGenerate(
                          serializeAgendaSuggestionOptions(
                            existingSessionTimes,
                            ignoreExistingRooms,
                          ),
                        )
                      : undefined
                  }
                >
                  {isBusyFor("generate-suggestion")
                    ? "Generating..."
                    : "Generate private suggestions"}
                </Button>
                {onGenerate === undefined ? (
                  <small>
                    Suggestion generation is unavailable until an approved provider is connected.
                  </small>
                ) : null}
              </>
            )
          ) : (
            <>
              <p role="status" aria-live="polite">
                Suggestion run v{run.version} is {run.status}. Base draft revision: v
                {run.baseDraftVersion}.
              </p>
              {stale ? (
                <p className={styles.inlineConflict} role="alert">
                  The draft has changed since this run was generated. Regenerate before applying.
                </p>
              ) : null}
              <p>{run.diff.summary}</p>
              {run.status === "pending" && run.diff.changes.length === 0 ? (
                <p className={styles.suggestionEmpty} role="status">
                  No eligible unscheduled sessions produced a proposal. Accept another session or
                  regenerate after changing the schedule context.
                </p>
              ) : null}
              {run.status === "pending" && run.diff.changes.length > 0 ? (
                <fieldset className={styles.overrideForm}>
                  <legend>Choose changes for human application</legend>
                  {run.diff.changes.map((change) => (
                    <label key={change.id}>
                      <input
                        type="checkbox"
                        checked={selectedChangeIds.includes(change.id)}
                        onChange={() => toggleChange(change.id)}
                      />
                      <span>
                        <strong>{change.kind}</strong> {change.summary}
                      </span>
                    </label>
                  ))}
                </fieldset>
              ) : null}
              {blockers.length > 0 ? (
                <div className={styles.conflictPanel} role="alert">
                  <strong>
                    {blockers.length} hard blocker{blockers.length === 1 ? "" : "s"} prevent
                    application
                  </strong>
                  <p>
                    Resolve blockers in the draft and regenerate. They cannot be overridden by AI.
                  </p>
                  <ul>
                    {blockers.map((blocker) => (
                      <li key={blocker.id}>{blocker.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {run.candidateDiagnostics?.warnings.length ? (
                <div className={styles.warningPanel}>
                  <strong>
                    {run.candidateDiagnostics.warnings.length} candidate warning
                    {run.candidateDiagnostics.warnings.length === 1 ? "" : "s"}
                  </strong>
                  <p>Review these private diagnostics before applying selected changes.</p>
                  <ul>
                    {run.candidateDiagnostics.warnings.map((warning) => (
                      <li key={warning.id}>{warning.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {run.status === "pending" ? (
                <div className={styles.formActions}>
                  <Button
                    variant="outline"
                    type="button"
                    disabled={busy || onRegenerate === undefined}
                    onClick={() => (onRegenerate ? void onRegenerate() : undefined)}
                  >
                    {isBusyFor("regenerate-suggestion") ? "Regenerating..." : "Regenerate"}
                  </Button>
                  <Button
                    variant="ghost"
                    type="button"
                    disabled={busy || onReject === undefined}
                    onClick={() => (onReject ? void onReject() : undefined)}
                  >
                    Reject run
                  </Button>
                  <Button
                    type="button"
                    disabled={!canApply}
                    onClick={() => (onApply ? void onApply(selectedAvailableChangeIds) : undefined)}
                  >
                    {isBusyFor("apply-suggestion") ? "Applying..." : "Apply selected changes"}
                  </Button>
                </div>
              ) : (
                <small>
                  This run is closed. Generate or regenerate a new private candidate to continue.
                </small>
              )}
            </>
          )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
function WarningOverrideForm({
  busy,
  onSubmit,
}: Readonly<{ busy: boolean; onSubmit(reason: string): Promise<void> }>) {
  const [reason, setReason] = useState("");
  return (
    <form
      className={styles.overrideForm}
      onSubmit={(event) => {
        event.preventDefault();
        if (reason.trim().length >= 3) {
          void onSubmit(reason.trim());
        }
      }}
    >
      <label>
        <span>Organizer override reason</span>
        <textarea
          value={reason}
          minLength={3}
          required
          rows={2}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <button
        type="submit"
        className={styles.textButton}
        disabled={busy || reason.trim().length < 3}
      >
        Record override
      </button>
    </form>
  );
}

interface AgendaWorkspaceProps {
  eventId: string;
  organizationId: string;
  api?: AgendaApi;
  appEnvironment?: string;
}
type AgendaWorkspaceLoadResult = Awaited<ReturnType<typeof loadAgendaWorkspace>>;

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

interface ScopedAgendaSnapshot {
  readonly scopeKey: string;
  readonly api: AgendaApi;
  readonly data: AgendaWorkspaceData;
}

interface ScopedAgendaWorkspaceProps extends AgendaWorkspaceProps {
  readonly scopeKey: string;
}

export function AgendaWorkspace(props: Readonly<AgendaWorkspaceProps>) {
  const scopeKey = agendaWorkspaceScopeKey(props.organizationId, props.eventId);
  return <ScopedAgendaWorkspace key={scopeKey} {...props} scopeKey={scopeKey} />;
}

function ScopedAgendaWorkspace({
  eventId,
  organizationId,
  scopeKey,
  api: providedApi,
  appEnvironment = process.env.APP_ENV,
}: Readonly<ScopedAgendaWorkspaceProps>) {
  const api = useMemo(
    () => providedApi ?? createAgendaApi("", organizationId),
    [organizationId, providedApi],
  );
  const fixtureMode =
    process.env.NODE_ENV === "test" || process.env.NEXT_PUBLIC_RUNTIME_PROFILE === "fixture";
  const localDemoApiRef = useRef<{ eventId: string; api: AgendaApi } | null>(null);
  const resolveLocalDemoApi = useCallback(
    async (signal?: AbortSignal) => {
      if (localDemoApiRef.current?.eventId === eventId) {
        return localDemoApiRef.current.api;
      }
      const environment = await resolveAgendaAppEnvironment(appEnvironment, signal);
      const localApi = fixtureMode ? createLocalAgendaDemoApi(environment, eventId) : null;
      if (localApi) {
        localDemoApiRef.current = { eventId, api: localApi };
      }
      return localApi;
    },
    [appEnvironment, eventId, fixtureMode],
  );
  const primaryAgendaApi = useMemo(() => {
    if (!fixtureMode) return api;
    const localApi = createLocalAgendaDemoApi("local", eventId);
    return localApi ?? api;
  }, [api, eventId, fixtureMode]);
  const initialReadKey = useMemo(
    () => ({ api: primaryAgendaApi, resolveLocalDemoApi, scopeKey }),
    [primaryAgendaApi, resolveLocalDemoApi, scopeKey],
  );
  const [snapshot, setSnapshot] = useState<ScopedAgendaSnapshot | null>(null);
  const [preview, setPreview] = useState<AgendaPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyOperation, setBusyOperation] = useState<AgendaBusyOperation | null>(null);
  const busyOperationRef = useRef<AgendaBusyOperation | null>(null);
  const loadGenerationRef = useRef(0);
  const operationGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const initialReadCoordinatorRef = useRef<ScopedReadFlightCoordinator<
    object,
    AgendaWorkspaceLoadResult
  > | null>(null);
  if (initialReadCoordinatorRef.current === null) {
    initialReadCoordinatorRef.current = createScopedReadFlightCoordinator();
  }
  const initialReadCoordinator = initialReadCoordinatorRef.current;
  const busy = busyOperation !== null;
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [suggestionRun, setSuggestionRun] = useState<AgendaSuggestionRunView | null>(null);
  const activeApi = snapshot?.api ?? null;
  const data = snapshot?.data ?? null;
  const suggestionApi = suggestionApiFor(activeApi);

  function operationIsCurrent(token: AgendaAsyncScopeToken): boolean {
    return canCommitAgendaAsyncCompletion(
      token,
      scopeKey,
      operationGenerationRef.current,
      mountedRef.current,
    );
  }

  function beginOperation(operation: AgendaBusyOperation): AgendaAsyncScopeToken | null {
    if (!mountedRef.current || busyOperationRef.current !== null) return null;
    const token = { scopeKey, generation: operationGenerationRef.current + 1 };
    operationGenerationRef.current = token.generation;
    busyOperationRef.current = operation;
    setBusyOperation(operation);
    setError(null);
    setStatusMessage(null);
    return token;
  }

  function endOperation(token: AgendaAsyncScopeToken): void {
    if (!operationIsCurrent(token)) return;
    busyOperationRef.current = null;
    setBusyOperation(null);
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadGenerationRef.current += 1;
      operationGenerationRef.current += 1;
      busyOperationRef.current = null;
    };
  }, []);

  const load = useCallback(
    async (signal?: AbortSignal, initialRead?: Promise<AgendaWorkspaceLoadResult>) => {
      const token = { scopeKey, generation: loadGenerationRef.current + 1 };
      loadGenerationRef.current = token.generation;
      const loadIsCurrent = () =>
        canCommitAgendaAsyncCompletion(
          token,
          scopeKey,
          loadGenerationRef.current,
          mountedRef.current,
          signal?.aborted ?? false,
        );

      if (loadIsCurrent()) {
        setLoading(true);
        setError(null);
        setStatusMessage(null);
      }
      try {
        const loaded = await (initialRead ??
          loadAgendaWorkspace(primaryAgendaApi, resolveLocalDemoApi, eventId, signal));
        if (!agendaWorkspaceDataMatchesEvent(loaded.data, eventId)) {
          throw new Error("The agenda response belongs to another event.");
        }
        if (!loadIsCurrent()) return;
        setSnapshot({ scopeKey, api: loaded.api, data: loaded.data });
        setPreview(null);
        setSuggestionRun(null);
        setStatusMessage(
          loaded.usingLocalDemo
            ? "Showing the deterministic local demo agenda because the local API has no agenda data."
            : null,
        );
      } catch (loadError) {
        if (
          loadIsCurrent() &&
          !(loadError instanceof DOMException && loadError.name === "AbortError")
        ) {
          setError(messageFrom(loadError));
        }
      } finally {
        if (loadIsCurrent()) {
          setLoading(false);
        }
      }
    },
    [eventId, primaryAgendaApi, resolveLocalDemoApi, scopeKey],
  );

  useEffect(() => {
    const lease = initialReadCoordinator.acquire(initialReadKey, (signal) =>
      loadAgendaWorkspace(primaryAgendaApi, resolveLocalDemoApi, eventId, signal),
    );
    void load(lease.signal, lease.promise);
    return () => lease.release();
  }, [
    eventId,
    initialReadCoordinator,
    initialReadKey,
    load,
    primaryAgendaApi,
    resolveLocalDemoApi,
  ]);

  async function mutate(
    operation: (activeApi: AgendaApi, current: AgendaWorkspaceData) => Promise<AgendaWorkspaceData>,
    successMessage: string,
    refreshPreview = false,
    busyKind: AgendaBusyOperation = "save",
  ): Promise<boolean> {
    const currentSnapshot = snapshot;
    if (
      currentSnapshot === null ||
      currentSnapshot.scopeKey !== scopeKey ||
      !agendaWorkspaceDataMatchesEvent(currentSnapshot.data, eventId)
    ) {
      return false;
    }
    const token = beginOperation(busyKind);
    if (token === null) return false;
    try {
      const nextData = await operation(currentSnapshot.api, currentSnapshot.data);
      if (!agendaWorkspaceDataMatchesEvent(nextData, eventId)) {
        throw new Error("The agenda mutation returned data for another event.");
      }
      if (!operationIsCurrent(token)) return false;
      setSnapshot({ ...currentSnapshot, data: nextData });
      if (refreshPreview) {
        const nextPreview = await currentSnapshot.api.preview(eventId);
        if (!operationIsCurrent(token)) return false;
        setPreview(nextPreview);
      } else {
        setPreview(null);
      }
      setStatusMessage(successMessage);
      return true;
    } catch (mutationError) {
      if (!operationIsCurrent(token)) return false;
      setError(messageFrom(mutationError));
      if (mutationError instanceof AgendaApiError) {
        setSuggestionRun((current) =>
          current
            ? {
                ...current,
                candidateDiagnostics: mutationError.candidateDiagnostics?.report ?? {
                  conflicts: [],
                  warnings: [],
                },
              }
            : current,
        );
        const recovered = await Promise.all([
          currentSnapshot.api.getWorkspace(eventId),
          currentSnapshot.api.preview(eventId),
        ]);
        if (operationIsCurrent(token) && agendaWorkspaceDataMatchesEvent(recovered[0], eventId)) {
          setSnapshot({ ...currentSnapshot, data: recovered[0] });
          setPreview(recovered[1]);
        }
      }
      return false;
    } finally {
      endOperation(token);
    }
  }

  async function generateSuggestion(options: AgendaSuggestionOptions) {
    const currentSnapshot = snapshot;
    if (
      currentSnapshot === null ||
      currentSnapshot.scopeKey !== scopeKey ||
      !agendaWorkspaceDataMatchesEvent(currentSnapshot.data, eventId)
    ) {
      return;
    }
    const token = beginOperation("generate-suggestion");
    if (token === null) return;
    try {
      const currentSuggestionApi = suggestionApiFor(currentSnapshot.api);
      if (!currentSuggestionApi) {
        throw new Error("Private suggestion generation is unavailable for this agenda.");
      }
      const dates = eventDates(
        currentSnapshot.data.event.startsOn,
        currentSnapshot.data.event.endsOn,
      );
      const run = await currentSuggestionApi.generateSuggestion({
        eventId,
        baseDraftVersion: currentSnapshot.data.draft.version,
        dates,
        eligibleStatuses: ["accepted"],
        roomIds: currentSnapshot.data.rooms.map((room) => room.id),
        dayWindows: dates.map((date) => ({
          date,
          startLocal: "09:00",
          endLocal: "17:00",
        })),
        orderedRules: [],
        ignoreExistingTimes: options.ignoreExistingTimes,
        ignoreExistingRooms: options.ignoreExistingRooms,
      });
      if (!operationIsCurrent(token)) return;
      setSuggestionRun(run);
      setStatusMessage(
        `Private advisory suggestion run v${run.version} is ready for human review.`,
      );
    } catch (suggestionError) {
      if (operationIsCurrent(token)) setError(messageFrom(suggestionError));
    } finally {
      endOperation(token);
    }
  }

  async function regenerateSuggestion() {
    const currentSnapshot = snapshot;
    const currentRun = suggestionRun;
    if (
      currentSnapshot === null ||
      currentRun === null ||
      currentSnapshot.scopeKey !== scopeKey ||
      !agendaWorkspaceDataMatchesEvent(currentSnapshot.data, eventId)
    ) {
      return;
    }
    const token = beginOperation("regenerate-suggestion");
    if (token === null) return;
    try {
      const currentSuggestionApi = suggestionApiFor(currentSnapshot.api);
      if (!currentSuggestionApi) {
        throw new Error("Private suggestion regeneration is unavailable for this agenda.");
      }
      const run = await currentSuggestionApi.regenerateSuggestion({
        eventId,
        runId: currentRun.id,
        baseDraftVersion: currentSnapshot.data.draft.version,
      });
      if (!operationIsCurrent(token)) return;
      setSuggestionRun(run);
      setStatusMessage(`Private advisory suggestion regenerated as run v${run.version}.`);
    } catch (suggestionError) {
      if (operationIsCurrent(token)) setError(messageFrom(suggestionError));
    } finally {
      endOperation(token);
    }
  }

  async function rejectSuggestion() {
    const currentSnapshot = snapshot;
    const currentRun = suggestionRun;
    if (
      currentSnapshot === null ||
      currentRun === null ||
      currentSnapshot.scopeKey !== scopeKey ||
      !agendaWorkspaceDataMatchesEvent(currentSnapshot.data, eventId)
    ) {
      return;
    }
    const token = beginOperation("reject-suggestion");
    if (token === null) return;
    try {
      const currentSuggestionApi = suggestionApiFor(currentSnapshot.api);
      if (!currentSuggestionApi) {
        throw new Error("Private suggestion rejection is unavailable for this agenda.");
      }
      const run = await currentSuggestionApi.rejectSuggestion({
        eventId,
        runId: currentRun.id,
      });
      if (!operationIsCurrent(token)) return;
      setSuggestionRun(run);
      setStatusMessage("Advisory suggestion rejected. The private draft was not changed.");
    } catch (suggestionError) {
      if (operationIsCurrent(token)) setError(messageFrom(suggestionError));
    } finally {
      endOperation(token);
    }
  }

  async function applySuggestion(changeIds: readonly string[]) {
    const currentSnapshot = snapshot;
    const currentRun = suggestionRun;
    if (
      currentSnapshot === null ||
      currentRun === null ||
      currentSnapshot.scopeKey !== scopeKey ||
      !agendaWorkspaceDataMatchesEvent(currentSnapshot.data, eventId)
    ) {
      return;
    }
    const token = beginOperation("apply-suggestion");
    if (token === null) return;
    try {
      const currentSuggestionApi = suggestionApiFor(currentSnapshot.api);
      if (!currentSuggestionApi) {
        throw new Error("Private suggestion application is unavailable for this agenda.");
      }
      const nextData = await currentSuggestionApi.applySuggestion({
        eventId,
        runId: currentRun.id,
        acceptedChangeIds: changeIds,
      });
      if (!agendaWorkspaceDataMatchesEvent(nextData, eventId)) {
        throw new Error("The agenda suggestion returned data for another event.");
      }
      if (!operationIsCurrent(token)) return;
      setSnapshot({ ...currentSnapshot, data: nextData });
      setPreview(null);
      setSuggestionRun({
        ...currentRun,
        status: "applied",
        acceptedChangeIds: [...changeIds],
      });
      setStatusMessage(
        "Selected advisory changes were applied to the private draft. Nothing was published.",
      );
    } catch (suggestionError) {
      if (operationIsCurrent(token)) setError(messageFrom(suggestionError));
    } finally {
      endOperation(token);
    }
  }

  async function previewAgenda() {
    const currentSnapshot = snapshot;
    if (
      currentSnapshot === null ||
      currentSnapshot.scopeKey !== scopeKey ||
      !agendaWorkspaceDataMatchesEvent(currentSnapshot.data, eventId)
    ) {
      return;
    }
    const token = beginOperation("validate");
    if (token === null) return;
    try {
      const result = await currentSnapshot.api.preview(eventId);
      if (!operationIsCurrent(token)) return;
      setPreview(result);
      setStatusMessage(
        result.conflicts.length === 0
          ? "Agenda validation completed."
          : "Agenda validation found hard conflicts.",
      );
    } catch (previewError) {
      if (!operationIsCurrent(token)) return;
      setError(messageFrom(previewError));
    } finally {
      endOperation(token);
    }
  }

  if (loading && !data) {
    return (
      <main className={styles.loadingState} aria-live="polite">
        <span className={styles.loadingBar} aria-hidden="true" />
        <h1>Loading agenda workspace</h1>
        <p>Retrieving the private draft and published revision.</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className={styles.loadingState}>
        <h1>Agenda workspace unavailable</h1>
        <p role="alert">{error ?? "The agenda could not be loaded."}</p>
        <button className={styles.primaryButton} type="button" onClick={() => void load()}>
          Try again
        </button>
      </main>
    );
  }

  return (
    <AgendaBoard
      organizationId={organizationId}
      data={data}
      preview={preview}
      busy={busy}
      busyOperation={busyOperation}
      statusMessage={statusMessage}
      error={error}
      suggestionRun={suggestionRun}
      {...(suggestionApi === null
        ? {}
        : {
            onGenerateSuggestion: generateSuggestion,
            onRegenerateSuggestion: regenerateSuggestion,
            onRejectSuggestion: rejectSuggestion,
            onApplySuggestion: applySuggestion,
          })}
      onDismissError={() => setError(null)}
      onSaveEntry={(entry) =>
        mutate(
          (activeApi, current) =>
            activeApi.saveEntry({
              eventId,
              expectedVersion: current.draft.version,
              entry,
            }),
          "Session saved to the private agenda draft.",
          true,
          "save",
        )
      }
      onRemoveEntry={(entryId) =>
        mutate(
          (activeApi, current) =>
            activeApi.removeEntry({
              eventId,
              entryId,
              expectedVersion: current.draft.version,
            }),
          "Session removed from the private agenda draft.",
          true,
          "remove",
        )
      }
      onPreview={previewAgenda}
      onOverrideWarning={(warningId, reason) =>
        mutate(
          (activeApi, current) =>
            activeApi.overrideWarning({
              eventId,
              expectedVersion: current.draft.version,
              warningId,
              reason,
            }),
          "Warning override recorded in the agenda audit history.",
          true,
          "override-warning",
        )
      }
      onPublish={() =>
        mutate(
          (activeApi, current) =>
            activeApi.publish({ eventId, expectedVersion: current.draft.version }),
          "Agenda revision published. Public projections are being refreshed.",
          false,
          "publish",
        )
      }
    />
  );
}
