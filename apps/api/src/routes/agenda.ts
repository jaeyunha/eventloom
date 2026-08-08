import { apiErrorSchema } from "@open-sessionboard/contracts";
import { type Context, Hono } from "hono";
import { ZodError, z } from "zod";
import { AgendaEngine, AgendaError, AgendaValidationError } from "../features/agenda/engine";
import type { AuthPrincipal, UserPrincipal } from "../features/auth/types";
import { AuthAccessError } from "../features/auth/types";

export interface AgendaRouteEnvironment {
  Variables: {
    authPrincipal: AuthPrincipal | null;
    traceId: string;
  };
}

export interface AgendaRouteDependencies {
  readonly engine: AgendaEngine;
  readonly organizationIdForEvent: (eventId: string) => Promise<string | null>;
}

const identifierSchema = z.string().trim().min(1).max(200);
const expectedVersionSchema = z.number().int().positive();
const sessionSchema = z
  .object({
    id: identifierSchema,
    title: z.string().trim().min(1).max(1_000),
    status: z.literal("accepted"),
    participantIds: z.array(identifierSchema).max(100),
    resourceIds: z.array(identifierSchema).max(100),
    capacityRequired: z.number().int().nonnegative(),
  })
  .strict();
const roomSchema = z
  .object({
    id: identifierSchema,
    name: z.string().trim().min(1).max(500),
    capacity: z.number().int().positive(),
  })
  .strict();
const trackSchema = z
  .object({ id: identifierSchema, name: z.string().trim().min(1).max(500) })
  .strict();
const catalogSchema = z.object({
  sessions: z.array(sessionSchema).max(2_000),
  rooms: z.array(roomSchema).max(500),
  tracks: z.array(trackSchema).max(500),
});
const entrySchema = z
  .object({
    id: identifierSchema,
    sessionId: identifierSchema,
    roomId: identifierSchema,
    trackIds: z.array(identifierSchema).max(100),
    startsAtLocal: z.string().trim().min(1).max(64),
    endsAtLocal: z.string().trim().min(1).max(64),
    startDisambiguation: z.enum(["earlier", "later"]).optional(),
    endDisambiguation: z.enum(["earlier", "later"]).optional(),
  })
  .strict();
const createAgendaSchema = catalogSchema
  .extend({
    timeZone: z.string().trim().min(1).max(100),
    minimumTravelMinutes: z.number().int().nonnegative().max(1_440),
  })
  .strict();
const updateDraftSchema = z
  .object({ expectedVersion: expectedVersionSchema, entries: z.array(entrySchema).max(2_000) })
  .strict();
const versionSchema = z.object({ expectedVersion: expectedVersionSchema }).strict();
const overrideSchema = versionSchema
  .extend({ reason: z.string().trim().min(3).max(2_000) })
  .strict();
const rollbackSchema = versionSchema.extend({ revisionId: identifierSchema }).strict();

type AgendaContext = Context<AgendaRouteEnvironment>;
type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 500;
interface ValidationIssue {
  readonly path: readonly (string | number)[];
  readonly code: string;
  readonly message: string;
}

function traceId(context: AgendaContext): string {
  return context.get("traceId") ?? crypto.randomUUID();
}

function errorResponse(
  context: AgendaContext,
  status: ErrorStatus,
  code:
    | "AUTHENTICATION_REQUIRED"
    | "ACCESS_DENIED"
    | "NOT_FOUND"
    | "VALIDATION_FAILED"
    | "CONFLICT"
    | "INTERNAL_ERROR",
  message: string,
  details?: readonly ValidationIssue[],
): Response {
  const body = apiErrorSchema.parse({
    error: {
      code,
      message,
      traceId: traceId(context),
      ...(details === undefined ? {} : { details }),
    },
  });
  return context.json(body, status);
}

function zodDetails(error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.filter(
      (segment): segment is string | number =>
        typeof segment === "string" || typeof segment === "number",
    ),
    code: issue.code,
    message: issue.message,
  }));
}

