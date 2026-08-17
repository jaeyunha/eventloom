import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AuthPrincipal } from "../auth/types";
import { type CrmRouteEnvironment, type CrmRouteService, createCrmRoutes } from "./routes";
import type { CrmContact } from "./types";

const organizationId = "organization-1";
const contact: CrmContact = {
  id: "contact-1",
  organizationId,
  firstName: "Ada",
  lastName: "Lovelace",
  displayName: "Ada Lovelace",
  email: "ada@example.test",
  phone: null,
  company: null,
  title: null,
  website: null,
  linkedinUrl: null,
  notes: null,
  tags: [],
  customFields: {},
  source: "manual",
  status: "active",
  mergedIntoId: null,
  pipelineStage: "new",
  version: 2,
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
};
const principal: AuthPrincipal = {
  kind: "user",
  sessionId: "session-1",
  userId: "user-1",
  email: "owner@example.test",
  memberships: [{ organizationId, role: "owner" }],
  reviewerGrants: [],
  speakerGrants: [],
};

function testApp() {
  const updateContact = vi.fn(async () => contact);
  const setPipelineStage = vi.fn(async () => contact);
  const service = {
    updateContact,
    setPipelineStage,
  } as unknown as CrmRouteService;
  const app = new Hono<CrmRouteEnvironment>();
  app.use("/organizations/*", async (context, next) => {
    context.set("traceId", "trace-crm-routes");
    context.set("authPrincipal", principal);
    await next();
  });
  app.route("/organizations/:organizationId/crm", createCrmRoutes({ service }));
  return { app, updateContact, setPipelineStage };
}

async function request(
  app: Hono<CrmRouteEnvironment>,
  path: string,
  method: "PATCH" | "POST",
  payload: Readonly<Record<string, unknown>>,
): Promise<Response> {
  return app.request(`/organizations/${organizationId}/crm${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

describe("CRM concurrency route validation", () => {
  it("requires a positive expectedVersion for public contact PATCH", async () => {
    const { app, updateContact } = testApp();

    for (const payload of [{ displayName: "Ada" }, { displayName: "Ada", expectedVersion: 0 }]) {
      const response = await request(app, `/contacts/${contact.id}`, "PATCH", payload);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: "VALIDATION_FAILED",
          details: [{ path: ["expectedVersion"] }],
        },
      });
    }
    expect(updateContact).not.toHaveBeenCalled();

    const unexpectedField = await request(app, `/contacts/${contact.id}`, "PATCH", {
      displayName: "Ada",
      expectedVersion: 1,
      idempotencyKey: "not-supported-on-patch",
    });
    expect(unexpectedField.status).toBe(400);
    await expect(unexpectedField.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_FAILED" },
    });
    expect(updateContact).not.toHaveBeenCalled();

    const valid = await request(app, `/contacts/${contact.id}`, "PATCH", {
      displayName: "Ada",
      expectedVersion: 1,
    });
    expect(valid.status).toBe(200);
    expect(updateContact).toHaveBeenCalledWith(
      expect.objectContaining({ userId: principal.userId }),
      expect.objectContaining({ expectedVersion: 1 }),
    );
  });

  it("requires a positive expectedVersion for public pipeline mutations", async () => {
    const { app, setPipelineStage } = testApp();

    for (const payload of [{ stage: "qualified" }, { stage: "qualified", expectedVersion: 0 }]) {
      const response = await request(app, `/contacts/${contact.id}/pipeline`, "POST", payload);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: "VALIDATION_FAILED",
          details: [{ path: ["expectedVersion"] }],
        },
      });
    }
    expect(setPipelineStage).not.toHaveBeenCalled();

    const valid = await request(app, `/contacts/${contact.id}/pipeline`, "POST", {
      stage: "qualified",
      expectedVersion: 1,
    });
    expect(valid.status).toBe(200);
    expect(setPipelineStage).toHaveBeenCalledWith(
      expect.objectContaining({ userId: principal.userId }),
      expect.objectContaining({ expectedVersion: 1 }),
    );
  });
});
