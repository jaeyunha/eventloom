import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { FakeAirtableTransport } from "../../infrastructure/airtable";
import { AirtableSessionRepository } from "../../runtime/airtable";
import type { AuthPrincipal } from "../auth/types";
import { createSessionAdminRoutes, type SessionRouteEnvironment } from "./routes";
import { InMemorySessionRepository, SessionService } from "./service";

const now = new Date("2026-08-09T12:00:00.000Z");

function actor(tenantId = "tenant-a") {
  return { tenantId, userId: "organizer-1", role: "organizer" as const, kind: "user" as const };
}

function principal(organizationId = "tenant-a"): AuthPrincipal {
  return {
    kind: "user",
    sessionId: "auth-session",
    userId: "organizer-1",
    email: "organizer@example.com",
    memberships: [{ organizationId, role: "admin" }],
    speakerGrants: [],
    reviewerGrants: [],
  };
}

function setup() {
  let sequence = 0;
  const repository = new InMemorySessionRepository();
  repository.setSpeakerIds("tenant-a", "event-a", ["speaker-1", "speaker-2"]);
  const service = new SessionService(repository, {
    clock: () => now,
    generateId: () => `generated-${++sequence}`,
  });
  return { repository, service };
}

describe("organizer session settings domain", () => {
  it("creates referenced sessions, enforces versions, and keeps tenant records isolated", async () => {
    const { service } = setup();
    const organizer = actor();
    const room = await service.createRoom(organizer, {
      eventId: "event-a",
      id: "room-a",
      name: "Main hall",
      capacity: 100,
      resources: ["projector", "whiteboard"],
    });
    const track = await service.createTrack(organizer, {
      eventId: "event-a",
      id: "track-a",
      name: "Platform",
    });
    const format = await service.createFormat(organizer, {
      eventId: "event-a",
      id: "talk",
      name: "Talk",
    });
    const level = await service.createLevel(organizer, {
      eventId: "event-a",
      id: "advanced",
      name: "Advanced",
    });
    const tag = await service.createTag(organizer, {
      eventId: "event-a",
      id: "cloud",
      name: "Cloud",
    });
    const settings = await service.getSettings(organizer, { eventId: "event-a" });
    expect(settings.agendaEligibleStatuses).toEqual(["Accepted"]);

    const session = await service.createSession(organizer, {
      eventId: "event-a",
      id: "session-a",
      title: "Reliable workers",
      durationMinutes: 45,
      roomId: room.id,
      trackId: track.id,
      formatId: format.id,
      levelId: level.id,
      tagIds: [tag.id],
      speakerIds: ["speaker-1"],
      resourceIds: ["slides"],
      status: "Accepted",
    });
    expect(session.version).toBe(1);
    expect(session.speakerRoster).toEqual([{ id: "speaker-1" }]);

    const updated = await service.updateSession(organizer, {
      eventId: "event-a",
      sessionId: session.id,
      expectedVersion: session.version,
      title: "Reliable workers, revised",
      contentStatus: "Approved",
    });
    expect(updated.version).toBe(2);
    await expect(
      service.updateSession(organizer, {
        eventId: "event-a",
        sessionId: session.id,
        expectedVersion: session.version,
        title: "stale",
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409 });

    await expect(
      service.getSession(actor("tenant-b"), { eventId: "event-a", sessionId: session.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(updated.roomId).toBe(room.id);
    const publicSession = (await service.getAgendaCatalog("tenant-a", "event-a")).sessions.find(
      (candidate) => candidate.id === session.id,
    );
    expect(publicSession).toMatchObject({
      format: "Talk",
      roomName: "Main hall",
      trackNames: ["Platform"],
      speakerNames: ["Speaker"],
    });
  });
  it("preserves stale retained references on content-only updates and validates replacements", async () => {
    const { repository, service } = setup();
    const organizer = actor();
    const room = await service.createRoom(organizer, {
      eventId: "event-a",
      id: "stale-room",
      name: "Stale room",
      capacity: 20,
    });
    const track = await service.createTrack(organizer, {
      eventId: "event-a",
      id: "stale-track",
      name: "Stale track",
    });
    const format = await service.createFormat(organizer, {
      eventId: "event-a",
      id: "stale-format",
      name: "Stale format",
    });
    const level = await service.createLevel(organizer, {
      eventId: "event-a",
      id: "stale-level",
      name: "Stale level",
    });
    const tag = await service.createTag(organizer, {
      eventId: "event-a",
      id: "stale-tag",
      name: "Stale tag",
    });
    const session = await service.createSession(organizer, {
      eventId: "event-a",
      id: "stale-references-session",
      title: "Original title",
      description: "Original description",
      durationMinutes: 30,
      roomId: room.id,
      trackId: track.id,
      formatId: format.id,
      levelId: level.id,
      tagIds: [tag.id],
      speakerIds: ["speaker-1"],
      resourceIds: ["stale-resource"],
      status: "Accepted",
    });

    await repository.deleteRoom("tenant-a", "event-a", room.id, room.version);
    await repository.deleteTrack("tenant-a", "event-a", track.id, track.version);
    await repository.deleteFormat("tenant-a", "event-a", format.id, format.version);
    await repository.deleteLevel("tenant-a", "event-a", level.id, level.version);
    await repository.deleteTag("tenant-a", "event-a", tag.id, tag.version);
    repository.setSpeakerIds("tenant-a", "event-a", ["speaker-2"]);

    const updated = await service.updateSession(organizer, {
      eventId: "event-a",
      sessionId: session.id,
      expectedVersion: session.version,
      title: "Updated title",
      description: "Updated description",
      contentStatus: "Approved",
    });
    expect(updated).toMatchObject({
      title: "Updated title",
      description: "Updated description",
      contentStatus: "Approved",
      version: 2,
      roomId: room.id,
      trackId: track.id,
      formatId: format.id,
      levelId: level.id,
      tagIds: [tag.id],
      speakerIds: ["speaker-1"],
      resourceIds: ["stale-resource"],
    });
    expect(updated.trackIds).toEqual([track.id]);
    expect(updated.speakerRoster).toEqual([{ id: "speaker-1" }]);

    await expect(
      service.updateSession(organizer, {
        eventId: "event-a",
        sessionId: session.id,
        expectedVersion: updated.version,
        trackId: "unknown-track",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });

    await expect(
      service.updateSession(organizer, {
        eventId: "event-a",
        sessionId: session.id,
        expectedVersion: session.version,
        title: "Stale version",
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409 });

    await expect(
      service.updateSession(actor("tenant-b"), {
        eventId: "event-a",
        sessionId: session.id,
        expectedVersion: updated.version,
        title: "Cross-tenant update",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });

    const persisted = await repository.getSession("tenant-a", "event-a", session.id);
    expect(persisted).toMatchObject({
      version: updated.version,
      title: updated.title,
      trackId: track.id,
      trackIds: [track.id],
      roomId: room.id,
      formatId: format.id,
      levelId: level.id,
      tagIds: [tag.id],
      speakerIds: ["speaker-1"],
      resourceIds: ["stale-resource"],
    });
  });
  it("starts session list reads before agenda initialization settles", async () => {
    const { repository, service: seedService } = setup();
    const seeded = await seedService.createSession(actor(), {
      eventId: "event-a",
      id: "deferred-session",
      title: "Deferred session",
      durationMinutes: 30,
      status: "Accepted",
      speakerIds: ["speaker-1"],
    });

    let resolveInitialization!: () => void;
    const initialization = new Promise<void>((resolve) => {
      resolveInitialization = resolve;
    });
    let listStarted = false;
    const originalListSessions = repository.listSessions.bind(repository);
    repository.listSessions = async (tenantId, eventId) => {
      listStarted = true;
      return originalListSessions(tenantId, eventId);
    };
    const service = new SessionService(repository, {
      agendaCatalogSynchronizer: {
        async ensureInitialized() {
          await initialization;
          return undefined;
        },
        async synchronize() {
          return undefined;
        },
      },
    });

    const pagePromise = service.listSessionsPage(actor(), { eventId: "event-a" });
    await Promise.resolve();
    const startedBeforeInitializationSettled = listStarted;
    resolveInitialization();
    const page = await pagePromise;

    expect(startedBeforeInitializationSettled).toBe(true);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).not.toHaveProperty("history");
    expect(page.items[0]?.id).toBe(seeded.id);
  });

  it("audits eligibility changes, validates rooms and rosters, and filters safely", async () => {
    const { service } = setup();
    const organizer = actor();
    await expect(
      service.createRoom(organizer, { eventId: "event-a", id: "bad", name: "Bad", capacity: -1 }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      service.createSession(organizer, {
        eventId: "event-a",
        title: "Unknown speaker",
        durationMinutes: 20,
        speakerIds: ["not-a-speaker"],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const settings = await service.getSettings(organizer, { eventId: "event-a" });
    const changed = await service.updateSettings(organizer, {
      eventId: "event-a",
      expectedVersion: settings.version,
      agendaEligibleStatuses: ["Accepted", "Waitlisted"],
    });
    expect(changed.version).toBe(2);
    const audit = await service.listAudit(organizer, { eventId: "event-a", entityId: settings.id });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "settings.updated",
      actorId: organizer.userId,
      version: 2,
    });

    const waitlisted = await service.createSession(organizer, {
      eventId: "event-a",
      id: "z-session",
      title: "Zebra",
      durationMinutes: 30,
      status: "Waitlisted",
      speakerIds: ["speaker-1"],
    });
    await service.updateSession(organizer, {
      eventId: "event-a",
      sessionId: waitlisted.id,
      expectedVersion: waitlisted.version,
      contentStatus: "Approved",
    });
    const accepted = await service.createSession(organizer, {
      eventId: "event-a",
      id: "a-session",
      title: "Alpha",
      durationMinutes: 45,
      status: "Accepted",
      speakerIds: ["speaker-2"],
    });
    await service.updateSession(organizer, {
      eventId: "event-a",
      sessionId: accepted.id,
      expectedVersion: accepted.version,
      contentStatus: "Approved",
    });
    const listed = await service.listSessions(organizer, {
      eventId: "event-a",
      agendaEligible: true,
      sortBy: "title",
      direction: "asc",
    });
    expect(listed.map((session) => session.id)).toEqual(["a-session", "z-session"]);
    for (const session of listed) expect(session).not.toHaveProperty("history");
    expect((await service.getAgendaCatalog("tenant-a", "event-a")).sessions).toHaveLength(2);
    expect(await service.getAgendaCatalog("tenant-a", "event-a")).not.toHaveProperty("published");
  });

  it("exposes organizer-only CRUD routes with no publication action", async () => {
    const { service } = setup();
    const routes = createSessionAdminRoutes({ service });
    const app = new Hono<SessionRouteEnvironment>();
    app.use("*", async (context, next) => {
      context.set("authPrincipal", principal());
      context.set("traceId", "trace-1");
      await next();
    });
    app.route("/api/admin/organizations/:organizationId/events/:eventId/sessions", routes);

    const response = await app.request(
      "http://localhost/api/admin/organizations/tenant-a/events/event-a/sessions",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "route-session", title: "Route session", durationMinutes: 30 }),
      },
    );
    expect(response.status).toBe(201);
    expect(((await response.json()) as { data: { id: string } }).data.id).toBe("route-session");

    const forbiddenApp = new Hono<SessionRouteEnvironment>();
    forbiddenApp.use("*", async (context, next) => {
      context.set("authPrincipal", null);
      context.set("traceId", "trace-2");
      await next();
    });
    forbiddenApp.route("/api/admin/organizations/:organizationId/events/:eventId/sessions", routes);
    const denied = await forbiddenApp.request(
      "http://localhost/api/admin/organizations/tenant-a/events/event-a/sessions",
    );
    expect(denied.status).toBe(401);
    expect(await denied.json()).toMatchObject({ error: { code: "AUTHENTICATION_REQUIRED" } });
  });
  it("surfaces unexpected organizer session list failures as HTTP 500", async () => {
    const routes = createSessionAdminRoutes({
      service: {
        listSessions: async () => {
          throw new Error("repository unavailable");
        },
      } as never,
    });
    const app = new Hono<SessionRouteEnvironment>();
    app.use("*", async (context, next) => {
      context.set("authPrincipal", principal());
      context.set("traceId", "trace-list-failure");
      await next();
    });
    app.route("/api/admin/organizations/:organizationId/events/:eventId/sessions", routes);

    const response = await app.request(
      "http://localhost/api/admin/organizations/tenant-a/events/event-a/sessions",
    );
    expect(response.status).toBe(500);
  });
  it("persists organizer content edits, attribution, approval commands, and conflicts through the route envelope", async () => {
    const { service } = setup();
    const routes = createSessionAdminRoutes({ service });
    const app = new Hono<SessionRouteEnvironment>();
    app.use("*", async (context, next) => {
      context.set("authPrincipal", principal());
      context.set("traceId", "trace-content");
      await next();
    });
    app.route("/api/admin/organizations/:organizationId/events/:eventId/sessions", routes);
    const readPublishedContent = async () => {
      const response = await app.request(
        "http://localhost/api/admin/organizations/tenant-a/events/event-a/sessions/published-content",
      );
      expect(response.status).toBe(200);
      return (
        (await response.json()) as {
          data: {
            tenantId: string;
            eventId: string;
            sessions: readonly {
              id: string;
              title: string;
              abstract: string;
              contentStatus: "Approved";
              durationMinutes: number;
              capacityRequired: number;
              roomId?: string;
              trackIds: readonly string[];
              formatId?: string;
              speakerIds: readonly string[];
              resourceIds: readonly string[];
              version: number;
              updatedAt: string;
            }[];
          };
        }
      ).data;
    };

    const createdResponse = await app.request(
      "http://localhost/api/admin/organizations/tenant-a/events/event-a/sessions",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "content-session",
          title: "Original title",
          description: "Original abstract",
          durationMinutes: 30,
          status: "Accepted",
          speakerIds: ["speaker-1"],
        }),
      },
    );
    const created = (
      (await createdResponse.json()) as {
        data: { id: string; version: number; contentStatus?: string };
      }
    ).data;
    expect(createdResponse.status).toBe(201);
    expect(created).toMatchObject({
      id: "content-session",
      version: 1,
      contentStatus: "Needs changes",
    });
    expect(await readPublishedContent()).toEqual({
      tenantId: "tenant-a",
      eventId: "event-a",
      sessions: [],
    });

    const firstResponse = await app.request(
      "http://localhost/api/admin/organizations/tenant-a/events/event-a/sessions/content-session",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: created.version,
          title: "Prefixed title",
          description: "Original abstract",
        }),
      },
    );
    const first = (
      (await firstResponse.json()) as {
        data: {
          title: string;
          description: string;
          contentStatus: string;
          version: number;
          updatedBy: string;
          history: readonly {
            version: number;
            actorId: string;
            occurredAt: string;
          }[];
        };
      }
    ).data;
    expect(firstResponse.status).toBe(200);
    expect(first).toMatchObject({
      title: "Prefixed title",
      description: "Original abstract",
      contentStatus: "Needs changes",
      version: 2,
      updatedBy: "organizer-1",
    });
    expect((await readPublishedContent()).sessions).toEqual([]);

    const secondResponse = await app.request(
      "http://localhost/api/admin/organizations/tenant-a/events/event-a/sessions/content-session",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: first.version,
          title: first.title,
          description: "Original abstract with appended detail",
        }),
      },
    );
    const second = (
      (await secondResponse.json()) as {
        data: {
          title: string;
          description: string;
          contentStatus: string;
          version: number;
          history: readonly {
            version: number;
            actorId: string;
            occurredAt: string;
          }[];
        };
      }
    ).data;
    expect(secondResponse.status).toBe(200);
    expect(second).toMatchObject({
      title: "Prefixed title",
      description: "Original abstract with appended detail",
      contentStatus: "Needs changes",
      version: 3,
    });
    expect(second.history).toHaveLength(3);
    expect(second.history.slice(1)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          version: 2,
          actorId: "organizer-1",
          occurredAt: now.toISOString(),
          actorLabel: "organizer-1",
          snapshot: expect.objectContaining({
            title: "Prefixed title",
            description: "Original abstract",
          }),
        }),
        expect.objectContaining({
          version: 3,
          actorId: "organizer-1",
          occurredAt: now.toISOString(),
          actorLabel: "organizer-1",
          snapshot: expect.objectContaining({
            title: "Prefixed title",
            description: "Original abstract with appended detail",
          }),
        }),
      ]),
    );
    const historyResponse = await app.request(
      "http://localhost/api/admin/organizations/tenant-a/events/event-a/sessions/content-session/history",
    );
    expect(historyResponse.status).toBe(200);
    const history = (
      (await historyResponse.json()) as {
        data: readonly {
          version: number;
          actorId: string;
          occurredAt: string;
          actorLabel?: string;
          title?: string;
          description?: string;
          snapshot?: { title: string; description: string };
        }[];
      }
    ).data;
    expect(history.map((entry) => entry.version)).toEqual([1, 2, 3]);
    expect(history.slice(1)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: "organizer-1",
          occurredAt: now.toISOString(),
          actorLabel: "organizer-1",
          snapshot: expect.objectContaining({
            title: "Prefixed title",
            description: "Original abstract",
          }),
          title: "Prefixed title",
          description: "Original abstract",
        }),
        expect.objectContaining({
          actorId: "organizer-1",
          occurredAt: now.toISOString(),
          actorLabel: "organizer-1",
          snapshot: expect.objectContaining({
            title: "Prefixed title",
            description: "Original abstract with appended detail",
          }),
          title: "Prefixed title",
          description: "Original abstract with appended detail",
        }),
      ]),
    );

    const restoreResponse = await app.request(
      "http://localhost/api/admin/organizations/tenant-a/events/event-a/sessions/content-session/restore",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: first.version, expectedVersion: second.version }),
      },
    );
    expect(restoreResponse.status).toBe(200);
    const restored = (
      (await restoreResponse.json()) as {
        data: {
          title: string;
          description: string;
          contentStatus: string;
          version: number;
          updatedBy: string;
          history: readonly {
            action: string;
            version: number;
            actorId: string;
            actorLabel?: string;
            occurredAt: string;
          }[];
        };
      }
    ).data;
    expect(restored).toMatchObject({
      title: "Prefixed title",
      description: "Original abstract",
      contentStatus: "Needs changes",
      version: 4,
      updatedBy: "organizer-1",
    });
    expect(restored.history.at(-1)).toMatchObject({
      action: "restored",
      version: 4,
      actorId: "organizer-1",
      actorLabel: "organizer-1",
      occurredAt: now.toISOString(),
    });
    expect((await readPublishedContent()).sessions).toEqual([]);

    const approvalResponse = await app.request(
      "http://localhost/api/admin/organizations/tenant-a/events/event-a/sessions/content-session",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: restored.version, contentStatus: "Approved" }),
      },
    );
    expect(approvalResponse.status).toBe(200);
    const approved = (
      (await approvalResponse.json()) as {
        data: {
          version: number;
          id: string;
          history: readonly {
            action: string;
            version: number;
            actorId: string;
            actorLabel?: string;
            occurredAt: string;
          }[];
        };
      }
    ).data;
    expect(approved).toMatchObject({ id: "content-session", version: 5 });
    expect(approved.history).toHaveLength(5);
    expect(approved.history.at(-1)).toMatchObject({
      action: "approved",
      version: 5,
      actorId: "organizer-1",
      actorLabel: "organizer-1",
      occurredAt: now.toISOString(),
    });
    expect(await readPublishedContent()).toEqual({
      tenantId: "tenant-a",
      eventId: "event-a",
      sessions: [
        {
          id: "content-session",
          title: "Prefixed title",
          abstract: "Original abstract",
          contentStatus: "Approved",
          durationMinutes: 30,
          capacityRequired: 0,
          trackIds: [],
          speakerIds: ["speaker-1"],
          speakerNames: ["Speaker"],
          resourceIds: [],
          version: 5,
          updatedAt: now.toISOString(),
        },
      ],
    });

    const approvedEditResponse = await app.request(
      "http://localhost/api/admin/organizations/tenant-a/events/event-a/sessions/content-session",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: approved.version,
          title: "Approved title correction",
          contentStatus: "Approved",
        }),
      },
    );
    expect(approvedEditResponse.status).toBe(200);
    const approvedEdit = (
      (await approvedEditResponse.json()) as {
        data: {
          title: string;
          contentStatus: string;
          version: number;
          history: readonly {
            action: string;
            version: number;
            actorId: string;
            occurredAt: string;
          }[];
        };
      }
    ).data;
    expect(approvedEdit).toMatchObject({
      title: "Approved title correction",
      contentStatus: "Approved",
      version: 6,
    });
    expect(approvedEdit.history.at(-1)).toMatchObject({
      action: "updated",
      version: 6,
      actorId: "organizer-1",
      occurredAt: now.toISOString(),
    });
    expect((await readPublishedContent()).sessions[0]).toMatchObject({
      title: "Approved title correction",
      contentStatus: "Approved",
      version: 6,
    });

    const noOpResponse = await app.request(
      "http://localhost/api/admin/organizations/tenant-a/events/event-a/sessions/content-session",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: approvedEdit.version, contentStatus: "Approved" }),
      },
    );
    expect(noOpResponse.status).toBe(200);
    expect(
      (
        (await noOpResponse.json()) as {
          data: { version: number; history: readonly unknown[] };
        }
      ).data,
    ).toMatchObject({ version: 6, history: approvedEdit.history });

    const conflictResponse = await app.request(
      "http://localhost/api/admin/organizations/tenant-a/events/event-a/sessions/content-session",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: first.version,
          title: "Stale edit",
        }),
      },
    );
    expect(conflictResponse.status).toBe(409);
    expect(await conflictResponse.json()).toMatchObject({ error: { code: "CONFLICT" } });
  });
  it("exposes immutable snapshots, restores with concurrency, and denies other tenants", async () => {
    const { service } = setup();
    const routes = createSessionAdminRoutes({ service });
    const app = new Hono<SessionRouteEnvironment>();
    app.use("*", async (context, next) => {
      context.set("authPrincipal", principal());
      context.set("traceId", "trace-history");
      await next();
    });
    app.route("/api/admin/organizations/:organizationId/events/:eventId/sessions", routes);

    const createResponse = await app.request(
      "http://localhost/api/admin/organizations/tenant-a/events/event-a/sessions",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "history-session",
          title: "Version one",
          description: "First abstract",
          durationMinutes: 30,
          status: "Accepted",
          speakerIds: ["speaker-1"],
        }),
      },
    );
    expect(createResponse.status).toBe(201);
    const created = (
      (await createResponse.json()) as { data: { version: number; contentStatus?: string } }
    ).data;
    expect(created).toMatchObject({ version: 1, contentStatus: "Needs changes" });
    const listResponse = await app.request(
      "http://localhost/api/admin/organizations/tenant-a/events/event-a/sessions",
    );
    expect(listResponse.status).toBe(200);
    const list = (await listResponse.json()) as {
      data: readonly Record<string, unknown>[];
    };
    expect(list.data).toHaveLength(1);
    expect(list.data[0]).toMatchObject({ id: "history-session", title: "Version one" });
    expect(list.data[0]).not.toHaveProperty("history");

    const first = await app.request(
      "http://localhost/api/admin/organizations/tenant-a/events/event-a/sessions/history-session",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: 1,
          title: "Version two",
          description: "Second abstract",
        }),
      },
    );
    expect(first.status).toBe(200);
    const second = await app.request(
      "http://localhost/api/admin/organizations/tenant-a/events/event-a/sessions/history-session",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: 2,
          title: "Version three",
          description: "Third abstract",
          contentStatus: "Needs changes",
        }),
      },
    );
    expect(second.status).toBe(200);

    const historyResponse = await app.request(
      "http://localhost/api/admin/organizations/tenant-a/events/event-a/sessions/history-session/history",
    );
    expect(historyResponse.status).toBe(200);
    const history = (
      (await historyResponse.json()) as {
        data: readonly {
          action: string;
          version: number;
          actorId: string;
          snapshot?: { title: string; description: string };
        }[];
      }
    ).data;
    expect(history.map((entry) => entry.version)).toEqual([1, 2, 3]);
    expect(history[0]).toMatchObject({
      actorId: "organizer-1",
      snapshot: { title: "Version one", description: "First abstract" },
    });
    expect(history[1]?.snapshot).toMatchObject({
      title: "Version two",
      description: "Second abstract",
    });
    const tamperedSnapshot = history[0]?.snapshot;
    if (tamperedSnapshot !== undefined) tamperedSnapshot.title = "tampered";
    const rereadHistoryResponse = await app.request(
      "http://localhost/api/admin/organizations/tenant-a/events/event-a/sessions/history-session/history",
    );
    const rereadHistory = (
      (await rereadHistoryResponse.json()) as {
        data: readonly { snapshot?: { title: string } }[];
      }
    ).data;
    expect(rereadHistory[0]?.snapshot?.title).toBe("Version one");

    const restoreResponse = await app.request(
      "http://localhost/api/admin/organizations/tenant-a/events/event-a/sessions/history-session/restore",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: 1, expectedVersion: 3 }),
      },
    );
    expect(restoreResponse.status).toBe(200);
    const restored = (
      (await restoreResponse.json()) as {
        data: {
          title: string;
          description: string;
          contentStatus?: string;
          version: number;
          history: readonly { action: string; version: number }[];
        };
      }
    ).data;
    expect(restored).toMatchObject({
      title: "Version one",
      description: "First abstract",
      contentStatus: "Needs changes",
      version: 4,
    });
    expect(restored.history).toHaveLength(4);
    expect(restored.history.at(-1)).toMatchObject({ action: "restored", version: 4 });

    const staleRestore = await app.request(
      "http://localhost/api/admin/organizations/tenant-a/events/event-a/sessions/history-session/restore",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: 2, expectedVersion: 3 }),
      },
    );
    expect(staleRestore.status).toBe(409);

    const otherTenantApp = new Hono<SessionRouteEnvironment>();
    otherTenantApp.use("*", async (context, next) => {
      context.set("authPrincipal", principal("tenant-b"));
      context.set("traceId", "trace-cross-tenant");
      await next();
    });
    otherTenantApp.route(
      "/api/admin/organizations/:organizationId/events/:eventId/sessions",
      routes,
    );
    const crossTenant = await otherTenantApp.request(
      "http://localhost/api/admin/organizations/tenant-b/events/event-a/sessions/history-session/history",
    );
    expect(crossTenant.status).toBe(404);
  });
  it("round-trips canonical taxonomy through linked Airtable fields", async () => {
    const tenantId = "tenant-a";
    const eventId = "event-a";
    const trackId = "devflow-conf-2027-track-platform-infra";
    const sessionId = "taming-session";
    const linkedTrackRecordId = "rec00000000000009";
    const initialHistory = [
      {
        id: "taming-session:v1",
        action: "created",
        version: 1,
        actorId: "seed",
        occurredAt: now.toISOString(),
        title: "Taming 40-Minute CI",
        description: "Original abstract",
        snapshot: {
          id: sessionId,
          tenantId,
          eventId,
          title: "Taming 40-Minute CI",
          description: "Original abstract",
          status: "Accepted",
          contentStatus: "Approved",
          durationMinutes: 40,
          capacityRequired: 1,
          trackId,
          trackIds: [trackId],
          tagIds: [],
          speakerIds: [],
          speakerRoster: [],
          resourceIds: [],
        },
      },
    ];
    const sessionPayload = {
      id: sessionId,
      title: "stale metadata title",
      description: "stale metadata abstract",
      status: "Draft",
      durationMinutes: 10,
      capacityRequired: 999,
      tagIds: [],
      speakerIds: [],
      speakerRoster: [],
      resourceIds: [],
      version: 99,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      createdBy: "seed",
      updatedBy: "seed",
      history: initialHistory,
    };
    const transport = new FakeAirtableTransport();
    transport.seed({
      baseId: "base-test",
      table: "Tracks",
      recordId: linkedTrackRecordId,
      fields: {
        "Application ID": trackId,
        "Organization ID": tenantId,
        "Event ID": eventId,
        Organization: ["rec00000000000010"],
        Event: ["rec00000000000011"],
        Name: "Platform & Infra",
        Description: "Canonical description",
        Version: 1,
        "Metadata JSON": JSON.stringify({
          id: trackId,
          name: "stale metadata name",
          version: 99,
          history: [],
        }),
      },
    });
    transport.seed({
      baseId: "base-test",
      table: "Tracks",
      recordId: "rec00000000000012",
      fields: {
        "Application ID": "track-other-event",
        "Organization ID": tenantId,
        "Event ID": "event-b",
        Name: "Other event track",
        Description: "",
        Version: 1,
        "Metadata JSON": JSON.stringify({
          id: "track-other-event",
          name: "Other event track",
          version: 1,
          history: [],
        }),
      },
    });
    transport.seed({
      baseId: "base-test",
      table: "Sessions",
      recordId: "rec00000000000013",
      fields: {
        "Application ID": sessionId,
        "Organization ID": tenantId,
        "Event ID": eventId,
        Title: "Taming 40-Minute CI",
        Description: "Original abstract",
        Status: "Accepted",
        Version: 1,
        "Duration Minutes": 40,
        "Capacity Required": 1,
        "Settings JSON": JSON.stringify({
          publicationStatus: "published",
          trackId,
        }),
        Track: [linkedTrackRecordId],
        "Track IDs JSON": JSON.stringify([trackId]),
        "Metadata JSON": JSON.stringify(sessionPayload),
      },
    });

    const service = new SessionService(
      new AirtableSessionRepository({ baseId: "base-test", transport }),
      { clock: () => now, generateId: () => "audit-update" },
    );
    const routes = createSessionAdminRoutes({ service });
    const app = new Hono<SessionRouteEnvironment>();
    app.use("*", async (context, next) => {
      context.set("authPrincipal", principal());
      context.set("traceId", "trace-airtable-taxonomy");
      await next();
    });
    app.route("/api/admin/organizations/:organizationId/events/:eventId/sessions", routes);

    const trackResponse = await app.request(
      `http://localhost/api/admin/organizations/${tenantId}/events/${eventId}/sessions/tracks/${trackId}`,
    );
    expect(trackResponse.status).toBe(200);
    expect(await trackResponse.json()).toMatchObject({
      data: {
        id: trackId,
        tenantId,
        eventId,
        name: "Platform & Infra",
        description: "Canonical description",
        version: 1,
      },
    });

    const updateResponse = await app.request(
      `http://localhost/api/admin/organizations/${tenantId}/events/${eventId}/sessions/${sessionId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: 1,
          title: "Taming 40-Minute CI: Updated",
          description: "Updated abstract",
          contentStatus: "Approved",
        }),
      },
    );
    expect(updateResponse.status).toBe(200);
    const updated = (await updateResponse.json()) as {
      data: {
        title: string;
        description: string;
        contentStatus?: string;
        trackId?: string;
        trackIds: readonly string[];
        version: number;
        history: readonly { version: number; title?: string; description?: string }[];
      };
    };
    expect(updated.data).toMatchObject({
      title: "Taming 40-Minute CI: Updated",
      description: "Updated abstract",
      contentStatus: "Approved",
      trackId,
      trackIds: [trackId],
      version: 2,
    });
    expect(updated.data.history).toHaveLength(2);
    expect(updated.data.history.at(-1)).toMatchObject({
      version: 2,
      title: "Taming 40-Minute CI: Updated",
      description: "Updated abstract",
    });

    const sessionPatch = transport.requests.find(
      (request) => request.method === "PATCH" && request.table === "Sessions",
    );
    const persisted = (sessionPatch?.body as { fields?: { "Metadata JSON"?: string } } | undefined)
      ?.fields?.["Metadata JSON"];
    expect(JSON.parse(String(persisted))).toMatchObject({
      title: "Taming 40-Minute CI: Updated",
      description: "Updated abstract",
      contentStatus: "Approved",
      trackId,
      trackIds: [trackId],
      version: 2,
      history: [{ version: 1 }, { version: 2 }],
    });
    expect(JSON.stringify(sessionPatch?.body)).not.toContain(linkedTrackRecordId);

    const reloadedResponse = await app.request(
      `http://localhost/api/admin/organizations/${tenantId}/events/${eventId}/sessions/${sessionId}`,
    );
    expect(reloadedResponse.status).toBe(200);
    expect(await reloadedResponse.json()).toMatchObject({
      data: {
        title: "Taming 40-Minute CI: Updated",
        description: "Updated abstract",
        contentStatus: "Approved",
        trackId,
        trackIds: [trackId],
        version: 2,
        history: [{ version: 1 }, { version: 2 }],
      },
    });

    const crossEventUpdate = await app.request(
      `http://localhost/api/admin/organizations/${tenantId}/events/${eventId}/sessions/${sessionId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: 2,
          trackId: "track-other-event",
        }),
      },
    );
    expect(crossEventUpdate.status).toBe(404);
    expect(await crossEventUpdate.json()).toMatchObject({
      error: { message: "The track was not found." },
    });
  });
  it("creates a room through the organizer route and returns it after reload", async () => {
    const { service } = setup();
    const routes = createSessionAdminRoutes({ service });
    const app = new Hono<SessionRouteEnvironment>();
    app.use("*", async (context, next) => {
      context.set("authPrincipal", principal());
      context.set("traceId", "trace-room");
      await next();
    });
    app.route("/api/admin/organizations/:organizationId/events/:eventId/sessions", routes);
    const base = "http://localhost/api/admin/organizations/tenant-a/events/event-a/sessions/rooms";
    const createResponse = await app.request(base, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "room-qa-overflow",
        name: "QA Overflow Lab",
        capacity: 80,
        resources: ["Projector"],
      }),
    });
    expect(createResponse.status).toBe(201);
    expect(await createResponse.json()).toMatchObject({
      data: {
        id: "room-qa-overflow",
        tenantId: "tenant-a",
        eventId: "event-a",
        name: "QA Overflow Lab",
        capacity: 80,
        resources: ["Projector"],
        version: 1,
      },
    });

    const reloadResponse = await app.request(base);
    expect(reloadResponse.status).toBe(200);
    expect(await reloadResponse.json()).toMatchObject({
      data: [
        {
          id: "room-qa-overflow",
          name: "QA Overflow Lab",
          capacity: 80,
          resources: ["Projector"],
        },
      ],
    });
  });

  it("reports agenda synchronization failures without duplicating a persisted idempotent room", async () => {
    const { repository } = setup();
    let synchronizationAttempts = 0;
    const service = new SessionService(repository, {
      clock: () => now,
      generateId: () => "generated-room",
      agendaCatalogSynchronizer: {
        async ensureInitialized() {
          return undefined;
        },
        async synchronize() {
          synchronizationAttempts += 1;
          if (synchronizationAttempts === 1) throw new Error("agenda unavailable");
          return undefined;
        },
      },
    });
    const routes = createSessionAdminRoutes({ service });
    const app = new Hono<SessionRouteEnvironment>();
    app.use("*", async (context, next) => {
      context.set("authPrincipal", principal());
      context.set("traceId", "trace-room-retry");
      await next();
    });
    app.route("/api/admin/organizations/:organizationId/events/:eventId/sessions", routes);
    const base = "http://localhost/api/admin/organizations/tenant-a/events/event-a/sessions/rooms";
    const request: RequestInit = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "room-retry",
        name: "Retry room",
        capacity: 40,
      }),
    };

    const failed = await app.request(base, request);
    expect(failed.status).toBe(409);
    expect(await failed.json()).toMatchObject({
      error: {
        code: "CONFLICT",
        message: "The room was saved, but the agenda could not be synchronized. Retry the request.",
      },
    });

    const persisted = await app.request(base);
    expect(persisted.status).toBe(200);
    expect(await persisted.json()).toMatchObject({
      data: [{ id: "room-retry", name: "Retry room", capacity: 40 }],
    });

    const retried = await app.request(base, request);
    expect(retried.status).toBe(201);
    expect(await retried.json()).toMatchObject({
      data: { id: "room-retry", name: "Retry room", capacity: 40, version: 1 },
    });
    expect(synchronizationAttempts).toBe(2);
    expect(await (await app.request(base)).json()).toMatchObject({
      data: [{ id: "room-retry" }],
    });
  });

  it("demotes an accepted canonical session without changing its identity", async () => {
    const { service } = setup();
    const accepted = await service.createSession(actor(), {
      eventId: "event-a",
      id: "session-submission-1",
      title: "Reliable systems",
      description: "A practical session.",
      status: "Accepted",
      durationMinutes: 30,
      speakerIds: ["speaker-1"],
    });

    const stale = await service.reconcileDecisionSessionStatus({
      tenantId: "tenant-a",
      eventId: "event-a",
      sessionId: accepted.id,
      status: "rejected",
      actorId: "organizer-1",
      isCurrentDecision: async () => false,
    });
    expect(stale).toMatchObject({ id: accepted.id, status: "Accepted", version: 1 });

    const rejected = await service.reconcileDecisionSessionStatus({
      tenantId: "tenant-a",
      eventId: "event-a",
      sessionId: accepted.id,
      status: "rejected",
      actorId: "organizer-1",
    });
    expect(rejected).toMatchObject({
      id: accepted.id,
      status: "Rejected",
      version: 2,
    });
    expect(rejected?.history.at(-1)).toMatchObject({
      priorStatus: "Accepted",
      newStatus: "Rejected",
    });

    const replay = await service.reconcileDecisionSessionStatus({
      tenantId: "tenant-a",
      eventId: "event-a",
      sessionId: accepted.id,
      status: "rejected",
      actorId: "organizer-1",
    });
    expect(replay).toMatchObject({ id: accepted.id, status: "Rejected", version: 2 });
  });

  it("retries agenda synchronization after a persisted demotion", async () => {
    let synchronizeCalls = 0;
    const repository = new InMemorySessionRepository();
    const initialService = new SessionService(repository, {
      clock: () => now,
      generateId: () => "generated-session-id",
    });
    const accepted = await initialService.createSession(actor(), {
      eventId: "event-a",
      id: "session-submission-2",
      title: "Retryable agenda",
      description: "A retryable session.",
      status: "Accepted",
      durationMinutes: 30,
      speakerIds: ["speaker-1"],
    });
    await repository.putSession(
      {
        ...accepted,
        status: "Rejected",
        version: 2,
        updatedAt: accepted.updatedAt,
      },
      accepted.version,
    );

    let failNextSynchronization = true;
    const service = new SessionService(repository, {
      clock: () => now,
      generateId: () => "generated-session-id",
      agendaCatalogSynchronizer: {
        ensureInitialized: async () => undefined,
        synchronize: async () => {
          synchronizeCalls += 1;
          if (failNextSynchronization) {
            failNextSynchronization = false;
            throw new Error("agenda unavailable");
          }
          return undefined;
        },
      },
    });

    await expect(
      service.reconcileDecisionSessionStatus({
        tenantId: "tenant-a",
        eventId: "event-a",
        sessionId: accepted.id,
        status: "rejected",
        actorId: "organizer-1",
      }),
    ).rejects.toThrow();
    expect(await repository.getSession("tenant-a", "event-a", accepted.id)).toMatchObject({
      status: "Rejected",
      version: 2,
    });

    await expect(
      service.reconcileDecisionSessionStatus({
        tenantId: "tenant-a",
        eventId: "event-a",
        sessionId: accepted.id,
        status: "rejected",
        actorId: "organizer-1",
      }),
    ).resolves.toMatchObject({ status: "Rejected", version: 2 });
    expect(synchronizeCalls).toBe(2);
  });
});
