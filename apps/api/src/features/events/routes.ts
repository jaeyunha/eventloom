import { type Context, Hono } from "hono";
import { ZodError, z } from "zod";
import { AuthAccessError, type AuthPrincipal } from "../auth/types";
import {
  type EventService,
  EventServiceError,
  type EventServiceErrorCode,
  type ProgramPublicationService,
} from "./service";
import {
  type CreateEventInput,
  type EventActor,
  type EventCfpSettingsInput,
  type EventDefaultCalendarSettingsInput,
  type EventEmbedConfigurationInput,
  eventEmbedDisplayFields,
  eventEmbedLayouts,
  eventEmbedOutputFormats,
  eventEmbedThemes,
  eventEmbedWidgetIds,
  type ProgramPublicationPreviewRequest,
  programPublicationSourceTriggers,
  type UpdateEventInput,
} from "./types";

export interface EventRouteEnvironment {
  Variables: {
    traceId: string;
    authPrincipal: AuthPrincipal | null;
  };
}

export type EventRouteService = Pick<
  EventService,
  "listEvents" | "createEvent" | "getEvent" | "updateEvent"
>;

export interface EventRouteDependencies {
  readonly service: EventRouteService;
  readonly publication?: Pick<
    ProgramPublicationService,
    "getState" | "requestRebuild" | "rollback" | "resolvePreview"
  >;
}

type EventContext = Context<EventRouteEnvironment>;
type ErrorStatus = 400 | 401 | 403 | 404 | 409;
type ApiRouteErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "ACCESS_DENIED"
  | "NOT_FOUND"
  | "VALIDATION_FAILED"
  | "CONFLICT";

const identifierSchema = z.string().trim().min(1).max(128);
const instantSchema = z.string().trim().min(1).max(80);
const expectedVersionSchema = z.number().int().positive();
const listEventsQuerySchema = z.object({}).strict();
const settingsInputSchema = z
  .object({
    enabled: z.boolean().optional(),
    opensAt: instantSchema.nullable().optional(),
    closesAt: instantSchema.nullable().optional(),
  })
  .strict();
const calendarSettingsInputSchema = z
  .object({
    durationMinutes: z.number().int().min(1).max(1_440).optional(),
    timeZone: identifierSchema.optional(),
    location: z.string().trim().max(2_000).nullable().optional(),
  })
  .strict();
const scheduleDatesSchema = z
  .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/u))
  .max(366)
  .optional();
