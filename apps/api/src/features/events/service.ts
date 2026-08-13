import { canonicalizeTimeZone } from "../agenda/timezone";
import {
  type ArchiveEventInput,
  type CreateEventInput,
  type Event,
  type EventActor,
  type EventAuditEntry,
  type EventCfpSettings,
  type EventCfpSettingsInput,
  type EventDefaultCalendarSettings,
  type EventDefaultCalendarSettingsInput,
  type EventEmbedConfiguration,
  type EventEmbedConfigurationInput,
  type EventEmbedDisplayField,
  type EventOrganizationRole,
  type EventRepository,
  EventRepositoryConflictError,
  type EventRepositorySeed,
  type EventStatus,
  eventEmbedDisplayFields,
  eventEmbedLayouts,
  eventEmbedOutputFormats,
  eventEmbedThemes,
  eventEmbedWidgetIds,
  eventStatuses,
  type ListEventsInput,
  type UpdateEventInput,
  type ProgramAgendaProjection,
  type ProgramPublicationCacheInvalidationPort,
  type ProgramPublicationCompletionInput,
  type ProgramPublicationFailureInput,
  type ProgramPublicationEnqueuePort,
  type ProgramPublicationRebuildRequest,
  type ProgramPublicationRepository,
  ProgramPublicationRepositoryConflictError,
  type ProgramPublicationRepositorySeed,
  type ProgramPublicationRollbackInput,
  type ProgramPublicationServiceDependencies,
  type ProgramPublicationServiceOptions,
  type ProgramPublicationState,
  type ProgramPublicationManifest,
  type ProgramResolvedPublication,
  type ProgramSpeakerProjection,
  type ResolveProgramPublicationInput,
  type ProgramPublicationPreviewRequest,
  programPublicationSourceTriggers,
} from "./types";

export type EventServiceErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "VERSION_CONFLICT"
  | "CONFLICT";

export class EventServiceError extends Error {
  readonly code: EventServiceErrorCode;
  readonly status: 400 | 403 | 404 | 409;
  readonly details?: unknown;

  constructor(
    code: EventServiceErrorCode,
    status: 400 | 403 | 404 | 409,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "EventServiceError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export interface EventServiceOptions {
  clock?: () => Date;
  generateId?: () => string;
}

const DEFAULT_CFP_SETTINGS: EventCfpSettings = {
  enabled: false,
  opensAt: null,
  closesAt: null,
};

const DEFAULT_CALENDAR_DURATION_MINUTES = 30;

const CREATE_EVENT_FIELDS = [
  "organizationId",
  "id",
  "slug",
  "name",
  "status",
  "timeZone",
  "startsAt",
  "endsAt",
  "venue",
  "cfpSettings",
  "defaultCalendarSettings",
  "embedConfigurations",
] as const;
const UPDATE_EVENT_FIELDS = [
  "organizationId",
  "eventId",
  "expectedVersion",
  "slug",
  "name",
  "status",
  "timeZone",
  "startsAt",
  "endsAt",
  "venue",
  "cfpSettings",
  "defaultCalendarSettings",
  "embedConfigurations",
] as const;
const ARCHIVE_EVENT_FIELDS = ["organizationId", "eventId", "expectedVersion"] as const;
const LIST_EVENT_FIELDS = ["organizationId", "status", "includeArchived"] as const;
const AUDIT_EVENT_FIELDS = ["organizationId", "eventId"] as const;
const CFP_SETTINGS_FIELDS = ["enabled", "opensAt", "closesAt"] as const;
const CALENDAR_SETTINGS_FIELDS = ["durationMinutes", "timeZone", "location"] as const;
const EMBED_CONFIGURATION_FIELDS = [
  "id",
  "name",
  "widgetId",
  "enabled",
  "theme",
  "outputFormat",
  "layout",
  "accent",
  "backgroundColor",
  "textColor",
  "customCss",
  "displayFields",
  "trackIds",
  "statuses",
  "revision",
] as const;
const MAX_EMBED_CONFIGURATIONS = 100;
const MAX_EMBED_LIST_ITEMS = 100;
const MAX_EMBED_CUSTOM_CSS_LENGTH = 20_000;

type ObjectValue = Record<string, unknown>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function validation(message: string, details?: unknown): EventServiceError {
  return new EventServiceError("VALIDATION_ERROR", 400, message, details);
}

function notFound(): EventServiceError {
  return new EventServiceError("NOT_FOUND", 404, "The event was not found.");
}

function forbidden(message = "An owner or administrator is required."): EventServiceError {
  return new EventServiceError("FORBIDDEN", 403, message);
}

function conflict(message: string): EventServiceError {
  return new EventServiceError("CONFLICT", 409, message);
}

function versionConflict(): EventServiceError {
  return new EventServiceError(
    "VERSION_CONFLICT",
    409,
    "The event changed. Reload it before saving.",
  );
}

function objectValue(value: unknown, field: string): ObjectValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw validation(`${field} must be an object.`);
  }
  return value as ObjectValue;
}

function assertFields(value: ObjectValue, field: string, allowed: readonly string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw validation(`${field}.${key} is not supported.`);
    }
  }
}

function text(value: unknown, field: string, maximum = 200): string {
  if (typeof value !== "string") {
    throw validation(`${field} must be a string.`);
  }
  const result = value.trim();
  if (result.length === 0 || result.length > maximum) {
    throw validation(`${field} must contain between 1 and ${maximum} characters.`);
  }
  return result;
}

function optionalText(value: unknown, field: string, maximum = 2_000): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw validation(`${field} must be a string or null.`);
  const result = value.trim();
  if (result.length > maximum) {
    throw validation(`${field} must contain at most ${maximum} characters.`);
  }
  return result.length === 0 ? null : result;
}

function eventId(value: unknown): string {
  return text(value, "event id", 128);
}

