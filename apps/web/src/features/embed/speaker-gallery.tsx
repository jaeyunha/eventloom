"use client";

import type { RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getPublishedAgenda } from "./api";
import styles from "./embed.module.css";
import {
  filterSpeakers,
  formatPublishedDateTimeRange,
  speakerInitials,
  uniqueSorted,
} from "./model";
import type { PublishedAgendaEntry, PublishedSpeaker, PublishedSpeakerGallery } from "./types";

type PublishedAgendaEntryWithSessionId = PublishedAgendaEntry & {
  readonly sessionId?: string | null;
};

type SpeakerGalleryDetailView = PublishedSpeakerGallery & {
  readonly agenda?: {
    readonly entries: readonly PublishedAgendaEntryWithSessionId[];
  };
};

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

function speakerRole(speaker: PublishedSpeaker): string {
  const jobTitle = speaker.jobTitle?.trim() ?? "";
  const organization = speaker.organization?.trim() ?? "";
  if (jobTitle && organization) {
    return `${jobTitle} at ${organization}`;
  }
  return jobTitle || organization || "Title and company not published";
}
function normalizeSpeakerName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase();
}

function agendaSessionId(entry: PublishedAgendaEntryWithSessionId): string {
  const sessionId = typeof entry.sessionId === "string" ? entry.sessionId.trim() : "";
  return sessionId || entry.id;
}

function speakerSessionsFromAgenda(
  speaker: PublishedSpeaker,
  entries: readonly PublishedAgendaEntryWithSessionId[],
) {
  const speakerSessionIds = new Set(speaker.sessionIds);
  const normalizedDisplayName = normalizeSpeakerName(speaker.displayName);
  const normalizedSpeakerId = normalizeSpeakerName(speaker.id);
  return entries
    .filter(
      (entry) =>
        speakerSessionIds.has(agendaSessionId(entry)) ||
        entry.speakerNames.some((name) => {
          const normalizedName = normalizeSpeakerName(name);
          return normalizedName === normalizedDisplayName || normalizedName === normalizedSpeakerId;
        }),
    )
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      startsAt: entry.startsAt || null,
      endsAt: entry.endsAt || null,
      roomName: entry.roomName || null,
    }));
}

function speakerSessionsFromTitles(speaker: PublishedSpeaker) {
  return speaker.sessionTitles.map((title, index) => ({
    id: speaker.sessionIds[index] ?? `session-${index}`,
    title,
    startsAt: null,
    endsAt: null,
    roomName: null,
  }));
}

function speakerSessionsFromProjection(
  speaker: PublishedSpeaker,
  gallery: SpeakerGalleryDetailView,
) {
  if (gallery.agenda !== undefined) {
    const agendaSessions = speakerSessionsFromAgenda(speaker, gallery.agenda.entries);
    if (agendaSessions.length > 0) {
      return agendaSessions;
    }
  }
  return speakerSessionsFromTitles(speaker);
}

