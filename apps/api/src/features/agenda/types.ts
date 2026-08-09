export type AgendaConflictKind = "participant" | "resource" | "room";

export type AgendaWarningKind = "capacity" | "custom" | "track" | "travel";

export type AgendaOutboxEventType =
  | "calendar.agenda-updated"
  | "embed-cache.invalidate"
  | "public-agenda.updated";

export interface AgendaSession {
  id: string;
  title: string;
  status: "accepted";
  participantIds: readonly string[];
  resourceIds: readonly string[];
  capacityRequired: number;
}

export interface AgendaRoom {
  id: string;
  name: string;
  capacity: number;
}

export interface AgendaTrack {
  id: string;
  name: string;
}

export type TimeDisambiguation = "earlier" | "later";

export interface AgendaEntryInput {
  id: string;
  sessionId: string;
  roomId: string;
  trackIds: readonly string[];
  startsAtLocal: string;
  endsAtLocal: string;
  startDisambiguation?: TimeDisambiguation;
  endDisambiguation?: TimeDisambiguation;
}

export interface AgendaEntry {
  id: string;
  sessionId: string;
  roomId: string;
  trackIds: readonly string[];
  startsAt: string;
  endsAt: string;
  startsAtLocal: string;
  endsAtLocal: string;
  timeZone: string;
}

export interface AgendaConflict {
  id: string;
  kind: AgendaConflictKind;
  entryIds: readonly string[];
  message: string;
}

export interface AgendaWarning {
  id: string;
  kind: AgendaWarningKind;
  entryIds: readonly string[];
  message: string;
}

export interface AgendaValidationReport {
  conflicts: readonly AgendaConflict[];
  warnings: readonly AgendaWarning[];
}

export interface AgendaWarningOverride {
  warningId: string;
  reason: string;
  actorId: string;
  createdAt: string;
}

export interface AgendaDraft {
  eventId: string;
  version: number;
  timeZone: string;
  entries: readonly AgendaEntry[];
  warningOverrides: readonly AgendaWarningOverride[];
  updatedAt: string;
  updatedBy: string;
}

export interface PublishedAgendaRevision {
  id: string;
  eventId: string;
  revisionNumber: number;
  sourceDraftVersion: number;
  timeZone: string;
  entries: readonly AgendaEntry[];
  warningOverrides: readonly AgendaWarningOverride[];
  publishedAt: string;
  publishedBy: string;
  rollbackOfRevisionId: string | null;
}

export interface AgendaOutboxEvent {
  id: string;
  eventId: string;
  revisionId: string;
  type: AgendaOutboxEventType;
  idempotencyKey: string;
  createdAt: string;
}

export type AgendaAuditAction =
  | "agenda.created"
  | "agenda.published"
  | "agenda.rolled-back"
  | "catalog.updated"
  | "draft.updated"
  | "warning.overridden";

export interface AgendaAuditEntry {
  id: string;
  eventId: string;
  actorId: string;
  action: AgendaAuditAction;
  createdAt: string;
  details: Readonly<Record<string, string | number>>;
}

export interface AgendaState {
  eventId: string;
  stateVersion: number;
  timeZone: string;
  minimumTravelMinutes: number;
  sessions: readonly AgendaSession[];
  rooms: readonly AgendaRoom[];
  tracks: readonly AgendaTrack[];
  draft: AgendaDraft;
  revisions: readonly PublishedAgendaRevision[];
  currentPublishedRevisionId: string | null;
  outbox: readonly AgendaOutboxEvent[];
  audit: readonly AgendaAuditEntry[];
}

export interface AgendaCatalog {
  sessions: readonly AgendaSession[];
  rooms: readonly AgendaRoom[];
  tracks: readonly AgendaTrack[];
}

export interface AgendaRuleContext extends AgendaCatalog {
  entries: readonly AgendaEntry[];
}

export type AgendaCustomRule = (context: AgendaRuleContext) => readonly AgendaWarning[];

export interface AgendaPreview {
  draftVersion: number;
  validation: AgendaValidationReport;
  unoverriddenWarnings: readonly AgendaWarning[];
  diff: {
    addedEntryIds: readonly string[];
    removedEntryIds: readonly string[];
    changedEntryIds: readonly string[];
  };
}

export interface AgendaRepository {
  load(eventId: string): Promise<AgendaState | null>;
  compareAndSwap(
    eventId: string,
    expectedStateVersion: number | null,
    nextState: AgendaState,
  ): Promise<void>;
}

export interface AgendaMutationLock {
  runExclusive<T>(eventId: string, operation: () => Promise<T>): Promise<T>;
}

export interface AgendaClock {
  now(): Date;
}

export interface AgendaIdGenerator {
  nextId(prefix: "audit" | "outbox" | "revision"): string;
}
