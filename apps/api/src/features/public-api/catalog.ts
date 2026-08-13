import { type Context, Hono } from "hono";
import { z } from "zod";
import type { AuthPrincipal } from "../auth/types";
import type { Event, EventRepository } from "../events/types";
import type { Session, SessionRepository } from "../sessions/types";
import type { SpeakerRepository, SpeakerRosterEntry } from "../speaker/types";
import { CursorError, type CursorPayload, decodeCursor, encodeCursor } from "./cursor";
import { internalError, PublicApiError, publicApiErrorResponse, validationError } from "./errors";
import { authorizePublicApiPrincipal } from "./routes";

type PublicCatalogEnvironment = {
  Variables: {
    authPrincipal?: AuthPrincipal;
    traceId?: string;
  };
};

export interface PublicCatalogDependencies {
  readonly eventRepository: Pick<EventRepository, "getEvent" | "listEvents">;
  readonly sessionRepository: Pick<SessionRepository, "getSession" | "listSessions">;
  readonly speakerRepository: Pick<SpeakerRepository, "listRosterForEvent">;
}

const publicCatalogPaths = {
  "/api/v1/organizations/{organizationId}/events": {},
  "/api/v1/organizations/{organizationId}/events/{eventId}": {},
  "/api/v1/organizations/{organizationId}/events/{eventId}/sessions": {},
  "/api/v1/organizations/{organizationId}/events/{eventId}/sessions/{sessionId}": {},
  "/api/v1/organizations/{organizationId}/events/{eventId}/speakers": {},
  "/api/v1/organizations/{organizationId}/events/{eventId}/speakers/{speakerId}": {},
} as const;

