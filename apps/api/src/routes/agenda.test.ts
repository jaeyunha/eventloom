import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import {
  type AgendaCatalog,
  type AgendaDraft,
  AgendaEngine,
  type AgendaIdGenerator,
  type AgendaSuggestionProvider,
  type AgendaSuggestionRun,
  InMemoryAgendaMutationLock,
  InMemoryAgendaRepository,
} from "../features/agenda";
import type { PublishedAgendaRevision } from "../features/agenda/types";
import type { AuthPrincipal } from "../features/auth/types";
import type { AgendaRouteDependencies, AgendaRouteEnvironment } from "./agenda";
import { createAgendaAdminRoutes, createPublishedAgendaRoutes } from "./agenda";

const traceId = "00000000-0000-4000-8000-000000000001";
const catalog: AgendaCatalog = {
  sessions: [
    {
      id: "session-1",
      title: "Opening",
      status: "accepted",
      participantIds: ["participant-1"],
      resourceIds: [],
      capacityRequired: 40,
    },
    {
      id: "session-2",
      title: "Panel",
      status: "accepted",
      participantIds: ["participant-2"],
      resourceIds: [],
      capacityRequired: 40,
    },
    {
      id: "session-3",
      title: "Deep dive",
      status: "accepted",
      participantIds: ["participant-3"],
      resourceIds: [],
      capacityRequired: 40,
    },
  ],
  rooms: [
    { id: "room-large", name: "Large room", capacity: 200 },
    { id: "room-small", name: "Small room", capacity: 100 },
  ],
  tracks: [],
};

const suggestionRequest = {
  baseDraftVersion: 1,
  dates: ["2026-08-10"],
  eligibleStatuses: ["accepted"],
  roomIds: ["room-large"],
  dayWindows: [{ date: "2026-08-10", startLocal: "09:00", endLocal: "17:00" }],
  orderedRules: ["avoid conflicts"],
  ignoreExistingTimes: false,
  ignoreExistingRooms: false,
};

function principal(organizationId = "org-a"): AuthPrincipal {
  return {
    kind: "user",
    sessionId: "session-auth",
    userId: "organizer-1",
    email: "organizer@example.com",
    memberships: [{ organizationId, role: "admin" }],
    speakerGrants: [],
  };
}

function createEngine(provider?: AgendaSuggestionProvider): AgendaEngine {
  let sequence = 0;
  const idGenerator: AgendaIdGenerator = {
    nextId: (prefix) => `${prefix}-${++sequence}`,
  };
  return new AgendaEngine(new InMemoryAgendaRepository(), new InMemoryAgendaMutationLock(), {
    idGenerator,
    ...(provider === undefined ? {} : { suggestionProvider: provider }),
  });
}

async function initialize(
  engine: AgendaEngine,
  agendaCatalog: AgendaCatalog = catalog,
): Promise<void> {
  await engine.createAgenda({
    eventId: "event-a",
    actorId: "organizer-1",
    timeZone: "UTC",
    minimumTravelMinutes: 0,
    ...agendaCatalog,
  });
}

function providerWithPlacements(
  placements = [
    {
      sessionId: "session-1",
      roomId: "room-large",
      startsAtLocal: "2026-08-10T09:00",
      endsAtLocal: "2026-08-10T10:00",
    },
    {
      sessionId: "session-2",
      roomId: "room-large",
      startsAtLocal: "2026-08-10T11:00",
      endsAtLocal: "2026-08-10T12:00",
    },
  ],
): AgendaSuggestionProvider {
  return { suggest: () => ({ placements }) };
}

function appFor(
  engine: AgendaEngine,
  authenticatedPrincipal: AuthPrincipal | null = principal(),
  eventOrganizationId = "org-a",
  afterPublish?: AgendaRouteDependencies["afterPublish"],
): Hono<AgendaRouteEnvironment> {
  const app = new Hono<AgendaRouteEnvironment>();
  app.use("*", async (context, next) => {
    context.set("authPrincipal", authenticatedPrincipal);
    context.set("traceId", traceId);
    await next();
  });
  app.route(
    "/api/admin/organizations/:organizationId/events/:eventId/agenda",
    createAgendaAdminRoutes({
      engine,
      organizationIdForEvent: async () => eventOrganizationId,
      ...(afterPublish === undefined ? {} : { afterPublish }),
    }),
  );
  return app;
}
function appForWithPublic(
  engine: AgendaEngine,
  authenticatedPrincipal: AuthPrincipal | null = principal(),
  eventOrganizationId = "org-a",
  afterPublish?: AgendaRouteDependencies["afterPublish"],
  eventMetadataForEvent?: AgendaRouteDependencies["eventMetadataForEvent"],
): Hono<AgendaRouteEnvironment> {
  const app = appFor(engine, authenticatedPrincipal, eventOrganizationId, afterPublish);
  app.route(
    "/api/public/events/:eventSlug",
    createPublishedAgendaRoutes({
      engine,
      ...(eventMetadataForEvent === undefined ? {} : { eventMetadataForEvent }),
    }),
  );
  return app;
}
function publicAppFor(
  engine: AgendaEngine,
  eventMetadataForEvent?: AgendaRouteDependencies["eventMetadataForEvent"],
): Hono<AgendaRouteEnvironment> {
  const app = new Hono<AgendaRouteEnvironment>();
  app.use("*", async (context, next) => {
    context.set("authPrincipal", null);
    context.set("traceId", traceId);
    await next();
  });
  app.route(
    "/api/public/events/:eventSlug",
    createPublishedAgendaRoutes({
      engine,
      ...(eventMetadataForEvent === undefined ? {} : { eventMetadataForEvent }),
    }),
  );
  return app;
}

