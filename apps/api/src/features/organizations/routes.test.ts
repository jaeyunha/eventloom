import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AuthPrincipal } from "../auth/types";
import type { MemberRouteEnvironment } from "../members/routes";
import type { MemberService } from "../members/service";
import {
  createOrganizationProvisioningRoutes,
  createSelfHostedOrganizationBootstrapRoutes,
} from "./routes";

type CreateOrganization = Pick<MemberService, "createOrganization">["createOrganization"];
type ProvisionOrganization = Pick<MemberService, "provisionOrganization">["provisionOrganization"];

function principal(
  memberships: readonly { organizationId: string; role: "owner" | "admin" | "reviewer" }[] = [],
): AuthPrincipal {
  return {
    kind: "user",
    sessionId: "session-user",
    userId: "user-owner",
    email: "owner@example.test",
    memberships,
    reviewerGrants: [],
    speakerGrants: [],
  };
}

function appFor(input: {
  readonly currentPrincipal: AuthPrincipal | null;
  readonly authenticate: (request: Request) => boolean | Promise<boolean>;
  readonly createOrganization: CreateOrganization;
}): Hono<MemberRouteEnvironment> {
  const app = new Hono<MemberRouteEnvironment>();
  app.use("*", async (context, next) => {
    context.set("traceId", "trace-bootstrap");
    context.set("authPrincipal", input.currentPrincipal);
    await next();
  });
  app.route(
    "/api/setup/organizations",
    createSelfHostedOrganizationBootstrapRoutes({
      service: { createOrganization: input.createOrganization },
      authenticate: input.authenticate,
    }),
  );
  return app;
}

const request = () =>
  new Request("http://localhost/api/setup/organizations/bootstrap", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "bootstrap-organization",
      "x-eventloom-bootstrap-token": "operator-secret",
    },
    body: JSON.stringify({
      organizationId: "org-first",
      slug: "first-organization",
      name: "First Organization",
    }),
  });

describe("self-hosted organization bootstrap routes", () => {
  it("requires the operator bootstrap credential", async () => {
    const createOrganization = vi.fn<CreateOrganization>();
    const response = await appFor({
      currentPrincipal: principal(),
      authenticate: () => false,
      createOrganization,
    }).request(request());

    expect(response.status).toBe(403);
    expect(createOrganization).not.toHaveBeenCalled();
  });

  it("rejects an account that already belongs to an organization", async () => {
    const createOrganization = vi.fn<CreateOrganization>();
    const response = await appFor({
      currentPrincipal: principal([{ organizationId: "org-existing", role: "owner" }]),
      authenticate: () => true,
      createOrganization,
    }).request(request());

    expect(response.status).toBe(403);
    expect(createOrganization).not.toHaveBeenCalled();
  });

  it("creates the first organization for the authenticated bootstrap owner", async () => {
    const createOrganization = vi.fn<CreateOrganization>().mockResolvedValue({
      organizationId: "org-first",
      slug: "first-organization",
      name: "First Organization",
      config: {},
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    });
    const response = await appFor({
      currentPrincipal: principal(),
      authenticate: (candidate) =>
        candidate.headers.get("x-eventloom-bootstrap-token") === "operator-secret",
      createOrganization,
    }).request(request());

    expect(response.status).toBe(201);
    expect(createOrganization).toHaveBeenCalledWith(
      {
        kind: "user",
        organizationId: "org-first",
        userId: "user-owner",
        role: "owner",
      },
      {
        organizationId: "org-first",
        slug: "first-organization",
        name: "First Organization",
        idempotencyKey: "bootstrap-organization",
      },
      "first-organization",
    );
  });

  it("allows an owner to replay the bootstrap request for the same organization", async () => {
    const createOrganization = vi.fn<CreateOrganization>().mockResolvedValue({
      organizationId: "org-first",
      slug: "first-organization",
      name: "First Organization",
      config: {},
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    });
    const response = await appFor({
      currentPrincipal: principal([{ organizationId: "org-first", role: "owner" }]),
      authenticate: () => true,
      createOrganization,
    }).request(request());

    expect(response.status).toBe(201);
    expect(createOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-first",
        userId: "user-owner",
        role: "owner",
      }),
      expect.objectContaining({ organizationId: "org-first" }),
      "existing-owner",
    );
  });
});

