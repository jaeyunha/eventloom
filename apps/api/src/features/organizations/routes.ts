import { organizationEntitlementSchema } from "@eventloom/contracts";
import { type Context, Hono } from "hono";
import { ZodError, z } from "zod";
import { AuthAccessError } from "../auth/types";
import type { MemberRouteEnvironment } from "../members/routes";
import {
  type CreateOrganizationInput,
  type MemberService,
  MemberServiceError,
} from "../members/service";
import type { MemberActor } from "../members/types";
import {
  type OrganizationEntitlementCommandRepository,
  OrganizationEntitlementConflictError,
} from "./policy";

const identifierSchema = z.string().trim().min(1).max(200);
const organizationSchema = z
  .object({
    organizationId: identifierSchema,
    slug: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    name: z.string().trim().min(1).max(200),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
const provisionOrganizationSchema = organizationSchema
  .extend({
    ownerUserId: identifierSchema,
    entitlement: organizationEntitlementSchema,
  })
  .strict();
const updateEntitlementSchema = z
  .object({
    expectedRevision: z.int().nonnegative(),
    entitlement: organizationEntitlementSchema,
  })
  .strict();

type OrganizationRouteContext = Context<MemberRouteEnvironment>;

export interface SelfHostedOrganizationBootstrapDependencies {
  readonly service: Pick<MemberService, "createOrganization">;
  readonly authenticate: (request: Request) => boolean | Promise<boolean>;
}

export interface OrganizationProvisioningRouteDependencies {
  readonly service: Pick<MemberService, "provisionOrganization">;
  readonly entitlements: OrganizationEntitlementCommandRepository;
  readonly authenticate: (request: Request) => boolean | Promise<boolean>;
}

function routeError(
  context: OrganizationRouteContext,
  status: 400 | 401 | 403 | 404 | 409,
  code:
    | "AUTHENTICATION_REQUIRED"
    | "ACCESS_DENIED"
    | "VALIDATION_FAILED"
    | "NOT_FOUND"
    | "CONFLICT",
  message: string,
): Response {
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

function idempotencyKey(context: OrganizationRouteContext): string {
  const value = context.req.header("idempotency-key")?.trim();
  if (value === undefined || value.length === 0) {
    throw new MemberServiceError(
      "VALIDATION_ERROR",
      400,
      "An Idempotency-Key header is required for organization provisioning.",
    );
  }
  return value;
}

async function entitlementAuditId(organizationId: string, key: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${organizationId}\u0000${key}`),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
  return `organization-entitlement:${hex}`;
}

function organizationRouteError(error: Error, context: OrganizationRouteContext): Response {
  if (error instanceof AuthAccessError) {
    return routeError(
      context,
      error.status,
      error.code === "UNAUTHENTICATED" ? "AUTHENTICATION_REQUIRED" : "ACCESS_DENIED",
      error.message,
    );
  }
  if (error instanceof ZodError) {
    return routeError(context, 400, "VALIDATION_FAILED", "The request body is invalid.");
  }
  if (error instanceof MemberServiceError) {
    return routeError(
      context,
      error.status,
      error.code === "VALIDATION_ERROR"
        ? "VALIDATION_FAILED"
        : error.code === "NOT_FOUND"
          ? "NOT_FOUND"
          : "CONFLICT",
      error.message,
    );
  }
  if (error instanceof OrganizationEntitlementConflictError) {
    return routeError(context, 409, "CONFLICT", error.message);
  }
  throw error;
}

export function createSelfHostedOrganizationBootstrapRoutes(
  dependencies: SelfHostedOrganizationBootstrapDependencies,
): Hono<MemberRouteEnvironment> {
  const routes = new Hono<MemberRouteEnvironment>();

  routes.post("/bootstrap", async (context) => {
    if (!(await dependencies.authenticate(context.req.raw))) {
      throw new AuthAccessError("FORBIDDEN", "The operator bootstrap credential is invalid.");
    }
    const principal = context.get("authPrincipal");
    if (principal === null || principal === undefined) {
      throw new AuthAccessError("UNAUTHENTICATED", "Authentication is required.");
    }
    if (principal.kind !== "user") {
      throw new AuthAccessError("FORBIDDEN", "User session authentication is required.");
    }
    const input = organizationSchema.parse(await context.req.json().catch(() => undefined));
    const existingOwner = principal.memberships.find(
      (membership) =>
        membership.organizationId === input.organizationId && membership.role === "owner",
    );
    if (principal.memberships.length !== 0 && existingOwner === undefined) {
      throw new AuthAccessError(
        "FORBIDDEN",
        "Organization bootstrap requires an account without memberships.",
      );
    }

    const actor: MemberActor = {
      kind: "user",
      organizationId: input.organizationId,
      userId: principal.userId,
      role: "owner",
    };
    const data = await dependencies.service.createOrganization(
      actor,
      {
        organizationId: input.organizationId,
        slug: input.slug,
        name: input.name,
        ...(input.config === undefined ? {} : { config: input.config }),
        idempotencyKey: idempotencyKey(context),
      } satisfies CreateOrganizationInput,
      existingOwner === undefined ? "first-organization" : "existing-owner",
    );
    return context.json({ data }, 201);
  });

  routes.onError(organizationRouteError);

  return routes;
}

export function createOrganizationProvisioningRoutes(
  dependencies: OrganizationProvisioningRouteDependencies,
): Hono<MemberRouteEnvironment> {
  const routes = new Hono<MemberRouteEnvironment>();

  routes.post("/", async (context) => {
    if (!(await dependencies.authenticate(context.req.raw))) {
      throw new AuthAccessError("FORBIDDEN", "The provisioning credential is invalid.");
    }
    const input = provisionOrganizationSchema.parse(
      await context.req.json().catch(() => undefined),
    );
    const data = await dependencies.service.provisionOrganization({
      organizationId: input.organizationId,
      slug: input.slug,
      name: input.name,
      ownerUserId: input.ownerUserId,
      entitlement: input.entitlement,
      ...(input.config === undefined ? {} : { config: input.config }),
      idempotencyKey: idempotencyKey(context),
    });
    return context.json({ data }, 201);
  });

  routes.put("/:organizationId/entitlement", async (context) => {
    if (!(await dependencies.authenticate(context.req.raw))) {
      throw new AuthAccessError("FORBIDDEN", "The provisioning credential is invalid.");
    }
    const organizationId = identifierSchema.parse(context.req.param("organizationId"));
    const key = idempotencyKey(context);
    const input = updateEntitlementSchema.parse(await context.req.json().catch(() => undefined));
    if (input.entitlement.organizationId !== organizationId) {
      throw new MemberServiceError(
        "VALIDATION_ERROR",
        400,
        "The entitlement organization must match the route organization.",
      );
    }
    if (input.entitlement.revision <= input.expectedRevision) {
      throw new MemberServiceError(
        "VALIDATION_ERROR",
        400,
        "The entitlement revision must be greater than the expected revision.",
      );
    }
    const data = await dependencies.entitlements.putEntitlement(input.entitlement, {
      id: await entitlementAuditId(organizationId, key),
      traceId: context.get("traceId"),
      occurredAt: new Date().toISOString(),
      expectedRevision: input.expectedRevision,
    });
    return context.json({ data });
  });

  routes.onError(organizationRouteError);
  return routes;
}
