import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { RequestAuthenticator } from "../features/auth/authenticator";
import type {
  AuthSession,
  BetterAuthGateway,
  D1ApiKeyGateway,
  StoredApiKey,
} from "../features/auth/types";
import {
  type AuthMiddlewareEnvironment,
  createAuthenticationMiddleware,
  createTenantAuthorizationMiddleware,
} from "./auth";

const now = new Date("2026-08-08T12:00:00.000Z");
const traceId = "65f8d9b5-6862-4bbc-973c-f728e9185c22";

function createTestApp(input: {
  sessions?: ReadonlyMap<string, AuthSession>;
  apiKeys?: ReadonlyMap<string, StoredApiKey>;
}) {
  const betterAuth: BetterAuthGateway = {
    resolveSession: async (token) => input.sessions?.get(token) ?? null,
    requestMagicLink: async () => undefined,
    consumeMagicLink: async () => null,
  };
  const apiKeys: D1ApiKeyGateway = {
    findByPresentedKey: async (key) => input.apiKeys?.get(key) ?? null,
    recordSuccessfulUse: async () => undefined,
  };
  const authenticator = new RequestAuthenticator(betterAuth, apiKeys, {
    clock: { now: () => now },
  });
  const app = new Hono<AuthMiddlewareEnvironment>();

  app.use("*", async (context, next) => {
    context.set("traceId", traceId);
    await next();
  });
  app.use("*", createAuthenticationMiddleware(authenticator, { required: true }));
  app.get(
    "/organizations/:organizationId/events",
    createTenantAuthorizationMiddleware({
      organizationId: (context) => context.req.param("organizationId") ?? "",
      userRoles: ["owner", "admin"],
      apiKeyScope: "events:read",
    }),
    (context) => context.json({ actor: context.get("authPrincipal")?.kind }),
  );

  return app;
}

function validSession(): AuthSession {
  return {
    sessionId: "session-1",
    userId: "user-1",
    email: "organizer@example.com",
    emailVerified: true,
    expiresAt: new Date("2026-08-08T13:00:00.000Z"),
    memberships: [{ organizationId: "organization-1", role: "admin" }],
    speakerGrants: [],
  };
}

describe("authentication middleware", () => {
  it("returns a safe 401 response when authentication is missing", async () => {
    const response = await createTestApp({}).request(
      "https://api.example.com/organizations/organization-1/events",
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "UNAUTHENTICATED",
        message: "Authentication is required.",
        traceId,
      },
    });
  });

  it("permits an authorized organizer and denies the same session across tenants", async () => {
    const app = createTestApp({ sessions: new Map([["session-token", validSession()]]) });
    const headers = { cookie: "better-auth.session_token=session-token" };

    const allowed = await app.request(
      "https://api.example.com/organizations/organization-1/events",
      { headers },
    );
    const denied = await app.request(
      "https://api.example.com/organizations/organization-2/events",
      { headers },
    );

    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual({ actor: "user" });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ error: { code: "FORBIDDEN", traceId } });
  });

  it("permits only a same-tenant API key with the route scope", async () => {
    const activeKey: StoredApiKey = {
      id: "api-key-1",
      organizationId: "organization-1",
      label: "Read-only integration",
      scopes: ["events:read"],
      expiresAt: null,
      revokedAt: null,
    };
    const app = createTestApp({ apiKeys: new Map([["active-key", activeKey]]) });

    const allowed = await app.request(
      "https://api.example.com/organizations/organization-1/events",
      { headers: { authorization: "Bearer active-key" } },
    );
    const denied = await app.request(
      "https://api.example.com/organizations/organization-2/events",
      { headers: { authorization: "Bearer active-key" } },
    );

    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual({ actor: "apiKey" });
    expect(denied.status).toBe(403);
  });
});
