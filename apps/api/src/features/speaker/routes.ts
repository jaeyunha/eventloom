import { type Context, Hono } from "hono";
import { z } from "zod";
import { type SpeakerService, SpeakerServiceError } from "./service";
import { speakerTaskStatuses } from "./types";

interface SpeakerRouteEnvironment {
  Variables: {
    speakerAccountId: string;
    speakerTraceId: string;
  };
}

export interface SpeakerRouteDependencies {
  service: SpeakerService;
  authenticate(request: Request): Promise<{ accountId: string } | null>;
}

const updateBiographySchema = z.object({
  biography: z.string(),
  expectedVersion: z.number().int().nonnegative(),
});

const transitionTaskSchema = z.object({
  toStatus: z.enum(speakerTaskStatuses),
  expectedVersion: z.number().int().nonnegative(),
  note: z.string().optional(),
});

const uploadSchema = z.object({
  participantId: z.string().trim().min(1),
  taskId: z.string().trim().min(1).optional(),
  kind: z.enum(["headshot", "slides", "supporting_file"]),
  fileName: z.string(),
  contentType: z.string().trim().min(1),
  sizeBytes: z.number().int().positive(),
});

function traceIdFor(request: Request): string {
  const incoming = request.headers.get("x-request-id");
  return incoming &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(incoming)
    ? incoming
    : crypto.randomUUID();
}

function errorBody(context: Context<SpeakerRouteEnvironment>, code: string, message: string) {
  return {
    error: {
      code,
      message,
      traceId: context.get("speakerTraceId"),
    },
  };
}

async function parseBody<T>(
  context: Context<SpeakerRouteEnvironment>,
  schema: z.ZodType<T>,
): Promise<T | null> {
  const body = await context.req.json().catch(() => undefined);
  const parsed = schema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

export function createSpeakerRoutes(dependencies: SpeakerRouteDependencies) {
  const app = new Hono<SpeakerRouteEnvironment>();

  app.use("*", async (context, next) => {
    const traceId = traceIdFor(context.req.raw);
    context.set("speakerTraceId", traceId);
    context.header("cache-control", "private, no-store");
    context.header("x-request-id", traceId);
    context.header("x-content-type-options", "nosniff");

    const actor = await dependencies.authenticate(context.req.raw);
    if (!actor?.accountId) {
      return context.json(
        errorBody(context, "AUTHENTICATION_REQUIRED", "Authentication is required."),
        401,
      );
    }
    context.set("speakerAccountId", actor.accountId);
    await next();
  });

  app.get("/events/:eventId/portal", async (context) => {
    const data = await dependencies.service.getPortal(
      context.req.param("eventId"),
      context.get("speakerAccountId"),
    );
    return context.json({ data });
  });

  app.get("/events/:eventId/submissions", async (context) => {
    const data = await dependencies.service.listSubmissions(
      context.req.param("eventId"),
      context.get("speakerAccountId"),
    );
    return context.json({ data });
  });

  app.get("/events/:eventId/profiles", async (context) => {
    const data = await dependencies.service.listProfiles(
      context.req.param("eventId"),
      context.get("speakerAccountId"),
    );
    return context.json({ data });
  });

  app.patch("/events/:eventId/profiles/:participantId", async (context) => {
    const body = await parseBody(context, updateBiographySchema);
    if (!body) {
      return context.json(
        errorBody(context, "VALIDATION_ERROR", "The profile update payload is invalid."),
        400,
      );
    }
    const data = await dependencies.service.updateBiography({
      eventId: context.req.param("eventId"),
      accountId: context.get("speakerAccountId"),
      participantId: context.req.param("participantId"),
      biography: body.biography,
      expectedVersion: body.expectedVersion,
    });
    return context.json({ data });
  });

  app.get("/events/:eventId/tasks", async (context) => {
    const data = await dependencies.service.listTasks(
      context.req.param("eventId"),
      context.get("speakerAccountId"),
    );
    return context.json({ data });
  });

  app.post("/events/:eventId/tasks/:taskId/transitions", async (context) => {
    const body = await parseBody(context, transitionTaskSchema);
    if (!body) {
      return context.json(
        errorBody(context, "VALIDATION_ERROR", "The task transition payload is invalid."),
        400,
      );
    }
    const data = await dependencies.service.transitionTask({
      eventId: context.req.param("eventId"),
      accountId: context.get("speakerAccountId"),
      taskId: context.req.param("taskId"),
      toStatus: body.toStatus,
      expectedVersion: body.expectedVersion,
      ...(body.note === undefined ? {} : { note: body.note }),
    });
    return context.json({ data });
  });

  app.post("/events/:eventId/uploads", async (context) => {
    const body = await parseBody(context, uploadSchema);
    if (!body) {
      return context.json(
        errorBody(context, "VALIDATION_ERROR", "The upload authorization payload is invalid."),
        400,
      );
    }
    const data = await dependencies.service.issueUploadGrant({
      eventId: context.req.param("eventId"),
      accountId: context.get("speakerAccountId"),
      participantId: body.participantId,
      kind: body.kind,
      fileName: body.fileName,
      contentType: body.contentType,
      sizeBytes: body.sizeBytes,
      ...(body.taskId === undefined ? {} : { taskId: body.taskId }),
    });
    return context.json({ data }, 201);
  });

  app.post("/events/:eventId/assets/:assetId/download", async (context) => {
    const data = await dependencies.service.issueDownloadGrant({
      eventId: context.req.param("eventId"),
      accountId: context.get("speakerAccountId"),
      assetId: context.req.param("assetId"),
    });
    return context.json({ data });
  });

  app.onError((error, context) => {
    if (error instanceof SpeakerServiceError) {
      return context.json(errorBody(context, error.code, error.message), error.status);
    }
    console.error(
      JSON.stringify({
        level: "error",
        event: "speaker_request_failed",
        traceId: context.get("speakerTraceId"),
        errorName: error.name,
      }),
    );
    return context.json(
      errorBody(context, "INTERNAL_ERROR", "The speaker request could not be completed."),
      500,
    );
  });

  return app;
}
