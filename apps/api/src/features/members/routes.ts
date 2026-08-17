import { type Context, Hono } from "hono";
import { ZodError, z } from "zod";
import { AuthAccessError, type AuthPrincipal } from "../auth/types";
import {
  type MemberService,
  MemberServiceError,
  type MemberServiceErrorCode,
  type UpdateOrganizationInput,
} from "./service";
import type { MemberActor, MemberRole, ReviewerPoolGrantInput } from "./types";

export interface MemberRouteEnvironment {
  Variables: {
    traceId: string;
    authPrincipal: AuthPrincipal | null;
  };
}

export type MemberRouteService = Pick<
  MemberService,
  | "listMembers"
  | "inviteMember"
  | "activateMember"
  | "updateMemberRole"
  | "revokeMember"
  | "getReviewerPool"
  | "setReviewerPool"
  | "grantReviewer"
  | "revokeReviewerGrant"
  | "reserveReviewerAssignment"
  | "listOrganizations"
  | "switchOrganization"
  | "updateOrganization"
  | "getOrganization"
>;

export interface MemberRouteDependencies {
  readonly service: MemberRouteService;
}

type MemberContext = Context<MemberRouteEnvironment>;
type ErrorStatus = 400 | 401 | 403 | 404 | 409;
type ApiRouteErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "ACCESS_DENIED"
  | "NOT_FOUND"
  | "VALIDATION_FAILED"
  | "CONFLICT";

const identifierSchema = z.string().trim().min(1).max(200);
const emailSchema = z.string().trim().min(3).max(320).email();
const nameSchema = z.string().trim().max(200).nullable().optional();
const roleSchema = z.enum(["owner", "admin", "reviewer"]);
const inviteSchema = z
  .object({
    email: emailSchema,
    name: nameSchema,
    role: roleSchema,
  })
  .strict();
const roleUpdateSchema = z.object({ role: roleSchema }).strict();
const setupSchema = z
  .object({
    token: z.string().trim().min(1).max(2_000),
    name: nameSchema,
    password: z.string().min(8).max(128),
  })
  .strict();
const reviewerGrantSchema = z
  .object({
    reviewerId: identifierSchema,
    maxAssignments: z.number().int().positive(),
  })
  .strict();
const reviewerGrantInputSchema = z
  .object({
    reviewerId: identifierSchema,
    maxAssignments: z.number().int().positive().optional(),
  })
  .strict();
const poolSchema = z
  .object({
    reviewerIds: z.array(identifierSchema).optional(),
    reviewers: z.array(reviewerGrantInputSchema).optional(),
    maxAssignmentsPerReviewer: z.number().int().positive().optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .strict();
const organizationIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9](?:[a-z0-9_-]{0,126}[a-z0-9])?$/iu);
const organizationSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/iu);
const organizationNameSchema = z.string().trim().min(1).max(200);
const organizationConfigSchema = z.record(z.string(), z.unknown());
const updateOrganizationSchema = z
  .object({
    slug: organizationSlugSchema.optional(),
    name: organizationNameSchema.optional(),
    config: organizationConfigSchema.optional(),
  })
  .strict()
  .refine(
    (value) => value.slug !== undefined || value.name !== undefined || value.config !== undefined,
    "At least one organization field must be updated.",
  );
type InviteBody = z.infer<typeof inviteSchema>;
type UpdateOrganizationBody = z.infer<typeof updateOrganizationSchema>;
type PoolBody = z.infer<typeof poolSchema>;

function optionalName(value: string | null | undefined): { readonly name?: string | null } {
  return value === undefined ? {} : { name: value };
}

function traceId(context: MemberContext): string {
  return context.get("traceId") ?? crypto.randomUUID();
}

function validationDetails(
  error: ZodError,
): readonly { path: readonly (string | number)[]; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.filter(
      (part): part is string | number => typeof part === "string" || typeof part === "number",
    ),
    message: issue.message,
  }));
}

function errorResponse(
  context: MemberContext,
  status: ErrorStatus,
  code: ApiRouteErrorCode,
  message: string,
  details?: readonly { path: readonly (string | number)[]; message: string }[],
): Response {
  return context.json(
    {
      error: {
        code,
        message,
        traceId: traceId(context),
        ...(details === undefined || details.length === 0 ? {} : { details }),
      },
    },
    status,
  );
}

function routeParam(context: MemberContext, name: string): string {
  return identifierSchema.parse(context.req.param(name));
}

async function body<T>(context: MemberContext, schema: z.ZodType<T>): Promise<T> {
  return schema.parse(await context.req.json().catch(() => undefined));
}