const embedConfigurationSchema = z
  .object({
    id: identifierSchema,
    name: z.string().trim().min(1).max(200),
    widgetId: z.enum(eventEmbedWidgetIds),
    enabled: z.boolean(),
    theme: z.enum(eventEmbedThemes),
    outputFormat: z.enum(eventEmbedOutputFormats),
    layout: z.enum(eventEmbedLayouts),
    accent: z.string().regex(/^#[0-9a-f]{6}$/i),
    backgroundColor: z.string().regex(/^#[0-9a-f]{6}$/i),
    textColor: z.string().regex(/^#[0-9a-f]{6}$/i),
    customCss: z.string().max(20_000),
    displayFields: z.array(z.enum(eventEmbedDisplayFields)).max(eventEmbedDisplayFields.length),
    trackIds: z.array(z.string().trim().min(1).max(128)).max(100),
    statuses: z.array(z.string().trim().min(1).max(128)).max(100),
    revision: z.number().int().positive().optional(),
  })
  .strict();
const embedConfigurationsSchema = z.array(embedConfigurationSchema).max(100).optional();
const createEventSchema = z
  .object({
    id: identifierSchema.optional(),
    slug: z.string().trim().min(1).max(80).optional(),
    name: z.string().trim().min(1).max(200),
    timeZone: identifierSchema,
    startsAt: instantSchema,
    endsAt: instantSchema,
    scheduleDates: scheduleDatesSchema,
    venue: z.string().trim().max(2_000).nullable().optional(),
    cfpSettings: settingsInputSchema.optional(),
    defaultCalendarSettings: calendarSettingsInputSchema.optional(),
    embedConfigurations: embedConfigurationsSchema,
  })
  .strict();
const updateEventSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    slug: z.string().trim().min(1).max(80).optional(),
    name: z.string().trim().min(1).max(200).optional(),
    timeZone: identifierSchema.optional(),
    startsAt: instantSchema.optional(),
    endsAt: instantSchema.optional(),
    scheduleDates: scheduleDatesSchema,
    venue: z.string().trim().max(2_000).nullable().optional(),
    cfpSettings: settingsInputSchema.optional(),
    defaultCalendarSettings: calendarSettingsInputSchema.optional(),
    embedConfigurations: embedConfigurationsSchema,
  })
  .strict();
const programRebuildSchema = z
  .object({
    trigger: z.enum(programPublicationSourceTriggers),
    agendaProjectionId: identifierSchema,
    agendaRevisionNumber: expectedVersionSchema,
    agendaSourceHash: z.string().trim().min(1).max(256),
    speakerProjectionId: identifierSchema,
    speakerRevisionNumber: expectedVersionSchema,
    speakerSourceHash: z.string().trim().min(1).max(256),
    approvedContentRevision: expectedVersionSchema,
    approvedProfileRevision: expectedVersionSchema,
    releasedAssetRevision: expectedVersionSchema,
    parentServedRevision: expectedVersionSchema.nullable().optional(),
  })
  .strict();
const programRollbackSchema = z
  .object({
    targetRevision: expectedVersionSchema,
    expectedServedRevision: expectedVersionSchema.nullable(),
    expectedPublicationVersion: expectedVersionSchema.optional(),
  })
  .strict();
const programManifestSchema = z
  .object({
    id: identifierSchema,
    organizationId: identifierSchema,
    eventId: identifierSchema,
    revision: expectedVersionSchema,
    lifecycle: z.enum(["pending", "served", "failed"]),
    agendaProjectionId: identifierSchema,
    agendaRevisionNumber: expectedVersionSchema,
    agendaSourceHash: z.string().trim().min(1).max(256),
    speakerProjectionId: identifierSchema,
    speakerRevisionNumber: expectedVersionSchema,
    speakerSourceHash: z.string().trim().min(1).max(256),
    approvedContentRevision: expectedVersionSchema,
    approvedProfileRevision: expectedVersionSchema,
    releasedAssetRevision: expectedVersionSchema,
    actorId: identifierSchema,
    publishedAt: instantSchema,
    parentServedRevision: expectedVersionSchema.nullable(),
    rollbackTargetRevision: expectedVersionSchema.nullable(),
    cacheRevision: expectedVersionSchema,
    sourceTrigger: z.enum(programPublicationSourceTriggers),
    failureReason: z.string().trim().min(1).max(2_000).nullable(),
  })
  .strict();
const programAgendaEntrySchema = z
  .object({
    id: identifierSchema,
    sessionId: identifierSchema,
    trackIds: z.array(identifierSchema).max(100),
    status: z.string().trim().min(1).max(128),
    title: z.string().trim().min(1).max(1_000),
    summary: z.string().max(20_000).optional(),
    format: z.string().trim().min(1).max(500).optional(),
    startsAt: instantSchema.optional(),
    endsAt: instantSchema.optional(),
    startsAtLocal: z.string().trim().min(1).max(64).optional(),
    endsAtLocal: z.string().trim().min(1).max(64).optional(),
    timeZone: identifierSchema.optional(),
    roomName: z.string().max(500).optional(),
    trackNames: z.array(z.string().max(500)).max(100).optional(),
    speakerNames: z.array(z.string().max(500)).max(100).optional(),
  })
  .strict();
const programSpeakerSchema = z
  .object({
    id: identifierSchema,
    participantId: identifierSchema,
    sessionIds: z.array(identifierSchema).max(100),
    displayName: z.string().trim().min(1).max(500),
    title: z.string().max(500).optional(),
    company: z.string().max(500).optional(),
    bio: z.string().max(20_000).optional(),
    avatarUrl: z.string().max(2_000).nullable().optional(),
  })
  .strict();
const programPreviewSchema = z
  .object({
    manifest: programManifestSchema,
    agendaProjection: z
      .object({
        id: identifierSchema,
        revisionNumber: expectedVersionSchema,
        sourceHash: z.string().trim().min(1).max(256),
        entries: z.array(programAgendaEntrySchema).max(2_000),
      })
      .strict(),
    speakerProjection: z
      .object({
        id: identifierSchema,
        revisionNumber: expectedVersionSchema,
        sourceHash: z.string().trim().min(1).max(256),
        speakers: z.array(programSpeakerSchema).max(2_000),
      })
      .strict(),
    configuration: embedConfigurationSchema.extend({ revision: expectedVersionSchema }),
  })
  .strict();
type CreateEventBody = z.infer<typeof createEventSchema>;
type UpdateEventBody = z.infer<typeof updateEventSchema>;

function cfpInput(value: CreateEventBody["cfpSettings"]): EventCfpSettingsInput | undefined {
  if (value === undefined) return undefined;
  const result: EventCfpSettingsInput = {};
  if (value.enabled !== undefined) result.enabled = value.enabled;
  if (value.opensAt !== undefined) result.opensAt = value.opensAt;
  if (value.closesAt !== undefined) result.closesAt = value.closesAt;
  return result;
}

function calendarInput(
  value: CreateEventBody["defaultCalendarSettings"],
): EventDefaultCalendarSettingsInput | undefined {
  if (value === undefined) return undefined;
  const result: EventDefaultCalendarSettingsInput = {};
  if (value.durationMinutes !== undefined) result.durationMinutes = value.durationMinutes;
  if (value.timeZone !== undefined) result.timeZone = value.timeZone;
  if (value.location !== undefined) result.location = value.location;
  return result;
}
function embedConfigurationsInput(
  value: CreateEventBody["embedConfigurations"],
): readonly EventEmbedConfigurationInput[] | undefined {
  if (value === undefined) return undefined;
  return value.map(({ revision, ...configuration }) => ({
    ...configuration,
    displayFields: [...configuration.displayFields],
    trackIds: [...configuration.trackIds],
    statuses: [...configuration.statuses],
    ...(revision === undefined ? {} : { revision }),
  }));
}

function createServiceInput(input: CreateEventBody, organizationId: string): CreateEventInput {
  const result: CreateEventInput = {
    organizationId,
    name: input.name,
    timeZone: input.timeZone,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
  };
  if (input.id !== undefined) result.id = input.id;
  if (input.slug !== undefined) result.slug = input.slug;
  if (input.scheduleDates !== undefined) result.scheduleDates = [...input.scheduleDates];
  if (input.venue !== undefined) result.venue = input.venue;
  const cfpSettings = cfpInput(input.cfpSettings);
  if (cfpSettings !== undefined) result.cfpSettings = cfpSettings;
  const defaultCalendarSettings = calendarInput(input.defaultCalendarSettings);
  if (defaultCalendarSettings !== undefined) {
    result.defaultCalendarSettings = defaultCalendarSettings;
  }
  const embedConfigurations = embedConfigurationsInput(input.embedConfigurations);
  if (embedConfigurations !== undefined) result.embedConfigurations = embedConfigurations;
  return result;
}

function updateServiceInput(
  input: UpdateEventBody,
  organizationId: string,
  eventId: string,
): UpdateEventInput {
  const result: UpdateEventInput = {
    organizationId,
    eventId,
    expectedVersion: input.expectedVersion,
  };
  if (input.slug !== undefined) result.slug = input.slug;
  if (input.name !== undefined) result.name = input.name;
  if (input.timeZone !== undefined) result.timeZone = input.timeZone;
  if (input.startsAt !== undefined) result.startsAt = input.startsAt;
  if (input.endsAt !== undefined) result.endsAt = input.endsAt;
  if (input.scheduleDates !== undefined) result.scheduleDates = [...input.scheduleDates];
  if (input.venue !== undefined) result.venue = input.venue;
  const cfpSettings = cfpInput(input.cfpSettings);
  if (cfpSettings !== undefined) result.cfpSettings = cfpSettings;
  const defaultCalendarSettings = calendarInput(input.defaultCalendarSettings);
  if (defaultCalendarSettings !== undefined) {
    result.defaultCalendarSettings = defaultCalendarSettings;
  }
  const embedConfigurations = embedConfigurationsInput(input.embedConfigurations);
  if (embedConfigurations !== undefined) result.embedConfigurations = embedConfigurations;
  return result;
}

function traceId(context: EventContext): string {
  return context.get("traceId") ?? crypto.randomUUID();
}

function validationDetails(
  error: ZodError,
): readonly { path: readonly (string | number)[]; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.filter(
      (part): part is string | number => typeof part === "string" || typeof part === "number",
    ),
    message: issue.message,
  }));
}

