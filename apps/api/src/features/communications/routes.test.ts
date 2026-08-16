import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { type CommunicationRouteEnvironment, createCommunicationRoutes } from "./routes";
import {
  CommunicationService,
  InMemoryCommunicationRepository,
  InMemoryReminderRepository,
} from "./service";
import type { CommunicationActor, ReminderCandidate, ReminderOutboxDelivery } from "./types";

const organizationId = "organization-1";
const eventId = "event-1";
const actor: CommunicationActor = {
  tenantId: organizationId,
  userId: "organizer-1",
  kind: "human",
  grants: [{ eventId, role: "organizer" }],
};

const candidate: ReminderCandidate = {
  id: "candidate-task-1",
  organizationId,
  eventId,
  recipientApplicationId: "participant-1",
  normalizedEmail: "speaker@example.com",
  displayName: "Speaker One",
  subject: { type: "task", taskId: "task-1" },
  eligibilityReason: "window",
  cadenceWindow: "2026-08-12T12:00:00.000Z",
  nextEligibleAt: "2026-08-13T12:00:00.000Z",
  eligible: true,
  renderedMessage: {
    from: "speakers@sessionboard.namuh.co",
    subject: "Reminder",
    html: "<p>Reminder</p>",
    text: "Reminder",
  },
};

class TestReminderOutbox implements ReminderOutboxDelivery {
  readonly requests: Parameters<ReminderOutboxDelivery["enqueue"]>[0][] = [];

  async enqueue(input: Parameters<ReminderOutboxDelivery["enqueue"]>[0]) {
    this.requests.push(input);
    return { outboxJobId: `outbox-${this.requests.length}` };
  }
}

function testApp(currentActor: CommunicationActor = actor) {
  const reminders = new InMemoryReminderRepository();
  const outbox = new TestReminderOutbox();
  const service = new CommunicationService(new InMemoryCommunicationRepository(), undefined, {
    clock: () => new Date("2026-08-12T12:30:00.000Z"),
    reminders: {
      repository: reminders,
      source: {
        async listCandidates() {
          return {
            audienceType: "task" as const,
            audienceRevision: "revision-1",
            candidates: [candidate],
          };
        },
      },
      outbox,
    },
  });
  const app = new Hono<CommunicationRouteEnvironment>();
  app.use("/organizations/*", async (context, next) => {
    context.set("communicationActor", currentActor);
    await next();
  });
  app.route(
    "/organizations/:organizationId/events/:eventId/communications",
    createCommunicationRoutes(service),
  );
  return { app, service, reminders, outbox };
}

function url(path: string, scopedOrganizationId = organizationId): string {
  return `/organizations/${scopedOrganizationId}/events/${eventId}/communications${path}`;
}

function communicationApp() {
  const repository = new InMemoryCommunicationRepository({
    templates: [
      {
        id: "group-template",
        tenantId: organizationId,
        eventId,
        name: "Group update",
        purpose: "organizer_group_email",
        version: 1,
        status: "approved",
        sender: "program@conference.example",
        subject: "Hello {{display_name}}",
        html: "<p>Hello {{display_name}}</p>",
        text: "Hello {{display_name}}",
        variables: ["display_name"],
        createdBy: actor.userId,
        createdAt: "2026-08-12T12:00:00.000Z",
        updatedAt: "2026-08-12T12:00:00.000Z",
        approvedBy: actor.userId,
        approvedAt: "2026-08-12T12:00:00.000Z",
      },
    ],
    recipients: [
      {
        id: "recipient-1",
        tenantId: organizationId,
        eventId,
        email: "one@example.test",
        displayName: "One",
        audiences: ["all_participants"],
      },
      {
        id: "recipient-2",
        tenantId: organizationId,
        eventId,
        email: "two@example.test",
        displayName: "Two",
        audiences: ["all_participants"],
      },
    ],
    authorizedAudiences: {
      [`${organizationId}:${eventId}`]: ["all_participants"],
    },
  });
  const service = new CommunicationService(
    repository,
    {
      async send(request) {
        return { status: "queued" as const, providerMessageId: `provider-${request.recipientId}` };
      },
    },
    {
      clock: () => new Date("2026-08-12T12:30:00.000Z"),
      senderIdentities: {
        auth: "login@conference.example",
        speakers: "program@conference.example",
        calendar: "schedule@conference.example",
      },
    },
  );
  const app = new Hono<CommunicationRouteEnvironment>();
  app.use("/organizations/*", async (context, next) => {
    context.set("communicationActor", actor);
    await next();
  });
  app.route(
    "/organizations/:organizationId/events/:eventId/communications",
    createCommunicationRoutes(service),
  );
  return app;
}