function memberActor(context: MemberContext, organizationId: string): MemberActor {
  const principal = context.get("authPrincipal");
  if (principal === null || principal === undefined) {
    throw new AuthAccessError("UNAUTHENTICATED", "Authentication is required.");
  }
  if (principal.kind !== "user") {
    throw new AuthAccessError("FORBIDDEN", "User session authentication is required.");
  }
  const membership = principal.memberships.find(
    (candidate) => candidate.organizationId === organizationId,
  );
  if (membership === undefined) {
    throw new AuthAccessError(
      "FORBIDDEN",
      "The authenticated user is not a member of this organization.",
    );
  }
  return {
    kind: "user",
    organizationId,
    userId: principal.userId,
    role: membership.role,
  };
}

function organizer(context: MemberContext, organizationId: string): MemberActor {
  const actor = memberActor(context, organizationId);
  if (actor.role !== "owner" && actor.role !== "admin") {
    throw new AuthAccessError("FORBIDDEN", "An owner or administrator is required.");
  }
  return actor;
}

function idempotencyKey(context: MemberContext): string {
  const result = context.req.header("idempotency-key")?.trim();
  if (result === undefined || result.length === 0) {
    throw new MemberServiceError(
      "VALIDATION_ERROR",
      400,
      "An Idempotency-Key header is required for member invitations.",
    );
  }
  return result;
}
function serviceErrorCode(code: MemberServiceErrorCode): ApiRouteErrorCode {
  switch (code) {
    case "FORBIDDEN":
      return "ACCESS_DENIED";
    case "NOT_FOUND":
      return "NOT_FOUND";
    case "VALIDATION_ERROR":
    case "INVITATION_INVALID":
      return "VALIDATION_FAILED";
    case "INVITATION_EXPIRED":
    case "CONFLICT":
    case "LAST_OWNER":
    case "REVIEWER_NOT_ACTIVE":
    case "ASSIGNMENT_CAP_REACHED":
    case "ORGANIZER_SEAT_LIMIT":
      return "CONFLICT";
  }
}

function serviceErrorResponse(context: MemberContext, error: MemberServiceError): Response {
  return errorResponse(context, error.status, serviceErrorCode(error.code), error.message);
}

function poolPath(context: MemberContext): {
  readonly organizationId: string;
  readonly eventId: string;
  readonly roundId: string;
} {
  return {
    organizationId: routeParam(context, "organizationId"),
    eventId: routeParam(context, "eventId"),
    roundId: routeParam(context, "roundId"),
  };
}

