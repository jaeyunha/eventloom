import {
  type ApiError,
  apiErrorSchema,
  type HealthResponse,
  healthResponseSchema,
} from "@open-sessionboard/contracts";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { parseApiEnvironment } from "./env";

export interface ApiBindings {
  APP_ENV: string;
  WEB_ORIGIN: string;
}

type ApiVariables = {
  traceId: string;
};

type ApiContext = {
  Bindings: ApiBindings;
  Variables: ApiVariables;
};

const requestIdSchema = z.uuid();

function createError(traceId: string, code: string, message: string): ApiError {
  return apiErrorSchema.parse({
    error: { code, message, traceId },
  });
}

export function createApp() {
  const app = new Hono<ApiContext>();

  app.use("*", async (context, next) => {
    const incomingRequestId = requestIdSchema.safeParse(context.req.header("x-request-id"));
    const traceId = incomingRequestId.success ? incomingRequestId.data : crypto.randomUUID();

    context.set("traceId", traceId);
    await next();

    context.header("x-content-type-options", "nosniff");
    context.header("x-request-id", traceId);
  });

  app.use(
    "*",
    cors({
      origin: (origin, context) => (origin === context.env.WEB_ORIGIN ? origin : ""),
      allowHeaders: ["Content-Type", "X-Request-ID"],
      allowMethods: ["GET", "OPTIONS"],
      credentials: true,
      maxAge: 600,
    }),
  );

  app.get("/api/health", (context) => {
    const environment = parseApiEnvironment(context.env);
    const traceId = context.get("traceId");

    if (!environment.success) {
      return context.json(
        createError(traceId, "CONFIGURATION_ERROR", "The API environment is not configured."),
        503,
      );
    }

    const response: HealthResponse = {
      status: "ok",
      service: "api",
      version: "0.1.0",
      environment: environment.data.APP_ENV,
      timestamp: new Date().toISOString(),
      traceId,
    };

    context.header("cache-control", "no-store");
    return context.json(healthResponseSchema.parse(response));
  });

  app.notFound((context) =>
    context.json(
      createError(context.get("traceId"), "NOT_FOUND", "The requested resource was not found."),
      404,
    ),
  );

  app.onError((error, context) => {
    const traceId = context.get("traceId") ?? crypto.randomUUID();
    console.error(
      JSON.stringify({
        level: "error",
        event: "request_failed",
        traceId,
        method: context.req.method,
        path: context.req.path,
        errorName: error.name,
      }),
    );

    return context.json(
      createError(traceId, "INTERNAL_ERROR", "The request could not be completed."),
      500,
    );
  });

  return app;
}
