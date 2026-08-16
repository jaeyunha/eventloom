"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useReducer, useRef } from "react";
import styles from "./embed.module.css";
import { publicAgendaDays, publishedEntryPresenters } from "./model";
import {
  PublicItineraryControls,
  PublicItineraryDayTabs,
  PublicItineraryResultBar,
  PublicItinerarySessionList,
} from "./public-itinerary-sections";
import type { PublishedAgendaEntry, PublishedProgram, PublishedSpeaker } from "./types";

const DESCRIPTION_LIMIT = 190;
const ITINERARY_EVENT_DATE_KEY_OPTIONS = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
} as const;
const ITINERARY_EVENT_DATE_KEY_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();
const ITINERARY_EVENT_DAY_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

function itineraryEventDateKeyFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = ITINERARY_EVENT_DATE_KEY_FORMATTER_CACHE.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en", {
    ...ITINERARY_EVENT_DATE_KEY_OPTIONS,
    timeZone,
  });
  ITINERARY_EVENT_DATE_KEY_FORMATTER_CACHE.set(timeZone, formatter);
  return formatter;
}

function uniqueValues(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort((left, right) =>
    left.localeCompare(right),
  );
}
function trackNameLabels(trackNames: readonly string[]): readonly ReactNode[] {
  const labels: ReactNode[] = [];
  for (const trackName of trackNames) {
    if (trackName.trim().length === 0) continue;
    labels.push(<span key={trackName}>Track: {trackName}</span>);
  }
  return labels;
}

function truncateDescription(value: string): string {
  if (value.length <= DESCRIPTION_LIMIT) return value;
  return `${value.slice(0, DESCRIPTION_LIMIT).trimEnd()}…`;
}

