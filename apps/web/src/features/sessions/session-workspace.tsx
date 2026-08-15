"use client";

import { type SyntheticEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  StatusBadge,
  WorkspaceBreadcrumb,
  WorkspaceHeader,
  WorkspaceMetaItem,
  WorkspaceSurface,
  workspaceClassNames,
} from "@/components/workspace/workspace-ui";
import { useOrganizerEventId } from "@/features/admin/organizer-event-workspace";
import {
  createSessionsApi,
  type SessionContentStatus,
  type SessionHistoryEntry,
  type SessionRecord,
  type SessionSpeakerCandidate,
  type SessionSpeakerReference,
  type SessionsApi,
} from "./api";
import styles from "./session-workspace.module.css";

export interface SessionsWorkspaceProps {
  readonly eventId: string;
  readonly organizationId: string;
  readonly api?: SessionsApi;
}

export interface SessionsWorkspaceViewProps {
  readonly eventId: string;
  readonly organizationId: string;
  readonly sessions: readonly SessionRecord[];
  readonly selectedSessionId: string | null;
  readonly history: readonly SessionHistoryEntry[];
  readonly speakers?: readonly SessionSpeakerCandidate[] | null;
  readonly loading?: boolean;
  readonly loadingHistory?: boolean;
  readonly loadingSpeakers?: boolean;
  readonly busy?: boolean;
  readonly error?: string | null;
  readonly historyError?: string | null;
  readonly speakerError?: string | null;
  readonly statusMessage?: string | null;
  readonly onSelectSession?: (sessionId: string) => void;
  readonly onSave?: (input: {
    readonly sessionId: string;
    readonly expectedVersion: number;
    readonly title: string;
    readonly description: string;
  }) => Promise<void>;
  readonly onSetContentStatus?: (
    session: SessionRecord,
    contentStatus: SessionContentStatus,
  ) => Promise<void>;
  readonly onSaveSpeakers?: (input: {
    readonly sessionId: string;
    readonly expectedVersion: number;
    readonly speakerIds: readonly string[];
  }) => Promise<void>;
  readonly onRestore?: (input: {
    readonly sessionId: string;
    readonly version: number;
    readonly expectedVersion: number;
  }) => Promise<void>;
  readonly onRetry?: () => void;
  readonly onRetrySpeakers?: () => void;
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "The session request could not be completed.";
}

function displayStatus(status: SessionContentStatus | undefined): SessionContentStatus {
  return status ?? "Needs changes";
}

function statusTone(status: SessionContentStatus): "success" | "warning" {
  return status === "Approved" ? "success" : "warning";
}

