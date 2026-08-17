import { describe, expect, it, vi } from "vitest";
import {
  CommunicationService,
  InMemoryCommunicationRepository,
} from "../features/communications/service";
import type { CommunicationActor, CommunicationTemplate } from "../features/communications/types";
import type { CloudflareOutboxMessage } from "../infrastructure/cloudflare/bindings";
import {
  consumeOutboxQueue,
  InMemoryOutboxJobRepository,
  type OutboxJob,
  type OutboxQueueMessage,
} from "../infrastructure/cloudflare/outbox-consumer";
import { AirtableCommunicationDeliveryAdapter, CloudflareSpeakerDeliveryAdapter } from "./airtable";

const NOW = "2026-08-14T12:00:00.000Z";

class CommunicationOutboxD1 {
  row:
    | {
        id: string;
        tenantId: string;
        topic: "communications";
        deduplicationKey: string;
        payloadJson: string;
        state: string;
        availableAt: string;
      }
    | undefined;

  prepare(query: string) {
    return {
      bind: (...values: unknown[]) => {
        if (query.includes("INSERT INTO outbox_jobs")) {
          return {
            run: async () => {
              const [id, tenantId, deduplicationKey, payloadJson, availableAt] = values as [
                string,
                string,
                string,
                string,
                string,
              ];
              const topic = "communications" as const;
              if (this.row === undefined) {
                this.row = {
                  id,
                  tenantId,
                  topic,
                  deduplicationKey,
                  payloadJson,
                  state: "pending",
                  availableAt,
                };
                return { meta: { changes: 1 } };
              }
              if (this.row.state === "pending") this.row.payloadJson = payloadJson;
              return { meta: { changes: 1 } };
            },
          };
        }
        if (query.includes("SELECT id, state FROM outbox_jobs")) {
          return {
            first: async () =>
              this.row === undefined ? null : { id: this.row.id, state: this.row.state },
          };
        }
        if (query.includes("UPDATE outbox_jobs SET state = 'queued'")) {
          return {
            run: async () => {
              if (this.row?.state === "pending") this.row.state = "queued";
              return { meta: { changes: 1 } };
            },
          };
        }
        throw new Error(`Unexpected D1 query: ${query}`);
      },
    };
  }
}

class SpeakerReminderOutboxD1 {
  row:
    | {
        id: string;
        state: string;
      }
    | undefined;

  prepare(query: string) {
    return {
      bind: (...values: unknown[]) => {
        if (query.includes("FROM auth_users")) {
          return { first: async () => ({ email: String(values[0]) }) };
        }
        if (query.includes("INSERT INTO outbox_jobs")) {
          return {
            run: async () => {
              if (this.row !== undefined) return { meta: { changes: 0 } };
              this.row = { id: String(values[0]), state: "pending" };
              return { meta: { changes: 1 } };
            },
          };
        }
        if (query.includes("SELECT state FROM outbox_jobs")) {
          return {
            first: async () => (this.row === undefined ? null : { state: this.row.state }),
          };
        }
        if (query.includes("UPDATE outbox_jobs SET state = 'queued'")) {
          return {
            run: async () => {
              if (this.row?.state === "pending") this.row.state = "queued";
              return { meta: { changes: 1 } };
            },
          };
        }
        throw new Error(`Unexpected D1 query: ${query}`);
      },
    };
  }
}

const reminderDeliveryInput = {
  organizationId: "org-1",
  eventId: "event-1",
  idempotencyKey: "content-reminder-1:participant-1",
  actorAccountId: "organizer-1",
  recipient: {
    participantId: "participant-1",
    displayName: "Priya Raman",
    email: "priya@example.test",
    taskIds: ["task-1"],
    tasks: [
      {
        taskId: "task-1",
        version: 1,
        participantId: "participant-1",
        title: "Upload Final Headshot",
        dueAt: "2027-04-14",
      },
    ],
  },
} as const;

function queueMessage(body: CloudflareOutboxMessage): OutboxQueueMessage & { acked: boolean } {
  return {
    body,
    attempts: 0,
    acked: false,
    ack() {
      this.acked = true;
    },
    retry() {},
  };
}

