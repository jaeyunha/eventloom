import { type Context, Hono } from "hono";
import { z } from "zod";
import { AuthAccessError, type AuthPrincipal, type UserPrincipal } from "../auth/types";
import {
  AccountReviewerWorkspaceService,
  ReviewerWorkspaceAccessError,
  type ReviewerWorkspaceDependencies,
} from "./reviewer-workspace";
import {
  type AccessContextDependencies,
  AccessContextDependencyError,
  AccessContextService,
  type AccessOrganization,
} from "./service";
import {
  type AccountSpeakerTasksDependencies,
  AccountSpeakerTasksService,
  SpeakerTasksAccessError,
} from "./speaker-tasks";

export interface AccessRouteDependencies
  extends ReviewerWorkspaceDependencies,
    AccountSpeakerTasksDependencies {}

interface AccessRouteEnvironment {
  Variables: {
    readonly authPrincipal: AuthPrincipal | null;
    readonly traceId: string;
  };
}

type AccessContext = Context<AccessRouteEnvironment>;

function errorResponse(
  context: AccessContext,
  status: 401 | 403,
  code: "AUTHENTICATION_REQUIRED" | "ACCESS_DENIED",
  message: string,
): Response {
  return context.json(
    {
      error: {
        code,
        message,
        traceId: context.get("traceId") ?? crypto.randomUUID(),
      },
    },
    status,
  );
}

function requireUserPrincipal(context: AccessContext): UserPrincipal {
  const principal = context.get("authPrincipal");
  if (principal === null || principal === undefined) {
    throw new AuthAccessError("UNAUTHENTICATED", "Authentication is required.");
  }
  if (principal.kind !== "user") {
    throw new AuthAccessError("FORBIDDEN", "User session authentication is required.");
  }
  return principal;
}

/** Session-only, discovery-only access graph. It is not an authorization cache. */
export function createAccessRoutes(
  dependencies: AccessRouteDependencies,
): Hono<AccessRouteEnvironment> {
  const routes = new Hono<AccessRouteEnvironment>();
  const service = new AccessContextService(dependencies);
  const reviewerWorkspace = new AccountReviewerWorkspaceService(dependencies);
  const speakerTasks = new AccountSpeakerTasksService(dependencies);

  routes.get("/access-contexts", async (context) => {
    const data = await service.list(requireUserPrincipal(context));
    context.header("cache-control", "private, no-store");
    return context.json({ data });
  });
  routes.get("/reviewer-workspace", async (context) => {
    const organizationId = context.req.query("organizationId");
    const eventId = context.req.query("eventId");
    const data = await reviewerWorkspace.list(requireUserPrincipal(context), {
      ...(organizationId === undefined ? {} : { organizationId }),
      ...(eventId === undefined ? {} : { eventId }),
    });
    context.header("cache-control", "private, no-store");
    return context.json({ data });
  });

  routes.get("/speaker-tasks", async (context) => {
    const data = await speakerTasks.list(
      requireUserPrincipal(context),
      context.req.query("organizationId"),
      context.req.query("eventId"),
    );
    context.header("cache-control", "private, no-store");
    return context.json({ data });
  });

  routes.onError((error, context) => {
    if (error instanceof AuthAccessError) {
      return errorResponse(
        context,
        error.status,
        error.code === "UNAUTHENTICATED" ? "AUTHENTICATION_REQUIRED" : "ACCESS_DENIED",
        error.message,
      );
    }
    if (
      error instanceof AccessContextDependencyError ||
      error instanceof ReviewerWorkspaceAccessError ||
      error instanceof SpeakerTasksAccessError ||
      error instanceof z.ZodError
    ) {
      return errorResponse(
        context,
        403,
        "ACCESS_DENIED",
        "The requested access scope is not available.",
      );
    }
    throw error;
  });

  return routes;
}

export type { AccessContextDependencies, AccessOrganization };