function formatAction(action: SessionHistoryEntry["action"]): string {
  return action.replace(/_/gu, " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function formatTimestamp(value: string): string {
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toLocaleString() : value;
}

function formatSpeakerRole(role: string | undefined): string {
  return role === undefined
    ? "Role not specified"
    : role.replace(/_/gu, " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function assignmentReferences(session: SessionRecord): readonly SessionSpeakerReference[] {
  const references = new Map(session.speakerRoster.map((reference) => [reference.id, reference]));
  return session.speakerIds.map((id) => references.get(id) ?? { id });
}

function SessionEditor({
  session,
  busy,
  onSave,
  onSetContentStatus,
}: Readonly<{
  session: SessionRecord;
  busy: boolean;
  onSave?: SessionsWorkspaceViewProps["onSave"];
  onSetContentStatus?: SessionsWorkspaceViewProps["onSetContentStatus"];
}>) {
  const [title, setTitle] = useState(session.title);
  const [description, setDescription] = useState(session.description);
  const changed = title !== session.title || description !== session.description;
  const currentStatus = displayStatus(session.contentStatus);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onSave || !changed || title.trim().length === 0) return;
    await onSave({
      sessionId: session.id,
      expectedVersion: session.version,
      title: title.trim(),
      description,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Session content</CardTitle>
        <CardDescription>
          Changes create a new version and require a fresh public-content review.
        </CardDescription>
      </CardHeader>
      <CardContent className={styles.stack}>
        <form className={styles.editorForm} onSubmit={(event) => void submit(event)}>
          <label className={styles.field} htmlFor={`session-title-${session.id}`}>
            Title
            <Input
              disabled={busy || onSave === undefined}
              id={`session-title-${session.id}`}
              required
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
          </label>
          <label className={styles.field} htmlFor={`session-description-${session.id}`}>
            Abstract
            <Textarea
              disabled={busy || onSave === undefined}
              id={`session-description-${session.id}`}
              rows={8}
              value={description}
              onChange={(event) => setDescription(event.currentTarget.value)}
            />
          </label>
          <Button disabled={busy || !changed || title.trim().length === 0 || !onSave} type="submit">
            {busy ? "Saving..." : "Save content"}
          </Button>
        </form>

        <section className={styles.approval} aria-labelledby={`content-approval-${session.id}`}>
          <div className={styles.approvalHeader}>
            <h3 id={`content-approval-${session.id}`}>Content approval</h3>
            <StatusBadge tone={statusTone(currentStatus)}>{currentStatus}</StatusBadge>
          </div>
          <p className={styles.muted}>
            Only approved content is eligible for public session and agenda projections.
          </p>
          <div className={styles.actions}>
            <Button
              disabled={busy || currentStatus === "Approved" || !onSetContentStatus}
              type="button"
              onClick={() => void onSetContentStatus?.(session, "Approved")}
            >
              Approve content
            </Button>
            <Button
              disabled={busy || currentStatus === "Needs changes" || !onSetContentStatus}
              type="button"
              variant="outline"
              onClick={() => void onSetContentStatus?.(session, "Needs changes")}
            >
              Mark needs changes
            </Button>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

function SpeakerAssignments({
  session,
  speakers,
  loading,
  error,
  busy,
  onSave,
  onRetry,
}: Readonly<{
  session: SessionRecord;
  speakers: readonly SessionSpeakerCandidate[] | null;
  loading: boolean;
  error: string | null;
  busy: boolean;
  onSave?: SessionsWorkspaceViewProps["onSaveSpeakers"];
  onRetry?: SessionsWorkspaceViewProps["onRetrySpeakers"];
}>) {
  const currentReferences = assignmentReferences(session);
  const candidatesById = new Map((speakers ?? []).map((speaker) => [speaker.id, speaker]));
  const options = [
    ...currentReferences.map((reference) => ({
      id: reference.id,
      displayName:
        reference.displayName ?? candidatesById.get(reference.id)?.displayName ?? reference.id,
      ...(candidatesById.get(reference.id)?.jobTitle === undefined
        ? {}
        : { jobTitle: candidatesById.get(reference.id)?.jobTitle }),
      ...(candidatesById.get(reference.id)?.company === undefined
        ? {}
        : { company: candidatesById.get(reference.id)?.company }),
    })),
    ...(speakers ?? []).filter((speaker) => !session.speakerIds.includes(speaker.id)),
  ];
  const [selectedIds, setSelectedIds] = useState<readonly string[]>(session.speakerIds);
  const selected = new Set(selectedIds);
  const changed =
    selectedIds.length !== session.speakerIds.length ||
    selectedIds.some((id) => !session.speakerIds.includes(id));

  function toggle(speakerId: string, checked: boolean) {
    setSelectedIds((current) =>
      checked
        ? current.includes(speakerId)
          ? current
          : [...current, speakerId]
        : current.filter((id) => id !== speakerId),
    );
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!changed || !onSave) return;
    await onSave({
      sessionId: session.id,
      expectedVersion: session.version,
      speakerIds: selectedIds,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Speaker assignments</CardTitle>
        <CardDescription>
          Review the assigned speakers, then add or remove people from the event roster.
        </CardDescription>
      </CardHeader>
      <CardContent className={styles.stack}>
        <section
          aria-labelledby={`current-speakers-${session.id}`}
          className={styles.assignmentBlock}
        >
          <h3 id={`current-speakers-${session.id}`}>Current assignments</h3>
          {currentReferences.length === 0 ? (
            <p className={styles.muted}>No speakers are currently assigned to this session.</p>
          ) : (
            <ul className={styles.currentAssignments}>
              {currentReferences.map((reference) => {
                const candidate = candidatesById.get(reference.id);
                return (
                  <li className={styles.currentAssignment} key={reference.id}>
                    <strong>
                      {reference.displayName ?? candidate?.displayName ?? reference.id}
                    </strong>
                    <span className={styles.muted}>{formatSpeakerRole(reference.role)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <form className={styles.assignmentForm} onSubmit={(event) => void submit(event)}>
          <fieldset className={styles.assignmentFieldset} disabled={busy || onSave === undefined}>
            <legend>Event speaker roster</legend>
            {loading ? <p className={styles.muted}>Loading event speakers...</p> : null}
            {error === null ? null : (
              <Alert variant="destructive">
                <AlertTitle>Speaker roster unavailable</AlertTitle>
                <AlertDescription>
                  {error} Current assignments are preserved while the roster is unavailable.
                </AlertDescription>
                {!onRetry ? null : (
                  <Button size="sm" type="button" variant="outline" onClick={onRetry}>
                    Retry speaker roster
                  </Button>
                )}
              </Alert>
            )}
            {!loading && error === null && speakers !== null && speakers.length === 0 ? (
              <p className={styles.muted}>No speakers are available in this event roster.</p>
            ) : null}
            {options.length === 0 ? null : (
              <div className={styles.candidateList}>
                {options.map((speaker) => {
                  const checkboxId = `session-speaker-${session.id}-${speaker.id}`;
                  const details = [speaker.jobTitle, speaker.company].filter(Boolean).join(" at ");
                  return (
                    <div className={styles.candidateRow} key={speaker.id}>
                      <Checkbox
                        checked={selected.has(speaker.id)}
                        id={checkboxId}
                        onCheckedChange={(checked) => toggle(speaker.id, checked === true)}
                      />
                      <Label className={styles.candidateLabel} htmlFor={checkboxId}>
                        <span>{speaker.displayName}</span>
                        {details.length === 0 ? null : (
                          <span className={styles.muted}>{details}</span>
                        )}
                      </Label>
                    </div>
                  );
                })}
              </div>
            )}
          </fieldset>
          <div className={styles.assignmentActions}>
            <span className={styles.muted} aria-live="polite">
              {selectedIds.length} speaker{selectedIds.length === 1 ? "" : "s"} selected
            </span>
            <Button disabled={busy || !changed || !onSave} type="submit">
              {busy ? "Saving..." : "Save speaker assignments"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function SessionHistory({
  session,
  entries,
  busy,
  loading,
  error,
  onRestore,
}: Readonly<{
  session: SessionRecord;
  entries: readonly SessionHistoryEntry[];
  busy: boolean;
  loading: boolean;
  error: string | null;
  onRestore?: SessionsWorkspaceViewProps["onRestore"];
}>) {
  return (
    <WorkspaceSurface
      title="Change history"
      description="Every saved version remains available for review and restoration."
    >
      {loading ? <p className={styles.muted}>Loading session history...</p> : null}
      {error === null ? null : <Alert variant="destructive">{error}</Alert>}
      {!loading && error === null && entries.length === 0 ? (
        <p className={styles.muted}>No session history was returned.</p>
      ) : null}

      <ol className={styles.historyList}>
        {entries.map((entry) => {
          const current = entry.version === session.version;
          const restorable = entry.snapshot !== undefined && entry.version < session.version;
          return (
            <li className={styles.historyItem} key={entry.id}>
              <div className={styles.historyHeader}>
                <div className={styles.historyCopy}>
                  <strong>
                    Version {entry.version} - {formatAction(entry.action)}
                  </strong>
                  <span className={styles.muted}>
                    {entry.actorLabel ?? entry.actorId} - {formatTimestamp(entry.occurredAt)}
                  </span>
                </div>
                {current ? <StatusBadge tone="info">Current</StatusBadge> : null}
                {!restorable ? null : (
                  <Button
                    disabled={busy || !onRestore}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() =>
                      void onRestore?.({
                        sessionId: session.id,
                        version: entry.version,
                        expectedVersion: session.version,
                      })
                    }
                  >
                    Restore version {entry.version}
                  </Button>
                )}
              </div>

              {entry.snapshot === undefined ? null : (
                <div className={styles.snapshot}>
                  <span>
                    <strong>Title: </strong>
                    {entry.snapshot.title}
                  </span>
                  <span className={styles.snapshotDescription}>{entry.snapshot.description}</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </WorkspaceSurface>
  );
}

export function SessionsWorkspaceView({
  eventId,
  organizationId,
  sessions,
  selectedSessionId,
  history,
  speakers = null,
  loading = false,
  loadingHistory = false,
  loadingSpeakers = false,
  busy = false,
  error = null,
  historyError = null,
  speakerError = null,
  statusMessage = null,
  onSelectSession,
  onSave,
  onSetContentStatus,
  onSaveSpeakers,
  onRestore,
  onRetry,
  onRetrySpeakers,
}: Readonly<SessionsWorkspaceViewProps>) {
  const selected = sessions.find((session) => session.id === selectedSessionId) ?? null;

  return (
    <main className={`${workspaceClassNames.page} ${styles.workspace}`}>
      <WorkspaceHeader
        breadcrumb={
          <WorkspaceBreadcrumb>
            <span>Event content</span>
            <span aria-hidden="true">/</span>
            <span>Sessions</span>
          </WorkspaceBreadcrumb>
        }
        description="Edit canonical session copy, review public-content readiness, and restore prior versions."
        metadata={
          <>
            <WorkspaceMetaItem>{sessions.length} sessions</WorkspaceMetaItem>
            <WorkspaceMetaItem>Event {eventId}</WorkspaceMetaItem>
            <WorkspaceMetaItem>Organization {organizationId}</WorkspaceMetaItem>
          </>
        }
        title="Sessions"
      />

      {error === null ? null : (
        <Alert variant="destructive">
          <AlertTitle>Sessions unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          {!onRetry ? null : (
            <Button className="mt-3" size="sm" type="button" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          )}
        </Alert>
      )}
      {statusMessage === null ? null : (
        <Alert aria-live="polite" role="status">
          {statusMessage}
        </Alert>
      )}

      <div className={styles.contentGrid}>
        <WorkspaceSurface
          title="Session list"
          description="Choose a session to edit its canonical content and history."
        >
          {loading ? <p className={styles.muted}>Loading sessions...</p> : null}
          {!loading && sessions.length === 0 ? (
            <p className={styles.muted}>No sessions are available for this event.</p>
          ) : null}

          <ul className={styles.sessionList}>
            {sessions.map((session) => {
              const selectedItem = session.id === selectedSessionId;
              return (
                <li key={session.id}>
                  <Button
                    aria-pressed={selectedItem}
                    className={styles.sessionButton}
                    type="button"
                    variant={selectedItem ? "secondary" : "ghost"}
                    onClick={() => onSelectSession?.(session.id)}
                  >
                    <span className={styles.sessionButtonCopy}>
                      <span>{session.title}</span>
                      <span className={styles.sessionButtonMeta}>
                        {session.status} - {displayStatus(session.contentStatus)}
                      </span>
                    </span>
                  </Button>
                </li>
              );
            })}
          </ul>
        </WorkspaceSurface>

        <div className={styles.stack}>
          {selected === null ? (
            <WorkspaceSurface title="Select a session">
              <p className={styles.muted}>
                Choose a session to edit its content and inspect its version history.
              </p>
            </WorkspaceSurface>
          ) : (
            <>
              <SessionEditor
                busy={busy}
                key={`${selected.id}:${selected.version}`}
                session={selected}
                onSave={onSave}
                onSetContentStatus={onSetContentStatus}
              />
              <SpeakerAssignments
                busy={busy}
                error={speakerError}
                key={selected.id}
                loading={loadingSpeakers}
                session={selected}
                speakers={speakers}
                onRetry={onRetrySpeakers}
                onSave={onSaveSpeakers}
              />
              <SessionHistory
                busy={busy}
                entries={history}
                error={historyError}
                loading={loadingHistory}
                session={selected}
                onRestore={onRestore}
              />
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function ScopedSessionsWorkspace({
  eventId,
  organizationId,
  api: providedApi,
}: Readonly<SessionsWorkspaceProps>) {
  const api = useMemo(
    () => providedApi ?? createSessionsApi("", organizationId, eventId),
    [eventId, organizationId, providedApi],
  );
  const [sessions, setSessions] = useState<readonly SessionRecord[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [history, setHistory] = useState<readonly SessionHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [speakers, setSpeakers] = useState<readonly SessionSpeakerCandidate[] | null>(null);
  const [loadingSpeakers, setLoadingSpeakers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [speakerError, setSpeakerError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const historyGeneration = useRef(0);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const next = await api.list(signal);
        if (signal?.aborted) return;
        setSessions(next);
        setSelectedSessionId((current) =>
          current !== null && next.some((session) => session.id === current)
            ? current
            : (next[0]?.id ?? null),
        );
      } catch (loadError) {
        if (!(loadError instanceof DOMException && loadError.name === "AbortError")) {
          setError(messageFrom(loadError));
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [api],
  );

  const loadSpeakers = useCallback(
    async (signal?: AbortSignal) => {
      setLoadingSpeakers(true);
      setSpeakerError(null);
      try {
        const next = await api.listSpeakers(signal);
        if (signal?.aborted) return;
        setSpeakers(next);
      } catch (loadError) {
        if (!(loadError instanceof DOMException && loadError.name === "AbortError")) {
          setSpeakerError(messageFrom(loadError));
        }
      } finally {
        if (!signal?.aborted) setLoadingSpeakers(false);
      }
    },
    [api],
  );

  const loadHistory = useCallback(
    async (sessionId: string, signal?: AbortSignal) => {
      const generation = historyGeneration.current + 1;
      historyGeneration.current = generation;
      setLoadingHistory(true);
      setHistoryError(null);
      try {
        const next = await api.listHistory(sessionId, signal);
        if (!signal?.aborted && generation === historyGeneration.current) setHistory(next);
      } catch (loadError) {
        if (
          !(loadError instanceof DOMException && loadError.name === "AbortError") &&
          generation === historyGeneration.current
        ) {
          setHistory([]);
          setHistoryError(messageFrom(loadError));
        }
      } finally {
        if (!signal?.aborted && generation === historyGeneration.current) {
          setLoadingHistory(false);
        }
      }
    },
    [api],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    void loadSpeakers(controller.signal);
    return () => controller.abort();
  }, [load, loadSpeakers]);

  useEffect(() => {
    if (selectedSessionId === null) {
      historyGeneration.current += 1;
      setHistory([]);
      setHistoryError(null);
      setLoadingHistory(false);
      return;
    }
    const controller = new AbortController();
    void loadHistory(selectedSessionId, controller.signal);
    return () => controller.abort();
  }, [loadHistory, selectedSessionId]);

  async function mutate(
    sessionId: string,
    request: () => Promise<SessionRecord>,
    successMessage: string,
  ): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const next = await request();
      setSessions((current) =>
        current.map((session) => (session.id === sessionId ? next : session)),
      );
      setSelectedSessionId(next.id);
      setStatusMessage(successMessage);
      void loadHistory(next.id);
    } catch (mutationError) {
      setError(messageFrom(mutationError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SessionsWorkspaceView
      busy={busy}
      error={error}
      eventId={eventId}
      history={history}
      historyError={historyError}
      loading={loading}
      loadingHistory={loadingHistory}
      loadingSpeakers={loadingSpeakers}
      organizationId={organizationId}
      selectedSessionId={selectedSessionId}
      sessions={sessions}
      speakerError={speakerError}
      speakers={speakers}
      statusMessage={statusMessage}
      onRestore={(input) =>
        mutate(
          input.sessionId,
          () => api.restoreVersion(input),
          `Session content restored from version ${input.version}.`,
        )
      }
      onRetry={() => void load()}
      onRetrySpeakers={() => void loadSpeakers()}
      onSave={(input) =>
        mutate(input.sessionId, () => api.updateContent(input), "Session content saved.")
      }
      onSaveSpeakers={(input) =>
        mutate(input.sessionId, () => api.updateSpeakers(input), "Speaker assignments saved.")
      }
      onSelectSession={(sessionId) => {
        historyGeneration.current += 1;
        setSelectedSessionId(sessionId);
      }}
      onSetContentStatus={(session, contentStatus) =>
        mutate(
          session.id,
          () =>
            api.updateContent({
              sessionId: session.id,
              expectedVersion: session.version,
              contentStatus,
            }),
          `Session content marked ${contentStatus}.`,
        )
      }
    />
  );
}

export function SessionsWorkspace(props: Readonly<SessionsWorkspaceProps>) {
  const eventId = useOrganizerEventId(props.eventId);
  return (
    <ScopedSessionsWorkspace
      key={`${props.organizationId}\u0000${eventId}`}
      {...props}
      eventId={eventId}
    />
  );
}
