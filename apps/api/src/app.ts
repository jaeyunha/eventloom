import {
  type ApiError,
  type ApiErrorCode,
  apiErrorCodes,
  apiErrorSchema,
  type HealthResponse,
  healthResponseSchema,
} from "@open-sessionboard/contracts";
import { type Context, Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import type { EvaluationService } from "./features/evaluations/service";
import type { EvaluationActor } from "./features/evaluations/types";
import { createEvaluationRoutes } from "./features/evaluations/routes";
import type { RequestAuthenticator } from "./features/auth/authenticator";
import { AuthAccessError, type AuthPrincipal } from "./features/auth/types";
import {
  createPublicApiV1Routes,
  type PublicApiRoutesOptions,
} from "./features/public-api/routes";
import {
  createSpeakerRoutes,
  type SpeakerRouteDependencies,
} from "./features/speaker/routes";
import { parseApiEnvironment } from "./env";
import {
  createWebhookSubscriptionRoutes,
} from "./integrations/webhooks/routes";
import type { WebhookSubscriptionRepository } from "./integrations/webhooks/types";
import {
  createAgendaAdminRoutes,
  createPublishedAgendaRoutes,
  type AgendaRouteDependencies,
} from "./routes/agenda";

export interface ApiBindings {
  APP_ENV: string;
  WEB_ORIGIN: string;
}

type ApiVariables = {
  traceId: string;
  authPrincipal: AuthPrincipal | null;
  evaluationActor: EvaluationActor;
};

type ApiContext = {
  Bindings: ApiBindings;
  Variables: ApiVariables;
};

export interface EvaluationRouteDependencies {
  readonly service: EvaluationService;
  readonly actorFor: (
    principal: AuthPrincipal,
    request: Request,
  ) => EvaluationActor | null | Promise<EvaluationActor | null>;
}

export interface ApiDependencies<
  TRecord = Record<string, unknown>,
  TCreate = Record<string, unknown>,
  TUpdate = Record<string, unknown>,
> {
  readonly authenticator?: Pick<RequestAuthenticator, "authenticate">;
  readonly publicApi?: PublicApiRoutesOptions<TRecord, TCreate, TUpdate>;
  readonly webhooks?: WebhookSubscriptionRepository;
  readonly evaluations?: EvaluationRouteDependencies;
  readonly speaker?: SpeakerRouteDependencies;
  readonly agenda?: AgendaRouteDependencies;
}

const requestIdSchema = z.uuid();
const apiErrorCodeSet = new Set<string>(apiErrorCodes);

function createError(traceId: string, code: ApiErrorCode, message: string): ApiError {
  return apiErrorSchema.parse({
    error: { code, message, traceId },
  });
}

function errorCodeForStatus(status: number): ApiErrorCode {
  if (status === 400 || status === 422) return "VALIDATION_FAILED";
  if (status === 401) return "AUTHENTICATION_REQUIRED";
  if (status === 403) return "ACCESS_DENIED";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 412) return "PRECONDITION_FAILED";
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "INTEGRATION_UNAVAILABLE";
  return "INTERNAL_ERROR";
}

function responseMessage(payload: unknown, status: number): string {
  if (status >= 500) {
    return "The request could not be completed.";
  }
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    const message = payload.error.message.trim();
    if (message.length > 0 && message.length <= 2_000) {
      return message;
    }
  }
  return "The request could not be completed.";
}

async function normalizeErrorResponse(context: Context<ApiContext>): Promise<void> {
  const response = context.res;
  if (response.status < 400 || !response.headers.get("content-type")?.includes("application/json")) {
    return;
  }

  let payload: unknown;
  try {
    payload = await response.clone().json();
  } catch {
    return;
  }
  if (apiErrorSchema.safeParse(payload).success) {
    return;
  }

  const candidateCode =
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null &&
    "code" in payload.error &&
    typeof payload.error.code === "string"
      ? payload.error.code
      : undefined;
  const code =
    candidateCode !== undefined && apiErrorCodeSet.has(candidateCode)
      ? (candidateCode as ApiErrorCode)
      : errorCodeForStatus(response.status);
  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json; charset=UTF-8");
  context.res = new Response(
    JSON.stringify(createError(context.get("traceId"), code, responseMessage(payload, response.status))),
    { status: response.status, headers },
  );
}

function authenticationMiddleware(
  authenticator: Pick<RequestAuthenticator, "authenticate">,
): MiddlewareHandler<ApiContext> {
  return async (context, next) => {
    try {
      context.set("authPrincipal", await authenticator.authenticate(context.req.raw));
      await next();
    } catch (error) {
      if (error instanceof AuthAccessError) {
        return context.json(
          createError(
            context.get("traceId"),
            error.code === "UNAUTHENTICATED" ? "AUTHENTICATION_REQUIRED" : "ACCESS_DENIED",
            error.message,
          ),
          error.status,
        );
      }
      throw error;
    }
  };
}