function slug(value: unknown): string {
  const result = text(value, "slug", 80).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result)) {
    throw validation("slug must contain lowercase letters, numbers, and single hyphens.");
  }
  return result;
}

function generatedSlug(name: string): string {
  const result = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return result.length > 0 ? result : "event";
}

function status(value: unknown, field = "status"): EventStatus {
  if (typeof value !== "string" || !eventStatuses.includes(value as EventStatus)) {
    throw validation(`${field} must be one of: ${eventStatuses.join(", ")}.`);
  }
  return value as EventStatus;
}
function embedEnum<T extends string>(value: unknown, values: readonly T[], field: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw validation(`${field} must be one of: ${values.join(", ")}.`);
  }
  return value as T;
}

function embedColor(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value.trim())) {
    throw validation(`${field} must be a six-digit hexadecimal color in #RRGGBB format.`);
  }
  return value.trim().toLowerCase();
}

function embedCustomCss(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length > MAX_EMBED_CUSTOM_CSS_LENGTH) {
    throw validation(
      `${field} must be a string of at most ${MAX_EMBED_CUSTOM_CSS_LENGTH} characters.`,
    );
  }
  return value;
}

function embedStringList(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value)) throw validation(`${field} must be an array.`);
  if (value.length > MAX_EMBED_LIST_ITEMS) {
    throw validation(`${field} must contain at most ${MAX_EMBED_LIST_ITEMS} entries.`);
  }
  const normalized: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    normalized.push(text(value[index], `${field}[${index}]`, 128));
  }
  return [...new Set(normalized)];
}

function embedDisplayFields(value: unknown, field: string): readonly EventEmbedDisplayField[] {
  const values = embedStringList(value, field);
  if (values.length > eventEmbedDisplayFields.length) {
    throw validation(`${field} must contain at most ${eventEmbedDisplayFields.length} entries.`);
  }
  const normalized = values.map((item, index) =>
    embedEnum(item, eventEmbedDisplayFields, `${field}[${index}]`),
  );
  const required: readonly EventEmbedDisplayField[] = eventEmbedDisplayFields.filter(
    (item) => item === "title" || item === "date-time",
  );
  return [...required, ...normalized.filter((item) => !required.includes(item))];
}

function embedConfigurationRevision(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw validation(`${field} must be a positive integer.`);
  }
  return value;
}

function embedConfigurationSemanticallyEqual(
  left: EventEmbedConfiguration,
  right: EventEmbedConfiguration,
): boolean {
  return (
    JSON.stringify({
      id: left.id,
      name: left.name,
      widgetId: left.widgetId,
      enabled: left.enabled,
      theme: left.theme,
      outputFormat: left.outputFormat,
      layout: left.layout,
      accent: left.accent,
      backgroundColor: left.backgroundColor,
      textColor: left.textColor,
      customCss: left.customCss,
      displayFields: left.displayFields,
      trackIds: left.trackIds,
      statuses: left.statuses,
    }) ===
    JSON.stringify({
      id: right.id,
      name: right.name,
      widgetId: right.widgetId,
      enabled: right.enabled,
      theme: right.theme,
      outputFormat: right.outputFormat,
      layout: right.layout,
      accent: right.accent,
      backgroundColor: right.backgroundColor,
      textColor: right.textColor,
      customCss: right.customCss,
      displayFields: right.displayFields,
      trackIds: right.trackIds,
      statuses: right.statuses,
    })
  );
}
function normalizeEmbedConfigurations(
  input: readonly EventEmbedConfigurationInput[] | undefined,
  current: readonly EventEmbedConfiguration[] = [],
): readonly EventEmbedConfiguration[] {
  if (input === undefined) return clone(current);
  if (!Array.isArray(input)) throw validation("embedConfigurations must be an array.");
  if (input.length > MAX_EMBED_CONFIGURATIONS) {
    throw validation(
      `embedConfigurations must contain at most ${MAX_EMBED_CONFIGURATIONS} entries.`,
    );
  }
  const ids = new Set<string>();
  const currentById = new Map(current.map((configuration) => [configuration.id, configuration]));
  for (let index = 0; index < input.length; index += 1) {
    const field = `embedConfigurations[${index}]`;
    const value = objectValue(input[index], field);
    const id = text(value.id, `${field}.id`, 128);
    if (ids.has(id)) throw validation("embedConfigurations ids must be unique.");
    ids.add(id);
  }
  for (const configuration of current) {
    if (!ids.has(configuration.id)) {
      throw validation(
        `Saved embed configuration ${configuration.id} cannot be removed; disable it instead.`,
      );
    }
  }
  ids.clear();
  const normalized: EventEmbedConfiguration[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const field = `embedConfigurations[${index}]`;
    const value = objectValue(input[index], field);
    assertFields(value, field, EMBED_CONFIGURATION_FIELDS);
    const id = text(value.id, `${field}.id`, 128);
    if (ids.has(id)) throw validation("embedConfigurations ids must be unique.");
    ids.add(id);
    const name = text(value.name, `${field}.name`, 200);
    const enabled = value.enabled;
    if (typeof enabled !== "boolean") throw validation(`${field}.enabled must be a boolean.`);
    const customCss = embedCustomCss(value.customCss, `${field}.customCss`);
    const trackIds = embedStringList(value.trackIds, `${field}.trackIds`);
    const statuses = embedStringList(value.statuses, `${field}.statuses`);
    const currentConfiguration = currentById.get(id);
    const suppliedRevision =
      value.revision === undefined
        ? undefined
        : embedConfigurationRevision(value.revision, `${field}.revision`);
    if (
      currentConfiguration === undefined &&
      suppliedRevision !== undefined &&
      suppliedRevision !== 1
    ) {
      throw validation(`${field}.revision must start at 1.`);
    }
    if (
      currentConfiguration !== undefined &&
      suppliedRevision !== undefined &&
      suppliedRevision !== currentConfiguration.revision
    ) {
      throw conflict(`Saved embed configuration ${id} changed. Reload it before saving.`);
    }
    const candidate: EventEmbedConfiguration = {
      id,
      name,
      widgetId: embedEnum(value.widgetId, eventEmbedWidgetIds, `${field}.widgetId`),
      enabled,
      theme: embedEnum(value.theme, eventEmbedThemes, `${field}.theme`),
      outputFormat: embedEnum(value.outputFormat, eventEmbedOutputFormats, `${field}.outputFormat`),
      layout: embedEnum(value.layout, eventEmbedLayouts, `${field}.layout`),
      accent: embedColor(value.accent, `${field}.accent`),
      backgroundColor: embedColor(value.backgroundColor, `${field}.backgroundColor`),
      textColor: embedColor(value.textColor, `${field}.textColor`),
      customCss,
      displayFields: embedDisplayFields(value.displayFields, `${field}.displayFields`),
      trackIds,
      statuses,
      revision: 1,
    };
    if (currentConfiguration === undefined) {
      normalized.push(candidate);
      continue;
    }
    const currentRevision = embedConfigurationRevision(
      currentConfiguration.revision,
      `${field}.revision`,
    );
    candidate.revision = embedConfigurationSemanticallyEqual(candidate, currentConfiguration)
      ? currentRevision
      : currentRevision + 1;
    normalized.push(candidate);
  }
  return normalized;
}

