import { apiErrorSchema } from "@open-sessionboard/contracts";
import { type Context, Hono } from "hono";
import { ZodError, z } from "zod";
import { type AgendaEngine, AgendaError, AgendaValidationError } from "../features/agenda/engine";
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
      return errorResponse(
        context,
        404,
        "NOT_FOUND",
        "The requested agenda resource was not found.",
      );
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
    return context.json({
      data: await dependencies.engine.getDraft(routeParam(context, "eventId")),
    });
  });

  routes.get("/preview", async (context) => {
    await organizerForEvent(context, dependencies);
    return context.json({
      data: await dependencies.engine.preview(routeParam(context, "eventId")),
    });
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
type PublishedAgendaRevision = NonNullable<Awaited<ReturnType<AgendaEngine["getPublishedAgenda"]>>>;
type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function textValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

function firstTextValue(
  sources: readonly (JsonRecord | null)[],
  keys: readonly string[],
): string | null {
  for (const source of sources) {
    if (source === null) continue;
    for (const key of keys) {
      const value = textValue(source[key]);
      if (value !== null) return value;
    }
  }
  return null;
}

function stringArrayValue(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  const values: string[] = [];
  for (const item of value) {
    const normalized = textValue(item);
    if (normalized === null) return null;
    values.push(normalized);
  }
  return values;
}

function firstStringArrayValue(
  sources: readonly (JsonRecord | null)[],
  keys: readonly string[],
): readonly string[] | null {
  for (const source of sources) {
    if (source === null) continue;
    for (const key of keys) {
      const value = stringArrayValue(source[key]);
      if (value !== null) return value;
    }
  }
  return null;
}

function humanizeIdentifier(value: string): string {
  const words = value
    .trim()
    .split(/[-_.\s]+/u)
    .filter((word) => word.length > 0)
    .map((word) => word.toLowerCase());
  if (words.length === 0) return "Unknown";
  return words.map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`).join(" ");
}

function dateValue(value: unknown): string | null {
  const normalized = textValue(value);
  if (normalized === null) return null;
  const datePrefix = /^(\d{4}-\d{2}-\d{2})/u.exec(normalized)?.[1];
  if (datePrefix !== undefined) {
    const [year, month, day] = datePrefix.split("-").map(Number);
    const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 0));
    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === (month ?? 1) - 1 &&
      date.getUTCDate() === day
    ) {
      return datePrefix;
    }
    return null;
  }
  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString().slice(0, 10);
}

function entryDate(
  entries: readonly { readonly startsAt: unknown; readonly endsAt: unknown }[],
  field: "startsAt" | "endsAt",
  direction: "first" | "last",
): string | null {
  const dates = entries
    .map((entry) => dateValue(entry[field]))
    .filter((date): date is string => date !== null)
    .sort((left, right) => left.localeCompare(right));
  return direction === "first" ? (dates[0] ?? null) : (dates.at(-1) ?? null);
}

function entryMetadataSources(entry: PublishedAgendaRevision["entries"][number]): JsonRecord[] {
  const record = asRecord(entry);
  return record === null ? [] : [record, asRecord(record.metadata)].filter(isRecord);
}

function isRecord(value: JsonRecord | null): value is JsonRecord {
  return value !== null;
}

function eventMetadataSources(revision: PublishedAgendaRevision): JsonRecord[] {
  const record = asRecord(revision);
  if (record === null) return [];
  const metadata = asRecord(record.metadata);
  return [
    asRecord(record.event),
    asRecord(record.eventMetadata),
    asRecord(record.publicEvent),
    asRecord(metadata?.event),
    asRecord(metadata?.eventMetadata),
    asRecord(metadata?.publicEvent),
    metadata,
    record,
  ].filter(isRecord);
}

function publishedEntryView(entry: PublishedAgendaRevision["entries"][number]) {
  const metadata = entryMetadataSources(entry);
  const speakerNames = firstStringArrayValue(metadata, ["speakerNames"]) ?? [];
  const trackNames =
    firstStringArrayValue(metadata, ["trackNames"]) ??
    entry.trackIds.map((trackId) => humanizeIdentifier(trackId));
  return {
    id: entry.id,
    title: firstTextValue(metadata, ["title"]) ?? humanizeIdentifier(entry.sessionId),
    summary: firstTextValue(metadata, ["summary"]) ?? "",
    format: firstTextValue(metadata, ["format"]) ?? "Session",
    speakerNames,
    roomName: firstTextValue(metadata, ["roomName"]) ?? humanizeIdentifier(entry.roomId),
    trackNames,
    startsAt: entry.startsAt,
    endsAt: entry.endsAt,
  };
}

function publishedAgendaView(revision: PublishedAgendaRevision) {
  const eventMetadata = eventMetadataSources(revision);
  const entries = revision.entries.map(publishedEntryView);
  const publishedDate = dateValue(revision.publishedAt);
  return {
    event: {
      slug: firstTextValue(eventMetadata, ["slug", "eventSlug"]) ?? revision.eventId,
      name:
        firstTextValue(eventMetadata, ["name", "eventName"]) ??
        humanizeIdentifier(revision.eventId),
      timeZone:
        firstTextValue(eventMetadata, ["timeZone", "eventTimeZone"]) ??
        textValue(revision.timeZone) ??
        "UTC",
      startsOn:
        dateValue(firstTextValue(eventMetadata, ["startsOn", "eventStartsOn"])) ??
        entryDate(entries, "startsAt", "first") ??
        publishedDate ??
        "",
      endsOn:
        dateValue(firstTextValue(eventMetadata, ["endsOn", "eventEndsOn"])) ??
        entryDate(entries, "endsAt", "last") ??
        publishedDate ??
        "",
      venueName: firstTextValue(eventMetadata, ["venueName", "eventVenueName"]),
    },
    revision: {
      id: revision.id,
      number: revision.revisionNumber,
      publishedAt: revision.publishedAt,
    },
    entries,
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
