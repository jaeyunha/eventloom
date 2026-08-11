import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AuthPrincipal } from "../auth/types";
import { createEventRoutes, type EventRouteEnvironment } from "./routes";
import { EventService, InMemoryEventRepository } from "./service";
import type { Event, EventActor } from "./types";

const firstNow = new Date("2026-08-09T12:00:00.000Z");

function actor(organizationId = "org-a", role: EventActor["role"] = "owner"): EventActor {
  return { organizationId, userId: "organizer-1", role, kind: "user" };
}

function createService() {
  let sequence = 0;
  const repository = new InMemoryEventRepository();
  const service = new EventService(repository, {
    clock: () => new Date(firstNow.getTime() + sequence * 1_000),
    generateId: () => `generated-${++sequence}`,
  });
  return { repository, service };
}

function createInput(overrides: Partial<Parameters<EventService["createEvent"]>[1]> = {}) {
  return {
    slug: "summit-2026",
    name: "Summit 2026",
    timeZone: "America/Los_Angeles",
    startsAt: "2026-10-01T09:00:00.000Z",
    endsAt: "2026-10-03T17:00:00.000Z",
    venue: "Main hall",
    ...overrides,
  };
}
function embedConfiguration(
  overrides: Partial<Event["embedConfigurations"][number]> = {},
): Event["embedConfigurations"][number] {
  return {
    id: "public-schedule",
    name: "Public schedule",
    widgetId: "agenda",
    enabled: true,
    theme: "auto",
    outputFormat: "styled-html",
    layout: "timeline",
    accent: "#4F5EE8",
    backgroundColor: "#FFFFFF",
    textColor: "#20232B",
    customCss: "",
    displayFields: ["title", "date-time", "room"],
    tracks: ["Track A"],
    statuses: ["Approved"],
    ...overrides,
  };
}

function principal(
  organizationId = "org-a",
  role: "owner" | "admin" | "reviewer" = "owner",
): AuthPrincipal {
  return {
    kind: "user",
    sessionId: "session-1",
    userId: "organizer-1",
    email: "organizer@example.com",
    memberships: [{ organizationId, role }],
    speakerGrants: [],
  };
}

function appFor(
  service: EventService,
  currentPrincipal: AuthPrincipal | null = principal(),
): Hono<EventRouteEnvironment> {
  const app = new Hono<EventRouteEnvironment>();
  app.use("*", async (context, next) => {
    context.set("authPrincipal", currentPrincipal);
    context.set("traceId", "trace-events");
    await next();
  });
  app.route("/api/admin/organizations/:organizationId/events", createEventRoutes({ service }));
  return app;
}

async function responseData<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as { data: T };
  return payload.data;
}

async function responseError(response: Response): Promise<{ code: string; message: string }> {
  const payload = (await response.json()) as { error: { code: string; message: string } };
  return payload.error;
}

