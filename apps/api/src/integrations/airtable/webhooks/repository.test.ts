import { describe, expect, it } from "vitest";
import { D1AirtableWebhookRegistrationRepository } from "./repository";
import type {
  AirtableWebhookD1Result,
  AirtableWebhookD1Statement,
  AirtableWebhookD1Value,
} from "./types";

class Statement implements AirtableWebhookD1Statement {
  values: AirtableWebhookD1Value[] = [];

  constructor(
    readonly sql: string,
    private readonly firstResult: Record<string, unknown> | null = null,
    private readonly allResults: Record<string, unknown>[] = [],
  ) {}

  bind(...values: AirtableWebhookD1Value[]) {
    this.values = values;
    return this;
  }

  async first<T>() {
    return this.firstResult as T | null;
  }

  async all<T>() {
    return { results: this.allResults as T[] };
  }

  async run<T>() {
    return { results: [] as T[], meta: { changes: 1 } };
  }
}

class Database {
  readonly statements: Statement[] = [];
  nextFirst: Record<string, unknown> | null = null;
  nextAll: Record<string, unknown>[] = [];

  prepare(sql: string) {
    const statement = new Statement(sql, this.nextFirst, this.nextAll);
    this.nextFirst = null;
    this.nextAll = [];
    this.statements.push(statement);
    return statement;
  }

  async batch<T>(): Promise<AirtableWebhookD1Result<T>[]> {
    return [];
  }
}

const row = {
  id: "opaque_registration_1",
  organization_id: "organization-1",
  connection_id: "connection-1",
  provider_webhook_id: "ach-1",
  mac_secret_ciphertext: "encrypted-secret",
  expires_at: "2026-08-20T12:00:00.000Z",
  specification_hash: "spec-v1",
  status: "active",
  refresh_owner: null,
  refresh_token: null,
  refresh_lease_expires_at: null,
  registration_version: 2,
  created_at: "2026-08-13T12:00:00.000Z",
  updated_at: "2026-08-13T12:00:00.000Z",
};

describe("D1AirtableWebhookRegistrationRepository", () => {
  it("resolves only an active opaque registration and decrypts its base64 MAC secret", async () => {
    const db = new Database();
    db.nextFirst = row;
    const repository = new D1AirtableWebhookRegistrationRepository(db, {
      encrypt: async (plaintext) => `encrypted:${plaintext}`,
      decrypt: async (ciphertext) => {
        expect(ciphertext).toBe("encrypted-secret");
        return "c2VjcmV0";
      },
    });

    await expect(repository.resolveActive("opaque_registration_1")).resolves.toEqual({
      id: "opaque_registration_1",
      organizationId: "organization-1",
      connectionId: "connection-1",
      macSecret: new TextEncoder().encode("secret"),
    });
    expect(db.statements[0]?.sql).toContain("status IN ('active', 'refreshing')");
    expect(db.statements[0]?.values).toEqual(["opaque_registration_1"]);
  });

  it("encrypts provider MAC secrets and completes creation with version CAS", async () => {
    const db = new Database();
    db.nextFirst = { ...row, registration_version: 2 };
    const repository = new D1AirtableWebhookRegistrationRepository(db, {
      encrypt: async (plaintext) => `cipher:${plaintext}`,
      decrypt: async (ciphertext) => ciphertext,
    });

    await repository.completeCreate({
      registrationId: "opaque_registration_1",
      expectedVersion: 1,
      providerWebhookId: "ach-1",
      macSecret: "c2VjcmV0",
      expiresAt: "2026-08-20T12:00:00.000Z",
      updatedAt: "2026-08-13T12:01:00.000Z",
    });

    const statement = db.statements[0];
    expect(statement?.sql).toContain("status = 'creating' AND registration_version = ?");
    expect(statement?.values).toEqual([
      "ach-1",
      "cipher:c2VjcmV0",
      "2026-08-20T12:00:00.000Z",
      "2026-08-13T12:01:00.000Z",
      "opaque_registration_1",
      1,
    ]);
  });

  it("queries due registrations including expired refresh leases and connected credentials", async () => {
    const db = new Database();
    db.nextAll = [{ ...row, credential_reference: "secret-ref", base_id: "app-1" }];
    const repository = new D1AirtableWebhookRegistrationRepository(db, {
      encrypt: async (value) => value,
      decrypt: async (value) => value,
    });

    await expect(
      repository.listDue({
        refreshBefore: "2026-08-14T12:00:00.000Z",
        now: "2026-08-13T12:00:00.000Z",
        limit: 25,
      }),
    ).resolves.toMatchObject([{ credentialReference: "secret-ref", baseId: "app-1" }]);
    expect(db.statements[0]?.sql).toContain("refresh_lease_expires_at <= ?");
    expect(db.statements[0]?.sql).toContain("c.status = 'connected'");
  });
});
