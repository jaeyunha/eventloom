"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createScopedReadFlightCoordinator,
  type ScopedReadFlightCoordinator,
} from "@/lib/scoped-read-flight";
import styles from "./agenda.module.css";
import viewStyles from "./agenda-workspace.module.css";
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
  AgendaEntry,
  AgendaEntryInput,
  AgendaPreview,
  AgendaSession,
  AgendaTrack,
  AgendaWorkspaceData,
} from "./types";

function messageFrom(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "The agenda request could not be completed.";
}
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
  validation?: {
    conflicts: readonly { id: string; kind: string; message: string }[];
  };
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
  | "apply-suggestion";
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

function previewFromError(error: AgendaApiError, draftVersion: number): AgendaPreview | null {
  if (Array.isArray(error.details)) {
    const conflicts = error.details
      .filter((issue) => issue.code.startsWith("agenda."))
      .map((issue, index) => {
        const kindValue = issue.code.slice("agenda.".length);
        const kind = ["participant", "resource", "room"].includes(kindValue)
          ? (kindValue as AgendaPreview["conflicts"][number]["kind"])
          : "room";
        const entryIds =
          issue.path[0] === "entries"
            ? issue.path
                .slice(1)
                .filter(
                  (segment: string | number): segment is string => typeof segment === "string",
                )
            : [];
        return {
          id: `agenda-error-${index}-${issue.code}-${issue.path.join("-")}`,
          kind,
          entryIds,
          message: issue.message,
        };
      });
    if (conflicts.length === 0) return null;
    return {
      draftVersion,
      conflicts,
      warnings: [],
      diff: { added: 0, changed: 0, removed: 0 },
      validatedAt: new Date().toISOString(),
    };
  }

  const legacyDetails = error.details as
    | {
        readonly conflicts?: AgendaPreview["conflicts"];
        readonly warnings?: AgendaPreview["warnings"];
      }
    | undefined;
  if (!legacyDetails?.conflicts && !legacyDetails?.warnings) {
    return null;
  }
  return {
    draftVersion,
    conflicts: legacyDetails.conflicts ?? [],
    warnings: legacyDetails.warnings ?? [],
    diff: { added: 0, changed: 0, removed: 0 },
    validatedAt: new Date().toISOString(),
  };
}

interface EntryFormProps {
  entry?: AgendaEntry;
  sessions: readonly AgendaSession[];
  rooms: AgendaWorkspaceData["rooms"];
  tracks: readonly AgendaTrack[];
  eventStart: string;
  busy: boolean;
  onSubmit(entry: AgendaEntryInput): Promise<void>;
  onCancel?: () => void;
}

