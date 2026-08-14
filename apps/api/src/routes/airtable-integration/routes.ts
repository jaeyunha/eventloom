import { apiErrorSchema } from "@eventloom/contracts";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { AuthAccessError, type AuthPrincipal } from "../../features/auth/types";

export type AirtableIntegrationJson =
  | null
  | boolean
  | number
  | string
  | readonly AirtableIntegrationJson[]
  | { readonly [key: string]: AirtableIntegrationJson };

export interface AirtableIntegrationRouteEnvironment {
  Variables: {
    traceId: string;
    authPrincipal: AuthPrincipal | null;
  };
}

export type AirtableIntegrationRouteContext = Context<AirtableIntegrationRouteEnvironment>;

export interface AirtableAuthenticatedUserIdentity {
  readonly userId: string;
}

export interface AirtableIdempotentCommand extends AirtableAuthenticatedUserIdentity {
  readonly idempotencyKey: string;
}

export type AirtableConflictResolutionInput =
  | { readonly resolution: "use_d1" }
  | { readonly resolution: "use_airtable" }
  | {
      readonly resolution: "manual";
      readonly manualValue: { readonly valueJson: string };
    };

export interface AirtableIntegrationRouteDependencies {
  /** Browser origin permitted to issue session-authenticated mutations. */
  readonly webOrigin: string;
  /** Authorizes the current user for organizer administration of the organization. */
  readonly requireOrganizationAccess: (
    context: AirtableIntegrationRouteContext,
    organizationId: string,
  ) => void | Promise<void>;
  readonly getStatus: (organizationId: string) => Promise<AirtableIntegrationJson>;
  readonly startOAuth: (
    organizationId: string,
    command: AirtableIdempotentCommand,
  ) => Promise<AirtableIntegrationJson>;
  /** Completes OAuth after the provider state has recovered its organization from D1. */
  readonly completeOAuth: (input: {
    readonly code: string;
    readonly state: string;
  }) => Promise<Response>;
  /** Present only when explicitly enabled by the hosted runtime. */
  readonly connectPat?: (
    organizationId: string,
    input: { readonly token: string; readonly baseId: string },
    command: AirtableIdempotentCommand,
  ) => Promise<AirtableIntegrationJson>;
  readonly selectBase: (
    organizationId: string,
    input: { readonly baseId: string },
    command: AirtableIdempotentCommand,
  ) => Promise<AirtableIntegrationJson>;
  readonly updateMapping: (
    organizationId: string,
    input: { readonly mapping: Readonly<Record<string, string>> },
    command: AirtableIdempotentCommand,
  ) => Promise<AirtableIntegrationJson>;
  readonly pause: (
    organizationId: string,
    command: AirtableIdempotentCommand,
  ) => Promise<AirtableIntegrationJson>;
  readonly resume: (
    organizationId: string,
    command: AirtableIdempotentCommand,
  ) => Promise<AirtableIntegrationJson>;
  readonly disconnect: (
    organizationId: string,
    command: AirtableIdempotentCommand,
  ) => Promise<AirtableIntegrationJson>;
  readonly retry: (
    organizationId: string,
    command: AirtableIdempotentCommand,
  ) => Promise<AirtableIntegrationJson>;
  readonly listConflicts: (organizationId: string) => Promise<AirtableIntegrationJson>;
  readonly resolveConflict: (
    organizationId: string,
    conflictId: string,
    input: AirtableConflictResolutionInput & {
      readonly resolverId: string;
      readonly commandId: string;
    },
  ) => Promise<AirtableIntegrationJson>;
  /** Verifies and handles Airtable's raw notification request. */
  readonly handleWebhookNotification: (
    organizationId: string,
    registrationId: string,
    request: Request,
  ) => Promise<Response>;
}

class AirtableIntegrationRouteError extends Error {
  constructor(readonly message: string) {
    super(message);
    this.name = "AirtableIntegrationRouteError";
  }
}

const boundedIdentifier = z.string().trim().min(1).max(200);
const idempotencyKeySchema = z.string().trim().min(1).max(200);
const oauthCallbackSchema = z
  .object({
    code: z.string().trim().min(1).max(2_000),
    state: z.string().trim().min(1).max(2_000),
  })
  .strict();
const patSchema = z
  .object({ token: z.string().trim().min(1).max(2_000), baseId: boundedIdentifier })
  .strict();
