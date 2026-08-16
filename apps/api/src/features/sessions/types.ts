import type { AgendaCatalog } from "../agenda/types";

export const defaultSessionStatuses = [
  "Draft",
  "Submitted",
  "Accepted",
  "Waitlisted",
  "Rejected",
  "Withdrawn",
] as const;

export const defaultAgendaEligibleStatuses = ["Accepted"] as const;

export type SessionStatus = string;
export type SessionOrganizationRole = "owner" | "admin" | "organizer";
export type SessionResourceType =
  | "session"
  | "room"
  | "track"
  | "format"
  | "level"
  | "tag"
  | "settings";
export const sessionContentStatuses = ["Approved", "Needs changes"] as const;
export type SessionContentStatus = (typeof sessionContentStatuses)[number];
export type SessionMutationAction =
  | "created"
  | "updated"
  | "deleted"
  | "restored"
  | "approved"
  | "needs_changes"
  | "settings.updated";
export interface SessionContentSnapshot {
  id: string;
  tenantId: string;
  eventId: string;
  title: string;
  description: string;
  status: SessionStatus;
  contentStatus?: SessionContentStatus;
  durationMinutes: number;
  capacityRequired: number;
  roomId?: string;
  trackId?: string;
  trackIds: readonly string[];
  formatId?: string;
  levelId?: string;
  tagIds: readonly string[];
  speakerIds: readonly string[];
  speakerRoster: readonly SessionSpeakerReference[];
  resourceIds: readonly string[];
}

export interface PublishedSessionContent {
  readonly id: string;
  readonly title: string;
  readonly abstract: string;
  readonly contentStatus: "Approved";
  readonly durationMinutes: number;
  readonly capacityRequired: number;
  readonly roomId?: string;
  readonly trackIds: readonly string[];
  readonly formatId?: string;
  readonly speakerIds: readonly string[];
  readonly speakerNames: readonly string[];
  readonly resourceIds: readonly string[];
  readonly version: number;
  readonly updatedAt: string;
}

export interface PublishedSessionContentHandoff {
  readonly tenantId: string;
  readonly eventId: string;
  readonly sessions: readonly PublishedSessionContent[];
}
export type SessionSortField =
  | "title"
  | "status"
  | "durationMinutes"
  | "createdAt"
  | "updatedAt"
  | "roomId"
  | "trackId";
export type SessionSortDirection = "asc" | "desc";

/** The minimum actor shape accepted by the domain service. */
export interface SessionActor {
  tenantId: string;
  userId: string;
  role?: SessionOrganizationRole;
  roles?: readonly SessionOrganizationRole[];
  /** Set by trusted automation only; automation cannot mutate organizer settings. */
  kind?: "human" | "user" | "automation";
  isOrganizer?: boolean;
  grants?: readonly {
    eventId: string;
    role: SessionOrganizationRole;
  }[];
}

export interface SessionHistoryEntry {
  id: string;
  action: SessionMutationAction;
  version: number;
  actorId: string;
  occurredAt: string;
  actorLabel?: string;
  title?: string;
  description?: string;
  contentStatus?: SessionContentStatus;
  priorStatus?: SessionStatus;
  newStatus?: SessionStatus;
  priorContentStatus?: SessionContentStatus;
  newContentStatus?: SessionContentStatus;
  snapshot?: SessionContentSnapshot;
}

export interface SessionAuditEntry {
  id: string;
  tenantId: string;
  eventId: string;
  entityType: SessionResourceType;
  entityId: string;
  action: SessionMutationAction;
  version: number;
  actorId: string;
  occurredAt: string;
  before?: unknown;
  after?: unknown;
}

export interface SessionSpeakerReference {
  id: string;
  displayName?: string;
  role?: string;
}

export interface Session {
  id: string;
  tenantId: string;
  eventId: string;
  title: string;
  description: string;
  status: SessionStatus;
  contentStatus?: SessionContentStatus;
  durationMinutes: number;
  capacityRequired: number;
  roomId?: string;
  trackId?: string;
  trackIds: readonly string[];
  formatId?: string;
  levelId?: string;
  tagIds: readonly string[];
  speakerIds: readonly string[];
  speakerRoster: readonly SessionSpeakerReference[];
  resourceIds: readonly string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  history: readonly SessionHistoryEntry[];
}

export interface Room {
  id: string;
  tenantId: string;
  eventId: string;
  name: string;
  capacity: number;
  resources: readonly string[];
  /** Alias used by agenda adapters when room resources are represented as ids. */
  resourceIds?: readonly string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  history: readonly SessionHistoryEntry[];
}

export interface Track {
  id: string;
  tenantId: string;
  eventId: string;
  name: string;
  description: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  history: readonly SessionHistoryEntry[];
}