function version(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw validation("expectedVersion must be a positive integer.");
  }
  return value;
}

function instant(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw validation(`${field} must be an ISO instant.`);
  }
  const candidate = value.trim();
  if (!/T/.test(candidate) || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(candidate)) {
    throw validation(`${field} must be an ISO instant with a UTC offset.`);
  }
  const parsed = Date.parse(candidate);
  if (!Number.isFinite(parsed)) throw validation(`${field} must be an ISO instant.`);
  return new Date(parsed).toISOString();
}

function timeZone(value: unknown, field = "timeZone"): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw validation(`${field} must be a valid IANA time zone.`);
  }
  try {
    return canonicalizeTimeZone(value.trim());
  } catch {
    throw validation(`${field} must be a valid IANA time zone.`);
  }
}

function dateOrdering(startsAt: string, endsAt: string): void {
  if (Date.parse(startsAt) >= Date.parse(endsAt)) {
    throw validation("startsAt must be before endsAt.");
  }
}

function repositoryConflict(error: unknown): boolean {
  return (
    error instanceof EventRepositoryConflictError ||
    (error instanceof Error && error.name === "EventRepositoryConflictError")
  );
}

function actorOrganizationId(actor: EventActor): string {
  if (typeof actor.organizationId !== "string" || actor.organizationId.trim().length === 0) {
    throw forbidden("An organization-scoped organizer identity is required.");
  }
  return actor.organizationId.trim();
}

function actorUserId(actor: EventActor): string {
  if (typeof actor.userId !== "string" || actor.userId.trim().length === 0) {
    throw forbidden("An authenticated organizer identity is required.");
  }
  return actor.userId.trim();
}

function assertOrganizer(actor: EventActor, organizationId: string): void {
  if (actor.kind === "automation") throw forbidden();
  if (actorOrganizationId(actor) !== organizationId) {
    throw forbidden("The authenticated organizer cannot access this organization.");
  }
  const roles = new Set<EventOrganizationRole>();
  if (actor.role !== undefined) roles.add(actor.role);
  if (actor.roles !== undefined) {
    if (!Array.isArray(actor.roles)) throw forbidden();
    for (const role of actor.roles) roles.add(role);
  }
  if (!roles.has("owner") && !roles.has("admin")) throw forbidden();
  actorUserId(actor);
}

function organizationFromInput(actor: EventActor, requested: string | undefined): string {
  const organizationId = actorOrganizationId(actor);
  assertOrganizer(actor, organizationId);
  if (requested !== undefined && text(requested, "organization id", 128) !== organizationId) {
    throw forbidden("The authenticated organizer cannot access this organization.");
  }
  return organizationId;
}

function normalizeCfpSettings(
  input: EventCfpSettingsInput | undefined,
  current: EventCfpSettings = DEFAULT_CFP_SETTINGS,
): EventCfpSettings {
  const value = objectValue(input ?? {}, "cfpSettings");
  assertFields(value, "cfpSettings", CFP_SETTINGS_FIELDS);
  const enabled = value.enabled === undefined ? current.enabled : value.enabled;
  if (typeof enabled !== "boolean") throw validation("cfpSettings.enabled must be a boolean.");
  const opensAt =
    value.opensAt === undefined
      ? current.opensAt
      : value.opensAt === null
        ? null
        : instant(value.opensAt, "cfpSettings.opensAt");
  const closesAt =
    value.closesAt === undefined
      ? current.closesAt
      : value.closesAt === null
        ? null
        : instant(value.closesAt, "cfpSettings.closesAt");
  if (opensAt !== null && closesAt !== null && Date.parse(opensAt) >= Date.parse(closesAt)) {
    throw validation("cfpSettings.opensAt must be before cfpSettings.closesAt.");
  }
  return { enabled, opensAt, closesAt };
}

function normalizeCalendarSettings(
  input: EventDefaultCalendarSettingsInput | undefined,
  current: EventDefaultCalendarSettings,
  eventTimeZone: string,
  venue: string | null,
): EventDefaultCalendarSettings {
  const value = objectValue(input ?? {}, "defaultCalendarSettings");
  assertFields(value, "defaultCalendarSettings", CALENDAR_SETTINGS_FIELDS);
  const durationMinutes =
    value.durationMinutes === undefined ? current.durationMinutes : value.durationMinutes;
  if (
    typeof durationMinutes !== "number" ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 1 ||
    durationMinutes > 1_440
  ) {
    throw validation("defaultCalendarSettings.durationMinutes must be an integer from 1 to 1440.");
  }
  const calendarTimeZone =
    value.timeZone === undefined
      ? current.timeZone
      : timeZone(value.timeZone, "defaultCalendarSettings.timeZone");
  const location =
    value.location === undefined
      ? current.location
      : optionalText(value.location, "defaultCalendarSettings.location");
  return {
    durationMinutes,
    timeZone: timeZone(calendarTimeZone || eventTimeZone, "defaultCalendarSettings.timeZone"),
    location: location ?? venue,
  };
}