const baseSchema = z.object({ baseId: boundedIdentifier }).strict();
const mappingSchema = z
  .object({
    mapping: z.record(z.string().trim().min(1).max(200), z.string().trim().min(1).max(200)),
  })
  .strict()
  .refine((value) => Object.keys(value.mapping).length > 0);
const resolutionSchema = z.discriminatedUnion("resolution", [
  z.object({ resolution: z.literal("use_d1") }).strict(),
  z.object({ resolution: z.literal("use_airtable") }).strict(),
  z
    .object({
      resolution: z.literal("manual"),
      manualValue: z.object({ valueJson: z.string().min(1).max(100_000) }).strict(),
    })
    .strict()
    .superRefine((value, context) => {
      try {
        JSON.parse(value.manualValue.valueJson);
      } catch {
        context.addIssue({ code: "custom", message: "manualValue.valueJson must be valid JSON" });
      }
    }),
]);

function errorResponse(
  context: AirtableIntegrationRouteContext,
  status: 400 | 401 | 403,
  code: "VALIDATION_FAILED" | "AUTHENTICATION_REQUIRED" | "ACCESS_DENIED",
  message: string,
): Response {
  return context.json(
    apiErrorSchema.parse({
      error: {
        code,
        message,
        traceId: context.get("traceId") ?? crypto.randomUUID(),
      },
    }),
    status,
  );
}

function organizationId(context: AirtableIntegrationRouteContext): string {
  const parsed = boundedIdentifier.safeParse(context.req.param("organizationId"));
  if (!parsed.success) {
    throw new AirtableIntegrationRouteError("The organization path parameter is invalid.");
  }
  return parsed.data;
}

function authenticatedUser(
  context: AirtableIntegrationRouteContext,
): AirtableAuthenticatedUserIdentity {
  const principal = context.get("authPrincipal");
  if (principal === null) {
    throw new AuthAccessError("UNAUTHENTICATED", "Authentication is required.");
  }
  if (principal.kind !== "user") {
    throw new AuthAccessError("FORBIDDEN", "Organizer session authentication is required.");
  }
  return { userId: principal.userId };
}

async function authorizedOrganization(
  context: AirtableIntegrationRouteContext,
  dependencies: AirtableIntegrationRouteDependencies,
): Promise<{ readonly organizationId: string; readonly user: AirtableAuthenticatedUserIdentity }> {
  const id = organizationId(context);
  const user = authenticatedUser(context);
  await dependencies.requireOrganizationAccess(context, id);
  return { organizationId: id, user };
}

async function authorizedMutation(
  context: AirtableIntegrationRouteContext,
  dependencies: AirtableIntegrationRouteDependencies,
): Promise<{ readonly organizationId: string; readonly user: AirtableAuthenticatedUserIdentity }> {
  const principal = context.get("authPrincipal");
  if (principal?.kind === "user" && context.req.header("origin") !== dependencies.webOrigin) {
    throw new AuthAccessError("FORBIDDEN", "Airtable mutations require the configured web origin.");
  }
  return authorizedOrganization(context, dependencies);
}

function command(
  context: AirtableIntegrationRouteContext,
  user: AirtableAuthenticatedUserIdentity,
): AirtableIdempotentCommand {
  const idempotencyKey = parse(idempotencyKeySchema, context.req.header("idempotency-key"));
  return { ...user, idempotencyKey };
}

async function requestBody(context: AirtableIntegrationRouteContext): Promise<unknown> {
  return context.req.json().catch(() => undefined);
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AirtableIntegrationRouteError("The Airtable integration request is invalid.");
  }
  return parsed.data;
}

function data(context: AirtableIntegrationRouteContext, value: AirtableIntegrationJson): Response {
  context.header("cache-control", "private, no-store");
  return context.json({ data: value });
}

function installErrorHandler(routes: Hono<AirtableIntegrationRouteEnvironment>): void {
  routes.onError((error, context) => {
    if (error instanceof AuthAccessError) {
      return errorResponse(
        context,
        error.status,
        error.code === "UNAUTHENTICATED" ? "AUTHENTICATION_REQUIRED" : "ACCESS_DENIED",
        error.message,
      );
    }
    if (error instanceof AirtableIntegrationRouteError || error instanceof z.ZodError) {
      return errorResponse(
        context,
        400,
        "VALIDATION_FAILED",
        "The Airtable integration request is invalid.",
      );
    }
    throw error;
  });
}

