"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import styles from "./embed.module.css";
import type { EmbedDisplayField, EmbedLayout } from "./model";
import {
  formatPublishedSessionSchedule,
  literalSearchPattern,
  publishedEntryPresenters,
  publishedSpeakerSearchTermsBySessionId,
} from "./model";
import type { PublishedAgendaEntry, PublishedProgram, PublishedSpeaker } from "./types";

const DESCRIPTION_LIMIT = 190;

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
  if (value.length <= DESCRIPTION_LIMIT) {
    return value;
  }
  return `${value.slice(0, DESCRIPTION_LIMIT).trimEnd()}…`;
}

function compareStarts(left: PublishedAgendaEntry, right: PublishedAgendaEntry): number {
  const leftStart = Date.parse(left.startsAt);
  const rightStart = Date.parse(right.startsAt);
  if (!Number.isNaN(leftStart) && !Number.isNaN(rightStart)) {
    return leftStart - rightStart;
  }
  return left.startsAt.localeCompare(right.startsAt);
}

function entrySearchText(
  entry: PublishedAgendaEntry,
  searchTermsBySessionId: ReadonlyMap<string, readonly string[]>,
): string {
  return [
    entry.title,
    ...entry.speakerNames,
    ...(searchTermsBySessionId.get(entry.sessionId) ?? []),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLocaleLowerCase();
}

function speakerRole(speaker: PublishedSpeaker): string {
  const jobTitle = speaker.jobTitle?.trim() ?? "";
  const organization = speaker.organization?.trim() ?? "";
  return [jobTitle, organization].filter(Boolean).join(" · ") || "Speaker";
}

export interface PublicSessionsViewProps {
  readonly program: PublishedProgram;
  readonly layout?: EmbedLayout | null;
  readonly tracks?: readonly string[];
  readonly displayFields?: readonly EmbedDisplayField[] | null;
}

const DEFAULT_SESSIONS_DISPLAY_FIELDS: readonly EmbedDisplayField[] = [
  "title",
  "date-time",
  "room",
  "speakers",
  "format",
  "track",
  "summary",
];
const EMPTY_TRACK_LIST: readonly string[] = [];

function sessionsIncludeField(
  displayFields: readonly EmbedDisplayField[],
  field: EmbedDisplayField,
): boolean {
  return displayFields.includes(field);
}

export function PublicSessionsView({
  program,
  layout = null,
  tracks: trackList = EMPTY_TRACK_LIST,
  displayFields = null,
}: Readonly<PublicSessionsViewProps>) {
  const { agenda, speakers } = program;
  const [query, setQuery] = useState("");
  const [track, setTrack] = useState("");
  const [format, setFormat] = useState("");
  const [room, setRoom] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const displayFieldList = displayFields ?? DEFAULT_SESSIONS_DISPLAY_FIELDS;
  const showField = (field: EmbedDisplayField): boolean =>
    sessionsIncludeField(displayFieldList, field);

  const trackOptions = useMemo(
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
  const speakerSearchTermsBySessionId = useMemo(
    () => publishedSpeakerSearchTermsBySessionId(speakers.speakers),
    [speakers.speakers],
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const normalizedQueryPattern = useMemo(
    () => literalSearchPattern(normalizedQuery),
    [normalizedQuery],
  );
  const entries = useMemo(() => {
    const selectedTrackSet = new Set(trackList);
    return [...agenda.entries]
      .filter((entry) => {
        if (track && !entry.trackNames.some((trackName) => trackName === track)) return false;
        if (
          trackList.length > 0 &&
          !entry.trackNames.some((trackName) => selectedTrackSet.has(trackName))
        )
          return false;
        if (format && entry.format !== format) return false;
        if (room && entry.roomName !== room) return false;
        return (
          normalizedQueryPattern === null ||
          normalizedQueryPattern.test(entrySearchText(entry, speakerSearchTermsBySessionId))
        );
      })
      .sort(compareStarts);
  }, [
    agenda.entries,
    format,
    normalizedQueryPattern,
    room,
    speakerSearchTermsBySessionId,
    track,
    trackList,
  ]);

  const hasFilters = Boolean(query || track || format || room);
  const clearFilters = () => {
    setQuery("");
    setTrack("");
    setFormat("");
    setRoom("");
  };

  return (
    <section aria-labelledby="sessions-heading">
      <div className={styles.viewHeading}>
        <div>
          <p className={styles.eyebrow}>Find your next session</p>
          <h2 id="sessions-heading">Sessions</h2>
          <p>
            Browse the published program from revision {agenda.revision.number}. Search session
            titles or speaker names, then narrow by track, format, or room.
          </p>
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
            aria-controls="sessions-filters"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            {filtersOpen ? "Hide filters" : "Filters"}
          </button>
          {hasFilters ? (
            <button className={styles.clearButton} type="button" onClick={clearFilters}>
              Clear filters
            </button>
          ) : null}
        </form>

        <fieldset
          id="sessions-filters"
          className={styles.filters}
          aria-label="Session filters"
          hidden={!filtersOpen}
        >
          <label>
            <span>Track</span>
            <select value={track} onChange={(event) => setTrack(event.target.value)}>
              <option value="">All tracks</option>
              {trackOptions.map((value) => (
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
          {entries.length === 0
            ? `Sessions 0 of ${agenda.entries.length}`
            : `Sessions 1 - ${entries.length} of ${agenda.entries.length}`}
        </span>
        <span>Times shown in {agenda.event.timeZone}</span>
      </div>

      {entries.length === 0 ? (
        <div className={styles.emptyResult} role="status">
          <h3>No sessions match these filters</h3>
          <p>Try another title, speaker, track, format, or location.</p>
        </div>
      ) : (
        <ol className={styles.publicSessionList}>
          {entries.map((entry) => {
            const presenters = publishedEntryPresenters(entry, speakers.speakers);
            const schedule = formatPublishedSessionSchedule(
              entry.startsAt,
              entry.endsAt,
              agenda.event.timeZone,
            );
            const isExpanded = expanded.has(entry.id);
            const hasLongDescription = entry.summary.length > DESCRIPTION_LIMIT;
            const hasDescription = entry.summary.trim().length > 0;
            return (
              <li key={entry.id}>
                <article
                  id={`session-${entry.sessionId}`}
                  className={styles.publicSessionCard}
                  data-layout={layout ?? undefined}
                >
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
                      {entry.format.trim() && showField("format") ? (
                        <span>Format: {entry.format}</span>
                      ) : null}
                      {showField("track") ? trackNameLabels(entry.trackNames) : null}
                    </div>
                    <h3>{entry.title}</h3>
                    {showField("speakers") ? (
                      presenters.length > 0 ? (
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
                      ) : (
                        <p className={styles.publicSpeakers}>Speakers to be announced</p>
                      )
                    ) : null}
                    {showField("summary") ? (
                      hasDescription ? (
                        <p id={`session-summary-${entry.id}`}>
                          {isExpanded || !hasLongDescription
                            ? entry.summary
                            : truncateDescription(entry.summary)}
                        </p>
                      ) : (
                        <p>No description was published.</p>
                      )
                    ) : null}
                    {hasLongDescription ? (
                      <button
                        className={styles.clearButton}
                        type="button"
                        aria-expanded={isExpanded}
                        aria-controls={`session-summary-${entry.id}`}
                        onClick={() =>
                          setExpanded((current) => {
                            const next = new Set(current);
                            if (next.has(entry.id)) next.delete(entry.id);
                            else next.add(entry.id);
                            return next;
                          })
                        }
                      >
                        {isExpanded ? "Show less" : "Show more"}
                      </button>
                    ) : null}
                  </div>
                  <div className={styles.publicRoom}>
                    {showField("room") ? <span>Location</span> : null}
                    {showField("room") ? (
                      <strong>{entry.roomName || "Location to be announced"}</strong>
                    ) : null}
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
