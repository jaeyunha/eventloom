import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AuthPrincipal } from "../auth/types";
import {
  createEventRoutes,
  type EventRouteDependencies,
  type EventRouteEnvironment,
} from "./routes";
import {
  EventService,
  type EventTemporalDependencySource,
  InMemoryEventRepository,
  InMemoryProgramPublicationRepository,
  ProgramPublicationService,
  resolvePublishedProgram,
} from "./service";
import type {
  Event,
  EventActor,
  EventEmbedConfiguration,
  ProgramAgendaProjection,
  ProgramPublicationManifest,
  ProgramSpeakerProjection,
} from "./types";

const firstNow = new Date("2026-08-09T12:00:00.000Z");

function actor(organizationId = "org-a", role: EventActor["role"] = "owner"): EventActor {
  return { organizationId, userId: "organizer-1", role, kind: "user" };
}

function createService(
  temporalDependencies: EventTemporalDependencySource = {
    async agendaState() {
      return null;
    },
    async agendaEntries() {
      return [];
    },
    async reviewBoundaries() {
      return [];
    },
  },
) {
  let sequence = 0;
  const repository = new InMemoryEventRepository();
  const service = new EventService(repository, temporalDependencies, {
    clock: () => new Date(firstNow.getTime() + sequence * 1_000),
    generateId: () => `generated-${++sequence}`,
  });
  return { repository, service };
}