/** Organizer-only routes mounted below the canonical organization admin path. */
export function createAirtableIntegrationRoutes(
  dependencies: AirtableIntegrationRouteDependencies,
): Hono<AirtableIntegrationRouteEnvironment> {
  const routes = new Hono<AirtableIntegrationRouteEnvironment>();

  routes.get("/status", async (context) => {
    const authorized = await authorizedOrganization(context, dependencies);
    return data(context, await dependencies.getStatus(authorized.organizationId));
  });

  routes.post("/oauth/start", async (context) => {
    const authorized = await authorizedMutation(context, dependencies);
    return data(
      context,
      await dependencies.startOAuth(authorized.organizationId, command(context, authorized.user)),
    );
  });

  const connectPat = dependencies.connectPat;
  if (connectPat !== undefined) {
    routes.post("/pat", async (context) => {
      const authorized = await authorizedMutation(context, dependencies);
      const input = parse(patSchema, await requestBody(context));
      return data(
        context,
        await connectPat(authorized.organizationId, input, command(context, authorized.user)),
      );
    });
  }

  routes.put("/base", async (context) => {
    const authorized = await authorizedMutation(context, dependencies);
    const input = parse(baseSchema, await requestBody(context));
    return data(
      context,
      await dependencies.selectBase(
        authorized.organizationId,
        input,
        command(context, authorized.user),
      ),
    );
  });

  routes.put("/mapping", async (context) => {
    const authorized = await authorizedMutation(context, dependencies);
    const input = parse(mappingSchema, await requestBody(context));
    return data(
      context,
      await dependencies.updateMapping(
        authorized.organizationId,
        input,
        command(context, authorized.user),
      ),
    );
  });

  routes.post("/pause", async (context) => {
    const authorized = await authorizedMutation(context, dependencies);
    return data(
      context,
      await dependencies.pause(authorized.organizationId, command(context, authorized.user)),
    );
  });

  routes.post("/resume", async (context) => {
    const authorized = await authorizedMutation(context, dependencies);
    return data(
      context,
      await dependencies.resume(authorized.organizationId, command(context, authorized.user)),
    );
  });

  routes.delete("/connection", async (context) => {
    const authorized = await authorizedMutation(context, dependencies);
    return data(
      context,
      await dependencies.disconnect(authorized.organizationId, command(context, authorized.user)),
    );
  });

  routes.post("/retry", async (context) => {
    const authorized = await authorizedMutation(context, dependencies);
    return data(
      context,
      await dependencies.retry(authorized.organizationId, command(context, authorized.user)),
    );
  });

  routes.get("/conflicts", async (context) => {
    const authorized = await authorizedOrganization(context, dependencies);
    return data(context, await dependencies.listConflicts(authorized.organizationId));
  });

  routes.post("/conflicts/:conflictId/resolve", async (context) => {
    const authorized = await authorizedMutation(context, dependencies);
    const conflictId = parse(boundedIdentifier, context.req.param("conflictId"));
    const input = parse(resolutionSchema, await requestBody(context));
    const idempotentCommand = command(context, authorized.user);
    return data(
      context,
      await dependencies.resolveConflict(authorized.organizationId, conflictId, {
        ...input,
        resolverId: idempotentCommand.userId,
        commandId: idempotentCommand.idempotencyKey,
      }),
    );
  });

  installErrorHandler(routes);
  return routes;
}

/** Public provider callback routes. OAuth state is authenticated by the injected service. */
export function createAirtableOAuthCallbackRoutes(
  dependencies: AirtableIntegrationRouteDependencies,
): Hono<AirtableIntegrationRouteEnvironment> {
  const routes = new Hono<AirtableIntegrationRouteEnvironment>();

  routes.get("/oauth/callback", async (context) => {
    const input = parse(oauthCallbackSchema, {
      code: context.req.query("code"),
      state: context.req.query("state"),
    });
    return dependencies.completeOAuth(input);
  });

  installErrorHandler(routes);
  return routes;
}

/** Public provider webhook routes. The injected handler authenticates Airtable's raw request. */
export function createAirtableWebhookRoutes(
  dependencies: AirtableIntegrationRouteDependencies,
): Hono<AirtableIntegrationRouteEnvironment> {
  const routes = new Hono<AirtableIntegrationRouteEnvironment>();

  routes.post("/webhook/:registrationId", (context) =>
    dependencies.handleWebhookNotification(
      organizationId(context),
      context.req.param("registrationId"),
      context.req.raw,
    ),
  );

  installErrorHandler(routes);
  return routes;
}
