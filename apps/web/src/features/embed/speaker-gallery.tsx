"use client";

import type { RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./embed.module.css";
import {
  type EmbedDisplayField,
  type EmbedLayout,
  filterSpeakers,
  formatPublishedSessionSchedule,
  publicPhotoUrl,
  publishedSpeakerSessions,
  speakerInitials,
  uniqueSorted,
} from "./model";
import type { PublishedAgendaEntry, PublishedSpeaker, PublishedSpeakerGallery } from "./types";

type SpeakerGalleryDetailView = PublishedSpeakerGallery & {
  readonly agenda?: {
    readonly entries: readonly PublishedAgendaEntry[];
  };
};
const EMPTY_TRACK_LIST: readonly string[] = [];

function speakerRole(speaker: PublishedSpeaker): string {
  const jobTitle = speaker.jobTitle?.trim() ?? "";
  const organization = speaker.organization?.trim() ?? "";
  if (jobTitle && organization) return `${jobTitle} at ${organization}`;
  return jobTitle || organization || "Title and company not published";
}

function speakerSessionsFromProjection(
  speaker: PublishedSpeaker,
  gallery: SpeakerGalleryDetailView,
) {
  return publishedSpeakerSessions(speaker, gallery.agenda?.entries ?? []);
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const photoUrl = publicPhotoUrl(speaker.photoUrl);
  const [biographyExpanded, setBiographyExpanded] = useState(false);
  const sessions = speakerSessionsFromProjection(speaker, gallery);
  const biography = speaker.biography.trim();
  const hasLongBiography = biography.length > 320;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    backButtonRef?.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [backButtonRef]);

  const closeDialog = () => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    onBack();
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.detailDialog}
      aria-labelledby="speaker-detail-heading"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
    >
      <button
        type="button"
        className={styles.dialogDismissLayer}
        aria-label="Close speaker profile"
        onClick={closeDialog}
      />
      <div className={styles.detailDialogSurface}>
        <div className={styles.viewHeading}>
          <div>
            <p className={styles.eyebrow}>Speaker profile</p>
            <h2 id="speaker-detail-heading">{speaker.displayName}</h2>
            <p>Published details and sessions for this speaker.</p>
          </div>
          <button
            ref={backButtonRef}
            className={styles.clearButton}
            type="button"
            onClick={closeDialog}
          >
            Back to speakers
          </button>
        </div>
        <article className={styles.speakerDetail}>
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
                      <time dateTime={session.startsAt}>
                        {[
                          formatPublishedSessionSchedule(
                            session.startsAt,
                            session.endsAt,
                            gallery.event.timeZone,
                          ).dateLabel,
                          formatPublishedSessionSchedule(
                            session.startsAt,
                            session.endsAt,
                            gallery.event.timeZone,
                          ).timeLabel,
                        ].join(" · ")}
                      </time>
                      <br />
                      <span>Room: {session.roomName || "Room not published"}</span>
                      <br />
                      <span>Track: {session.trackNames.join(", ") || "Track not published"}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No sessions are currently published for this speaker.</p>
              )}
            </div>
          </div>
        </article>
      </div>
    </dialog>
  );
}

export function SpeakerGallery({
  gallery,
  agenda,
  tracks: configuredTracks = EMPTY_TRACK_LIST,
  layout = null,
  displayFields = null,
}: Readonly<{
  gallery: PublishedSpeakerGallery;
  agenda?: SpeakerGalleryDetailView["agenda"];
  tracks?: readonly string[];
  layout?: EmbedLayout | null;
  displayFields?: readonly EmbedDisplayField[] | null;
}>) {
  const [query, setQuery] = useState("");
  const [track, setTrack] = useState("");
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string | null>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const tracks = useMemo(
    () =>
      uniqueSorted(gallery.speakers.map((speaker) => speaker.trackNames)).filter(
        (trackName) => trackName.trim().length > 0,
      ),
    [gallery.speakers],
  );
  const speakers = useMemo(() => {
    const configured = new Set(configuredTracks);
    const knownTracks = new Set(gallery.speakers.flatMap((speaker) => speaker.trackNames));
    const applicableTracks = new Set(
      [...configured].filter((trackName) => knownTracks.has(trackName)),
    );
    return filterSpeakers(gallery.speakers, query, track).filter(
      (speaker) =>
        applicableTracks.size === 0 ||
        speaker.trackNames.some((trackName) => applicableTracks.has(trackName)),
    );
  }, [configuredTracks, gallery.speakers, query, track]);
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

  const openSpeaker = (speakerId: string, target: HTMLElement) => {
    returnFocusRef.current = target;
    setSelectedSpeakerId(speakerId);
  };
  const closeSpeaker = () => setSelectedSpeakerId(null);

  if (selectedSpeaker) {
    const detailGallery: SpeakerGalleryDetailView =
      agenda === undefined ? gallery : { ...gallery, agenda };
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
    <section
      aria-labelledby="speakers-heading"
      data-layout={layout ?? undefined}
      data-display-fields={displayFields?.join(",")}
    >
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
            const photoUrl = publicPhotoUrl(speaker.photoUrl);
            const biography = speaker.biography.trim();
            const sessions =
              agenda === undefined ? [] : publishedSpeakerSessions(speaker, agenda.entries);
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
                    {sessions.length > 0 ? (
                      <div className={`${styles.speakerSessions} ${styles.speakerGallerySessions}`}>
                        <h4>Sessions</h4>
                        <ul>
                          {sessions.map((session) => (
                            <li key={session.id}>{session.title}</li>
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