/** Routes are relative to the organization members mount supplied by the API app. */
export function createMemberRoutes(
  dependencies: MemberRouteDependencies,
): Hono<MemberRouteEnvironment> {
  const routes = new Hono<MemberRouteEnvironment>();

  routes.use("*", async (context, next) => {
    context.header("cache-control", "private, no-store");
    await next();
  });

  const poolGet = async (context: MemberContext): Promise<Response> => {
    const path = poolPath(context);
    const data = await dependencies.service.getReviewerPool(
      organizer(context, path.organizationId),
      path,
    );
    return context.json({ data });
  };
  const poolSet = async (context: MemberContext): Promise<Response> => {
    const path = poolPath(context);
    const input = await body<PoolBody>(context, poolSchema);
    const reviewers: ReviewerPoolGrantInput[] | undefined =
      input.reviewers === undefined
        ? undefined
        : input.reviewers.map((reviewer) => ({
            reviewerId: reviewer.reviewerId,
            ...(reviewer.maxAssignments === undefined
              ? {}
              : { maxAssignments: reviewer.maxAssignments }),
          }));
    const data = await dependencies.service.setReviewerPool(
      organizer(context, path.organizationId),
      {
        ...path,
        ...(input.reviewerIds === undefined ? {} : { reviewerIds: input.reviewerIds }),
        ...(reviewers === undefined ? {} : { reviewers }),
        ...(input.maxAssignmentsPerReviewer === undefined
          ? {}
          : { maxAssignmentsPerReviewer: input.maxAssignmentsPerReviewer }),
        ...(input.expectedVersion === undefined ? {} : { expectedVersion: input.expectedVersion }),
      },
    );
    return context.json({ data });
  };

  routes.get("/events/:eventId/rounds/:roundId/reviewer-pool", poolGet);
  routes.put("/events/:eventId/rounds/:roundId/reviewer-pool", poolSet);

  routes.post("/events/:eventId/rounds/:roundId/reviewer-pool/grants", async (context) => {
    const path = poolPath(context);
    const input = await body(context, reviewerGrantSchema);
    const maxAssignments = input.maxAssignments;
    if (maxAssignments === undefined) {
      throw new MemberServiceError("VALIDATION_ERROR", 400, "maxAssignments is required.");
    }
    const data = await dependencies.service.grantReviewer(organizer(context, path.organizationId), {
      ...path,
      reviewerId: input.reviewerId,
      maxAssignments,
    });
    return context.json({ data }, 201);
  });

  routes.delete(
    "/events/:eventId/rounds/:roundId/reviewer-pool/grants/:reviewerId",
    async (context) => {
      const path = poolPath(context);
      const input = context.req.query("expectedVersion");
      const expectedVersion =
        input === undefined ? undefined : z.coerce.number().int().positive().parse(input);
      const data = await dependencies.service.revokeReviewerGrant(
        organizer(context, path.organizationId),
        {
          ...path,
          reviewerId: routeParam(context, "reviewerId"),
          ...(expectedVersion === undefined ? {} : { expectedVersion }),
        },
      );
      return context.json({ data });
    },
  );

  routes.post(
    "/events/:eventId/rounds/:roundId/reviewer-pool/assignments/:reviewerId/reserve",
    async (context) => {
      const path = poolPath(context);
      const data = await dependencies.service.reserveReviewerAssignment(
        organizer(context, path.organizationId),
        { ...path, reviewerId: routeParam(context, "reviewerId") },
      );
      return context.json({ data });
    },
  );
  routes.get("/organizations", async (context) => {
    const currentOrganizationId = routeParam(context, "organizationId");
    const data = await dependencies.service.listOrganizations(
      memberActor(context, currentOrganizationId),
    );
    return context.json({ data });
  });

  routes.get("/organizations/:targetOrganizationId", async (context) => {
    const targetOrganizationId = organizationIdSchema.parse(
      context.req.param("targetOrganizationId"),
    );
    const data = await dependencies.service.getOrganization(
      memberActor(context, targetOrganizationId),
      { organizationId: targetOrganizationId },
    );
    return context.json({ data });
  });

  routes.post("/organizations/:targetOrganizationId/switch", async (context) => {
    const targetOrganizationId = organizationIdSchema.parse(
      context.req.param("targetOrganizationId"),
    );
    const data = await dependencies.service.switchOrganization(
      memberActor(context, targetOrganizationId),
      { organizationId: targetOrganizationId },
    );
    return context.json({ data });
  });

  routes.patch("/organizations/:targetOrganizationId", async (context) => {
    const targetOrganizationId = organizationIdSchema.parse(
      context.req.param("targetOrganizationId"),
    );
    const actor = memberActor(context, targetOrganizationId);
    const input = await body<UpdateOrganizationBody>(context, updateOrganizationSchema);
    const data = await dependencies.service.updateOrganization(actor, {
      organizationId: targetOrganizationId,
      ...(input.slug === undefined ? {} : { slug: input.slug }),
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.config === undefined ? {} : { config: input.config }),
    } satisfies UpdateOrganizationInput);
    return context.json({ data });
  });

  routes.get("/", async (context) => {
    const organizationId = routeParam(context, "organizationId");
    const data = await dependencies.service.listMembers(organizer(context, organizationId), {
      organizationId,
    });
    return context.json({ data });
  });

  const invite = async (context: MemberContext): Promise<Response> => {
    const organizationId = routeParam(context, "organizationId");
    const actor = organizer(context, organizationId);
    const input = await body<InviteBody>(context, inviteSchema);
    const data = await dependencies.service.inviteMember(actor, {
      organizationId,
      email: input.email,
      ...optionalName(input.name),
      role: input.role,
      idempotencyKey: idempotencyKey(context),
    });
    return context.json({ data }, data.created ? 201 : 200);
  };
  routes.post("/invitations", invite);

  const activate = async (context: MemberContext): Promise<Response> => {
    const input = await body(context, setupSchema);
    const data = await dependencies.service.activateMember({
      organizationId: routeParam(context, "organizationId"),
      token: input.token,
      ...optionalName(input.name),
      password: input.password,
    });
    return context.json({ data });
  };
  routes.post("/setup/activate", activate);

  const updateRole = async (context: MemberContext): Promise<Response> => {
    const organizationId = routeParam(context, "organizationId");
    const input = await body(context, roleUpdateSchema);
    const data = await dependencies.service.updateMemberRole(organizer(context, organizationId), {
      organizationId,
      userId: routeParam(context, "userId"),
      role: input.role as MemberRole,
    });
    return context.json({ data });
  };
  routes.patch("/:userId/role", updateRole);

  const revoke = async (context: MemberContext): Promise<Response> => {
    const organizationId = routeParam(context, "organizationId");
    const data = await dependencies.service.revokeMember(organizer(context, organizationId), {
      organizationId,
      userId: routeParam(context, "userId"),
    });
    return context.json({ data });
  };
  routes.delete("/:userId", revoke);

  routes.onError((error, context) => {
    if (error instanceof ZodError) {
      return errorResponse(
        context,
        400,
        "VALIDATION_FAILED",
        "The member request is invalid.",
        validationDetails(error),
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
    if (error instanceof MemberServiceError) return serviceErrorResponse(context, error);
    throw error;
  });

  return routes;
}

export const createMemberAdminRoutes = createMemberRoutes;
export const MEMBER_ADMIN_ROUTE_PREFIX = "/api/admin/organizations/:organizationId/members";
export const MEMBER_SETUP_ROUTE_PREFIX = "/api/admin/organizations/:organizationId/members/setup";
export const MEMBER_ORGANIZATION_ROUTE_PREFIX = `${MEMBER_ADMIN_ROUTE_PREFIX}/organizations`;