function publicRevision(): PublishedAgendaRevision {
  return {
    id: "revision-public-4",
    eventId: "event-public",
    revisionNumber: 4,
    sourceDraftVersion: 7,
    timeZone: "America/Los_Angeles",
    entries: [
      {
        id: "entry-public-1",
        sessionId: "session-public-1",
        roomId: "room-main",
        trackIds: ["track-main"],
        startsAt: "2026-09-18T16:00:00.000Z",
        endsAt: "2026-09-18T16:45:00.000Z",
        startsAtLocal: "2026-09-18T09:00",
        endsAtLocal: "2026-09-18T09:45",
        timeZone: "America/Los_Angeles",
        metadata: {
          title: "A session, with; punctuation \\\\",
          summary: "Description with a long speaker and room value ".repeat(8),
          speakerNames: ["Morgan Lee", "Avery Kim"],
          roomName: "Main hall, level 2",
          privateNote: "Do not publish this note.",
          participantEmails: ["private@example.test"],
        },
      },
    ],
    warningOverrides: [],
    publishedAt: "2026-08-08T12:00:00.000Z",
    publishedBy: "organizer-private",
    rollbackOfRevisionId: null,
    metadata: {
      slug: "open-systems",
      name: "Open Systems Summit",
      venueName: "Pier 27",
      organizationId: "tenant-private",
      privateNote: "Private event metadata.",
    },
  } as unknown as PublishedAgendaRevision;
}

function publicEngine(revision: PublishedAgendaRevision | null): AgendaEngine {
  return {
    getPublishedAgenda: async (eventSlug: string) =>
      eventSlug === "open-systems" ? revision : null,
  } as unknown as AgendaEngine;
}

async function postSuggestion(
  app: Hono<AgendaRouteEnvironment>,
  path: string,
  payload: unknown,
): Promise<Response> {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}
async function responseData<T>(response: Response): Promise<T> {
  return ((await response.json()) as { data: T }).data;
}

async function responseError(response: Response): Promise<{
  code: string;
  details?: readonly { message: string }[];
}> {
  return (
    (await response.json()) as {
      error: { code: string; details?: readonly { message: string }[] };
    }
  ).error;
}

