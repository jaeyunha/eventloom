import type { TimeDisambiguation } from "@eventloom/contracts";

export type AgendaConflictKind = "participant" | "resource" | "room";
export type AgendaWarningKind = "capacity" | "custom" | "track" | "travel";

export interface AgendaEventSummary {
  id: string;
  name: string;
  timeZone: string;
  startsAt?: string;
  endsAt?: string;
  startsOn: string;
  endsOn: string;
  scheduleDates?: readonly string[];
}

export interface AgendaRoom {
  id: string;
  name: string;
  capacity: number;
}

export interface AgendaTrack {
  id: string;
  name: string;
  color: string;
}

export interface AgendaSession {
  id: string;
  title: string;
  format: string;
  durationMinutes: number;
  speakerNames: readonly string[];
  capacityRequired: number;
  trackIds: readonly string[];
  trackNames: readonly string[];
}

export interface AgendaEntry {
  id: string;
  sessionId: string;
  title: string;
  format: string;
  speakerNames: readonly string[];
  roomId: string;
  roomName: string;
  trackIds: readonly string[];
  trackNames: readonly string[];
  startsAtLocal: string;
  endsAtLocal: string;
  startDisambiguation?: TimeDisambiguation;
  endDisambiguation?: TimeDisambiguation;
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
  overridden: boolean;
  overrideReason?: string;
}
export interface AgendaValidationReport {
  conflicts: readonly AgendaConflict[];
  warnings: readonly AgendaWarning[];
}
export interface AgendaCandidateDiagnostics {
  evaluated: boolean;
  report: AgendaValidationReport | null;
}

export type AgendaCalendarConnectionState = "connected" | "degraded" | "not_configured";

export interface AgendaCalendarDeliveryState {
  state: AgendaCalendarConnectionState;
  sentLast24Hours: number;
  failedLast24Hours: number;
  lastInvitationAt: string | null;
  lastFailure: {
    deliveryId: string;
    summary: string;
    occurredAt: string;
    retryable: boolean;
  } | null;
}

export interface AgendaPreview {
  draftVersion: number;
  conflicts: readonly AgendaConflict[];
  releaseConflicts: readonly AgendaConflict[];
  warnings: readonly AgendaWarning[];
  diff: {
    added: number;
    changed: number;
    removed: number;
  };
  validatedAt: string;
}
export interface AgendaPlacementFailureData extends AgendaCandidateDiagnostics {
  authoritativeSavedPreview: AgendaPreview;
}

export interface AgendaRevision {
  id: string;
  number: number;
  publishedAt: string;
  publishedBy: string;
  sessionCount: number;
  current: boolean;
}

export interface AgendaWorkspaceData {
  event: AgendaEventSummary;
  draft: {
    version: number;
    updatedAt: string;
    updatedBy: string;
    entries: readonly AgendaEntry[];
  };
  validation: {
    draftVersion: number;
    validatedAt: string;
  } | null;
  rooms: readonly AgendaRoom[];
  tracks: readonly AgendaTrack[];
  acceptedSessionIds: readonly string[];
  unscheduledSessions: readonly AgendaSession[];
  revisions: readonly AgendaRevision[];
  currentPublishedRevision: AgendaRevision | null;
}

export interface AgendaEntryInput {
  id?: string;
  sessionId: string;
  roomId: string;
  trackIds: readonly string[];
  startsAtLocal: string;
  endsAtLocal: string;
  startDisambiguation?: TimeDisambiguation;
  endDisambiguation?: TimeDisambiguation;
}

export interface AgendaErrorResponse {
  error?: {
    code?: string;
    message?: string;
    traceId?: string;
    details?: {
      conflicts?: readonly AgendaConflict[];
      warnings?: readonly AgendaWarning[];
    };
  };
  data?: {
    candidateDiagnostics?: {
      evaluated?: boolean;
      report?: AgendaValidationReport | null;
    };
    authoritativeSavedPreview?: AgendaPreview;
  };
}
