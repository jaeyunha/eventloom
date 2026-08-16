/// <reference types="node" />

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { D1Database } from "@cloudflare/workers-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommunicationService } from "../../../features/communications/service";
import type { CommunicationActor } from "../../../features/communications/types";
import { AirtableCommunicationDeliveryAdapter } from "../../../runtime/airtable";
import type { CloudflareOutboxMessage } from "../bindings";
import { consumeOutboxQueue, type OutboxQueueMessage } from "../outbox-consumer";
import { D1CommunicationRepository } from "./communications";

const SNAPSHOT_TIME = "2026-08-14T12:00:00.000Z";
const DELIVERY_TIME = new Date("2026-08-15T12:00:00.000Z");
const directories: string[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function expand(query: string, values: readonly unknown[]): string {
  let index = 0;
  const expanded = query.replaceAll("?", () => {
    const value = values[index];
    index += 1;
    return sqlLiteral(value);
  });
  if (index !== values.length) throw new Error("D1 test statement binding mismatch.");
  return expanded;
}

class SqliteStatement {
  constructor(
    private readonly database: SqliteD1,
    readonly query: string,
    private readonly values: readonly unknown[] = [],
  ) {}

  bind(...values: unknown[]) {
    return new SqliteStatement(this.database, this.query, values);
  }

  async first<T>(): Promise<T | null> {
    return (await this.all<T>()).results[0] ?? null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.database.query<T>(expand(this.query, this.values)) };
  }

  async run() {
    return { meta: { changes: this.database.run(expand(this.query, this.values)) } };
  }

  expanded(): string {
    return expand(this.query, this.values);
  }
}

class SqliteD1 {
  readonly path: string;

  constructor() {
    const directory = mkdtempSync(join(tmpdir(), "eventloom-communications-d1-"));
    directories.push(directory);
    this.path = join(directory, "database.sqlite");
    this.execute(`
      ${readFileSync(join(process.cwd(), "apps/api/migrations/0002_operational_state.sql"), "utf8")}
      ${readFileSync(join(process.cwd(), "apps/api/migrations/0011_content_communications_crm.sql"), "utf8")}
      ${readFileSync(
        join(process.cwd(), "apps/api/migrations/0020_self_hostable_communication_senders.sql"),
        "utf8",
      )}
      CREATE TABLE airtable_connections (
        id TEXT PRIMARY KEY NOT NULL,
        organization_id TEXT NOT NULL,
        connection_version INTEGER NOT NULL,
        status TEXT NOT NULL
      ) STRICT;
      CREATE TABLE airtable_projection_configs (
        organization_id TEXT NOT NULL,
        connection_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        enabled INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE airtable_sync_jobs (
        id TEXT PRIMARY KEY NOT NULL,
        organization_id TEXT NOT NULL,
        connection_id TEXT NOT NULL,
        connection_version INTEGER NOT NULL,
        entity_type TEXT NOT NULL,
        application_id TEXT NOT NULL,
        source_version INTEGER NOT NULL,
        operation TEXT NOT NULL,
        state TEXT NOT NULL,
        deduplication_key TEXT NOT NULL UNIQUE,
        attempt_count INTEGER NOT NULL,
        available_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
    `);
  }

  prepare(query: string) {
    return new SqliteStatement(this, query);
  }

  async batch(statements: readonly SqliteStatement[]) {
    this.execute(
      [
        "PRAGMA foreign_keys = ON; BEGIN IMMEDIATE;",
        ...statements.map((statement) => `${statement.expanded()};`),
        "COMMIT;",
      ].join("\n"),
    );
    return statements.map(() => ({ meta: { changes: 1 } }));
  }

  query<T>(query: string): T[] {
    const output = this.execute(`PRAGMA foreign_keys = ON; ${query}`);
    return output.length === 0 ? [] : (JSON.parse(output) as T[]);
  }

  run(query: string): number {
    const output = this.execute(
      `PRAGMA foreign_keys = ON; BEGIN IMMEDIATE; ${query}; SELECT changes() AS changes; COMMIT;`,
    );
    return Number(JSON.parse(output)[0]?.changes ?? 0);
  }

