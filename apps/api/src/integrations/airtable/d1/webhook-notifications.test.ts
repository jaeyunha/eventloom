import { describe, expect, it } from "vitest";
import type { AirtableD1Database } from "./adapters";
import { D1AirtableWebhookNotificationStore } from "./webhook-notifications";

class Statement {
  values: (string | number | null)[] = [];

  constructor(
    readonly sql: string,
    private readonly changes: number,
  ) {}

  bind(...values: (string | number | null)[]) {
    this.values = values;
    return this;
  }

  async first<T>() {
    return null as T | null;
  }

  async run<T>() {
    return { results: [] as T[], meta: { changes: this.changes } };
  }
}

class Database implements AirtableD1Database {
  readonly statements: Statement[] = [];

  constructor(private readonly changes: number) {}

  prepare(sql: string) {
    const statement = new Statement(sql, this.changes);
    this.statements.push(statement);
    return statement;
  }

  async batch<T>() {
    return [] as { results?: T[]; meta?: { changes?: number } }[];
  }
}

const notification = {
  id: "notification-1",
  organizationId: "organization-1",
  connectionId: "connection-1",
  registrationId: "registration-1",
  providerNotificationId: "provider-notification-1",
  rawBodyHash: "body-hash",
  timeBucket: "2026-01-02T03:04:00.000Z",
  rawBody: '{"baseTransactionNumber":42}',
  contentMac: "mac",
  status: "received" as const,
  receivedAt: "2026-01-02T03:04:05.000Z",
};

describe("D1AirtableWebhookNotificationStore", () => {
  it("inserts every migration 0013 notification column and reports insertion", async () => {
    const db = new Database(1);
    const store = new D1AirtableWebhookNotificationStore(db);

    await expect(store.insertNotification(notification)).resolves.toBe("inserted");

    const [statement] = db.statements;
    expect(statement?.sql).toContain("airtable_webhook_notifications");
    expect(statement?.sql).toContain("provider_notification_id");
    expect(statement?.sql).toContain("raw_body_hash");
    expect(statement?.sql).toContain("processed_at");
    expect(statement?.sql).toContain("ON CONFLICT DO NOTHING");
    expect(statement?.values).toEqual([
      "notification-1",
      "organization-1",
      "connection-1",
      "registration-1",
      "provider-notification-1",
      "body-hash",
      "2026-01-02T03:04:00.000Z",
      '{"baseTransactionNumber":42}',
      "mac",
      "received",
      "2026-01-02T03:04:05.000Z",
    ]);
  });

  it("reports a provider-id or fallback-key conflict as a duplicate", async () => {
    const store = new D1AirtableWebhookNotificationStore(new Database(0));

    await expect(
      store.insertNotification({ ...notification, providerNotificationId: null }),
    ).resolves.toBe("duplicate");
  });
});