describe("communication routes", () => {
  it("validates exact preview recipients and lists sends newest first", async () => {
    const app = communicationApp();
    const invalid = await app.request(url("/previews"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        purpose: "organizer_group_email",
        templateId: "group-template",
        audience: "all_participants",
        recipientIds: ["recipient-1", "recipient-1"],
      }),
    });
    expect(invalid.status).toBe(400);

    const previewResponse = await app.request(url("/previews"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        purpose: "organizer_group_email",
        templateId: "group-template",
        audience: "all_participants",
        recipientIds: ["recipient-2", "recipient-1"],
      }),
    });
    expect(previewResponse.status).toBe(200);
    const preview = (await previewResponse.json()) as { id: string; recipientIds: string[] };
    expect(preview.recipientIds).toEqual(["recipient-2", "recipient-1"]);

    const sendResponse = await app.request(url("/sends"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ previewId: preview.id, idempotencyKey: "route-list-send" }),
    });
    expect(sendResponse.status).toBe(201);
    const send = (await sendResponse.json()) as { id: string };

    const listed = await app.request(url("/sends"));
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({ sends: [{ id: send.id }] });
  });

  it("assigns a generic configured sender email and rejects malformed sender input", async () => {
    const service = new CommunicationService(new InMemoryCommunicationRepository(), undefined, {
      senderIdentities: {
        auth: "login@conference.example",
        speakers: "program@conference.example",
        calendar: "schedule@conference.example",
      },
    });
    const app = new Hono<CommunicationRouteEnvironment>();
    app.use("/organizations/*", async (context, next) => {
      context.set("communicationActor", actor);
      await next();
    });
    app.route(
      "/organizations/:organizationId/events/:eventId/communications",
      createCommunicationRoutes(service),
    );

    const created = await app.request(url("/templates"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Login",
        purpose: "verification",
        subject: "Login",
        html: "<p>Login</p>",
        text: "Login",
      }),
    });
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({ sender: "login@conference.example" });

    const malformed = await app.request(url("/templates"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Invalid",
        purpose: "verification",
        sender: "not-an-email",
        subject: "Login",
        html: "<p>Login</p>",
        text: "Login",
      }),
    });
    expect(malformed.status).toBe(400);
  });
});

describe("communication reminder routes", () => {
  it("previews, creates, lists, and reports facts for an authorized event", async () => {
    const { app, outbox } = testApp();
    const preview = await app.request(url("/reminders/preview"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ triggerType: "manual" }),
    });
    expect(preview.status).toBe(200);
    await expect(preview.json()).resolves.toMatchObject({
      audienceType: "task",
      audienceRevision: "revision-1",
      candidates: [{ id: candidate.id }],
    });

    const create = await app.request(url("/reminders/runs"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: "manual-route-1",
        expectedAudienceRevision: "revision-1",
      }),
    });
    expect(create.status).toBe(201);
    const run = (await create.json()) as { id: string; state: string };
    expect(run.state).toBe("completed");
    expect(outbox.requests).toHaveLength(1);

    const runs = await app.request(url("/reminders/runs?triggerType=manual"));
    await expect(runs.json()).resolves.toMatchObject({
      runs: [{ id: run.id, triggerType: "manual", queuedCount: 1 }],
    });

    const dispatches = await app.request(
      url(`/reminders/runs/${encodeURIComponent(run.id)}/dispatches`),
    );
    await expect(dispatches.json()).resolves.toMatchObject({
      dispatches: [
        {
          runId: run.id,
          recipient: "participant-1",
          subject: { type: "task", taskId: "task-1" },
          status: "queued",
        },
      ],
    });

    const facts = await app.request(
      url("/reminders/facts?recipientApplicationId=participant-1&subjectType=task&taskId=task-1"),
    );
    expect(facts.status).toBe(200);
    await expect(facts.json()).resolves.toMatchObject({
      lastManual: { id: run.id },
      lastAutomatic: null,
      lastOutcome: { status: "queued" },
      nextEligibleAt: candidate.nextEligibleAt,
    });
  });

  it("rejects cross-organization and malformed reminder requests", async () => {
    const { app } = testApp();
    const crossOrganization = await app.request(url("/reminders/runs", "organization-2"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: "manual-route-2",
        expectedAudienceRevision: "revision-1",
      }),
    });
    expect(crossOrganization.status).toBe(404);

    const malformed = await app.request(url("/reminders/facts?subjectType=task"));
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({
      error: { code: "COMMUNICATION_INVALID_INPUT" },
    });
  });
});