function eventInputOrganization(input: { organizationId?: string }): string | undefined {
  return input.organizationId;
}

export class EventService {
  readonly #repository: EventRepository;
  readonly #clock: () => Date;
  readonly #generateId: () => string;

  constructor(repository: EventRepository, options: EventServiceOptions = {}) {
    this.#repository = repository;
    this.#clock = options.clock ?? (() => new Date());
    this.#generateId = options.generateId ?? (() => crypto.randomUUID());
  }

  async listEvents(actor: EventActor, input: ListEventsInput = {}): Promise<readonly Event[]> {
    const inputValue = objectValue(input, "event list");
    assertFields(inputValue, "event list", LIST_EVENT_FIELDS);
    const organizationId = organizationFromInput(actor, eventInputOrganization(input));
    const filter = input.status === undefined ? undefined : status(input.status);
    const includeArchived = input.includeArchived !== false;
    const events = await this.#repository.listEvents(organizationId);
    return events
      .filter((event) => event.organizationId === organizationId)
      .filter((event) => includeArchived || event.status !== "archived")
      .filter((event) => filter === undefined || event.status === filter)
      .sort((left, right) => {
        const updated = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
        return updated !== 0 ? updated : left.id.localeCompare(right.id);
      })
      .map(clone);
  }

  async createEvent(actor: EventActor, input: CreateEventInput): Promise<Event> {
    const inputValue = objectValue(input, "event");
    assertFields(inputValue, "event", CREATE_EVENT_FIELDS);
    const organizationId = organizationFromInput(actor, eventInputOrganization(input));
    const userId = actorUserId(actor);
    const name = text(input.name, "name", 200);
    const eventSlug = slug(input.slug === undefined ? generatedSlug(name) : input.slug);
    const startsAt = instant(input.startsAt, "startsAt");
    const endsAt = instant(input.endsAt, "endsAt");
    dateOrdering(startsAt, endsAt);
    const eventTimeZone = timeZone(input.timeZone, "timeZone");
    const eventStatus = input.status === undefined ? "draft" : status(input.status);
    const id =
      input.id === undefined ? text(this.#generateId(), "event id", 128) : eventId(input.id);
    const venue = optionalText(input.venue, "venue");
    const cfpSettings = normalizeCfpSettings(input.cfpSettings);
    const defaultCalendarSettings = normalizeCalendarSettings(
      input.defaultCalendarSettings,
      {
        durationMinutes: DEFAULT_CALENDAR_DURATION_MINUTES,
        timeZone: eventTimeZone,
        location: venue,
      },
      eventTimeZone,
      venue,
    );
    const embedConfigurations = normalizeEmbedConfigurations(input.embedConfigurations);
    const now = this.instant(this.#clock(), "clock");
    const event: Event = {
      id,
      organizationId,
      slug: eventSlug,
      name,
      status: eventStatus,
      timeZone: eventTimeZone,
      startsAt,
      endsAt,
      venue,
      cfpSettings,
      defaultCalendarSettings,
      embedConfigurations,
      version: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      updatedBy: userId,
    };
    const existingSlug = await this.#repository.findEventBySlug(organizationId, eventSlug);
    if (existingSlug !== null) throw conflict("An event with this slug already exists.");
    try {
      await this.#repository.saveEvent(event, null);
    } catch (error) {
      if (repositoryConflict(error)) throw conflict("An event with this id already exists.");
      throw error;
    }
    await this.#repository.appendAudit({
      id: this.#auditId(),
      organizationId,
      eventId: event.id,
      action: "created",
      version: event.version,
      actorId: userId,
      occurredAt: now,
      after: clone(event),
    });
    return clone(event);
  }

  async getEvent(
    actor: EventActor,
    input: { organizationId?: string; eventId: string },
  ): Promise<Event> {
    const inputValue = objectValue(input, "event");
    assertFields(inputValue, "event", ["organizationId", "eventId"]);
    const organizationId = organizationFromInput(actor, eventInputOrganization(input));
    const event = await this.#repository.getEvent(organizationId, eventId(input.eventId));
    if (event === null || event.organizationId !== organizationId) throw notFound();
    return clone(event);
  }

