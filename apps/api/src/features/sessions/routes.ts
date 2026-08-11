import { type Context, Hono } from "hono";
import { ZodError, z } from "zod";
import { AuthAccessError, type AuthPrincipal } from "../auth/types";
import { type SessionService, SessionServiceError } from "./service";
import {
  type RestoreSessionInput,
  type SessionActor,
  type SessionListQuery,
  sessionContentStatuses,
} from "./types";

export interface SessionRouteEnvironment {
  Variables: {
    traceId: string;
    authPrincipal: AuthPrincipal | null;
  };
}

export type SessionRouteService = Pick<
  SessionService,
  | "createSession"
  | "getSession"
  | "listSessions"
  | "listSessionHistory"
  | "restoreSessionVersion"
  | "updateSession"
  | "deleteSession"
  | "createRoom"
  | "getRoom"
  | "listRooms"
  | "updateRoom"
  | "deleteRoom"
  | "createTrack"
  | "getTrack"
  | "listTracks"
  | "updateTrack"
  | "deleteTrack"
  | "createFormat"
  | "getFormat"
  | "listFormats"
  | "updateFormat"
  | "deleteFormat"
  | "createLevel"
  | "getLevel"
  | "listLevels"
  | "updateLevel"
  | "deleteLevel"
  | "createTag"
  | "getTag"
  | "listTags"
  | "updateTag"
  | "deleteTag"
  | "getSettings"
  | "updateSettings"
  | "listAudit"
  | "getPublishedSessionContent"
  | "getAgendaCatalog"
>;

export interface SessionRouteDependencies {
  readonly service: SessionRouteService;
}

type SessionContext = Context<SessionRouteEnvironment>;
type ErrorStatus = 400 | 401 | 403 | 404 | 409;

const identifier = z.string().trim().min(1).max(128);
const expectedVersion = z.number().int().positive();
const speakerReference = z
  .object({ id: identifier, role: z.string().trim().min(1).max(64).optional() })
  .strict();
const sessionCreate = z
  .object({
    id: identifier.optional(),
    title: z.string().trim().min(1).max(300),
    description: z.string().max(20_000).optional(),
    status: z.string().trim().min(1).max(64).optional(),
    durationMinutes: z.number().int().positive().max(1_440),
    capacityRequired: z.number().int().nonnegative().max(1_000_000).optional(),
    roomId: identifier.nullable().optional(),
    trackId: identifier.nullable().optional(),
    trackIds: z.array(identifier).max(20).optional(),
    formatId: identifier.nullable().optional(),
    levelId: identifier.nullable().optional(),
    tagIds: z.array(identifier).max(50).optional(),
    speakerIds: z.array(identifier).max(50).optional(),
    speakerRoster: z.array(speakerReference).max(50).optional(),
    resourceIds: z.array(identifier).max(100).optional(),
  })
  .strict();
const sessionUpdate = sessionCreate
  .omit({ id: true, durationMinutes: true, title: true })
  .extend({
    expectedVersion,
    title: z.string().trim().min(1).max(300).optional(),
    contentStatus: z.enum(sessionContentStatuses).optional(),
    durationMinutes: z.number().int().positive().max(1_440).optional(),
  })
  .strict();
const sessionRestore = z.object({ version: expectedVersion, expectedVersion }).strict();
const roomCreate = z
  .object({
    id: identifier.optional(),
    name: z.string().trim().min(1).max(200),
    capacity: z.number().int().nonnegative().max(1_000_000),
    resources: z.array(identifier).max(100).optional(),
    resourceIds: z.array(identifier).max(100).optional(),
  })
  .strict();
const roomUpdate = roomCreate
  .omit({ id: true, name: true, capacity: true })
  .extend({
    expectedVersion,
    name: z.string().trim().min(1).max(200).optional(),
    capacity: z.number().int().nonnegative().max(1_000_000).optional(),
  })
  .strict();
const taxonomyCreate = z
  .object({
    id: identifier.optional(),
    name: z.string().trim().min(1).max(200),
    description: z.string().max(2_000).optional(),
  })
  .strict();
