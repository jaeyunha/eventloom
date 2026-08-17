"use client";

import { CalendarDays } from "lucide-react";
import Link from "next/link";
import {
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  StatusBadge,
  WorkspaceBreadcrumb,
  WorkspaceHeader,
  WorkspaceMetaItem,
  WorkspaceSurface,
} from "@/components/workspace/workspace-ui";
import { workspaceClassNames } from "@/components/workspace/workspace-ui-model";
import {
  useOrganizerEventId,
  useOrganizerEventWorkspace,
} from "@/features/admin/organizer-event-workspace";
import { useNavigationDataCache } from "@/lib/navigation-data-cache-provider";
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
import {
  loadSessionsWorkspaceBundle,
  type SessionsWorkspaceCacheBundle,
  sessionsWorkspaceCacheKey,
  sessionsWorkspaceCacheTags,
} from "./session-workspace-model";

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
function sessionsHistoryCacheKey(
  organizationId: string,
  eventId: string,
  sessionId: string,
  version: number,
): string {
  return `sessions:history:${organizationId.trim()}:${eventId.trim()}:${sessionId.trim()}:v${version}`;
}
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function abortedError(): DOMException {
  return new DOMException("The session request was aborted.", "AbortError");
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

function subscribeToSessionTimestamp(): () => void {
  return () => undefined;
}

function browserSessionTimestamp(value: string): string {
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toLocaleString() : value;
}

function SessionHistoryTimestamp({ value }: Readonly<{ value: string }>) {
  return useSyncExternalStore(
    subscribeToSessionTimestamp,
    () => browserSessionTimestamp(value),
    () => value,
  );
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

interface SessionEditorDraft {
  readonly ownerKey: string;
  readonly title?: string;
  readonly description?: string;
}

interface SpeakerAssignmentsDraft {
  readonly ownerKey: string;
  readonly speakerIds: readonly string[];
}

function SessionEditor({
  eventId,
  session,
  busy,
  onSave,
  onSetContentStatus,
}: Readonly<{
  eventId: string;
  session: SessionRecord;
  busy: boolean;
  onSave?: SessionsWorkspaceViewProps["onSave"];
  onSetContentStatus?: SessionsWorkspaceViewProps["onSetContentStatus"];
}>) {
  const ownerKey = `${eventId}\u0000${session.id}`;
  const [draft, setDraft] = useState<SessionEditorDraft | null>(null);
  const ownedDraft = draft?.ownerKey === ownerKey ? draft : null;
  const title = ownedDraft?.title ?? session.title;
  const description = ownedDraft?.description ?? session.description;
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
              onChange={(event) => {
                const value = event.currentTarget.value;
                setDraft((current) => {
                  const base = current?.ownerKey === ownerKey ? current : { ownerKey };
                  return { ...base, title: value };
                });
              }}
            />
          </label>
          <label className={styles.field} htmlFor={`session-description-${session.id}`}>
            Abstract
            <Textarea
              disabled={busy || onSave === undefined}
              id={`session-description-${session.id}`}
              rows={8}
              value={description}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setDraft((current) => {
                  const base = current?.ownerKey === ownerKey ? current : { ownerKey };
                  return { ...base, description: value };
                });
              }}
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
  eventId,
  organizationId,
  session,
  speakers,
  loading,
  error,
  busy,
  onSave,
  onRetry,
}: Readonly<{
  eventId: string;
  organizationId: string;
  session: SessionRecord;
  speakers: readonly SessionSpeakerCandidate[] | null;
  loading: boolean;
  error: string | null;
  busy: boolean;
  onSave?: SessionsWorkspaceViewProps["onSaveSpeakers"];
  onRetry?: SessionsWorkspaceViewProps["onRetrySpeakers"];
}>) {
  const ownerKey = `${eventId}\u0000${session.id}`;
  const currentReferences = assignmentReferences(session);
  const sessionSpeakerIds = new Set(session.speakerIds);
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
    ...(speakers ?? []).filter((speaker) => !sessionSpeakerIds.has(speaker.id)),
  ];
  const [draft, setDraft] = useState<SpeakerAssignmentsDraft | null>(null);
  const selectedIds = draft?.ownerKey === ownerKey ? draft.speakerIds : session.speakerIds;
  const selected = new Set(selectedIds);
  const changed =
    selectedIds.length !== session.speakerIds.length ||
    selectedIds.some((id) => !sessionSpeakerIds.has(id));

  function toggle(speakerId: string, checked: boolean) {
    setDraft((current) => {
      const base =
        current?.ownerKey === ownerKey ? current : { ownerKey, speakerIds: session.speakerIds };
      const speakerIds = checked
        ? base.speakerIds.includes(speakerId)
          ? base.speakerIds
          : [...base.speakerIds, speakerId]
        : base.speakerIds.filter((id) => id !== speakerId);
      return { ...base, speakerIds };
    });
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
        <Button asChild size="sm" variant="outline">
          <Link
            href={`/admin/organizations/${encodeURIComponent(
              organizationId,
            )}/events/${encodeURIComponent(eventId)}/speakers`}
          >
            Add or edit speakers
          </Link>
        </Button>
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
                    {entry.actorLabel ?? entry.actorId} -{" "}
                    <SessionHistoryTimestamp value={entry.occurredAt} />
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
  const event = useOrganizerEventWorkspace();
  const eventName = event?.id === eventId ? event.name : undefined;
  const selected = sessions.find((session) => session.id === selectedSessionId) ?? null;
  const empty = !loading && error === null && sessions.length === 0;

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
            {eventName === undefined ? null : (
              <WorkspaceMetaItem>Event {eventName}</WorkspaceMetaItem>
            )}
            <WorkspaceMetaItem>Organization {organizationId}</WorkspaceMetaItem>
          </>
        }
        title="Sessions"
      />

      <div className={styles.body}>
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

        {empty ? (
          <WorkspaceSurface className={styles.emptySurface}>
            <Empty
              aria-live="polite"
              className={styles.emptyState}
              data-sessions-state="empty"
              role="status"
            >
              <EmptyHeader className={styles.emptyHeader}>
                <EmptyMedia className={styles.emptyMedia} variant="icon">
                  <CalendarDays aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle aria-level={2} className={styles.emptyTitle} role="heading">
                  No sessions yet
                </EmptyTitle>
                <EmptyDescription className={styles.emptyDescription}>
                  {eventName === undefined
                    ? "This event does not have any sessions yet."
                    : `${eventName} does not have any sessions yet.`}{" "}
                  Add sessions to the event program first, then return here to manage public copy,
                  speakers, and version history.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </WorkspaceSurface>
        ) : (
          <div className={styles.contentGrid} data-sessions-layout="split">
            <WorkspaceSurface
              title="Session list"
              description="Choose a session to edit its canonical content and history."
            >
              {loading ? <p className={styles.muted}>Loading sessions...</p> : null}

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
                    eventId={eventId}
                    busy={busy}
                    key={`${eventId}\u0000${selected.id}`}
                    session={selected}
                    onSave={onSave}
                    onSetContentStatus={onSetContentStatus}
                  />
                  <SpeakerAssignments
                    eventId={eventId}
                    busy={busy}
                    error={speakerError}
                    key={`${eventId}\u0000${selected.id}`}
                    loading={loadingSpeakers}
                    organizationId={organizationId}
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
        )}
      </div>
    </main>
  );
}

