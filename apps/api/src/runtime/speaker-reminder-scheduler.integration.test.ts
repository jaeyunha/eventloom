import type { D1Database, Queue } from "@cloudflare/workers-types";
import { afterEach, expect, it } from "vitest";
import type { ApiDependencies } from "../app";
import { CommunicationService } from "../features/communications/service";
import type { CloudflareOutboxMessage } from "../infrastructure/cloudflare/bindings";
import {
  CloudflareReminderOutbox,
  D1ReminderRepository,
} from "../infrastructure/cloudflare/reminder-repository";
import { D1CommunicationRepository } from "../infrastructure/cloudflare/repositories/communications";
import {
  createSpeakerLifecycleFixture,
  speakerLifecycleIds as ids,
} from "../test-support/speaker-lifecycle";
import type { RuntimeBindings } from "./cloudflare";
import { RuntimeReminderCandidateSource, runScheduledReminders } from "./composition";

const fixtures: ReturnType<typeof createSpeakerLifecycleFixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.dispose();
});

it("runs automatic speaker task reminders through the production D1 scheduler and outbox", async () => {
  const lifecycle = createSpeakerLifecycleFixture();
  fixtures.push(lifecycle);
  const phase = lifecycle.createPhase();
  lifecycle.database.executeScript(`
    INSERT INTO participants
      (id,organization_id,event_id,first_name,last_name,display_name,email,normalized_email,
       identity_state,source_type,source_id,claimed_user_id,version,created_at,updated_at)
    VALUES
      ('participant-priya','${ids.organizationId}','${ids.eventId}','Priya','Nair','Priya Nair',
       'priya@example.test','priya@example.test','resolved','manual','manual:participant-priya',
       '${ids.priyaAccountId}',1,'2099-08-15T04:00:00.000Z','2099-08-15T04:00:00.000Z');
  `);
  await phase.service.createOrganizerSpeaker({
    organizationId: ids.organizationId,
    eventId: ids.eventId,
    accountId: ids.organizerAccountId,
    explicitParticipantId: "participant-priya",
    sourceType: "manual",
    sourceId: "manual:participant-priya",
    idempotencyKey: "scheduler-speaker",
    displayName: "Priya Nair",
    email: "priya@example.test",
    jobTitle: "Engineer",
    company: "Example",
    biography: "Speaker biography",
    socialLinks: {},
    status: "confirmed",
  });
  await phase.service.createOrganizerTask({
    eventId: ids.eventId,
    accountId: ids.organizerAccountId,
    type: "upload",
    title: "Upload slides",
    description: "Upload the final deck.",
    allowedMimeTypes: ["application/pdf"],
    maxBytes: 5_000_000,
    dueAt: "2099-08-15T05:00:00.000Z",
    reminderOffsetsMinutes: [60],
    assignments: [{ participantId: "participant-priya", submissionId: null }],
  });

  const database = lifecycle.database as unknown as D1Database;
  const queued: CloudflareOutboxMessage[] = [];
  const queue = {
    async send(message: CloudflareOutboxMessage) {
      queued.push(message);
    },
  } as unknown as Queue<CloudflareOutboxMessage>;
  const communications = new CommunicationService(new D1CommunicationRepository(database));
  const dependencies = {
    speaker: { service: phase.service },
    communications: { service: communications, actorFor: async () => null },
    events: {
      service: {
        async listEvents() {
          return [{ id: ids.eventId, organizationId: ids.organizationId }];
        },
      },
    },
  } as unknown as ApiDependencies;
  communications.configureReminders({
    repository: new D1ReminderRepository(database),
    source: new RuntimeReminderCandidateSource(
      dependencies,
      database,
      "speakers@sessionboard.namuh.co",
    ),
    outbox: new CloudflareReminderOutbox(database, queue),
  });

  await runScheduledReminders(
    dependencies,
    { DB: database } as RuntimeBindings,
    new Date("2099-08-15T04:00:00.000Z"),
  );

  const runs = await new D1ReminderRepository(database).listRuns(ids.organizationId, ids.eventId);
  expect(runs).toMatchObject([
    {
      triggerType: "automatic",
      audienceType: "task",
      candidateCount: 1,
      eligibleCount: 1,
      queuedCount: 1,
      failedCount: 0,
      state: "completed",
      configurationFailure: null,
    },
  ]);
  const dispatches = await new D1ReminderRepository(database).listDispatches(
    ids.organizationId,
    ids.eventId,
  );
  expect(dispatches).toMatchObject([
    {
      recipient: "participant-priya",
      subject: { type: "task" },
      status: "queued",
      outboxJobId: expect.any(String),
    },
  ]);
  expect(queued).toHaveLength(1);
  expect(queued[0]).toMatchObject({
    tenantId: ids.organizationId,
    topic: "communications",
  });
  const outbox = lifecycle.database.query<{ state: string; payload_json: string }>(
    "SELECT state,payload_json FROM outbox_jobs WHERE topic='communications'",
  );
  expect(outbox).toHaveLength(1);
  expect(outbox[0]?.state).toBe("queued");
  expect(outbox[0]?.payload_json).toContain('"effect":"send_reminder"');
});