describe("Airtable communication D1 delivery", () => {
  it("reports a recovered pending reminder send as newly queued and preserves terminal failures", async () => {
    const database = new SpeakerReminderOutboxD1();
    let sendAttempts = 0;
    const adapter = new CloudflareSpeakerDeliveryAdapter(
      database as unknown as D1Database,
      {
        send: async () => {
          sendAttempts += 1;
          if (sendAttempts === 1) throw new Error("queue unavailable");
        },
      } as unknown as Queue<CloudflareOutboxMessage>,
      "https://event.example.test",
      {
        auth: "auth@example.test",
        speakers: "speakers@example.test",
        calendar: "calendar@example.test",
      },
    );

    await expect(adapter.enqueueReminder(reminderDeliveryInput)).rejects.toThrow(
      "queue unavailable",
    );
    expect(database.row?.state).toBe("pending");
    await expect(adapter.enqueueReminder(reminderDeliveryInput)).resolves.toMatchObject({
      queued: true,
      duplicate: false,
    });
    expect(database.row?.state).toBe("queued");
    await expect(adapter.enqueueReminder(reminderDeliveryInput)).resolves.toMatchObject({
      queued: false,
      duplicate: true,
    });
    expect(sendAttempts).toBe(2);

    if (database.row === undefined) throw new Error("The outbox fixture is unavailable.");
    database.row.state = "failed";
    await expect(adapter.enqueueReminder(reminderDeliveryInput)).resolves.toMatchObject({
      status: "failed",
      queued: false,
      duplicate: false,
    });
    expect(sendAttempts).toBe(2);
  });

  it("reports an unavailable reminder recipient as failed instead of duplicate", async () => {
    const adapter = new CloudflareSpeakerDeliveryAdapter(
      {
        prepare: () => ({
          bind: () => ({
            first: async () => null,
          }),
        }),
      } as unknown as D1Database,
      {
        send: async () => undefined,
      } as unknown as Queue<CloudflareOutboxMessage>,
      "https://event.example.test",
      {
        auth: "auth@example.test",
        speakers: "speakers@example.test",
        calendar: "calendar@example.test",
      },
    );

    await expect(
      adapter.enqueueReminder({
        organizationId: "org-1",
        eventId: "event-1",
        idempotencyKey: "content-reminder-1:participant-1",
        actorAccountId: "organizer-1",
        recipient: {
          participantId: "participant-1",
          displayName: "Priya Raman",
          email: "unverified@example.test",
          taskIds: ["task-1"],
          tasks: [
            {
              taskId: "task-1",
              version: 1,
              participantId: "participant-1",
              title: "Upload Final Headshot",
              dueAt: "2027-04-14",
            },
          ],
        },
      }),
    ).resolves.toEqual({
      status: "failed",
      queued: false,
      duplicate: false,
    });
  });

  it("keeps the queued sender snapshot for audit and delivers through the rotated purpose envelope", async () => {
    const oldSender = "program@legacy.example";
    const template: CommunicationTemplate = {
      id: "template-1",
      tenantId: "org-1",
      eventId: "event-1",
      name: "Program update",
      purpose: "organizer_group_email",
      version: 1,
      status: "approved",
      sender: oldSender,
      subject: "Hello {{displayName}}",
      html: "<p>Hello {{displayName}}</p>",
      text: "Hello {{displayName}}",
      variables: ["displayName"],
      createdBy: "organizer-1",
      createdAt: NOW,
      updatedAt: NOW,
      approvedBy: "organizer-1",
      approvedAt: NOW,
    };
    const repository = new InMemoryCommunicationRepository({
      templates: [template],
      recipients: [
        {
          id: "recipient-1",
          tenantId: "org-1",
          eventId: "event-1",
          email: "recipient@example.com",
          displayName: "Recipient",
          audiences: ["all_participants"],
        },
      ],
      authorizedAudiences: { "org-1:event-1": ["all_participants"] },
    });
    const database = new CommunicationOutboxD1();
    const queued: CloudflareOutboxMessage[] = [];
    const adapter = new AirtableCommunicationDeliveryAdapter(
      database as unknown as D1Database,
      {
        send: async (message: CloudflareOutboxMessage) => queued.push(message),
      } as unknown as Queue<CloudflareOutboxMessage>,
    );
    const service = new CommunicationService(repository, adapter, {
      clock: () => new Date(NOW),
      senderIdentities: {
        auth: "login@legacy.example",
        speakers: oldSender,
        calendar: "schedule@legacy.example",
      },
    });
    const actor: CommunicationActor = {
      tenantId: "org-1",
      userId: "organizer-1",
      kind: "human",
      grants: [{ eventId: "event-1", role: "organizer" }],
    };

    const preview = await service.previewGroupSend(actor, {
      eventId: "event-1",
      purpose: "organizer_group_email",
      templateId: template.id,
      audience: "all_participants",
    });
    await service.sendGroup(actor, {
      eventId: "event-1",
      previewId: preview.id,
      idempotencyKey: "rotated-d1-send",
    });

    const persisted = JSON.parse(database.row?.payloadJson ?? "null") as Record<string, unknown>;
    expect(persisted).toMatchObject({
      effect: "send_communication",
      payload: { from: oldSender, senderPurpose: "speakers" },
    });
    const queueBody = queued[0];
    if (queueBody === undefined || database.row === undefined)
      throw new Error("Expected queued job.");
    const outboxJob: OutboxJob = {
      id: database.row.id,
      tenantId: database.row.tenantId,
      topic: database.row.topic,
      deduplicationKey: database.row.deduplicationKey,
      payload: persisted,
      state: "queued",
      attemptCount: 0,
      availableAt: new Date(database.row.availableAt),
      leaseExpiresAt: null,
    };
    const outbox = new InMemoryOutboxJobRepository([outboxJob]);
    const delivery = queueMessage(queueBody);
    const requests: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input, init) => {
        requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return Response.json({ id: "provider-1" });
      }),
    );

    try {
      await consumeOutboxQueue(
        { messages: [delivery] } as unknown as MessageBatch<unknown>,
        {
          OPENSEND_API_KEY: "opensend-key",
          OPENSEND_API_URL: "https://mail.example.test",
          AUTH_FROM_EMAIL: "login@current.example",
          SPEAKERS_FROM_EMAIL: "program@current.example",
          CALENDAR_FROM_EMAIL: "schedule@current.example",
        } as never,
        undefined,
        { repository: outbox, logger: {}, now: () => outboxJob.availableAt, leaseOwner: "test" },
      );
    } finally {
      vi.unstubAllGlobals();
    }

    expect(delivery.acked).toBe(true);
    expect(requests[0]?.from).toBe("program@current.example");
    expect(outbox.get(database.row.id)?.payload).toMatchObject({
      payload: { from: oldSender, senderPurpose: "speakers" },
    });
  });
});
