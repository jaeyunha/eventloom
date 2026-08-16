"use client";

import type { ReactNode } from "react";
import styles from "./embed.module.css";
import type { EmbedDisplayField } from "./model";
import { formatPublishedSessionSchedule, publishedEntryPresenters } from "./model";
import type { PublishedAgendaEntry, PublishedSpeaker } from "./types";

type PublicAgendaDay = {
  readonly date: string;
  readonly label: string;
  readonly entries: readonly PublishedAgendaEntry[];
};

export function PublicAgendaHeader({
  revision,
  publicBase,
  jsonFeedAvailable,
  icsFeedAvailable,
}: Readonly<{
  revision: number;
  publicBase: string;
  jsonFeedAvailable: boolean;
  icsFeedAvailable: boolean;
}>) {
  return (
    <div className={styles.viewHeading}>
      <div>
        <p className={styles.eyebrow}>Plan your itinerary</p>
        <h2 id="agenda-heading">Agenda</h2>
        <p>Browse revision {revision}, published for attendees and event partners.</p>
      </div>
      {jsonFeedAvailable || icsFeedAvailable ? (
        <nav className={styles.feedLinks} aria-label="Agenda downloads">
          {jsonFeedAvailable ? <a href={`${publicBase}/agenda.json`}>JSON feed</a> : null}
          {icsFeedAvailable ? <a href={`${publicBase}/agenda.ics`}>Add to calendar</a> : null}
        </nav>
      ) : null}
    </div>
  );
}

export function PublicAgendaFilters({
  formKey,
  query,
  validDay,
  validTrack,
  validFormat,
  validRoom,
  viewerLocal,
  eventDays,
  tracks,
  formats,
  rooms,
  onQueryChange,
  onDayChange,
  onTrackChange,
  onFormatChange,
  onRoomChange,
  onViewerLocalChange,
  onClear,
}: Readonly<{
  formKey: string;
  query: string;
  validDay: string;
  validTrack: string;
  validFormat: string;
  validRoom: string;
  viewerLocal: boolean;
  eventDays: readonly PublicAgendaDay[];
  tracks: readonly string[];
  formats: readonly string[];
  rooms: readonly string[];
  onQueryChange: (value: string) => void;
  onDayChange: (value: string) => void;
  onTrackChange: (value: string) => void;
  onFormatChange: (value: string) => void;
  onRoomChange: (value: string) => void;
  onViewerLocalChange: (value: boolean) => void;
  onClear: () => void;
}>) {
  return (
    <form
      key={formKey}
      className={styles.agendaFilters}
      onSubmit={(event) => event.preventDefault()}
    >
      <label>
        <span>Search sessions or speakers</span>
        <input
          type="search"
          value={query}
          placeholder="Search by title or speaker"
          onChange={(event) => onQueryChange(event.currentTarget.value)}
        />
      </label>
      <label>
        <span>Day</span>
        <select value={validDay} onChange={(event) => onDayChange(event.currentTarget.value)}>
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
        <select value={validTrack} onChange={(event) => onTrackChange(event.currentTarget.value)}>
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
        <select value={validFormat} onChange={(event) => onFormatChange(event.currentTarget.value)}>
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
        <select value={validRoom} onChange={(event) => onRoomChange(event.currentTarget.value)}>
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
          onChange={(event) => onViewerLocalChange(event.currentTarget.checked)}
        />
        <span>Show in my local time</span>
      </label>
      {query || validDay || validTrack || validFormat || validRoom ? (
        <button className={styles.clearButton} type="button" onClick={onClear}>
          Clear filters
        </button>
      ) : null}
    </form>
  );
}

export function PublicAgendaDayList({
  visibleDays,
  eventDays,
  displayTimeZone,
  speakers,
  hasFacetFilters,
  showField,
  renderTrackLabels,
  renderSpeakerRole,
  onOpenEntry,
}: Readonly<{
  visibleDays: readonly PublicAgendaDay[];
  eventDays: readonly PublicAgendaDay[];
  displayTimeZone: string;
  speakers: readonly PublishedSpeaker[];
  hasFacetFilters: boolean;
  showField: (field: EmbedDisplayField) => boolean;
  renderTrackLabels: (trackNames: readonly string[]) => readonly ReactNode[];
  renderSpeakerRole: (speaker: PublishedSpeaker) => string;
  onOpenEntry: (entryId: string, target: HTMLElement) => void;
}>) {
  if (visibleDays.length === 0) {
    return (
      <div className={styles.emptyResult} role="status">
        <h3>No sessions match these filters</h3>
        <p>Choose a different day, search term, track, format, or location to continue planning.</p>
      </div>
    );
  }

  return (
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
                        id={`agenda-entry-trigger-${entry.id}`}
                        className={styles.publicSessionCard}
                        type="button"
                        aria-labelledby={`agenda-entry-${entry.id}`}
                        aria-haspopup="dialog"
                        onClick={(event) => onOpenEntry(entry.id, event.currentTarget)}
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
                            {showField("track") ? renderTrackLabels(entry.trackNames) : null}
                          </div>
                          <h4 id={`agenda-entry-${entry.id}`}>{entry.title}</h4>
                          {showField("speakers") && presenters.length > 0 ? (
                            <p className={styles.publicSpeakers}>
                              Presented by{" "}
                              {presenters.map((presenter, index) => (
                                <span key={presenter.key}>
                                  {index > 0 ? ", " : null}
                                  {presenter.speaker
                                    ? `${presenter.displayName} (${renderSpeakerRole(
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
  );
}