  async updateEvent(actor: EventActor, input: UpdateEventInput): Promise<Event> {
    const inputValue = objectValue(input, "event");
    assertFields(inputValue, "event", UPDATE_EVENT_FIELDS);
    const expectedVersion = version(input.expectedVersion);
    const organizationId = organizationFromInput(actor, eventInputOrganization(input));
    const userId = actorUserId(actor);
    const current = await this.#repository.getEvent(organizationId, eventId(input.eventId));
    if (current === null || current.organizationId !== organizationId) throw notFound();
    if (current.version !== expectedVersion) throw versionConflict();

    const nextSlug = input.slug === undefined ? current.slug : slug(input.slug);
    if (nextSlug !== current.slug) {
      const existingSlug = await this.#repository.findEventBySlug(organizationId, nextSlug);
      if (existingSlug !== null && existingSlug.id !== current.id) {
        throw conflict("An event with this slug already exists.");
      }
    }
    const nextName = input.name === undefined ? current.name : text(input.name, "name", 200);
    const nextTimeZone =
      input.timeZone === undefined ? current.timeZone : timeZone(input.timeZone, "timeZone");
    const nextStartsAt =
      input.startsAt === undefined ? current.startsAt : instant(input.startsAt, "startsAt");
    const nextEndsAt =
      input.endsAt === undefined ? current.endsAt : instant(input.endsAt, "endsAt");
    dateOrdering(nextStartsAt, nextEndsAt);
    const nextVenue =
      input.venue === undefined ? current.venue : optionalText(input.venue, "venue");
    const nextStatus = input.status === undefined ? current.status : status(input.status);
    const cfpSettings = normalizeCfpSettings(input.cfpSettings, current.cfpSettings);
    const defaultCalendarSettings = normalizeCalendarSettings(
      input.defaultCalendarSettings,
      current.defaultCalendarSettings,
      nextTimeZone,
      nextVenue,
    );
    const embedConfigurations = normalizeEmbedConfigurations(
      input.embedConfigurations,
      current.embedConfigurations ?? [],
    );
    const now = this.instant(this.#clock(), "clock");
    const updated: Event = {
      ...current,
      slug: nextSlug,
      name: nextName,
      status: nextStatus,
      timeZone: nextTimeZone,
      startsAt: nextStartsAt,
      endsAt: nextEndsAt,
      venue: nextVenue,
      cfpSettings,
      defaultCalendarSettings,
      embedConfigurations,
      version: current.version + 1,
      updatedAt: now,
      updatedBy: userId,
    };
    try {
      await this.#repository.saveEvent(updated, expectedVersion);
    } catch (error) {
      if (repositoryConflict(error)) throw versionConflict();
      throw error;
    }
    await this.#repository.appendAudit({
      id: this.#auditId(),
      organizationId,
      eventId: updated.id,
      action:
        updated.status === "archived" && current.status !== "archived" ? "archived" : "updated",
      version: updated.version,
      actorId: userId,
      occurredAt: now,
      before: clone(current),
      after: clone(updated),
    });
    return clone(updated);
  }

  async archiveEvent(actor: EventActor, input: ArchiveEventInput): Promise<Event> {
    const inputValue = objectValue(input, "event");
    assertFields(inputValue, "event", ARCHIVE_EVENT_FIELDS);
    const expectedVersion = version(input.expectedVersion);
    const organizationId = organizationFromInput(actor, eventInputOrganization(input));
    const userId = actorUserId(actor);
    const current = await this.#repository.getEvent(organizationId, eventId(input.eventId));
    if (current === null || current.organizationId !== organizationId) throw notFound();
    if (current.version !== expectedVersion) throw versionConflict();
    const now = this.instant(this.#clock(), "clock");
    const archived: Event = {
      ...current,
      status: "archived",
      version: current.version + 1,
      updatedAt: now,
      updatedBy: userId,
    };
    try {
      await this.#repository.saveEvent(archived, expectedVersion);
    } catch (error) {
      if (repositoryConflict(error)) throw versionConflict();
      throw error;
    }
    await this.#repository.appendAudit({
      id: this.#auditId(),
      organizationId,
      eventId: archived.id,
      action: "archived",
      version: archived.version,
      actorId: userId,
      occurredAt: now,
      before: clone(current),
      after: clone(archived),
    });
    return clone(archived);
  }

  async listAudit(
    actor: EventActor,
    input: { organizationId?: string; eventId: string },
  ): Promise<readonly EventAuditEntry[]> {
    const inputValue = objectValue(input, "event audit");
    assertFields(inputValue, "event audit", AUDIT_EVENT_FIELDS);
    const organizationId = organizationFromInput(actor, eventInputOrganization(input));
    const entries = await this.#repository.listAudit(organizationId, eventId(input.eventId));
    return entries.filter((entry) => entry.organizationId === organizationId).map(clone);
  }

  #auditId(): string {
    return text(this.#generateId(), "audit id", 128);
  }

  private instant(value: Date | string, field: string): string {
    if (value instanceof Date) {
      if (!Number.isFinite(value.getTime())) throw validation(`${field} must be an ISO instant.`);
      return value.toISOString();
    }
    return instant(value, field);
  }
}

export class InMemoryEventRepository implements EventRepository {
  readonly #events = new Map<string, Event>();
  readonly #audit = new Map<string, EventAuditEntry[]>();

  constructor(seed: EventRepositorySeed = {}) {
    for (const event of seed.events ?? []) {
      this.#events.set(this.key(event.organizationId, event.id), clone(event));
    }
    for (const entry of seed.audit ?? []) {
      const key = this.auditKey(entry.organizationId, entry.eventId);
      const entries = this.#audit.get(key) ?? [];
      entries.push(clone(entry));
      this.#audit.set(key, entries);
    }
  }

  async getEvent(organizationId: string, eventIdValue: string): Promise<Event | null> {
    const event = this.#events.get(this.key(organizationId, eventIdValue));
    return event === undefined ? null : clone(event);
  }

