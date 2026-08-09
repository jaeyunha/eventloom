import { describe, expect, it } from "vitest";
import { createApp } from "../app";
import { FakeAirtableTransport } from "../infrastructure/airtable";
import { createLocalCfpService } from "./cfp";
import { inspectProductionRuntime, type RuntimeBindings } from "./cloudflare";
import { createRuntimeApp, createRuntimeWorker } from "./composition";
import { LOCAL_API_KEY, LOCAL_ORGANIZATION_ID, LOCAL_SESSION_TOKEN } from "./local";

const localBindings: RuntimeBindings = {
  APP_ENV: "local",
  WEB_ORIGIN: "http://localhost:3015",
};

function organizerHeaders(): HeadersInit {
  return { cookie: `better-auth.session_token=${LOCAL_SESSION_TOKEN}` };
}
function productionD1(digest: string): NonNullable<RuntimeBindings["DB"]> {
  const row = {
    id: "key-production",
    organization_id: LOCAL_ORGANIZATION_ID,
    label: "Production test key",
    scopes_json: '["events:read","events:write","agenda:read","agenda:write"]',
    expires_at: null,
    revoked_at: null,
  };
  return {
    prepare(query: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              return query.includes("FROM api_keys") && values[0] === digest ? (row as T) : null;
            },
            async all<T>() {
              return { results: [] as T[] };
            },
            async run() {
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
    async batch() {
      return [];
    },
  } as unknown as NonNullable<RuntimeBindings["DB"]>;
}

function productionBindings(
  transport: FakeAirtableTransport,
  database: NonNullable<RuntimeBindings["DB"]>,
): RuntimeBindings {
  const coordinator = {
    idFromName(name: string) {
      return name;
    },
    get() {
      return {
        async fetch() {
          return Response.json({ revision: 0 });
        },
      };
    },
  } as unknown as NonNullable<RuntimeBindings["AGENDA_COORDINATOR"]>;
  const bucket = {
    get: async () => null,
    put: async () => undefined,
  } as unknown as NonNullable<RuntimeBindings["PRIVATE_FILES"]>;
  const queue = {
    async send() {},
  } as unknown as NonNullable<RuntimeBindings["OUTBOX_QUEUE"]>;
  return {
    APP_ENV: "production",
    WEB_ORIGIN: "https://open-sessionboard-web-production.ashleyha0317.workers.dev",
    API_ORIGIN: "https://open-sessionboard-api-production.ashleyha0317.workers.dev",
    DB: database,
    AGENDA_COORDINATOR: coordinator,
    PRIVATE_FILES: bucket,
    OUTBOX_QUEUE: queue,
    AIRTABLE_ACCESS_TOKEN: "test-token",
    AIRTABLE_BASE_ID: "base-test",
    BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
    GOOGLE_CLIENT_ID: "google-client-id",
    GOOGLE_CLIENT_SECRET: "google-client-secret",
    OPENSEND_API_URL: "https://opensend.namuh.co",
    OPENSEND_API_KEY: "opensend-test-key",
    AIRTABLE_TRANSPORT: transport,
  };
}

describe("local runtime composition", () => {
  it("serves health and a seeded speaker portal without external credentials", async () => {
    const app = createRuntimeApp(localBindings);

    const health = await app.request("/api/health", undefined, localBindings);
    const portal = await app.request(
      "/api/speaker/events/current/portal",
      undefined,
      localBindings,
    );

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
  it("serves the organizer overview from local repositories", async () => {
    const app = createRuntimeApp(localBindings);
    const response = await app.request(
      `/api/admin/organizations/${LOCAL_ORGANIZATION_ID}/overview`,
      { headers: organizerHeaders() },
      localBindings,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        organizationId: LOCAL_ORGANIZATION_ID,
        metrics: {
          eventCount: 2,
          submissionCount: 1,
          pendingReviewCount: 0,
          outstandingSpeakerTaskCount: 2,
          publishedSessionCount: 0,
        },
        events: [
          { id: "demo-event", name: "Open Sessionboard Demo" },
          { id: "open-sessionboard-conf", name: "Open Sessionboard Conference" },
        ],
        actionItems: [
          { id: "speaker_tasks:demo-event", count: 2 },
          { id: "agenda:demo-event", count: 2 },
        ],
      },
    });
  });

  it("denies anonymous, reviewer, and wrong-tenant organizer overview access", async () => {
    const app = createRuntimeApp(localBindings);
    const path = `/api/admin/organizations/${LOCAL_ORGANIZATION_ID}/overview`;
    const anonymous = await app.request(path, undefined, localBindings);
    const wrongTenant = await app.request(
      "/api/admin/organizations/another-organization/overview",
      { headers: organizerHeaders() },
      localBindings,
    );
    const reviewerApp = createApp({
      authenticator: {
        authenticate: async () => ({
          kind: "user" as const,
          sessionId: "reviewer-session",
          userId: "reviewer",
          email: "reviewer@example.test",
          memberships: [{ organizationId: LOCAL_ORGANIZATION_ID, role: "reviewer" as const }],
          speakerGrants: [],
        }),
      },
      organizerOverview: {
        getOverview: async (organizationId: string) => ({
          organizationId,
          metrics: {
            eventCount: 0,
            submissionCount: 0,
            pendingReviewCount: 0,
            outstandingSpeakerTaskCount: 0,
            publishedSessionCount: 0,
          },
          events: [],
          actionItems: [],
        }),
      },
    });
    const reviewer = await reviewerApp.request(path, undefined, localBindings);

    expect(anonymous.status).toBe(401);
    expect(wrongTenant.status).toBe(403);
    expect(reviewer.status).toBe(403);
  });

  it("returns explicit empty overview data without repository fiction", async () => {
    const app = createApp({
      authenticator: {
        authenticate: async () => ({
          kind: "user" as const,
          sessionId: "empty-session",
          userId: "owner",
          email: "owner@example.test",
          memberships: [{ organizationId: "empty-organization", role: "owner" as const }],
          speakerGrants: [],
        }),
      },
      organizerOverview: {
        getOverview: async (organizationId: string) => ({
          organizationId,
          metrics: {
            eventCount: 0,
            submissionCount: 0,
            pendingReviewCount: 0,
            outstandingSpeakerTaskCount: 0,
            publishedSessionCount: 0,
          },
          events: [],
          actionItems: [],
        }),
      },
    });
    const response = await app.request(
      "/api/admin/organizations/empty-organization/overview",
      undefined,
      localBindings,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        organizationId: "empty-organization",
        metrics: {
          eventCount: 0,
          submissionCount: 0,
          pendingReviewCount: 0,
          outstandingSpeakerTaskCount: 0,
          publishedSessionCount: 0,
        },
        events: [],
        actionItems: [],
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
    const publishedBody = (await published.json()) as {
      data: Record<string, unknown> & { revision: Record<string, unknown> };
    };
    expect(publishedBody).toEqual({
      data: {
        event: {
          slug: "demo-event",
          name: "Demo Event",
          timeZone: "America/Los_Angeles",
          startsOn: "2026-09-18",
          endsOn: "2026-09-18",
          venueName: null,
        },
        revision: {
          id: "revision_local_3",
          number: 1,
          publishedAt: "2026-08-08T12:00:00.000Z",
        },
        entries: [
          {
            id: "local-entry-keynote",
            title: "Local Session Keynote",
            summary: "",
            format: "Session",
            speakerNames: [],
            roomName: "Local Room Main",
            trackNames: ["Local Track Main"],
            startsAt: expect.any(String),
            endsAt: expect.any(String),
          },
          {
            id: "local-entry-workshop",
            title: "Local Session Workshop",
            summary: "",
            format: "Session",
            speakerNames: [],
            roomName: "Local Room Studio",
            trackNames: ["Local Track Practice"],
            startsAt: expect.any(String),
            endsAt: expect.any(String),
          },
        ],
      },
    });
    expect(publishedBody.data).not.toHaveProperty("eventId");
    expect(publishedBody.data).not.toHaveProperty("sourceDraftVersion");
    expect(publishedBody.data.revision).not.toHaveProperty("sourceDraftVersion");
    expect(publishedBody.data.revision).not.toHaveProperty("publishedBy");
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
  it("mounts sessions with scoped list, get, create, and optimistic update access", async () => {
    const app = createRuntimeApp(localBindings);
    const base = `/api/v1/organizations/${LOCAL_ORGANIZATION_ID}/sessions`;
    const apiHeaders = { authorization: `Bearer ${LOCAL_API_KEY}` };
    const anonymous = await app.request(base, undefined, localBindings);
    const listed = await app.request(base, { headers: apiHeaders }, localBindings);
    const fetched = await app.request(
      `${base}/local-session-keynote`,
      {
        headers: apiHeaders,
      },
      localBindings,
    );
    const created = await app.request(
      base,
      {
        method: "POST",
        headers: {
          ...apiHeaders,
          "content-type": "application/json",
          "idempotency-key": "local-session-create-1",
        },
        body: JSON.stringify({
          id: "local-session-created",
          eventId: "demo-event",
          title: "Created local session",
        }),
      },
      localBindings,
    );
    const updated = await app.request(
      `${base}/local-session-created`,
      {
        method: "PATCH",
        headers: {
          ...apiHeaders,
          "content-type": "application/json",
          "idempotency-key": "local-session-update-1",
        },
        body: JSON.stringify({ expectedVersion: 1, title: "Updated local session" }),
      },
      localBindings,
    );
    const wrongTenant = await app.request(
      "/api/v1/organizations/another-organization/sessions",
      { headers: apiHeaders },
      localBindings,
    );

    expect(anonymous.status).toBe(401);
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({
      data: [
        { id: "local-session-keynote", title: "Opening keynote: Systems that earn trust" },
        { id: "local-session-workshop" },
      ],
    });
    expect(fetched.status).toBe(200);
    await expect(fetched.json()).resolves.toMatchObject({
      id: "local-session-keynote",
      eventId: "demo-event",
    });
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({
      id: "local-session-created",
      organizationId: LOCAL_ORGANIZATION_ID,
      version: 1,
    });
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      id: "local-session-created",
      title: "Updated local session",
      version: 2,
    });
    expect(wrongTenant.status).toBe(403);
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

  it("mounts production Airtable reads and writes without exposing record ids", async () => {
    const transport = new FakeAirtableTransport();
    transport.seed({
      baseId: "base-test",
      table: "Events",
      recordId: "rec00000000000001",
      fields: {
        "Application ID": "event-airtable",
        Payload: JSON.stringify({
          id: "event-airtable",
          organizationId: LOCAL_ORGANIZATION_ID,
          name: "Airtable Event",
          version: 1,
          updatedAt: "2026-08-09T00:00:00.000Z",
        }),
      },
    });
    transport.seed({
      baseId: "base-test",
      table: "Sessions",
      recordId: "rec00000000000002",
      fields: {
        "Application ID": "session-airtable",
        "Metadata JSON": JSON.stringify({
          id: "session-airtable",
          organizationId: LOCAL_ORGANIZATION_ID,
          eventId: "event-airtable",
          title: "Airtable Session",
          version: 1,
          updatedAt: "2026-08-09T00:00:00.000Z",
        }),
      },
    });
    const digestBytes = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode("production-api-key")),
    );
    const digest = [...digestBytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const database = productionD1(digest);
    const bindings = productionBindings(transport, database);
    const app = createRuntimeApp(bindings);

    const listed = await app.request(
      `/api/v1/organizations/${LOCAL_ORGANIZATION_ID}/events`,
      { headers: { authorization: "Bearer production-api-key" } },
      bindings,
    );
    const created = await app.request(
      `/api/v1/organizations/${LOCAL_ORGANIZATION_ID}/events`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer production-api-key",
          "content-type": "application/json",
          "idempotency-key": "production-create-1",
        },
        body: JSON.stringify({ id: "created-event", name: "Created Event" }),
      },
      bindings,
    );
    const sessionsListed = await app.request(
      `/api/v1/organizations/${LOCAL_ORGANIZATION_ID}/sessions`,
      { headers: { authorization: "Bearer production-api-key" } },
      bindings,
    );
    const sessionsCreated = await app.request(
      `/api/v1/organizations/${LOCAL_ORGANIZATION_ID}/sessions`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer production-api-key",
          "content-type": "application/json",
          "idempotency-key": "production-session-create-1",
        },
        body: JSON.stringify({
          id: "created-session",
          eventId: "event-airtable",
          title: "Created Session",
        }),
      },
      bindings,
    );

    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({
      data: [{ id: "event-airtable", name: "Airtable Event" }],
    });
    expect(created.status).toBe(201);
    const createdPayload = await created.json();
    expect(createdPayload).toMatchObject({
      id: "created-event",
      name: "Created Event",
      organizationId: LOCAL_ORGANIZATION_ID,
      version: 1,
    });
    expect(JSON.stringify(createdPayload)).not.toContain("rec00000000000001");
    expect(
      transport.requests.some((request) => request.method === "POST" && request.table === "Events"),
    ).toBe(true);
    expect(sessionsListed.status).toBe(200);
    await expect(sessionsListed.json()).resolves.toMatchObject({
      data: [{ id: "session-airtable", title: "Airtable Session" }],
    });
    expect(sessionsCreated.status).toBe(201);
    await expect(sessionsCreated.json()).resolves.toMatchObject({
      id: "created-session",
      organizationId: LOCAL_ORGANIZATION_ID,
      version: 1,
    });
    expect(
      transport.requests.some(
        (request) =>
          request.method === "POST" &&
          request.table === "Sessions" &&
          JSON.stringify(request.body).includes("Metadata JSON"),
      ),
    ).toBe(true);
  });
  it("requires the fixed origin pair and both Google/OpenSend credential pairs", () => {
    const bindings = productionBindings(new FakeAirtableTransport(), productionD1("unused"));
    expect(inspectProductionRuntime(bindings).success).toBe(true);
    const { API_ORIGIN: _apiOrigin, ...withoutApiOrigin } = bindings;
    expect(inspectProductionRuntime(withoutApiOrigin).success).toBe(true);
    const { GOOGLE_CLIENT_SECRET: _googleSecret, ...withoutGoogleSecret } = bindings;
    expect(inspectProductionRuntime(withoutGoogleSecret).success).toBe(false);
    const {
      OPENSEND_API_KEY: _openSendKey,
      OPENSEND_SENDING_API_KEY: _sendingKey,
      ...withoutOpenSendKey
    } = bindings;
    expect(inspectProductionRuntime(withoutOpenSendKey).success).toBe(false);
    expect(
      inspectProductionRuntime({
        ...bindings,
        API_ORIGIN: "https://attacker.example",
      }).success,
    ).toBe(false);
  });

  it("mounts the live Better Auth callback path through the production app", async () => {
    const bindings = productionBindings(new FakeAirtableTransport(), productionD1("unused"));
    const app = createRuntimeApp(bindings);
    const response = await app.request(
      `${bindings.API_ORIGIN}/api/auth/callback/google`,
      { headers: { origin: bindings.WEB_ORIGIN } },
      bindings,
    );

    expect(response.status).not.toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    const payload = await response.text();
    expect(payload).not.toContain("google-client-secret");
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
