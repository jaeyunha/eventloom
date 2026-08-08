import { describe, expect, it } from "vitest";
import type { RuntimeBindings } from "./cloudflare";
import { createLocalCfpService } from "./cfp";
import { createRuntimeApp, createRuntimeWorker } from "./composition";
import {
  LOCAL_API_KEY,
  LOCAL_ORGANIZATION_ID,
  LOCAL_SESSION_TOKEN,
} from "./local";

const localBindings: RuntimeBindings = {
  APP_ENV: "local",
  WEB_ORIGIN: "http://localhost:3015",
};

function organizerHeaders(): HeadersInit {
  return { cookie: `better-auth.session_token=${LOCAL_SESSION_TOKEN}` };
}

describe("local runtime composition", () => {
  it("serves health and a seeded speaker portal without external credentials", async () => {
    const app = createRuntimeApp(localBindings);

    const health = await app.request("/api/health", undefined, localBindings);
    const portal = await app.request("/api/speaker/events/current/portal", undefined, localBindings);

    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({ status: "ok", environment: "local" });
    expect(portal.status).toBe(200);
    await expect(portal.json()).resolves.toMatchObject({
      data: {
        outstandingTaskCount: 2,
        submissions: [{ id: "local-submission", status: "accepted" }],
        profiles: [{ participantId: "local-participant", displayName: "Alex Rivera" }],
      },
    });
  });

  it("keeps local speaker mutations stateful and version checked", async () => {
    const app = createRuntimeApp(localBindings);
    const path = "/api/speaker/events/current/profiles/local-participant";

    const updated = await app.request(
      path,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ biography: "Updated local biography.", expectedVersion: 1 }),
      },
      localBindings,
    );
    const stale = await app.request(
      path,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ biography: "Stale update.", expectedVersion: 1 }),
      },
      localBindings,
    );

    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      data: { biography: "Updated local biography.", version: 2 },
    });
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({ error: { code: "CONFLICT" } });
  });

  it("seeds a mutable draft and immutable public agenda projection", async () => {
    const app = createRuntimeApp(localBindings);
    const adminBase = `/api/admin/organizations/${LOCAL_ORGANIZATION_ID}/events/demo-event/agenda`;
    const draftResponse = await app.request(
      `${adminBase}/draft`,
      { headers: organizerHeaders() },
      localBindings,
    );
    const draftPayload = (await draftResponse.json()) as {
      data: {
        version: number;
        entries: Array<{
          id: string;
          sessionId: string;
          roomId: string;
          trackIds: string[];
          startsAtLocal: string;
          endsAtLocal: string;
        }>;
      };
    };
    const updated = await app.request(
      `${adminBase}/draft`,
      {
        method: "PUT",
        headers: { ...organizerHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: draftPayload.data.version,
          entries: draftPayload.data.entries.map(
            ({ id, sessionId, roomId, trackIds, startsAtLocal, endsAtLocal }) => ({
              id,
              sessionId,
              roomId,
              trackIds,
              startsAtLocal,
              endsAtLocal,
            }),
          ),
        }),
      },
      localBindings,
    );
    const published = await app.request(
      "/api/public/events/demo-event/agenda",
      undefined,
      localBindings,
    );

    expect(draftResponse.status).toBe(200);
    expect(draftPayload.data.entries).toHaveLength(2);
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({ data: { version: 3 } });
    expect(published.status).toBe(200);
    await expect(published.json()).resolves.toMatchObject({
      data: { eventId: "demo-event", revisionNumber: 1, entries: expect.any(Array) },
    });
  });

  it("preserves authentication and tenant boundaries for scoped APIs", async () => {
    const app = createRuntimeApp(localBindings);
    const path = `/api/v1/organizations/${LOCAL_ORGANIZATION_ID}/events`;
    const anonymous = await app.request(path, undefined, localBindings);
    const authorized = await app.request(
      path,
      { headers: { authorization: `Bearer ${LOCAL_API_KEY}` } },
      localBindings,
    );
    const wrongTenant = await app.request(
      "/api/v1/organizations/another-organization/events",
      { headers: { authorization: `Bearer ${LOCAL_API_KEY}` } },
      localBindings,
    );
    const invalidSpeakerCredential = await app.request(
      "/api/speaker/events/current/portal",
      { headers: { authorization: "Bearer invalid-local-key" } },
      localBindings,
    );

    expect(anonymous.status).toBe(401);
    expect(authorized.status).toBe(200);
    await expect(authorized.json()).resolves.toMatchObject({
      data: [{ id: "demo-event" }, { id: "open-sessionboard-conf" }],
    });
    expect(wrongTenant.status).toBe(403);
    expect(invalidSpeakerCredential.status).toBe(401);
  });

  it("seeds an open CFP with deterministic draft creation", async () => {
    const service = createLocalCfpService();
    const draft = await service.createDraft({
      tenantId: LOCAL_ORGANIZATION_ID,
      eventId: "demo-event",
      formId: "main-cfp",
      ownerAccountId: "local-speaker",
      idempotencyKey: "local-cfp-draft",
    });
    const replay = await service.createDraft({
      tenantId: LOCAL_ORGANIZATION_ID,
      eventId: "demo-event",
      formId: "main-cfp",
      ownerAccountId: "local-speaker",
      idempotencyKey: "local-cfp-draft",
    });

    expect(draft).toMatchObject({
      id: "submission_local_1",
      tenantId: LOCAL_ORGANIZATION_ID,
      eventId: "demo-event",
      formId: "main-cfp",
      ownerAccountId: "local-speaker",
      status: "draft",
      version: 1,
    });
    expect(replay).toEqual(draft);
  });

  it("fails closed without non-local provider configuration and never returns issue details", async () => {
    const worker = createRuntimeWorker();
    const bindings: RuntimeBindings = {
      APP_ENV: "production",
      WEB_ORIGIN: "https://open-sessionboard.pages.dev",
    };
    const response = await worker.fetch?.(
      new Request("https://api.example.com/api/health", {
        headers: { origin: bindings.WEB_ORIGIN },
      }),
      bindings,
      {} as ExecutionContext,
    );

    expect(response).toBeInstanceOf(Response);
    expect(response?.status).toBe(503);
    expect(response?.headers.get("access-control-allow-origin")).toBe(bindings.WEB_ORIGIN);
    const payload = await response?.json();
    expect(payload).toMatchObject({
      error: { code: "CONFIGURATION_ERROR", message: "The API runtime is not configured." },
    });
    expect(JSON.stringify(payload)).not.toContain("AIRTABLE_ACCESS_TOKEN");
  });
});
