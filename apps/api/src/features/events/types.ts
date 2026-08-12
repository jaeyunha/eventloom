export const eventStatuses = ["draft", "active", "archived"] as const;

export type EventStatus = (typeof eventStatuses)[number];
export type EventOrganizationRole = "owner" | "admin" | "reviewer" | "speaker";

/** The minimum actor shape accepted by the event domain service. */
export interface EventActor {
  organizationId: string;
  userId: string;
  role?: EventOrganizationRole;
  roles?: readonly EventOrganizationRole[];
  kind?: "user" | "human" | "automation";
}

export interface EventCfpSettings {
  enabled: boolean;
  opensAt: string | null;
  closesAt: string | null;
}

export interface EventDefaultCalendarSettings {
  durationMinutes: number;
  timeZone: string;
  location: string | null;
}

export const eventEmbedWidgetIds = [
  "sessions",
  "speakers",
  "agenda",
  "itinerary",
  "gallery",
] as const;
export type EventEmbedWidgetId = (typeof eventEmbedWidgetIds)[number];

export const eventEmbedThemes = ["auto", "light", "dark"] as const;
export type EventEmbedTheme = (typeof eventEmbedThemes)[number];

export const eventEmbedOutputFormats = [
  "styled-html",
  "basic-html",
  "json",
  "xml",
  "ical",
] as const;
export type EventEmbedOutputFormat = (typeof eventEmbedOutputFormats)[number];

export const eventEmbedLayouts = ["comfortable", "compact", "list", "grid", "timeline"] as const;
export type EventEmbedLayout = (typeof eventEmbedLayouts)[number];

export const eventEmbedDisplayFields = [
  "title",
  "date-time",
  "room",
  "speakers",
  "format",
  "track",
  "summary",
  "company",
  "bio",
] as const;
export type EventEmbedDisplayField = (typeof eventEmbedDisplayFields)[number];

export interface EventEmbedConfiguration {
  id: string;
  name: string;
  widgetId: EventEmbedWidgetId;
  enabled: boolean;
  theme: EventEmbedTheme;
  outputFormat: EventEmbedOutputFormat;
  layout: EventEmbedLayout;
  accent: string;
  backgroundColor: string;
  textColor: string;
  customCss: string;
  displayFields: readonly EventEmbedDisplayField[];
  trackIds: readonly string[];
  statuses: readonly string[];
  revision: number;
}

export type EventEmbedConfigurationInput = Omit<EventEmbedConfiguration, "revision"> & {
  revision?: number;
};

