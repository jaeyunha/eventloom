import { apiErrorSchema, type ApiErrorCode } from "@open-sessionboard/contracts";
import { type Context, Hono } from "hono";
import { z, ZodError } from "zod";
import { requireOrganizationRole } from "../auth/authorization";
import { AuthAccessError, type UserPrincipal } from "../auth/types";
import {
  cfpFormSchema,
  eventCfpSchema,
  secondaryContactSchema,
  submissionParticipantSchema,
  submissionStepSchema,
} from "./model";
import { CfpError, type CfpService } from "./service";

export interface CfpRouteEnvironment {
  Variables: {
    traceId: string;
    authPrincipal: import("../auth/types").AuthPrincipal | null;
  };
}

export interface CfpRouteService
  extends Pick<
    CfpService,
    "saveEvent" | "saveForm" | "createDraft" | "saveDraft" | "review" | "submit"
  > {}

export interface CfpRouteDependencies {
  readonly service: CfpRouteService;
}

const identifierSchema = z.string().trim().min(1).max(128);
const idempotencyKeySchema = z.string().trim().min(1).max(512);
const expectedVersionSchema = z.number().int().positive();
const saveEventSchema = z
  .object({
    event: eventCfpSchema,
    expectedVersion: expectedVersionSchema.nullable(),
  })
  .strict();
const saveFormSchema = z
  .object({
    form: cfpFormSchema,
    expectedVersion: expectedVersionSchema.nullable(),
  })
  .strict();
const saveDraftSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    completedStep: submissionStepSchema.optional(),
    answers: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
const saveParticipantsSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    participants: z.array(submissionParticipantSchema).max(15),
    secondaryContacts: z.array(secondaryContactSchema).max(15).optional(),
  })
  .strict();
const submitSchema = z.object({ expectedVersion: expectedVersionSchema }).strict();

type CfpContext = Context<CfpRouteEnvironment>;
type ErrorStatus = 400 | 401 | 403 | 404 | 409;

interface ValidationIssue {
  readonly path: readonly (string | number)[];
  readonly code: string;
  readonly message: string;
}

function traceId(context: CfpContext): string {
  return context.get("traceId") ?? crypto.randomUUID();
}

function errorResponse(
  context: CfpContext,
  status: ErrorStatus,
  code: ApiErrorCode,
  message: string,
  details?: readonly ValidationIssue[],
): Response {
  return context.json(
    apiErrorSchema.parse({
      error: {
        code,
        message,
        traceId: traceId(context),
        ...(details === undefined || details.length === 0 ? {} : { details }),
      },
    }),
    status,
  );
}

function validationDetails(error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.filter(
      (segment): segment is string | number =>
        typeof segment === "string" || typeof segment === "number",
    ),
    code: issue.code,
    message: issue.message,
  }));
}

function cfpErrorDetails(details: unknown): ValidationIssue[] | undefined {
  const candidate =
    typeof details === "object" && details !== null && "issues" in details
      ? details.issues
      : details;
  if (!Array.isArray(candidate)) return undefined;

  const issues = candidate.flatMap((issue): ValidationIssue[] => {
    if (typeof issue !== "object" || issue === null) return [];
    const message = "message" in issue && typeof issue.message === "string" ? issue.message : null;
    if (!message) return [];
    const pathValue = "path" in issue ? issue.path : [];
    const path = Array.isArray(pathValue)
      ? pathValue.filter(
          (segment): segment is string | number =>
            typeof segment === "string" || typeof segment === "number",
        )
      : typeof pathValue === "string"
        ? [pathValue]
        : [];
    const code = "code" in issue && typeof issue.code === "string" ? issue.code : "invalid";
    return [{ path, code, message }];
  });
  return issues.length === 0 ? undefined : issues;
}

function cfpErrorResponse(context: CfpContext, error: CfpError): Response {
  switch (error.code) {
    case "NOT_FOUND":
      return errorResponse(context, 404, "NOT_FOUND", error.message);
    case "FORBIDDEN":
      return errorResponse(context, 403, "ACCESS_DENIED", error.message);
    case "VALIDATION_FAILED":
    case "IDEMPOTENCY_KEY_REQUIRED":
      return errorResponse(
        context,
        400,
        "VALIDATION_FAILED",
        error.message,
        cfpErrorDetails(error.details),
      );
    case "CONFLICT":
    case "FORM_LIMIT_REACHED":
    case "SUBMISSION_LIMIT_REACHED":
    case "CFP_NOT_OPEN":
    case "CFP_CLOSED":
    case "FORM_NOT_PUBLISHED":
    case "INVALID_TRANSITION":
      return errorResponse(context, 409, "CONFLICT", error.message, cfpErrorDetails(error.details));
  }
}

function routeParam(context: CfpContext, name: string): string {
  return identifierSchema.parse(context.req.param(name));
}

async function body<T>(context: CfpContext, schema: z.ZodType<T>): Promise<T> {
  const payload = await context.req.json().catch(() => undefined);
  return schema.parse(payload);
}

function idempotencyKey(context: CfpContext): string {
  const result = idempotencyKeySchema.safeParse(context.req.header("idempotency-key"));
  if (!result.success) {
    throw new CfpError(
      "IDEMPOTENCY_KEY_REQUIRED",
      "A valid Idempotency-Key header is required for this request.",
      { issues: result.error.issues },
    );
  }
  return result.data;
}

