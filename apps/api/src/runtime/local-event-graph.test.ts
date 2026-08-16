import { beforeAll, describe, expect, it, vi } from "vitest";
import { type ApiDependencies, createApp } from "../app";
import type { RuntimeBindings } from "./cloudflare";
import { createRuntimeWorker } from "./composition";
import { createLocalDependencies, LOCAL_ORGANIZATION_ID } from "./local";

vi.setConfig({ testTimeout: 15_000 });

const organizer = {
  tenantId: LOCAL_ORGANIZATION_ID,
  userId: "local-organizer",
  role: "owner" as const,
  kind: "user" as const,
};
const evaluator = {
  tenantId: LOCAL_ORGANIZATION_ID,
  userId: "local-organizer",
  kind: "human" as const,
  grants: [{ eventId: "demo-event", role: "organizer" as const }],
};

describe("local fixture event graph", () => {
  let dependencies: ApiDependencies;
  const environment = {
    APP_ENV: "local" as const,
    WEB_ORIGIN: "http://localhost:3015",
  };

  beforeAll(async () => {
    dependencies = createLocalDependencies();
    await dependencies.agenda?.engine.getPublishedAgenda("demo-event");
  }, 30_000);

  it("lists only evaluation plans covered by explicit reviewer grants", async () => {
    const app = createApp(dependencies);
    const response = await app.request(
      "/api/admin/evaluations/plans",
      { headers: { cookie: "better-auth.session_token=local-reviewer-session" } },
      environment,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      plans: readonly { id: string; eventId: string }[];
    };
    expect(payload.plans).toContainEqual(
      expect.objectContaining({ id: "local-evaluation-plan", eventId: "demo-event" }),
    );
    expect(payload.plans.every(({ eventId }) => eventId === "demo-event")).toBe(true);

    const ungrantedResponse = await app.request(
      "/api/admin/evaluations/plans?eventId=open-sessionboard-conf",
      { headers: { cookie: "better-auth.session_token=local-reviewer-session" } },
      environment,
    );
    expect(ungrantedResponse.status).toBe(403);
  });

  it("does not expose legacy CFP-only events outside the canonical event graph", async () => {
    const app = createApp(dependencies);
    const response = await app.request(
      "/api/cfp/organizations/local-organization/events/evaluator-2026/config",
      { headers: { cookie: "better-auth.session_token=local-session" } },
      environment,
    );

    expect(response.status).toBe(404);
  });

  it("keeps fixture event writes across fresh binding objects", async () => {
    const worker = createRuntimeWorker();
    const fetch = worker.fetch;
    if (fetch === undefined) throw new Error("The runtime worker did not expose fetch.");
    const firstBindings: RuntimeBindings = {
      APP_ENV: "local",
      RUNTIME_PROFILE: "fixture",
      WEB_ORIGIN: "http://localhost:3015",
    };
    const createdResponse = await fetch(
      new Request(`http://api.local/api/admin/organizations/${LOCAL_ORGANIZATION_ID}/events`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "better-auth.session_token=local-session",
        },
        body: JSON.stringify({
          name: "Fresh binding event",
          slug: "fresh-binding-event",
          status: "draft",
          timeZone: "UTC",
          startsAt: "2026-10-02T09:00:00.000Z",
          endsAt: "2026-10-02T17:00:00.000Z",
          venue: "Local QA",
        }),
      }),
      firstBindings,
      {} as ExecutionContext,
    );
    expect(createdResponse.status).toBe(201);
    const createdPayload = (await createdResponse.json()) as {
      data?: { id?: unknown };
    };
    if (typeof createdPayload.data?.id !== "string") {
      throw new Error("Expected the event create route to return an event ID.");
    }

    const freshBindings: RuntimeBindings = { ...firstBindings };
    const response = await fetch(
      new Request(
        `http://api.local/api/admin/organizations/${LOCAL_ORGANIZATION_ID}/events/${createdPayload.data.id}`,
        { headers: { cookie: "better-auth.session_token=local-session" } },
      ),
      freshBindings,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
  });

  it("exposes newly created organizer events to CFP configuration", async () => {
    const app = createApp(dependencies);
    const startsAt = "2026-10-01T09:00:00.000Z";
    const endsAt = "2026-10-01T17:00:00.000Z";
    const createdResponse = await app.request(
      `/api/admin/organizations/${LOCAL_ORGANIZATION_ID}/events`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "better-auth.session_token=local-session",
        },
        body: JSON.stringify({
          name: "Local persistence event",
          slug: "local-persistence-event",
          status: "draft",
          timeZone: "UTC",
          startsAt,
          endsAt,
          venue: "Local QA",
          cfpSettings: {
            enabled: false,
            opensAt: null,
            closesAt: null,
          },
        }),
      },
      environment,
    );
    expect(createdResponse.status).toBe(201);
    const createdPayload = (await createdResponse.json()) as {
      data?: { id?: unknown };
    };
    if (typeof createdPayload.data?.id !== "string") {
      throw new Error("Expected the event create route to return an event ID.");
    }

    const response = await app.request(
      `/api/cfp/organizations/${LOCAL_ORGANIZATION_ID}/events/${createdPayload.data.id}/config`,
      { headers: { cookie: "better-auth.session_token=local-session" } },
      environment,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        id: createdPayload.data.id,
        tenantId: LOCAL_ORGANIZATION_ID,
        name: "Local persistence event",
        timezone: "UTC",
        opensAt: startsAt,
        closesAt: endsAt,
      },
    });
  });

  it("publishes only sessions belonging to the agenda event", async () => {
    const revision = await dependencies.agenda?.engine.getPublishedAgenda("demo-event");
    const otherRevision = dependencies.agenda?.engine.getPublishedAgenda("open-sessionboard-conf");
    const sessions = await dependencies.sessions?.service.listSessions(organizer, {
      eventId: "demo-event",
      limit: 100,
    });
    const eventBySessionId = new Map(sessions?.map((session) => [session.id, session.eventId]));

    expect(revision?.entries.length).toBeGreaterThan(0);
    expect(
      revision?.entries.every((entry) => eventBySessionId.get(entry.sessionId) === "demo-event"),
    ).toBe(true);
    await expect(otherRevision).rejects.toMatchObject({ code: "AGENDA_NOT_FOUND" });
  });

  it("lists only events with a served public release", async () => {
    const app = createApp(dependencies);
    const response = await app.request("/api/public/events", undefined, environment);

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: readonly {
        events: readonly { slug: string }[];
      }[];
    };
    const eventSlugs = payload.data.flatMap(({ events }) => events.map(({ slug }) => slug));
    expect(eventSlugs).toContain("demo-event");
    expect(eventSlugs).not.toContain("open-sessionboard-conf");
  });

  it("hands accepted evaluation decisions into canonical session and speaker state", async () => {
    const decision = await dependencies.evaluations?.service.getDecision(
      evaluator,
      "local-evaluation-plan",
      "submission_local_1",
    );
    const sessions = await dependencies.sessions?.service.listSessions(organizer, {
      eventId: "demo-event",
      limit: 100,
    });
    const portal = await dependencies.speaker?.service.getPortal("demo-event", "local-speaker");
    if (portal === undefined) throw new Error("Expected the local speaker portal service.");

    expect(decision?.status).toBe("accepted");
    expect(sessions).toContainEqual(
      expect.objectContaining({
        id: "session-submission_local_1",
        eventId: "demo-event",
        status: "Accepted",
        speakerIds: ["local-participant"],
      }),
    );
    expect(portal.submissions).toContainEqual(
      expect.objectContaining({ id: "submission_local_1", status: "accepted" }),
    );
    expect(portal.profiles).toContainEqual(
      expect.objectContaining({ participantId: "local-participant", status: "accepted" }),
    );
    expect(portal.tasks).toContainEqual(
      expect.objectContaining({
        submissionId: "speaker-submission:submission_local_1",
        participantId: "local-participant",
        status: "not_started",
      }),
    );
  });

  it("replays manual speaker creation and validates session speakers against active canonical state", async () => {
    const app = createApp(createLocalDependencies());
    const headers = {
      "content-type": "application/json",
      cookie: "better-auth.session_token=local-session",
    };
    const speakerEndpoint = `/api/admin/organizations/${LOCAL_ORGANIZATION_ID}/events/demo-event/speakers`;
    const sessionEndpoint = `/api/admin/organizations/${LOCAL_ORGANIZATION_ID}/events/demo-event/sessions`;
    const speakerInput = {
      idempotencyKey: "local-manual-speaker-replay",
      sourceType: "manual",
      displayName: "Replay Speaker",
      email: "replay-speaker@local.eventloom.test",
      jobTitle: "Staff Engineer",
      company: "Local QA",
      biography: "Tests local canonical speaker lifecycle invariants.",
      socialLinks: {},
      status: "active",
    };

    const createdResponse = await app.request(
      speakerEndpoint,
      { method: "POST", headers, body: JSON.stringify(speakerInput) },
      environment,
    );
    const replayResponse = await app.request(
      speakerEndpoint,
      { method: "POST", headers, body: JSON.stringify(speakerInput) },
      environment,
    );

    expect(createdResponse.status).toBe(201);
    expect(replayResponse.status).toBe(201);
    const created = (await createdResponse.json()) as {
      data: { speakers: readonly { participantId: string; email: string; version: number }[] };
    };
    const replayed = (await replayResponse.json()) as typeof created;
    const createdSpeaker = created.data.speakers.find(({ email }) => email === speakerInput.email);
    const replayedSpeakers = replayed.data.speakers.filter(
      ({ email }) => email === speakerInput.email,
    );
    expect(createdSpeaker).toBeDefined();
    expect(replayedSpeakers).toEqual([
      expect.objectContaining({ participantId: createdSpeaker?.participantId }),
    ]);
    if (createdSpeaker === undefined) throw new Error("Expected the manual speaker to be created.");

    const activeSessionResponse = await app.request(
      sessionEndpoint,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          id: "local-active-speaker-session",
          title: "Active speaker assignment",
          durationMinutes: 30,
          speakerIds: [createdSpeaker.participantId],
        }),
      },
      environment,
    );
    expect(activeSessionResponse.status).toBe(201);

    const revokeResponse = await app.request(
      `${speakerEndpoint}/${encodeURIComponent(createdSpeaker.participantId)}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          expectedVersion: createdSpeaker.version,
          displayName: speakerInput.displayName,
          email: speakerInput.email,
          jobTitle: speakerInput.jobTitle,
          company: speakerInput.company,
          biography: speakerInput.biography,
          socialLinks: speakerInput.socialLinks,
          status: "revoked",
        }),
      },
      environment,
    );
    expect(revokeResponse.status).toBe(200);

    const revokedSessionResponse = await app.request(
      sessionEndpoint,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          id: "local-revoked-speaker-session",
          title: "Revoked speaker assignment",
          durationMinutes: 30,
          speakerIds: [createdSpeaker.participantId],
        }),
      },
      environment,
    );
    expect(revokedSessionResponse.status).toBe(404);
    await expect(revokedSessionResponse.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND" },
    });

    const unknownSessionResponse = await app.request(
      sessionEndpoint,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          id: "local-unknown-speaker-session",
          title: "Unknown speaker assignment",
          durationMinutes: 30,
          speakerIds: ["unknown-local-participant"],
        }),
      },
      environment,
    );
    expect(unknownSessionResponse.status).toBe(404);
    await expect(unknownSessionResponse.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  });

  it("builds local report rows from canonical accepted sessions", async () => {
    const reportService = dependencies.reports?.service;
    expect(reportService).toBeDefined();
    if (reportService === undefined) return;

    const run = await reportService.runDefinition(
      {
        tenantId: "local-organization",
        userId: "local-organizer",
        kind: "human",
        grants: [{ eventId: "demo-event", role: "organizer" }],
      },
      "local-program-report",
      { format: "csv" },
    );

    expect(run.export.body).toContain("session-submission_local_1");
    expect(run.export.body).not.toContain("local-session-keynote");
  });
});
