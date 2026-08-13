import { describe, expect, it } from "vitest";
import { createApp } from "../../app";
import type { ApiKeyScope, AuthPrincipal } from "../auth/types";
import type { EventRepository } from "../events/types";
import type { SessionRepository } from "../sessions/types";
import type { SpeakerRepository } from "../speaker/types";

const apiKey = (scopes: readonly ApiKeyScope[], organizationId = "org-1"): AuthPrincipal => ({
  kind: "apiKey",
  apiKeyId: "key-1",
  organizationId,
  scopes,
});

const event = {
  id: "event-1",
  organizationId: "org-1",
  slug: "summit",
  name: "Open Summit",
  status: "active" as const,
  timeZone: "UTC",
  startsAt: "2026-09-17T09:00:00.000Z",
  endsAt: "2026-09-17T17:00:00.000Z",
  venue: "Main hall",
  cfpSettings: { enabled: true, opensAt: null, closesAt: null },
  defaultCalendarSettings: { durationMinutes: 30, timeZone: "UTC", location: "Main hall" },
  embedConfigurations: [],
  version: 3,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  createdBy: "private-user",
  updatedBy: "private-user",
};

const sessions = [
  {
    id: "session-1",
    tenantId: "org-1",
    eventId: "event-1",
    title: "Opening",
    description: "Welcome",
    status: "Accepted",
    durationMinutes: 30,
    capacityRequired: 100,
    trackIds: ["track-1"],
    tagIds: ["tag-1"],
    speakerIds: ["speaker-1"],
    speakerRoster: [],
    resourceIds: ["private-resource"],
    version: 4,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    createdBy: "private-user",
    updatedBy: "private-user",
    history: [],
  },
  {
    id: "session-draft",
    tenantId: "org-1",
    eventId: "event-1",
    title: "Draft",
    description: "Withheld",
    status: "Draft",
    durationMinutes: 30,
    capacityRequired: 1,
    trackIds: [],
    tagIds: [],
    speakerIds: [],
    speakerRoster: [],
    resourceIds: [],
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    createdBy: "private-user",
    updatedBy: "private-user",
    history: [],
  },
];