export function publicCatalogOpenApiPaths(): Readonly<Record<string, unknown>> {
  const identifier = { type: "string", minLength: 1, maxLength: 200 };
  const pathParameter = (name: string) => ({
    name,
    in: "path",
    required: true,
    schema: identifier,
  });
  const listParameters = [
    {
      name: "cursor",
      in: "query",
      required: false,
      description: "Opaque cursor returned by the previous page.",
      schema: { type: "string", minLength: 1, maxLength: 2048 },
    },
    {
      name: "limit",
      in: "query",
      required: false,
      schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
    },
  ];
  const errorResponses = {
    "400": { description: "The request or cursor is invalid." },
    "401": { description: "Authentication is required." },
    "403": { description: "The API key has the wrong tenant or scope." },
    "404": { description: "The resource does not exist or is withheld." },
    "429": { description: "The organization rate limit was exceeded." },
    "500": { description: "The request could not be completed." },
  };
  const recordSchemas = {
    PublicEvent: {
      type: "object",
      required: [
        "id",
        "slug",
        "name",
        "status",
        "timeZone",
        "startsAt",
        "endsAt",
        "venue",
        "updatedAt",
      ],
      properties: {
        id: identifier,
        slug: { type: "string" },
        name: { type: "string" },
        status: { type: "string" },
        timeZone: { type: "string" },
        startsAt: { type: "string", format: "date-time" },
        endsAt: { type: "string", format: "date-time" },
        venue: { type: ["string", "null"] },
        updatedAt: { type: "string", format: "date-time" },
      },
      additionalProperties: false,
    },
    PublicSession: {
      type: "object",
      required: [
        "id",
        "eventId",
        "title",
        "description",
        "status",
        "durationMinutes",
        "capacityRequired",
        "trackIds",
        "tagIds",
        "speakerIds",
        "updatedAt",
      ],
      properties: {
        id: identifier,
        eventId: identifier,
        title: { type: "string" },
        description: { type: "string" },
        status: { type: "string", const: "Accepted" },
        durationMinutes: { type: "integer", minimum: 1 },
        capacityRequired: { type: "integer", minimum: 0 },
        roomId: identifier,
        trackIds: { type: "array", items: identifier },
        formatId: identifier,
        levelId: identifier,
        tagIds: { type: "array", items: identifier },
        speakerIds: { type: "array", items: identifier },
        updatedAt: { type: "string", format: "date-time" },
      },
      additionalProperties: false,
    },
    PublicSpeaker: {
      type: "object",
      required: ["id", "eventId", "displayName", "role", "updatedAt"],
      properties: {
        id: identifier,
        eventId: identifier,
        displayName: { type: "string" },
        jobTitle: { type: "string" },
        company: { type: "string" },
        biography: { type: "string" },
        socialLinks: { type: "object", additionalProperties: { type: "string" } },
        headshotAssetId: identifier,
        role: { type: "string", enum: ["primary", "co_speaker"] },
        updatedAt: { type: "string", format: "date-time" },
      },
      additionalProperties: false,
    },
  } as const;
  const operation = (
    operationId: string,
    summary: string,
    scope: string,
    schema: string,
    parameters: readonly unknown[],
    list = false,
  ) => ({
    operationId,
    summary,
    security: [{ apiKey: [scope] }],
    parameters,
    responses: {
      "200": {
        description: summary,
        content: {
          "application/json": {
            schema: list
              ? {
                  type: "object",
                  required: ["data", "page"],
                  properties: {
                    data: {
                      type: "array",
                      items: recordSchemas[schema as keyof typeof recordSchemas],
                    },
                    page: {
                      type: "object",
                      required: ["nextCursor", "hasMore"],
                      properties: {
                        nextCursor: { type: ["string", "null"] },
                        hasMore: { type: "boolean" },
                      },
                      additionalProperties: false,
                    },
                  },
                  additionalProperties: false,
                }
              : {
                  type: "object",
                  required: ["data"],
                  properties: {
                    data: recordSchemas[schema as keyof typeof recordSchemas],
                  },
                  additionalProperties: false,
                },
          },
        },
      },
      ...errorResponses,
    },
  });
  const organization = pathParameter("organizationId");
  const event = pathParameter("eventId");
  const session = pathParameter("sessionId");
  const speaker = pathParameter("speakerId");
  return {
    ...publicCatalogPaths,
    "/api/v1/organizations/{organizationId}/events": {
      get: operation(
        "listPublicEvents",
        "List organization events",
        "events:read",
        "PublicEvent",
        [organization, ...listParameters],
        true,
      ),
    },
    "/api/v1/organizations/{organizationId}/events/{eventId}": {
      get: operation("getPublicEvent", "Get an organization event", "events:read", "PublicEvent", [
        organization,
        event,
      ]),
    },
    "/api/v1/organizations/{organizationId}/events/{eventId}/sessions": {
      get: operation(
        "listPublicSessions",
        "List accepted event sessions",
        "sessions:read",
        "PublicSession",
        [organization, event, ...listParameters],
        true,
      ),
    },
    "/api/v1/organizations/{organizationId}/events/{eventId}/sessions/{sessionId}": {
      get: operation(
        "getPublicSession",
        "Get an accepted event session",
        "sessions:read",
        "PublicSession",
        [organization, event, session],
      ),
    },
    "/api/v1/organizations/{organizationId}/events/{eventId}/speakers": {
      get: operation(
        "listPublicSpeakers",
        "List active event speakers",
        "speakers:read",
        "PublicSpeaker",
        [organization, event, ...listParameters],
        true,
      ),
    },
    "/api/v1/organizations/{organizationId}/events/{eventId}/speakers/{speakerId}": {
      get: operation(
        "getPublicSpeaker",
        "Get an active event speaker",
        "speakers:read",
        "PublicSpeaker",
        [organization, event, speaker],
      ),
    },
  };
}