export interface Format {
  id: string;
  tenantId: string;
  eventId: string;
  name: string;
  description: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  history: readonly SessionHistoryEntry[];
}

export interface Level {
  id: string;
  tenantId: string;
  eventId: string;
  name: string;
  description: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  history: readonly SessionHistoryEntry[];
}

export interface Tag {
  id: string;
  tenantId: string;
  eventId: string;
  name: string;
  description: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  history: readonly SessionHistoryEntry[];
}

export interface SessionSettings {
  id: string;
  tenantId: string;
  eventId: string;
  statuses: readonly string[];
  agendaEligibleStatuses: readonly string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  history: readonly SessionHistoryEntry[];
}

export interface CreateSessionInput {
  tenantId?: string;
  eventId: string;
  id?: string;
  title: string;
  description?: string;
  status?: SessionStatus;
  durationMinutes: number;
  capacityRequired?: number;
  roomId?: string | null;
  trackId?: string | null;
  trackIds?: readonly string[];
  formatId?: string | null;
  levelId?: string | null;
  tagIds?: readonly string[];
  speakerIds?: readonly string[];
  speakerRoster?: readonly SessionSpeakerReference[];
  resourceIds?: readonly string[];
}

export interface UpdateSessionInput {
  tenantId?: string;
  eventId: string;
  sessionId: string;
  expectedVersion: number;
  title?: string;
  description?: string;
  status?: SessionStatus;
  contentStatus?: SessionContentStatus;
  durationMinutes?: number;
  capacityRequired?: number;
  roomId?: string | null;
  trackId?: string | null;
  trackIds?: readonly string[];
  formatId?: string | null;
  levelId?: string | null;
  tagIds?: readonly string[];
  speakerIds?: readonly string[];
  speakerRoster?: readonly SessionSpeakerReference[];
  resourceIds?: readonly string[];
}
export interface RestoreSessionInput {
  tenantId?: string;
  eventId: string;
  sessionId: string;
  version: number;
  expectedVersion: number;
}

export interface CreateRoomInput {
  tenantId?: string;
  eventId: string;
  id?: string;
  name: string;
  capacity: number;
  resources?: readonly string[];
  resourceIds?: readonly string[];
}

export interface UpdateRoomInput {
  tenantId?: string;
  eventId: string;
  roomId: string;
  expectedVersion: number;
  name?: string;
  capacity?: number;
  resources?: readonly string[];
  resourceIds?: readonly string[];
}

export interface CreateTaxonomyInput {
  tenantId?: string;
  eventId: string;
  id?: string;
  name: string;
  description?: string;
}

export interface UpdateTaxonomyInput {
  tenantId?: string;
  eventId: string;
  resourceId: string;
  expectedVersion: number;
  name?: string;
  description?: string;
}

export interface UpdateSessionSettingsInput {
  tenantId?: string;
  eventId: string;
  expectedVersion: number;
  statuses?: readonly string[];
  agendaEligibleStatuses?: readonly string[];
}

export interface SessionListQuery {
  status?: string;
  statuses?: readonly string[];
  roomId?: string;
  trackId?: string;
  formatId?: string;
  levelId?: string;
  tagId?: string;
  speakerId?: string;
  search?: string;
  agendaEligible?: boolean;
  sortBy?: SessionSortField;
  sort?: SessionSortField;
  direction?: SessionSortDirection;
  limit?: number;
  offset?: number;
}

export interface SessionListPage {
  items: readonly Session[];
  total: number;
  limit: number;
  offset: number;
}

export type SessionRepositoryCommand =
  | {
      operation: "putSession";
      value: Session;
      expectedVersion: number | null;
      audit: SessionAuditEntry;
    }
  | {
      operation: "deleteSession";
      tenantId: string;
      eventId: string;
      id: string;
      expectedVersion: number;
      audit: SessionAuditEntry;
    }
  | { operation: "putRoom"; value: Room; expectedVersion: number | null; audit: SessionAuditEntry }
  | {
      operation: "deleteRoom";
      tenantId: string;
      eventId: string;
      id: string;
      expectedVersion: number;
      audit: SessionAuditEntry;
    }
  | {
      operation: "putTrack";
      value: Track;
      expectedVersion: number | null;
      audit: SessionAuditEntry;
    }
  | {
      operation: "deleteTrack";
      tenantId: string;
      eventId: string;
      id: string;
      expectedVersion: number;
      audit: SessionAuditEntry;
    }
  | {
      operation: "putFormat";
      value: Format;
      expectedVersion: number | null;
      audit: SessionAuditEntry;
    }
  | {
      operation: "deleteFormat";
      tenantId: string;
      eventId: string;
      id: string;
      expectedVersion: number;
      audit: SessionAuditEntry;
    }
  | {
      operation: "putLevel";
      value: Level;
      expectedVersion: number | null;
      audit: SessionAuditEntry;
    }
  | {
      operation: "deleteLevel";
      tenantId: string;
      eventId: string;
      id: string;
      expectedVersion: number;
      audit: SessionAuditEntry;
    }
  | { operation: "putTag"; value: Tag; expectedVersion: number | null; audit: SessionAuditEntry }
  | {
      operation: "deleteTag";
      tenantId: string;
      eventId: string;
      id: string;
      expectedVersion: number;
      audit: SessionAuditEntry;
    }
  | {
      operation: "putSettings";
      value: SessionSettings;
      expectedVersion: number | null;
      audit: SessionAuditEntry;
    };