function evaluationActorMiddleware(
  dependencies: EvaluationRouteDependencies,
): MiddlewareHandler<ApiContext> {
  return async (context, next) => {
    const principal = context.get("authPrincipal");
    if (!principal) {
      return context.json(
        createError(context.get("traceId"), "AUTHENTICATION_REQUIRED", "Authentication is required."),
        401,
      );
    }
    const actor = await dependencies.actorFor(principal, context.req.raw);
    if (!actor) {
      return context.json(
        createError(
          context.get("traceId"),
          "ACCESS_DENIED",
          "The credential cannot access evaluation resources.",
        ),
        403,
      );
    }
    context.set("evaluationActor", actor);
    await next();
  };
}

function assertAuthenticationConfigured(
  dependencies: ApiDependencies<unknown, unknown, unknown>,
): asserts dependencies is ApiDependencies<unknown, unknown, unknown> & {
  authenticator: Pick<RequestAuthenticator, "authenticate">;
} {
  if (
    dependencies.authenticator === undefined &&
    (dependencies.publicApi !== undefined ||
      dependencies.webhooks !== undefined ||
      dependencies.evaluations !== undefined ||
      dependencies.agenda !== undefined)
  ) {
    throw new TypeError("Authentication must be configured before protected API routes are mounted.");
  }
}

export function createApp<
  TRecord = Record<string, unknown>,
  TCreate = Record<string, unknown>,
  TUpdate = Record<string, unknown>,
>(dependencies: ApiDependencies<TRecord, TCreate, TUpdate> = {}) {
  assertAuthenticationConfigured(dependencies as ApiDependencies<unknown, unknown, unknown>);
  const app = new Hono<ApiContext>();

  app.use("*", async (context, next) => {
    const incomingRequestId = requestIdSchema.safeParse(context.req.header("x-request-id"));
    const traceId = incomingRequestId.success ? incomingRequestId.data : crypto.randomUUID();

    context.set("traceId", traceId);
    context.set("authPrincipal", null);
    await next();
    await normalizeErrorResponse(context);

    context.header("content-security-policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    context.header("referrer-policy", "no-referrer");
    context.header("x-content-type-options", "nosniff");
    context.header("x-frame-options", "DENY");
    context.header("x-request-id", traceId);
    if (context.res.status >= 400 && !context.res.headers.has("cache-control")) {
      context.header("cache-control", "no-store");
    }
  });

  app.use(
    "*",
    cors({
      origin: (origin, context) => (origin === context.env.WEB_ORIGIN ? origin : ""),
      allowHeaders: [
        "Authorization",
        "Content-Type",
        "Idempotency-Key",
        "If-Match",
        "X-Request-ID",
      ],
      allowMethods: ["DELETE", "GET", "OPTIONS", "PATCH", "POST", "PUT"],
      exposeHeaders: ["ETag", "X-Request-ID"],
      credentials: true,
      maxAge: 600,
    }),
  );

  if (dependencies.authenticator !== undefined) {
    const authenticate = authenticationMiddleware(dependencies.authenticator);
    app.use("/api/v1/organizations/*", authenticate);
    app.use("/api/admin/*", authenticate);
  }

  if (dependencies.evaluations !== undefined) {
    app.use("/api/admin/evaluations/*", evaluationActorMiddleware(dependencies.evaluations));
  }

  if (dependencies.webhooks !== undefined) {
    app.route(
      "/api/v1/organizations/:organizationId/webhooks",
      createWebhookSubscriptionRoutes(dependencies.webhooks),
    );
  }
  if (dependencies.publicApi !== undefined) {
    app.route("/api/v1", createPublicApiV1Routes(dependencies.publicApi));
  }
  if (dependencies.evaluations !== undefined) {
    app.route("/api/admin/evaluations", createEvaluationRoutes(dependencies.evaluations.service));
  }
  if (dependencies.speaker !== undefined) {
    app.route("/api/speaker", createSpeakerRoutes(dependencies.speaker));
  }
  if (dependencies.agenda !== undefined) {
    app.route(
      "/api/admin/organizations/:organizationId/events/:eventId/agenda",
      createAgendaAdminRoutes(dependencies.agenda),
    );
    app.route(
      "/api/public/events/:eventId/agenda",
      createPublishedAgendaRoutes(dependencies.agenda),
    );
  }

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
