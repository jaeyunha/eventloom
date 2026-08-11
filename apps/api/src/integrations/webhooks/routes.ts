import { type Context, Hono } from "hono";
import { ZodError, z } from "zod";
import type { AuthPrincipal } from "../../features/auth/types";
import {
  type CreateWebhookSubscriptionInput,
  toWebhookSubscriptionView,
  type UpdateWebhookSubscriptionInput,
  WebhookRepositoryError,
  type WebhookSubscriptionRecord,
  type WebhookSubscriptionRepository,
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

  constructor(code: string, message: string, status: 400 | 401 | 403 | 404 | 409) {
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

function requiredRouteParam(context: Context<WebhookRouteEnvironment>, name: string): string {
  const value = context.req.param(name);
  if (value === undefined || value.trim().length === 0) {
    throw new WebhookRouteError("INVALID_INPUT", `The ${name} path parameter is required.`, 400);
  }
  return value;
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
  if (!parsed.success)
    throw new WebhookRouteError("INVALID_INPUT", "The webhook payload is invalid.", 400);
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
  if (!parsed.success)
    throw new WebhookRouteError("INVALID_INPUT", "The webhook payload is invalid.", 400);
  return {
    ...(parsed.data.endpointUrl === undefined ? {} : { endpointUrl: parsed.data.endpointUrl }),
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

const webhookPathParameters = [
  {
    name: "organizationId",
    in: "path",
    required: true,
    schema: { type: "string", minLength: 1, maxLength: 200 },
  },
] as const;

const webhookSubscriptionPropertySchemas = {
  endpointUrl: { type: "string", format: "uri", pattern: "^https://" },
  events: {
    type: "array",
    minItems: 1,
    maxItems: 100,
    items: { type: "string", minLength: 1, maxLength: 200 },
  },
  active: { type: "boolean" },
  signingSecret: { type: "string", minLength: 32, maxLength: 512 },
  eventId: { type: ["string", "null"], minLength: 1, maxLength: 200 },
} as const;

const webhookSubscriptionCreateOpenApiSchema = {
  type: "object",
  required: ["endpointUrl", "events"],
  properties: {
    ...webhookSubscriptionPropertySchemas,
    eventId: { type: "string", minLength: 1, maxLength: 200 },
  },
  additionalProperties: false,
} as const;

const webhookSubscriptionUpdateOpenApiSchema = {
  type: "object",
  properties: webhookSubscriptionPropertySchemas,
  additionalProperties: false,
} as const;

function webhookOpenApiOperation(
  scope: "webhooks:read" | "webhooks:write",
  operationId: string,
  summary: string,
  successStatus: "200" | "201" = "200",
  requestSchema?: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    tags: ["Webhooks"],
    operationId,
    summary,
    security: [{ apiKey: [scope] }],
    ...(requestSchema === undefined
      ? {}
      : {
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: requestSchema,
              },
            },
          },
        }),
    responses: {
      [successStatus]: { description: "Webhook subscription operation succeeded." },
      "400": { description: "The request is invalid." },
      "401": { description: "Authentication is required." },
      "403": { description: "The API key lacks the required organization scope." },
      "404": { description: "The webhook subscription was not found." },
      "409": { description: "The webhook subscription conflicts with current state." },
      "500": { description: "The webhook request could not be completed." },
    },
  };
}

export const webhookSubscriptionOpenApiPaths: Readonly<Record<string, unknown>> = {
  "/api/v1/organizations/{organizationId}/webhooks": {
    parameters: webhookPathParameters,
    get: webhookOpenApiOperation(
      "webhooks:read",
      "listWebhookSubscriptions",
      "List webhook subscriptions",
    ),
    post: webhookOpenApiOperation(
      "webhooks:write",
      "createWebhookSubscription",
      "Create a webhook subscription",
      "201",
      webhookSubscriptionCreateOpenApiSchema,
    ),
  },
  "/api/v1/organizations/{organizationId}/webhooks/{subscriptionId}": {
    parameters: [
      ...webhookPathParameters,
      {
        name: "subscriptionId",
        in: "path",
        required: true,
        schema: { type: "string", minLength: 1, maxLength: 200 },
      },
    ],
    get: webhookOpenApiOperation(
      "webhooks:read",
      "getWebhookSubscription",
      "Get a webhook subscription",
    ),
    patch: webhookOpenApiOperation(
      "webhooks:write",
      "updateWebhookSubscription",
      "Update a webhook subscription",
      "200",
      webhookSubscriptionUpdateOpenApiSchema,
    ),
    put: webhookOpenApiOperation(
      "webhooks:write",
      "replaceWebhookSubscription",
      "Update a webhook subscription",
      "200",
      webhookSubscriptionUpdateOpenApiSchema,
    ),
    delete: webhookOpenApiOperation(
      "webhooks:write",
      "deleteWebhookSubscription",
      "Delete a webhook subscription",
    ),
  },
};

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
    const organizationId = requiredRouteParam(context, "organizationId");
    requireApiKey(context, organizationId, "webhooks:read");
    const subscriptions = await repository.listSubscriptions(organizationId);
    return context.json({ data: subscriptions.map(view) });
  });

  routes.post("/", async (context) => {
    const organizationId = requiredRouteParam(context, "organizationId");
    requireApiKey(context, organizationId, "webhooks:write");
    const input = parseCreate(await requestBody(context), organizationId);
    const subscription = await repository.createSubscription(input);
    return context.json({ data: view(subscription) }, 201);
  });

  routes.get("/:subscriptionId", async (context) => {
    const organizationId = requiredRouteParam(context, "organizationId");
    requireApiKey(context, organizationId, "webhooks:read");
    const subscription = await repository.getSubscription(
      organizationId,
      requiredRouteParam(context, "subscriptionId"),
    );
    if (!subscription) notFound();
    return context.json({ data: view(subscription) });
  });

  const update = async (context: Context<WebhookRouteEnvironment>) => {
    const organizationId = requiredRouteParam(context, "organizationId");
    requireApiKey(context, organizationId, "webhooks:write");
    const subscription = await repository.updateSubscription(
      organizationId,
      requiredRouteParam(context, "subscriptionId"),
      parseUpdate(await requestBody(context)),
    );
    if (!subscription) notFound();
    return context.json({ data: view(subscription) });
  };
  routes.patch("/:subscriptionId", update);
  routes.put("/:subscriptionId", update);

  routes.delete("/:subscriptionId", async (context) => {
    const organizationId = requiredRouteParam(context, "organizationId");
    requireApiKey(context, organizationId, "webhooks:write");
    const deleted = await repository.deleteSubscription(
      organizationId,
      requiredRouteParam(context, "subscriptionId"),
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
      return context.json(
        errorBody(context, "INVALID_INPUT", "The webhook payload is invalid."),
        400,
      );
    }
    return context.json(
      errorBody(context, "INTERNAL_ERROR", "The webhook request could not be completed."),
      500,
    );
  });

  return routes;
}
