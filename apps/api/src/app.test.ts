import { apiErrorSchema, healthResponseSchema } from "@eventloom/contracts";
import { describe, expect, it } from "vitest";
import { type ApiBindings, createApp } from "./app";
import { AuthAccessError, type AuthPrincipal, type UserPrincipal } from "./features/auth/types";
import { CommunicationError } from "./features/communications/service";
import { RemixError } from "./features/remix/service";
import { ReportError } from "./features/reports/service";
import { SessionServiceError } from "./features/sessions/service";
import type { AirtableIntegrationRouteDependencies } from "./routes/airtable-integration/routes";

const environment: ApiBindings = {
  APP_ENV: "local",
  WEB_ORIGIN: "http://127.0.0.1:3015",
};

const requestId = "65f8d9b5-6862-4bbc-973c-f728e9185c22";

describe("API foundation", () => {
  it("serves a contract-valid health response with a stable trace ID", async () => {
    const response = await createApp().request(
      "/api/health",
      { headers: { "x-request-id": requestId } },
      environment,
    );
    const body = healthResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({ service: "api", environment: "local", traceId: requestId });
  });

  it("returns a safe structured error when required configuration is invalid", async () => {
    const response = await createApp().request(
      "/api/health",
      { headers: { "x-request-id": requestId } },
      { APP_ENV: "production", WEB_ORIGIN: "not a URL" },
    );
    const body = apiErrorSchema.parse(await response.json());

    expect(response.status).toBe(503);
    expect(body).toEqual({
      error: {
        code: "CONFIGURATION_ERROR",
        message: "The API environment is not configured.",
        traceId: requestId,
      },
    });
    expect(JSON.stringify(body)).not.toContain("not a URL");
  });

  it("allows credentialed CORS only for the configured web origin", async () => {
    const app = createApp();
    const allowed = await app.request(
      "/api/health",
      { headers: { Origin: environment.WEB_ORIGIN } },
      environment,
    );
    const rejected = await app.request(
      "/api/health",
      { headers: { Origin: "https://attacker.example" } },
      environment,
    );

    expect(allowed.headers.get("access-control-allow-origin")).toBe(environment.WEB_ORIGIN);
    expect(allowed.headers.get("access-control-allow-credentials")).toBe("true");
    expect(rejected.headers.has("access-control-allow-origin")).toBe(false);
  });

  it("blocks hostile-origin text/plain cookie mutations before protected services run", async () => {
    let closeCalls = 0;
    const principal: UserPrincipal = {
      kind: "user",
      sessionId: "session-1",
      userId: "user-1",
      email: "organizer@example.test",
      memberships: [{ organizationId: "org-a", role: "admin" }],
      speakerGrants: [],
    };
    const app = createApp({
      authenticator: { authenticate: async () => principal },
      evaluations: {
        actorFor: async () => ({ kind: "organizer", tenantId: "org-a", userId: "user-1" }) as never,
        service: {
          closePlan: async () => {
            closeCalls += 1;
            return { id: "plan-1", version: 2, status: "closed" };
          },
        } as never,
      },
    });
    const production = { APP_ENV: "production", WEB_ORIGIN: "https://web.example.test" };
    const request = (origin: string) =>
      app.request(
        "/api/admin/evaluations/plans/plan-1/close",
        {
          method: "POST",
          headers: {
            cookie: "__Secure-better-auth.session_token=opaque",
            origin,
            "content-type": "text/plain",
          },
          body: JSON.stringify({ expectedVersion: 1 }),
        },
        production,
      );

    const blocked = await request("https://evil.example.test");
    expect(blocked.status).toBe(403);
    expect(closeCalls).toBe(0);
    const allowed = await request(production.WEB_ORIGIN);
    expect(allowed.status).toBe(200);
    expect(closeCalls).toBe(1);
  });

  it("uses the same safe error envelope for unknown routes", async () => {
    const response = await createApp().request("/unknown", {}, environment);
    const body = apiErrorSchema.parse(await response.json());

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(response.headers.get("x-request-id")).toBe(body.error.traceId);
  });
});

