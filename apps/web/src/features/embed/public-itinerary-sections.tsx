"use client";

import type { ReactNode } from "react";
import styles from "./embed.module.css";
import {
  formatPublishedDateTimeRange,
  formatPublishedSessionSchedule,
  publishedEntryPresenters,
} from "./model";
import type { PublishedAgendaEntry, PublishedSpeaker } from "./types";

type PublicItineraryDay = {
  readonly date: string;
  readonly label: string;
  readonly entries: readonly PublishedAgendaEntry[];
};

export function PublicItineraryControls({
  query,
  filtersOpen,
  personalOnly,
  selectedCount,
  totalCount,
  track,
  format,
  room,
  tracks,
  formats,
  rooms,
  hasFilters,
  onQueryChange,
  onToggleFilters,
  onTogglePersonalView,
  onDownloadCalendar,
  onClearFilters,
  onTrackChange,
  onFormatChange,
  onRoomChange,
}: Readonly<{
  query: string;
  filtersOpen: boolean;
  personalOnly: boolean;
  selectedCount: number;
  totalCount: number;
  track: string;
  format: string;
  room: string;
  tracks: readonly string[];
  formats: readonly string[];
  rooms: readonly string[];
  hasFilters: boolean;
  onQueryChange: (value: string) => void;
  onToggleFilters: () => void;
  onTogglePersonalView: () => void;
  onDownloadCalendar: () => void;
  onClearFilters: () => void;
  onTrackChange: (value: string) => void;
  onFormatChange: (value: string) => void;
  onRoomChange: (value: string) => void;
}>) {
  return (
    <search>
      <form className={styles.filters} onSubmit={(event) => event.preventDefault()}>
        <label>
          <span>Search sessions or speakers</span>
          <input
            type="search"
            value={query}
            placeholder="Search by title or speaker"
            onChange={(event) => onQueryChange(event.currentTarget.value)}
          />
        </label>
        <button
          className={styles.clearButton}
          type="button"
          aria-expanded={filtersOpen}
          aria-controls="itinerary-filters"
          onClick={onToggleFilters}
        >
          {filtersOpen ? "Hide filters" : "Filters"}
        </button>
        <button
          className={`${styles.clearButton} ${styles.scheduleToggle}`}
          type="button"
          aria-pressed={personalOnly}
          onClick={onTogglePersonalView}
        >
          {personalOnly ? `All sessions (${totalCount})` : `My schedule (${selectedCount})`}
        </button>
        <button
          className={`${styles.clearButton} ${styles.exportButton}`}
          type="button"
          onClick={onDownloadCalendar}
        >
          Download calendar (.ics)
        </button>
        {hasFilters ? (
          <button className={styles.clearButton} type="button" onClick={onClearFilters}>
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
          <select value={track} onChange={(event) => onTrackChange(event.currentTarget.value)}>
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
          <select value={format} onChange={(event) => onFormatChange(event.currentTarget.value)}>
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
          <select value={room} onChange={(event) => onRoomChange(event.currentTarget.value)}>
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
  );
}

export function PublicItineraryResultBar({
  personalOnly,
  visibleCount,
  totalCount,
  selectedCount,
  exportMessage,
}: Readonly<{
  personalOnly: boolean;
  visibleCount: number;
  totalCount: number;
  selectedCount: number;
  exportMessage: string;
}>) {
  return (
    <>
      <div className={styles.resultBar} role="status" aria-live="polite">
        <span>
          {personalOnly
            ? `My schedule: ${visibleCount} session${visibleCount === 1 ? "" : "s"}`
            : `${visibleCount} of ${totalCount} session${totalCount === 1 ? "" : "s"}`}
        </span>
        <span>{selectedCount} saved</span>
      </div>
      {exportMessage ? (
        <p className={styles.exportMessage} role="status" aria-live="polite">
          {exportMessage}
        </p>
      ) : null}
    </>
  );
}

export function PublicItineraryDayTabs({
  days,
  activeDay,
  personalOnly,
  visibleDays,
  onSelectDay,
}: Readonly<{
  days: readonly PublicItineraryDay[];
  activeDay: string;
  personalOnly: boolean;
  visibleDays: readonly PublicItineraryDay[];
  onSelectDay: (date: string) => void;
}>) {
  return (
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
            onClick={() => onSelectDay(day.date)}
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
              const nextDay = days[nextIndex];
              if (nextDay) {
                onSelectDay(nextDay.date);
                document.getElementById(`itinerary-tab-${nextDay.date}`)?.focus();
              }
            }}
          >
            {day.label}
          </button>
        );
      })}
    </div>
  );
}

export function PublicItinerarySessionList({
  visibleEntries,
  visibleDays,
  personalOnly,
  timeZone,
  speakers,
  selectedSet,
  expandedDescriptions,
  expandedDetails,
  onToggleSelected,
  onToggleDescription,
  onToggleDetails,
  renderTrackLabels,
  truncateDescription,
  renderSpeakerRole,
  descriptionLimit,
}: Readonly<{
  visibleEntries: readonly PublishedAgendaEntry[];
  visibleDays: readonly PublicItineraryDay[];
  personalOnly: boolean;
  timeZone: string;
  speakers: readonly PublishedSpeaker[];
  selectedSet: ReadonlySet<string>;
  expandedDescriptions: ReadonlySet<string>;
  expandedDetails: ReadonlySet<string>;
  onToggleSelected: (entryId: string) => void;
  onToggleDescription: (entryId: string) => void;
  onToggleDetails: (entryId: string) => void;
  renderTrackLabels: (trackNames: readonly string[]) => readonly ReactNode[];
  truncateDescription: (value: string) => string;
  renderSpeakerRole: (speaker: PublishedSpeaker) => string;
  descriptionLimit: number;
}>) {
  if (visibleEntries.length === 0) {
    return (
      <div className={styles.emptyResult} role="status">
        <h3>{personalOnly ? "Your schedule is empty" : "No sessions match this day"}</h3>
        <p>
          {personalOnly
            ? "Use Add to my schedule on a session card to build a personal itinerary."
            : "Choose another day or clear your filters to keep browsing."}
        </p>
      </div>
    );
  }

  return (
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
                const presenters = publishedEntryPresenters(entry, speakers);
                const schedule = formatPublishedSessionSchedule(
                  entry.startsAt,
                  entry.endsAt,
                  timeZone,
                );
                const isDescriptionExpanded = expandedDescriptions.has(entry.id);
                const isDetailsExpanded = expandedDetails.has(entry.id);
                const isSelected = selectedSet.has(entry.id);
                const hasLongDescription = entry.summary.length > descriptionLimit;
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
                          {renderTrackLabels(entry.trackNames)}
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
                            onClick={() => onToggleDescription(entry.id)}
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
                                  ? `${presenter.displayName} (${renderSpeakerRole(
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
                            {formatPublishedDateTimeRange(entry.startsAt, entry.endsAt, timeZone)}
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
                          onClick={() => onToggleDetails(entry.id)}
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
                          onClick={() => onToggleSelected(entry.id)}
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
  );
}