function ScopedSessionsWorkspace({
  eventId,
  organizationId,
  api: providedApi,
}: Readonly<SessionsWorkspaceProps>) {
  const cache = useNavigationDataCache();
  const normalizedOrganizationId = organizationId.trim();
  const normalizedEventId = eventId.trim();
  const api = useMemo(
    () => providedApi ?? createSessionsApi("", normalizedOrganizationId, normalizedEventId),
    [normalizedEventId, normalizedOrganizationId, providedApi],
  );
  const workspaceCacheKey = useMemo(
    () => sessionsWorkspaceCacheKey(normalizedOrganizationId, normalizedEventId),
    [normalizedEventId, normalizedOrganizationId],
  );
  const workspaceCacheTags = useMemo(
    () => sessionsWorkspaceCacheTags(normalizedOrganizationId, normalizedEventId),
    [normalizedEventId, normalizedOrganizationId],
  );
  const workspaceInvalidationTags = useMemo(
    () => [`event:${normalizedEventId}`, `sessions:${normalizedEventId}`],
    [normalizedEventId],
  );
  const cachedBundle = cache?.peek<SessionsWorkspaceCacheBundle>(workspaceCacheKey);
  const initialSession = cachedBundle?.sessions[0];
  const initialHistoryKey =
    initialSession !== undefined &&
    initialSession.eventId.trim() === normalizedEventId &&
    initialSession.id.trim().length > 0 &&
    Number.isSafeInteger(initialSession.version) &&
    initialSession.version >= 1
      ? sessionsHistoryCacheKey(
          normalizedOrganizationId,
          normalizedEventId,
          initialSession.id,
          initialSession.version,
        )
      : null;
  const initialHistory =
    cache === null || initialHistoryKey === null
      ? undefined
      : cache.peek<readonly SessionHistoryEntry[]>(initialHistoryKey);
  const [sessions, setSessions] = useState<readonly SessionRecord[]>(
    () => cachedBundle?.sessions ?? [],
  );
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    () => initialSession?.id ?? null,
  );
  const [history, setHistory] = useState<readonly SessionHistoryEntry[]>(
    () => initialHistory ?? [],
  );
  const [loading, setLoading] = useState(cachedBundle === undefined);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [speakers, setSpeakers] = useState<readonly SessionSpeakerCandidate[] | null>(
    () => cachedBundle?.speakers ?? null,
  );
  const [loadingSpeakers, setLoadingSpeakers] = useState(cachedBundle === undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [speakerError, setSpeakerError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const loadGeneration = useRef(0);
  const historyGeneration = useRef(0);

  const load = useCallback(
    async (signal?: AbortSignal, fresh = false) => {
      const generation = loadGeneration.current + 1;
      loadGeneration.current = generation;
      const isCurrent = () => generation === loadGeneration.current && !signal?.aborted;
      setLoading(true);
      setLoadingSpeakers(true);
      setError(null);
      setSpeakerError(null);
      try {
        const next = await loadSessionsWorkspaceBundle(
          api,
          cache,
          workspaceCacheKey,
          workspaceCacheTags,
          signal,
          fresh,
        );
        if (!isCurrent()) return;
        setSessions(next.sessions);
        setSelectedSessionId((current) =>
          current !== null && next.sessions.some((session) => session.id === current)
            ? current
            : (next.sessions[0]?.id ?? null),
        );
        setSpeakers(next.speakers);
      } catch (loadError) {
        if (isCurrent() && !isAbortError(loadError)) {
          const message = messageFrom(loadError);
          setError(message);
          setSpeakerError(message);
        }
      } finally {
        setLoading((current) =>
          generation === loadGeneration.current && !signal?.aborted ? false : current,
        );
        setLoadingSpeakers((current) =>
          generation === loadGeneration.current && !signal?.aborted ? false : current,
        );
      }
    },
    [api, cache, workspaceCacheKey, workspaceCacheTags],
  );

  const loadHistory = useCallback(
    async (session: SessionRecord, signal?: AbortSignal, fresh = false) => {
      const generation = historyGeneration.current + 1;
      historyGeneration.current = generation;
      const isCurrent = () => generation === historyGeneration.current && !signal?.aborted;
      const safeHistoryKey =
        session.eventId.trim() === normalizedEventId &&
        session.id.trim().length > 0 &&
        Number.isSafeInteger(session.version) &&
        session.version >= 1
          ? sessionsHistoryCacheKey(
              normalizedOrganizationId,
              normalizedEventId,
              session.id,
              session.version,
            )
          : null;
      const load = async (): Promise<readonly SessionHistoryEntry[]> => {
        const next = await api.listHistory(session.id, signal);
        if (signal?.aborted) throw abortedError();
        return next;
      };
      setLoadingHistory(true);
      setHistoryError(null);
      try {
        if (cache !== null && safeHistoryKey !== null && !fresh) {
          const cached = cache.peek<readonly SessionHistoryEntry[]>(safeHistoryKey);
          if (cached !== undefined) {
            if (isCurrent()) {
              setHistory(cached);
            }
            return;
          }
        }
        const next =
          cache !== null && safeHistoryKey !== null
            ? await cache.read({
                key: safeHistoryKey,
                tags: workspaceCacheTags,
                load,
                fresh,
              })
            : await load();
        if (isCurrent()) setHistory(next);
      } catch (loadError) {
        if (isCurrent() && !isAbortError(loadError)) {
          setHistory([]);
          setHistoryError(messageFrom(loadError));
        }
      } finally {
        setLoadingHistory((current) =>
          generation === historyGeneration.current ? false : current,
        );
      }
    },
    [api, cache, normalizedEventId, normalizedOrganizationId, workspaceCacheTags],
  );

  useEffect(() => {
    if (cache?.peek<SessionsWorkspaceCacheBundle>(workspaceCacheKey) !== undefined) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [cache, load, workspaceCacheKey]);

  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? null;

  useEffect(() => {
    if (selectedSession === null) {
      const generation = historyGeneration.current + 1;
      historyGeneration.current = generation;
      try {
        setHistory([]);
        setHistoryError(null);
      } finally {
        setLoadingHistory((current) =>
          historyGeneration.current === generation ? false : current,
        );
      }
      return;
    }
    const controller = new AbortController();
    void loadHistory(selectedSession, controller.signal);
    return () => controller.abort();
  }, [loadHistory, selectedSession]);

  async function mutate(
    sessionId: string,
    request: () => Promise<SessionRecord>,
    successMessage: string,
  ): Promise<void> {
    if (busy) return;
    loadGeneration.current += 1;
    historyGeneration.current += 1;
    cache?.invalidate(workspaceInvalidationTags);
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      const next = await request();
      const nextSessions = sessions.map((session) => (session.id === sessionId ? next : session));
      setSessions(nextSessions);
      setSelectedSessionId(next.id);
      if (cache !== null && speakers !== null) {
        cache.write(workspaceCacheKey, { sessions: nextSessions, speakers }, workspaceCacheTags);
      }
      setStatusMessage(successMessage);
      void loadHistory(next, undefined, true);
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
      onRetry={() => {
        cache?.invalidate(workspaceInvalidationTags);
        void load(undefined, true);
      }}
      onRetrySpeakers={() => {
        cache?.invalidate(workspaceInvalidationTags);
        void load(undefined, true);
      }}
      onSave={(input) =>
        mutate(input.sessionId, () => api.updateContent(input), "Session content saved.")
      }
      onSaveSpeakers={(input) =>
        mutate(input.sessionId, () => api.updateSpeakers(input), "Speaker assignments saved.")
      }
      onSelectSession={(sessionId) => {
        if (sessionId !== selectedSessionId) historyGeneration.current += 1;
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
      key={`${props.organizationId.trim()}\u0000${eventId.trim()}`}
      {...props}
      eventId={eventId}
    />
  );
}
