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

it("queues one reminder per eligible 48-hour or overdue task across cron retries", async () => {
  const lifecycle = createSpeakerLifecycleFixture();
  fixtures.push(lifecycle);
  const phase = lifecycle.createPhase({
    eventTemporalSource: {
      getEventTemporalContext(organizationId, eventId) {
        return Promise.resolve(
          organizationId === ids.organizationId && eventId === ids.eventId
            ? {
                organizationId,
                eventId,
                timeZone: "America/Santiago",
                startsAt: "2100-01-10T17:00:00.000Z",
                endsAt: "2100-01-11T01:00:00.000Z",
              }
            : null,
        );
      },
    },
  });
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
  for (const input of [
    {
      title: "Upload slides in 48 hours",
      dueAt: "2099-09-07",
      reminderOffsetsMinutes: [2_880],
    },
    {
      title: "Sign overdue release",
      dueAt: "2099-09-04",
      reminderOffsetsMinutes: [0],
    },
  ]) {
    await phase.service.createOrganizerTask({
      eventId: ids.eventId,
      accountId: ids.organizerAccountId,
      type: "upload",
      title: input.title,
      description: "Complete this speaker requirement.",
      allowedMimeTypes: ["application/pdf"],
      maxBytes: 5_000_000,
      dueAt: input.dueAt,
      reminderOffsetsMinutes: input.reminderOffsetsMinutes,
      assignments: [{ participantId: "participant-priya", submissionId: null }],
    });
  }

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

  const scheduledAt = new Date("2099-09-06T04:00:00.000Z");
  await runScheduledReminders(dependencies, { DB: database } as RuntimeBindings, scheduledAt);
  await runScheduledReminders(
    dependencies,
    { DB: database } as RuntimeBindings,
    new Date("2099-09-06T05:00:00.000Z"),
  );

  const runs = await new D1ReminderRepository(database).listRuns(ids.organizationId, ids.eventId);
  expect(runs).toHaveLength(2);
  expect(runs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        triggerType: "automatic",
        audienceType: "task",
        candidateCount: 2,
        eligibleCount: 2,
        queuedCount: 2,
        failedCount: 0,
        state: "completed",
        configurationFailure: null,
      }),
      expect.objectContaining({
        triggerType: "automatic",
        audienceType: "task",
        candidateCount: 2,
        eligibleCount: 2,
        queuedCount: 2,
        failedCount: 0,
        state: "completed",
        configurationFailure: null,
      }),
    ]),
  );
  const dispatches = await new D1ReminderRepository(database).listDispatches(
    ids.organizationId,
    ids.eventId,
  );
  const queuedDispatches = dispatches.filter((dispatch) => dispatch.status === "queued");
  expect(queuedDispatches).toHaveLength(2);
  expect(queuedDispatches).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        recipient: "participant-priya",
        subject: expect.objectContaining({ type: "task" }),
        status: "queued",
        outboxJobId: expect.any(String),
      }),
    ]),
  );
  expect(new Set(queuedDispatches.map((dispatch) => dispatch.cadenceWindow))).toEqual(
    new Set(["2099-09-05T04:00:00.000Z", "2099-09-06T03:00:00.000Z"]),
  );
  expect(queued).toHaveLength(2);
  expect(queued).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        tenantId: ids.organizationId,
        topic: "communications",
      }),
    ]),
  );
  const outbox = lifecycle.database.query<{ state: string; payload_json: string }>(
    "SELECT state,payload_json FROM outbox_jobs WHERE topic='communications'",
  );
  expect(outbox).toHaveLength(2);
  expect(outbox.every((job) => job.state === "queued")).toBe(true);
  expect(outbox.every((job) => job.payload_json.includes('"effect":"send_reminder"'))).toBe(true);
}, 30_000);