export interface Event {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  status: EventStatus;
  timeZone: string;
  startsAt: string;
  endsAt: string;
  venue: string | null;
  cfpSettings: EventCfpSettings;
  defaultCalendarSettings: EventDefaultCalendarSettings;
  embedConfigurations: readonly EventEmbedConfiguration[];
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export type EventMutationAction = "created" | "updated" | "archived";

export interface EventAuditEntry {
  id: string;
  organizationId: string;
  eventId: string;
  action: EventMutationAction;
  version: number;
  actorId: string;
  occurredAt: string;
  before?: Event;
  after?: Event;
}

export interface EventCfpSettingsInput {
  enabled?: boolean;
  opensAt?: string | null;
  closesAt?: string | null;
}

export interface EventDefaultCalendarSettingsInput {
  durationMinutes?: number;
  timeZone?: string;
  location?: string | null;
}

export interface CreateEventInput {
  organizationId?: string;
  id?: string;
  slug?: string;
  name: string;
  status?: EventStatus;
  timeZone: string;
  startsAt: string;
  endsAt: string;
  venue?: string | null;
  cfpSettings?: EventCfpSettingsInput;
  defaultCalendarSettings?: EventDefaultCalendarSettingsInput;
  embedConfigurations?: readonly EventEmbedConfigurationInput[];
}

export interface UpdateEventInput {
  organizationId?: string;
  eventId: string;
  expectedVersion: number;
  slug?: string;
  name?: string;
  status?: EventStatus;
  timeZone?: string;
  startsAt?: string;
  endsAt?: string;
  venue?: string | null;
  cfpSettings?: EventCfpSettingsInput;
  defaultCalendarSettings?: EventDefaultCalendarSettingsInput;
  embedConfigurations?: readonly EventEmbedConfigurationInput[];
}

export interface ArchiveEventInput {
  organizationId?: string;
  eventId: string;
  expectedVersion: number;
}

export interface ListEventsInput {
  organizationId?: string;
  status?: EventStatus;
  includeArchived?: boolean;
}

export interface EventRepository {
  getEvent(organizationId: string, eventId: string): Promise<Event | null>;
  listEvents(organizationId: string): Promise<readonly Event[]>;
  findEventBySlug(organizationId: string, slug: string): Promise<Event | null>;
  saveEvent(event: Event, expectedVersion: number | null): Promise<void>;
  appendAudit(entry: EventAuditEntry): Promise<void>;
  listAudit(organizationId: string, eventId: string): Promise<readonly EventAuditEntry[]>;
}

export interface EventRepositorySeed {
  events?: readonly Event[];
  audit?: readonly EventAuditEntry[];
}

export class EventRepositoryConflictError extends Error {
  constructor(message = "The event changed concurrently.") {
    super(message);
    this.name = "EventRepositoryConflictError";
  }
}
export const programPublicationStatuses = ["pending", "served", "failed"] as const;
export type ProgramPublicationStatus = (typeof programPublicationStatuses)[number];

/**
 * Only source changes which have crossed the public approval boundary may trigger
 * an automatic rebuild. Draft and private source changes are intentionally not
 * represented by this union.
 */
export const programPublicationSourceTriggers = [
  "initial-publication",
  "approved-content-change",
  "confirmed-profile-change",
  "released-asset-change",
  "released-schedule-change",
] as const;
export type ProgramPublicationSourceTrigger =
  (typeof programPublicationSourceTriggers)[number];

export interface ProgramProjectionBinding {
  projectionId: string;
  revisionNumber: number;
  sourceHash: string;
}

export interface ProgramPublicationManifest {
  id: string;
  organizationId: string;
  eventId: string;
  revision: number;
  lifecycle: ProgramPublicationStatus;
  agendaProjectionId: string;
  agendaRevisionNumber: number;
  agendaSourceHash: string;
  speakerProjectionId: string;
  speakerRevisionNumber: number;
  speakerSourceHash: string;
  approvedContentRevision: number;
  approvedProfileRevision: number;
  releasedAssetRevision: number;
  actorId: string;
  publishedAt: string;
  parentServedRevision: number | null;
  rollbackTargetRevision: number | null;
  cacheRevision: number;
  sourceTrigger: ProgramPublicationSourceTrigger;
  failureReason: string | null;
}

export type ProgramReleaseRecord = ProgramPublicationManifest;

export interface ProgramPublicationState {
  organizationId: string;
  eventId: string;
  version: number;
  servedRevision: number | null;
  servedManifest: ProgramPublicationManifest | null;
  pendingRevision: number | null;
  pendingReleaseId: string | null;
  releases: readonly ProgramReleaseRecord[];
}

export interface ProgramPublicationRepositorySeed {
  states?: readonly ProgramPublicationState[];
}

export class ProgramPublicationRepositoryConflictError extends Error {
  constructor(message = "The program publication changed concurrently.") {
    super(message);
    this.name = "ProgramPublicationRepositoryConflictError";
  }
}

export interface ProgramPublicationRepository {
  getState(organizationId: string, eventId: string): Promise<ProgramPublicationState | null>;
  compareAndSwap(
    organizationId: string,
    eventId: string,
    expectedVersion: number | null,
    state: ProgramPublicationState,
  ): Promise<void>;
}

export interface ProgramPublicationRebuildRequest {
  organizationId?: string;
  eventId: string;
  trigger: ProgramPublicationSourceTrigger;
  agendaProjectionId: string;
  agendaRevisionNumber: number;
  agendaSourceHash: string;
  speakerProjectionId: string;
  speakerRevisionNumber: number;
  speakerSourceHash: string;
  approvedContentRevision: number;
  approvedProfileRevision: number;
  releasedAssetRevision: number;
  parentServedRevision?: number | null;
}

export interface ProgramPublicationCompletionInput {
  organizationId: string;
  eventId: string;
  releaseId: string;
  revision: number;
  expectedPublicationVersion: number;
}
export interface ProgramPublicationFailureInput extends ProgramPublicationCompletionInput {
  reason: string;
}


export interface ProgramPublicationRollbackInput {
  organizationId?: string;
  eventId: string;
  targetRevision: number;
  expectedServedRevision: number | null;
  expectedPublicationVersion?: number;
}

export interface ProgramPublicationEnqueueInput {
  organizationId: string;
  eventId: string;
  releaseId: string;
  revision: number;
}

export interface ProgramPublicationEnqueueReceipt {
  id: string;
}

export interface ProgramPublicationEnqueuePort {
  enqueue(input: ProgramPublicationEnqueueInput): Promise<ProgramPublicationEnqueueReceipt>;
}

export interface ProgramPublicationCacheInvalidationInput {
  organizationId: string;
  eventId: string;
  revision: number;
  cacheRevision: number;
}

export interface ProgramPublicationCacheInvalidationPort {
  invalidate(input: ProgramPublicationCacheInvalidationInput): Promise<void>;
}

export interface ProgramPublicationServiceDependencies {
  enqueue: ProgramPublicationEnqueuePort;
  cacheInvalidation: ProgramPublicationCacheInvalidationPort;
  eventRepository: Pick<EventRepository, "getEvent">;
}
export interface ProgramPublicationServiceOptions {
  clock?: () => Date;
  generateId?: () => string;
}

export interface ProgramAgendaProjectionEntry {
  id: string;
  sessionId: string;
  trackIds: readonly string[];
  status: string;
  title: string;
  summary?: string;
  format?: string;
  startsAt?: string;
  endsAt?: string;
  startsAtLocal?: string;
  endsAtLocal?: string;
  timeZone?: string;
  roomName?: string;
  trackNames?: readonly string[];
  speakerNames?: readonly string[];
}

export interface ProgramAgendaProjection {
  id: string;
  revisionNumber: number;
  sourceHash: string;
  entries: readonly ProgramAgendaProjectionEntry[];
}

export interface ProgramSpeakerProjectionRecord {
  id: string;
  participantId: string;
  sessionIds: readonly string[];
  displayName: string;
  title?: string;
  company?: string;
  bio?: string;
  avatarUrl?: string | null;
}

export interface ProgramSpeakerProjection {
  id: string;
  revisionNumber: number;
  sourceHash: string;
  speakers: readonly ProgramSpeakerProjectionRecord[];
}

export interface ProgramResolvedAgendaEntry {
  id: string;
  sessionId: string;
  title: string;
  summary?: string;
  format?: string;
  startsAt?: string;
  endsAt?: string;
  startsAtLocal?: string;
  endsAtLocal?: string;
  timeZone?: string;
  roomName?: string;
  trackNames: readonly string[];
  speakerNames: readonly string[];
}

export interface ProgramResolvedSpeaker {
  id: string;
  participantId: string;
  sessionIds: readonly string[];
  displayName: string;
  title?: string;
  company?: string;
  bio?: string;
  avatarUrl?: string | null;
}

export interface ProgramResolvedPublication {
  configurationRevision: number;
  servedProgramRevision: number;
  cacheRevision: number;
  programRevision: number;
  agenda: readonly ProgramResolvedAgendaEntry[];
  speakers: readonly ProgramResolvedSpeaker[];
}

export interface ResolveProgramPublicationInput {
  manifest: ProgramPublicationManifest;
  agendaProjection: ProgramAgendaProjection;
  speakerProjection: ProgramSpeakerProjection;
  configuration: EventEmbedConfiguration;
}
export interface ProgramPublicationPreviewRequest extends ResolveProgramPublicationInput {
  organizationId?: string;
  eventId: string;
}