describe("internal organization provisioning routes", () => {
  function provisioningApp(input: {
    readonly authenticate: (request: Request) => boolean | Promise<boolean>;
    readonly provisionOrganization: ProvisionOrganization;
    readonly entitlements?: {
      getEntitlement: (organizationId: string) => Promise<unknown>;
      putEntitlement: (...args: never[]) => Promise<unknown>;
    };
  }): Hono<MemberRouteEnvironment> {
    const app = new Hono<MemberRouteEnvironment>();
    app.use("*", async (context, next) => {
      context.set("traceId", "trace-provisioning");
      context.set("authPrincipal", null);
      await next();
    });
    app.route(
      "/api/internal/organizations",
      createOrganizationProvisioningRoutes({
        service: { provisionOrganization: input.provisionOrganization },
        entitlements: input.entitlements ?? {
          getEntitlement: async () => null,
          putEntitlement: async (entitlement: never) => entitlement,
        },
        authenticate: input.authenticate,
      } as never),
    );
    return app;
  }

  const provisioningRequest = () =>
    new Request("http://localhost/api/internal/organizations", {
      method: "POST",
      headers: {
        authorization: "Bearer control-plane-token",
        "content-type": "application/json",
        "idempotency-key": "provision-customer-1",
      },
      body: JSON.stringify({
        organizationId: "org-enterprise",
        slug: "enterprise",
        name: "Enterprise Customer",
        ownerUserId: "customer-owner",
        entitlement: {
          schemaVersion: 1,
          organizationId: "org-enterprise",
          revision: 1,
          state: "active",
          capabilities: ["api"],
          limits: { activeEvents: 1, organizerSeats: null },
          notBefore: "2026-08-17T12:00:00.000Z",
          expiresAt: null,
        },
      }),
    });

  it("requires the internal provisioning credential", async () => {
    const provisionOrganization = vi.fn<ProvisionOrganization>();
    const response = await provisioningApp({
      authenticate: () => false,
      provisionOrganization,
    }).request(provisioningRequest());

    expect(response.status).toBe(403);
    expect(provisionOrganization).not.toHaveBeenCalled();
  });

  it("forwards the provider-neutral entitlement to the provisioning command", async () => {
    const provisionOrganization = vi.fn<ProvisionOrganization>().mockResolvedValue({
      organizationId: "org-enterprise",
      slug: "enterprise",
      name: "Enterprise Customer",
      config: {},
      createdAt: "2026-08-17T12:00:00.000Z",
      updatedAt: "2026-08-17T12:00:00.000Z",
    });
    const response = await provisioningApp({
      authenticate: (candidate) =>
        candidate.headers.get("authorization") === "Bearer control-plane-token",
      provisionOrganization,
    }).request(provisioningRequest());

    expect(response.status).toBe(201);
    expect(provisionOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-enterprise",
        ownerUserId: "customer-owner",
        idempotencyKey: "provision-customer-1",
        entitlement: expect.objectContaining({
          organizationId: "org-enterprise",
          limits: { activeEvents: 1, organizerSeats: null },
        }),
      }),
    );
  });
  it("requires the internal credential before updating an entitlement", async () => {
    const putEntitlement = vi.fn();
    const response = await provisioningApp({
      authenticate: () => false,
      provisionOrganization: vi.fn(),
      entitlements: {
        async getEntitlement() {
          return null;
        },
        putEntitlement,
      },
    }).request(
      new Request("http://localhost/api/internal/organizations/org-enterprise/entitlement", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "entitlement-1",
        },
        body: JSON.stringify({
          expectedRevision: 1,
          entitlement: {
            schemaVersion: 1,
            organizationId: "org-enterprise",
            revision: 2,
            state: "restricted",
            capabilities: [],
            limits: { activeEvents: 0, organizerSeats: null },
            notBefore: "2026-08-17T12:00:00.000Z",
            expiresAt: null,
          },
        }),
      }),
    );
    expect(response.status).toBe(403);
    expect(putEntitlement).not.toHaveBeenCalled();
  });

  it("forwards a revisioned entitlement update to the command repository", async () => {
    const entitlement = {
      schemaVersion: 1 as const,
      organizationId: "org-enterprise",
      revision: 2,
      state: "restricted" as const,
      capabilities: [] as string[],
      limits: { activeEvents: 0, organizerSeats: null },
      notBefore: "2026-08-17T12:00:00.000Z",
      expiresAt: null,
    };
    const putEntitlement = vi.fn(async () => entitlement);
    const response = await provisioningApp({
      authenticate: (request) =>
        request.headers.get("authorization") === "Bearer control-plane-token",
      provisionOrganization: vi.fn(),
      entitlements: {
        async getEntitlement() {
          return null;
        },
        putEntitlement,
      },
    }).request(
      new Request("http://localhost/api/internal/organizations/org-enterprise/entitlement", {
        method: "PUT",
        headers: {
          authorization: "Bearer control-plane-token",
          "content-type": "application/json",
          "idempotency-key": "entitlement-1",
        },
        body: JSON.stringify({ expectedRevision: 1, entitlement }),
      }),
    );
    expect(response.status).toBe(200);
    expect(putEntitlement).toHaveBeenCalledWith(
      entitlement,
      expect.objectContaining({ expectedRevision: 1 }),
    );
  });
});
