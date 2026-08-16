import { describe, expect, test } from "vitest";
import {
  type AirtableD1Database,
  D1AirtableConfigurationStore,
  D1AirtableConnectionStore,
  D1AirtableOAuthAttemptStore,
  D1AirtableOAuthConnectionStore,
  EncryptedReferenceAirtableOAuthSecretStore,
  EncryptedReferenceAirtableSecretStore,
} from "./adapters";

class Statement {
  values: unknown[] = [];
  constructor(readonly sql: string) {}
  bind(...values: (string | number | null)[]) {
    this.values = values;
    return this;
  }
  async first<T>() {
    return null as T | null;
  }
  async run<T>() {
    return { meta: { changes: 1 } } as { results?: T[]; meta?: { changes?: number } };
  }
}

class Database implements AirtableD1Database {
  statements: Statement[] = [];
  batches: Statement[][] = [];
  prepare(sql: string) {
    const statement = new Statement(sql);
    this.statements.push(statement);
    return statement;
  }
  async batch<T>(statements: Statement[]) {
    this.batches.push(statements);
    return statements.map(() => ({ results: [] as T[], meta: { changes: 0 } }));
  }
}

const cipher = {
  encrypt: (plaintext: string) => Buffer.from(plaintext).toString("base64url"),
  decrypt: (ciphertext: string) => Buffer.from(ciphertext, "base64url").toString(),
};

describe("encrypted Airtable secret references", () => {
  test("round trips OAuth credentials without external persistence", async () => {
    const store = new EncryptedReferenceAirtableOAuthSecretStore(cipher);
    const reference = await store.put({
      connectionId: "connection-1",
      source: "authorization",
      claimToken: "claim-1",
      credentials: { accessToken: "access", refreshToken: "refresh" },
    });

    expect(reference.startsWith("airtable-oauth:v1:")).toBe(true);
    expect(await store.get(reference)).toEqual({ accessToken: "access", refreshToken: "refresh" });
    await store.discard(reference);
  });

  test("round trips PAT secrets and embeds only their last four", async () => {
    const store = new EncryptedReferenceAirtableSecretStore(cipher);
    const reference = await store.put("pat-secret-1234");

    expect(reference.startsWith("airtable-secret:v1:1234:")).toBe(true);
    expect(reference).not.toContain("pat-secret-1234");
    expect(await store.get(reference)).toBe("pat-secret-1234");
    await store.delete(reference);
  });
});