  async listEvents(organizationId: string): Promise<readonly Event[]> {
    return [...this.#events.values()]
      .filter((event) => event.organizationId === organizationId)
      .map(clone);
  }

  async findEventBySlug(organizationId: string, eventSlug: string): Promise<Event | null> {
    const normalized = eventSlug.toLowerCase();
    const event = [...this.#events.values()].find(
      (candidate) =>
        candidate.organizationId === organizationId && candidate.slug.toLowerCase() === normalized,
    );
    return event === undefined ? null : clone(event);
  }

  async saveEvent(event: Event, expectedVersion: number | null): Promise<void> {
    const key = this.key(event.organizationId, event.id);
    const current = this.#events.get(key);
    if (expectedVersion === null) {
      if (current !== undefined) {
        throw new EventRepositoryConflictError("An event with this id already exists.");
      }
    } else if (current === undefined || current.version !== expectedVersion) {
      throw new EventRepositoryConflictError();
    }
    this.#events.set(key, clone(event));
  }

  async appendAudit(entry: EventAuditEntry): Promise<void> {
    const key = this.auditKey(entry.organizationId, entry.eventId);
    const entries = this.#audit.get(key) ?? [];
    entries.push(clone(entry));
    this.#audit.set(key, entries);
  }

  async listAudit(
    organizationId: string,
    eventIdValue: string,
  ): Promise<readonly EventAuditEntry[]> {
    return (this.#audit.get(this.auditKey(organizationId, eventIdValue)) ?? []).map(clone);
  }

  private key(organizationId: string, eventIdValue: string): string {
    return `${organizationId}\u0000${eventIdValue}`;
  }

  private auditKey(organizationId: string, eventIdValue: string): string {
    return `${organizationId}\u0000${eventIdValue}`;
  }
}

export class InMemoryProgramPublicationRepository implements ProgramPublicationRepository {
  readonly #states = new Map<string, ProgramPublicationState>();

  constructor(seed: ProgramPublicationRepositorySeed = {}) {
    for (const state of seed.states ?? []) {
      this.#states.set(this.key(state.organizationId, state.eventId), clone(state));
    }
  }

  async getState(
    organizationId: string,
    eventIdValue: string,
  ): Promise<ProgramPublicationState | null> {
    const state = this.#states.get(this.key(organizationId, eventIdValue));
    return state === undefined ? null : clone(state);
  }

  async compareAndSwap(
    organizationId: string,
    eventIdValue: string,
    expectedVersion: number | null,
    state: ProgramPublicationState,
  ): Promise<void> {
    const key = this.key(organizationId, eventIdValue);
    const current = this.#states.get(key);
    if (
      (current?.version ?? null) !== expectedVersion ||
      state.organizationId !== organizationId ||
      state.eventId !== eventIdValue
    ) {
      throw new ProgramPublicationRepositoryConflictError();
    }
    this.#states.set(key, clone(state));
  }

  private key(organizationId: string, eventIdValue: string): string {
    return `${organizationId}\u0000${eventIdValue}`;
  }
}

function publicationVersionConflict(): EventServiceError {
  return new EventServiceError(
    "VERSION_CONFLICT",
    409,
    "The program publication changed. Reload it before continuing.",
  );
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw validation(`${field} must be a positive integer.`);
  }
  return value;
}

function sourceHash(value: unknown, field: string): string {
  return text(value, field, 256);
}

function releaseForCompletion(
  state: ProgramPublicationState,
  input: ProgramPublicationCompletionInput,
): ProgramPublicationManifest {
  if (
    state.version !==
    positiveInteger(input.expectedPublicationVersion, "expectedPublicationVersion")
  ) {
    throw publicationVersionConflict();
  }
  const revision = positiveInteger(input.revision, "revision");
  const release = state.releases.find(
    (candidate) => candidate.id === input.releaseId && candidate.revision === revision,
  );
  if (
    release === undefined ||
    release.lifecycle !== "pending" ||
    state.pendingReleaseId !== release.id ||
    state.pendingRevision !== release.revision
  ) {
    throw conflict("The pending program release is no longer current.");
  }
  return release;
}

export class ProgramPublicationService {
  readonly #repository: ProgramPublicationRepository;
  readonly #enqueue: ProgramPublicationEnqueuePort;
  readonly #cacheInvalidation: ProgramPublicationCacheInvalidationPort;
  readonly #eventRepository: Pick<EventRepository, "getEvent">;
  readonly #clock: () => Date;
  readonly #generateId: () => string;

  constructor(
    repository: ProgramPublicationRepository,
    dependencies: ProgramPublicationServiceDependencies,
    options: ProgramPublicationServiceOptions = {},
  ) {
    this.#repository = repository;
    this.#enqueue = dependencies.enqueue;
    this.#cacheInvalidation = dependencies.cacheInvalidation;
    this.#eventRepository = dependencies.eventRepository;
    this.#clock = options.clock ?? (() => new Date());
    this.#generateId = options.generateId ?? (() => crypto.randomUUID());
  }

  async getState(
    actor: EventActor,
    input: { organizationId?: string; eventId: string },
  ): Promise<ProgramPublicationState | null> {
    const organizationId = organizationFromInput(actor, input.organizationId);
    const scopedEventId = eventId(input.eventId);
    await this.#requireEvent(organizationId, scopedEventId);
    return this.#repository.getState(organizationId, scopedEventId);
  }