function EntryForm({
  entry,
  sessions,
  rooms,
  tracks,
  eventStart,
  busy,
  onSubmit,
  onCancel,
}: EntryFormProps) {
  const firstSession = entry?.sessionId ?? sessions[0]?.id ?? "";
  const [sessionId, setSessionId] = useState(firstSession);
  const [roomId, setRoomId] = useState(entry?.roomId ?? rooms[0]?.id ?? "");
  const [trackIds, setTrackIds] = useState<readonly string[]>(
    entry?.trackIds ?? (tracks[0] ? [tracks[0].id] : []),
  );
  const [startsAtLocal, setStartsAtLocal] = useState(entry?.startsAtLocal ?? `${eventStart}T09:00`);
  const [endsAtLocal, setEndsAtLocal] = useState(entry?.endsAtLocal ?? `${eventStart}T10:00`);
  const [formError, setFormError] = useState<string | null>(null);

  function toggleTrack(trackId: string) {
    setTrackIds((current) =>
      current.includes(trackId)
        ? current.filter((candidate) => candidate !== trackId)
        : [...current, trackId],
    );
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
}: AgendaBoardProps) {
  const readiness = publicationReadiness(data, preview);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<AgendaViewMode>(initialView);
  const { startsOn, endsOn } = data.event;
  const eventDays = useMemo(
    () => agendaDays(data.draft.entries, { startsOn, endsOn }),
    [data.draft.entries, endsOn, startsOn],
  );
  const [selectedDay, setSelectedDay] = useState(() => eventDays[0]?.date ?? "");
  const [selectedSuggestionChanges, setSelectedSuggestionChanges] = useState<readonly string[]>([]);
  const viewTabRefs = useRef<Partial<Record<AgendaViewMode, HTMLButtonElement | null>>>({});
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
    const entryWarnings = warningsForEntry(entry.id, preview?.warnings ?? []);
    const hasIssues = entryConflicts.length + entryWarnings.length > 0;
    const editExpanded = viewMode === "day" && editingEntryId === entry.id;
    return (
      <li key={key}>
        <article className={`${styles.sessionCard} ${hasIssues ? styles.sessionIssue : ""}`}>
          <div className={styles.sessionTime}>
            {showDate ? (
              <time className={viewStyles.entryDate} dateTime={scheduleDate(entry)}>
                {formatScheduleDate(scheduleDate(entry))}
              </time>
            ) : null}
            <time dateTime={entry.startsAtLocal}>{formatLocalTime(entry.startsAtLocal)}</time>
            <span aria-hidden="true">to</span>
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
        className={`${styles.day} ${viewStyles.viewGroup}`}
        aria-labelledby={headingId}
      >
        <header className={viewStyles.viewGroupHeader}>
          <h3 id={headingId}>{group.label}</h3>
          <span>
            {group.entries.length} session{group.entries.length === 1 ? "" : "s"}
          </span>
        </header>
        {group.entries.length === 0 ? (
          <p className={viewStyles.viewGroupEmpty}>{group.emptyMessage}</p>
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
      <section className={viewStyles.unscheduledGroup} aria-labelledby="agenda-unscheduled-heading">
        <header className={viewStyles.viewGroupHeader}>
          <h3 id="agenda-unscheduled-heading">Unscheduled accepted sessions</h3>
          <span>
            {sessions.length} session{sessions.length === 1 ? "" : "s"}
          </span>
        </header>
        {sessions.length === 0 ? (
          <p className={viewStyles.viewGroupEmpty}>No unscheduled accepted sessions.</p>
        ) : (
          <ul className={viewStyles.unscheduledList}>
            {sessions.map((session) => (
              <li className={viewStyles.unscheduledItem} key={session.id}>
                <strong>{session.title}</strong>
                <span>
                  {session.format} · {session.durationMinutes} minutes ·{" "}
                  {session.speakerNames.join(", ")}
                </span>
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
      <nav className={viewStyles.viewSwitcher} aria-label="Event day navigation">
        <span className={viewStyles.viewLabel}>Event days</span>
        <div className={viewStyles.viewTablist}>
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
          <p aria-live="polite">
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
              <header className={viewStyles.viewGroupHeader}>
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
          <div className={viewStyles.weekView}>
            <p className={viewStyles.viewContext}>
              {firstDate && lastDate && firstDate !== lastDate
                ? `Week: ${firstDate} – ${lastDate}`
                : "Week schedule"}
            </p>
            <div className={viewStyles.weekGroups}>{groups.map((group) => renderGroup(group))}</div>
          </div>
          {renderUnscheduledGroup()}
        </>
      );
    }

    return (
      <div className={viewStyles.groupedView}>
        <div className={viewStyles.groupGroups}>{groups.map((group) => renderGroup(group))}</div>
        {renderUnscheduledGroup()}
      </div>
    );
  }

  return (
    <div className={styles.workspaceRoot}>
      <a className={styles.skipLink} href="#agenda-content">
        Skip to agenda workspace
      </a>
      <header className={styles.topbar}>
        <a className={styles.brand} href="/admin">
          <span aria-hidden="true">OS</span>
          Open Sessionboard
        </a>
        <nav aria-label="Organizer navigation">
          <a href={`/admin/events/${encodeURIComponent(data.event.id)}`}>Event overview</a>
          <a
            aria-current="page"
            href={`/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(data.event.id)}/agenda`}
          >
            Agenda
          </a>
        </nav>
      </header>

      <main id="agenda-content" className={styles.workspace} tabIndex={-1}>
        <header className={styles.pageHeading}>
          <div>
            <p className={styles.eyebrow}>{data.event.name}</p>
            <h1>Agenda workspace</h1>
            <p className={styles.pageDescription}>
              Schedule accepted sessions in a private draft. Public embeds continue to use the last
              published revision until you publish again.
            </p>
            <p>
              <a className={styles.secondaryButton} href={settingsHref}>
                Rooms and tracks settings
              </a>
            </p>
          </div>
          <div className={styles.draftStatus}>
            <span className={styles.statusDot} aria-hidden="true" />
            <div>
              <strong>Draft v{data.draft.version}</strong>
              <small>
                Updated {formatRevisionTimestamp(data.draft.updatedAt)} by {data.draft.updatedBy}
              </small>
            </div>
          </div>
        </header>

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

        <div className={styles.workspaceGrid}>
          <section className={styles.boardColumn} aria-labelledby="schedule-heading">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>Private schedule</p>
                <h2 id="schedule-heading">Draft schedule</h2>
                <p>Times are shown in {data.event.timeZone}.</p>
              </div>
              <button
                className={styles.primaryButton}
                type="button"
                disabled={data.unscheduledSessions.length === 0 || busy || !hasRooms}
                onClick={() => setShowAddForm((current) => !current)}
                aria-expanded={showAddForm}
                aria-controls="add-session-panel"
              >
                Add accepted session
              </button>
            </div>
            {!hasRooms ? (
              <p className={styles.formError} role="status">
                Scheduling is unavailable until you create a room.{" "}
                <a href={settingsHref}>Create a room in Rooms and tracks settings</a> before
                scheduling accepted sessions.
              </p>
            ) : null}

            <div className={viewStyles.viewSwitcher}>
              <span id="agenda-view-label" className={viewStyles.viewLabel}>
                Schedule view
              </span>
              <div
                className={viewStyles.viewTablist}
                role="tablist"
                aria-labelledby="agenda-view-label"
                aria-orientation="horizontal"
              >
                {AGENDA_VIEW_MODES.map((mode) => (
                  <button
                    key={mode}
                    id={`agenda-view-${mode}`}
                    className={viewStyles.viewTab}
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
                  onCancel={() => setShowAddForm(false)}
                  onSubmit={async (entry) => {
                    const saved = await onSaveEntry(entry);
                    if (saved !== false) setShowAddForm(false);
                  }}
                />
              </div>
            ) : null}

            <div
              id="agenda-view-panel"
              className={viewStyles.viewPanel}
              role="tabpanel"
              aria-labelledby={`agenda-view-${viewMode}`}
            >
              {renderScheduleView()}
            </div>
          </section>

          <aside
            className={`${styles.inspector} ${viewStyles.actionRail}`}
            aria-label="Agenda validation and publication"
          >
            <section className={styles.inspectorCard} aria-labelledby="validation-heading">
              <div className={styles.inspectorHeading}>
                <div>
                  <p className={styles.eyebrow}>Safety check</p>
                  <h2 id="validation-heading">Validate draft</h2>
                </div>
                {preview?.draftVersion === data.draft.version ? (
                  <span className={styles.validatedBadge}>Validated</span>
                ) : (
                  <span className={styles.draftBadge}>Needs validation</span>
                )}
              </div>
              <p>
                Check room, speaker, resource, travel, track, and capacity rules against draft v
                {data.draft.version}.
              </p>
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

            {preview?.conflicts.length ? (
              <section className={styles.conflictPanel} aria-labelledby="conflicts-heading">
                <h2 id="conflicts-heading">
                  {preview.conflicts.length} hard conflict
                  {preview.conflicts.length === 1 ? "" : "s"}
                </h2>
                <p>Hard conflicts block publication and cannot be overridden.</p>
                <ul>
                  {preview.conflicts.map((conflict) => (
                    <li key={conflict.id}>
                      <strong>{conflict.kind.replace("_", " ")}</strong>
                      <span>{conflict.message}</span>
                    </li>
                  ))}
                </ul>
              </section>
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

            <section className={styles.publishCard} aria-labelledby="publish-heading">
              <p className={styles.eyebrow}>Public revision</p>
              <h2 id="publish-heading">Publish agenda</h2>
              {currentRevision ? (
                <p>
                  Revision {currentRevision.number} is public with {currentRevision.sessionCount}
                  sessions. Published {formatRevisionTimestamp(currentRevision.publishedAt)}.
                </p>
              ) : (
                <p>No agenda revision has been published. Public embeds remain unavailable.</p>
              )}
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
              <button
                className={styles.publishButton}
                type="button"
                disabled={busy || !readiness.ready}
                onClick={() => void onPublish()}
              >
                {isBusyFor("publish") ? "Publishing..." : "Publish immutable revision"}
              </button>
              <small>
                Publishing atomically updates the public projection and queues cache, calendar, and
                integration notifications.
              </small>
            </section>

            {data.revisions.length > 0 ? (
              <section className={styles.historyCard} aria-labelledby="history-heading">
                <h2 id="history-heading">Revision history</h2>
                <ol>
                  {data.revisions.map((revision) => (
                    <li key={revision.id}>
                      <div>
                        <strong>Revision {revision.number}</strong>
                        {revision.current ? <span>Current</span> : null}
                      </div>
                      <small>
                        {revision.sessionCount} sessions,{" "}
                        {formatRevisionTimestamp(revision.publishedAt)}
                      </small>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </aside>
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
  const blockers = run?.validation?.conflicts ?? [];
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

  function toggleChange(changeId: string) {
    onSelectionChange(
      selectedChangeIds.includes(changeId)
        ? selectedChangeIds.filter((current) => current !== changeId)
        : [...selectedChangeIds, changeId],
    );
  }

  return (
    <section className={styles.inspectorCard} aria-labelledby="suggestion-heading">
      <div className={styles.inspectorHeading}>
        <div>
          <p className={styles.eyebrow}>Advisory assistant</p>
          <h2 id="suggestion-heading">Private agenda suggestions</h2>
        </div>
        {run ? <span className={styles.draftBadge}>Run v{run.version}</span> : null}
      </div>
      <p>
        Suggestions are private candidates only. They never change this draft or publish anything
        until an organizer explicitly selects and applies individual changes.
      </p>
      {run === null ? (
        eligibleUnscheduledCount === 0 ? (
          <div className={viewStyles.suggestionEmpty} role="status">
            <strong>No eligible unscheduled sessions</strong>
            <p>
              No eligible unscheduled accepted sessions are currently available. Accept a session
              before generating private placement suggestions. The current draft already contains
              every accepted session available to this assistant.
            </p>
          </div>
        ) : (
          <>
            <p role="status">No advisory suggestion run has been generated.</p>
            <div className={viewStyles.suggestionOptions}>
              <fieldset className={viewStyles.scheduleOptions}>
                <legend>Existing session times</legend>
                <label
                  className={`${viewStyles.scheduleOption} ${
                    existingSessionTimes === "keep" ? viewStyles.scheduleOptionSelected : ""
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
                  <span className={viewStyles.scheduleOptionCopy}>
                    <strong>Keep scheduled sessions fixed</strong>
                    <small>The generator preserves their current times.</small>
                  </span>
                </label>
                <label
                  className={`${viewStyles.scheduleOption} ${
                    existingSessionTimes === "move" ? viewStyles.scheduleOptionSelected : ""
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
                  <span className={viewStyles.scheduleOptionCopy}>
                    <strong>Allow scheduled sessions to move</strong>
                    <small>The generator may assign them different times.</small>
                  </span>
                </label>
              </fieldset>
              <fieldset className={viewStyles.roomOptions}>
                <legend>Existing room occupancy</legend>
                <label className={viewStyles.roomOption}>
                  <input
                    type="checkbox"
                    checked={ignoreExistingRooms}
                    disabled={suggestionOptionsDisabled}
                    onChange={(event) => setIgnoreExistingRooms(event.target.checked)}
                  />
                  <span className={viewStyles.scheduleOptionCopy}>
                    <strong>Ignore existing room occupancy when generating</strong>
                    <small>
                      The generator may place sessions in rooms that already have a scheduled
                      session.
                    </small>
                  </span>
                </label>
              </fieldset>
            </div>
            <button
              className={styles.secondaryButton}
              type="button"
              disabled={suggestionOptionsDisabled}
              onClick={() =>
                onGenerate
                  ? void onGenerate(
                      serializeAgendaSuggestionOptions(existingSessionTimes, ignoreExistingRooms),
                    )
                  : undefined
              }
            >
              {isBusyFor("generate-suggestion") ? "Generating..." : "Generate private suggestions"}
            </button>
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
            <p className={viewStyles.suggestionEmpty} role="status">
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
                {blockers.length} hard blocker{blockers.length === 1 ? "" : "s"} prevent application
              </strong>
              <p>Resolve blockers in the draft and regenerate. They cannot be overridden by AI.</p>
              <ul>
                {blockers.map((blocker) => (
                  <li key={blocker.id}>{blocker.message}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {run.status === "pending" ? (
            <div className={styles.formActions}>
              <button
                className={styles.secondaryButton}
                type="button"
                disabled={busy || onRegenerate === undefined}
                onClick={() => (onRegenerate ? void onRegenerate() : undefined)}
              >
                {isBusyFor("regenerate-suggestion") ? "Regenerating..." : "Regenerate"}
              </button>
              <button
                className={styles.textButton}
                type="button"
                disabled={busy || onReject === undefined}
                onClick={() => (onReject ? void onReject() : undefined)}
              >
                Reject run
              </button>
              <button
                className={styles.primaryButton}
                type="button"
                disabled={!canApply}
                onClick={() => (onApply ? void onApply(selectedAvailableChangeIds) : undefined)}
              >
                {isBusyFor("apply-suggestion") ? "Applying..." : "Apply selected changes"}
              </button>
            </div>
          ) : (
            <small>
              This run is closed. Generate or regenerate a new private candidate to continue.
            </small>
          )}
        </>
      )}
    </section>
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
  const localDemoApiRef = useRef<{ eventId: string; api: AgendaApi } | null>(null);
  const resolveLocalDemoApi = useCallback(
    async (signal?: AbortSignal) => {
      if (localDemoApiRef.current?.eventId === eventId) {
        return localDemoApiRef.current.api;
      }
      const environment = await resolveAgendaAppEnvironment(appEnvironment, signal);
      const localApi = createLocalAgendaDemoApi(environment, eventId);
      if (localApi) {
        localDemoApiRef.current = { eventId, api: localApi };
      }
      return localApi;
    },
    [appEnvironment, eventId],
  );
  const initialReadKey = useMemo(
    () => ({ api, resolveLocalDemoApi, scopeKey }),
    [api, resolveLocalDemoApi, scopeKey],
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
    return (
      mountedRef.current &&
      isAgendaAsyncScopeTokenCurrent(token, scopeKey, operationGenerationRef.current)
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
        mountedRef.current &&
        !signal?.aborted &&
        isAgendaAsyncScopeTokenCurrent(token, scopeKey, loadGenerationRef.current);

      if (loadIsCurrent()) {
        setLoading(true);
        setError(null);
        setStatusMessage(null);
      }
      try {
        const loaded = await (initialRead ??
          loadAgendaWorkspace(api, resolveLocalDemoApi, eventId, signal));
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
    [api, eventId, resolveLocalDemoApi, scopeKey],
  );

  useEffect(() => {
    const lease = initialReadCoordinator.acquire(initialReadKey, (signal) =>
      loadAgendaWorkspace(api, resolveLocalDemoApi, eventId, signal),
    );
    void load(lease.signal, lease.promise);
    return () => lease.release();
  }, [api, eventId, initialReadCoordinator, initialReadKey, load, resolveLocalDemoApi]);

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
    let authoritativeData = currentSnapshot.data;
    try {
      const nextData = await operation(currentSnapshot.api, currentSnapshot.data);
      if (!agendaWorkspaceDataMatchesEvent(nextData, eventId)) {
        throw new Error("The agenda mutation returned data for another event.");
      }
      if (!operationIsCurrent(token)) return false;
      authoritativeData = nextData;
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
        const failurePreview = previewFromError(mutationError, authoritativeData.draft.version);
        if (failurePreview) setPreview(failurePreview);
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
      if (previewError instanceof AgendaApiError) {
        const failurePreview = previewFromError(previewError, currentSnapshot.data.draft.version);
        if (failurePreview) setPreview(failurePreview);
      }
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