const taxonomyUpdate = taxonomyCreate
  .omit({ id: true, name: true })
  .extend({
    expectedVersion,
    name: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
const settingsUpdate = z
  .object({
    expectedVersion,
    statuses: z.array(identifier).min(1).max(64).optional(),
    agendaEligibleStatuses: z.array(identifier).min(1).max(64).optional(),
  })
  .strict();
const deleteBody = z.object({ expectedVersion }).strict();

function traceId(context: SessionContext): string {
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
  context: SessionContext,
  status: ErrorStatus,
  code: string,
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

function routeParam(context: SessionContext, name: string): string {
  return identifier.parse(context.req.param(name));
}

async function body<T>(context: SessionContext, schema: z.ZodType<T>): Promise<T> {
  return schema.parse(await context.req.json().catch(() => undefined));
}

function organizer(context: SessionContext, organizationId: string): SessionActor {
  const principal = context.get("authPrincipal");
  if (!principal) throw new AuthAccessError("UNAUTHENTICATED", "Authentication is required.");
  if (principal.kind !== "user") {
    throw new AuthAccessError("FORBIDDEN", "Organizer session authentication is required.");
  }
  const membership = principal.memberships.find(
    (candidate) => candidate.organizationId === organizationId,
  );
  const role = membership?.role as string | undefined;
  if (!membership || !["owner", "admin", "organizer"].includes(role ?? "")) {
    throw new AuthAccessError("FORBIDDEN", "An organizer or administrator is required.");
  }
  return {
    tenantId: organizationId,
    userId: principal.userId,
    role: role === "owner" ? "owner" : role === "organizer" ? "organizer" : "admin",
    kind: "user",
  };
}

function query(context: SessionContext): SessionListQuery {
  const status = context.req.query("status");
  const search = context.req.query("search");
  const roomId = context.req.query("roomId");
  const trackId = context.req.query("trackId");
  const formatId = context.req.query("formatId");
  const levelId = context.req.query("levelId");
  const tagId = context.req.query("tagId");
  const speakerId = context.req.query("speakerId");
  const sortBy = context.req.query("sortBy");
  const sort = context.req.query("sort");
  const direction = context.req.query("direction");
  const limit = context.req.query("limit");
  const offset = context.req.query("offset");
  const eligible = context.req.query("agendaEligible");
  const parsed: SessionListQuery = {};
  if (status !== undefined) parsed.status = identifier.parse(status);
  if (search !== undefined) parsed.search = z.string().max(200).parse(search);
  if (roomId !== undefined) parsed.roomId = identifier.parse(roomId);
  if (trackId !== undefined) parsed.trackId = identifier.parse(trackId);
  if (formatId !== undefined) parsed.formatId = identifier.parse(formatId);
  if (levelId !== undefined) parsed.levelId = identifier.parse(levelId);
  if (tagId !== undefined) parsed.tagId = identifier.parse(tagId);
  if (speakerId !== undefined) parsed.speakerId = identifier.parse(speakerId);
  if (sortBy !== undefined)
    parsed.sortBy = z
      .enum(["title", "status", "durationMinutes", "createdAt", "updatedAt", "roomId", "trackId"])
      .parse(sortBy);
  if (sort !== undefined)
    parsed.sort = z
      .enum(["title", "status", "durationMinutes", "createdAt", "updatedAt", "roomId", "trackId"])
      .parse(sort);
  if (direction !== undefined) parsed.direction = z.enum(["asc", "desc"]).parse(direction);
  if (limit !== undefined) parsed.limit = z.coerce.number().int().parse(limit);
  if (offset !== undefined) parsed.offset = z.coerce.number().int().parse(offset);
  if (eligible !== undefined)
    parsed.agendaEligible = z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .parse(eligible);
  return parsed;
}

export function createSessionAdminRoutes(
  dependencies: SessionRouteDependencies,
): Hono<SessionRouteEnvironment> {
  const routes = new Hono<SessionRouteEnvironment>();

  routes.use("*", async (context, next) => {
    context.header("cache-control", "private, no-store");
    await next();
  });

  routes.get("/", async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    const data = await dependencies.service.listSessions(actor, {
      tenantId: organizationId,
      eventId: routeParam(context, "eventId"),
      ...query(context),
    });
    return context.json({ data });
  });

  routes.post("/", async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    const input = await body(context, sessionCreate);
    const data = await dependencies.service.createSession(actor, {
      ...input,
      tenantId: organizationId,
      eventId: routeParam(context, "eventId"),
    } as unknown as import("./types").CreateSessionInput);
    return context.json({ data }, 201);
  });

  routes.get("/settings", async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    return context.json({
      data: await dependencies.service.getSettings(actor, {
        tenantId: organizationId,
        eventId: routeParam(context, "eventId"),
      }),
    });
  });

  routes.put("/settings", async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    const input = await body(context, settingsUpdate);
    return context.json({
      data: await dependencies.service.updateSettings(actor, {
        ...input,
        tenantId: organizationId,
        eventId: routeParam(context, "eventId"),
      } as unknown as import("./types").UpdateSessionSettingsInput),
    });
  });
  routes.patch("/settings", async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    const input = await body(context, settingsUpdate);
    return context.json({
      data: await dependencies.service.updateSettings(actor, {
        ...input,
        tenantId: organizationId,
        eventId: routeParam(context, "eventId"),
      } as unknown as import("./types").UpdateSessionSettingsInput),
    });
  });

  routes.get("/statuses", async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    const data = await dependencies.service.getSettings(actor, {
      tenantId: organizationId,
      eventId: routeParam(context, "eventId"),
    });
    return context.json({
      data: data.statuses,
      agendaEligibleStatuses: data.agendaEligibleStatuses,
    });
  });

  routes.get("/audit", async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    const entityId = context.req.query("entityId");
    return context.json({
      data: await dependencies.service.listAudit(actor, {
        tenantId: organizationId,
        eventId: routeParam(context, "eventId"),
        ...(entityId === undefined ? {} : { entityId: identifier.parse(entityId) }),
      }),
    });
  });

  routes.get("/agenda-catalog", async (context) => {
    const organizationId = routeParam(context, "organizationId");
    organizer(context, organizationId);
    return context.json({
      data: await dependencies.service.getAgendaCatalog(
        organizationId,
        routeParam(context, "eventId"),
      ),
    });
  });

  routes.get("/published-content", async (context) => {
    const organizationId = routeParam(context, "organizationId");
    organizer(context, organizationId);
    return context.json({
      data: await dependencies.service.getPublishedSessionContent(
        organizationId,
        routeParam(context, "eventId"),
      ),
    });
  });

  routes.get("/rooms", async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    return context.json({
      data: await dependencies.service.listRooms(actor, {
        tenantId: organizationId,
        eventId: routeParam(context, "eventId"),
      }),
    });
  });
  routes.post("/rooms", async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    const input = await body(context, roomCreate);
    return context.json(
      {
        data: await dependencies.service.createRoom(actor, {
          ...input,
          tenantId: organizationId,
          eventId: routeParam(context, "eventId"),
        } as unknown as import("./types").CreateRoomInput),
      },
      201,
    );
  });
  routes.get("/rooms/:roomId", async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    return context.json({
      data: await dependencies.service.getRoom(actor, {
        tenantId: organizationId,
        eventId: routeParam(context, "eventId"),
        roomId: routeParam(context, "roomId"),
      }),
    });
  });
  const updateRoomRoute = async (context: SessionContext) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    const input = await body(context, roomUpdate);
    return context.json({
      data: await dependencies.service.updateRoom(actor, {
        ...input,
        tenantId: organizationId,
        eventId: routeParam(context, "eventId"),
        roomId: routeParam(context, "roomId"),
      } as unknown as import("./types").UpdateRoomInput),
    });
  };
  routes.put("/rooms/:roomId", updateRoomRoute);
  routes.patch("/rooms/:roomId", updateRoomRoute);
  routes.delete("/rooms/:roomId", async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    const input = await body(context, deleteBody);
    return context.json({
      data: await dependencies.service.deleteRoom(actor, {
        ...input,
        tenantId: organizationId,
        eventId: routeParam(context, "eventId"),
        roomId: routeParam(context, "roomId"),
      }),
    });
  });

  routes.get("/tracks", async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    return context.json({
      data: await dependencies.service.listTracks(actor, {
        tenantId: organizationId,
        eventId: routeParam(context, "eventId"),
      }),
    });
  });
  routes.post("/tracks", async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    const input = await body(context, taxonomyCreate);
    return context.json(
      {
        data: await dependencies.service.createTrack(actor, {
          ...input,
          tenantId: organizationId,
          eventId: routeParam(context, "eventId"),
        } as unknown as import("./types").CreateTaxonomyInput),
      },
      201,
    );
  });
  routes.get("/tracks/:trackId", async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    return context.json({
      data: await dependencies.service.getTrack(actor, {
        tenantId: organizationId,
        eventId: routeParam(context, "eventId"),
        trackId: routeParam(context, "trackId"),
      }),
    });
  });
  const updateTrackRoute = async (context: SessionContext) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    const input = await body(context, taxonomyUpdate);
    return context.json({
      data: await dependencies.service.updateTrack(actor, {
        ...input,
        tenantId: organizationId,
        eventId: routeParam(context, "eventId"),
        resourceId: routeParam(context, "trackId"),
      } as unknown as import("./types").UpdateTaxonomyInput),
    });
  };
  routes.put("/tracks/:trackId", updateTrackRoute);
  routes.patch("/tracks/:trackId", updateTrackRoute);
  routes.delete("/tracks/:trackId", async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    const input = await body(context, deleteBody);
    return context.json({
      data: await dependencies.service.deleteTrack(actor, {
        ...input,
        tenantId: organizationId,
        eventId: routeParam(context, "eventId"),
        resourceId: routeParam(context, "trackId"),
      }),
    });
  });

  registerTaxonomyRoutes(routes, dependencies, "formats", "format");
  registerTaxonomyRoutes(routes, dependencies, "levels", "level");
  registerTaxonomyRoutes(routes, dependencies, "tags", "tag");

  routes.get("/:sessionId/history", async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    return context.json({
      data: await dependencies.service.listSessionHistory(actor, {
        tenantId: organizationId,
        eventId: routeParam(context, "eventId"),
        sessionId: routeParam(context, "sessionId"),
      }),
    });
  });
  routes.post("/:sessionId/restore", async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    const input = await body(context, sessionRestore);
    return context.json({
      data: await dependencies.service.restoreSessionVersion(actor, {
        ...input,
        tenantId: organizationId,
        eventId: routeParam(context, "eventId"),
        sessionId: routeParam(context, "sessionId"),
      } as RestoreSessionInput),
    });
  });
  routes.get("/:sessionId", async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    return context.json({
      data: await dependencies.service.getSession(actor, {
        tenantId: organizationId,
        eventId: routeParam(context, "eventId"),
        sessionId: routeParam(context, "sessionId"),
      }),
    });
  });
  const updateSessionRoute = async (context: SessionContext) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    const input = await body(context, sessionUpdate);
    return context.json({
      data: await dependencies.service.updateSession(actor, {
        ...input,
        tenantId: organizationId,
        eventId: routeParam(context, "eventId"),
        sessionId: routeParam(context, "sessionId"),
      } as unknown as import("./types").UpdateSessionInput),
    });
  };
  routes.put("/:sessionId", updateSessionRoute);
  routes.patch("/:sessionId", updateSessionRoute);
  routes.delete("/:sessionId", async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    const input = await body(context, deleteBody);
    return context.json({
      data: await dependencies.service.deleteSession(actor, {
        ...input,
        tenantId: organizationId,
        eventId: routeParam(context, "eventId"),
        sessionId: routeParam(context, "sessionId"),
      }),
    });
  });

  routes.onError((error, context) => {
    if (error instanceof ZodError)
      return errorResponse(
        context,
        400,
        "VALIDATION_FAILED",
        "The sessions request is invalid.",
        validationDetails(error),
      );
    if (error instanceof AuthAccessError)
      return errorResponse(
        context,
        error.status,
        error.code === "UNAUTHENTICATED" ? "AUTHENTICATION_REQUIRED" : "ACCESS_DENIED",
        error.message,
      );
    if (error instanceof SessionServiceError) {
      const code =
        error.code === "FORBIDDEN"
          ? "ACCESS_DENIED"
          : error.code === "VALIDATION_ERROR"
            ? "VALIDATION_FAILED"
            : error.code === "VERSION_CONFLICT" || error.code === "CONFLICT"
              ? "CONFLICT"
              : error.code;
      return errorResponse(context, error.status, code, error.message, error.details);
    }
    throw error;
  });

  return routes;
}