  async requestRebuild(
    actor: EventActor,
    input: ProgramPublicationRebuildRequest,
  ): Promise<ProgramPublicationState> {
    const organizationId = organizationFromInput(actor, input.organizationId);
    const scopedEventId = eventId(input.eventId);
    const actorId = actorUserId(actor);
    await this.#requireEvent(organizationId, scopedEventId);
    if (!programPublicationSourceTriggers.includes(input.trigger)) {
      throw validation("trigger is not an approved program publication source transition.");
    }

    const current = await this.#repository.getState(organizationId, scopedEventId);
    if (current?.pendingRevision !== null && current?.pendingRevision !== undefined) {
      throw conflict("A program publication rebuild is already pending.");
    }
    if (
      input.trigger === "initial-publication" &&
      current?.servedManifest !== null &&
      current !== null
    ) {
      throw conflict("The program already has publication intent.");
    }
    if (
      input.trigger !== "initial-publication" &&
      (current === null || current.servedManifest === null)
    ) {
      throw conflict(
        "Approved source changes cannot publish a program before explicit publication.",
      );
    }
    if (
      input.parentServedRevision !== undefined &&
      input.parentServedRevision !== (current?.servedRevision ?? null)
    ) {
      throw publicationVersionConflict();
    }

    const revision = (current?.releases.at(-1)?.revision ?? 0) + 1;
    const releaseId = text(this.#generateId(), "release id", 128);
    const now = instant(this.#clock().toISOString(), "publishedAt");
    const manifest: ProgramPublicationManifest = {
      id: releaseId,
      organizationId,
      eventId: scopedEventId,
      revision,
      lifecycle: "pending",
      agendaProjectionId: text(input.agendaProjectionId, "agendaProjectionId", 128),
      agendaRevisionNumber: positiveInteger(input.agendaRevisionNumber, "agendaRevisionNumber"),
      agendaSourceHash: sourceHash(input.agendaSourceHash, "agendaSourceHash"),
      speakerProjectionId: text(input.speakerProjectionId, "speakerProjectionId", 128),
      speakerRevisionNumber: positiveInteger(input.speakerRevisionNumber, "speakerRevisionNumber"),
      speakerSourceHash: sourceHash(input.speakerSourceHash, "speakerSourceHash"),
      approvedContentRevision: positiveInteger(
        input.approvedContentRevision,
        "approvedContentRevision",
      ),
      approvedProfileRevision: positiveInteger(
        input.approvedProfileRevision,
        "approvedProfileRevision",
      ),
      releasedAssetRevision: positiveInteger(input.releasedAssetRevision, "releasedAssetRevision"),
      actorId,
      publishedAt: now,
      parentServedRevision: current?.servedRevision ?? null,
      rollbackTargetRevision: null,
      cacheRevision: (current?.releases.at(-1)?.cacheRevision ?? 0) + 1,
      sourceTrigger: input.trigger,
      failureReason: null,
    };
    const pending: ProgramPublicationState = {
      organizationId,
      eventId: scopedEventId,
      version: (current?.version ?? 0) + 1,
      servedRevision: current?.servedRevision ?? null,
      servedManifest: current?.servedManifest ?? null,
      pendingRevision: revision,
      pendingReleaseId: releaseId,
      releases: [...(current?.releases ?? []), manifest],
    };
    try {
      await this.#repository.compareAndSwap(
        organizationId,
        scopedEventId,
        current?.version ?? null,
        pending,
      );
    } catch (error) {
      if (error instanceof ProgramPublicationRepositoryConflictError) {
        throw publicationVersionConflict();
      }
      throw error;
    }

    try {
      await this.#enqueue.enqueue({ organizationId, eventId: scopedEventId, releaseId, revision });
      return clone(pending);
    } catch (error) {
      return this.failRebuild({
        organizationId,
        eventId: scopedEventId,
        releaseId,
        revision,
        expectedPublicationVersion: pending.version,
        reason: error instanceof Error ? error.message : "Publication rebuild enqueue failed.",
      });
    }
  }

  async completeRebuild(
    input: ProgramPublicationCompletionInput,
  ): Promise<ProgramPublicationState> {
    const organizationId = text(input.organizationId, "organizationId", 128);
    const scopedEventId = eventId(input.eventId);
    const current = await this.#repository.getState(organizationId, scopedEventId);
    if (current === null) throw notFound();
    const pendingRelease = releaseForCompletion(current, input);
    const servedRelease: ProgramPublicationManifest = {
      ...pendingRelease,
      lifecycle: "served",
      publishedAt: instant(this.#clock().toISOString(), "publishedAt"),
      failureReason: null,
    };
    const next: ProgramPublicationState = {
      ...current,
      version: current.version + 1,
      servedRevision: servedRelease.revision,
      servedManifest: servedRelease,
      pendingRevision: null,
      pendingReleaseId: null,
      releases: current.releases.map((release) =>
        release.id === servedRelease.id ? servedRelease : release,
      ),
    };
    await this.#savePublication(current, next);
    await this.#cacheInvalidation.invalidate({
      organizationId,
      eventId: scopedEventId,
      revision: servedRelease.revision,
      cacheRevision: servedRelease.cacheRevision,
    });
    return clone(next);
  }

  async failRebuild(input: ProgramPublicationFailureInput): Promise<ProgramPublicationState> {
    const organizationId = text(input.organizationId, "organizationId", 128);
    const scopedEventId = eventId(input.eventId);
    const current = await this.#repository.getState(organizationId, scopedEventId);
    if (current === null) throw notFound();
    const pendingRelease = releaseForCompletion(current, input);
    const failedRelease: ProgramPublicationManifest = {
      ...pendingRelease,
      lifecycle: "failed",
      failureReason: text(input.reason, "reason", 2_000),
    };
    const next: ProgramPublicationState = {
      ...current,
      version: current.version + 1,
      pendingRevision: null,
      pendingReleaseId: null,
      releases: current.releases.map((release) =>
        release.id === failedRelease.id ? failedRelease : release,
      ),
    };
    await this.#savePublication(current, next);
    return clone(next);
  }

  async rollback(
    actor: EventActor,
    input: ProgramPublicationRollbackInput,
  ): Promise<ProgramPublicationState> {
    const organizationId = organizationFromInput(actor, input.organizationId);
    const scopedEventId = eventId(input.eventId);
    const actorId = actorUserId(actor);
    await this.#requireEvent(organizationId, scopedEventId);
    const current = await this.#repository.getState(organizationId, scopedEventId);
    if (current === null || current.servedManifest === null) throw notFound();
    if (
      input.expectedPublicationVersion !== undefined &&
      input.expectedPublicationVersion !== current.version
    ) {
      throw publicationVersionConflict();
    }
    if (input.expectedServedRevision !== current.servedRevision) throw publicationVersionConflict();
    if (current.pendingRevision !== null) {
      throw conflict("A pending rebuild must complete or fail before rollback.");
    }
    const targetRevision = positiveInteger(input.targetRevision, "targetRevision");
    const target = current.releases.find(
      (release) => release.revision === targetRevision && release.lifecycle === "served",
    );
    if (target === undefined) throw notFound();

    const revision = (current.releases.at(-1)?.revision ?? 0) + 1;
    const rolledBack: ProgramPublicationManifest = {
      ...target,
      id: text(this.#generateId(), "release id", 128),
      revision,
      lifecycle: "served",
      actorId,
      publishedAt: instant(this.#clock().toISOString(), "publishedAt"),
      parentServedRevision: current.servedRevision,
      rollbackTargetRevision: target.revision,
      cacheRevision: (current.releases.at(-1)?.cacheRevision ?? 0) + 1,
      sourceTrigger: "released-schedule-change",
      failureReason: null,
    };
    const next: ProgramPublicationState = {
      ...current,
      version: current.version + 1,
      servedRevision: revision,
      servedManifest: rolledBack,
      releases: [...current.releases, rolledBack],
    };
    await this.#savePublication(current, next);
    await this.#cacheInvalidation.invalidate({
      organizationId,
      eventId: scopedEventId,
      revision,
      cacheRevision: rolledBack.cacheRevision,
    });
    return clone(next);
  }

