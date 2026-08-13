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
import { parseApiEnvironment } from "./env";
import type { RequestAuthenticator } from "./features/auth/authenticator";
import { AuthAccessError, type AuthPrincipal } from "./features/auth/types";
import {
  type CfpRouteDependencies,
  createCfpPublicRoutes,
  createCfpRoutes,
} from "./features/cfp/routes";
import { createCommunicationRoutes } from "./features/communications/routes";
import type { CommunicationService } from "./features/communications/service";
import type { CommunicationActor } from "./features/communications/types";
import { type CrmRouteDependencies, createCrmRoutes } from "./features/crm/routes";
import {
  createEvaluationRoutes,
  type EvaluationReminderBoundary,
  type EvaluationReviewerIdentityBoundary,
} from "./features/evaluations/routes";
import type { EvaluationService } from "./features/evaluations/service";
import type { EvaluationActor } from "./features/evaluations/types";
import { createEventAdminRoutes, type EventRouteDependencies } from "./features/events/routes";
import { createMemberAdminRoutes, type MemberRouteDependencies } from "./features/members/routes";
import {
  createPublicCatalogRoutes,
  type PublicCatalogDependencies,
  publicCatalogOpenApiPaths,
} from "./features/public-api/catalog";
import { createPublicApiV1Routes, type PublicApiRoutesOptions } from "./features/public-api/routes";
import { createRemixRoutes } from "./features/remix/routes";
import type { RemixService } from "./features/remix/service";
import type { RemixActor } from "./features/remix/types";
import { createReportRoutes } from "./features/reports/routes";
import type { ReportService } from "./features/reports/service";
import type { ReportActor } from "./features/reports/types";
import {
  createSessionAdminRoutes,
  type SessionRouteDependencies,
} from "./features/sessions/routes";
import {
  createSpeakerAdminRoutes,
  createSpeakerRoutes,
  createSpeakerTaskAdminRoutes,
  type SpeakerRouteDependencies,
} from "./features/speaker/routes";
import {
  createWebhookSubscriptionRoutes,
  webhookSubscriptionOpenApiPaths,
} from "./integrations/webhooks/routes";
import type { WebhookSubscriptionRepository } from "./integrations/webhooks/types";
import {
  type AgendaRouteDependencies,
  createAgendaAdminRoutes,
  createPublishedAgendaRoutes,
} from "./routes/agenda";
import {
  createIntegrationAdminRoutes,
  type IntegrationAdminRouteDependencies,
} from "./routes/integrations";
import {
  createOrganizerOverviewRoutes,
  type OrganizerOverviewRouteDependencies,
} from "./routes/organizer-overview";
import {
  createPublishedSpeakerRoutes,
  type PublishedSpeakerRouteDependencies,
} from "./routes/public-speakers";

export interface ApiBindings {
  APP_ENV: string;
  WEB_ORIGIN: string;
  RUNTIME_PROFILE?: string;
}

type ApiVariables = {
  traceId: string;
  authPrincipal: AuthPrincipal | null;
  evaluationActor: EvaluationActor;
  communicationActor: CommunicationActor;
  reportActor: ReportActor;
  remixActor: RemixActor;
};

type ApiContext = {
  Bindings: ApiBindings;
  Variables: ApiVariables;
};

export interface AuthRouteDependencies {
  readonly handler: (request: Request) => Promise<Response>;
}

export interface EvaluationRouteDependencies {
  readonly service: EvaluationService;
  readonly reminders?: EvaluationReminderBoundary;
  readonly reviewerIdentity?: EvaluationReviewerIdentityBoundary;
  readonly actorFor: (
    principal: AuthPrincipal,
    request: Request,
  ) => EvaluationActor | null | Promise<EvaluationActor | null>;
}
export interface CommunicationRouteDependencies {
  readonly service: CommunicationService;
  readonly actorFor: (
    principal: AuthPrincipal,
    organizationId: string,
    eventId: string,
  ) => CommunicationActor | null | Promise<CommunicationActor | null>;
}

export interface ReportRouteDependencies {
  readonly service: ReportService;
  readonly actorFor: (
    principal: AuthPrincipal,
    organizationId: string,
    eventId: string,
  ) => ReportActor | null | Promise<ReportActor | null>;
}

export interface RemixRouteDependencies {
  readonly service: RemixService;
  readonly actorFor: (
    principal: AuthPrincipal,
    organizationId: string,
    eventId: string,
  ) => RemixActor | null | Promise<RemixActor | null>;
}

