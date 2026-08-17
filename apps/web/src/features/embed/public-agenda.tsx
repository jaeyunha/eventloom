"use client";

import type { ReactNode, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { publishedProjectionsMatch } from "./api";
import styles from "./embed.module.css";
import type { EmbedDisplayField, EmbedLayout } from "./model";
import {
  filterAgendaEntries,
  formatPublishedDateTimeRange,
  literalSearchPattern,
  publicAgendaDays,
  publishedEntryPresenters,
  publishedSpeakerSearchTermsBySessionId,
  uniqueSorted,
} from "./model";
import {
  PublicAgendaDayList,
  PublicAgendaFilters,
  PublicAgendaHeader,
} from "./public-agenda-sections";
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
function trackNameLabels(trackNames: readonly string[]): readonly ReactNode[] {
  const labels: ReactNode[] = [];
  for (const trackName of trackNames) {
    if (trackName.trim().length === 0) continue;
    labels.push(<span key={trackName}>Track: {trackName}</span>);
  }
  return labels;
}

function speakerRole(speaker: PublishedSpeaker): string {
  const jobTitle = speaker.jobTitle?.trim() ?? "";
  const organization = speaker.organization?.trim() ?? "";
  return [jobTitle, organization].filter(Boolean).join(" · ") || "Speaker";
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

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

  const presenters = publishedEntryPresenters(entry, speakers);
  const hasDescription = entry.summary.trim().length > 0;
  const hasLongDescription = entry.summary.length > 320;
  return (
    <dialog
      ref={dialogRef}
      className={styles.detailDialog}
      aria-labelledby="agenda-detail-heading"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
    >
      <button
        type="button"
        className={styles.dialogDismissLayer}
        aria-label="Close agenda session details"
        onClick={closeDialog}
      />
      <div className={styles.detailDialogSurface}>
        <div className={styles.viewHeading}>
          <div>
            <p className={styles.eyebrow}>Agenda session detail</p>
            <h2 id="agenda-detail-heading">{entry.title}</h2>
            <p>Published session information from the current agenda revision.</p>
          </div>
          <button
            ref={backButtonRef}
            className={styles.clearButton}
            type="button"
            onClick={closeDialog}
          >
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
              {trackNameLabels(entry.trackNames)}
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
      </div>
    </dialog>
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
const EMPTY_SPEAKER_LIST: readonly PublishedSpeaker[] = [];

const DEFAULT_AGENDA_DISPLAY_FIELDS: readonly EmbedDisplayField[] = [
  "title",
  "date-time",
  "room",
  "speakers",
  "format",
  "track",
  "summary",
];
interface PublicAgendaInteraction {
  readonly ownerKey: string;
  readonly day: string;
  readonly query: string;
  readonly track: string;
  readonly format: string;
  readonly room: string;
  readonly viewerLocal: boolean;
  readonly selectedEntryId: string | null;
}

function initialPublicAgendaInteraction(ownerKey: string): PublicAgendaInteraction {
  return {
    ownerKey,
    day: "",
    query: "",
    track: "",
    format: "",
    room: "",
    viewerLocal: false,
    selectedEntryId: null,
  };
}

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
    : EMPTY_SPEAKER_LIST;
  const displayFieldList = displayFields ?? DEFAULT_AGENDA_DISPLAY_FIELDS;
  const showField = (field: EmbedDisplayField): boolean =>
    agendaIncludeField(displayFieldList, field);
  const agendaOwnerKey = agenda.event.slug.trim();
  const [interactionOverride, setInteractionOverride] = useState<PublicAgendaInteraction | null>(
    null,
  );
  const ownedInteraction =
    interactionOverride?.ownerKey === agendaOwnerKey ? interactionOverride : undefined;
  const day = ownedInteraction?.day ?? "";
  const query = ownedInteraction?.query ?? "";
  const track = ownedInteraction?.track ?? "";
  const format = ownedInteraction?.format ?? "";
  const room = ownedInteraction?.room ?? "";
  const viewerLocal = ownedInteraction?.viewerLocal ?? false;
  const selectedEntryId = ownedInteraction?.selectedEntryId ?? null;
  const updateInteraction = (
    update: (current: PublicAgendaInteraction) => PublicAgendaInteraction,
  ): void => {
    setInteractionOverride((current) => {
      const base =
        current?.ownerKey === agendaOwnerKey
          ? current
          : initialPublicAgendaInteraction(agendaOwnerKey);
      return update(base);
    });
  };
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const speakerSearchTermsBySessionId = useMemo(
    () => publishedSpeakerSearchTermsBySessionId(speakers),
    [speakers],
  );
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
  const validDay = day === "" || eventDays.some((eventDay) => eventDay.date === day) ? day : "";
  const validTrack = track === "" || tracks.includes(track) ? track : "";
  const validFormat = format === "" || formats.includes(format) ? format : "";
  const validRoom = room === "" || rooms.includes(room) ? room : "";
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const normalizedQueryPattern = useMemo(
    () => literalSearchPattern(normalizedQuery),
    [normalizedQuery],
  );
  const visibleEntries = useMemo(() => {
    const configuredTrackIds = new Set(trackList);
    return filterAgendaEntries(agenda.entries, validDay, validTrack, agenda.event.timeZone).filter(
      (entry) =>
        (!validFormat || entry.format === validFormat) &&
        (!validRoom || entry.roomName === validRoom) &&
        (trackList.length === 0 ||
          (entry.trackIds?.some((trackId) => configuredTrackIds.has(trackId)) ?? false)) &&
        (normalizedQueryPattern === null ||
          normalizedQueryPattern.test(entrySearchText(entry, speakerSearchTermsBySessionId))),
    );
  }, [
    agenda.entries,
    agenda.event.timeZone,
    normalizedQueryPattern,
    speakerSearchTermsBySessionId,
    trackList,
    validDay,
    validFormat,
    validRoom,
    validTrack,
  ]);
  const hasFacetFilters = Boolean(normalizedQuery || validTrack || validFormat || validRoom);
  const visibleDays = useMemo(() => {
    const days = publicAgendaDays(visibleEntries, agenda.event.timeZone, agenda.event);
    return validDay ? days.filter((eventDay) => eventDay.date === validDay) : days;
  }, [agenda.event, validDay, visibleEntries]);
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
  const openEntry = (entryId: string, target: HTMLElement) => {
    returnFocusRef.current = target;
    updateInteraction((current) => ({ ...current, selectedEntryId: entryId }));
  };
  const closeEntry = () => updateInteraction((current) => ({ ...current, selectedEntryId: null }));

  if (selectedEntry) {
    return (
      <PublicAgendaSessionDetail
        key={selectedEntry.id}
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
      <PublicAgendaHeader
        revision={agenda.revision.number}
        publicBase={publicBase}
        jsonFeedAvailable={jsonFeedAvailable}
        icsFeedAvailable={icsFeedAvailable}
      />

      <PublicAgendaFilters
        key={agendaOwnerKey}
        formKey={agendaOwnerKey}
        query={query}
        validDay={validDay}
        validTrack={validTrack}
        validFormat={validFormat}
        validRoom={validRoom}
        viewerLocal={viewerLocal}
        eventDays={eventDays}
        tracks={tracks}
        formats={formats}
        rooms={rooms}
        onQueryChange={(value) => updateInteraction((current) => ({ ...current, query: value }))}
        onDayChange={(value) => updateInteraction((current) => ({ ...current, day: value }))}
        onTrackChange={(value) => updateInteraction((current) => ({ ...current, track: value }))}
        onFormatChange={(value) => updateInteraction((current) => ({ ...current, format: value }))}
        onRoomChange={(value) => updateInteraction((current) => ({ ...current, room: value }))}
        onViewerLocalChange={(value) =>
          updateInteraction((current) => ({ ...current, viewerLocal: value }))
        }
        onClear={() =>
          updateInteraction((current) => ({
            ...current,
            query: "",
            day: "",
            track: "",
            format: "",
            room: "",
          }))
        }
      />

      <div className={styles.resultBar} role="status" aria-live="polite">
        <span>
          {visibleEntries.length} session{visibleEntries.length === 1 ? "" : "s"}
        </span>
        <span>Times shown in {displayTimeZone}</span>
      </div>

      <PublicAgendaDayList
        visibleDays={visibleDays}
        eventDays={eventDays}
        displayTimeZone={displayTimeZone}
        speakers={speakers}
        hasFacetFilters={hasFacetFilters}
        showField={showField}
        renderTrackLabels={trackNameLabels}
        renderSpeakerRole={speakerRole}
        onOpenEntry={openEntry}
      />
    </section>
  );
}