describe("Airtable OAuth callback wiring", () => {
  it("mounts the provider callback at its static URL and leaves organization routing to opaque state", async () => {
    let callback: { readonly code: string; readonly state: string } | null = null;
    const integration: AirtableIntegrationRouteDependencies = {
      webOrigin: environment.WEB_ORIGIN,
      requireOrganizationAccess: async () => {},
      getStatus: async () => null,
      startOAuth: async () => null,
      completeOAuth: async (...args: unknown[]) => {
        callback = args.at(-1) as { readonly code: string; readonly state: string };
        return new Response(null, { status: 204 });
      },
      connectPat: async () => null,
      selectBase: async () => null,
      updateMapping: async () => null,
      pause: async () => null,
      resume: async () => null,
      disconnect: async () => null,
      retry: async () => null,
      listConflicts: async () => null,
      resolveConflict: async () => null,
      handleWebhookNotification: async () => new Response(null, { status: 204 }),
    };
    const app = createApp({
      authenticator: { authenticate: async () => null },
      airtableIntegration: integration,
    });

    const callbackResponse = await app.request(
      "/api/integrations/airtable/oauth/callback?code=oauth-code&state=opaque-state",
      undefined,
      environment,
    );
    const legacyResponse = await app.request(
      "/api/integrations/airtable/organizations/org-a/oauth/callback?code=oauth-code&state=opaque-state",
      undefined,
      environment,
    );

    expect(callbackResponse.status).toBe(204);
    expect(callback).toEqual({ code: "oauth-code", state: "opaque-state" });
    expect(legacyResponse.status).toBe(404);
  });
});

describe("Airtable integration origin protection", () => {
  it("rejects cross-origin session mutations while leaving public provider routes exempt", async () => {
    const principal: UserPrincipal = {
      kind: "user",
      sessionId: "session-1",
      userId: "user-1",
      email: "organizer@example.test",
      memberships: [{ organizationId: "org-a", role: "admin" }],
      speakerGrants: [],
    };
    const integration: AirtableIntegrationRouteDependencies = {
      webOrigin: environment.WEB_ORIGIN,
      requireOrganizationAccess: async () => {},
      getStatus: async () => null,
      startOAuth: async () => ({ authorizationUrl: "https://airtable.example.test/oauth" }),
      completeOAuth: async () => new Response(null, { status: 204 }),
      selectBase: async () => null,
      updateMapping: async () => null,
      pause: async () => null,
      resume: async () => null,
      disconnect: async () => null,
      retry: async () => null,
      listConflicts: async () => null,
      resolveConflict: async () => null,
      handleWebhookNotification: async () => new Response(null, { status: 204 }),
    };
    const app = createApp({
      authenticator: { authenticate: async () => principal },
      airtableIntegration: integration,
    });

    const blocked = await app.request(
      "/api/admin/organizations/org-a/integrations/airtable/oauth/start",
      {
        method: "POST",
        headers: {
          "idempotency-key": "command-1",
          origin: "https://attacker.example.test",
        },
      },
      environment,
    );
    const callback = await app.request(
      "/api/integrations/airtable/oauth/callback?code=oauth-code&state=opaque-state",
      undefined,
      environment,
    );

    expect(blocked.status).toBe(403);
    expect(apiErrorSchema.parse(await blocked.json()).error.code).toBe("ACCESS_DENIED");
    expect(callback.status).toBe(204);
  });
});

