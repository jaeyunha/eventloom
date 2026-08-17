import { describe, expect, it, vi } from "vitest";
import type { CloudflareOutboxMessage } from "./bindings";
import {
  consumeOutboxQueue,
  InMemoryOutboxJobRepository,
  type OutboxJob,
  type OutboxQueueMessage,
} from "./outbox-consumer";
import { CloudflareReminderOutbox } from "./reminder-repository";

class ReminderOutboxD1 {
  row:
    | {
        id: string;
        tenantId: string;
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
              if (this.row === undefined) {
                this.row = {
                  id,
                  tenantId,
                  deduplicationKey,
                  payloadJson,
                  state: "pending",
                  availableAt,
                };
              }
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

function deliveryMessage(body: CloudflareOutboxMessage): OutboxQueueMessage & { acked: boolean } {
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

describe("Cloudflare reminder outbox", () => {
  it("persists the reminder purpose and rotates only the delivery envelope sender", async () => {
    const oldSender = "program@legacy.example";
    const database = new ReminderOutboxD1();
    const queued: CloudflareOutboxMessage[] = [];
    const outbox = new CloudflareReminderOutbox(
      database as unknown as D1Database,
      {
        send: async (message: CloudflareOutboxMessage) => queued.push(message),
      } as unknown as Queue<CloudflareOutboxMessage>,
    );

    await outbox.enqueue({
      dispatchId: "dispatch-1",
      runId: "run-1",
      organizationId: "org-1",
      eventId: "event-1",
      recipient: "recipient@example.com",
      from: oldSender,
      senderPurpose: "speakers",
      subject: "Reminder",
      html: "<p>Reminder</p>",
      text: "Reminder",
      idempotencyKey: "reminder-rotation-1",
    });

    const persisted = JSON.parse(database.row?.payloadJson ?? "null") as Record<string, unknown>;
    expect(persisted).toMatchObject({
      effect: "send_reminder",
      payload: { from: oldSender, senderPurpose: "speakers" },
    });
    const queueBody = queued[0];
    if (queueBody === undefined || database.row === undefined)
      throw new Error("Expected reminder.");
    const job: OutboxJob = {
      id: database.row.id,
      tenantId: database.row.tenantId,
      topic: "communications",
      deduplicationKey: database.row.deduplicationKey,
      payload: persisted,
      state: "queued",
      attemptCount: 0,
      availableAt: new Date(database.row.availableAt),
      leaseOwner: null,
      leaseExpiresAt: null,
    };
    const repository = new InMemoryOutboxJobRepository([job]);
    const message = deliveryMessage(queueBody);
    const requests: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input, init) => {
        requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return Response.json({ id: "provider-reminder-1" });
      }),
    );

    try {
      await consumeOutboxQueue(
        { messages: [message] } as unknown as MessageBatch<unknown>,
        {
          OPENSEND_API_KEY: "opensend-key",
          OPENSEND_API_URL: "https://mail.example.test",
          AUTH_FROM_EMAIL: "login@current.example",
          SPEAKERS_FROM_EMAIL: "program@current.example",
          CALENDAR_FROM_EMAIL: "schedule@current.example",
        } as never,
        undefined,
        { repository, logger: {}, now: () => job.availableAt, leaseOwner: "test" },
      );
    } finally {
      vi.unstubAllGlobals();
    }

    expect(message.acked).toBe(true);
    expect(requests[0]?.from).toBe("program@current.example");
    expect(repository.get(job.id)?.payload).toMatchObject({
      payload: { from: oldSender, senderPurpose: "speakers" },
    });
  });
});
