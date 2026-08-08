import { Hono, type Context } from "hono";
import { ZodError, z } from "zod";
import type { AuthPrincipal } from "../../features/auth/types";
import {
  type CreateWebhookSubscriptionInput,
  type UpdateWebhookSubscriptionInput,
  type WebhookSubscriptionRepository,
  WebhookRepositoryError,
  type WebhookSubscriptionRecord,
  toWebhookSubscriptionView,
} from "./types";

export interface WebhookRouteEnvironment {
  Variables: {
    authPrincipal?: AuthPrincipal | null;
    traceId?: string;
  };
}

export class WebhookRouteError extends Error {
  readonly code: string;
  readonly status: 400 | 401 | 403 | 404 | 409;

  constructor(
    code: string,
    message: string,
    status: 400 | 401 | 403 | 404 | 409,
  ) {
    super(message);
    this.name = "WebhookRouteError";
    this.code = code;
    this.status = status;
  }
}

const eventNameSchema = z.string().trim().min(1).max(200);
const webhookEndpointSchema = z.url().refine((value) => {
  const endpoint = new URL(value);
  return (
    endpoint.protocol === "https:" &&
    endpoint.username.length === 0 &&
    endpoint.password.length === 0
  );
}, "Webhook endpoints must use HTTPS and cannot contain credentials.");
const createSubscriptionSchema = z
  .object({
    endpointUrl: webhookEndpointSchema,
    events: z.array(eventNameSchema).min(1).max(100),
    active: z.boolean().optional(),
    signingSecret: z.string().min(32).max(512).optional(),
    eventId: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

const updateSubscriptionSchema = z
  .object({
    endpointUrl: webhookEndpointSchema.optional(),
    events: z.array(eventNameSchema).min(1).max(100).optional(),
    active: z.boolean().optional(),
    signingSecret: z.string().min(32).max(512).optional(),
    eventId: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .strict();

function traceId(context: Context<WebhookRouteEnvironment>): string {
  return context.get("traceId") ?? crypto.randomUUID();
}

function errorBody(context: Context<WebhookRouteEnvironment>, code: string, message: string) {
  return { error: { code, message, traceId: traceId(context) } };
}

function requireApiKey(
  context: Context<WebhookRouteEnvironment>,
  organizationId: string,
  scope: "webhooks:read" | "webhooks:write",
): void {
  const principal = context.get("authPrincipal");
  if (!principal) {
    throw new WebhookRouteError("AUTHENTICATION_REQUIRED", "Authentication is required.", 401);
  }
  if (
    principal.kind !== "apiKey" ||
    principal.organizationId !== organizationId ||
    !principal.scopes.includes(scope)
  ) {
    throw new WebhookRouteError(
      "ACCESS_DENIED",
      "The API key cannot access this organization or webhook scope.",
      403,
    );
  }
}

async function requestBody(context: Context<WebhookRouteEnvironment>): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return undefined;
  }
}

function parseCreate(body: unknown, organizationId: string): CreateWebhookSubscriptionInput {
  const parsed = createSubscriptionSchema.safeParse(body);
  if (!parsed.success) throw new WebhookRouteError("INVALID_INPUT", "The webhook payload is invalid.", 400);
  return {
    organizationId,
    endpointUrl: parsed.data.endpointUrl,
    events: parsed.data.events,
    ...(parsed.data.active === undefined ? {} : { active: parsed.data.active }),
    ...(parsed.data.signingSecret === undefined
      ? {}
      : { signingSecret: parsed.data.signingSecret }),
    ...(parsed.data.eventId === undefined ? {} : { eventId: parsed.data.eventId }),
  };
}

function parseUpdate(body: unknown): UpdateWebhookSubscriptionInput {
  const parsed = updateSubscriptionSchema.safeParse(body);
  if (!parsed.success) throw new WebhookRouteError("INVALID_INPUT", "The webhook payload is invalid.", 400);
  return {
    ...(parsed.data.endpointUrl === undefined
      ? {}
      : { endpointUrl: parsed.data.endpointUrl }),
    ...(parsed.data.events === undefined ? {} : { events: parsed.data.events }),
    ...(parsed.data.active === undefined ? {} : { active: parsed.data.active }),
    ...(parsed.data.signingSecret === undefined
      ? {}
      : { signingSecret: parsed.data.signingSecret }),
    ...(parsed.data.eventId === undefined ? {} : { eventId: parsed.data.eventId }),
  };
}

function notFound(): never {
  throw new WebhookRouteError("NOT_FOUND", "The webhook subscription was not found.", 404);
}

function view(subscription: WebhookSubscriptionRecord) {
  return toWebhookSubscriptionView(subscription);
}

/**
 * Subscription routes are relative to the mount point. Mount with
 * `/api/v1/organizations/:organizationId/webhooks`; no application wiring is
 * performed here so the routes remain independently testable and composable.
 */
export function createWebhookSubscriptionRoutes(
  repository: WebhookSubscriptionRepository,
): Hono<WebhookRouteEnvironment> {
  const routes = new Hono<WebhookRouteEnvironment>();

  routes.get("/", async (context) => {
    const organizationId = context.req.param("organizationId");
    requireApiKey(context, organizationId, "webhooks:read");
    const subscriptions = await repository.listSubscriptions(organizationId);
    return context.json({ data: subscriptions.map(view) });
  });

  routes.post("/", async (context) => {
    const organizationId = context.req.param("organizationId");
    requireApiKey(context, organizationId, "webhooks:write");
    const input = parseCreate(await requestBody(context), organizationId);
    const subscription = await repository.createSubscription(input);
    return context.json({ data: view(subscription) }, 201);
  });

  routes.get("/:subscriptionId", async (context) => {
    const organizationId = context.req.param("organizationId");
    requireApiKey(context, organizationId, "webhooks:read");
    const subscription = await repository.getSubscription(
      organizationId,
      context.req.param("subscriptionId"),
    );
    if (!subscription) notFound();
    return context.json({ data: view(subscription) });
  });

  const update = async (context: Context<WebhookRouteEnvironment>) => {
    const organizationId = context.req.param("organizationId");
    requireApiKey(context, organizationId, "webhooks:write");
    const subscription = await repository.updateSubscription(
      organizationId,
      context.req.param("subscriptionId"),
      parseUpdate(await requestBody(context)),
    );
    if (!subscription) notFound();
    return context.json({ data: view(subscription) });
  };
  routes.patch("/:subscriptionId", update);
  routes.put("/:subscriptionId", update);

  routes.delete("/:subscriptionId", async (context) => {
    const organizationId = context.req.param("organizationId");
    requireApiKey(context, organizationId, "webhooks:write");
    const deleted = await repository.deleteSubscription(
      organizationId,
      context.req.param("subscriptionId"),
    );
    if (!deleted) notFound();
    return context.json({ data: { deleted: true } });
  });

  routes.onError((error, context) => {
    if (error instanceof WebhookRouteError) {
      return context.json(errorBody(context, error.code, error.message), error.status);
    }
    if (error instanceof WebhookRepositoryError) {
      return context.json(errorBody(context, `WEBHOOK_${error.code}`, error.message), error.status);
    }
    if (error instanceof ZodError) {
      return context.json(errorBody(context, "INVALID_INPUT", "The webhook payload is invalid."), 400);
    }
    return context.json(errorBody(context, "INTERNAL_ERROR", "The webhook request could not be completed."), 500);
  });

  return routes;
}

