import { apiErrorSchema } from "@eventloom/contracts";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { requireOrganizationRole } from "../features/auth/authorization";
import { AuthAccessError, type AuthPrincipal } from "../features/auth/types";

export interface OrganizerOverviewCoreMetrics {
  readonly eventCount: number;
}

export interface OrganizerOverviewActivityMetrics {
  readonly submissionCount: number;
  readonly pendingReviewCount: number;
  readonly outstandingSpeakerTaskCount: number;
  readonly publishedSessionCount: number;
}

export interface OrganizerOverviewEvent {
  readonly id: string;
  readonly name: string;
  readonly slug: string | null;
  readonly status: string | null;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
}

export type OrganizerOverviewActionType = "reviews" | "speaker_tasks" | "agenda";

export interface OrganizerOverviewActionItem {
  readonly id: string;
  readonly type: OrganizerOverviewActionType;
  readonly eventId: string;
  readonly title: string;
  readonly description: string;
  readonly count: number;
  readonly priority: number;
  readonly dueAt: string | null;
  readonly href: string;
}

export interface OrganizerOverviewCoreData {
  readonly organizationId: string;
  readonly metrics: OrganizerOverviewCoreMetrics;
  readonly events: readonly OrganizerOverviewEvent[];
}

export interface OrganizerOverviewActivityData {
  readonly organizationId: string;
  readonly metrics: OrganizerOverviewActivityMetrics;
  readonly actionItems: readonly OrganizerOverviewActionItem[];
}

export interface OrganizerOverviewRouteDependencies {
  readonly getOverviewCore: (organizationId: string) => Promise<OrganizerOverviewCoreData>;
  readonly getOverviewActivity: (organizationId: string) => Promise<OrganizerOverviewActivityData>;
}

interface OrganizerOverviewRouteEnvironment {
  Variables: {
    authPrincipal: AuthPrincipal | null;
    traceId: string;
  };
}

type OrganizerOverviewContext = Context<OrganizerOverviewRouteEnvironment>;

const organizationIdSchema = z.string().trim().min(1).max(200);

function traceId(context: OrganizerOverviewContext): string {
  return context.get("traceId") ?? crypto.randomUUID();
}

function errorResponse(
  context: OrganizerOverviewContext,
  status: 400 | 401 | 403 | 500,
  code: "VALIDATION_FAILED" | "AUTHENTICATION_REQUIRED" | "ACCESS_DENIED" | "INTERNAL_ERROR",
  message: string,
): Response {
  return context.json(
    apiErrorSchema.parse({
      error: { code, message, traceId: traceId(context) },
    }),
    status,
  );
}

function organizationId(context: OrganizerOverviewContext): string {
  const parsed = organizationIdSchema.safeParse(context.req.param("organizationId"));
  if (!parsed.success) {
    throw new AuthAccessError("FORBIDDEN", "Organizer access is required for this organization.");
  }
  return parsed.data;
}

function requireOrganizer(context: OrganizerOverviewContext, id: string): void {
  const principal = context.get("authPrincipal");
  if (principal === null) {
    throw new AuthAccessError("UNAUTHENTICATED", "Authentication is required.");
  }
  requireOrganizationRole(principal, id, ["owner", "admin"]);
}

/** Organization-scoped organizer dashboard projection. */
export function createOrganizerOverviewRoutes(
  dependencies: OrganizerOverviewRouteDependencies,
): Hono<OrganizerOverviewRouteEnvironment> {
  const routes = new Hono<OrganizerOverviewRouteEnvironment>();

  routes.get("/core", async (context) => {
    const id = organizationId(context);
    requireOrganizer(context, id);
    const data = await dependencies.getOverviewCore(id);
    if (data.organizationId !== id) {
      throw new Error("The organizer overview returned another organization.");
    }
    context.header("cache-control", "private, no-store");
    return context.json({ data });
  });

  routes.get("/activity", async (context) => {
    const id = organizationId(context);
    requireOrganizer(context, id);
    const data = await dependencies.getOverviewActivity(id);
    if (data.organizationId !== id) {
      throw new Error("The organizer overview returned another organization.");
    }
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
    if (error instanceof z.ZodError) {
      return errorResponse(context, 400, "VALIDATION_FAILED", "The overview request is invalid.");
    }
    throw error;
  });

  return routes;
}