describe("authentication session access", () => {
  it("enriches Better Auth sessions with membership and speaker-grant routing data", async () => {
    const principal: AuthPrincipal = {
      kind: "user",
      sessionId: "session-1",
      userId: "user-1",
      email: "user@example.test",
      memberships: [{ organizationId: "ai-engineer", role: "admin" }],
      speakerGrants: [
        {
          organizationId: "ai-engineer",
          speakerProfileId: "speaker-1",
        },
      ],
    };
    const app = createApp({
      auth: {
        handler: async () =>
          new Response(
            JSON.stringify({
              session: { id: principal.sessionId, userId: principal.userId },
              user: { id: principal.userId, email: principal.email },
            }),
            {
              headers: {
                "content-type": "application/json",
                "x-auth-source": "better-auth",
              },
            },
          ),
      },
      authenticator: { authenticate: async () => principal },
    });

    const response = await app.request(
      "/api/auth/get-session",
      { headers: { cookie: "better-auth.session_token=test" } },
      environment,
    );
    const body = (await response.json()) as {
      memberships: UserPrincipal["memberships"];
      speakerGrants: UserPrincipal["speakerGrants"];
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("x-auth-source")).toBe("better-auth");
    expect(body.memberships).toEqual(principal.memberships);
    expect(body.speakerGrants).toEqual(principal.speakerGrants);
  });
});
describe("canonical organizer workspaces", () => {
  it("mounts each organization/event workspace behind authentication without duplicate event paths", async () => {
    const organizationId = "org-1";
    const eventId = "event-1";
    const principal = {
      kind: "user" as const,
      sessionId: "session-1",
      userId: "organizer-1",
      email: "organizer@example.test",
      memberships: [{ organizationId, role: "admin" as const }],
      speakerGrants: [],
    };
    const organizerHeaders = { authorization: "Bearer organizer" };
    const authenticator = {
      authenticate: async (request: Request) => {
        if (request.headers.get("authorization") !== organizerHeaders.authorization) {
          throw new AuthAccessError("UNAUTHENTICATED", "Authentication is required.");
        }
        return principal;
      },
    };

    const app = createApp({
      authenticator,
      sessions: {
        service: {
          listSessions: async () => [],
        } as never,
      },
      communications: {
        service: {
          listTemplates: async () => [],
        } as never,
        actorFor: async (_principal, tenant, scopedEvent) =>
          tenant === organizationId
            ? {
                tenantId: tenant,
                userId: principal.userId,
                kind: "human" as const,
                grants: [{ eventId: scopedEvent, role: "organizer" as const }],
              }
            : null,
      },
      reports: {
        service: {
          listDefinitions: async () => [],
        } as never,
        actorFor: async (_principal, tenant, scopedEvent) =>
          tenant === organizationId
            ? {
                tenantId: tenant,
                userId: principal.userId,
                kind: "human" as const,
                grants: [{ eventId: scopedEvent, role: "organizer" as const }],
              }
            : null,
      },
      remix: {
        service: {
          listRecords: async () => [],
        } as never,
        actorFor: async (_principal, tenant, scopedEvent) =>
          tenant === organizationId
            ? {
                tenantId: tenant,
                userId: principal.userId,
                kind: "human" as const,
                grants: [{ eventId: scopedEvent, role: "organizer" as const }],
              }
            : null,
      },
    });

    const mounts = [
      {
        canonical: `/api/admin/organizations/${organizationId}/events/${eventId}/sessions`,
        duplicate: `/api/admin/organizations/${organizationId}/events/${eventId}/sessions/events/${eventId}`,
      },
      {
        canonical: `/api/admin/organizations/${organizationId}/events/${eventId}/communications/templates`,
        duplicate: `/api/admin/organizations/${organizationId}/events/${eventId}/communications/templates/events/${eventId}`,
      },
      {
        canonical: `/api/admin/organizations/${organizationId}/events/${eventId}/reports/definitions`,
        duplicate: `/api/admin/organizations/${organizationId}/events/${eventId}/reports/events/${eventId}/definitions`,
      },
      {
        canonical: `/api/admin/organizations/${organizationId}/events/${eventId}/remix/records?sourceType=session`,
        duplicate: `/api/admin/organizations/${organizationId}/events/${eventId}/remix/events/${eventId}/records?sourceType=session`,
      },
    ];

    for (const mount of mounts) {
      const anonymous = await app.request(mount.canonical, undefined, environment);
      const authorized = await app.request(
        mount.canonical,
        { headers: organizerHeaders },
        environment,
      );
      const wrongTenant = await app.request(
        mount.canonical.replace(`/organizations/${organizationId}/`, "/organizations/other-org/"),
        { headers: organizerHeaders },
        environment,
      );
      const duplicate = await app.request(
        mount.duplicate,
        { headers: organizerHeaders },
        environment,
      );

      expect(anonymous.status).toBe(401);
      expect(authorized.status).toBe(200);
      expect(wrongTenant.status).toBe(403);
      expect(duplicate.status).toBe(404);
    }
  });
});
describe("speaker private-asset route assembly", () => {
  it("mounts the organizer download grant under the canonical speaker router", async () => {
    let received: { eventId: string; accountId: string; assetId: string } | undefined;
    const app = createApp({
      authenticator: { authenticate: async () => null },
      speaker: {
        authenticate: async () => ({ accountId: "organizer-1" }),
        service: {
          issueOrganizerDownloadGrant: async (input: {
            eventId: string;
            accountId: string;
            assetId: string;
          }) => {
            received = input;
            return {
              method: "GET" as const,
              url: "https://downloads.example.test/capability",
              expiresAt: "2026-08-10T12:02:00.000Z",
            };
          },
        } as never,
      },
    });

    const response = await app.request(
      "/api/speaker/events/event-1/organizer/assets/asset-1/download",
      { method: "POST" },
      environment,
    );
    const unmounted = await app.request(
      "/api/admin/organizations/org-1/events/event-1/organizer/assets/asset-1/download",
      { method: "POST" },
      environment,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        method: "GET",
        url: "https://downloads.example.test/capability",
        expiresAt: "2026-08-10T12:02:00.000Z",
      },
    });
    expect(received).toEqual({
      eventId: "event-1",
      accountId: "organizer-1",
      assetId: "asset-1",
    });
    expect(unmounted.status).toBe(404);
  });
});
describe("feature-router error normalization", () => {
  it("normalizes feature-router errors into the API error contract", async () => {
    const organizationId = "org-1";
    const eventId = "event-1";
    const principal = {
      kind: "user" as const,
      sessionId: "session-1",
      userId: "organizer-1",
      email: "organizer@example.test",
      memberships: [{ organizationId, role: "admin" as const }],
      speakerGrants: [],
    };
    const actorFor = async (_principal: AuthPrincipal, tenant: string, scopedEvent: string) => ({
      tenantId: tenant,
      userId: principal.userId,
      kind: "human" as const,
      grants: [{ eventId: scopedEvent, role: "organizer" as const }],
    });
    const app = createApp({
      authenticator: { authenticate: async () => principal },
      sessions: {
        service: {
          listSessions: async () => {
            throw new SessionServiceError("FORBIDDEN", 403, "Organizer access is required.");
          },
        } as never,
      },
      communications: {
        service: {
          listTemplates: async () => {
            throw new CommunicationError(
              "COMMUNICATION_UNAVAILABLE",
              503,
              "The delivery provider is unavailable.",
            );
          },
        } as never,
        actorFor,
      },
      reports: {
        service: {
          listDefinitions: async () => {
            throw new ReportError("REPORT_FORBIDDEN", "Report access is denied.", 403);
          },
        } as never,
        actorFor,
      },
      remix: {
        service: {
          listRecords: async () => {
            throw new RemixError("REMIX_INVALID_INPUT", "The remix request is invalid.", 400);
          },
        } as never,
        actorFor,
      },
    });

    const paths = [
      `/api/admin/organizations/${organizationId}/events/${eventId}/sessions`,
      `/api/admin/organizations/${organizationId}/events/${eventId}/communications/templates`,
      `/api/admin/organizations/${organizationId}/events/${eventId}/reports/definitions`,
      `/api/admin/organizations/${organizationId}/events/${eventId}/remix/records?sourceType=session`,
    ];
    const responses = await Promise.all(
      paths.map((path) =>
        app.request(path, { headers: { authorization: "Bearer organizer" } }, environment),
      ),
    );
    const bodies = await Promise.all(responses.map((response) => response.json()));

    expect(responses.map((response) => response.status)).toEqual([403, 503, 403, 400]);
    expect(bodies.map((body) => apiErrorSchema.parse(body).error.code)).toEqual([
      "ACCESS_DENIED",
      "INTEGRATION_UNAVAILABLE",
      "ACCESS_DENIED",
      "VALIDATION_FAILED",
    ]);
    for (const [index, response] of responses.entries()) {
      expect(apiErrorSchema.parse(bodies[index]).error.traceId).toBe(
        response.headers.get("x-request-id"),
      );
    }
  });
});