function eventDateKey(value: string, timeZone: string): string {
  const instant = new Date(value);
  if (Number.isNaN(instant.valueOf())) return "";
  const parts = itineraryEventDateKeyFormatter(timeZone).formatToParts(instant);
  const valueFor = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${valueFor("year")}-${valueFor("month")}-${valueFor("day")}`;
}

function eventBoundaryTimestamp(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) return null;
  const [year, month, day] = normalized.split("-").map(Number);
  const timestamp = Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0);
  const instant = new Date(timestamp);
  if (
    Number.isNaN(timestamp) ||
    instant.getUTCFullYear() !== year ||
    instant.getUTCMonth() !== (month ?? 0) - 1 ||
    instant.getUTCDate() !== day
  ) {
    return null;
  }
  return timestamp;
}

function eventDayLabel(date: string): string {
  return ITINERARY_EVENT_DAY_LABEL_FORMATTER.format(new Date(`${date}T00:00:00.000Z`));
}

function publicEventDays(
  entries: readonly PublishedAgendaEntry[],
  event: PublishedProgram["agenda"]["event"],
) {
  const agendaDays = publicAgendaDays(entries, event.timeZone);
  const startsAt = eventBoundaryTimestamp(event.startsOn);
  const endsAt = eventBoundaryTimestamp(event.endsOn);
  if (startsAt === null || endsAt === null || endsAt < startsAt) {
    return agendaDays;
  }
  const agendaDayByDate = new Map<string, (typeof agendaDays)[number]>();
  for (const day of agendaDays) {
    if (!agendaDayByDate.has(day.date)) agendaDayByDate.set(day.date, day);
  }

  const days = [];
  for (let timestamp = startsAt; timestamp <= endsAt; timestamp += 86_400_000) {
    const date = new Date(timestamp).toISOString().slice(0, 10);
    const existingDay = agendaDayByDate.get(date);
    days.push(
      existingDay ?? {
        date,
        label: eventDayLabel(date),
        entries: [],
      },
    );
  }

  const boundaryDates = new Set(days.map((day) => day.date));
  for (const day of agendaDays) {
    if (!boundaryDates.has(day.date)) {
      days.push(day);
    }
  }
  return days.sort((left, right) => left.date.localeCompare(right.date));
}

function speakerRole(speaker: PublishedSpeaker): string {
  const jobTitle = speaker.jobTitle?.trim() ?? "";
  const organization = speaker.organization?.trim() ?? "";
  return [jobTitle, organization].filter(Boolean).join(" · ") || "Speaker";
}

function entryMatchesQuery(
  entry: PublishedAgendaEntry,
  speakers: readonly PublishedSpeaker[],
  query: string,
): boolean {
  if (!query) return true;
  const presenters = publishedEntryPresenters(entry, speakers);
  const speakerDetails = presenters.flatMap((presenter) => {
    const speaker = presenter.speaker;
    return speaker ? [speaker.jobTitle, speaker.organization, speaker.biography] : [];
  });
  return [entry.title, ...presenters.map((presenter) => presenter.displayName), ...speakerDetails]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLocaleLowerCase()
    .includes(query);
}

function icsEscape(value: string): string {
  return value
    .replace(/\\/gu, "\\\\")
    .replace(/;/gu, "\\;")
    .replace(/,/gu, "\\,")
    .replace(/\r?\n/gu, "\\n");
}

function icsTimestamp(value: string): string {
  const instant = new Date(value);
  if (Number.isNaN(instant.valueOf())) return "";
  return instant
    .toISOString()
    .replace(/[-:]/gu, "")
    .replace(/\.\d{3}Z$/u, "Z");
}

function createCalendar(
  eventName: string,
  eventSlug: string,
  entries: readonly PublishedAgendaEntry[],
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "METHOD:PUBLISH",
    "PRODID:-//Eventloom//Public Schedule//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${icsEscape(eventName)}`,
  ];
  for (const entry of entries) {
    const startsAt = icsTimestamp(entry.startsAt);
    const endsAt = icsTimestamp(entry.endsAt);
    if (!startsAt || !endsAt) continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${icsEscape(`${entry.sessionId}@${eventSlug}`)}`,
      `DTSTAMP:${icsTimestamp(new Date().toISOString())}`,
      `DTSTART:${startsAt}`,
      `DTEND:${endsAt}`,
      `SUMMARY:${icsEscape(entry.title)}`,
      `DESCRIPTION:${icsEscape(entry.summary)}`,
      `LOCATION:${icsEscape(entry.roomName)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

type PublicItineraryState = {
  readonly activeDay: string;
  readonly query: string;
  readonly track: string;
  readonly format: string;
  readonly room: string;
  readonly filtersOpen: boolean;
  readonly personalOnly: boolean;
  readonly expandedDescriptions: ReadonlySet<string>;
  readonly expandedDetails: ReadonlySet<string>;
  readonly selectedIds: readonly string[];
  readonly exportMessage: string;
};

type PublicItineraryAction =
  | { readonly type: "set-active-day"; readonly value: string }
  | { readonly type: "set-query"; readonly value: string }
  | { readonly type: "set-track"; readonly value: string }
  | { readonly type: "set-format"; readonly value: string }
  | { readonly type: "set-room"; readonly value: string }
  | { readonly type: "toggle-filters" }
  | { readonly type: "select-day"; readonly value: string }
  | { readonly type: "toggle-personal-view" }
  | { readonly type: "clear-filters" }
  | { readonly type: "toggle-selected"; readonly entryId: string }
  | { readonly type: "set-selected-ids"; readonly value: readonly string[] }
  | { readonly type: "set-export-message"; readonly value: string }
  | { readonly type: "toggle-description"; readonly entryId: string }
  | { readonly type: "toggle-details"; readonly entryId: string };

function publicItineraryInitialState(activeDay: string): PublicItineraryState {
  return {
    activeDay,
    query: "",
    track: "",
    format: "",
    room: "",
    filtersOpen: false,
    personalOnly: false,
    expandedDescriptions: new Set(),
    expandedDetails: new Set(),
    selectedIds: [],
    exportMessage: "",
  };
}

function publicItineraryReducer(
  state: PublicItineraryState,
  action: PublicItineraryAction,
): PublicItineraryState {
  switch (action.type) {
    case "set-active-day":
      return { ...state, activeDay: action.value };
    case "set-query":
      return { ...state, query: action.value };
    case "set-track":
      return { ...state, track: action.value };
    case "set-format":
      return { ...state, format: action.value };
    case "set-room":
      return { ...state, room: action.value };
    case "toggle-filters":
      return { ...state, filtersOpen: !state.filtersOpen };
    case "select-day":
      return { ...state, activeDay: action.value, personalOnly: false };
    case "toggle-personal-view":
      return {
        ...state,
        personalOnly: !state.personalOnly,
        query: "",
        track: "",
        format: "",
        room: "",
      };
    case "clear-filters":
      return { ...state, query: "", track: "", format: "", room: "" };
    case "toggle-selected": {
      const selectedIds = state.selectedIds.includes(action.entryId)
        ? state.selectedIds.filter((id) => id !== action.entryId)
        : [...state.selectedIds, action.entryId];
      return { ...state, selectedIds, exportMessage: "" };
    }
    case "set-selected-ids":
      return { ...state, selectedIds: action.value };
    case "set-export-message":
      return { ...state, exportMessage: action.value };
    case "toggle-description": {
      const expandedDescriptions = new Set(state.expandedDescriptions);
      if (expandedDescriptions.has(action.entryId)) expandedDescriptions.delete(action.entryId);
      else expandedDescriptions.add(action.entryId);
      return { ...state, expandedDescriptions };
    }
    case "toggle-details": {
      const expandedDetails = new Set(state.expandedDetails);
      if (expandedDetails.has(action.entryId)) expandedDetails.delete(action.entryId);
      else expandedDetails.add(action.entryId);
      return { ...state, expandedDetails };
    }
  }
  return state;
}
export function PublicItineraryView({ program }: Readonly<{ program: PublishedProgram }>) {
  const { agenda, speakers } = program;
  const storageKey = `eventloom:public-schedule:${agenda.event.slug}`;
  const legacyStorageKey = `open-sessionboard:public-schedule:${agenda.event.slug}`;
  const days = useMemo(
    () => publicEventDays(agenda.entries, agenda.event),
    [agenda.entries, agenda.event],
  );
  const [state, dispatch] = useReducer(
    publicItineraryReducer,
    days[0]?.date ?? "",
    publicItineraryInitialState,
  );
  const {
    activeDay,
    query,
    track,
    format,
    room,
    filtersOpen,
    personalOnly,
    expandedDescriptions,
    expandedDetails,
    selectedIds,
    exportMessage,
  } = state;
  const storageKeyRef = useRef(storageKey);
  const storageLoadedRef = useRef(false);
  const hydratedSelectedIdsRef = useRef<readonly string[] | null>(null);
  const hydrationPendingRef = useRef(false);

  useEffect(() => {
    if (!days.some((day) => day.date === activeDay)) {
      dispatch({ type: "set-active-day", value: days[0]?.date ?? "" });
    }
  }, [activeDay, days]);

  useEffect(() => {
    storageKeyRef.current = storageKey;
    hydrationPendingRef.current = true;
    storageLoadedRef.current = false;
    try {
      const current = window.localStorage.getItem(storageKey);
      const stored = current ?? window.localStorage.getItem(legacyStorageKey);
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      const availableIds = new Set(agenda.entries.map((entry) => entry.id));
      const selected = Array.isArray(parsed)
        ? parsed.filter(
            (value): value is string => typeof value === "string" && availableIds.has(value),
          )
        : [];
      hydratedSelectedIdsRef.current = selected;
      dispatch({ type: "set-selected-ids", value: selected });
      if (current === null && stored !== null) {
        window.localStorage.setItem(storageKey, JSON.stringify(selected));
        window.localStorage.removeItem(legacyStorageKey);
      }
    } catch {
      const selected: readonly string[] = [];
      hydratedSelectedIdsRef.current = selected;
      dispatch({ type: "set-selected-ids", value: selected });
    } finally {
      storageLoadedRef.current = true;
    }
  }, [agenda.entries, legacyStorageKey, storageKey]);

  useEffect(() => {
    if (!storageLoadedRef.current) return;
    if (hydrationPendingRef.current) {
      hydrationPendingRef.current = false;
      return;
    }
    if (selectedIds === hydratedSelectedIdsRef.current) return;
    try {
      window.localStorage.setItem(storageKeyRef.current, JSON.stringify(selectedIds));
      hydratedSelectedIdsRef.current = selectedIds;
    } catch {
      // Private browsing and embedded contexts may deny storage; the controls still work in memory.
    }
  }, [selectedIds]);

  const tracks = useMemo(
    () => uniqueValues(agenda.entries.flatMap((entry) => entry.trackNames)),
    [agenda.entries],
  );
  const formats = useMemo(
    () => uniqueValues(agenda.entries.map((entry) => entry.format)),
    [agenda.entries],
  );
  const rooms = useMemo(
    () => uniqueValues(agenda.entries.map((entry) => entry.roomName)),
    [agenda.entries],
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredEntries = useMemo(
    () =>
      [...agenda.entries]
        .filter((entry) => {
          if (track && !entry.trackNames.includes(track)) return false;
          if (format && entry.format !== format) return false;
          if (room && entry.roomName !== room) return false;
          return entryMatchesQuery(entry, speakers.speakers, normalizedQuery);
        })
        .sort((left, right) => {
          const leftStart = Date.parse(left.startsAt);
          const rightStart = Date.parse(right.startsAt);
          if (!Number.isNaN(leftStart) && !Number.isNaN(rightStart)) {
            return leftStart - rightStart;
          }
          return left.startsAt.localeCompare(right.startsAt);
        }),
    [agenda.entries, format, normalizedQuery, room, speakers.speakers, track],
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visibleEntries = useMemo(
    () =>
      filteredEntries.filter((entry) => {
        if (personalOnly) return selectedSet.has(entry.id);
        return eventDateKey(entry.startsAt, agenda.event.timeZone) === activeDay;
      }),
    [activeDay, agenda.event.timeZone, filteredEntries, personalOnly, selectedSet],
  );
  const visibleDays = useMemo(
    () => publicAgendaDays(visibleEntries, agenda.event.timeZone),
    [agenda.event.timeZone, visibleEntries],
  );
  const hasFilters = Boolean(query || track || format || room);

  const clearFilters = () => {
    dispatch({ type: "clear-filters" });
  };
  const toggleSelected = (entryId: string) => {
    dispatch({ type: "toggle-selected", entryId });
  };
  const togglePersonalView = () => {
    dispatch({ type: "toggle-personal-view" });
  };
  const downloadCalendar = () => {
    const selectedEntries = agenda.entries.filter((entry) => selectedSet.has(entry.id));
    const entries = selectedEntries.length > 0 ? selectedEntries : visibleEntries;
    if (entries.length === 0) {
      dispatch({
        type: "set-export-message",
        value: "Add a session before downloading a calendar file.",
      });
      return;
    }
    if (typeof Blob !== "function" || typeof URL.createObjectURL !== "function") {
      dispatch({
        type: "set-export-message",
        value: "Calendar downloads are not supported in this browser.",
      });
      return;
    }
    const blob = new Blob([createCalendar(agenda.event.name, agenda.event.slug, entries)], {
      type: "text/calendar;charset=utf-8",
    });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${agenda.event.slug.replace(/[^a-z0-9]+/giu, "-") || "event"}-schedule.ics`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    dispatch({
      type: "set-export-message",
      value: `Downloaded ${entries.length} session${entries.length === 1 ? "" : "s"} for your calendar.`,
    });
  };

  return (
    <section aria-labelledby="itinerary-heading">
      <div className={styles.viewHeading}>
        <div>
          <p className={styles.eyebrow}>Plan your day</p>
          <h2 id="itinerary-heading">Itinerary</h2>
          <p>Chronological sessions from the immutable published agenda.</p>
        </div>
      </div>

      <PublicItineraryControls
        query={query}
        filtersOpen={filtersOpen}
        personalOnly={personalOnly}
        selectedCount={selectedIds.length}
        totalCount={agenda.entries.length}
        track={track}
        format={format}
        room={room}
        tracks={tracks}
        formats={formats}
        rooms={rooms}
        hasFilters={hasFilters}
        onQueryChange={(value) => dispatch({ type: "set-query", value })}
        onToggleFilters={() => dispatch({ type: "toggle-filters" })}
        onTogglePersonalView={togglePersonalView}
        onDownloadCalendar={downloadCalendar}
        onClearFilters={clearFilters}
        onTrackChange={(value) => dispatch({ type: "set-track", value })}
        onFormatChange={(value) => dispatch({ type: "set-format", value })}
        onRoomChange={(value) => dispatch({ type: "set-room", value })}
      />

      <PublicItineraryResultBar
        personalOnly={personalOnly}
        visibleCount={visibleEntries.length}
        totalCount={agenda.entries.length}
        selectedCount={selectedIds.length}
        exportMessage={exportMessage}
      />

      <PublicItineraryDayTabs
        days={days}
        activeDay={activeDay}
        personalOnly={personalOnly}
        visibleDays={visibleDays}
        onSelectDay={(value) => dispatch({ type: "select-day", value })}
      />

      <PublicItinerarySessionList
        visibleEntries={visibleEntries}
        visibleDays={visibleDays}
        personalOnly={personalOnly}
        timeZone={agenda.event.timeZone}
        speakers={speakers.speakers}
        selectedSet={selectedSet}
        expandedDescriptions={expandedDescriptions}
        expandedDetails={expandedDetails}
        onToggleSelected={toggleSelected}
        onToggleDescription={(entryId) => dispatch({ type: "toggle-description", entryId })}
        onToggleDetails={(entryId) => dispatch({ type: "toggle-details", entryId })}
        renderTrackLabels={trackNameLabels}
        truncateDescription={truncateDescription}
        renderSpeakerRole={speakerRole}
        descriptionLimit={DESCRIPTION_LIMIT}
      />
    </section>
  );
}
