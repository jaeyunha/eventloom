"use client";

import type { RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { publishedProjectionsMatch } from "./api";
import styles from "./embed.module.css";
import type { EmbedDisplayField, EmbedLayout } from "./model";
import {
  filterAgendaEntries,
  formatPublishedDateTimeRange,
  formatPublishedSessionSchedule,
  publicAgendaDays,
  publishedEntryPresenters,
  uniqueSorted,
} from "./model";
import type {
  PublishedAgenda,
  PublishedAgendaEntry,
  PublishedProgram,
  PublishedSpeaker,
} from "./types";

function uniqueValues(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function speakerRole(speaker: PublishedSpeaker): string {
  const jobTitle = speaker.jobTitle?.trim() ?? "";
  const organization = speaker.organization?.trim() ?? "";
  return [jobTitle, organization].filter(Boolean).join(" · ") || "Speaker";
}

function entrySearchText(
  entry: PublishedAgendaEntry,
  speakers: readonly PublishedSpeaker[],
): string {
  const presenters = publishedEntryPresenters(entry, speakers);
  const speakerDetails = presenters.flatMap((presenter) => {
    const speaker = presenter.speaker;
    return speaker ? [speaker.jobTitle, speaker.organization, speaker.biography] : [];
  });
  return [entry.title, ...presenters.map((presenter) => presenter.displayName), ...speakerDetails]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLocaleLowerCase();
}

export function PublicAgendaSessionDetail({
  entry,
  displayTimeZone,
  onBack,
  backButtonRef,
  speakers = [],
}: Readonly<{
  entry: PublishedAgendaEntry;
  displayTimeZone: string;
  onBack: () => void;
  backButtonRef?: RefObject<HTMLButtonElement | null>;
  speakers?: readonly PublishedSpeaker[];
}>) {
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const presenters = publishedEntryPresenters(entry, speakers);
  const hasDescription = entry.summary.trim().length > 0;
  const hasLongDescription = entry.summary.length > 320;
  return (
    <section aria-labelledby="agenda-detail-heading" aria-modal="true" role="dialog">
      <div className={styles.viewHeading}>
        <div>
          <p className={styles.eyebrow}>Agenda session detail</p>
          <h2 id="agenda-detail-heading">{entry.title}</h2>
          <p>Published session information from the current agenda revision.</p>
        </div>
        <button ref={backButtonRef} className={styles.clearButton} type="button" onClick={onBack}>
          Back to agenda
        </button>
      </div>

      <article className={styles.publicSessionCard}>
        <div className={styles.publicSessionTime}>
          <span>Time</span>
          <time dateTime={entry.startsAt}>
            {formatPublishedDateTimeRange(entry.startsAt, entry.endsAt, displayTimeZone)}
          </time>
        </div>
        <div className={styles.publicSessionCopy}>
          <div className={styles.publicSessionMeta}>
            {entry.format.trim() ? <span>Format: {entry.format}</span> : null}
            {entry.trackNames
              .filter((trackName) => trackName.trim().length > 0)
              .map((trackName) => (
                <span key={trackName}>Track: {trackName}</span>
              ))}
          </div>
          <h3>Session details</h3>
          {hasDescription ? (
            <p
              id={`agenda-summary-${entry.id}`}
              className={descriptionExpanded ? undefined : styles.biography}
            >
              {entry.summary}
            </p>
          ) : (
            <p>No description was published.</p>
          )}
          {hasLongDescription ? (
            <button
              className={styles.clearButton}
              type="button"
              aria-expanded={descriptionExpanded}
              aria-controls={`agenda-summary-${entry.id}`}
              onClick={() => setDescriptionExpanded((expanded) => !expanded)}
            >
              {descriptionExpanded ? "Show less" : "Show more"}
            </button>
          ) : null}
          {presenters.length > 0 ? (
            <div className={styles.publicSpeakers}>
              <strong>Speakers</strong>
              <ul>
                {presenters.map((presenter) => (
                  <li key={presenter.key}>
                    {presenter.speaker ? (
                      <>
                        <span>{presenter.displayName}</span>{" "}
                        <span>({speakerRole(presenter.speaker)})</span>
                      </>
                    ) : (
                      presenter.displayName
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p>
            <strong>Format:</strong> {entry.format || "Format not published"}
          </p>
          <p>
            <strong>Track:</strong>{" "}
            {entry.trackNames.filter((trackName) => trackName.trim().length > 0).join(", ") ||
              "Track not published"}
          </p>
        </div>
        <div className={styles.publicRoom}>
          <span>Room</span>
          <strong>{entry.roomName || "Room not published"}</strong>
        </div>
      </article>
    </section>
  );
}
type PublishedAgendaFeedFlags = {
  readonly json?: boolean;
  readonly ics?: boolean;
};

function publishedFeedAvailable(
  agenda: PublishedAgenda,
  format: keyof PublishedAgendaFeedFlags,
): boolean {
  const feeds = (agenda as PublishedAgenda & { readonly feeds?: unknown }).feeds;
  if (feeds === null || typeof feeds !== "object" || Array.isArray(feeds)) return true;
  const value = (feeds as PublishedAgendaFeedFlags)[format];
  return value !== false;
}

export interface PublicAgendaViewProps {
  readonly program: PublishedProgram;
  readonly layout?: EmbedLayout | null;
  readonly tracks?: readonly string[];
  readonly displayFields?: readonly EmbedDisplayField[] | null;
}
const EMPTY_TRACK_LIST: readonly string[] = [];

const DEFAULT_AGENDA_DISPLAY_FIELDS: readonly EmbedDisplayField[] = [
  "title",
  "date-time",
  "room",
  "speakers",
  "format",
  "track",
  "summary",
];

function agendaIncludeField(
  displayFields: readonly EmbedDisplayField[],
  field: EmbedDisplayField,
): boolean {
  return displayFields.includes(field);
}

export function PublicAgendaView({
  program,
  layout = null,
  tracks: trackList = EMPTY_TRACK_LIST,
  displayFields = null,
}: Readonly<PublicAgendaViewProps>) {
  const { agenda } = program;
  const speakers = publishedProjectionsMatch(program.agenda, program.speakers)
    ? program.speakers.speakers
    : [];
  const displayFieldList = displayFields ?? DEFAULT_AGENDA_DISPLAY_FIELDS;
  const showField = (field: EmbedDisplayField): boolean =>
    agendaIncludeField(displayFieldList, field);
  const [day, setDay] = useState("");
  const [query, setQuery] = useState("");
  const [track, setTrack] = useState("");
  const [format, setFormat] = useState("");
  const [room, setRoom] = useState("");
  const [viewerLocal, setViewerLocal] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const eventDays = useMemo(
    () => publicAgendaDays(agenda.entries, agenda.event.timeZone, agenda.event),
    [agenda.entries, agenda.event],
  );
  const tracks = useMemo(
    () =>
      uniqueSorted(agenda.entries.map((entry) => entry.trackNames)).filter(
        (trackName) => trackName.trim().length > 0,
      ),
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
  const visibleEntries = useMemo(
    () =>
      filterAgendaEntries(agenda.entries, day, track, agenda.event.timeZone).filter(
        (entry) =>
          (!format || entry.format === format) &&
          (!room || entry.roomName === room) &&
          (trackList.length === 0 ||
            trackList.some((trackName) => entry.trackNames.includes(trackName))) &&
          (!normalizedQuery || entrySearchText(entry, speakers).includes(normalizedQuery)),
      ),
    [
      agenda.entries,
      agenda.event.timeZone,
      day,
      format,
      normalizedQuery,
      speakers,
      room,
      track,
      trackList,
    ],
  );
  const hasFacetFilters = Boolean(normalizedQuery || track || format || room);
  const visibleDays = useMemo(() => {
    const days = publicAgendaDays(visibleEntries, agenda.event.timeZone, agenda.event);
    return day ? days.filter((eventDay) => eventDay.date === day) : days;
  }, [agenda.event, day, visibleEntries]);
  const viewerTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const displayTimeZone = viewerLocal ? viewerTimeZone : agenda.event.timeZone;
  const publicBase = `/api/public/events/${encodeURIComponent(agenda.event.slug)}`;
  const jsonFeedAvailable = publishedFeedAvailable(agenda, "json");
  const icsFeedAvailable = publishedFeedAvailable(agenda, "ics");
  const selectedEntry = selectedEntryId
    ? agenda.entries.find((entry) => entry.id === selectedEntryId)
    : undefined;

  useEffect(() => {
    if (selectedEntryId !== null && selectedEntry) {
      backButtonRef.current?.focus();
      return;
    }
    const returnFocusTarget = returnFocusRef.current;
    if (returnFocusTarget?.isConnected) {
      returnFocusTarget.focus();
    } else if (returnFocusTarget?.id) {
      document.getElementById(returnFocusTarget.id)?.focus();
    }
    returnFocusRef.current = null;
  }, [selectedEntry, selectedEntryId]);
  useEffect(() => {
    if (day !== "" && !eventDays.some((eventDay) => eventDay.date === day)) {
      setDay("");
    }
    if (track !== "" && !tracks.includes(track)) {
      setTrack("");
    }
    if (format !== "" && !formats.includes(format)) {
      setFormat("");
    }
    if (room !== "" && !rooms.includes(room)) {
      setRoom("");
    }
  }, [day, eventDays, format, formats, room, rooms, track, tracks]);

  const openEntry = (entryId: string, target: HTMLElement) => {
    returnFocusRef.current = target;
    setSelectedEntryId(entryId);
  };
  const closeEntry = () => setSelectedEntryId(null);

  if (selectedEntry) {
    return (
      <PublicAgendaSessionDetail
        entry={selectedEntry}
        displayTimeZone={displayTimeZone}
        onBack={closeEntry}
        backButtonRef={backButtonRef}
        speakers={speakers}
      />
    );
  }

  return (
    <section aria-labelledby="agenda-heading" data-layout={layout ?? undefined}>
      <div className={styles.viewHeading}>
        <div>
          <p className={styles.eyebrow}>Plan your itinerary</p>
          <h2 id="agenda-heading">Agenda</h2>
          <p>
            Browse revision {agenda.revision.number}, published for attendees and event partners.
          </p>
        </div>
        {jsonFeedAvailable || icsFeedAvailable ? (
          <nav className={styles.feedLinks} aria-label="Agenda downloads">
            {jsonFeedAvailable ? <a href={`${publicBase}/agenda.json`}>JSON feed</a> : null}
            {icsFeedAvailable ? <a href={`${publicBase}/agenda.ics`}>Add to calendar</a> : null}
          </nav>
        ) : null}
      </div>

      <form className={styles.agendaFilters} onSubmit={(event) => event.preventDefault()}>
        <label>
          <span>Search sessions or speakers</span>
          <input
            type="search"
            value={query}
            placeholder="Search by title or speaker"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          <span>Day</span>
          <select value={day} onChange={(event) => setDay(event.target.value)}>
            <option value="">All days</option>
            {eventDays.map((eventDay) => (
              <option key={eventDay.date} value={eventDay.date}>
                {eventDay.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Track</span>
          <select value={track} onChange={(event) => setTrack(event.target.value)}>
            <option value="">All tracks</option>
            {tracks.map((trackName) => (
              <option key={trackName} value={trackName}>
                {trackName}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Format</span>
          <select value={format} onChange={(event) => setFormat(event.target.value)}>
            <option value="">All formats</option>
            {formats.map((formatName) => (
              <option key={formatName} value={formatName}>
                {formatName}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Location</span>
          <select value={room} onChange={(event) => setRoom(event.target.value)}>
            <option value="">All locations</option>
            {rooms.map((roomName) => (
              <option key={roomName} value={roomName}>
                {roomName}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.localTimeToggle}>
          <input
            type="checkbox"
            checked={viewerLocal}
            onChange={(event) => setViewerLocal(event.target.checked)}
          />
          <span>Show in my local time</span>
        </label>
        {query || day || track || format || room ? (
          <button
            className={styles.clearButton}
            type="button"
            onClick={() => {
              setQuery("");
              setDay("");
              setTrack("");
              setFormat("");
              setRoom("");
            }}
          >
            Clear filters
          </button>
        ) : null}
      </form>

      <div className={styles.resultBar} role="status" aria-live="polite">
        <span>
          {visibleEntries.length} session{visibleEntries.length === 1 ? "" : "s"}
        </span>
        <span>Times shown in {displayTimeZone}</span>
      </div>

      {visibleDays.length === 0 ? (
        <div className={styles.emptyResult} role="status">
          <h3>No sessions match these filters</h3>
          <p>
            Choose a different day, search term, track, format, or location to continue planning.
          </p>
        </div>
      ) : (
        <div className={styles.publicDays}>
          {visibleDays.map((agendaDay) => {
            const publishedDay = eventDays.find((eventDay) => eventDay.date === agendaDay.date);
            const hasPublishedSessions = (publishedDay?.entries.length ?? 0) > 0;
            return (
              <section key={agendaDay.date} aria-labelledby={`agenda-day-${agendaDay.date}`}>
                <header className={styles.publicDayHeading}>
                  <h3 id={`agenda-day-${agendaDay.date}`}>{agendaDay.label}</h3>
                </header>
                {agendaDay.entries.length === 0 ? (
                  <div
                    className={styles.emptyResult}
                    role="status"
                    aria-labelledby={`agenda-empty-${agendaDay.date}`}
                  >
                    <h4 id={`agenda-empty-${agendaDay.date}`}>
                      {hasPublishedSessions && hasFacetFilters
                        ? "No sessions match these filters"
                        : "No sessions published for this day"}
                    </h4>
                    <p>
                      {hasPublishedSessions && hasFacetFilters
                        ? "Choose a different search term, track, format, or location to continue planning."
                        : "No published sessions are scheduled for this day."}
                    </p>
                  </div>
                ) : (
                  <ol className={styles.publicSessionList}>
                    {agendaDay.entries.map((entry) => {
                      const presenters = publishedEntryPresenters(entry, speakers);
                      const schedule = formatPublishedSessionSchedule(
                        entry.startsAt,
                        entry.endsAt,
                        displayTimeZone,
                      );
                      return (
                        <li key={entry.id}>
                          <button
                            className={styles.publicSessionCard}
                            type="button"
                            aria-labelledby={`agenda-entry-${entry.id}`}
                            aria-haspopup="dialog"
                            onClick={(event) => openEntry(entry.id, event.currentTarget)}
                          >
                            {showField("date-time") ? (
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
                            ) : null}
                            <div className={styles.publicSessionCopy}>
                              <div className={styles.publicSessionMeta}>
                                {showField("format") && entry.format.trim() ? (
                                  <span>Format: {entry.format}</span>
                                ) : null}
                                {showField("track")
                                  ? entry.trackNames
                                      .filter((trackName) => trackName.trim().length > 0)
                                      .map((trackName) => (
                                        <span key={trackName}>Track: {trackName}</span>
                                      ))
                                  : null}
                              </div>
                              <h4 id={`agenda-entry-${entry.id}`}>{entry.title}</h4>
                              {showField("speakers") && presenters.length > 0 ? (
                                <p className={styles.publicSpeakers}>
                                  Presented by{" "}
                                  {presenters.map((presenter, index) => (
                                    <span key={presenter.key}>
                                      {index > 0 ? ", " : null}
                                      {presenter.speaker
                                        ? `${presenter.displayName} (${speakerRole(
                                            presenter.speaker,
                                          )})`
                                        : presenter.displayName}
                                    </span>
                                  ))}
                                </p>
                              ) : null}
                              {showField("summary") ? (
                                <p>{entry.summary || "No description was published."}</p>
                              ) : null}
                            </div>
                            {showField("room") ? (
                              <div className={styles.publicRoom}>
                                <span>Room</span>
                                <strong>{entry.roomName || "Room not published"}</strong>
                              </div>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