export interface ApiDependencies<
  TRecord = Record<string, unknown>,
  TCreate = Record<string, unknown>,
  TUpdate = Record<string, unknown>,
> {
  readonly authenticator?: Pick<RequestAuthenticator, "authenticate">;
  readonly auth?: AuthRouteDependencies;
  readonly publicApi?: PublicApiRoutesOptions<TRecord, TCreate, TUpdate>;
  readonly publicCatalog?: PublicCatalogDependencies;
  readonly webhooks?: WebhookSubscriptionRepository;
  readonly integrations?: IntegrationAdminRouteDependencies;
  readonly evaluations?: EvaluationRouteDependencies;
  readonly speaker?: SpeakerRouteDependencies;
  readonly agenda?: AgendaRouteDependencies;
  readonly publishedSpeakers?: PublishedSpeakerRouteDependencies;
  readonly cfp?: CfpRouteDependencies;
  readonly organizerOverview?: OrganizerOverviewRouteDependencies;
  readonly events?: EventRouteDependencies;
  readonly sessions?: SessionRouteDependencies;
  readonly communications?: CommunicationRouteDependencies;
  readonly reports?: ReportRouteDependencies;
  readonly remix?: RemixRouteDependencies;
  readonly members?: MemberRouteDependencies;
  readonly crm?: CrmRouteDependencies;
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
  if (status === 410) return "NOT_FOUND";
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
  if (
    response.status < 400 ||
    !response.headers.get("content-type")?.includes("application/json")
  ) {
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
  const authenticationFailure =
    context.req.path === "/api/auth" || context.req.path.startsWith("/api/auth/");
  context.res = new Response(
    JSON.stringify(
      createError(
        context.get("traceId"),
        code,
        authenticationFailure
          ? "The authentication request could not be completed."
          : responseMessage(payload, response.status),
      ),
    ),
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
        createError(
          context.get("traceId"),
          "AUTHENTICATION_REQUIRED",
          "Authentication is required.",
        ),
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
type ScopedActorResolver<TActor> = (
  principal: AuthPrincipal,
  organizationId: string,
  eventId: string,
) => TActor | null | Promise<TActor | null>;

function scopedActorMiddleware<TActor>(
  resolveActor: ScopedActorResolver<TActor>,
  setActor: (context: Context<ApiContext>, actor: TActor) => void,
): MiddlewareHandler<ApiContext> {
  return async (context, next) => {
    const principal = context.get("authPrincipal");
    if (principal === null) {
      return context.json(
        createError(
          context.get("traceId"),
          "AUTHENTICATION_REQUIRED",
          "Authentication is required.",
        ),
        401,
      );
    }
    if (principal.kind !== "user") {
      return context.json(
        createError(
          context.get("traceId"),
          "ACCESS_DENIED",
          "Organizer session authentication is required.",
        ),
        403,
      );
    }

    const organizationId = context.req.param("organizationId");
    const eventId = context.req.param("eventId");
    if (organizationId === undefined || eventId === undefined) {
      return context.json(
        createError(
          context.get("traceId"),
          "ACCESS_DENIED",
          "The requested event scope is not available.",
        ),
        403,
      );
    }

    try {
      const actor = await resolveActor(principal, organizationId, eventId);
      if (actor === null) {
        return context.json(
          createError(
            context.get("traceId"),
            "ACCESS_DENIED",
            "The credential cannot access this event.",
          ),
          403,
        );
      }
      setActor(context, actor);
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

function stripEventScope<T extends { routes: Array<{ path: string }> }>(routes: T): T {
  const eventPrefix = "/events/:eventId";
  for (const route of routes.routes) {
    if (!route.path.startsWith(eventPrefix)) continue;
    route.path = route.path.slice(eventPrefix.length) || "/";
  }
  return routes;
}

function removeEventScopedAliases<T extends { routes: Array<{ path: string }> }>(routes: T): T {
  routes.routes = routes.routes.filter((route) => !route.path.startsWith("/events/:eventId"));
  return routes;
}

function assertAuthenticationConfigured(
  dependencies: ApiDependencies<unknown, unknown, unknown>,
): asserts dependencies is ApiDependencies<unknown, unknown, unknown> & {
  authenticator: Pick<RequestAuthenticator, "authenticate">;
} {
  if (
    dependencies.authenticator === undefined &&
    (dependencies.publicApi !== undefined ||
      dependencies.integrations !== undefined ||
      dependencies.webhooks !== undefined ||
      dependencies.evaluations !== undefined ||
      dependencies.agenda !== undefined ||
      dependencies.cfp !== undefined ||
      dependencies.events !== undefined ||
      dependencies.organizerOverview !== undefined ||
      dependencies.sessions !== undefined ||
      dependencies.speaker !== undefined ||
      dependencies.communications !== undefined ||
      dependencies.reports !== undefined ||
      dependencies.remix !== undefined ||
      dependencies.members !== undefined ||
      dependencies.crm !== undefined)
  ) {
    throw new TypeError(
      "Authentication must be configured before protected API routes are mounted.",
    );
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

    context.header(
      "content-security-policy",
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
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
      origin: (origin, context) => (origin === context.env?.WEB_ORIGIN ? origin : ""),
      allowHeaders: [
        "Authorization",
        "Content-Type",
        "Idempotency-Key",
        "If-Match",
        "X-Request-ID",
        "Content-Length",
      ],
      allowMethods: ["DELETE", "GET", "OPTIONS", "PATCH", "POST", "PUT"],
      exposeHeaders: ["ETag", "X-Request-ID", "Content-Length", "Content-Disposition"],
      credentials: true,
      maxAge: 600,
    }),
  );

  const authenticator = dependencies.authenticator;
  const authDependencies = dependencies.auth;
  if (authDependencies !== undefined) {
    const authHandler = async (context: Context<ApiContext>) => {
      const response = await authDependencies.handler(context.req.raw);
      if (
        context.req.path !== "/api/auth/get-session" ||
        !response.ok ||
        authenticator === undefined
      ) {
        return response;
      }
      let principal: AuthPrincipal | null;
      try {
        principal = await authenticator.authenticate(context.req.raw);
      } catch (error) {
        if (error instanceof AuthAccessError) return response;
        throw error;
      }
      if (principal?.kind !== "user") return response;
      const payload: unknown = await response.clone().json();
      if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
        return response;
      }
      const headers = new Headers(response.headers);
      headers.delete("content-length");
      headers.set("content-type", "application/json; charset=utf-8");
      return new Response(
        JSON.stringify({
          ...payload,
          memberships: principal.memberships,
          speakerGrants: principal.speakerGrants,
        }),
        { status: response.status, headers },
      );
    };
    app.all("/api/auth", authHandler);
    app.all("/api/auth/*", authHandler);
  }
  if (authenticator !== undefined) {
    const authenticate = authenticationMiddleware(authenticator);
    app.use("/api/v1/organizations/*", authenticate);
    app.use("/api/admin/*", async (context, next) => {
      if (context.req.path.endsWith("/members/setup/activate")) {
        context.set("authPrincipal", null);
        return next();
      }
      return authenticate(context, next);
    });
    app.use("/api/cfp/*", authenticate);
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
  if (dependencies.publicCatalog !== undefined) {
    app.route("/api/v1", createPublicCatalogRoutes(dependencies.publicCatalog));
  }
  if (dependencies.publicApi !== undefined) {
    const configuredOpenApiPaths = {
      ...(dependencies.publicCatalog === undefined ? {} : publicCatalogOpenApiPaths()),
      ...(dependencies.publicApi.openApi?.paths ?? {}),
    };
    app.route(
      "/api/v1",
      createPublicApiV1Routes({
        ...dependencies.publicApi,
        openApi: {
          ...dependencies.publicApi.openApi,
          ...(dependencies.publicApi.openApi?.description === undefined &&
          dependencies.publicApi.resources.length === 0 &&
          dependencies.webhooks !== undefined
            ? {
                description:
                  "Tenant-scoped public-v1 webhook administration. Generic program-resource routes are not mounted.",
              }
            : {}),
          paths:
            dependencies.webhooks === undefined
              ? configuredOpenApiPaths
              : { ...configuredOpenApiPaths, ...webhookSubscriptionOpenApiPaths },
        },
      }),
    );
  }
  if (dependencies.integrations !== undefined) {
    app.route(
      "/api/admin/organizations/:organizationId/events/:eventId",
      createIntegrationAdminRoutes(dependencies.integrations),
    );
  }
  if (dependencies.evaluations !== undefined) {
    app.route(
      "/api/admin/evaluations",
      createEvaluationRoutes(dependencies.evaluations.service, {
        reminders: dependencies.evaluations.reminders,
        reviewerIdentity: dependencies.evaluations.reviewerIdentity,
      }),
    );
  }
  if (dependencies.organizerOverview !== undefined) {
    app.route(
      "/api/admin/organizations/:organizationId/overview",
      createOrganizerOverviewRoutes(dependencies.organizerOverview),
    );
  }
  if (dependencies.speaker !== undefined) {
    app.route("/api/speaker", createSpeakerRoutes(dependencies.speaker));
    const canonicalSpeakerDependencies =
      authenticator === undefined
        ? dependencies.speaker
        : {
            ...dependencies.speaker,
            authenticate: async (request: Request) => {
              const principal = await authenticator.authenticate(request).catch(() => null);
              return principal?.kind === "user" ? { accountId: principal.userId } : null;
            },
          };
    app.route(
      "/api/admin/organizations/:organizationId/events/:eventId/speakers",
      createSpeakerAdminRoutes(canonicalSpeakerDependencies),
    );
    app.route(
      "/api/admin/organizations/:organizationId/events/:eventId/speaker-tasks",
      createSpeakerTaskAdminRoutes(canonicalSpeakerDependencies),
    );
  }
  if (dependencies.agenda !== undefined) {
    app.route(
      "/api/admin/organizations/:organizationId/events/:eventId/agenda",
      createAgendaAdminRoutes(dependencies.agenda),
    );
    app.route("/api/public/events/:eventSlug", createPublishedAgendaRoutes(dependencies.agenda));
  }
  if (dependencies.events !== undefined) {
    app.route(
      "/api/admin/organizations/:organizationId/events",
      createEventAdminRoutes(dependencies.events),
    );
  }
  if (dependencies.sessions !== undefined) {
    const prefix = "/api/admin/organizations/:organizationId/events/:eventId/sessions";
    app.route(prefix, createSessionAdminRoutes(dependencies.sessions));
  }
  if (dependencies.communications !== undefined) {
    const prefix = "/api/admin/organizations/:organizationId/events/:eventId/communications";
    app.use(
      `${prefix}/*`,
      scopedActorMiddleware(dependencies.communications.actorFor, (context, actor) =>
        context.set("communicationActor", actor),
      ),
    );
    app.route(prefix, createCommunicationRoutes(dependencies.communications.service));
  }
  if (dependencies.reports !== undefined) {
    const prefix = "/api/admin/organizations/:organizationId/events/:eventId/reports";
    app.use(
      `${prefix}/*`,
      scopedActorMiddleware(dependencies.reports.actorFor, (context, actor) =>
        context.set("reportActor", actor),
      ),
    );
    app.route(prefix, removeEventScopedAliases(createReportRoutes(dependencies.reports.service)));
  }
  if (dependencies.remix !== undefined) {
    const prefix = "/api/admin/organizations/:organizationId/events/:eventId/remix";
    app.use(
      `${prefix}/*`,
      scopedActorMiddleware(dependencies.remix.actorFor, (context, actor) =>
        context.set("remixActor", actor),
      ),
    );
    app.route(prefix, stripEventScope(createRemixRoutes(dependencies.remix.service)));
  }
  if (dependencies.members !== undefined) {
    app.route(
      "/api/admin/organizations/:organizationId/members",
      createMemberAdminRoutes(dependencies.members),
    );
  }
  if (dependencies.crm !== undefined) {
    app.route("/api/admin/organizations/:organizationId/crm", createCrmRoutes(dependencies.crm));
  }
  if (dependencies.publishedSpeakers !== undefined) {
    app.route(
      "/api/public/events/:eventSlug/speakers",
      createPublishedSpeakerRoutes(dependencies.publishedSpeakers),
    );
  }
  if (dependencies.cfp !== undefined) {
    app.route(
      "/api/cfp/organizations/:organizationId/events/:eventId",
      createCfpRoutes(dependencies.cfp),
    );
    app.route("/api/public/cfp", createCfpPublicRoutes(dependencies.cfp));
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
      ...(environment.data.APP_ENV === "local"
        ? {
            runtimeProfile:
              context.env.RUNTIME_PROFILE?.trim().toLowerCase() === "fixture"
                ? ("fixture" as const)
                : ("integrated" as const),
          }
        : {}),
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
        ...(error.name === "AgendaError"
          ? {
              errorCode:
                "code" in error && typeof error.code === "string" ? error.code : "AGENDA_ERROR",
              errorMessage: error.message.slice(0, 500),
            }
          : {}),
      }),
    );

    return context.json(
      createError(traceId, "INTERNAL_ERROR", "The request could not be completed."),
      500,
    );
  });

  return app;
}
