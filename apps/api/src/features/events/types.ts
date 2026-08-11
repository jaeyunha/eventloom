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
  tracks: readonly string[];
  statuses: readonly string[];
}

export type EventEmbedConfigurationInput = EventEmbedConfiguration;

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