export interface SessionRepository {
  /** Optional atomic domain + audit + sync-job command used by transactional providers. */
  commit?(command: SessionRepositoryCommand): Promise<void>;
  getSession(tenantId: string, eventId: string, sessionId: string): Promise<Session | null>;
  listSessions(tenantId: string, eventId: string): Promise<readonly Session[]>;
  putSession(session: Session, expectedVersion: number | null): Promise<void>;
  deleteSession(
    tenantId: string,
    eventId: string,
    sessionId: string,
    expectedVersion: number,
  ): Promise<void>;

  getRoom(tenantId: string, eventId: string, roomId: string): Promise<Room | null>;
  listRooms(tenantId: string, eventId: string): Promise<readonly Room[]>;
  putRoom(room: Room, expectedVersion: number | null): Promise<void>;
  deleteRoom(
    tenantId: string,
    eventId: string,
    roomId: string,
    expectedVersion: number,
  ): Promise<void>;

  getTrack(tenantId: string, eventId: string, trackId: string): Promise<Track | null>;
  listTracks(tenantId: string, eventId: string): Promise<readonly Track[]>;
  putTrack(track: Track, expectedVersion: number | null): Promise<void>;
  deleteTrack(
    tenantId: string,
    eventId: string,
    trackId: string,
    expectedVersion: number,
  ): Promise<void>;

  getFormat(tenantId: string, eventId: string, formatId: string): Promise<Format | null>;
  listFormats(tenantId: string, eventId: string): Promise<readonly Format[]>;
  putFormat(format: Format, expectedVersion: number | null): Promise<void>;
  deleteFormat(
    tenantId: string,
    eventId: string,
    formatId: string,
    expectedVersion: number,
  ): Promise<void>;

  getLevel(tenantId: string, eventId: string, levelId: string): Promise<Level | null>;
  listLevels(tenantId: string, eventId: string): Promise<readonly Level[]>;
  putLevel(level: Level, expectedVersion: number | null): Promise<void>;
  deleteLevel(
    tenantId: string,
    eventId: string,
    levelId: string,
    expectedVersion: number,
  ): Promise<void>;

  getTag(tenantId: string, eventId: string, tagId: string): Promise<Tag | null>;
  listTags(tenantId: string, eventId: string): Promise<readonly Tag[]>;
  putTag(tag: Tag, expectedVersion: number | null): Promise<void>;
  deleteTag(
    tenantId: string,
    eventId: string,
    tagId: string,
    expectedVersion: number,
  ): Promise<void>;

  getSettings(tenantId: string, eventId: string): Promise<SessionSettings | null>;
  putSettings(settings: SessionSettings, expectedVersion: number | null): Promise<void>;

  appendAudit(entry: SessionAuditEntry): Promise<void>;
  listAudit(
    tenantId: string,
    eventId: string,
    entityId?: string,
  ): Promise<readonly SessionAuditEntry[]>;

  /** Optional reference authority supplied by the speaker/participant domain. */
  listSpeakerIds?(tenantId: string, eventId: string): Promise<readonly string[] | undefined>;
}

export interface SessionRepositorySeed {
  sessions?: readonly Session[];
  rooms?: readonly Room[];
  tracks?: readonly Track[];
  formats?: readonly Format[];
  levels?: readonly Level[];
  tags?: readonly Tag[];
  settings?: readonly SessionSettings[];
  audit?: readonly SessionAuditEntry[];
  speakerIds?: Readonly<Record<string, readonly string[]>>;
}

export interface PublishedSessionContentReader {
  /** Approval-gated, tenant/event-scoped source for agenda and deliverables consumers. */
  getPublishedSessionContent(
    tenantId: string,
    eventId: string,
  ): Promise<PublishedSessionContentHandoff>;
}
export interface AgendaCatalogReader {
  /** Organization-qualified, read-only catalog contract consumed by agenda scheduling. */
  getAgendaCatalog(tenantId: string, eventId: string): Promise<AgendaCatalog>;
}

export type SessionAgendaCatalog = AgendaCatalog;

export class SessionRepositoryConflictError extends Error {
  constructor(message = "The session resource changed concurrently.") {
    super(message);
    this.name = "SessionRepositoryConflictError";
  }
}