describe("organizer event domain", () => {
  it("creates, lists, updates, gets, and archives only the event record", async () => {
    const { repository, service } = createService();
    const created = await service.createEvent(actor(), createInput());

    expect(created).toMatchObject({
      id: "generated-1",
      slug: "summit-2026",
      organizationId: "org-a",
      version: 1,
      createdBy: "organizer-1",
      updatedBy: "organizer-1",
      cfpSettings: { enabled: false, opensAt: null, closesAt: null },
      embedConfigurations: [],
      defaultCalendarSettings: {
        durationMinutes: 30,
        timeZone: "America/Los_Angeles",
        location: "Main hall",
      },
    });
    expect(created).not.toHaveProperty("sessions");
    expect(created).not.toHaveProperty("published");
    expect(await repository.listEvents("org-a")).toHaveLength(1);

    const listed = await service.listEvents(actor(), { organizationId: "org-a" });
    expect(listed.map((event) => event.id)).toEqual([created.id]);

    const updated = await service.updateEvent(actor("org-a", "admin"), {
      organizationId: "org-a",
      eventId: created.id,
      expectedVersion: created.version,
      name: "Summit 2026 revised",
      status: "active",
      venue: "Auditorium",
      defaultCalendarSettings: { durationMinutes: 45 },
      embedConfigurations: [embedConfiguration()],
    });
    expect(updated).toMatchObject({
      name: "Summit 2026 revised",
      status: "active",
      venue: "Auditorium",
      version: 2,
      updatedBy: "organizer-1",
      defaultCalendarSettings: { durationMinutes: 45 },
      embedConfigurations: [
        embedConfiguration({
          accent: "#4f5ee8",
          backgroundColor: "#ffffff",
          textColor: "#20232b",
        }),
      ],
    });
    expect(updated.updatedAt).not.toBe(created.updatedAt);

    const fetched = await service.getEvent(actor(), {
      organizationId: "org-a",
      eventId: created.id,
    });
    expect(fetched).toEqual(updated);

    const archived = await service.archiveEvent(actor(), {
      organizationId: "org-a",
      eventId: created.id,
      expectedVersion: updated.version,
    });
    expect(archived).toMatchObject({ status: "archived", version: 3, updatedBy: "organizer-1" });
    expect(
      await service.listEvents(actor(), { organizationId: "org-a", includeArchived: false }),
    ).toEqual([]);

    const audit = await service.listAudit(actor(), {
      organizationId: "org-a",
      eventId: created.id,
    });
    expect(audit.map((entry) => entry.action)).toEqual(["created", "updated", "archived"]);
    expect(audit.map((entry) => entry.actorId)).toEqual([
      "organizer-1",
      "organizer-1",
      "organizer-1",
    ]);
  });
  it("persists, reloads, and replaces event embed configurations with versioned authorization", async () => {
    const { repository, service } = createService();
    const created = await service.createEvent(actor(), createInput({ id: "embed-event" }));
    expect(created.embedConfigurations).toEqual([]);

    const saved = await service.updateEvent(actor(), {
      organizationId: "org-a",
      eventId: created.id,
      expectedVersion: created.version,
      embedConfigurations: [embedConfiguration()],
    });
    expect(saved).toMatchObject({
      version: 2,
      embedConfigurations: [
        {
          id: "public-schedule",
          enabled: true,
          accent: "#4f5ee8",
          backgroundColor: "#ffffff",
          textColor: "#20232b",
        },
      ],
    });

    const reloaded = await service.getEvent(actor(), {
      organizationId: "org-a",
      eventId: created.id,
    });
    expect(reloaded.embedConfigurations).toEqual(saved.embedConfigurations);

    const toggled = await service.updateEvent(actor("org-a", "admin"), {
      organizationId: "org-a",
      eventId: created.id,
      expectedVersion: saved.version,
      embedConfigurations: [embedConfiguration({ enabled: false })],
    });
    expect(toggled.embedConfigurations[0]?.enabled).toBe(false);

    await expect(
      service.updateEvent(actor(), {
        organizationId: "org-a",
        eventId: created.id,
        expectedVersion: toggled.version,
        embedConfigurations: [embedConfiguration(), embedConfiguration({ id: "public-schedule" })],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });

    await expect(
      service.updateEvent(actor(), {
        organizationId: "org-a",
        eventId: created.id,
        expectedVersion: saved.version,
        embedConfigurations: [embedConfiguration({ enabled: true })],
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409 });

    await expect(
      service.updateEvent(actor("org-b"), {
        organizationId: "org-a",
        eventId: created.id,
        expectedVersion: toggled.version,
        embedConfigurations: [],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    expect(await repository.listAudit("org-a", created.id)).toHaveLength(3);
  });

  it("enforces slug uniqueness per organization and validates timezone/date ordering", async () => {
    const { service } = createService();
    await service.createEvent(actor(), createInput());
    await expect(service.createEvent(actor(), createInput({ id: "other" }))).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
    });
    await expect(
      service.createEvent(actor("org-b"), createInput({ id: "org-b-event" })),
    ).resolves.toMatchObject({ organizationId: "org-b" });

    await expect(
      service.createEvent(actor(), createInput({ id: "bad-zone", timeZone: "Mars/Olympus" })),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    await expect(
      service.createEvent(
        actor(),
        createInput({
          id: "bad-date",
          startsAt: "2026-10-03T17:00:00.000Z",
          endsAt: "2026-10-01T09:00:00.000Z",
        }),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
  });

  it("rejects stale versions, aliases, and every non-owner/admin or cross-organization actor", async () => {
    const { service } = createService();
    const created = await service.createEvent(actor(), createInput());
    await expect(
      service.updateEvent(actor(), {
        organizationId: "org-a",
        eventId: created.id,
        expectedVersion: 99,
        name: "stale",
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409 });
    await expect(service.listEvents(actor("org-a", "reviewer"))).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    await expect(
      service.getEvent(actor("org-b"), { organizationId: "org-a", eventId: created.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(
      service.createEvent(actor("org-a", "speaker"), createInput({ id: "speaker" })),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(
      service.createEvent(actor(), {
        ...createInput({ id: "legacy-time-zone" }),
        timeZone: "America/Los_Angeles",
        timezone: "America/Los_Angeles",
      } as never),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    await expect(
      service.listAudit(actor(), {
        organizationId: "org-a",
        eventId: created.id,
        tenantId: "org-a",
      } as never),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
  });
});

describe("organizer event routes", () => {
  it("exposes root-relative collection/item CRUD and keeps authorization organization-scoped", async () => {
    const { service } = createService();
    const app = appFor(service, principal("org-a", "owner"));
    const base = "http://localhost/api/admin/organizations/org-a/events";

    const createdResponse = await app.request(base, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(createInput()),
    });
    expect(createdResponse.status).toBe(201);
    const created = await responseData<Event>(createdResponse);
    expect(created.embedConfigurations).toEqual([]);

    const listResponse = await app.request(base);
    expect(listResponse.status).toBe(200);
    expect((await responseData<Event[]>(listResponse)).map((event) => event.slug)).toEqual([
      "summit-2026",
    ]);

    const updateResponse = await app.request(`${base}/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedVersion: 1,
        name: "Updated",
        embedConfigurations: [embedConfiguration()],
      }),
    });
    expect(updateResponse.status).toBe(200);
    expect(await responseData<Event>(updateResponse)).toMatchObject({
      version: 2,
      embedConfigurations: [
        embedConfiguration({
          accent: "#4f5ee8",
          backgroundColor: "#ffffff",
          textColor: "#20232b",
        }),
      ],
    });

    const reloadedResponse = await app.request(`${base}/${created.id}`);
    expect(reloadedResponse.status).toBe(200);
    expect((await responseData<Event>(reloadedResponse)).embedConfigurations).toEqual([
      embedConfiguration({
        accent: "#4f5ee8",
        backgroundColor: "#ffffff",
        textColor: "#20232b",
      }),
    ]);
    const archiveResponse = await app.request(`${base}/${created.id}/archive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 2 }),
    });
    expect(archiveResponse.status).toBe(200);
    expect((await responseData<Event>(archiveResponse)).status).toBe("archived");

    const reviewer = appFor(service, principal("org-a", "reviewer"));
    const denied = await reviewer.request(base);
    expect(denied.status).toBe(403);
    expect(await responseError(denied)).toMatchObject({ code: "ACCESS_DENIED" });

    const crossOrganization = appFor(service, principal("org-b", "owner"));
    const crossOrganizationDenied = await crossOrganization.request(base);
    expect(crossOrganizationDenied.status).toBe(403);
    expect(await responseError(crossOrganizationDenied)).toMatchObject({ code: "ACCESS_DENIED" });

    const unauthenticated = appFor(service, null);
    const unauthenticatedResponse = await unauthenticated.request(base);
    expect(unauthenticatedResponse.status).toBe(401);
    expect(await responseError(unauthenticatedResponse)).toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
    });
  });

  it("rejects non-canonical request fields and reports validation/concurrency errors without mutation", async () => {
    const { service } = createService();
    const app = appFor(service);
    const base = "http://localhost/api/admin/organizations/org-a/events";
    const invalid = await app.request(base, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(createInput({ timeZone: "Not/IANA", startsAt: "bad" })),
    });
    expect(invalid.status).toBe(400);
    expect(await responseError(invalid)).toMatchObject({ code: "VALIDATION_FAILED" });

    const alias = await app.request(base, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...createInput({ id: "alias" }),
        timezone: "America/Los_Angeles",
      }),
    });
    expect(alias.status).toBe(400);
    expect(await responseError(alias)).toMatchObject({ code: "VALIDATION_FAILED" });

    const created = await responseData<Event>(
      await app.request(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createInput({ id: "versioned" })),
      }),
    );
    const duplicateIds = await app.request(`${base}/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedVersion: 1,
        embedConfigurations: [embedConfiguration(), embedConfiguration({ id: "public-schedule" })],
      }),
    });
    expect(duplicateIds.status).toBe(400);
    expect(await responseError(duplicateIds)).toMatchObject({ code: "VALIDATION_FAILED" });
    const stale = await app.request(`${base}/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 7, name: "must not save" }),
    });
    expect(stale.status).toBe(409);
    expect(await responseError(stale)).toMatchObject({ code: "CONFLICT" });
    expect(
      (await service.getEvent(actor(), { organizationId: "org-a", eventId: created.id })).name,
    ).toBe("Summit 2026");
  });
});
