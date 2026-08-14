import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AuthPrincipal, OrganizationRole } from "../features/auth/types";
import {
  createIntegrationAdminRoutes,
  createOrganizationApiKeyAdminRoutes,
  type IntegrationAdminRouteDependencies,
  type IntegrationApiKeySummary,
} from "./integrations";

const organizationId = "org-a";
const eventId = "event-a";

function principal(role: OrganizationRole, tenant = organizationId): AuthPrincipal {
  return {
    kind: "user",
    sessionId: `session-${role}-${tenant}`,
    userId: `user-${role}-${tenant}`,
    email: `${role}@example.test`,
    memberships: [{ organizationId: tenant, role }],
    speakerGrants: [],
  };
}

function fixture() {
  const keys = new Map<string, IntegrationApiKeySummary>();
  let sequence = 0;
  const listApiKeys = vi.fn(async (tenant: string, scopedEventId?: string) =>
    [...keys.values()].filter(
      (key) =>
        tenant === organizationId && (scopedEventId === undefined || key.eventId === scopedEventId),
    ),
  );
  const createApiKey = vi.fn(
    async (input: Parameters<IntegrationAdminRouteDependencies["createApiKey"]>[0]) => {
      const secret = `osb_one_time_secret_${++sequence}`;
      const summary: IntegrationApiKeySummary = {
        id: `key-${sequence}`,
        label: input.label,
        prefix: secret.slice(0, 12),
        scopes: [...input.scopes],
        eventId: input.eventId ?? null,
        createdAt: "2026-08-14T00:00:00.000Z",
        lastUsedAt: null,
        expiresAt: input.expiresAt,
        revokedAt: null,
      };
      keys.set(`${input.organizationId}:${summary.id}`, summary);
      return { summary, secret };
    },
  );
  const revokeApiKey = vi.fn(async (tenant: string, apiKeyId: string, scopedEventId?: string) => {
    const storageKey = `${tenant}:${apiKeyId}`;
    const current = keys.get(storageKey);
    if (
      current === undefined ||
      current.revokedAt !== null ||
      (scopedEventId !== undefined && current.eventId !== scopedEventId)
    ) {
      return false;
    }
    keys.set(storageKey, { ...current, revokedAt: "2026-08-14T01:00:00.000Z" });
    return true;
  });
  const dependencies: IntegrationAdminRouteDependencies = {
    getEvent: async (tenant, id) =>
      tenant === organizationId && id === eventId
        ? {
            id,
            organizationId: tenant,
            name: "Event A",
            timeZone: "UTC",
            publishedAgendaRevisionId: null,
          }
        : null,
    getDeliveryStatus: async () => {
      throw new Error("not used");
    },
    saveCredential: async () => undefined,
    listApiKeys,
    createApiKey,
    revokeApiKey,
    webhooks: {
      listSubscriptions: async () => [],
      getSubscription: async () => null,
      createSubscription: async () => {
        throw new Error("not used");
      },
      updateSubscription: async () => null,
      deleteSubscription: async () => false,
    },
    retryCalendarDelivery: async () => false,
  };

  const app = new Hono<{
    Variables: { authPrincipal: AuthPrincipal | null; traceId: string };
  }>();
  app.use("*", async (context, next) => {
    const authorization = context.req.header("authorization");
    const actor =
      authorization === "Bearer owner"
        ? principal("owner")
        : authorization === "Bearer admin"
          ? principal("admin")
          : authorization === "Bearer reviewer"
            ? principal("reviewer")
            : authorization === "Bearer other-owner"
              ? principal("owner", "org-b")
              : null;
    context.set("authPrincipal", actor);
    context.set("traceId", "00000000-0000-4000-8000-000000000001");
    await next();
  });
  app.route(
    "/organizations/:organizationId/api-keys",
    createOrganizationApiKeyAdminRoutes(dependencies),
  );
  app.route(
    "/organizations/:organizationId/events/:eventId",
    createIntegrationAdminRoutes(dependencies),
  );
  return { app, keys, listApiKeys, createApiKey, revokeApiKey };
}

const jsonHeaders = (authorization: string) => ({
  authorization,
  "content-type": "application/json",
});

const createBody = JSON.stringify({
  label: "Automation",
  scopes: ["events:read"],
  expiresAt: null,
});

describe("organization API-key management", () => {
  it.each(["owner", "admin"])("allows organization %s management", async (role) => {
    const { app } = fixture();
    const response = await app.request(`/organizations/${organizationId}/api-keys`, {
      headers: { authorization: `Bearer ${role}` },
    });
    expect(response.status).toBe(200);
  });

  it("rejects anonymous, reviewer, and cross-tenant management before storage access", async () => {
    const { app, listApiKeys } = fixture();
    for (const authorization of [undefined, "Bearer reviewer", "Bearer other-owner"]) {
      const path = `/organizations/${organizationId}/api-keys`;
      const response =
        authorization === undefined
          ? await app.request(path)
          : await app.request(path, { headers: { authorization } });
      expect(response.status).toBe(authorization === undefined ? 401 : 403);
    }
    expect(listApiKeys).not.toHaveBeenCalled();
  });

  it("returns the secret only at creation and keeps eventId as nullable metadata", async () => {
    const { app } = fixture();
    const created = await app.request(`/organizations/${organizationId}/api-keys`, {
      method: "POST",
      headers: jsonHeaders("Bearer owner"),
      body: createBody,
    });
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toEqual({
      data: { id: "key-1", secret: "osb_one_time_secret_1" },
    });

    const listed = await app.request(`/organizations/${organizationId}/api-keys`, {
      headers: { authorization: "Bearer owner" },
    });
    const listedBody = (await listed.json()) as { data: IntegrationApiKeySummary[] };
    expect(listedBody.data).toEqual([
      expect.objectContaining({ id: "key-1", eventId: null, revokedAt: null }),
    ]);
    expect(JSON.stringify(listedBody)).not.toContain("osb_one_time_secret_1");
  });

  it("revokes only within the authorized organization and preserves event aliases", async () => {
    const { app, revokeApiKey } = fixture();
    const compatibilityCreate = await app.request(
      `/organizations/${organizationId}/events/${eventId}/api-keys`,
      {
        method: "POST",
        headers: jsonHeaders("Bearer owner"),
        body: JSON.stringify({
          label: "Compatibility client",
          scopes: ["events:read"],
          expiresAt: null,
        }),
      },
    );
    expect(compatibilityCreate.status).toBe(201);

    const crossTenant = await app.request(`/organizations/org-b/api-keys/key-1`, {
      method: "DELETE",
      headers: { authorization: "Bearer owner" },
    });
    expect(crossTenant.status).toBe(403);
    expect(revokeApiKey).not.toHaveBeenCalled();

    const revoked = await app.request(`/organizations/${organizationId}/api-keys/key-1`, {
      method: "DELETE",
      headers: { authorization: "Bearer owner" },
    });
    expect(revoked.status).toBe(204);
    expect(revokeApiKey).toHaveBeenCalledWith(organizationId, "key-1");

    const repeated = await app.request(`/organizations/${organizationId}/api-keys/key-1`, {
      method: "DELETE",
      headers: { authorization: "Bearer owner" },
    });
    expect(repeated.status).toBe(404);
  });
});
