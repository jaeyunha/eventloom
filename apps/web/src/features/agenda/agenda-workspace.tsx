"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./agenda.module.css";
import { type AgendaApi, AgendaApiError, createAgendaApi } from "./api";
import {
  createLocalAgendaDemoApi,
  loadAgendaWorkspace,
  resolveAgendaAppEnvironment,
} from "./demo/agenda-demo-api";
import {
  agendaDays,
  conflictsForEntry,
  formatLocalTime,
  formatRevisionTimestamp,
  publicationReadiness,
  warningsForEntry,
} from "./model";
import type {
  AgendaEntry,
  AgendaEntryInput,
  AgendaPreview,
  AgendaSession,
  AgendaTrack,
  AgendaWorkspaceData,
} from "./types";

function messageFrom(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "The agenda request could not be completed.";
}

function previewFromError(error: AgendaApiError, draftVersion: number): AgendaPreview | null {
  if (!error.details?.conflicts && !error.details?.warnings) {
    return null;
  }
  return {
    draftVersion,
    conflicts: error.details.conflicts ?? [],
    warnings: error.details.warnings ?? [],
    diff: { added: 0, changed: 0, removed: 0 },
    validatedAt: new Date().toISOString(),
  };
}

interface EntryFormProps {
  entry?: AgendaEntry;
  sessions: readonly AgendaSession[];
  rooms: AgendaWorkspaceData["rooms"];
  tracks: readonly AgendaTrack[];
  eventStart: string;
  busy: boolean;
  onSubmit(entry: AgendaEntryInput): Promise<void>;
  onCancel?: () => void;
}

function EntryForm({
  entry,
  sessions,
  rooms,
  tracks,
  eventStart,
  busy,
  onSubmit,
  onCancel,
}: EntryFormProps) {
  const firstSession = entry?.sessionId ?? sessions[0]?.id ?? "";
  const [sessionId, setSessionId] = useState(firstSession);
  const [roomId, setRoomId] = useState(entry?.roomId ?? rooms[0]?.id ?? "");
  const [trackIds, setTrackIds] = useState<readonly string[]>(
    entry?.trackIds ?? (tracks[0] ? [tracks[0].id] : []),
  );
  const [startsAtLocal, setStartsAtLocal] = useState(entry?.startsAtLocal ?? `${eventStart}T09:00`);
  const [endsAtLocal, setEndsAtLocal] = useState(entry?.endsAtLocal ?? `${eventStart}T10:00`);
  const [formError, setFormError] = useState<string | null>(null);

  function toggleTrack(trackId: string) {
    setTrackIds((current) =>
      current.includes(trackId)
        ? current.filter((candidate) => candidate !== trackId)
        : [...current, trackId],
    );
  }

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!sessionId || !roomId || trackIds.length === 0) {
      setFormError("Choose a session, room, and at least one track.");
      return;
    }
    if (endsAtLocal <= startsAtLocal) {
      setFormError("End time must be after start time.");
      return;
    }
    setFormError(null);
    await onSubmit({
      ...(entry ? { id: entry.id } : {}),
      sessionId,
      roomId,
      trackIds,
      startsAtLocal,
      endsAtLocal,
    });
  }

  return (
    <form className={styles.entryForm} onSubmit={(event) => void submit(event)}>
      {entry ? (
        <div className={styles.fixedSession}>
          <span>Session</span>
          <strong>{entry.title}</strong>
        </div>
      ) : (
        <label>
          <span>Accepted session</span>
          <select value={sessionId} onChange={(event) => setSessionId(event.target.value)}>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.title} ({session.durationMinutes} min)
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        <span>Room</span>
        <select value={roomId} onChange={(event) => setRoomId(event.target.value)}>
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name} ({room.capacity} seats)
            </option>
          ))}
        </select>
      </label>
      <fieldset className={styles.trackOptions}>
        <legend>Tracks</legend>
        {tracks.map((track) => (
          <label key={track.id}>
            <input
              type="checkbox"
              checked={trackIds.includes(track.id)}
              onChange={() => toggleTrack(track.id)}
            />
            <span style={{ "--track-color": track.color } as React.CSSProperties}>
              {track.name}
            </span>
          </label>
        ))}
      </fieldset>
      <div className={styles.timeFields}>
        <label>
          <span>Starts</span>
          <input
            type="datetime-local"
            value={startsAtLocal}
            onChange={(event) => setStartsAtLocal(event.target.value)}
          />
        </label>
        <label>
          <span>Ends</span>
          <input
            type="datetime-local"
            value={endsAtLocal}
            onChange={(event) => setEndsAtLocal(event.target.value)}
          />
        </label>
      </div>
      {formError ? <p className={styles.formError}>{formError}</p> : null}
      <div className={styles.formActions}>
        {onCancel ? (
          <button className={styles.secondaryButton} type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button className={styles.primaryButton} type="submit" disabled={busy}>
          {busy ? "Saving..." : entry ? "Save changes" : "Add to draft"}
        </button>
      </div>
    </form>
  );
}