describe("event temporal dependencies", () => {
  it("rejects shortening an event beneath active review or agenda boundaries", async () => {
    const { service } = createService({
      async agendaState() {
        return { timeZone: "America/Los_Angeles" };
      },
      async reviewBoundaries() {
        return [
          {
            label: "Final review deadline",
            occursAt: "2026-10-03T16:00:00.000Z",
          },
        ];
      },
      async agendaEntries() {
        return [
          {
            label: "Published keynote",
            startsAt: "2026-10-03T15:00:00.000Z",
            endsAt: "2026-10-03T16:00:00.000Z",
            startsAtLocal: "2026-10-03T08:00:00",
            endsAtLocal: "2026-10-03T09:00:00",
          },
        ];
      },
    });
    const created = await service.createEvent(actor(), createInput());

    await expect(
      service.updateEvent(actor(), {
        eventId: created.id,
        expectedVersion: created.version,
        endsAt: "2026-10-02T17:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects timezone changes when even an empty agenda state exists", async () => {
    const { service } = createService({
      async agendaState() {
        return { timeZone: "America/Los_Angeles" };
      },
      async agendaEntries() {
        return [];
      },
      async reviewBoundaries() {
        return [];
      },
    });
    const created = await service.createEvent(actor(), createInput());

    await expect(
      service.updateEvent(actor(), {
        eventId: created.id,
        expectedVersion: created.version,
        timeZone: "UTC",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("preserves exact historical event dates but rejects changed past values", async () => {
    let now = new Date("2026-08-01T12:00:00.000Z");
    const repository = new InMemoryEventRepository();
    const service = new EventService(
      repository,
      {
        async agendaState() {
          return null;
        },
        async agendaEntries() {
          return [];
        },
        async reviewBoundaries() {
          return [];
        },
      },
      {
        clock: () => new Date(now),
        generateId: () => crypto.randomUUID(),
      },
    );
    const created = await service.createEvent(actor(), {
      ...createInput(),
      startsAt: "2026-08-05T16:00:00.000Z",
      endsAt: "2026-08-06T00:00:00.000Z",
      scheduleDates: ["2026-08-05"],
      cfpSettings: { enabled: false, opensAt: null, closesAt: null },
    });
    now = new Date("2026-08-10T12:00:00.000Z");

    const unchanged = await service.updateEvent(actor(), {
      eventId: created.id,
      expectedVersion: created.version,
      name: "Updated historical event",
    });
    await expect(
      service.updateEvent(actor(), {
        eventId: unchanged.id,
        expectedVersion: unchanged.version,
        startsAt: "2026-08-06T16:00:00.000Z",
        endsAt: "2026-08-07T00:00:00.000Z",
        scheduleDates: ["2026-08-06"],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects an event CFP window that extends past event start", async () => {
    const { service } = createService();

    await expect(
      service.createEvent(actor(), {
        ...createInput(),
        cfpSettings: {
          enabled: true,
          opensAt: "2026-09-01T16:00:00.000Z",
          closesAt: "2026-10-02T16:00:00.000Z",
        },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

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

describe("event lifecycle", () => {
  it("creates complete event records without a separate lifecycle status", async () => {
    const { service } = createService();

    const created = await service.createEvent(actor(), createInput());

    expect(created).not.toHaveProperty("status");
    await expect(
      service.listEvents(actor(), {
        organizationId: "org-a",
      }),
    ).resolves.toEqual([created]);
  });

  it("rejects obsolete event status updates and archive routes", async () => {
    const { service } = createService();
    const created = await service.createEvent(actor(), createInput());
    const app = appFor(service);

    const updateResponse = await app.request(
      `/api/admin/organizations/org-a/events/${created.id}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "remove-event-status-update",
        },
        body: JSON.stringify({
          expectedVersion: created.version,
          status: "active",
        }),
      },
    );
    const archiveResponse = await app.request(
      `/api/admin/organizations/org-a/events/${created.id}/archive`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "remove-event-status-archive",
        },
        body: JSON.stringify({ expectedVersion: created.version }),
      },
    );
    const statusListResponse = await app.request(
      "/api/admin/organizations/org-a/events?status=active",
    );
    const archivedListResponse = await app.request(
      "/api/admin/organizations/org-a/events?includeArchived=false",
    );

    expect(updateResponse.status).toBe(400);
    expect(archiveResponse.status).toBe(404);
    expect(statusListResponse.status).toBe(400);
    expect(archivedListResponse.status).toBe(400);
  });
});

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
    trackIds: ["track-a"],
    statuses: ["Approved"],
    revision: 1,
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
    reviewerGrants: [],
  };
}

function appFor(
  service: EventService,
  currentPrincipal: AuthPrincipal | null = principal(),
  publication?: EventRouteDependencies["publication"],
): Hono<EventRouteEnvironment> {
  const app = new Hono<EventRouteEnvironment>();
  app.use("*", async (context, next) => {
    context.set("authPrincipal", currentPrincipal);
    context.set("traceId", "trace-events");
    await next();
  });
  app.route(
    "/api/admin/organizations/:organizationId/events",
    createEventRoutes({ service, ...(publication === undefined ? {} : { publication }) }),
  );
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
  it("creates, lists, updates, and gets only the event record", async () => {
    const { repository, service } = createService();
    const created = await service.createEvent(
      actor(),
      createInput({
        scheduleDates: ["2026-10-01", "2026-10-03"],
      }),
    );

    expect(created).toMatchObject({
      id: "generated-1",
      slug: "summit-2026",
      organizationId: "org-a",
      version: 1,
      createdBy: "organizer-1",
      updatedBy: "organizer-1",
      scheduleDates: ["2026-10-01", "2026-10-03"],
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
      venue: "Auditorium",
      defaultCalendarSettings: { durationMinutes: 45 },
      embedConfigurations: [embedConfiguration()],
    });
    expect(updated).toMatchObject({
      name: "Summit 2026 revised",
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

    const audit = await service.listAudit(actor(), {
      organizationId: "org-a",
      eventId: created.id,
    });
    expect(audit.map((entry) => entry.action)).toEqual(["created", "updated"]);
    expect(audit.map((entry) => entry.actorId)).toEqual(["organizer-1", "organizer-1"]);
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
    await expect(
      service.createEvent(
        actor(),
        createInput({
          id: "bad-schedule-date",
          scheduleDates: ["2026-10-01", "2026-10-04"],
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
      body: JSON.stringify(createInput({ scheduleDates: ["2026-10-01", "2026-10-03"] })),
    });
    expect(createdResponse.status).toBe(201);
    const created = await responseData<Event>(createdResponse);
    expect(created.embedConfigurations).toEqual([]);
    expect(created.scheduleDates).toEqual(["2026-10-01", "2026-10-03"]);

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
        scheduleDates: [],
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
    expect(
      (await responseData<Event>(await app.request(`${base}/${created.id}`))).scheduleDates,
    ).toBe(undefined);

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
    expect(archiveResponse.status).toBe(404);

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
const rebuildInput = {
  trigger: "initial-publication" as const,
  agendaProjectionId: "agenda-projection-1",
  agendaRevisionNumber: 7,
  agendaSourceHash: "agenda-hash-7",
  speakerProjectionId: "speaker-projection-1",
  speakerRevisionNumber: 11,
  speakerSourceHash: "speaker-hash-11",
  approvedContentRevision: 3,
  approvedProfileRevision: 5,
  releasedAssetRevision: 2,
};

function publicationService(
  options: {
    enqueueFailure?: Error;
    invalidationFailure?: Error;
    clock?: () => Date;
    reservationTtlMs?: number;
  } = {},
) {
  const repository = new InMemoryProgramPublicationRepository();
  const enqueued: unknown[] = [];
  const invalidated: unknown[] = [];
  let id = 0;
  const service = new ProgramPublicationService(
    repository,
    {
      eventRepository: {
        getEvent: async (organizationId, eventId) =>
          organizationId === "org-a" && eventId === "event-publication"
            ? {
                id: eventId,
                organizationId,
                slug: "publication-event",
                name: "Publication event",
                timeZone: "UTC",
                startsAt: "2026-09-18T09:00:00.000Z",
                endsAt: "2026-09-18T17:00:00.000Z",
                venue: null,
                cfpSettings: { enabled: false, opensAt: null, closesAt: null },
                defaultCalendarSettings: {
                  durationMinutes: 30,
                  timeZone: "UTC",
                  location: null,
                },
                embedConfigurations: [],
                version: 1,
                createdAt: firstNow.toISOString(),
                updatedAt: firstNow.toISOString(),
                createdBy: "organizer-1",
                updatedBy: "organizer-1",
              }
            : null,
      },
      enqueue: {
        enqueue: async (input) => {
          enqueued.push(input);
          if (options.enqueueFailure !== undefined) throw options.enqueueFailure;
          return { id: `job-${input.revision}` };
        },
      },
      cacheInvalidation: {
        invalidate: async (input) => {
          invalidated.push(input);
          if (options.invalidationFailure !== undefined) throw options.invalidationFailure;
        },
      },
    },
    {
      clock: options.clock ?? (() => new Date(`2026-08-12T12:00:0${id}.000Z`)),
      generateId: () => `release-${++id}`,
      ...(options.reservationTtlMs === undefined
        ? {}
        : { reservationTtlMs: options.reservationTtlMs }),
    },
  );
  return { service, repository, enqueued, invalidated };
}

function pendingReservationOwner(state: {
  readonly pendingReleaseId: string | null;
  readonly releases: readonly {
    readonly id: string;
    readonly reservationOwnerId?: string | null;
  }[];
}): string {
  const owner = state.releases.find(({ id }) => id === state.pendingReleaseId)?.reservationOwnerId;
  if (owner === null || owner === undefined) {
    throw new Error("Expected pending publication reservation ownership.");
  }
  return owner;
}

function projectionFixtures() {
  const agendaProjection: ProgramAgendaProjection = {
    id: "agenda-projection-1",
    revisionNumber: 7,
    sourceHash: "agenda-hash-7",
    entries: [
      {
        id: "entry-a",
        sessionId: "session-a",
        trackIds: ["track-a"],
        status: "Approved",
        title: "Stable track session",
        summary: "Public summary",
        roomName: "Auditorium",
        trackNames: ["Track A"],
        speakerNames: ["Alex Rivera"],
        privateNote: "never public",
      } as ProgramAgendaProjection["entries"][number],
      {
        id: "entry-b",
        sessionId: "session-b",
        trackIds: ["track-b"],
        status: "Approved",
        title: "Other track",
      },
      {
        id: "entry-draft",
        sessionId: "session-draft",
        trackIds: ["track-a"],
        status: "Draft",
        title: "Private draft",
      },
    ],
  };
  const speakerProjection: ProgramSpeakerProjection = {
    id: "speaker-projection-1",
    revisionNumber: 11,
    sourceHash: "speaker-hash-11",
    speakers: [
      {
        id: "speaker-a",
        participantId: "participant-a",
        sessionIds: ["session-a"],
        displayName: "Alex Rivera",
        company: "Public Co",
        bio: "Published biography",
        avatarUrl: "/api/public/events/summit-2026/speakers/speaker-a/headshot",
        email: "never-public@example.test",
        objectKey: "private/org-a/headshot.webp",
      } as ProgramSpeakerProjection["speakers"][number],
      {
        id: "speaker-b",
        participantId: "participant-b",
        sessionIds: ["session-b"],
        displayName: "Other Speaker",
      },
    ],
  };
  return { agendaProjection, speakerProjection };
}

describe("program publication and saved embeds", () => {
  it("versions saved configurations independently and filters renamed tracks by stable id", async () => {
    const { service } = createService();
    const created = await service.createEvent(actor(), createInput({ id: "stable-embed" }));
    const saved = await service.updateEvent(actor(), {
      eventId: created.id,
      expectedVersion: created.version,
      embedConfigurations: [embedConfiguration()],
    });
    expect(saved.embedConfigurations[0]?.revision).toBe(1);

    const unchanged = await service.updateEvent(actor(), {
      eventId: created.id,
      expectedVersion: saved.version,
      embedConfigurations: [embedConfiguration({ revision: 1 })],
    });
    expect(unchanged.embedConfigurations[0]?.revision).toBe(1);

    const changed = await service.updateEvent(actor(), {
      eventId: created.id,
      expectedVersion: unchanged.version,
      embedConfigurations: [
        embedConfiguration({ revision: 1, displayFields: ["title", "date-time", "track"] }),
      ],
    });
    expect(changed.embedConfigurations[0]?.revision).toBe(2);
    await expect(
      service.updateEvent(actor(), {
        eventId: created.id,
        expectedVersion: changed.version,
        embedConfigurations: [embedConfiguration({ revision: 1 })],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
    await expect(
      service.updateEvent(actor(), {
        eventId: created.id,
        expectedVersion: changed.version,
        embedConfigurations: [],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });

    const { agendaProjection, speakerProjection } = projectionFixtures();
    const manifest: ProgramPublicationManifest = {
      id: "release-served",
      organizationId: "org-a",
      eventId: created.id,
      revision: 9,
      lifecycle: "served",
      agendaProjectionId: agendaProjection.id,
      agendaRevisionNumber: agendaProjection.revisionNumber,
      agendaSourceHash: agendaProjection.sourceHash,
      speakerProjectionId: speakerProjection.id,
      speakerRevisionNumber: speakerProjection.revisionNumber,
      speakerSourceHash: speakerProjection.sourceHash,
      approvedContentRevision: 3,
      approvedProfileRevision: 5,
      releasedAssetRevision: 2,
      actorId: "organizer-1",
      publishedAt: "2026-08-12T12:00:00.000Z",
      parentServedRevision: 8,
      rollbackTargetRevision: null,
      cacheRevision: 12,
      sourceTrigger: "approved-content-change",
      failureReason: null,
    };
    const configuration = changed.embedConfigurations[0] as EventEmbedConfiguration;
    const first = resolvePublishedProgram({
      manifest,
      agendaProjection,
      speakerProjection,
      configuration,
    });
    const renamed = resolvePublishedProgram({
      manifest,
      agendaProjection: {
        ...agendaProjection,
        entries: agendaProjection.entries.map((entry) =>
          entry.id === "entry-a" ? { ...entry, trackNames: ["Renamed Track"] } : entry,
        ),
      },
      speakerProjection,
      configuration,
    });

    expect(first.agenda.map((entry) => entry.sessionId)).toEqual(["session-a"]);
    expect(renamed.agenda).toMatchObject([{ trackNames: ["Renamed Track"] }]);
    expect(first.speakers.map((speaker) => speaker.id)).toEqual(["speaker-a"]);
    expect(JSON.stringify(first)).not.toContain("privateNote");
    expect(JSON.stringify(first)).not.toContain("never-public@example.test");
    expect(JSON.stringify(first)).not.toContain("private/org-a");
  });

  it("reserves a rebuild before publication side effects without enqueueing it", async () => {
    const active = publicationService();
    const pending = await active.service.reserveRebuild(actor(), {
      ...rebuildInput,
      eventId: "event-publication",
    });
    expect(active.enqueued).toEqual([]);
    expect(pending).toMatchObject({
      servedManifest: null,
      pendingRevision: 1,
      releases: [{ lifecycle: "pending" }],
    });
    const served = await active.service.completeRebuild({
      organizationId: "org-a",
      eventId: "event-publication",
      releaseId: pending.pendingReleaseId ?? "",
      revision: pending.pendingRevision ?? 0,
      expectedPublicationVersion: pending.version,
      reservationOwnerId: pendingReservationOwner(pending),
    });
    expect(served.servedManifest).toMatchObject({ revision: 1, lifecycle: "served" });
  });

  it("resumes owned pending rebuilds and rejects active foreign reservations", async () => {
    const active = publicationService();
    const first = await active.service.reserveRebuild(actor(), {
      ...rebuildInput,
      eventId: "event-publication",
      reservationOwnerId: "owner-a",
    });
    const resumed = await active.service.reserveRebuild(actor(), {
      ...rebuildInput,
      eventId: "event-publication",
      reservationOwnerId: "owner-a",
    });
    expect(resumed).toEqual(first);
    await expect(
      active.service.reserveRebuild(actor(), {
        ...rebuildInput,
        eventId: "event-publication",
        reservationOwnerId: "owner-b",
      }),
    ).rejects.toThrow("already active");
    await expect(
      active.service.completeRebuild({
        organizationId: "org-a",
        eventId: "event-publication",
        releaseId: first.pendingReleaseId ?? "",
        revision: first.pendingRevision ?? 0,
        expectedPublicationVersion: first.version,
        reservationOwnerId: "owner-b",
      }),
    ).rejects.toThrow("no longer owned");

    const replacement = await active.service.reserveRebuild(actor(), {
      ...rebuildInput,
      eventId: "event-publication",
      agendaProjectionId: "agenda-projection-2",
      agendaRevisionNumber: 2,
      agendaSourceHash: "agenda-hash-2",
      speakerProjectionId: "speaker-projection-2",
      speakerRevisionNumber: 2,
      speakerSourceHash: "speaker-hash-2",
      approvedContentRevision: 2,
      reservationOwnerId: "owner-a",
    });
    expect(replacement).toMatchObject({
      pendingRevision: 2,
      releases: [
        { lifecycle: "failed", failureReason: "Superseded by a newer publication reservation." },
        {
          revision: 2,
          lifecycle: "pending",
          agendaProjectionId: "agenda-projection-2",
          speakerProjectionId: "speaker-projection-2",
        },
      ],
    });
  });

  it("transfers an expired identical reservation to a recovering owner", async () => {
    let now = Date.parse("2026-08-12T12:00:00.000Z");
    const active = publicationService({
      clock: () => new Date(now),
      reservationTtlMs: 1_000,
    });
    await active.service.reserveRebuild(actor(), {
      ...rebuildInput,
      eventId: "event-publication",
      reservationOwnerId: "owner-a",
    });
    now += 1_001;
    const expired = await active.repository.getState("org-a", "event-publication");
    if (expired === null) throw new Error("Expected an expired pending reservation.");
    await expect(
      active.service.completeRebuild({
        organizationId: "org-a",
        eventId: "event-publication",
        releaseId: expired.pendingReleaseId ?? "",
        revision: expired.pendingRevision ?? 0,
        expectedPublicationVersion: expired.version,
        reservationOwnerId: "owner-a",
      }),
    ).rejects.toThrow("has expired");
    const replacement = await active.service.reserveRebuild(actor(), {
      ...rebuildInput,
      eventId: "event-publication",
      reservationOwnerId: "owner-b",
    });
    expect(replacement).toMatchObject({
      pendingRevision: 1,
      releases: [{ lifecycle: "pending", reservationOwnerId: "owner-b" }],
    });
    await expect(
      active.service.completeRebuild({
        organizationId: "org-a",
        eventId: "event-publication",
        releaseId: replacement.pendingReleaseId ?? "",
        revision: replacement.pendingRevision ?? 0,
        expectedPublicationVersion: replacement.version,
        reservationOwnerId: "owner-b",
      }),
    ).resolves.toMatchObject({ servedRevision: 1, pendingRevision: null });
  });

  it("keeps a release pending until durable cache invalidation is recorded", async () => {
    const active = publicationService({
      invalidationFailure: new Error("cache outbox unavailable"),
    });
    const pending = await active.service.reserveRebuild(actor(), {
      ...rebuildInput,
      eventId: "event-publication",
    });
    await expect(
      active.service.completeRebuild({
        organizationId: "org-a",
        eventId: "event-publication",
        releaseId: pending.pendingReleaseId ?? "",
        revision: pending.pendingRevision ?? 0,
        expectedPublicationVersion: pending.version,
        reservationOwnerId: pendingReservationOwner(pending),
      }),
    ).rejects.toThrow("cache outbox unavailable");
    await expect(active.repository.getState("org-a", "event-publication")).resolves.toMatchObject({
      servedManifest: null,
      pendingRevision: 1,
      releases: [{ lifecycle: "pending" }],
    });
  });

  it("fails closed on the first rebuild failure and keeps the prior served release on refresh failure", async () => {
    const failed = publicationService({ enqueueFailure: new Error("queue unavailable") });
    const firstFailure = await failed.service.requestRebuild(actor(), {
      ...rebuildInput,
      eventId: "event-publication",
    });
    expect(firstFailure).toMatchObject({
      servedManifest: null,
      pendingRevision: null,
      releases: [{ lifecycle: "failed", failureReason: "queue unavailable" }],
    });

    const active = publicationService();
    const pending = await active.service.requestRebuild(actor(), {
      ...rebuildInput,
      eventId: "event-publication",
    });
    const served = await active.service.completeRebuild({
      organizationId: "org-a",
      eventId: "event-publication",
      releaseId: pending.pendingReleaseId ?? "",
      revision: pending.pendingRevision ?? 0,
      expectedPublicationVersion: pending.version,
      reservationOwnerId: pendingReservationOwner(pending),
    });
    const refresh = await active.service.requestRebuild(actor(), {
      ...rebuildInput,
      eventId: "event-publication",
      trigger: "confirmed-profile-change",
      parentServedRevision: served.servedRevision,
      speakerRevisionNumber: 12,
      speakerSourceHash: "speaker-hash-12",
    });
    const refreshFailed = await active.service.failRebuild({
      organizationId: "org-a",
      eventId: "event-publication",
      releaseId: refresh.pendingReleaseId ?? "",
      revision: refresh.pendingRevision ?? 0,
      expectedPublicationVersion: refresh.version,
      reservationOwnerId: pendingReservationOwner(refresh),
      reason: "projection incomplete",
    });

    expect(refreshFailed.servedManifest).toEqual(served.servedManifest);
    expect(refreshFailed.releases.at(-1)).toMatchObject({
      lifecycle: "failed",
      failureReason: "projection incomplete",
    });
    expect(active.enqueued).toHaveLength(2);
  });

  it("rejects stale completion and creates a new cache revision when rolling back", async () => {
    const active = publicationService();
    const firstPending = await active.service.requestRebuild(actor(), {
      ...rebuildInput,
      eventId: "event-publication",
    });
    const firstServed = await active.service.completeRebuild({
      organizationId: "org-a",
      eventId: "event-publication",
      releaseId: firstPending.pendingReleaseId ?? "",
      revision: firstPending.pendingRevision ?? 0,
      expectedPublicationVersion: firstPending.version,
      reservationOwnerId: pendingReservationOwner(firstPending),
    });
    const refresh = await active.service.requestRebuild(actor(), {
      ...rebuildInput,
      eventId: "event-publication",
      trigger: "released-schedule-change",
      parentServedRevision: firstServed.servedRevision,
      agendaRevisionNumber: 8,
      agendaSourceHash: "agenda-hash-8",
    });
    await expect(
      active.service.completeRebuild({
        organizationId: "org-a",
        eventId: "event-publication",
        releaseId: firstPending.pendingReleaseId ?? "",
        revision: firstPending.pendingRevision ?? 0,
        expectedPublicationVersion: refresh.version,
        reservationOwnerId: pendingReservationOwner(firstPending),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const refreshed = await active.service.completeRebuild({
      organizationId: "org-a",
      eventId: "event-publication",
      releaseId: refresh.pendingReleaseId ?? "",
      revision: refresh.pendingRevision ?? 0,
      expectedPublicationVersion: refresh.version,
      reservationOwnerId: pendingReservationOwner(refresh),
    });
    const rolledBack = await active.service.rollback(actor(), {
      eventId: "event-publication",
      targetRevision: 1,
      expectedServedRevision: refreshed.servedRevision,
      expectedPublicationVersion: refreshed.version,
    });

    expect(rolledBack.servedManifest).toMatchObject({
      revision: 3,
      agendaRevisionNumber: 7,
      rollbackTargetRevision: 1,
      parentServedRevision: 2,
      cacheRevision: 3,
    });
    expect(active.invalidated).toEqual([
      expect.objectContaining({ revision: 1, cacheRevision: 1 }),
      expect.objectContaining({ revision: 2, cacheRevision: 2 }),
      expect.objectContaining({ revision: 3, cacheRevision: 3 }),
    ]);
  });

  it("exposes organizer publication state and preview through strict private routes", async () => {
    const { service: eventService } = createService();
    const active = publicationService();
    const app = appFor(eventService, principal(), active.service);
    const base = "http://localhost/api/admin/organizations/org-a/events/event-publication";
    const response = await app.request(`${base}/publication/rebuild`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rebuildInput),
    });
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const pending = await responseData<{
      version: number;
      pendingReleaseId: string;
      pendingRevision: number;
      releases: readonly {
        id: string;
        reservationOwnerId?: string | null;
      }[];
    }>(response);
    const served = await active.service.completeRebuild({
      organizationId: "org-a",
      eventId: "event-publication",
      releaseId: pending.pendingReleaseId,
      revision: pending.pendingRevision,
      expectedPublicationVersion: pending.version,
      reservationOwnerId: pendingReservationOwner(pending),
    });
    const { agendaProjection, speakerProjection } = projectionFixtures();
    const safeAgendaProjection = structuredClone(agendaProjection) as unknown as {
      entries: Array<Record<string, unknown>>;
    };
    for (const entry of safeAgendaProjection.entries) delete entry.privateNote;
    const safeSpeakerProjection = structuredClone(speakerProjection) as unknown as {
      speakers: Array<Record<string, unknown>>;
    };
    for (const speaker of safeSpeakerProjection.speakers) {
      delete speaker.email;
      delete speaker.objectKey;
    }
    const preview = await app.request(`${base}/publication/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        manifest: served.servedManifest,
        agendaProjection: safeAgendaProjection,
        speakerProjection: safeSpeakerProjection,
        configuration: embedConfiguration({
          displayFields: ["title", "date-time", "room", "speakers", "track", "summary"],
        }),
      }),
    });

    expect(preview.status).toBe(200);
    await expect(responseData(preview)).resolves.toMatchObject({
      configurationRevision: 1,
      programRevision: 1,
      cacheRevision: 1,
      agenda: [{ sessionId: "session-a" }],
      speakers: [{ id: "speaker-a" }],
    });
  });
});