const listQuerySchema = z
  .object({
    cursor: z.string().trim().min(1).max(2048).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

interface PageInput {
  readonly organizationId: string;
  readonly resource: string;
  readonly limit: number;
  readonly cursor?: string;
}

function page<T extends { readonly id: string }>(
  records: readonly T[],
  input: PageInput,
): {
  readonly data: readonly T[];
  readonly page: { readonly nextCursor: string | null; readonly hasMore: boolean };
} {
  const sorted = [...records].sort((left, right) => left.id.localeCompare(right.id));
  let start = 0;
  if (input.cursor !== undefined) {
    let cursor: CursorPayload;
    try {
      cursor = decodeCursor(input.cursor);
    } catch (error) {
      if (error instanceof CursorError) throw validationError("The cursor is invalid.");
      throw error;
    }
    if (
      cursor.organizationId !== input.organizationId ||
      cursor.resource !== input.resource ||
      cursor.sort !== "id" ||
      cursor.direction !== "asc"
    ) {
      throw validationError("The cursor is invalid.");
    }
    const cursorId = cursor.id;
    start = sorted.findIndex((record) => record.id > cursorId);
    if (start < 0) start = sorted.length;
  }
  const data = sorted.slice(start, start + input.limit);
  const hasMore = start + data.length < sorted.length;
  const last = data.at(-1);
  return {
    data,
    page: {
      hasMore,
      nextCursor:
        hasMore && last !== undefined
          ? encodeCursor({
              organizationId: input.organizationId,
              resource: input.resource,
              sort: "id",
              direction: "asc",
              values: [last.id],
              id: last.id,
            })
          : null,
    },
  };
}

function eventProjection(event: Event) {
  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    status: event.status,
    timeZone: event.timeZone,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    venue: event.venue,
    updatedAt: event.updatedAt,
  };
}

function sessionProjection(session: Session) {
  return {
    id: session.id,
    eventId: session.eventId,
    title: session.title,
    description: session.description,
    status: session.status,
    durationMinutes: session.durationMinutes,
    capacityRequired: session.capacityRequired,
    ...(session.roomId === undefined ? {} : { roomId: session.roomId }),
    trackIds: session.trackIds,
    ...(session.formatId === undefined ? {} : { formatId: session.formatId }),
    ...(session.levelId === undefined ? {} : { levelId: session.levelId }),
    tagIds: session.tagIds,
    speakerIds: session.speakerIds,
    updatedAt: session.updatedAt,
  };
}

function speakerProjection(speaker: SpeakerRosterEntry) {
  return {
    id: speaker.participantId,
    eventId: speaker.eventId,
    displayName: speaker.displayName,
    ...(speaker.jobTitle === undefined ? {} : { jobTitle: speaker.jobTitle }),
    ...(speaker.company === undefined ? {} : { company: speaker.company }),
    ...(speaker.biography === undefined ? {} : { biography: speaker.biography }),
    ...(speaker.socialLinks === undefined ? {} : { socialLinks: speaker.socialLinks }),
    ...(speaker.headshotAssetId === undefined ? {} : { headshotAssetId: speaker.headshotAssetId }),
    role: speaker.role,
    updatedAt: speaker.updatedAt,
  };
}

function principalFor(
  context: Context<PublicCatalogEnvironment>,
  organizationId: string,
  resource: "events" | "sessions" | "speakers",
) {
  const scope = `${resource}:read` as const;
  return authorizePublicApiPrincipal(
    context.get("authPrincipal"),
    organizationId,
    "read",
    resource,
    scope,
  );
}

function queryFor(context: Context<PublicCatalogEnvironment>) {
  const result = listQuerySchema.safeParse(context.req.query());
  if (!result.success) throw validationError("The pagination parameters are invalid.");
  return result.data;
}

function notFound(resource: string): PublicApiError {
  return new PublicApiError("NOT_FOUND", `${resource} was not found.`);
}

function handleError(context: Context<PublicCatalogEnvironment>, error: unknown): Response {
  return publicApiErrorResponse(context, error instanceof PublicApiError ? error : internalError());
}

export function createPublicCatalogRoutes(dependencies: PublicCatalogDependencies) {
  const routes = new Hono<PublicCatalogEnvironment>();

  routes.get("/organizations/:organizationId/events", async (context) => {
    try {
      const organizationId = context.req.param("organizationId");
      principalFor(context, organizationId, "events");
      const query = queryFor(context);
      const events = await dependencies.eventRepository.listEvents(organizationId);
      return context.json(
        page(events.map(eventProjection), {
          organizationId,
          resource: "events",
          limit: query.limit,
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        }),
      );
    } catch (error) {
      return handleError(context, error);
    }
  });

  routes.get("/organizations/:organizationId/events/:eventId", async (context) => {
    try {
      const organizationId = context.req.param("organizationId");
      principalFor(context, organizationId, "events");
      const event = await dependencies.eventRepository.getEvent(
        organizationId,
        context.req.param("eventId"),
      );
      if (event === null) throw notFound("Event");
      return context.json({ data: eventProjection(event) });
    } catch (error) {
      return handleError(context, error);
    }
  });

  routes.get("/organizations/:organizationId/events/:eventId/sessions", async (context) => {
    try {
      const organizationId = context.req.param("organizationId");
      const eventId = context.req.param("eventId");
      principalFor(context, organizationId, "sessions");
      if ((await dependencies.eventRepository.getEvent(organizationId, eventId)) === null) {
        throw notFound("Event");
      }
      const query = queryFor(context);
      const sessions = (await dependencies.sessionRepository.listSessions(organizationId, eventId))
        .filter((session) => session.status === "Accepted")
        .map(sessionProjection);
      return context.json(
        page(sessions, {
          organizationId,
          resource: `events/${eventId}/sessions`,
          limit: query.limit,
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        }),
      );
    } catch (error) {
      return handleError(context, error);
    }
  });

  routes.get(
    "/organizations/:organizationId/events/:eventId/sessions/:sessionId",
    async (context) => {
      try {
        const organizationId = context.req.param("organizationId");
        const eventId = context.req.param("eventId");
        principalFor(context, organizationId, "sessions");
        if ((await dependencies.eventRepository.getEvent(organizationId, eventId)) === null) {
          throw notFound("Event");
        }
        const session = await dependencies.sessionRepository.getSession(
          organizationId,
          eventId,
          context.req.param("sessionId"),
        );
        if (session === null || session.status !== "Accepted") throw notFound("Session");
        return context.json({ data: sessionProjection(session) });
      } catch (error) {
        return handleError(context, error);
      }
    },
  );

  routes.get("/organizations/:organizationId/events/:eventId/speakers", async (context) => {
    try {
      const organizationId = context.req.param("organizationId");
      const eventId = context.req.param("eventId");
      principalFor(context, organizationId, "speakers");
      if ((await dependencies.eventRepository.getEvent(organizationId, eventId)) === null) {
        throw notFound("Event");
      }
      const query = queryFor(context);
      const roster = await dependencies.speakerRepository.listRosterForEvent?.(eventId);
      const speakers = (roster ?? [])
        .filter((speaker) => speaker.status === "active")
        .map(speakerProjection);
      return context.json(
        page(speakers, {
          organizationId,
          resource: `events/${eventId}/speakers`,
          limit: query.limit,
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        }),
      );
    } catch (error) {
      return handleError(context, error);
    }
  });

  routes.get(
    "/organizations/:organizationId/events/:eventId/speakers/:speakerId",
    async (context) => {
      try {
        const organizationId = context.req.param("organizationId");
        const eventId = context.req.param("eventId");
        principalFor(context, organizationId, "speakers");
        if ((await dependencies.eventRepository.getEvent(organizationId, eventId)) === null) {
          throw notFound("Event");
        }
        const roster = await dependencies.speakerRepository.listRosterForEvent?.(eventId);
        const speaker = (roster ?? []).find(
          (candidate) =>
            candidate.status === "active" &&
            candidate.participantId === context.req.param("speakerId"),
        );
        if (speaker === undefined) throw notFound("Speaker");
        return context.json({ data: speakerProjection(speaker) });
      } catch (error) {
        return handleError(context, error);
      }
    },
  );

  return routes;
}