function conflictDetails(error: AgendaValidationError): ValidationIssue[] {
  return error.report.conflicts.map((conflict) => ({
    path: ["entries", ...conflict.entryIds],
    code: `agenda.${conflict.kind}`,
    message: conflict.message,
  }));
}

function agendaErrorResponse(context: AgendaContext, error: AgendaError): Response {
  if (error instanceof AgendaValidationError) {
    return errorResponse(
      context,
      409,
      "CONFLICT",
      "The agenda contains unresolved scheduling conflicts.",
      conflictDetails(error),
    );
  }
  switch (error.code) {
    case "AGENDA_NOT_FOUND":
    case "REVISION_NOT_FOUND":
    case "WARNING_NOT_FOUND":
      return errorResponse(context, 404, "NOT_FOUND", "The requested agenda resource was not found.");
    case "AGENDA_ALREADY_EXISTS":
    case "CONCURRENT_MODIFICATION":
    case "PUBLICATION_BLOCKED":
      return errorResponse(context, 409, "CONFLICT", error.message);
    case "INVALID_AGENDA":
      return errorResponse(context, 400, "VALIDATION_FAILED", error.message);
  }
}

function requireOrganizerPrincipal(context: AgendaContext, organizationId: string): UserPrincipal {
  const principal = context.get("authPrincipal");
  if (!principal) {
    throw new AuthAccessError("UNAUTHENTICATED", "Authentication is required.");
  }
  if (principal.kind !== "user") {
    throw new AuthAccessError("FORBIDDEN", "Organizer access requires a user session.");
  }
  const membership = principal.memberships.find(
    (candidate) => candidate.organizationId === organizationId,
  );
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    throw new AuthAccessError("FORBIDDEN", "Organizer access is required for this organization.");
  }
  return principal;
}
function routeParam(context: AgendaContext, name: string): string {
  const value = context.req.param(name);
  if (value === undefined || value.trim().length === 0) {
    throw new AgendaError("INVALID_AGENDA", `The ${name} path parameter is required.`);
  }
  return value;
}

async function organizerForEvent(
  context: AgendaContext,
  dependencies: AgendaRouteDependencies,
): Promise<UserPrincipal> {
  const organizationId = routeParam(context, "organizationId");
  const eventId = routeParam(context, "eventId");
  const principal = requireOrganizerPrincipal(context, organizationId);
  const eventOrganizationId = await dependencies.organizationIdForEvent(eventId);
  if (eventOrganizationId === null || eventOrganizationId !== organizationId) {
    throw new AgendaError("AGENDA_NOT_FOUND", "The event agenda was not found.");
  }
  return principal;
}

async function body<T>(context: AgendaContext, schema: z.ZodType<T>): Promise<T> {
  const payload = await context.req.json().catch(() => undefined);
  return schema.parse(payload);
}