describe("canonical agenda draft routes", () => {
  it("projects the root workspace and supports full-draft create/update/remove, preview, and publish", async () => {
    const engine = createEngine();
    await initialize(engine);
    const afterPublish = vi.fn(async () => undefined);
    const app = appFor(engine, principal(), "org-a", afterPublish);
    const root = "/api/admin/organizations/org-a/events/event-a/agenda";
    const entry = {
      id: "entry-1",
      sessionId: "session-1",
      roomId: "room-large",
      trackIds: [],
      startsAtLocal: "2026-08-10T09:00",
      endsAtLocal: "2026-08-10T10:00",
    };
    const updatedEntry = {
      ...entry,
      roomId: "room-small",
      startsAtLocal: "2026-08-10T11:00",
      endsAtLocal: "2026-08-10T12:00",
    };

    const created = await app.request(`${root}/draft`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 1, entries: [entry] }),
    });
    expect(created.status).toBe(200);
    expect(await responseData<AgendaDraft>(created)).toMatchObject({
      version: 2,
      entries: [{ id: "entry-1", sessionId: "session-1" }],
    });

    const projected = await app.request(root);
    expect(projected.status).toBe(200);
    expect(
      await responseData<{
        event: { id: string; timeZone: string };
        draft: { version: number; entries: readonly Record<string, unknown>[] };
        unscheduledSessions: readonly { id: string }[];
      }>(projected),
    ).toMatchObject({
      event: { id: "event-a", timeZone: "UTC" },
      draft: {
        version: 2,
        entries: [
          {
            id: "entry-1",
            sessionId: "session-1",
            title: "Opening",
            roomName: "Large room",
            startsAtLocal: "2026-08-10T09:00:00",
          },
        ],
      },
      unscheduledSessions: [{ id: "session-2" }, { id: "session-3" }],
    });

    const preview = await app.request(`${root}/preview`);
    expect(preview.status).toBe(200);
    expect(
      await responseData<{
        draftVersion: number;
        conflicts: readonly unknown[];
        warnings: readonly unknown[];
        diff: { added: number; changed: number; removed: number };
        validatedAt: string;
      }>(preview),
    ).toMatchObject({
      draftVersion: 2,
      conflicts: [],
      warnings: [],
      diff: { added: 1, changed: 0, removed: 0 },
      validatedAt: expect.any(String),
    });
    const previewAlias = await app.request(`${root}/preview`, { method: "POST" });
    expect(previewAlias.status).toBe(404);

    const updated = await app.request(`${root}/draft`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 2, entries: [updatedEntry] }),
    });
    expect(updated.status).toBe(200);
    expect(await responseData<AgendaDraft>(updated)).toMatchObject({
      version: 3,
      entries: [{ roomId: "room-small", startsAtLocal: "2026-08-10T11:00:00" }],
    });

    const published = await app.request(`${root}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 3 }),
    });
    expect(published.status).toBe(200);
    expect(await responseData<{ eventId: string }>(published)).toMatchObject({
      eventId: "event-a",
    });
    expect(afterPublish).toHaveBeenCalledWith(
      "event-a",
      expect.objectContaining({ eventId: "event-a", revisionNumber: 1 }),
    );

    const removed = await app.request(`${root}/draft`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 3, entries: [] }),
    });
    expect(removed.status).toBe(200);
    expect(await responseData<AgendaDraft>(removed)).toMatchObject({
      version: 4,
      entries: [],
    });

    const stale = await app.request(`${root}/draft`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 1, entries: [] }),
    });
    expect(stale.status).toBe(409);
    expect(await responseError(stale)).toMatchObject({ code: "CONFLICT" });

    const publicationAlias = await app.request(`${root}/publications`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 4 }),
    });
    expect(publicationAlias.status).toBe(404);
    const entryAlias = await app.request(`${root}/draft/entries`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 4, entries: [] }),
    });
    expect(entryAlias.status).toBe(404);
  });
  it("invalidates the cached public projection before publish settles", async () => {
    const engine = createEngine();
    await initialize(engine);
    const app = appForWithPublic(engine);
    const root = "/api/admin/organizations/org-a/events/event-a/agenda";
    const publicPath = "/api/public/events/event-a/agenda.json";
    const firstEntry = {
      id: "entry-1",
      sessionId: "session-1",
      roomId: "room-large",
      trackIds: [],
      startsAtLocal: "2026-08-10T09:00",
      endsAtLocal: "2026-08-10T10:00",
    };
    const secondEntry = {
      ...firstEntry,
      roomId: "room-small",
      startsAtLocal: "2026-08-10T11:00",
      endsAtLocal: "2026-08-10T12:00",
    };
    const update = (expectedVersion: number, entries: readonly object[]) =>
      app.request(`${root}/draft`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion, entries }),
      });

    expect((await update(1, [firstEntry])).status).toBe(200);
    const firstPublish = await app.request(`${root}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 2 }),
    });
    expect(firstPublish.status).toBe(200);
    const firstPublic = await app.request(publicPath);
    expect(firstPublic.status).toBe(200);
    expect(
      (await responseData<{ revision: { number: number } }>(firstPublic)).revision.number,
    ).toBe(1);

    expect((await update(2, [secondEntry])).status).toBe(200);
    const cachedOldPublic = await app.request(publicPath);
    expect(
      (await responseData<{ revision: { number: number } }>(cachedOldPublic)).revision.number,
    ).toBe(1);

    const secondPublish = await app.request(`${root}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 3 }),
    });
    expect(secondPublish.status).toBe(200);
    const freshPublic = await app.request(publicPath);
    expect(freshPublic.status).toBe(200);
    expect(
      await responseData<{
        revision: { number: number };
        entries: readonly { startsAt: string }[];
      }>(freshPublic),
    ).toMatchObject({
      revision: { number: 2 },
      entries: [{ startsAt: "2026-08-10T11:00:00.000Z" }],
    });
  });
  it("keeps the published revision immutable when a session later becomes ineligible", async () => {
    const engine = createEngine();
    await initialize(engine);
    const app = appForWithPublic(engine);
    const root = "/api/admin/organizations/org-a/events/event-a/agenda";
    const draft = await app.request(`${root}/draft`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedVersion: 1,
        entries: [
          {
            id: "entry-1",
            sessionId: "session-1",
            roomId: "room-large",
            trackIds: [],
            startsAtLocal: "2026-08-10T09:00",
            endsAtLocal: "2026-08-10T10:00",
          },
        ],
      }),
    });
    expect(draft.status).toBe(200);
    const published = await app.request(`${root}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 2 }),
    });
    expect(published.status).toBe(200);

    const state = await engine.repository.load("event-a");
    if (state === null) throw new Error("Expected agenda state.");
    await engine.repository.compareAndSwap("event-a", state.stateVersion, {
      ...state,
      stateVersion: state.stateVersion + 1,
      sessions: state.sessions.map((session) =>
        session.id === "session-1" ? { ...session, status: "ineligible" } : session,
      ),
    });

    const publicResponse = await app.request("/api/public/events/event-a/agenda.json");
    expect(publicResponse.status).toBe(200);
    expect(
      await responseData<{
        entries: readonly { sessionId?: string }[];
        revision: { number: number };
      }>(publicResponse),
    ).toMatchObject({
      entries: [{ sessionId: "session-1" }],
      revision: { number: 1 },
    });
  });
  it("reports projection failures and retries the handoff without duplicating publication", async () => {
    const engine = createEngine();
    await initialize(engine);
    let failHandoff = true;
    const afterPublish = vi.fn(async () => {
      if (failHandoff) {
        failHandoff = false;
        throw new Error("speaker projection write failed");
      }
    });
    const app = appFor(engine, principal(), "org-a", afterPublish);
    const root = "/api/admin/organizations/org-a/events/event-a/agenda";
    const entry = {
      id: "entry-1",
      sessionId: "session-1",
      roomId: "room-large",
      trackIds: [],
      startsAtLocal: "2026-08-10T09:00",
      endsAtLocal: "2026-08-10T10:00",
    };
    const updated = await app.request(`${root}/draft`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 1, entries: [entry] }),
    });
    expect(updated.status).toBe(200);

    const published = await app.request(`${root}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 2 }),
    });
    expect(published.status).toBe(503);
    expect(await responseError(published)).toMatchObject({
      code: "INTEGRATION_UNAVAILABLE",
    });
    expect((await engine.getPublishedAgenda("event-a"))?.revisionNumber).toBe(1);
    const retried = await app.request(`${root}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 2 }),
    });
    expect(retried.status).toBe(200);
    expect(afterPublish).toHaveBeenCalledTimes(2);
    expect((await engine.repository.load("event-a"))?.revisions).toHaveLength(1);
  });

  it("maps full-draft hard conflicts to 409 without changing the version", async () => {
    const engine = createEngine();
    await initialize(engine);
    const app = appFor(engine);
    const response = await app.request(
      "/api/admin/organizations/org-a/events/event-a/agenda/draft",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedVersion: 1,
          entries: [
            {
              id: "entry-1",
              sessionId: "session-1",
              roomId: "room-large",
              trackIds: [],
              startsAtLocal: "2026-08-10T09:00",
              endsAtLocal: "2026-08-10T10:00",
            },
            {
              id: "entry-2",
              sessionId: "session-2",
              roomId: "room-large",
              trackIds: [],
              startsAtLocal: "2026-08-10T09:30",
              endsAtLocal: "2026-08-10T10:30",
            },
          ],
        }),
      },
    );
    expect(response.status).toBe(409);
    expect(await responseError(response)).toMatchObject({
      code: "CONFLICT",
      details: [{ message: expect.stringContaining("overlap") }],
    });
    expect((await engine.getDraft("event-a")).version).toBe(1);
  });
  it("detects room and speaker overlaps, clears them after a move, and keeps only accepted sessions unscheduled", async () => {
    const conflictCatalog: AgendaCatalog = {
      ...catalog,
      sessions: [
        ...catalog.sessions.map((session) =>
          session.id === "session-2"
            ? {
                ...session,
                participantIds: ["participant-1"],
                speakerNames: ["Grace Hopper"],
              }
            : session,
        ),
        {
          id: "session-rejected",
          title: "Not accepted",
          status: "rejected",
          participantIds: ["participant-4"],
          resourceIds: [],
          capacityRequired: 20,
        },
      ],
    };
    const engine = createEngine();
    await initialize(engine, conflictCatalog);
    const app = appFor(engine);
    const root = "/api/admin/organizations/org-a/events/event-a/agenda";
    const first = {
      id: "entry-1",
      sessionId: "session-1",
      roomId: "room-large",
      trackIds: [],
      startsAtLocal: "2026-08-10T09:00",
      endsAtLocal: "2026-08-10T10:00",
    };
    const colliding = {
      id: "entry-2",
      sessionId: "session-2",
      roomId: "room-large",
      trackIds: [],
      startsAtLocal: "2026-08-10T09:30",
      endsAtLocal: "2026-08-10T10:30",
    };
    const rejected = await app.request(`${root}/draft`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 1, entries: [first, colliding] }),
    });
    expect(rejected.status).toBe(409);
    expect((await responseError(rejected)).details?.map(({ message }) => message)).toEqual(
      expect.arrayContaining([
        'Sessions "Opening" and "Panel" overlap in room "Large room"',
        'Speaker "Grace Hopper" is scheduled in overlapping sessions "Opening" and "Panel"',
      ]),
    );
    expect((await engine.getDraft("event-a")).version).toBe(1);

    const moved = await app.request(`${root}/draft`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedVersion: 1,
        entries: [
          first,
          {
            ...colliding,
            roomId: "room-small",
            startsAtLocal: "2026-08-10T10:00",
            endsAtLocal: "2026-08-10T11:00",
          },
        ],
      }),
    });
    expect(moved.status).toBe(200);
    expect((await responseData<AgendaDraft>(moved)).version).toBe(2);

    const preview = await app.request(`${root}/preview`);
    expect(preview.status).toBe(200);
    expect(await responseData<{ conflicts: readonly unknown[] }>(preview)).toMatchObject({
      conflicts: [],
    });
    const workspace = await app.request(root);
    expect(
      (
        await responseData<{
          unscheduledSessions: readonly {
            id: string;
            title: string;
            durationMinutes: number;
            format: string;
            speakerNames: readonly string[];
            capacityRequired: number;
          }[];
        }>(workspace)
      ).unscheduledSessions,
    ).toEqual([
      {
        id: "session-3",
        title: "Deep dive",
        durationMinutes: 30,
        format: "Session",
        speakerNames: ["participant-3"],
        capacityRequired: 40,
      },
    ]);
    const state = await engine.repository.load("event-a");
    if (state === null) throw new Error("Expected agenda state.");
    await engine.repository.compareAndSwap("event-a", state.stateVersion, {
      ...state,
      stateVersion: state.stateVersion + 1,
      sessions: state.sessions.map((session) =>
        session.id === "session-1" ? { ...session, status: "ineligible" } : session,
      ),
    });
    const blockedPublish = await app.request(`${root}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: 2 }),
    });
    expect(blockedPublish.status).toBe(409);
    expect(await responseError(blockedPublish)).toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("Only accepted sessions can be published"),
    });
    await expect(engine.getPublishedAgenda("event-a")).resolves.toBeNull();
  });
});
describe("agenda suggestion admin routes", () => {
  it("uses the canonical mount, keeps generation private, and supports regenerate/reject/get", async () => {
    const engine = createEngine(providerWithPlacements());
    await initialize(engine);
    const app = appFor(engine);
    const before = await engine.getDraft("event-a");
    const workspace = await app.request("/api/admin/organizations/org-a/events/event-a/agenda");
    expect(workspace.status).toBe(200);
    expect(
      await responseData<{
        event: { id: string };
        draft: { version: number };
        rooms: readonly unknown[];
        tracks: readonly unknown[];
      }>(workspace),
    ).toMatchObject({
      event: { id: "event-a" },
      draft: { version: before.version },
      rooms: expect.any(Array),
      tracks: expect.any(Array),
    });

    const generated = await postSuggestion(
      app,
      "/api/admin/organizations/org-a/events/event-a/agenda/suggestions",
      suggestionRequest,
    );
    expect(generated.status).toBe(201);
    const run = await responseData<AgendaSuggestionRun>(generated);
    expect(run).toMatchObject({
      status: "pending",
      baseDraftVersion: before.version,
      criteria: {
        dates: suggestionRequest.dates,
        eligibleStatuses: suggestionRequest.eligibleStatuses,
        roomIds: suggestionRequest.roomIds,
        orderedRules: suggestionRequest.orderedRules,
      },
    });
    expect(await engine.getDraft("event-a")).toEqual(before);
    expect(await engine.getPublishedAgenda("event-a")).toBeNull();

    const regenerated = await postSuggestion(
      app,
      `/api/admin/organizations/org-a/events/event-a/agenda/suggestions/${run.id}/regenerate`,
      { baseDraftVersion: before.version },
    );
    expect(regenerated.status).toBe(200);
    const regeneratedRun = await responseData<AgendaSuggestionRun>(regenerated);
    expect(regeneratedRun).toMatchObject({
      status: "pending",
      regenerationOfRunId: run.id,
      version: run.version + 1,
    });

    const rejected = await postSuggestion(
      app,
      `/api/admin/organizations/org-a/events/event-a/agenda/suggestions/${regeneratedRun.id}/reject`,
      {},
    );
    expect(rejected.status).toBe(200);
    expect(await responseData<AgendaSuggestionRun>(rejected)).toMatchObject({
      id: regeneratedRun.id,
      status: "rejected",
    });

    const fetched = await app.request(
      `/api/admin/organizations/org-a/events/event-a/agenda/suggestions/${regeneratedRun.id}`,
    );
    expect(fetched.status).toBe(200);
    expect(await responseData<AgendaSuggestionRun>(fetched)).toMatchObject({
      id: regeneratedRun.id,
      status: "rejected",
    });
  });

  it("applies only accepted changes and never publishes the private agenda", async () => {
    const engine = createEngine(providerWithPlacements());
    await initialize(engine);
    const app = appFor(engine);
    const generated = await postSuggestion(
      app,
      "/api/admin/organizations/org-a/events/event-a/agenda/suggestions",
      suggestionRequest,
    );
    const run = await responseData<AgendaSuggestionRun>(generated);
    const selectedChangeId = run.diff.changes[0]?.id;
    if (!selectedChangeId) throw new Error("Expected a suggested agenda change.");

    const applied = await postSuggestion(
      app,
      `/api/admin/organizations/org-a/events/event-a/agenda/suggestions/${run.id}/apply`,
      { acceptedChangeIds: [selectedChangeId] },
    );
    expect(applied.status).toBe(200);
    expect((await responseData<AgendaDraft>(applied)).entries).toHaveLength(1);
    expect((await engine.getDraft("event-a")).entries.map((entry) => entry.sessionId)).toEqual([
      "session-1",
    ]);
    expect((await engine.getSuggestion("event-a", run.id)).acceptedChangeIds).toEqual([
      selectedChangeId,
    ]);
    expect(await engine.getPublishedAgenda("event-a")).toBeNull();
    expect(await engine.getOutbox("event-a")).toEqual([]);
  });

  it("maps provider, stale-base, hard-conflict, invalid-change, and missing-run errors", async () => {
    const unavailableEngine = createEngine();
    await initialize(unavailableEngine);
    const unavailable = await postSuggestion(
      appFor(unavailableEngine),
      "/api/admin/organizations/org-a/events/event-a/agenda/suggestions",
      suggestionRequest,
    );
    expect(unavailable.status).toBe(503);
    expect(await responseError(unavailable)).toMatchObject({ code: "INTEGRATION_UNAVAILABLE" });

    const staleEngine = createEngine(providerWithPlacements());
    await initialize(staleEngine);
    const staleApp = appFor(staleEngine);
    const staleGenerated = await postSuggestion(
      staleApp,
      "/api/admin/organizations/org-a/events/event-a/agenda/suggestions",
      suggestionRequest,
    );
    const staleRun = await responseData<AgendaSuggestionRun>(staleGenerated);
    await staleEngine.updateDraft({
      eventId: "event-a",
      actorId: "organizer-1",
      expectedVersion: 1,
      entries: [
        {
          id: "entry-3",
          sessionId: "session-3",
          roomId: "room-large",
          trackIds: [],
          startsAtLocal: "2026-08-10T13:00",
          endsAtLocal: "2026-08-10T14:00",
        },
      ],
    });
    const stale = await postSuggestion(
      staleApp,
      `/api/admin/organizations/org-a/events/event-a/agenda/suggestions/${staleRun.id}/apply`,
      { acceptedChangeIds: [staleRun.diff.changes[0]?.id ?? "missing-change"] },
    );
    expect(stale.status).toBe(412);
    expect(await responseError(stale)).toMatchObject({
      code: "PRECONDITION_FAILED",
      details: [{ message: expect.stringContaining("current draft version is 2") }],
    });

    const conflictEngine = createEngine(
      providerWithPlacements([
        {
          sessionId: "session-2",
          roomId: "room-small",
          startsAtLocal: "2026-08-10T09:30",
          endsAtLocal: "2026-08-10T10:30",
        },
      ]),
    );
    await initialize(conflictEngine);
    await conflictEngine.updateDraft({
      eventId: "event-a",
      actorId: "organizer-1",
      expectedVersion: 1,
      entries: [
        {
          id: "entry-1",
          sessionId: "session-1",
          roomId: "room-small",
          trackIds: [],
          startsAtLocal: "2026-08-10T09:00",
          endsAtLocal: "2026-08-10T10:00",
        },
      ],
    });
    const conflictApp = appFor(conflictEngine);
    const conflictGenerated = await postSuggestion(
      conflictApp,
      "/api/admin/organizations/org-a/events/event-a/agenda/suggestions",
      { ...suggestionRequest, baseDraftVersion: 2, roomIds: ["room-small"] },
    );
    const conflictRun = await responseData<AgendaSuggestionRun>(conflictGenerated);
    const conflict = await postSuggestion(
      conflictApp,
      `/api/admin/organizations/org-a/events/event-a/agenda/suggestions/${conflictRun.id}/apply`,
      { acceptedChangeIds: [conflictRun.diff.changes[0]?.id ?? "missing-change"] },
    );
    expect(conflict.status).toBe(409);
    expect(await responseError(conflict)).toMatchObject({ code: "CONFLICT" });

    const invalid = await postSuggestion(
      conflictApp,
      `/api/admin/organizations/org-a/events/event-a/agenda/suggestions/${conflictRun.id}/apply`,
      { acceptedChangeIds: ["unknown-change"] },
    );
    expect(invalid.status).toBe(400);
    expect(await responseError(invalid)).toMatchObject({ code: "VALIDATION_FAILED" });

    const missing = await appFor(conflictEngine).request(
      "/api/admin/organizations/org-a/events/event-a/agenda/suggestions/missing",
    );
    expect(missing.status).toBe(404);
    expect(await responseError(missing)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("requires an organizer in the event tenant", async () => {
    const engine = createEngine(providerWithPlacements());
    await initialize(engine);
    const denied = await postSuggestion(
      appFor(engine, principal("org-b")),
      "/api/admin/organizations/org-a/events/event-a/agenda/suggestions",
      suggestionRequest,
    );
    expect(denied.status).toBe(403);
    expect(await responseError(denied)).toMatchObject({ code: "ACCESS_DENIED" });

    const wrongEventTenant = await postSuggestion(
      appFor(engine, principal("org-a"), "org-b"),
      "/api/admin/organizations/org-a/events/event-a/agenda/suggestions",
      suggestionRequest,
    );
    expect(wrongEventTenant.status).toBe(404);
    expect(await responseError(wrongEventTenant)).toMatchObject({ code: "NOT_FOUND" });
  });
});
describe("anonymous published agenda feeds", () => {
  it("serves the public JSON projection with cache validators and excludes private fields", async () => {
    const app = publicAppFor(publicEngine(publicRevision()));
    const response = await app.request("/api/public/events/open-systems/agenda.json");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/u);
    expect(response.headers.get("cache-control")).toContain("public");
    const etag = response.headers.get("etag");
    expect(etag).toMatch(/^"[a-f0-9]{64}"$/u);
    const body = (await response.json()) as {
      data: {
        event: Record<string, unknown>;
        revision: Record<string, unknown>;
        entries: readonly Record<string, unknown>[];
      };
    };
    expect(body.data.event).toMatchObject({
      slug: "open-systems",
      name: "Open Systems Summit",
      timeZone: "America/Los_Angeles",
    });
    expect(body.data.entries[0]).toMatchObject({
      title: "A session, with; punctuation \\\\",
      summary: expect.stringContaining("Description with a long speaker"),
      roomName: "Main hall, level 2",
      speakerNames: ["Morgan Lee", "Avery Kim"],
    });
    expect(body.data.event).not.toHaveProperty("organizationId");
    expect(body.data.event).not.toHaveProperty("privateNote");
    expect(body.data.revision).not.toHaveProperty("publishedBy");
    expect(body.data.entries[0]).not.toHaveProperty("metadata");
    expect(body.data.entries[0]).not.toHaveProperty("participantEmails");

    const cached = await app.request("/api/public/events/open-systems/agenda", {
      headers: { "if-none-match": etag ?? "" },
    });
    expect(cached.status).toBe(304);
    expect(cached.headers.get("etag")).toBe(etag);
  });
  it("re-reads the authoritative projection across public feed formats", async () => {
    const revision = publicRevision();
    const getPublishedAgenda = vi.fn(async (eventSlug: string) =>
      eventSlug === "open-systems" ? revision : null,
    );
    const app = publicAppFor({ getPublishedAgenda } as unknown as AgendaEngine);

    expect((await app.request("/api/public/events/open-systems/agenda")).status).toBe(200);
    expect((await app.request("/api/public/events/open-systems/agenda.ics")).status).toBe(200);
    expect(getPublishedAgenda).toHaveBeenCalledTimes(2);
  });
  it("avoids repeated repository reads for the same anonymous format and slug", async () => {
    const revision = publicRevision();
    const getPublishedAgenda = vi.fn(async (eventSlug: string) =>
      eventSlug === "open-systems" ? revision : null,
    );
    const app = publicAppFor({ getPublishedAgenda } as unknown as AgendaEngine);

    const first = await app.request("/api/public/events/open-systems/agenda.json");
    const second = await app.request("/api/public/events/open-systems/agenda.json");

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(getPublishedAgenda).toHaveBeenCalledTimes(1);
  });

  it("keeps different public agenda slugs isolated", async () => {
    const first = publicRevision();
    const second = {
      ...first,
      eventId: "event-other",
      metadata: { slug: "other-systems", name: "Other Systems" },
    } as unknown as PublishedAgendaRevision;
    const getPublishedAgenda = vi.fn(async (eventSlug: string) => {
      if (eventSlug === "open-systems") return first;
      if (eventSlug === "other-systems") return second;
      return null;
    });
    const app = publicAppFor({ getPublishedAgenda } as unknown as AgendaEngine);

    const firstResponse = await app.request("/api/public/events/open-systems/agenda.json");
    const secondResponse = await app.request("/api/public/events/other-systems/agenda.json");

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    await expect(secondResponse.json()).resolves.toMatchObject({
      data: { event: { slug: "other-systems", name: "Other Systems" } },
    });
    expect(getPublishedAgenda).toHaveBeenCalledTimes(2);
  });

  it("does not cache failed public agenda reads", async () => {
    const getPublishedAgenda = vi.fn(async () => {
      throw new Error("agenda read failed");
    });
    const app = publicAppFor({ getPublishedAgenda } as unknown as AgendaEngine);

    expect((await app.request("/api/public/events/open-systems/agenda.json")).status).toBe(500);
    expect((await app.request("/api/public/events/open-systems/agenda.json")).status).toBe(500);
    expect(getPublishedAgenda).toHaveBeenCalledTimes(2);
  });

  it("serializes every published session as stable, escaped, folded iCalendar", async () => {
    const app = publicAppFor(publicEngine(publicRevision()));
    const first = await app.request("/api/public/events/open-systems/agenda.ics");
    const second = await app.request("/api/public/events/open-systems/agenda.ics");
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toMatch(/^text\/calendar/u);
    expect(first.headers.get("cache-control")).toContain("public");
    expect(first.headers.get("etag")).toBe(second.headers.get("etag"));

    const ical = await first.text();
    expect(ical).toContain("BEGIN:VCALENDAR\r\n");
    expect(ical).toContain("DTSTART;TZID=America/Los_Angeles:20260918T090000");
    expect(ical).toContain("DTEND;TZID=America/Los_Angeles:20260918T094500");
    expect(ical).toContain("SUMMARY:A session\\, with\\; punctuation \\\\\\\\");
    expect(ical).toContain("DESCRIPTION:Description with a long speaker");
    expect(ical).toContain("LOCATION:Main hall\\, level 2");
    expect(ical).toContain("Morgan Lee");
    expect(ical).toContain("@calendar.sessionboard.namuh.co");
    expect(ical).not.toContain("private@example.test");
    expect(ical).not.toContain("Private event metadata.");
    expect(ical).not.toMatch(/(^|\r\n)(participantEmails|privateNote):/u);

    const lines = ical.split("\r\n").slice(0, -1);
    expect(lines.every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
    expect(ical).toMatch(/END:VCALENDAR\r\n$/u);
    const uid = lines.find((line) => line.startsWith("UID:"));
    expect(uid).toBeDefined();
    const repeatUid = (await second.text()).split("\r\n").find((line) => line.startsWith("UID:"));
    expect(repeatUid).toBe(uid);
  });

  it("keeps every published day and metadata available in the public projection", async () => {
    const base = publicRevision();
    const first = base.entries[0];
    if (!first) throw new Error("Expected a published agenda entry.");
    const revision = {
      ...base,
      entries: [
        ...base.entries,
        {
          ...first,
          id: "entry-public-2",
          sessionId: "session-public-2",
          startsAt: "2026-09-19T16:00:00.000Z",
          endsAt: "2026-09-19T16:45:00.000Z",
          startsAtLocal: "2026-09-19T09:00",
          endsAtLocal: "2026-09-19T09:45",
          metadata: {
            title: "Second-day session",
            summary: "Second-day summary",
            format: "Workshop",
            speakerNames: ["Zoe Adams"],
            roomName: "Workshop room",
            trackNames: ["Operations"],
          },
        },
      ],
    } as PublishedAgendaRevision;
    const response = await publicAppFor(publicEngine(revision)).request(
      "/api/public/events/open-systems/agenda.json",
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: {
        event: { startsOn: string; endsOn: string };
        entries: readonly {
          title: string;
          speakerNames: readonly string[];
          roomName: string;
          trackNames: readonly string[];
          startsAt: string;
        }[];
      };
    };
    expect(body.data.event).toMatchObject({ startsOn: "2026-09-18", endsOn: "2026-09-19" });
    expect(body.data.entries).toHaveLength(2);
    expect(body.data.entries[1]).toMatchObject({
      title: "Second-day session",
      speakerNames: ["Zoe Adams"],
      roomName: "Workshop room",
      trackNames: ["Operations"],
      startsAt: "2026-09-19T16:00:00.000Z",
    });
  });
  it("uses authoritative event boundaries for cached and uncached public projections", async () => {
    const base = publicRevision();
    const first = base.entries[0];
    if (!first) throw new Error("Expected a published agenda entry.");
    const revision = {
      ...base,
      entries: [
        {
          ...first,
          startsAt: "2027-05-12T16:00:00.000Z",
          endsAt: "2027-05-12T16:30:00.000Z",
          startsAtLocal: "2027-05-12T09:00",
          endsAtLocal: "2027-05-12T09:30",
        },
        {
          ...first,
          id: "entry-public-2",
          sessionId: "session-public-2",
          startsAt: "2027-05-13T18:00:00.000Z",
          endsAt: "2027-05-13T18:10:00.000Z",
          startsAtLocal: "2027-05-13T11:00",
          endsAtLocal: "2027-05-13T11:10",
        },
      ],
    } as PublishedAgendaRevision;
    const getPublishedAgenda = vi.fn(async (eventSlug: string) =>
      eventSlug === "open-systems" ? revision : null,
    );
    const eventMetadataForEvent = vi.fn(async () => ({
      slug: "open-systems",
      name: "DevFlow Conf 2027",
      timeZone: "America/Los_Angeles",
      startsOn: "2027-05-12",
      endsOn: "2027-05-14",
      venueName: "DevFlow venue",
    }));
    const app = publicAppFor(
      { getPublishedAgenda } as unknown as AgendaEngine,
      eventMetadataForEvent,
    );
    const originalEntries = revision.entries.map((entry) => ({ ...entry }));

    const uncached = await app.request("/api/public/events/open-systems/agenda.json");
    expect(uncached.status).toBe(200);
    const uncachedData = await responseData<{
      event: {
        slug: string;
        name: string;
        timeZone: string;
        startsOn: string;
        endsOn: string;
        venueName: string | null;
      };
      revision: { id: string; number: number };
      entries: readonly { id: string; startsAt: string; endsAt: string }[];
    }>(uncached);
    expect(uncachedData).toMatchObject({
      event: {
        slug: "open-systems",
        name: "DevFlow Conf 2027",
        timeZone: "America/Los_Angeles",
        startsOn: "2027-05-12",
        endsOn: "2027-05-14",
        venueName: "DevFlow venue",
      },
      revision: { id: base.id, number: base.revisionNumber },
      entries: [
        {
          id: "entry-public-1",
          startsAt: "2027-05-12T16:00:00.000Z",
          endsAt: "2027-05-12T16:30:00.000Z",
        },
        {
          id: "entry-public-2",
          startsAt: "2027-05-13T18:00:00.000Z",
          endsAt: "2027-05-13T18:10:00.000Z",
        },
      ],
    });

    const cached = await app.request("/api/public/events/open-systems/agenda.json");
    expect(cached.status).toBe(200);
    await expect(responseData(cached)).resolves.toMatchObject({
      event: { startsOn: "2027-05-12", endsOn: "2027-05-14" },
      revision: { id: base.id, number: base.revisionNumber },
      entries: uncachedData.entries,
    });
    expect(getPublishedAgenda).toHaveBeenCalledTimes(1);
    expect(eventMetadataForEvent).toHaveBeenCalledTimes(1);
    expect(revision.entries).toEqual(originalEntries);
  });

  it("does not cache a partial projection when the event metadata resolver fails", async () => {
    const revision = publicRevision();
    const getPublishedAgenda = vi.fn(async () => revision);
    const eventMetadataForEvent = vi.fn(async () => {
      throw new Error("event metadata unavailable");
    });
    const app = publicAppFor(
      { getPublishedAgenda } as unknown as AgendaEngine,
      eventMetadataForEvent,
    );

    expect((await app.request("/api/public/events/open-systems/agenda.json")).status).toBe(500);
    expect((await app.request("/api/public/events/open-systems/agenda.json")).status).toBe(500);
    expect(getPublishedAgenda).toHaveBeenCalledTimes(2);
    expect(eventMetadataForEvent).toHaveBeenCalledTimes(2);
  });
  it("returns 404 for an unpublished or mismatched public slug", async () => {
    const unpublished = await publicAppFor(publicEngine(null)).request(
      "/api/public/events/open-systems/agenda.json",
    );
    expect(unpublished.status).toBe(404);

    const mismatched = await publicAppFor(publicEngine(publicRevision())).request(
      "/api/public/events/other-event/agenda.ics",
    );
    expect(mismatched.status).toBe(404);
  });
});