function registerTaxonomyRoutes(
  routes: Hono<SessionRouteEnvironment>,
  dependencies: SessionRouteDependencies,
  plural: "formats" | "levels" | "tags",
  resource: "format" | "level" | "tag",
): void {
  routes.get(`/${plural}`, async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    const input = { tenantId: organizationId, eventId: routeParam(context, "eventId") };
    const data =
      resource === "format"
        ? await dependencies.service.listFormats(actor, input)
        : resource === "level"
          ? await dependencies.service.listLevels(actor, input)
          : await dependencies.service.listTags(actor, input);
    return context.json({ data });
  });
  routes.post(`/${plural}`, async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    const input = await body(context, taxonomyCreate);
    const command = {
      ...input,
      tenantId: organizationId,
      eventId: routeParam(context, "eventId"),
    } as unknown as import("./types").CreateTaxonomyInput;
    const data =
      resource === "format"
        ? await dependencies.service.createFormat(actor, command)
        : resource === "level"
          ? await dependencies.service.createLevel(actor, command)
          : await dependencies.service.createTag(actor, command);
    return context.json({ data }, 201);
  });
  routes.get(`/${plural}/:resourceId`, async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    const input = {
      tenantId: organizationId,
      eventId: routeParam(context, "eventId"),
      resourceId: routeParam(context, "resourceId"),
    };
    const data =
      resource === "format"
        ? await dependencies.service.getFormat(actor, { ...input, formatId: input.resourceId })
        : resource === "level"
          ? await dependencies.service.getLevel(actor, { ...input, levelId: input.resourceId })
          : await dependencies.service.getTag(actor, { ...input, tagId: input.resourceId });
    return context.json({ data });
  });
  const update = async (context: SessionContext) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    const input = await body(context, taxonomyUpdate);
    const command = {
      ...input,
      tenantId: organizationId,
      eventId: routeParam(context, "eventId"),
      resourceId: routeParam(context, "resourceId"),
    } as unknown as import("./types").UpdateTaxonomyInput;
    const data =
      resource === "format"
        ? await dependencies.service.updateFormat(actor, command)
        : resource === "level"
          ? await dependencies.service.updateLevel(actor, command)
          : await dependencies.service.updateTag(actor, command);
    return context.json({ data });
  };
  routes.put(`/${plural}/:resourceId`, update);
  routes.patch(`/${plural}/:resourceId`, update);
  routes.delete(`/${plural}/:resourceId`, async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    const input = await body(context, deleteBody);
    const command = {
      ...input,
      tenantId: organizationId,
      eventId: routeParam(context, "eventId"),
      resourceId: routeParam(context, "resourceId"),
    };
    const data =
      resource === "format"
        ? await dependencies.service.deleteFormat(actor, command)
        : resource === "level"
          ? await dependencies.service.deleteLevel(actor, command)
          : await dependencies.service.deleteTag(actor, command);
    return context.json({ data });
  });
}
