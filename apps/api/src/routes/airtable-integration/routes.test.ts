import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { AuthAccessError, type UserPrincipal } from "../../features/auth/types";
import {
  type AirtableIntegrationRouteDependencies,
  type AirtableIntegrationRouteEnvironment,
  createAirtableIntegrationRoutes,
  createAirtableOAuthCallbackRoutes,
  createAirtableWebhookRoutes,
} from "./routes";

const adminRoot = "/api/admin/organizations/org-a/integrations/airtable";
const callbackRoot = "/api/integrations/airtable";
const publicRoot = "/api/integrations/airtable/organizations/org-a";
const traceId = "00000000-0000-4000-8000-000000000001";
const webOrigin = "https://web.example.test";
const principal: UserPrincipal = {
  kind: "user",
  sessionId: "session-1",
  userId: "user-1",
  email: "organizer@example.test",
  memberships: [{ organizationId: "org-a", role: "admin" }],
  speakerGrants: [],
};

function dependencies(): AirtableIntegrationRouteDependencies {
  return {
    webOrigin,
    requireOrganizationAccess: vi.fn(),
    getStatus: vi.fn(async () => ({ state: "connected" })),
    startOAuth: vi.fn(async () => ({ authorizationUrl: "https://airtable.test/oauth" })),
    completeOAuth: vi.fn(async () => new Response(null, { status: 302 })),
    connectPat: vi.fn(async () => ({ state: "connected" })),
    selectBase: vi.fn(async () => ({ baseId: "app-base" })),
    updateMapping: vi.fn(async () => ({ configured: true })),
    pause: vi.fn(async () => ({ state: "paused" })),
    resume: vi.fn(async () => ({ state: "connected" })),
    disconnect: vi.fn(async () => ({ state: "disconnected" })),
    retry: vi.fn(async () => ({ queued: true })),
    listConflicts: vi.fn(async () => []),
    resolveConflict: vi.fn(async () => ({ resolved: true })),
    handleWebhookNotification: vi.fn(async () => new Response(null, { status: 204 })),
  };
}

function appFor(
  deps: AirtableIntegrationRouteDependencies,
  authPrincipal: UserPrincipal | null = principal,
) {
  const app = new Hono<AirtableIntegrationRouteEnvironment>();
  app.use("*", async (context, next) => {
    context.set("traceId", traceId);
    context.set("authPrincipal", authPrincipal);
    await next();
  });
  app.route(
    "/api/admin/organizations/:organizationId/integrations/airtable",
    createAirtableIntegrationRoutes(deps),
  );
  app.route(callbackRoot, createAirtableOAuthCallbackRoutes(deps));
  app.route(
    "/api/integrations/airtable/organizations/:organizationId",
    createAirtableWebhookRoutes(deps),
  );
  return app;
}