  execute(sql: string): string {
    return execFileSync("sqlite3", ["-json", this.path], { input: sql, encoding: "utf8" }).trim();
  }
}

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

describe("D1 communication delivery", () => {
  it("previews an authorized empty audience without manufacturing recipients", async () => {
    const database = new SqliteD1();
    database.execute(`
      INSERT INTO communication_templates
        (id, organization_id, event_id, version, name, purpose, status, sender,
         subject, html, text, variables_json, created_by, created_at, updated_at,
         approved_by, approved_at)
      VALUES
        ('template-1', 'org-1', 'event-1', 1, 'Decision',
         'organizer_group_email', 'approved', 'program@conference.example',
         'Hello {{display_name}}', '<p>Hello {{display_name}}</p>',
         'Hello {{display_name}}', '["display_name"]', 'organizer-1',
         '${SNAPSHOT_TIME}', '${SNAPSHOT_TIME}', 'organizer-1', '${SNAPSHOT_TIME}');
    `);
    const service = new CommunicationService(
      new D1CommunicationRepository(database as unknown as D1Database),
      undefined,
      {
        clock: () => new Date(SNAPSHOT_TIME),
        senderIdentities: {
          auth: "login@conference.example",
          speakers: "program@conference.example",
          calendar: "schedule@conference.example",
        },
      },
    );
    const actor: CommunicationActor = {
      tenantId: "org-1",
      userId: "organizer-1",
      kind: "human",
      grants: [{ eventId: "event-1", role: "organizer" }],
    };
    const preview = await service.previewGroupSend(actor, {
      eventId: "event-1",
      purpose: "organizer_group_email",
      templateId: "template-1",
      audience: "accepted_participants",
    });

    expect(preview).toMatchObject({
      recipientCount: 0,
      recipientIds: [],
      recipients: [],
      recipientPreviews: [],
    });
    expect(
      database.query<{ count: number }>(
        "SELECT count(*) AS count FROM communication_preview_recipients WHERE preview_id = '" +
          preview.id +
          "'",
      )[0]?.count,
    ).toBe(0);
    await expect(
      service.sendGroup(actor, {
        eventId: "event-1",
        previewId: preview.id,
        idempotencyKey: "empty-audience-send",
      }),
    ).rejects.toMatchObject({ code: "COMMUNICATION_INVALID_INPUT" });
    await expect(
      service.previewGroupSend(
        { ...actor, grants: [{ eventId: "other-event", role: "organizer" }] },
        {
          eventId: "event-1",
          purpose: "organizer_group_email",
          templateId: "template-1",
          audience: "accepted_participants",
        },
      ),
    ).rejects.toMatchObject({ code: "COMMUNICATION_FORBIDDEN" });
  });

  it("reconstructs immutable snapshots and histories while listing event sends newest first", async () => {
    const database = new SqliteD1();
    database.execute(`
      INSERT INTO communication_templates
        (id, organization_id, event_id, version, name, purpose, status, sender,
         subject, html, text, variables_json, created_by, created_at, updated_at,
         approved_by, approved_at)
      VALUES
        ('template-1', 'org-1', 'event-1', 1, 'Program update',
         'organizer_group_email', 'approved', 'program@conference.example',
         'Hello {{display_name}}', '<p>Hello {{display_name}}</p>',
         'Hello {{display_name}}', '["display_name"]', 'organizer-1',
         '${SNAPSHOT_TIME}', '${SNAPSHOT_TIME}', 'organizer-1', '${SNAPSHOT_TIME}');
      INSERT INTO communication_recipients
        (id, organization_id, event_id, participant_id, email, display_name, data_json, updated_at)
      VALUES
        ('recipient-1', 'org-1', 'event-1', 'participant-1', 'one@example.com', 'One', '{}', '${SNAPSHOT_TIME}'),
        ('recipient-2', 'org-1', 'event-1', 'participant-2', 'two@example.com', 'Two', '{}', '${SNAPSHOT_TIME}');
      INSERT INTO communication_recipient_audiences
        (organization_id, event_id, recipient_id, audience)
      VALUES
        ('org-1', 'event-1', 'recipient-1', 'all_participants'),
        ('org-1', 'event-1', 'recipient-2', 'all_participants');
    `);
    let currentTime = SNAPSHOT_TIME;
    const repository = new D1CommunicationRepository(database as unknown as D1Database);
    const service = new CommunicationService(
      repository,
      {
        async send(request) {
          return {
            status: "queued" as const,
            providerMessageId: `provider-${request.sendId}-${request.recipientId}`,
          };
        },
      },
      {
        clock: () => new Date(currentTime),
        senderIdentities: {
          auth: "login@conference.example",
          speakers: "program@conference.example",
          calendar: "schedule@conference.example",
        },
      },
    );
    const actor: CommunicationActor = {
      tenantId: "org-1",
      userId: "organizer-1",
      kind: "human",
      grants: [{ eventId: "event-1", role: "organizer" }],
    };
    const preview = await service.previewGroupSend(actor, {
      eventId: "event-1",
      purpose: "organizer_group_email",
      templateId: "template-1",
      audience: "all_participants",
      recipientIds: ["recipient-2", "recipient-1"],
    });
    expect(preview.recipientIds).toEqual(["recipient-2", "recipient-1"]);
    database.execute(`
      UPDATE communication_templates SET subject='Changed', html='<p>Changed</p>', text='Changed'
       WHERE id='template-1' AND version=1;
      UPDATE communication_recipients SET email='changed@example.com', display_name='Changed'
       WHERE id='recipient-2';
    `);
    const first = await service.sendGroup(actor, {
      eventId: "event-1",
      previewId: preview.id,
      idempotencyKey: "first-send",
    });
    currentTime = "2026-08-14T12:01:00.000Z";
    const second = await service.sendGroup(actor, {
      eventId: "event-1",
      previewId: preview.id,
      idempotencyKey: "second-send",
    });
    currentTime = "2026-08-14T12:02:00.000Z";
    await service.recordDeliveryStatus(actor, {
      eventId: "event-1",
      sendId: first.id,
      recipientId: "recipient-2",
      status: "delivered",
      providerMessageId: `provider-${first.id}-recipient-2`,
    });
    const reconstructed = new D1CommunicationRepository(database as unknown as D1Database);
    const restoredPreview = await reconstructed.getPreview("org-1", "event-1", preview.id);
    expect(restoredPreview?.template.subject).toBe("Hello {{display_name}}");
    expect(restoredPreview?.recipients[0]?.email).toBe("two@example.com");
    const listed = await reconstructed.listSends("org-1", "event-1");
    expect(listed.map((send) => send.id)).toEqual([second.id, first.id]);
    const restored = listed[1];
    expect(restored?.template.subject).toBe("Hello {{display_name}}");
    expect(restored?.recipients.map((recipient) => [recipient.id, recipient.email])).toEqual([
      ["recipient-2", "two@example.com"],
      ["recipient-1", "one@example.com"],
    ]);
    expect(restored?.deliveries[0]?.history.map((entry) => entry.status)).toEqual([
      "queued",
      "queued",
      "delivered",
    ]);
    expect(restored?.history.some((entry) => entry.action === "delivery_delivered")).toBe(true);
    expect(await reconstructed.listSends("org-1", "other-event")).toEqual([]);
  });

  it("creates one complete recipient job and rotates only its provider envelope", async () => {
    const database = new SqliteD1();
    const oldSender = "program@legacy.example";
    database.execute(`
      INSERT INTO communication_templates
        (id, organization_id, event_id, version, name, purpose, status, sender,
         subject, html, text, variables_json, created_by, created_at, updated_at,
         approved_by, approved_at)
      VALUES
        ('template-1', 'org-1', 'event-1', 1, 'Program update',
         'organizer_group_email', 'approved', '${oldSender}',
         'Hello {{displayName}}', '<p>Hello {{displayName}}</p>',
         'Hello {{displayName}}', '["displayName"]', 'organizer-1',
         '${SNAPSHOT_TIME}', '${SNAPSHOT_TIME}', 'organizer-1', '${SNAPSHOT_TIME}');
      INSERT INTO communication_recipients
        (id, organization_id, event_id, participant_id, email, display_name, data_json, updated_at)
      VALUES
        ('recipient-1', 'org-1', 'event-1', 'participant-1', 'recipient@example.com',
         'Recipient', '{}', '${SNAPSHOT_TIME}');
      INSERT INTO communication_recipient_audiences
        (organization_id, event_id, recipient_id, audience)
      VALUES ('org-1', 'event-1', 'recipient-1', 'all_participants');
    `);
    const queued: CloudflareOutboxMessage[] = [];
    const repository = new D1CommunicationRepository(database as unknown as D1Database);
    const service = new CommunicationService(
      repository,
      new AirtableCommunicationDeliveryAdapter(
        database as unknown as D1Database,
        {
          send: async (message: CloudflareOutboxMessage) => queued.push(message),
        } as unknown as Queue<CloudflareOutboxMessage>,
        () => new Date(SNAPSHOT_TIME),
      ),
      {
        clock: () => new Date(SNAPSHOT_TIME),
        senderIdentities: {
          auth: "login@legacy.example",
          speakers: oldSender,
          calendar: "schedule@legacy.example",
        },
      },
    );
    const actor: CommunicationActor = {
      tenantId: "org-1",
      userId: "organizer-1",
      kind: "human",
      grants: [{ eventId: "event-1", role: "organizer" }],
    };

    const preview = await service.previewGroupSend(actor, {
      eventId: "event-1",
      purpose: "organizer_group_email",
      templateId: "template-1",
      audience: "all_participants",
    });
    const send = await service.sendGroup(actor, {
      eventId: "event-1",
      previewId: preview.id,
      idempotencyKey: "repository-rotation-send",
    });
    const replay = await service.sendGroup(actor, {
      eventId: "event-1",
      previewId: preview.id,
      idempotencyKey: "repository-rotation-send",
    });

    expect(replay.id).toBe(send.id);
    expect(queued).toHaveLength(1);
    const jobs = database.query<{
      id: string;
      deduplication_key: string;
      payload_json: string;
      state: string;
    }>("SELECT id, deduplication_key, payload_json, state FROM outbox_jobs ORDER BY id");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.deduplication_key).toBe(`${send.id}:recipient-1`);
    const persistedPayload = JSON.parse(jobs[0]?.payload_json ?? "null") as Record<string, unknown>;
    expect(persistedPayload).toMatchObject({
      effect: "send_communication",
      sendId: send.id,
      recipientId: "recipient-1",
      payload: {
        from: oldSender,
        senderPurpose: "speakers",
        to: ["recipient@example.com"],
      },
    });
    expect(
      database.query<{ template_sender: string }>(
        `SELECT template_sender FROM communication_sends WHERE id = '${send.id}'`,
      )[0]?.template_sender,
    ).toBe(oldSender);

    const queuedJob = queued[0];
    if (queuedJob === undefined) throw new Error("Expected one queued communication job.");
    const delivery = queueMessage(queuedJob);
    const providerRequests: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input, init) => {
        providerRequests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return Response.json({ id: "provider-message-1" });
      }),
    );

    await consumeOutboxQueue(
      { messages: [delivery] } as unknown as MessageBatch<unknown>,
      {
        DB: database as unknown as D1Database,
        OPENSEND_API_KEY: "opensend-key",
        OPENSEND_API_URL: "https://mail.example.test",
        AUTH_FROM_EMAIL: "login@current.example",
        SPEAKERS_FROM_EMAIL: "program@current.example",
        CALENDAR_FROM_EMAIL: "schedule@current.example",
      } as never,
      undefined,
      { logger: {}, now: () => DELIVERY_TIME, leaseOwner: "repository-delivery-test" },
    );

    expect(delivery.acked).toBe(true);
    expect(providerRequests).toHaveLength(1);
    expect(providerRequests[0]?.from).toBe("program@current.example");
    const deliveredPayload = JSON.parse(
      database.query<{ payload_json: string }>(
        `SELECT payload_json FROM outbox_jobs WHERE id = '${jobs[0]?.id}'`,
      )[0]?.payload_json ?? "null",
    ) as Record<string, unknown>;
    expect(deliveredPayload).toMatchObject({
      payload: { from: oldSender, senderPurpose: "speakers" },
    });
  });
});
