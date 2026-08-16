"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./embed.module.css";
import {
  formatPublishedDateTimeRange,
  formatPublishedSessionSchedule,
  publicAgendaDays,
  publishedEntryPresenters,
} from "./model";
import type { PublishedAgendaEntry, PublishedProgram, PublishedSpeaker } from "./types";

const DESCRIPTION_LIMIT = 190;

function uniqueValues(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function truncateDescription(value: string): string {
  if (value.length <= DESCRIPTION_LIMIT) return value;
  return `${value.slice(0, DESCRIPTION_LIMIT).trimEnd()}…`;
}

function eventDateKey(value: string, timeZone: string): string {
  const instant = new Date(value);
  if (Number.isNaN(instant.valueOf())) return "";
  const parts = new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(instant);
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
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
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

export function PublicItineraryView({ program }: Readonly<{ program: PublishedProgram }>) {
  const { agenda, speakers } = program;
  const storageKey = `eventloom:public-schedule:${agenda.event.slug}`;
  const legacyStorageKey = `open-sessionboard:public-schedule:${agenda.event.slug}`;
  const days = useMemo(
    () => publicEventDays(agenda.entries, agenda.event),
    [agenda.entries, agenda.event],
  );
  const [activeDay, setActiveDay] = useState(days[0]?.date ?? "");
  const [query, setQuery] = useState("");
  const [track, setTrack] = useState("");
  const [format, setFormat] = useState("");
  const [room, setRoom] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [personalOnly, setPersonalOnly] = useState(false);
  const [expandedDescriptions, setExpandedDescriptions] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [expandedDetails, setExpandedDetails] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [loadedStorageKey, setLoadedStorageKey] = useState("");
  const [exportMessage, setExportMessage] = useState("");

  useEffect(() => {
    if (!days.some((day) => day.date === activeDay)) setActiveDay(days[0]?.date ?? "");
  }, [activeDay, days]);

  useEffect(() => {
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
      setSelectedIds(selected);
      if (current === null && stored !== null) {
        window.localStorage.setItem(storageKey, JSON.stringify(selected));
        window.localStorage.removeItem(legacyStorageKey);
      }
    } catch {
      setSelectedIds([]);
    } finally {
      setLoadedStorageKey(storageKey);
      setStorageReady(true);
    }
  }, [agenda.entries, legacyStorageKey, storageKey]);

  useEffect(() => {
    if (!storageReady || loadedStorageKey !== storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(selectedIds));
    } catch {
      // Private browsing and embedded contexts may deny storage; the controls still work in memory.
    }
  }, [loadedStorageKey, selectedIds, storageKey, storageReady]);

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
    setQuery("");
    setTrack("");
    setFormat("");
    setRoom("");
  };
  const toggleSelected = (entryId: string) => {
    setExportMessage("");
    setSelectedIds((current) =>
      current.includes(entryId) ? current.filter((id) => id !== entryId) : [...current, entryId],
    );
  };
  const togglePersonalView = () => {
    setPersonalOnly((current) => !current);
    setQuery("");
    setTrack("");
    setFormat("");
    setRoom("");
  };
  const downloadCalendar = () => {
    const selectedEntries = agenda.entries.filter((entry) => selectedSet.has(entry.id));
    const entries = selectedEntries.length > 0 ? selectedEntries : visibleEntries;
    if (entries.length === 0) {
      setExportMessage("Add a session before downloading a calendar file.");
      return;
    }
    if (typeof Blob !== "function" || typeof URL.createObjectURL !== "function") {
      setExportMessage("Calendar downloads are not supported in this browser.");
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
    setExportMessage(
      `Downloaded ${entries.length} session${entries.length === 1 ? "" : "s"} for your calendar.`,
    );
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

      <search>
        <form className={styles.filters} onSubmit={(event) => event.preventDefault()}>
          <label>
            <span>Search sessions or speakers</span>
            <input
              type="search"
              value={query}
              placeholder="Search by title or speaker"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button
            className={styles.clearButton}
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="itinerary-filters"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            {filtersOpen ? "Hide filters" : "Filters"}
          </button>
          <button
            className={`${styles.clearButton} ${styles.scheduleToggle}`}
            type="button"
            aria-pressed={personalOnly}
            onClick={togglePersonalView}
          >
            {personalOnly
              ? `All sessions (${agenda.entries.length})`
              : `My schedule (${selectedIds.length})`}
          </button>
          <button
            className={`${styles.clearButton} ${styles.exportButton}`}
            type="button"
            onClick={downloadCalendar}
          >
            Download calendar (.ics)
          </button>
          {hasFilters ? (
            <button className={styles.clearButton} type="button" onClick={clearFilters}>
              Clear filters
            </button>
          ) : null}
        </form>
        <fieldset
          id="itinerary-filters"
          className={styles.filters}
          aria-label="Itinerary filters"
          hidden={!filtersOpen}
        >
          <label>
            <span>Track</span>
            <select value={track} onChange={(event) => setTrack(event.target.value)}>
              <option value="">All tracks</option>
              {tracks.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Format</span>
            <select value={format} onChange={(event) => setFormat(event.target.value)}>
              <option value="">All formats</option>
              {formats.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Location</span>
            <select value={room} onChange={(event) => setRoom(event.target.value)}>
              <option value="">All locations</option>
              {rooms.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
      </search>

      <div className={styles.resultBar} role="status" aria-live="polite">
        <span>
          {personalOnly
            ? `My schedule: ${visibleEntries.length} session${visibleEntries.length === 1 ? "" : "s"}`
            : `${visibleEntries.length} of ${agenda.entries.length} session${agenda.entries.length === 1 ? "" : "s"}`}
        </span>
        <span>{selectedIds.length} saved</span>
      </div>
      {exportMessage ? (
        <p className={styles.exportMessage} role="status" aria-live="polite">
          {exportMessage}
        </p>
      ) : null}

      <div role="tablist" aria-label="Event days" className={styles.itineraryTabs}>
        {days.map((day) => {
          const panelId = `itinerary-panel-${day.date}`;
          const tabId = `itinerary-tab-${day.date}`;
          return (
            <button
              key={day.date}
              id={tabId}
              className={styles.clearButton}
              type="button"
              role="tab"
              aria-selected={!personalOnly && activeDay === day.date}
              aria-controls={
                visibleDays.some((candidate) => candidate.date === day.date) ? panelId : undefined
              }
              onClick={() => {
                setPersonalOnly(false);
                setActiveDay(day.date);
              }}
              onKeyDown={(event) => {
                const currentIndex = days.findIndex((candidate) => candidate.date === day.date);
                if (currentIndex < 0 || days.length < 2) return;
                let nextIndex = -1;
                if (event.key === "ArrowRight") {
                  nextIndex = (currentIndex + 1) % days.length;
                } else if (event.key === "ArrowLeft") {
                  nextIndex = (currentIndex - 1 + days.length) % days.length;
                } else if (event.key === "Home") {
                  nextIndex = 0;
                } else if (event.key === "End") {
                  nextIndex = days.length - 1;
                }
                if (nextIndex < 0) return;
                event.preventDefault();
                setPersonalOnly(false);
                const nextDay = days[nextIndex];
                if (nextDay) {
                  setActiveDay(nextDay.date);
                  document.getElementById(`itinerary-tab-${nextDay.date}`)?.focus();
                }
              }}
            >
              {day.label}
            </button>
          );
        })}
      </div>

      {visibleEntries.length === 0 ? (
        <div className={styles.emptyResult} role="status">
          <h3>{personalOnly ? "Your schedule is empty" : "No sessions match this day"}</h3>
          <p>
            {personalOnly
              ? "Use Add to my schedule on a session card to build a personal itinerary."
              : "Choose another day or clear your filters to keep browsing."}
          </p>
        </div>
      ) : (
        <div className={styles.publicDays}>
          {visibleDays.map((day) => (
            <section
              key={day.date}
              id={`itinerary-panel-${day.date}`}
              role="tabpanel"
              aria-labelledby={`itinerary-tab-${day.date}`}
            >
              <ol className={styles.publicSessionList}>
                {[...day.entries]
                  .sort((left, right) => {
                    const leftStart = Date.parse(left.startsAt);
                    const rightStart = Date.parse(right.startsAt);
                    if (!Number.isNaN(leftStart) && !Number.isNaN(rightStart)) {
                      return leftStart - rightStart;
                    }
                    return left.startsAt.localeCompare(right.startsAt);
                  })
                  .map((entry) => {
                    const presenters = publishedEntryPresenters(entry, program.speakers.speakers);
                    const schedule = formatPublishedSessionSchedule(
                      entry.startsAt,
                      entry.endsAt,
                      agenda.event.timeZone,
                    );
                    const isDescriptionExpanded = expandedDescriptions.has(entry.id);
                    const isDetailsExpanded = expandedDetails.has(entry.id);
                    const isSelected = selectedSet.has(entry.id);
                    const hasLongDescription = entry.summary.length > DESCRIPTION_LIMIT;
                    const hasDescription = entry.summary.trim().length > 0;
                    return (
                      <li key={entry.id}>
                        <article className={styles.publicSessionCard}>
                          <div className={styles.publicSessionTime}>
                            <time dateTime={entry.startsAt} className={styles.sessionDate}>
                              {schedule.dateLabel}
                            </time>
                            <time dateTime={entry.endsAt} className={styles.sessionClock}>
                              <span>{schedule.startTimeLabel}</span>
                              <span aria-hidden="true">–</span>
                              <span>{schedule.endTimeLabel}</span>
                            </time>
                          </div>
                          <div className={styles.publicSessionCopy}>
                            <div className={styles.publicSessionMeta}>
                              {entry.trackNames
                                .filter((trackName) => trackName.trim().length > 0)
                                .map((trackName) => (
                                  <span key={trackName}>Track: {trackName}</span>
                                ))}
                              {entry.format.trim() ? <span>Format: {entry.format}</span> : null}
                            </div>
                            <h4>{entry.title}</h4>
                            {hasDescription ? (
                              <p id={`itinerary-summary-${entry.id}`}>
                                {isDescriptionExpanded || !hasLongDescription
                                  ? entry.summary
                                  : truncateDescription(entry.summary)}
                              </p>
                            ) : (
                              <p>No description was published.</p>
                            )}
                            {hasLongDescription ? (
                              <button
                                className={styles.clearButton}
                                type="button"
                                aria-expanded={isDescriptionExpanded}
                                aria-controls={`itinerary-summary-${entry.id}`}
                                onClick={() =>
                                  setExpandedDescriptions((current) => {
                                    const next = new Set(current);
                                    if (next.has(entry.id)) next.delete(entry.id);
                                    else next.add(entry.id);
                                    return next;
                                  })
                                }
                              >
                                {isDescriptionExpanded ? "Show less" : "Show more"}
                              </button>
                            ) : null}
                            <p className={styles.publicSpeakers}>
                              <strong>Speakers</strong>
                            </p>
                            {presenters.length > 0 ? (
                              <ul>
                                {presenters.map((presenter) => (
                                  <li key={presenter.key}>
                                    {presenter.speaker
                                      ? `${presenter.displayName} (${speakerRole(
                                          presenter.speaker,
                                        )})`
                                      : presenter.displayName}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p>No speakers listed</p>
                            )}
                            <p>
                              <strong>Format:</strong> {entry.format || "Format not published"}
                              {entry.trackNames.length > 0 ? (
                                <>
                                  {" · "}
                                  <strong>Track:</strong> {entry.trackNames.join(", ")}
                                </>
                              ) : null}
                            </p>
                            <div id={`itinerary-details-${entry.id}`} hidden={!isDetailsExpanded}>
                              <p>
                                <strong>Session details:</strong>{" "}
                                {formatPublishedDateTimeRange(
                                  entry.startsAt,
                                  entry.endsAt,
                                  agenda.event.timeZone,
                                )}
                              </p>
                              <p>
                                <strong>Room:</strong> {entry.roomName || "Room not published"}
                              </p>
                              <p>{entry.summary || "No additional description was published."}</p>
                            </div>
                            <button
                              className={styles.clearButton}
                              type="button"
                              aria-expanded={isDetailsExpanded}
                              aria-controls={`itinerary-details-${entry.id}`}
                              onClick={() =>
                                setExpandedDetails((current) => {
                                  const next = new Set(current);
                                  if (next.has(entry.id)) next.delete(entry.id);
                                  else next.add(entry.id);
                                  return next;
                                })
                              }
                            >
                              {isDetailsExpanded ? "Hide Details" : "View Details"}
                            </button>
                          </div>
                          <div className={styles.publicRoom}>
                            <span>Location</span>
                            <strong>{entry.roomName || "Location to be announced"}</strong>
                            <button
                              className={styles.clearButton}
                              type="button"
                              aria-pressed={isSelected}
                              onClick={() => toggleSelected(entry.id)}
                            >
                              {isSelected ? "Remove from my schedule" : "Add to my schedule"}
                            </button>
                          </div>
                        </article>
                      </li>
                    );
                  })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
