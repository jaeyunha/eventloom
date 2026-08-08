"use client";

import { useMemo, useState } from "react";
import { filterSpeakers, speakerInitials, uniqueSorted } from "./model";
import styles from "./embed.module.css";
import type { PublishedSpeakerGallery } from "./types";

function safePhotoUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function SpeakerGallery({ gallery }: Readonly<{ gallery: PublishedSpeakerGallery }>) {
  const [query, setQuery] = useState("");
  const [track, setTrack] = useState("");
  const tracks = useMemo(
    () => uniqueSorted(gallery.speakers.map((speaker) => speaker.trackNames)),
    [gallery.speakers],
  );
  const speakers = useMemo(
    () => filterSpeakers(gallery.speakers, query, track),
    [gallery.speakers, query, track],
  );

  return (
    <section aria-labelledby="speakers-heading">
      <div className={styles.viewHeading}>
        <div>
          <p className={styles.eyebrow}>Meet the people on stage</p>
          <h2 id="speakers-heading">Speakers</h2>
          <p>Explore published profiles and the sessions each speaker is presenting.</p>
        </div>
        <span className={styles.resultCount} aria-live="polite">
          {speakers.length} speaker{speakers.length === 1 ? "" : "s"}
        </span>
      </div>

      <search>
        <form className={styles.filters} onSubmit={(event) => event.preventDefault()}>
        <label>
          <span>Search speakers or sessions</span>
          <input
            type="search"
            value={query}
            placeholder="Search by name, company, or topic"
            onChange={(event) => setQuery(event.target.value)}
          />
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
        {query || track ? (
          <button
            className={styles.clearButton}
            type="button"
            onClick={() => {
              setQuery("");
              setTrack("");
            }}
          >
            Clear filters
          </button>
        ) : null}
        </form>
      </search>

      {speakers.length === 0 ? (
        <div className={styles.emptyResult} role="status">
          <h3>No speakers match these filters</h3>
          <p>Clear the filters to browse every published speaker.</p>
        </div>
      ) : (
        <ul className={styles.speakerGrid}>
          {speakers.map((speaker) => {
            const photoUrl = safePhotoUrl(speaker.photoUrl);
            return (
              <li key={speaker.id}>
                <article className={styles.speakerCard} id={`speaker-${speaker.id}`}>
                  <div className={styles.speakerPhoto}>
                    {photoUrl ? (
                      <span
                        className={styles.photoImage}
                        aria-hidden="true"
                        style={{ backgroundImage: `url(${JSON.stringify(photoUrl)})` }}
                      />
                    ) : (
                      <span aria-hidden="true">{speakerInitials(speaker.displayName)}</span>
                    )}
                  </div>
                  <div className={styles.speakerCopy}>
                    <h3>{speaker.displayName}</h3>
                    {speaker.pronouns ? <p className={styles.pronouns}>{speaker.pronouns}</p> : null}
                    {speaker.jobTitle || speaker.organization ? (
                      <p className={styles.speakerRole}>
                        {[speaker.jobTitle, speaker.organization].filter(Boolean).join(" at ")}
                      </p>
                    ) : null}
                    <p className={styles.biography}>{speaker.biography}</p>
                    {speaker.sessionTitles.length > 0 ? (
                      <div className={styles.speakerSessions}>
                        <h4>Sessions</h4>
                        <ul>
                          {speaker.sessionTitles.map((title) => (
                            <li key={title}>{title}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