describe("D1 OAuth stores", () => {
  test("claim and reclaim use version, callback hash, expiry, and rotated lease token", async () => {
    const db = new Database();
    const store = new D1AirtableOAuthAttemptStore(db);
    await store.claimExchange({
      attemptId: "attempt-1",
      expectedAttemptVersion: 2,
      callbackCodeHash: "code-hash",
      exchangeOwner: "worker",
      exchangeToken: "new-token",
      claimedAt: "2026-01-01T00:00:00.000Z",
      leaseExpiresAt: "2026-01-01T00:01:00.000Z",
    });

    const [statement] = db.statements;
    expect(statement?.sql).toContain("attempt_version = attempt_version + 1");
    expect(statement?.sql).toContain("callback_code_hash = ?");
    expect(statement?.sql).toContain("exchange_lease_expires_at <= ?");
    expect(statement?.values).toContain("new-token");
  });

  test("supersedes older active attempts only after a newer authorization generation", async () => {
    const db = new Database();
    const store = new D1AirtableOAuthAttemptStore(db);
    await store.supersede({
      organizationId: "organization-1",
      connectionId: "connection-1",
      authorizationConnectionVersion: 4,
      supersededAt: "2026-01-01T00:00:00.000Z",
    });

    const [statement] = db.statements;
    expect(statement?.sql).toContain("status = 'failed'");
    expect(statement?.sql).toContain("authorization_connection_version < ?");
    expect(statement?.sql).toContain("status IN ('pending', 'exchanging')");
  });

  test("finalize batches the connection and attempt updates", async () => {
    const db = new Database();
    const store = new D1AirtableOAuthAttemptStore(db);
    const result = await store.finalizeExchange({
      attemptId: "attempt-1",
      expectedAttemptVersion: 2,
      exchangeToken: "lease-token",
      finalizedAt: "2026-01-01T00:00:00.000Z",
      resultRedirect: "/settings",
      connection: {
        id: "connection-1",
        organizationId: "organization-1",
        credentialReference: "reference",
        airtableUserId: "user-1",
        airtableAccountId: null,
        grantedScopes: ["data.records:read"],
        accessTokenExpiresAt: "2026-01-01T01:00:00.000Z",
        refreshTokenExpiresAt: null,
      },
    });

    expect(result).toBeNull();
    expect(db.batches).toHaveLength(1);
    expect(db.batches[0]).toHaveLength(2);
    expect(db.batches[0]?.[0]?.sql).toContain("UPDATE airtable_connections");
    expect(db.batches[0]?.[0]?.sql).toContain("status = 'authorizing'");
    expect(db.batches[0]?.[0]?.sql).toContain(
      "authorization_connection_version = airtable_connections.connection_version",
    );
    expect(db.batches[0]?.[1]?.sql).toContain("UPDATE airtable_oauth_attempts");
  });

  test("refresh CAS requires a matching version and expired lease for reclamation", async () => {
    const db = new Database();
    const store = new D1AirtableOAuthConnectionStore(db);
    await store.claimRefresh({
      connectionId: "connection-1",
      organizationId: "organization-1",
      expectedConnectionVersion: 4,
      refreshOwner: "worker",
      refreshToken: "rotated-token",
      claimedAt: "2026-01-01T00:00:00.000Z",
      leaseExpiresAt: "2026-01-01T00:01:00.000Z",
    });

    const [statement] = db.statements;
    expect(statement?.sql).toContain("connection_version = ?");
    expect(statement?.sql).toContain("refresh_lease_expires_at <= ?");
    expect(statement?.sql).toContain("connection_version = connection_version + 1");
  });
});

describe("D1 control stores", () => {
  test("persists connections using migration 0013 columns", async () => {
    const db = new Database();
    const store = new D1AirtableConnectionStore(db);
    await store.create({
      id: "connection-1",
      organizationId: "organization-1",
      status: "connected",
      authMode: "pat",
      credentialReference: "airtable-secret:v1:1234:ciphertext",
      credentialLastFour: "1234",
      airtableUserId: null,
      airtableAccountId: null,
      baseId: "base-1",
      baseName: "Base",
      grantedScopes: ["data.records:read"],
      connectionVersion: 1,
      lastSchemaCheckAt: null,
      lastSuccessAt: null,
      lastErrorCode: null,
      lastError: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      disconnectedAt: null,
    });

    expect(db.statements[0]?.sql).toContain("airtable_connections");
    expect(db.statements[0]?.sql).toContain("granted_scopes_json");
    expect(db.statements[0]?.values).toContain('["data.records:read"]');
  });

  test("upserts projection mappings by connection and entity", async () => {
    const db = new Database();
    const store = new D1AirtableConfigurationStore(db, {
      requiredScopes: [],
      schema: [],
    });
    await store.saveProjection({
      id: "projection-1",
      organizationId: "organization-1",
      connectionId: "connection-1",
      entityType: "session",
      tableId: "table-1",
      tableName: "Sessions",
      enabled: true,
      preset: "custom",
      schemaVersion: 1,
      fieldMapping: { title: "fldTitle" },
      inboundFields: ["title"],
      conflictPolicy: "manual",
      projectionVersion: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const [statement] = db.statements;
    expect(statement?.sql).toContain("airtable_projection_configs");
    expect(statement?.sql).toContain("ON CONFLICT(connection_id, entity_type)");
    expect(statement?.sql).toContain("projection_version + 1");
    expect(statement?.values).toContain('{"title":"fldTitle"}');
  });
});
