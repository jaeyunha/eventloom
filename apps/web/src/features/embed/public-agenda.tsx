"use client";

import { useMemo, useState } from "react";
import {
  filterAgendaEntries,
  formatPublishedTime,
  publicAgendaDays,
  uniqueSorted,
} from "./model";
import styles from "./embed.module.css";
import type { PublishedAgenda } from "./types";

export function PublicAgendaView({
  agenda,
  apiBaseUrl,
}: Readonly<{ agenda: PublishedAgenda; apiBaseUrl: string }>) {
  const [day, setDay] = useState("");
  const [track, setTrack] = useState("");
  const [viewerLocal, setViewerLocal] = useState(false);
  const eventDays = useMemo(
    () => publicAgendaDays(agenda.entries, agenda.event.timeZone),
    [agenda.entries, agenda.event.timeZone],
  );
  const tracks = useMemo(
    () => uniqueSorted(agenda.entries.map((entry) => entry.trackNames)),
    [agenda.entries],
  );
  const visibleEntries = useMemo(
    () => filterAgendaEntries(agenda.entries, day, track, agenda.event.timeZone),
    [agenda.entries, agenda.event.timeZone, day, track],
  );
  const visibleDays = useMemo(
    () => publicAgendaDays(visibleEntries, agenda.event.timeZone),
    [agenda.event.timeZone, visibleEntries],
  );
  const viewerTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const displayTimeZone = viewerLocal ? viewerTimeZone : agenda.event.timeZone;
  const publicBase = `${apiBaseUrl.replace(/\/$/, "")}/api/public/events/${encodeURIComponent(agenda.event.slug)}`;

  return (
    <section aria-labelledby="agenda-heading">
      <div className={styles.viewHeading}>
        <div>
          <p className={styles.eyebrow}>Plan your itinerary</p>
          <h2 id="agenda-heading">Agenda</h2>
          <p>
            Browse revision {agenda.revision.number}, published for attendees and event partners.
          </p>
        </div>
        <nav className={styles.feedLinks} aria-label="Agenda downloads">
          <a href={`${publicBase}/agenda.json`}>JSON feed</a>
          <a href={`${publicBase}/agenda.ics`}>Add to calendar</a>
        </nav>
      </div>

      <form className={styles.agendaFilters} onSubmit={(event) => event.preventDefault()}>
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
        <label className={styles.localTimeToggle}>
          <input
            type="checkbox"
            checked={viewerLocal}
            onChange={(event) => setViewerLocal(event.target.checked)}
          />
          <span>Show in my local time</span>
        </label>
      </form>

      <div className={styles.resultBar} role="status" aria-live="polite">
        <span>
          {visibleEntries.length} session{visibleEntries.length === 1 ? "" : "s"}
        </span>
        <span>Times shown in {displayTimeZone}</span>
      </div>

      {visibleDays.length === 0 ? (
        <div className={styles.emptyResult}>
          <h3>No sessions match these filters</h3>
          <p>Choose a different day or track to continue planning.</p>
        </div>
      ) : (
        <div className={styles.publicDays}>
          {visibleDays.map((agendaDay) => (
            <section key={agendaDay.date} aria-labelledby={`agenda-day-${agendaDay.date}`}>
              <header className={styles.publicDayHeading}>
                <h3 id={`agenda-day-${agendaDay.date}`}>{agendaDay.label}</h3>
              </header>
              <ol className={styles.publicSessionList}>
                {agendaDay.entries.map((entry) => (
                  <li key={entry.id}>
                    <article className={styles.publicSessionCard}>
                      <div className={styles.publicSessionTime}>
                        <time dateTime={entry.startsAt}>
                          {formatPublishedTime(entry.startsAt, displayTimeZone)}
                        </time>
                        <span aria-hidden="true">to</span>
                        <time dateTime={entry.endsAt}>
                          {formatPublishedTime(entry.endsAt, displayTimeZone)}
                        </time>
                      </div>
                      <div className={styles.publicSessionCopy}>
                        <div className={styles.publicSessionMeta}>
                          <span>{entry.format}</span>
                          {entry.trackNames.map((trackName) => (
                            <span key={trackName}>{trackName}</span>
                          ))}
                        </div>
                        <h4>{entry.title}</h4>
                        {entry.speakerNames.length > 0 ? (
                          <p className={styles.publicSpeakers}>
                            Presented by {entry.speakerNames.join(", ")}
                          </p>
                        ) : null}
                        <p>{entry.summary}</p>
                      </div>
                      <div className={styles.publicRoom}>
                        <span>Room</span>
                        <strong>{entry.roomName}</strong>
                      </div>
                    </article>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