interface AgendaBoardProps {
  data: AgendaWorkspaceData;
  preview: AgendaPreview | null;
  busy: boolean;
  statusMessage: string | null;
  error: string | null;
  onSaveEntry(entry: AgendaEntryInput): Promise<void>;
  onRemoveEntry(entryId: string): Promise<void>;
  onPreview(): Promise<void>;
  onOverrideWarning(warningId: string, reason: string): Promise<void>;
  onPublish(): Promise<void>;
  onDismissError(): void;
}

export function AgendaBoard({
  data,
  preview,
  busy,
  statusMessage,
  error,
  onSaveEntry,
  onRemoveEntry,
  onPreview,
  onOverrideWarning,
  onPublish,
  onDismissError,
}: AgendaBoardProps) {
  const days = agendaDays(data.draft.entries);
  const readiness = publicationReadiness(data, preview);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const currentRevision = data.currentPublishedRevision;

  return (
    <div className={styles.workspaceRoot}>
      <a className={styles.skipLink} href="#agenda-content">
        Skip to agenda workspace
      </a>
      <header className={styles.topbar}>
        <a className={styles.brand} href="/admin">
          <span aria-hidden="true">OS</span>
          Open Sessionboard
        </a>
        <nav aria-label="Organizer navigation">
          <a href={`/admin/events/${encodeURIComponent(data.event.id)}`}>Event overview</a>
          <a aria-current="page" href={`/admin/events/${encodeURIComponent(data.event.id)}/agenda`}>
            Agenda
          </a>
        </nav>
      </header>

      <main id="agenda-content" className={styles.workspace} tabIndex={-1}>
        <header className={styles.pageHeading}>
          <div>
            <p className={styles.eyebrow}>{data.event.name}</p>
            <h1>Agenda workspace</h1>
            <p className={styles.pageDescription}>
              Schedule accepted sessions in a private draft. Public embeds continue to use the last
              published revision until you publish again.
            </p>
          </div>
          <div className={styles.draftStatus}>
            <span className={styles.statusDot} aria-hidden="true" />
            <div>
              <strong>Draft v{data.draft.version}</strong>
              <small>
                Updated {formatRevisionTimestamp(data.draft.updatedAt)} by {data.draft.updatedBy}
              </small>
            </div>
          </div>
        </header>

        {error ? (
          <div className={styles.errorBanner} role="alert">
            <div>
              <strong>Agenda change was not saved</strong>
              <p>{error}</p>
            </div>
            <button type="button" onClick={onDismissError} aria-label="Dismiss error">
              Close
            </button>
          </div>
        ) : null}
        <div className={styles.srOnly} role="status" aria-live="polite">
          {statusMessage}
        </div>

        <div className={styles.workspaceGrid}>
          <section className={styles.boardColumn} aria-labelledby="schedule-heading">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>Private schedule</p>
                <h2 id="schedule-heading">Draft schedule</h2>
                <p>Times are shown in {data.event.timeZone}.</p>
              </div>
              <button
                className={styles.primaryButton}
                type="button"
                disabled={data.unscheduledSessions.length === 0 || busy}
                onClick={() => setShowAddForm((current) => !current)}
                aria-expanded={showAddForm}
                aria-controls="add-session-panel"
              >
                Add accepted session
              </button>
            </div>

            {showAddForm ? (
              <div id="add-session-panel" className={styles.addPanel}>
                <h3>Schedule a session</h3>
                <EntryForm
                  sessions={data.unscheduledSessions}
                  rooms={data.rooms}
                  tracks={data.tracks}
                  eventStart={data.event.startsOn}
                  busy={busy}
                  onCancel={() => setShowAddForm(false)}
                  onSubmit={async (entry) => {
                    await onSaveEntry(entry);
                    setShowAddForm(false);
                  }}
                />
              </div>
            ) : null}

            {days.length === 0 ? (
              <div className={styles.emptySchedule}>
                <strong>No sessions scheduled yet</strong>
                <p>Add an accepted session to begin the private agenda draft.</p>
              </div>
            ) : (
              <div className={styles.days}>
                {days.map((day) => (
                  <section
                    key={day.date}
                    className={styles.day}
                    aria-labelledby={`day-${day.date}`}
                  >
                    <header>
                      <h3 id={`day-${day.date}`}>{day.label}</h3>
                      <span>
                        {day.entries.length} session{day.entries.length === 1 ? "" : "s"}
                      </span>
                    </header>
                    <ol className={styles.sessionList}>
                      {day.entries.map((entry) => {
                        const entryConflicts = conflictsForEntry(
                          entry.id,
                          preview?.conflicts ?? [],
                        );
                        const entryWarnings = warningsForEntry(entry.id, preview?.warnings ?? []);
                        const hasIssues = entryConflicts.length + entryWarnings.length > 0;
                        return (
                          <li key={entry.id}>
                            <article
                              className={`${styles.sessionCard} ${hasIssues ? styles.sessionIssue : ""}`}
                            >
                              <div className={styles.sessionTime}>
                                <time dateTime={entry.startsAtLocal}>
                                  {formatLocalTime(entry.startsAtLocal)}
                                </time>
                                <span aria-hidden="true">to</span>
                                <time dateTime={entry.endsAtLocal}>
                                  {formatLocalTime(entry.endsAtLocal)}
                                </time>
                              </div>
                              <div className={styles.sessionDetails}>
                                <div className={styles.sessionMeta}>
                                  <span>{entry.format}</span>
                                  {entry.trackNames.map((track) => (
                                    <span key={track}>{track}</span>
                                  ))}
                                </div>
                                <h4>{entry.title}</h4>
                                <p>{entry.speakerNames.join(", ")}</p>
                                <p className={styles.roomName}>{entry.roomName}</p>
                                {entryConflicts.map((conflict) => (
                                  <p className={styles.inlineConflict} key={conflict.id}>
                                    Hard conflict: {conflict.message}
                                  </p>
                                ))}
                                {entryWarnings.map((warning) => (
                                  <p className={styles.inlineWarning} key={warning.id}>
                                    Warning: {warning.message}
                                  </p>
                                ))}
                              </div>
                              <div className={styles.cardActions}>
                                <button
                                  type="button"
                                  className={styles.textButton}
                                  onClick={() =>
                                    setEditingEntryId((current) =>
                                      current === entry.id ? null : entry.id,
                                    )
                                  }
                                  aria-expanded={editingEntryId === entry.id}
                                  aria-controls={`edit-${entry.id}`}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className={styles.dangerButton}
                                  disabled={busy}
                                  onClick={() => void onRemoveEntry(entry.id)}
                                >
                                  Remove
                                </button>
                              </div>
                            </article>
                            {editingEntryId === entry.id ? (
                              <div id={`edit-${entry.id}`} className={styles.editPanel}>
                                <EntryForm
                                  entry={entry}
                                  sessions={[]}
                                  rooms={data.rooms}
                                  tracks={data.tracks}
                                  eventStart={data.event.startsOn}
                                  busy={busy}
                                  onCancel={() => setEditingEntryId(null)}
                                  onSubmit={async (input) => {
                                    await onSaveEntry(input);
                                    setEditingEntryId(null);
                                  }}
                                />
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                ))}
              </div>
            )}
          </section>

          <aside className={styles.inspector} aria-label="Agenda validation and publication">
            <section className={styles.inspectorCard} aria-labelledby="validation-heading">
              <div className={styles.inspectorHeading}>
                <div>
                  <p className={styles.eyebrow}>Safety check</p>
                  <h2 id="validation-heading">Validate draft</h2>
                </div>
                {preview?.draftVersion === data.draft.version ? (
                  <span className={styles.validatedBadge}>Validated</span>
                ) : (
                  <span className={styles.draftBadge}>Needs validation</span>
                )}
              </div>
              <p>
                Check room, speaker, resource, travel, track, and capacity rules against draft v
                {data.draft.version}.
              </p>
              <button
                className={styles.secondaryButton}
                type="button"
                disabled={busy || data.draft.entries.length === 0}
                onClick={() => void onPreview()}
              >
                {busy ? "Checking..." : "Preview and validate"}
              </button>
              {preview ? (
                <fieldset className={styles.diffSummary}>
                  <legend className={styles.srOnly}>Changes from published revision</legend>
                  <span>
                    <strong>{preview.diff.added}</strong> added
                  </span>
                  <span>
                    <strong>{preview.diff.changed}</strong> changed
                  </span>
                  <span>
                    <strong>{preview.diff.removed}</strong> removed
                  </span>
                </fieldset>
              ) : null}
            </section>

            {preview?.conflicts.length ? (
              <section className={styles.conflictPanel} aria-labelledby="conflicts-heading">
                <h2 id="conflicts-heading">
                  {preview.conflicts.length} hard conflict
                  {preview.conflicts.length === 1 ? "" : "s"}
                </h2>
                <p>Hard conflicts block publication and cannot be overridden.</p>
                <ul>
                  {preview.conflicts.map((conflict) => (
                    <li key={conflict.id}>
                      <strong>{conflict.kind.replace("_", " ")}</strong>
                      <span>{conflict.message}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {preview?.warnings.length ? (
              <section className={styles.warningPanel} aria-labelledby="warnings-heading">
                <h2 id="warnings-heading">
                  {preview.warnings.length} warning{preview.warnings.length === 1 ? "" : "s"}
                </h2>
                <p>Warnings require a recorded organizer reason before publication.</p>
                <ul>
                  {preview.warnings.map((warning) => (
                    <li key={warning.id}>
                      <strong>{warning.kind}</strong>
                      <span>{warning.message}</span>
                      {warning.overridden ? (
                        <p className={styles.overrideRecorded}>
                          Override recorded: {warning.overrideReason}
                        </p>
                      ) : (
                        <WarningOverrideForm
                          busy={busy}
                          onSubmit={(reason) => onOverrideWarning(warning.id, reason)}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className={styles.publishCard} aria-labelledby="publish-heading">
              <p className={styles.eyebrow}>Public revision</p>
              <h2 id="publish-heading">Publish agenda</h2>
              {currentRevision ? (
                <p>
                  Revision {currentRevision.number} is public with {currentRevision.sessionCount}
                  sessions. Published {formatRevisionTimestamp(currentRevision.publishedAt)}.
                </p>
              ) : (
                <p>No agenda revision has been published. Public embeds remain unavailable.</p>
              )}
              {!readiness.ready ? (
                <ul className={styles.readinessList} aria-label="Publication requirements">
                  {readiness.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : (
                <p className={styles.readyMessage}>
                  Draft v{data.draft.version} is ready to publish.
                </p>
              )}
              <button
                className={styles.publishButton}
                type="button"
                disabled={busy || !readiness.ready}
                onClick={() => void onPublish()}
              >
                {busy ? "Publishing..." : "Publish immutable revision"}
              </button>
              <small>
                Publishing atomically updates the public projection and queues cache, calendar, and
                integration notifications.
              </small>
            </section>

            {data.revisions.length > 0 ? (
              <section className={styles.historyCard} aria-labelledby="history-heading">
                <h2 id="history-heading">Revision history</h2>
                <ol>
                  {data.revisions.map((revision) => (
                    <li key={revision.id}>
                      <div>
                        <strong>Revision {revision.number}</strong>
                        {revision.current ? <span>Current</span> : null}
                      </div>
                      <small>
                        {revision.sessionCount} sessions,{" "}
                        {formatRevisionTimestamp(revision.publishedAt)}
                      </small>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </aside>
        </div>
      </main>
    </div>
  );
}

function WarningOverrideForm({
  busy,
  onSubmit,
}: Readonly<{ busy: boolean; onSubmit(reason: string): Promise<void> }>) {
  const [reason, setReason] = useState("");
  return (
    <form
      className={styles.overrideForm}
      onSubmit={(event) => {
        event.preventDefault();
        if (reason.trim().length >= 3) {
          void onSubmit(reason.trim());
        }
      }}
    >
      <label>
        <span>Organizer override reason</span>
        <textarea
          value={reason}
          minLength={3}
          required
          rows={2}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <button
        type="submit"
        className={styles.textButton}
        disabled={busy || reason.trim().length < 3}
      >
        Record override
      </button>
    </form>
  );
}

interface AgendaWorkspaceProps {
  eventId: string;
  api?: AgendaApi;
  appEnvironment?: string;
}

export function AgendaWorkspace({
  eventId,
  api: providedApi,
  appEnvironment = process.env.APP_ENV,
}: Readonly<AgendaWorkspaceProps>) {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  const api = useMemo(
    () => providedApi ?? (apiBaseUrl ? createAgendaApi(apiBaseUrl) : null),
    [apiBaseUrl, providedApi],
  );
  const localDemoApiRef = useRef<{ eventId: string; api: AgendaApi } | null>(null);
  const resolveLocalDemoApi = useCallback(
    async (signal?: AbortSignal) => {
      if (localDemoApiRef.current?.eventId === eventId) {
        return localDemoApiRef.current.api;
      }
      const environment = await resolveAgendaAppEnvironment(appEnvironment, signal);
      const localApi = createLocalAgendaDemoApi(environment, eventId);
      if (localApi) {
        localDemoApiRef.current = { eventId, api: localApi };
      }
      return localApi;
    },
    [appEnvironment, eventId],
  );
  const [activeApi, setActiveApi] = useState<AgendaApi | null>(api);
  const [data, setData] = useState<AgendaWorkspaceData | null>(null);
  const [preview, setPreview] = useState<AgendaPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!api) {
        setError("The organizer API URL is not configured.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      setStatusMessage(null);
      try {
        const loaded = await loadAgendaWorkspace(api, resolveLocalDemoApi, eventId, signal);
        setActiveApi(loaded.api);
        setData(loaded.data);
        if (loaded.usingLocalDemo) {
          setStatusMessage(
            "Showing the deterministic local demo agenda because the local API has no agenda data.",
          );
        }
      } catch (loadError) {
        if (!(loadError instanceof DOMException && loadError.name === "AbortError")) {
          setError(messageFrom(loadError));
        }
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [api, eventId, resolveLocalDemoApi],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function mutate(
    operation: (activeApi: AgendaApi, current: AgendaWorkspaceData) => Promise<AgendaWorkspaceData>,
    successMessage: string,
    refreshPreview = false,
  ) {
    if (!activeApi || !data) {
      return;
    }
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const nextData = await operation(activeApi, data);
      setData(nextData);
      setPreview(refreshPreview ? await activeApi.preview(eventId) : null);
      setStatusMessage(successMessage);
    } catch (mutationError) {
      setError(messageFrom(mutationError));
      if (mutationError instanceof AgendaApiError) {
        setPreview(previewFromError(mutationError, data.draft.version));
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) {
    return (
      <main className={styles.loadingState} aria-live="polite">
        <span className={styles.loadingBar} aria-hidden="true" />
        <h1>Loading agenda workspace</h1>
        <p>Retrieving the private draft and published revision.</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className={styles.loadingState}>
        <h1>Agenda workspace unavailable</h1>
        <p role="alert">{error ?? "The agenda could not be loaded."}</p>
        <button className={styles.primaryButton} type="button" onClick={() => void load()}>
          Try again
        </button>
      </main>
    );
  }

  return (
    <AgendaBoard
      data={data}
      preview={preview}
      busy={busy}
      statusMessage={statusMessage}
      error={error}
      onDismissError={() => setError(null)}
      onSaveEntry={(entry) =>
        mutate(
          (activeApi, current) =>
            activeApi.saveEntry({
              eventId,
              expectedVersion: current.draft.version,
              entry,
            }),
          "Session saved to the private agenda draft.",
        )
      }
      onRemoveEntry={(entryId) =>
        mutate(
          (activeApi, current) =>
            activeApi.removeEntry({
              eventId,
              entryId,
              expectedVersion: current.draft.version,
            }),
          "Session removed from the private agenda draft.",
        )
      }
      onPreview={async () => {
        if (!activeApi) return;
        setBusy(true);
        setError(null);
        try {
          const result = await activeApi.preview(eventId);
          setPreview(result);
          setStatusMessage(
            result.conflicts.length === 0
              ? "Agenda validation completed."
              : "Agenda validation found hard conflicts.",
          );
        } catch (previewError) {
          setError(messageFrom(previewError));
        } finally {
          setBusy(false);
        }
      }}
      onOverrideWarning={(warningId, reason) =>
        mutate(
          (activeApi, current) =>
            activeApi.overrideWarning({
              eventId,
              expectedVersion: current.draft.version,
              warningId,
              reason,
            }),
          "Warning override recorded in the agenda audit history.",
          true,
        )
      }
      onPublish={() =>
        mutate(
          (activeApi, current) =>
            activeApi.publish({ eventId, expectedVersion: current.draft.version }),
          "Agenda revision published. Public projections are being refreshed.",
        )
      }
    />
  );
}