function applicant(context: CfpContext): UserPrincipal {
  const principal = context.get("authPrincipal");
  if (!principal) {
    throw new AuthAccessError("UNAUTHENTICATED", "Authentication is required.");
  }
  if (principal.kind !== "user") {
    throw new AuthAccessError("FORBIDDEN", "CFP submissions require a user session.");
  }
  return principal;
}

function organizer(context: CfpContext, organizationId: string): UserPrincipal {
  const principal = context.get("authPrincipal");
  if (!principal) {
    throw new AuthAccessError("UNAUTHENTICATED", "Authentication is required.");
  }
  return requireOrganizationRole(principal, organizationId, ["owner", "admin"]);
}

function assertEventPath(
  context: CfpContext,
  resource: { tenantId: string; eventId?: string; id: string },
  resourceName: "event" | "form",
): void {
  const organizationId = routeParam(context, "organizationId");
  const eventId = routeParam(context, "eventId");
  if (resource.tenantId !== organizationId) {
    throw new AuthAccessError("FORBIDDEN", "The CFP resource belongs to another organization.");
  }
  const resourceEventId = resourceName === "event" ? resource.id : resource.eventId;
  if (resourceEventId !== eventId) {
    throw new CfpError("VALIDATION_FAILED", `The ${resourceName} does not match the request path.`);
  }
  if (resourceName === "form" && resource.id !== routeParam(context, "formId")) {
    throw new CfpError("VALIDATION_FAILED", "The form does not match the request path.");
  }
}

export function createCfpRoutes(dependencies: CfpRouteDependencies): Hono<CfpRouteEnvironment> {
  const routes = new Hono<CfpRouteEnvironment>();

  routes.use("*", async (context, next) => {
    context.header("cache-control", "private, no-store");
    await next();
  });

  routes.put("/config", async (context) => {
    organizer(context, routeParam(context, "organizationId"));
    const input = await body(context, saveEventSchema);
    assertEventPath(context, input.event, "event");
    return context.json({
      data: await dependencies.service.saveEvent(input.event, input.expectedVersion),
    });
  });

  routes.put("/forms/:formId", async (context) => {
    organizer(context, routeParam(context, "organizationId"));
    const input = await body(context, saveFormSchema);
    assertEventPath(context, input.form, "form");
    return context.json({
      data: await dependencies.service.saveForm(input.form, input.expectedVersion),
    });
  });

  routes.post("/forms/:formId/drafts", async (context) => {
    const principal = applicant(context);
    const data = await dependencies.service.createDraft({
      tenantId: routeParam(context, "organizationId"),
      eventId: routeParam(context, "eventId"),
      formId: routeParam(context, "formId"),
      ownerAccountId: principal.userId,
      idempotencyKey: idempotencyKey(context),
    });
    return context.json({ data }, 201);
  });

  routes.patch("/submissions/:submissionId/draft", async (context) => {
    const principal = applicant(context);
    const input = await body(context, saveDraftSchema);
    const data = await dependencies.service.saveDraft({
      tenantId: routeParam(context, "organizationId"),
      submissionId: routeParam(context, "submissionId"),
      ownerAccountId: principal.userId,
      idempotencyKey: idempotencyKey(context),
      expectedVersion: input.expectedVersion,
      ...(input.completedStep === undefined ? {} : { completedStep: input.completedStep }),
      ...(input.answers === undefined ? {} : { answers: input.answers }),
    });
    return context.json({ data });
  });

  routes.put("/submissions/:submissionId/participants", async (context) => {
    const principal = applicant(context);
    const input = await body(context, saveParticipantsSchema);
    const data = await dependencies.service.saveDraft({
      tenantId: routeParam(context, "organizationId"),
      submissionId: routeParam(context, "submissionId"),
      ownerAccountId: principal.userId,
      idempotencyKey: idempotencyKey(context),
      expectedVersion: input.expectedVersion,
      completedStep: "participant",
      participants: input.participants,
      ...(input.secondaryContacts === undefined
        ? {}
        : { secondaryContacts: input.secondaryContacts }),
    });
    return context.json({ data });
  });

  routes.post("/submissions/:submissionId/review", async (context) => {
    const principal = applicant(context);
    const data = await dependencies.service.review({
      tenantId: routeParam(context, "organizationId"),
      submissionId: routeParam(context, "submissionId"),
      ownerAccountId: principal.userId,
      idempotencyKey: idempotencyKey(context),
    });
    return context.json({ data });
  });

  routes.post("/submissions/:submissionId/submit", async (context) => {
    const principal = applicant(context);
    const input = await body(context, submitSchema);
    const data = await dependencies.service.submit({
      tenantId: routeParam(context, "organizationId"),
      submissionId: routeParam(context, "submissionId"),
      ownerAccountId: principal.userId,
      idempotencyKey: idempotencyKey(context),
      expectedVersion: input.expectedVersion,
    });
    return context.json({ data });
  });

  routes.onError((error, context) => {
    if (error instanceof ZodError) {
      return errorResponse(
        context,
        400,
        "VALIDATION_FAILED",
        "The CFP request is invalid.",
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
    if (error instanceof CfpError) {
      return cfpErrorResponse(context, error);
    }
    throw error;
  });

  return routes;
}