  resolvePreview(
    actor: EventActor,
    input: ProgramPublicationPreviewRequest,
  ): ProgramResolvedPublication {
    const organizationId = organizationFromInput(actor, input.organizationId);
    if (
      organizationId !== input.manifest.organizationId ||
      eventId(input.eventId) !== input.manifest.eventId
    ) {
      throw forbidden("The published program does not belong to this event.");
    }
    return resolvePublishedProgram(input);
  }

  async #requireEvent(organizationId: string, scopedEventId: string): Promise<void> {
    const event = await this.#eventRepository.getEvent(organizationId, scopedEventId);
    if (event === null) throw notFound();
  }

  async #savePublication(
    current: ProgramPublicationState,
    next: ProgramPublicationState,
  ): Promise<void> {
    try {
      await this.#repository.compareAndSwap(
        current.organizationId,
        current.eventId,
        current.version,
        next,
      );
    } catch (error) {
      if (error instanceof ProgramPublicationRepositoryConflictError) {
        throw publicationVersionConflict();
      }
      throw error;
    }
  }
}

function projectionMatches(
  binding: { id: string; revisionNumber: number; sourceHash: string },
  projectionId: string,
  revisionNumber: number,
  sourceHashValue: string,
): boolean {
  return (
    binding.id === projectionId &&
    binding.revisionNumber === revisionNumber &&
    binding.sourceHash === sourceHashValue
  );
}

function safeProgramAvatarUrl(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (
    value.startsWith("/api/public/events/") &&
    value.includes("/speakers/") &&
    value.endsWith("/headshot") &&
    !value.includes("?") &&
    !value.includes("#")
  ) {
    return value;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === "" &&
      url.pathname.includes("/public/")
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function resolvePublishedProgram(
  input: ResolveProgramPublicationInput,
): ProgramResolvedPublication {
  const { manifest, configuration, agendaProjection, speakerProjection } = input;
  if (manifest.lifecycle !== "served" || !configuration.enabled) {
    throw new EventServiceError("NOT_FOUND", 404, "The published program was not found.");
  }
  if (
    !projectionMatches(
      agendaProjection,
      manifest.agendaProjectionId,
      manifest.agendaRevisionNumber,
      manifest.agendaSourceHash,
    ) ||
    !projectionMatches(
      speakerProjection,
      manifest.speakerProjectionId,
      manifest.speakerRevisionNumber,
      manifest.speakerSourceHash,
    )
  ) {
    throw conflict("The served program release is incomplete.");
  }

  const configuredTrackIds = new Set(configuration.trackIds);
  const configuredStatuses = new Set(configuration.statuses);
  const filteredEntries = agendaProjection.entries.filter(
    (entry) =>
      (configuredTrackIds.size === 0 ||
        entry.trackIds.some((trackId) => configuredTrackIds.has(trackId))) &&
      (configuredStatuses.size === 0 || configuredStatuses.has(entry.status)),
  );
  const sessionIds = new Set(filteredEntries.map((entry) => entry.sessionId));
  const fields = new Set(configuration.displayFields);
  const agenda = filteredEntries.map((entry): ProgramResolvedPublication["agenda"][number] => ({
    id: entry.id,
    sessionId: entry.sessionId,
    title: entry.title,
    ...(fields.has("summary") && entry.summary !== undefined ? { summary: entry.summary } : {}),
    ...(fields.has("format") && entry.format !== undefined ? { format: entry.format } : {}),
    ...(fields.has("date-time") && entry.startsAt !== undefined
      ? { startsAt: entry.startsAt }
      : {}),
    ...(fields.has("date-time") && entry.endsAt !== undefined ? { endsAt: entry.endsAt } : {}),
    ...(fields.has("date-time") && entry.startsAtLocal !== undefined
      ? { startsAtLocal: entry.startsAtLocal }
      : {}),
    ...(fields.has("date-time") && entry.endsAtLocal !== undefined
      ? { endsAtLocal: entry.endsAtLocal }
      : {}),
    ...(fields.has("date-time") && entry.timeZone !== undefined
      ? { timeZone: entry.timeZone }
      : {}),
    ...(fields.has("room") && entry.roomName !== undefined ? { roomName: entry.roomName } : {}),
    trackNames: fields.has("track") ? [...(entry.trackNames ?? [])] : [],
    speakerNames: fields.has("speakers") ? [...(entry.speakerNames ?? [])] : [],
  }));
  const speakers = speakerProjection.speakers
    .filter((speaker) => speaker.sessionIds.some((sessionId) => sessionIds.has(sessionId)))
    .map((speaker): ProgramResolvedPublication["speakers"][number] => ({
      id: speaker.id,
      participantId: speaker.participantId,
      sessionIds: speaker.sessionIds.filter((sessionId) => sessionIds.has(sessionId)),
      displayName: speaker.displayName,
      ...(fields.has("company") && speaker.company !== undefined
        ? { company: speaker.company }
        : {}),
      ...(fields.has("bio") && speaker.bio !== undefined ? { bio: speaker.bio } : {}),
      ...(speaker.avatarUrl !== undefined
        ? { avatarUrl: safeProgramAvatarUrl(speaker.avatarUrl) ?? null }
        : {}),
    }));

  return {
    configurationRevision: configuration.revision,
    servedProgramRevision: manifest.revision,
    programRevision: manifest.revision,
    cacheRevision: manifest.cacheRevision,
    agenda,
    speakers,
  };
}
export { EventServiceError as EventError };