export function SpeakerProfileDetail({
  speaker,
  gallery,
  onBack,
  backButtonRef,
}: Readonly<{
  speaker: PublishedSpeaker;
  gallery: SpeakerGalleryDetailView;
  onBack: () => void;
  backButtonRef?: RefObject<HTMLButtonElement | null>;
}>) {
  const photoUrl = safePhotoUrl(speaker.photoUrl);
  const [biographyExpanded, setBiographyExpanded] = useState(false);
  const sessions = speakerSessionsFromProjection(speaker, gallery);
  const biography = speaker.biography.trim();
  const hasLongBiography = biography.length > 320;

  return (
    <section aria-labelledby="speaker-detail-heading" aria-modal="true" role="dialog">
      <div className={styles.viewHeading}>
        <div>
          <p className={styles.eyebrow}>Speaker profile</p>
          <h2 id="speaker-detail-heading">{speaker.displayName}</h2>
          <p>Published details and sessions for this speaker.</p>
        </div>
        <button ref={backButtonRef} className={styles.clearButton} type="button" onClick={onBack}>
          Back to speakers
        </button>
      </div>
      <article className={styles.speakerCard}>
        <div className={styles.speakerPhoto}>
          {photoUrl ? (
            <span
              className={styles.photoImage}
              aria-hidden="true"
              style={{ backgroundImage: `url(${JSON.stringify(photoUrl)})` }}
            />
          ) : (
            <span aria-hidden="true">{speakerInitials(speaker.displayName) || "?"}</span>
          )}
        </div>
        <div className={styles.speakerCopy}>
          <h3>{speaker.displayName}</h3>
          {speaker.pronouns ? <p className={styles.pronouns}>{speaker.pronouns}</p> : null}
          <p className={styles.speakerRole}>{speakerRole(speaker)}</p>
          <p>
            <strong>Company:</strong> {speaker.organization || "Company not published"}
          </p>
          {biography ? (
            <p
              id={`speaker-biography-${speaker.id}`}
              className={biographyExpanded ? undefined : styles.biography}
            >
              {biography}
            </p>
          ) : (
            <p>Biography not published.</p>
          )}
          {hasLongBiography ? (
            <button
              className={styles.clearButton}
              type="button"
              aria-expanded={biographyExpanded}
              aria-controls={`speaker-biography-${speaker.id}`}
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
                    <strong>{session.title}</strong>
                    <br />
                    {session.startsAt && session.endsAt ? (
                      <time dateTime={session.startsAt}>
                        {formatPublishedDateTimeRange(
                          session.startsAt,
                          session.endsAt,
                          gallery.event.timeZone,
                        )}
                      </time>
                    ) : (
                      <span>Date and time not published</span>
                    )}
                    <br />
                    <span>Room: {session.roomName || "Room not published"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No sessions are currently published for this speaker.</p>
            )}
          </div>
        </div>
      </article>
    </section>
  );
}

export function SpeakerGallery({
  gallery,
  apiBaseUrl,
  agenda,
}: Readonly<{
  gallery: PublishedSpeakerGallery;
  apiBaseUrl?: string;
  agenda?: SpeakerGalleryDetailView["agenda"];
}>) {
  const initialAgenda = agenda ?? (gallery as SpeakerGalleryDetailView).agenda;
  const [query, setQuery] = useState("");
  const [track, setTrack] = useState("");
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string | null>(null);
  const [publishedEntries, setPublishedEntries] = useState<readonly PublishedAgendaEntry[]>(
    initialAgenda?.entries ?? [],
  );
  const [hasPublishedAgenda, setHasPublishedAgenda] = useState(initialAgenda !== undefined);
  const [agendaLoadAttempted, setAgendaLoadAttempted] = useState(initialAgenda !== undefined);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const tracks = useMemo(
    () =>
      uniqueSorted(gallery.speakers.map((speaker) => speaker.trackNames)).filter(
        (trackName) => trackName.trim().length > 0,
      ),
    [gallery.speakers],
  );
  const speakers = useMemo(
    () => filterSpeakers(gallery.speakers, query, track),
    [gallery.speakers, query, track],
  );
  const selectedSpeaker = selectedSpeakerId
    ? gallery.speakers.find((speaker) => speaker.id === selectedSpeakerId)
    : undefined;

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

  useEffect(() => {
    const configuredApiBaseUrl =
      apiBaseUrl?.trim() ||
      process.env.NEXT_PUBLIC_API_URL?.trim() ||
      (typeof window !== "undefined" ? window.location.origin : "");
    if (!configuredApiBaseUrl || agendaLoadAttempted) {
      return;
    }
    setAgendaLoadAttempted(true);
    let cancelled = false;
    getPublishedAgenda(configuredApiBaseUrl, gallery.event.slug)
      .then((agenda) => {
        if (!cancelled) {
          setHasPublishedAgenda(true);
          setPublishedEntries(agenda.entries);
        }
      })
      .catch(() => {
        // The speaker projection remains usable when its companion agenda is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, gallery.event.slug, agendaLoadAttempted]);

  const openSpeaker = (speakerId: string, target: HTMLElement) => {
    returnFocusRef.current = target;
    setSelectedSpeakerId(speakerId);
  };
  const closeSpeaker = () => setSelectedSpeakerId(null);

  if (selectedSpeaker) {
    const detailGallery: SpeakerGalleryDetailView = hasPublishedAgenda
      ? { ...gallery, agenda: { entries: publishedEntries } }
      : gallery;
    return (
      <SpeakerProfileDetail
        speaker={selectedSpeaker}
        gallery={detailGallery}
        onBack={closeSpeaker}
        backButtonRef={backButtonRef}
      />
    );
  }

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
            const biography = speaker.biography.trim();
            return (
              <li key={speaker.id}>
                <button
                  className={styles.speakerCard}
                  type="button"
                  id={`speaker-${speaker.id}`}
                  aria-labelledby={`speaker-name-${speaker.id}`}
                  aria-haspopup="dialog"
                  onClick={(event) => openSpeaker(speaker.id, event.currentTarget)}
                >
                  <div className={styles.speakerPhoto}>
                    {photoUrl ? (
                      <span
                        className={styles.photoImage}
                        aria-hidden="true"
                        style={{ backgroundImage: `url(${JSON.stringify(photoUrl)})` }}
                      />
                    ) : (
                      <span aria-hidden="true">{speakerInitials(speaker.displayName) || "?"}</span>
                    )}
                  </div>
                  <div className={styles.speakerCopy}>
                    <h3 id={`speaker-name-${speaker.id}`}>{speaker.displayName}</h3>
                    {speaker.pronouns ? (
                      <p className={styles.pronouns}>{speaker.pronouns}</p>
                    ) : null}
                    <p className={styles.speakerRole}>{speakerRole(speaker)}</p>
                    <p>
                      <strong>Company:</strong> {speaker.organization || "Company not published"}
                    </p>
                    {biography ? (
                      <p className={styles.biography}>{biography}</p>
                    ) : (
                      <p>Biography not published.</p>
                    )}
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
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