function errorResponse(
  context: EventContext,
  status: ErrorStatus,
  code: ApiRouteErrorCode,
  message: string,
  details?: readonly { path: readonly (string | number)[]; message: string }[],
): Response {
  return context.json(
    {
      error: {
        code,
        message,
        traceId: traceId(context),
        ...(details === undefined || details.length === 0 ? {} : { details }),
      },
    },
    status,
  );
}

function routeParam(context: EventContext, name: string): string {
  return identifierSchema.parse(context.req.param(name));
}

async function body<T>(context: EventContext, schema: z.ZodType<T>): Promise<T> {
  return schema.parse(await context.req.json().catch(() => undefined));
}

function organizer(context: EventContext, organizationId: string): EventActor {
  const principal = context.get("authPrincipal");
  if (principal === null || principal === undefined) {
    throw new AuthAccessError("UNAUTHENTICATED", "Authentication is required.");
  }
  if (principal.kind !== "user") {
    throw new AuthAccessError("FORBIDDEN", "Organizer session authentication is required.");
  }
  const membership = principal.memberships.find(
    (candidate) => candidate.organizationId === organizationId,
  );
  if (membership === undefined || (membership.role !== "owner" && membership.role !== "admin")) {
    throw new AuthAccessError("FORBIDDEN", "An owner or administrator is required.");
  }
  return {
    organizationId,
    userId: principal.userId,
    role: membership.role,
    kind: "user",
  };
}