async function requestJson(
  app: ReturnType<typeof appFor>,
  path: string,
  method: string,
  body: unknown,
  withIdempotencyKey = true,
) {
  return app.request(path, {
    method,
    headers: {
      "content-type": "application/json",
      origin: webOrigin,
      ...(withIdempotencyKey ? { "idempotency-key": "command-1" } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function errorCode(response: Response): Promise<string> {
  return ((await response.json()) as { error: { code: string } }).error.code;
}

describe("Airtable integration routes", () => {
  it("exposes the canonical organizer contract and passes user identity plus idempotency", async () => {
    const deps = dependencies();
    const app = appFor(deps);
    const cases: readonly [string, string, unknown?][] = [
      ["GET", "/status"],
      ["POST", "/oauth/start", {}],
      ["POST", "/pat", { token: "pat-token", baseId: "app-base" }],
      ["PUT", "/base", { baseId: "app-base" }],
      ["PUT", "/mapping", { mapping: { sessions: "Sessions" } }],
      ["POST", "/pause", {}],
      ["POST", "/resume", {}],
      ["DELETE", "/connection", {}],
      ["POST", "/retry", {}],
      ["GET", "/conflicts"],
      ["POST", "/conflicts/conflict-1/resolve", { resolution: "use_airtable" }],
    ];

    for (const [method, path, body] of cases) {
      const response =
        body === undefined
          ? await app.request(`${adminRoot}${path}`, {
              method,
              ...(method === "GET" ? {} : { headers: { origin: webOrigin } }),
            })
          : await requestJson(app, `${adminRoot}${path}`, method, body);
      expect(response.status).toBeLessThan(400);
    }

    expect(deps.requireOrganizationAccess).toHaveBeenCalledTimes(cases.length);
    expect(deps.startOAuth).toHaveBeenCalledWith("org-a", {
      userId: "user-1",
      idempotencyKey: "command-1",
    });
    expect(deps.connectPat).toHaveBeenCalledWith(
      "org-a",
      { token: "pat-token", baseId: "app-base" },
      { userId: "user-1", idempotencyKey: "command-1" },
    );
    expect(deps.selectBase).toHaveBeenCalledWith(
      "org-a",
      { baseId: "app-base" },
      { userId: "user-1", idempotencyKey: "command-1" },
    );
    expect(deps.updateMapping).toHaveBeenCalledWith(
      "org-a",
      { mapping: { sessions: "Sessions" } },
      { userId: "user-1", idempotencyKey: "command-1" },
    );
    expect(deps.resolveConflict).toHaveBeenCalledWith("org-a", "conflict-1", {
      resolution: "use_airtable",
      resolverId: "user-1",
      commandId: "command-1",
    });
  });

  it("requires an authenticated user before organization authorization", async () => {
    const deps = dependencies();
    const response = await appFor(deps, null).request(`${adminRoot}/status`);

    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe("AUTHENTICATION_REQUIRED");
    expect(deps.requireOrganizationAccess).not.toHaveBeenCalled();
    expect(deps.getStatus).not.toHaveBeenCalled();
  });

  it("rejects unauthorized organization access before service calls", async () => {
    const deps = dependencies();
    const requireOrganizationAccess = deps.requireOrganizationAccess as ReturnType<typeof vi.fn>;
    requireOrganizationAccess.mockRejectedValue(
      new AuthAccessError("FORBIDDEN", "Organization access is required."),
    );
    const response = await appFor(deps).request(`${adminRoot}/status`);

    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("ACCESS_DENIED");
    expect(deps.getStatus).not.toHaveBeenCalled();
  });

  it("does not mount the PAT route unless PAT connections are enabled", async () => {
    const { connectPat: _connectPat, ...withoutPat } = dependencies();
    const response = await requestJson(appFor(withoutPat), `${adminRoot}/pat`, "POST", {
      token: "pat-token",
      baseId: "app-base",
    });

    expect(response.status).toBe(404);
  });

  it("requires Idempotency-Key on every organizer mutation", async () => {
    const deps = dependencies();
    const response = await requestJson(appFor(deps), `${adminRoot}/pause`, "POST", {}, false);

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("VALIDATION_FAILED");
    expect(deps.pause).not.toHaveBeenCalled();
  });

  it("requires the configured origin for session-authenticated mutations", async () => {
    const deps = dependencies();
    const response = await appFor(deps).request(`${adminRoot}/pause`, {
      method: "POST",
      headers: {
        "idempotency-key": "command-1",
        origin: "https://attacker.example.test",
      },
    });

    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("ACCESS_DENIED");
    expect(deps.pause).not.toHaveBeenCalled();
  });

  it.each([
    [{ resolution: "use_d1", manualValue: { valueJson: "1" } }],
    [{ resolution: "manual" }],
    [{ resolution: "manual", manualValue: { valueJson: "not json" } }],
    [{ resolution: "other" }],
  ])("rejects invalid discriminated conflict input %#", async (body) => {
    const deps = dependencies();
    const response = await requestJson(
      appFor(deps),
      `${adminRoot}/conflicts/conflict-1/resolve`,
      "POST",
      body,
    );

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("VALIDATION_FAILED");
    expect(deps.resolveConflict).not.toHaveBeenCalled();
  });

  it("passes valid manual JSON as the manual conflict value", async () => {
    const deps = dependencies();
    const response = await requestJson(
      appFor(deps),
      `${adminRoot}/conflicts/conflict-1/resolve`,
      "POST",
      { resolution: "manual", manualValue: { valueJson: '{"title":"Chosen"}' } },
    );

    expect(response.status).toBe(200);
    expect(deps.resolveConflict).toHaveBeenCalledWith("org-a", "conflict-1", {
      resolution: "manual",
      manualValue: { valueJson: '{"title":"Chosen"}' },
      resolverId: "user-1",
      commandId: "command-1",
    });
  });

  it("keeps the OAuth callback public and delegates provider state verification", async () => {
    const deps = dependencies();
    const response = await appFor(deps, null).request(
      `${callbackRoot}/oauth/callback?code=oauth-code&state=oauth-state`,
    );

    expect(response.status).toBe(302);
    expect(deps.requireOrganizationAccess).not.toHaveBeenCalled();
    expect(deps.completeOAuth).toHaveBeenCalledWith({
      code: "oauth-code",
      state: "oauth-state",
    });
  });

  it("hands public webhook notifications to the provider-authenticated raw handler", async () => {
    const deps = dependencies();
    const payload = JSON.stringify({ base: { id: "app-base" } });
    const response = await appFor(deps, null).request(`${publicRoot}/webhook/hook_local_1`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-airtable-content-mac": "signature",
      },
      body: payload,
    });

    expect(response.status).toBe(204);
    expect(deps.requireOrganizationAccess).not.toHaveBeenCalled();
    const handleWebhookNotification = deps.handleWebhookNotification as ReturnType<typeof vi.fn>;
    const call = handleWebhookNotification.mock.calls[0];
    if (call === undefined) throw new Error("Expected a webhook handoff.");
    const [organizationId, registrationId, request] = call;
    expect(organizationId).toBe("org-a");
    expect(registrationId).toBe("hook_local_1");
    expect(request.headers.get("x-airtable-content-mac")).toBe("signature");
    expect(await request.text()).toBe(payload);
  });
});
