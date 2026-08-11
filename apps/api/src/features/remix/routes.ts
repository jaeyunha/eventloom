import { Hono } from "hono";
import { ZodError, z } from "zod";
import { RemixError, type RemixService } from "./service";
import type { RemixActor, RemixCandidateFilter, RemixField, RemixSourceType } from "./types";

export interface RemixRouteEnvironment {
  Variables: {
    remixActor: RemixActor;
  };
}

const sourceTypeSchema = z.enum(["session", "speaker"]);
const fieldSchema = z.enum(["title", "description", "tags", "tracks", "biography"]);
const candidateFilterSchema = z.object({
  status: z.enum(["pending", "applied", "rejected", "stale"]).optional(),
  sourceType: sourceTypeSchema.optional(),
  sourceId: z.string().optional(),
});
const generateSchema = z
  .object({
    sourceType: sourceTypeSchema,
    sourceIds: z.array(z.string()).min(1).max(100),
    fields: z.array(fieldSchema).min(1).max(4),
    tone: z.string().min(1).max(120),
    guidance: z.string().max(2_000).optional(),
  })
  .strict();
const regenerateSchema = z
  .object({
    tone: z.string().min(1).max(120).optional(),
    guidance: z.string().max(2_000).optional(),
  })
  .strict();
const rejectSchema = z
  .object({
    reason: z.string().max(2_000).optional(),
  })
  .strict();
const applySchema = z
  .object({
    expectedVersion: z.number().int().positive().optional(),
    content: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

function actor(context: { get(name: "remixActor"): RemixActor }): RemixActor {
  const current = context.get("remixActor");
  if (current === undefined) {
    throw new RemixError("REMIX_FORBIDDEN", "Remix authentication is required.", 403);
  }
  return current;
}

function parseSourceType(value: string | undefined): RemixSourceType {
  const parsed = sourceTypeSchema.safeParse(value);
  if (!parsed.success) {
    throw new RemixError("REMIX_INVALID_INPUT", "A valid source type is required.", 400);
  }
  return parsed.data;
}

function parseFilter(context: { req: { query(name: string): string | undefined } }): {
  ids?: readonly string[];
  query?: string;
  tags?: readonly string[];
  tracks?: readonly string[];
} {
  const ids = splitQuery(context.req.query("ids"));
  const tags = splitQuery(context.req.query("tags"));
  const tracks = splitQuery(context.req.query("tracks"));
  const query = context.req.query("query");
  return {
    ...(ids.length === 0 ? {} : { ids }),
    ...(query === undefined ? {} : { query }),
    ...(tags.length === 0 ? {} : { tags }),
    ...(tracks.length === 0 ? {} : { tracks }),
  };
}

function splitQuery(value: string | undefined): readonly string[] {
  if (value === undefined || value.trim() === "") return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function createRemixRoutes(service: RemixService): Hono<RemixRouteEnvironment> {
  const routes = new Hono<RemixRouteEnvironment>();

  routes.get("/events/:eventId/records", async (context) => {
    const sourceType = parseSourceType(context.req.query("sourceType"));
    return context.json({
      records: await service.listRecords(actor(context), context.req.param("eventId"), {
        sourceType,
        filter: parseFilter(context),
      }),
    });
  });

  routes.post("/events/:eventId/candidates", async (context) => {
    const body = generateSchema.parse(await context.req.json());
    const candidates = await service.generate(actor(context), {
      eventId: context.req.param("eventId"),
      sourceType: body.sourceType,
      sourceIds: body.sourceIds,
      fields: body.fields as readonly RemixField[],
      tone: body.tone,
      ...(body.guidance === undefined ? {} : { guidance: body.guidance }),
    });
    return context.json({ candidates }, 201);
  });

  routes.get("/events/:eventId/candidates", async (context) => {
    const parsed = candidateFilterSchema.safeParse({
      status: context.req.query("status"),
      sourceType: context.req.query("sourceType"),
      sourceId: context.req.query("sourceId"),
    });
    if (!parsed.success) {
      throw new RemixError("REMIX_INVALID_INPUT", "The candidate filter is invalid.", 400);
    }
    const filter: RemixCandidateFilter = {};
    if (parsed.data.status !== undefined) filter.status = parsed.data.status;
    if (parsed.data.sourceType !== undefined) filter.sourceType = parsed.data.sourceType;
    if (parsed.data.sourceId !== undefined) filter.sourceId = parsed.data.sourceId;
    return context.json({
      candidates: await service.listCandidates(
        actor(context),
        context.req.param("eventId"),
        filter,
      ),
    });
  });

  routes.get("/events/:eventId/candidates/:candidateId", async (context) =>
    context.json(
      await service.getCandidate(
        actor(context),
        context.req.param("eventId"),
        context.req.param("candidateId"),
      ),
    ),
  );

  routes.get("/events/:eventId/audit", async (context) =>
    context.json({
      audit: await service.listAudit(actor(context), context.req.param("eventId")),
    }),
  );

  routes.post("/events/:eventId/candidates/:candidateId/regenerate", async (context) => {
    const body = regenerateSchema.parse(await context.req.json());
    return context.json(
      await service.regenerate(actor(context), {
        eventId: context.req.param("eventId"),
        candidateId: context.req.param("candidateId"),
        ...(body.tone === undefined ? {} : { tone: body.tone }),
        ...(body.guidance === undefined ? {} : { guidance: body.guidance }),
      }),
      201,
    );
  });

  routes.post("/events/:eventId/candidates/:candidateId/reject", async (context) => {
    const body = rejectSchema.parse(await context.req.json());
    return context.json(
      await service.reject(actor(context), {
        eventId: context.req.param("eventId"),
        candidateId: context.req.param("candidateId"),
        ...(body.reason === undefined ? {} : { reason: body.reason }),
      }),
    );
  });

  routes.post("/events/:eventId/candidates/:candidateId/apply", async (context) => {
    const body = applySchema.parse(await context.req.json());
    return context.json(
      await service.apply(actor(context), {
        eventId: context.req.param("eventId"),
        candidateId: context.req.param("candidateId"),
        ...(body.expectedVersion === undefined ? {} : { expectedVersion: body.expectedVersion }),
        ...(body.content === undefined ? {} : { content: body.content }),
      }),
    );
  });

  routes.onError((error, context) => {
    if (error instanceof ZodError) {
      return context.json(
        {
          error: {
            code: "REMIX_INVALID_INPUT",
            message: "The remix request is invalid.",
          },
        },
        400,
      );
    }
    if (error instanceof RemixError) {
      return context.json({ error: { code: error.code, message: error.message } }, error.status);
    }
    throw error;
  });

  return routes;
}