/** Organizer-only routes mounted below an organization and event path. */
export function createAgendaAdminRoutes(
  dependencies: AgendaRouteDependencies,
): Hono<AgendaRouteEnvironment> {
  const routes = new Hono<AgendaRouteEnvironment>();

  routes.use("*", async (context, next) => {
    context.header("cache-control", "private, no-store");
    await next();
  });

  routes.post("/", async (context) => {
    const principal = await organizerForEvent(context, dependencies);
    const input = await body(context, createAgendaSchema);
    const data = await dependencies.engine.createAgenda({
      eventId: routeParam(context, "eventId"),
      actorId: principal.userId,
      ...input,
    });
    return context.json({ data }, 201);
  });

  routes.get("/draft", async (context) => {
    await organizerForEvent(context, dependencies);
    return context.json({ data: await dependencies.engine.getDraft(routeParam(context, "eventId")) });
  });

  routes.get("/preview", async (context) => {
    await organizerForEvent(context, dependencies);
    return context.json({ data: await dependencies.engine.preview(routeParam(context, "eventId")) });
  });

  routes.put("/draft", async (context) => {
    const principal = await organizerForEvent(context, dependencies);
    const input = await body(context, updateDraftSchema);
    const data = await dependencies.engine.updateDraft({
      eventId: routeParam(context, "eventId"),
      actorId: principal.userId,
      expectedVersion: input.expectedVersion,
      entries: input.entries.map((entry) => ({
        id: entry.id,
        sessionId: entry.sessionId,
        roomId: entry.roomId,
        trackIds: entry.trackIds,
        startsAtLocal: entry.startsAtLocal,
        endsAtLocal: entry.endsAtLocal,
        ...(entry.startDisambiguation === undefined
          ? {}
          : { startDisambiguation: entry.startDisambiguation }),
        ...(entry.endDisambiguation === undefined
          ? {}
          : { endDisambiguation: entry.endDisambiguation }),
      })),
    });
    return context.json({ data });
  });

  routes.post("/warnings/:warningId/override", async (context) => {
    const principal = await organizerForEvent(context, dependencies);
    const input = await body(context, overrideSchema);
    const data = await dependencies.engine.overrideWarning({
      eventId: routeParam(context, "eventId"),
      actorId: principal.userId,
      warningId: routeParam(context, "warningId"),
      ...input,
    });
    return context.json({ data });
  });

  routes.post("/publish", async (context) => {
    const principal = await organizerForEvent(context, dependencies);
    const input = await body(context, versionSchema);
    const data = await dependencies.engine.publish({
      eventId: routeParam(context, "eventId"),
      actorId: principal.userId,
      ...input,
    });
    return context.json({ data });
  });

  routes.get("/published", async (context) => {
    await organizerForEvent(context, dependencies);
    const data = await dependencies.engine.getPublishedAgenda(routeParam(context, "eventId"));
    if (data === null) {
      return errorResponse(context, 404, "NOT_FOUND", "A published agenda was not found.");
    }
    return context.json({ data });
  });

  routes.post("/rollback", async (context) => {
    const principal = await organizerForEvent(context, dependencies);
    const input = await body(context, rollbackSchema);
    const data = await dependencies.engine.rollback({
      eventId: routeParam(context, "eventId"),
      actorId: principal.userId,
      ...input,
    });
    return context.json({ data });
  });

  routes.onError((error, context) => {
    if (error instanceof ZodError) {
      return errorResponse(
        context,
        400,
        "VALIDATION_FAILED",
        "The agenda request is invalid.",
        zodDetails(error),
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
    if (error instanceof AgendaError) {
      return agendaErrorResponse(context, error);
    }
    throw error;
  });

  return routes;
}
function publishedAgendaView(
  revision: NonNullable<Awaited<ReturnType<AgendaEngine["getPublishedAgenda"]>>>,
) {
  return {
    revisionId: revision.id,
    eventId: revision.eventId,
    revisionNumber: revision.revisionNumber,
    sourceDraftVersion: revision.sourceDraftVersion,
    timeZone: revision.timeZone,
    entries: revision.entries,
    publishedAt: revision.publishedAt,
  };
}

/** Public route exposes only the immutable current publication, never a draft. */
export function createPublishedAgendaRoutes(
  dependencies: Pick<AgendaRouteDependencies, "engine">,
): Hono<AgendaRouteEnvironment> {
  const routes = new Hono<AgendaRouteEnvironment>();
  routes.get("/", async (context) => {
    const data = await dependencies.engine.getPublishedAgenda(routeParam(context, "eventId"));
    if (data === null) {
      return errorResponse(context, 404, "NOT_FOUND", "A published agenda was not found.");
    }
    context.header("cache-control", "public, max-age=60, stale-while-revalidate=30");
    return context.json({ data: publishedAgendaView(data) });
  });
  routes.onError((error, context) => {
    if (error instanceof AgendaError) {
      return agendaErrorResponse(context, error);
    }
    throw error;
  });
  return routes;
}
