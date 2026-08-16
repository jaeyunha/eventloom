import { type Context, Hono } from "hono";
import { z } from "zod";
import type { AuthPrincipal } from "../auth/types";

export interface EventInvitationRouteActor {
  readonly kind: "user";
  readonly userId: string;
  readonly email: string;
  readonly emailVerified: true;
}

export interface EventInvitationRouteService {
  readonly list: (actor: EventInvitationRouteActor) => Promise<unknown>;
  readonly accept: (
    actor: EventInvitationRouteActor,
    input: { readonly invitationId: string; readonly expectedVersion: number },
  ) => Promise<unknown>;
  readonly decline: (
    actor: EventInvitationRouteActor,
    input: { readonly invitationId: string; readonly expectedVersion: number },
  ) => Promise<unknown>;
}

export interface EventInvitationRouteDependencies {
  readonly service: EventInvitationRouteService;
}

export type EventInvitationRouteEnvironment = {
  Variables: {
    traceId: string;
    authPrincipal: AuthPrincipal | null;
  };
};

const mutationSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
  })
  .strict();

type ErrorStatus = 400 | 403 | 404 | 409 | 500;

function errorResponse(
  context: Context<EventInvitationRouteEnvironment>,
  status: ErrorStatus,
  code: "ACCESS_DENIED" | "VALIDATION_FAILED" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR",
  message: string,
) {
  context.header("cache-control", "no-store");
  return context.json(
    {
      error: {
        code,
        message,
        traceId: context.get("traceId"),
      },
    },
    status,
  );
}

function actorFor(
  context: Context<EventInvitationRouteEnvironment>,
): EventInvitationRouteActor | Response {
  const principal = context.get("authPrincipal");
  if (principal?.kind !== "user") {
    return errorResponse(context, 403, "ACCESS_DENIED", "A verified user account is required.");
  }
  return {
    kind: "user",
    userId: principal.userId,
    email: principal.email,
    emailVerified: true,
  };
}

function mappedError(context: Context<EventInvitationRouteEnvironment>, error: unknown): Response {
  if (typeof error === "object" && error !== null) {
    const candidate = error as { code?: unknown; status?: unknown; message?: unknown };
    const message =
      typeof candidate.message === "string" && candidate.message.trim().length > 0
        ? candidate.message
        : "The request could not be completed.";
    if (candidate.code === "FORBIDDEN" && candidate.status === 403) {
      return errorResponse(context, 403, "ACCESS_DENIED", message);
    }
    if (candidate.code === "VALIDATION_ERROR" && candidate.status === 400) {
      return errorResponse(context, 400, "VALIDATION_FAILED", message);
    }
    if (candidate.code === "NOT_FOUND" && candidate.status === 404) {
      return errorResponse(context, 404, "NOT_FOUND", message);
    }
    if (candidate.code === "VERSION_CONFLICT" && candidate.status === 409) {
      return errorResponse(context, 409, "CONFLICT", message);
    }
  }
  throw error;
}

export function createEventInvitationRoutes(dependencies: EventInvitationRouteDependencies) {
  const routes = new Hono<EventInvitationRouteEnvironment>();

  routes.get("/", async (context) => {
    const actor = actorFor(context);
    if (actor instanceof Response) return actor;
    try {
      const data = await dependencies.service.list(actor);
      context.header("cache-control", "private, no-store");
      return context.json({ data });
    } catch (error) {
      return mappedError(context, error);
    }
  });

  for (const action of ["accept", "decline"] as const) {
    routes.post(`/:invitationId/${action}`, async (context) => {
      const actor = actorFor(context);
      if (actor instanceof Response) return actor;
      const parsed = mutationSchema.safeParse(
        await context.req.json<unknown>().catch(() => undefined),
      );
      if (!parsed.success) {
        return errorResponse(
          context,
          400,
          "VALIDATION_FAILED",
          "The event invitation request is invalid.",
        );
      }
      try {
        const data = await dependencies.service[action](actor, {
          invitationId: context.req.param("invitationId"),
          expectedVersion: parsed.data.expectedVersion,
        });
        context.header("cache-control", "private, no-store");
        return context.json({ data });
      } catch (error) {
        return mappedError(context, error);
      }
    });
  }

  return routes;
}
