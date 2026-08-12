"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./embed.module.css";
import {
  formatPublishedDateTimeRange,
  publicPhotoUrl,
  publishedSpeakerSessions,
  sortSpeakersBySurname,
  speakerInitials,
} from "./model";
import type { PublishedProgram, PublishedSpeaker } from "./types";

const BIOGRAPHY_LIMIT = 320;

function speakerTitle(speaker: PublishedSpeaker): string {
  return speaker.jobTitle?.trim() || "Title not published";
}

function speakerCompany(speaker: PublishedSpeaker): string {
  return speaker.organization?.trim() || "Company not published";
}

function speakerMatchesName(speaker: PublishedSpeaker, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return (
    normalizedQuery.length === 0 ||
    speaker.displayName.toLocaleLowerCase().includes(normalizedQuery)
  );
}

function biographyText(speaker: PublishedSpeaker, expanded: boolean): string {
  const biography = speaker.biography.trim();
  if (expanded || biography.length <= BIOGRAPHY_LIMIT) return biography;
  return `${biography.slice(0, BIOGRAPHY_LIMIT).trimEnd()}…`;
}

function SpeakerHeadshot({ speaker }: Readonly<{ speaker: PublishedSpeaker }>) {
  const photoUrl = publicPhotoUrl(speaker.photoUrl);
  const initials = speakerInitials(speaker.displayName) || "?";
  return (
    <div
      aria-label={`${speaker.displayName} headshot`}
      role="img"
      className={styles.speakerHeadshot}
    >
      {photoUrl ? (
        <span
          aria-hidden="true"
          className={styles.speakerHeadshotPhoto}
          style={{ backgroundImage: `url(${JSON.stringify(photoUrl)})` }}
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </div>
  );
}

function SpeakerEntry({
  eventSlug,
  speaker,
  program,
  onSelect,
}: Readonly<{
  eventSlug: string;
  speaker: PublishedSpeaker;
  program: PublishedProgram;
  onSelect?: (target: HTMLButtonElement) => void;
}>) {
  const [biographyExpanded, setBiographyExpanded] = useState(false);
  const biography = speaker.biography.trim();
  const hasLongBiography = biography.length > BIOGRAPHY_LIMIT;
  const sessions = useMemo(
    () => publishedSpeakerSessions(speaker, program.agenda.entries),
    [program.agenda.entries, speaker],
  );

  return (
    <li>
      <article className={styles.speakerCard}>
        <SpeakerHeadshot speaker={speaker} />
        <div className={styles.speakerCopy}>
          <h3>
            {onSelect ? (
              <button
                type="button"
                id={`speaker-list-trigger-${speaker.id}`}
                onClick={(event) => onSelect(event.currentTarget)}
              >
                {speaker.displayName}
              </button>
            ) : (
              speaker.displayName
            )}
          </h3>
          {speaker.pronouns ? <p className={styles.pronouns}>{speaker.pronouns}</p> : null}
          <p className={styles.speakerRole}>{speakerTitle(speaker)}</p>
          <p>
            <strong>Company:</strong> {speakerCompany(speaker)}
          </p>
          {biography ? (
            <p
              id={`speaker-list-biography-${speaker.id}`}
              className={biographyExpanded ? undefined : styles.biography}
            >
              {biographyText(speaker, biographyExpanded)}
            </p>
          ) : (
            <p>Biography not published.</p>
          )}
          {hasLongBiography ? (
            <button
              className={styles.clearButton}
              type="button"
              aria-expanded={biographyExpanded}
              aria-controls={`speaker-list-biography-${speaker.id}`}
              onClick={() => setBiographyExpanded((expanded) => !expanded)}
            >
              {biographyExpanded ? "Show less" : "Show more"}
            </button>
          ) : null}
          <div className={styles.speakerSessions}>
            <h4>Sessions ({sessions.length})</h4>
            {sessions.length > 0 ? (
              <ul>
                {sessions.map((session) => (
                  <li key={session.id}>
                    <a
                      href={`/embed/${encodeURIComponent(eventSlug)}/sessions#session-${encodeURIComponent(session.id)}`}
                    >
                      {session.title}
                    </a>
                    <br />
                    <time dateTime={session.startsAt}>
                      {formatPublishedDateTimeRange(
                        session.startsAt,
                        session.endsAt,
                        program.agenda.event.timeZone,
                      )}
                    </time>
                    <br />
                    <span>Room: {session.roomName || "Room not published"}</span>
                    <br />
                    <span>Track: {session.trackNames.join(", ") || "Track not published"}</span>
                    <br />
                    <span>Roles: speaker</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No sessions are currently published for this speaker.</p>
            )}
          </div>
        </div>
      </article>
    </li>
  );
}

export function PublicSpeakersListView({ program }: Readonly<{ program: PublishedProgram }>) {
  const [query, setQuery] = useState("");
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string | null>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const speakers = useMemo(() => {
    const sorted = sortSpeakersBySurname(program.speakers.speakers);
    return sorted.filter((speaker) => speakerMatchesName(speaker, query));
  }, [program.speakers.speakers, query]);
  const selectedSpeaker = selectedSpeakerId
    ? program.speakers.speakers.find((speaker) => speaker.id === selectedSpeakerId)
    : undefined;
  const totalSpeakers = program.speakers.speakers.length;

  useEffect(() => {
    if (selectedSpeaker) {
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
  }, [selectedSpeaker]);

  const openSpeaker = (speakerId: string, target: HTMLButtonElement) => {
    returnFocusRef.current = target;
    setSelectedSpeakerId(speakerId);
  };
  const closeSpeaker = () => setSelectedSpeakerId(null);

  if (selectedSpeaker) {
    return (
      <section aria-labelledby="speakers-list-detail-heading">
        <div className={styles.viewHeading}>
          <div>
            <p className={styles.eyebrow}>Speaker profile</p>
            <h2 id="speakers-list-detail-heading">{selectedSpeaker.displayName}</h2>
            <p>Published profile and sessions from the current program projection.</p>
          </div>
          <button
            ref={backButtonRef}
            className={styles.clearButton}
            type="button"
            onClick={closeSpeaker}
          >
            Back to speakers
          </button>
        </div>
        <ul className={styles.publicSessionList} aria-label="Speaker profile">
          <SpeakerEntry
            eventSlug={program.agenda.event.slug}
            speaker={selectedSpeaker}
            program={program}
          />
        </ul>
      </section>
    );
  }

  return (
    <section aria-labelledby="speakers-list-heading">
      <div className={styles.viewHeading}>
        <div>
          <p className={styles.eyebrow}>Browse the speaker directory</p>
          <h2 id="speakers-list-heading">Speakers</h2>
          <p>Find each published speaker and the sessions they are presenting.</p>
        </div>
        <span className={styles.resultCount} aria-live="polite">
          {speakers.length === 0
            ? `Speakers 0 of ${totalSpeakers}`
            : `Speakers 1 - ${speakers.length} of ${totalSpeakers}`}
        </span>
      </div>

      <search>
        <form className={styles.filters} onSubmit={(event) => event.preventDefault()}>
          <label>
            <span>Search speakers by name</span>
            <input
              type="search"
              value={query}
              placeholder="Search speakers and sessions"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {query ? (
            <button className={styles.clearButton} type="button" onClick={() => setQuery("")}>
              Clear search
            </button>
          ) : null}
        </form>
      </search>

      <p className={styles.resultBar}>
        <span>Search matches speaker names only.</span>
        <span>Times shown in {program.agenda.event.timeZone}</span>
      </p>

      {speakers.length === 0 ? (
        <div className={styles.emptyResult} role="status">
          <h3>No speakers match this search</h3>
          <p>Try another name or clear the search to browse every published speaker.</p>
        </div>
      ) : (
        <ul className={styles.publicSessionList} aria-label="Published speakers and sessions">
          {speakers.map((speaker) => (
            <SpeakerEntry
              key={speaker.id}
              eventSlug={program.agenda.event.slug}
              speaker={speaker}
              program={program}
              onSelect={(target) => openSpeaker(speaker.id, target)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