function serviceErrorCode(error: EventServiceErrorCode): ApiRouteErrorCode {
  switch (error) {
    case "FORBIDDEN":
      return "ACCESS_DENIED";
    case "VALIDATION_ERROR":
      return "VALIDATION_FAILED";
    case "VERSION_CONFLICT":
    case "CONFLICT":
      return "CONFLICT";
    case "NOT_FOUND":
      return "NOT_FOUND";
  }
}

/** Routes are intentionally relative to the mount supplied by the API app. */
export function createEventRoutes(
  dependencies: EventRouteDependencies,
): Hono<EventRouteEnvironment> {
  const routes = new Hono<EventRouteEnvironment>();

  routes.use("*", async (context, next) => {
    context.header("cache-control", "private, no-store");
    await next();
  });

  routes.get("/", async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    listEventsQuerySchema.parse(context.req.query());
    const data = await dependencies.service.listEvents(actor, { organizationId });
    return context.json({ data });
  });

  routes.post("/", async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    const input = await body(context, createEventSchema);
    const data = await dependencies.service.createEvent(
      actor,
      createServiceInput(input, organizationId),
    );
    return context.json({ data }, 201);
  });

  routes.get("/:eventId/publication", async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    if (dependencies.publication === undefined) {
      throw new EventServiceError("NOT_FOUND", 404, "Program publication is not configured.");
    }
    const data = await dependencies.publication.getState(actor, {
      organizationId,
      eventId: routeParam(context, "eventId"),
    });
    return context.json({ data });
  });

  routes.post("/:eventId/publication/rebuild", async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    if (dependencies.publication === undefined) {
      throw new EventServiceError("NOT_FOUND", 404, "Program publication is not configured.");
    }
    const input = await body(context, programRebuildSchema);
    const { parentServedRevision, ...rebuild } = input;
    const data = await dependencies.publication.requestRebuild(actor, {
      ...rebuild,
      ...(parentServedRevision === undefined ? {} : { parentServedRevision }),
      organizationId,
      eventId: routeParam(context, "eventId"),
    });
    return context.json({ data }, 202);
  });

  routes.post("/:eventId/publication/rollback", async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    if (dependencies.publication === undefined) {
      throw new EventServiceError("NOT_FOUND", 404, "Program publication is not configured.");
    }
    const input = await body(context, programRollbackSchema);
    const { expectedPublicationVersion, ...rollback } = input;
    const data = await dependencies.publication.rollback(actor, {
      ...rollback,
      ...(expectedPublicationVersion === undefined ? {} : { expectedPublicationVersion }),
      organizationId,
      eventId: routeParam(context, "eventId"),
    });
    return context.json({ data });
  });

  routes.post("/:eventId/publication/preview", async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    if (dependencies.publication === undefined) {
      throw new EventServiceError("NOT_FOUND", 404, "Program publication is not configured.");
    }
    const input = await body(context, programPreviewSchema);
    const previewRequest = {
      ...input,
      organizationId,
      eventId: routeParam(context, "eventId"),
    } as unknown as ProgramPublicationPreviewRequest;
    const data = dependencies.publication.resolvePreview(actor, previewRequest);
    return context.json({ data });
  });
  routes.get("/:eventId", async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    const data = await dependencies.service.getEvent(actor, {
      organizationId,
      eventId: routeParam(context, "eventId"),
    });
    return context.json({ data });
  });

  const update = async (context: EventContext): Promise<Response> => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    const input = await body(context, updateEventSchema);
    const data = await dependencies.service.updateEvent(
      actor,
      updateServiceInput(input, organizationId, routeParam(context, "eventId")),
    );
    return context.json({ data });
  };
  routes.put("/:eventId", update);
  routes.patch("/:eventId", update);

  routes.onError((error, context) => {
    if (error instanceof ZodError) {
      return errorResponse(
        context,
        400,
        "VALIDATION_FAILED",
        "The event request is invalid.",
        validationDetails(error),
      );
    }
    if (error instanceof AuthAccessError) {
      return errorResponse(
        context,
        error.status,
        error.code === "UNAUTHENTICATED" ? "AUTHENTICATION_REQUIRED" : "ACCESS_DENIED",
        error.message,
      );
    }
    if (error instanceof EventServiceError) {
      return errorResponse(
        context,
        error.status,
        serviceErrorCode(error.code),
        error.message,
        Array.isArray(error.details)
          ? (error.details as readonly {
              path: readonly (string | number)[];
              message: string;
            }[])
          : undefined,
      );
    }
    throw error;
  });

  return routes;
}

export const createEventAdminRoutes = createEventRoutes;
export const EVENT_ADMIN_ROUTE_PREFIX = "/api/admin/organizations/:organizationId/events";
