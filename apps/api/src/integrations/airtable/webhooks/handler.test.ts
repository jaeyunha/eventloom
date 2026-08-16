import { describe, expect, it } from "vitest";
import { createAirtableWebhookRouteHandler } from "./handler";
import type {
  AirtableWebhookD1Result,
  AirtableWebhookD1Statement,
  AirtableWebhookD1Value,
} from "./types";

class Statement implements AirtableWebhookD1Statement {
  values: AirtableWebhookD1Value[] = [];

  constructor(
    readonly sql: string,
    private readonly registration: Record<string, unknown> | null,
  ) {}

  bind(...values: AirtableWebhookD1Value[]) {
    this.values = values;
    return this;
  }

  async first<T>() {
    return (
      this.sql.includes("airtable_webhook_registrations") ? this.registration : null
    ) as T | null;
  }

  async all<T>() {
    return { results: [] as T[] };
  }

  async run<T>() {
    return { results: [] as T[], meta: { changes: 1 } };
  }
}

class Database {
  readonly statements: Statement[] = [];

  constructor(private readonly registration: Record<string, unknown> | null) {}

  prepare(sql: string) {
    const statement = new Statement(sql, this.registration);
    this.statements.push(statement);
    return statement;
  }

  async batch<T>(): Promise<AirtableWebhookD1Result<T>[]> {
    return [];
  }
}

async function mac(body: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, body));
  return `hmac-sha256=${Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

describe("createAirtableWebhookRouteHandler", () => {
  it("identifies the opaque registration, verifies the request, and uses the D1 notification store", async () => {
    const db = new Database({
      id: "opaque_registration_1",
      organization_id: "organization-1",
      connection_id: "connection-1",
      provider_webhook_id: "ach-1",
      mac_secret_ciphertext: "ciphertext",
      expires_at: "2026-08-20T12:00:00.000Z",
      specification_hash: "spec-v1",
      status: "active",
      refresh_owner: null,
      refresh_token: null,
      refresh_lease_expires_at: null,
      registration_version: 2,
      created_at: "2026-08-13T12:00:00.000Z",
      updated_at: "2026-08-13T12:00:00.000Z",
    });
    const handler = createAirtableWebhookRouteHandler({
      database: db,
      cipher: {
        encrypt: async (value) => value,
        decrypt: async () => "c2VjcmV0",
      },
      now: () => new Date("2026-08-13T12:34:56.000Z"),
      createId: () => "notification-1",
    });
    const body = new TextEncoder().encode("{}");
    const request = new Request("https://example.test/webhooks/opaque_registration_1", {
      method: "POST",
      headers: {
        "content-length": String(body.byteLength),
        "x-airtable-content-mac": await mac(body),
      },
      body,
    });

    await expect(handler(request, "opaque_registration_1")).resolves.toMatchObject({ status: 204 });
    expect(db.statements.map(({ sql }) => sql)).toEqual([
      expect.stringContaining("airtable_webhook_registrations"),
      expect.stringContaining("airtable_webhook_notifications"),
    ]);
    expect(db.statements[1]?.values.slice(0, 4)).toEqual([
      "notification-1",
      "organization-1",
      "connection-1",
      "opaque_registration_1",
    ]);
  });

  it("returns 404 before touching D1 for a non-opaque identifier", async () => {
    const db = new Database(null);
    const handler = createAirtableWebhookRouteHandler({
      database: db,
      cipher: { encrypt: async (value) => value, decrypt: async (value) => value },
    });

    const response = await handler(new Request("https://example.test"), "../connection-1");
    expect(response.status).toBe(404);
    expect(db.statements).toHaveLength(0);
  });
});