const speakers = [
  {
    id: "roster-1",
    eventId: "event-1",
    submissionId: "private-submission",
    participantId: "speaker-1",
    displayName: "Ada Speaker",
    email: "private@example.test",
    jobTitle: "Engineer",
    company: "Example",
    biography: "Builds useful systems.",
    socialLinks: { website: "https://example.test" },
    headshotAssetId: "asset-1",
    role: "primary" as const,
    status: "active" as const,
    version: 2,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
  },
  {
    id: "roster-revoked",
    eventId: "event-1",
    submissionId: "private-submission-2",
    participantId: "speaker-revoked",
    displayName: "Revoked",
    role: "co_speaker" as const,
    status: "revoked" as const,
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const eventRepository: Pick<EventRepository, "getEvent" | "listEvents"> = {
  async getEvent(organizationId, eventId) {
    return organizationId === event.organizationId && eventId === event.id ? event : null;
  },
  async listEvents(organizationId) {
    return organizationId === event.organizationId ? [event] : [];
  },
};

const sessionRepository: Pick<SessionRepository, "getSession" | "listSessions"> = {
  async getSession(tenantId, eventId, sessionId) {
    return (
      sessions.find(
        (candidate) =>
          candidate.tenantId === tenantId &&
          candidate.eventId === eventId &&
          candidate.id === sessionId,
      ) ?? null
    );
  },
  async listSessions(tenantId, eventId) {
    return sessions.filter(
      (candidate) => candidate.tenantId === tenantId && candidate.eventId === eventId,
    );
  },
};

const speakerRepository: Pick<SpeakerRepository, "listRosterForEvent"> = {
  async listRosterForEvent(eventId) {
    return speakers.filter((speaker) => speaker.eventId === eventId);
  },
};

function appFor(principal: AuthPrincipal) {
  return createApp({
    authenticator: { authenticate: async () => principal },
    publicApi: { resources: [] },
    publicCatalog: { eventRepository, sessionRepository, speakerRepository },
  });
}

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("public API catalog reads", () => {
  it("lists events with a bounded cursor page and a public field allowlist", async () => {
    const response = await appFor(apiKey(["events:read"])).request(
      "/api/v1/organizations/org-1/events?limit=1",
    );
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body).toMatchObject({
      data: [{ id: "event-1", name: "Open Summit", slug: "summit", status: "active" }],
      page: { hasMore: false, nextCursor: null },
    });
    expect(JSON.stringify(body)).not.toContain("createdBy");
    expect(JSON.stringify(body)).not.toContain("embedConfigurations");
  });

  it("gets one event and withholds cross-tenant resources", async () => {
    const ok = await appFor(apiKey(["events:read"])).request(
      "/api/v1/organizations/org-1/events/event-1",
    );
    expect(ok.status).toBe(200);
    expect(await json(ok)).toMatchObject({ data: { id: "event-1", name: "Open Summit" } });

    const denied = await appFor(apiKey(["events:read"])).request(
      "/api/v1/organizations/org-2/events/event-1",
    );
    expect(denied.status).toBe(403);
    expect(await json(denied)).toMatchObject({ error: { code: "TENANT_SCOPE_VIOLATION" } });
  });

  it("lists only accepted sessions using the sessions read scope", async () => {
    const response = await appFor(apiKey(["sessions:read"])).request(
      "/api/v1/organizations/org-1/events/event-1/sessions",
    );
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body).toMatchObject({ data: [{ id: "session-1", title: "Opening" }] });
    expect(JSON.stringify(body)).not.toContain("session-draft");
    expect(JSON.stringify(body)).not.toContain("resourceIds");
    expect(JSON.stringify(body)).not.toContain("createdBy");
  });

  it("gets one accepted session but withholds drafts", async () => {
    const app = appFor(apiKey(["sessions:read"]));
    const ok = await app.request("/api/v1/organizations/org-1/events/event-1/sessions/session-1");
    expect(ok.status).toBe(200);
    expect(await json(ok)).toMatchObject({ data: { id: "session-1", status: "Accepted" } });

    const withheld = await app.request(
      "/api/v1/organizations/org-1/events/event-1/sessions/session-draft",
    );
    expect(withheld.status).toBe(404);
    expect(await json(withheld)).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("lists only active speakers without contact or travel data", async () => {
    const response = await appFor(apiKey(["speakers:read"])).request(
      "/api/v1/organizations/org-1/events/event-1/speakers",
    );
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body).toMatchObject({ data: [{ id: "speaker-1", displayName: "Ada Speaker" }] });
    expect(JSON.stringify(body)).not.toContain("private@example.test");
    expect(JSON.stringify(body)).not.toContain("travelLogistics");
    expect(JSON.stringify(body)).not.toContain("private-submission");
    expect(JSON.stringify(body)).not.toContain("speaker-revoked");
  });

  it("gets one active speaker but withholds revoked roster entries", async () => {
    const app = appFor(apiKey(["speakers:read"]));
    const ok = await app.request("/api/v1/organizations/org-1/events/event-1/speakers/speaker-1");
    expect(ok.status).toBe(200);
    expect(await json(ok)).toMatchObject({ data: { id: "speaker-1", displayName: "Ada Speaker" } });

    const withheld = await app.request(
      "/api/v1/organizations/org-1/events/event-1/speakers/speaker-revoked",
    );
    expect(withheld.status).toBe(404);
  });

  it("enforces least-privilege scopes and rejects invalid pagination", async () => {
    const missingScope = await appFor(apiKey(["events:read"])).request(
      "/api/v1/organizations/org-1/events/event-1/sessions",
    );
    expect(missingScope.status).toBe(403);
    expect(await json(missingScope)).toMatchObject({ error: { code: "ACCESS_DENIED" } });

    const invalidLimit = await appFor(apiKey(["events:read"])).request(
      "/api/v1/organizations/org-1/events?limit=101",
    );
    expect(invalidLimit.status).toBe(400);
    expect(await json(invalidLimit)).toMatchObject({ error: { code: "VALIDATION_FAILED" } });

    const invalidCursor = await appFor(apiKey(["events:read"])).request(
      "/api/v1/organizations/org-1/events?cursor=invalid",
    );
    expect(invalidCursor.status).toBe(400);
    expect(await json(invalidCursor)).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  });

  it("publishes all six catalog operations through runtime OpenAPI discovery", async () => {
    const response = await appFor(apiKey(["events:read"])).request("/api/v1/openapi.json");
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body).toMatchObject({
      paths: {
        "/api/v1/organizations/{organizationId}/events": {
          get: { security: [{ apiKey: ["events:read"] }] },
        },
        "/api/v1/organizations/{organizationId}/events/{eventId}": {
          get: { security: [{ apiKey: ["events:read"] }] },
        },
        "/api/v1/organizations/{organizationId}/events/{eventId}/sessions": {
          get: { security: [{ apiKey: ["sessions:read"] }] },
        },
        "/api/v1/organizations/{organizationId}/events/{eventId}/sessions/{sessionId}": {
          get: { security: [{ apiKey: ["sessions:read"] }] },
        },
        "/api/v1/organizations/{organizationId}/events/{eventId}/speakers": {
          get: { security: [{ apiKey: ["speakers:read"] }] },
        },
        "/api/v1/organizations/{organizationId}/events/{eventId}/speakers/{speakerId}": {
          get: { security: [{ apiKey: ["speakers:read"] }] },
        },
      },
    });
  });
});
