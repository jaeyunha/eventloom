import { describe, expect, it } from "vitest";
import type { AirtableD1Database } from "./adapters";
import { D1AirtableWebhookCursorStore } from "./cursor-store";
import { D1AirtableInboundChangeStore } from "./inbound-change-store";

type Row = Record<string, unknown>;
type Result = { first?: Row | null; rows?: Row[]; changes?: number };

class Statement {
  values: (string | number | null)[] = [];
  constructor(
    readonly sql: string,
    private readonly result: Result,
  ) {}
  bind(...values: (string | number | null)[]) {
    this.values = values;
    return this;
  }
  async first<T>() {
    return (this.result.first ?? null) as T | null;
  }
  async run<T>() {
    return {
      results: (this.result.rows ?? []) as T[],
      meta: { changes: this.result.changes ?? 0 },
    };
  }
}

class Database implements AirtableD1Database {
  readonly statements: Statement[] = [];
  constructor(
    private readonly prepared: Result[] = [],
    private readonly batched: Result[] = [],
  ) {}
  prepare(sql: string) {
    const statement = new Statement(sql, this.prepared[this.statements.length] ?? {});
    this.statements.push(statement);
    return statement;
  }
  async batch<T>(statements: Statement[]) {
    return statements.map((_, index) => ({
      results: (this.batched[index]?.rows ?? []) as T[],
      meta: { changes: this.batched[index]?.changes ?? 0 },
    }));
  }
}

const cursorRow = {
  registration_id: "registration-1",
  next_cursor: "cursor-1",
  row_version: 3,
  claim_token: "token-1",
};
const registrationRow = {
  organization_id: "organization-1",
  connection_id: "connection-1",
  provider_webhook_id: "webhook-1",
};

const changeRow = {
  id: "change-1",
  organization_id: "organization-1",
  connection_id: "connection-1",
  registration_id: "registration-1",
  base_transaction_number: 42,
  table_id: "table-1",
  record_id: "record-1",
  field_id: "field-1",
  entity_type: "session",
  application_id: "session-1",
  source_value_json: '"Title"',
  source_hash: "hash-1",
  attempt_count: 2,
  claim_token: "token-1",
};

describe("D1AirtableWebhookCursorStore", () => {
  it("claims active cursors and expired leases with a rotated token and version", async () => {
    const db = new Database([{ first: cursorRow }, { first: registrationRow }]);
    const store = new D1AirtableWebhookCursorStore(db);
    await expect(
      store.claimNext({
        claimOwner: "worker-1",
        claimToken: "token-1",
        claimedAt: "2026-08-13T12:00:00.000Z",
        leaseExpiresAt: "2026-08-13T12:01:00.000Z",
      }),
    ).resolves.toEqual({
      registrationId: "registration-1",
      organizationId: "organization-1",
      connectionId: "connection-1",
      providerWebhookId: "webhook-1",
      nextCursor: "cursor-1",
      rowVersion: 3,
      claimToken: "token-1",
    });
    expect(db.statements[0]?.sql).toContain("registration.status = 'active'");
    expect(db.statements[0]?.sql).toContain("cursor.lease_expires_at <= ?");
    expect(db.statements[0]?.sql).toContain("row_version = row_version + 1");
  });

  it("batches page inserts behind cursor CAS and advances the cursor last", async () => {
    const nextCursorRow = { ...cursorRow, next_cursor: "cursor-2", row_version: 4 };
    const db = new Database(
      [{}, {}, {}, { first: registrationRow }],
      [{ changes: 1 }, { changes: 0 }, { rows: [nextCursorRow], changes: 1 }],
    );
    const store = new D1AirtableWebhookCursorStore(db);
    const change = {
      baseTransactionNumber: 42,
      tableId: "table-1",
      recordId: "record-1",
      fieldId: "field-1",
      entityType: "session",
      applicationId: "session-1",
      sourceValueJson: '"Title"',
      sourceHash: "hash-1",
    };
    await expect(
      store.advancePage({
        registrationId: "registration-1",
        claimToken: "token-1",
        expectedRowVersion: 3,
        expectedCursor: "cursor-1",
        nextCursor: "cursor-2",
        fetchedAt: "2026-08-13T12:00:30.000Z",
        leaseExpiresAt: "2026-08-13T12:01:30.000Z",
        releaseClaim: false,
        changes: [change, { ...change, fieldId: "field-2" }],
      }),
    ).resolves.toEqual({ kind: "advanced", claim: expect.objectContaining({ rowVersion: 4 }) });
    expect(db.statements).toHaveLength(4);
    expect(db.statements[0]?.sql).toContain("INSERT INTO airtable_inbound_changes");
    expect(db.statements[0]?.sql).toContain("ON CONFLICT");
    expect(db.statements[0]?.sql).toContain("row_version = ? AND next_cursor = ?");
    expect(db.statements[2]?.sql).toContain("UPDATE airtable_webhook_cursors");
  });

  it("reports lease loss when the batched cursor CAS returns no row", async () => {
    const db = new Database([{}], [{ changes: 0 }]);
    await expect(
      new D1AirtableWebhookCursorStore(db).advancePage({
        registrationId: "registration-1",
        claimToken: "stale",
        expectedRowVersion: 2,
        expectedCursor: "cursor-0",
        nextCursor: "cursor-1",
        fetchedAt: "2026-08-13T12:00:00.000Z",
        leaseExpiresAt: null,
        releaseClaim: true,
        changes: [],
      }),
    ).resolves.toEqual({ kind: "lease_lost" });
  });

  it("marks retention gaps and releases claims by token/version CAS", async () => {
    const db = new Database([{ changes: 1 }, { changes: 1 }]);
    const store = new D1AirtableWebhookCursorStore(db);
    await expect(
      store.markRetentionGap({
        registrationId: "registration-1",
        claimToken: "token-1",
        expectedRowVersion: 3,
        expectedCursor: "cursor-1",
        recoveryCursor: "cursor-current",
        detectedAt: "2026-08-13T12:02:00.000Z",
      }),
    ).resolves.toBe(true);
    await expect(
      store.releaseClaim({
        registrationId: "registration-1",
        claimToken: "token-2",
        expectedRowVersion: 4,
      }),
    ).resolves.toBe(true);
    expect(db.statements[0]?.sql).toContain("reconciliation_required = 1");
    expect(db.statements[0]?.sql).toContain("next_cursor = COALESCE(?, next_cursor)");
    expect(db.statements[1]?.sql).toContain("claim_token = ? AND row_version = ?");
  });
});

describe("D1AirtableInboundChangeStore", () => {
  it("claims due, retry, or expired work deterministically and increments attempts", async () => {
    const db = new Database([{ first: changeRow }]);
    const store = new D1AirtableInboundChangeStore(db);
    await expect(
      store.claimNext({
        claimOwner: "worker-1",
        claimToken: "token-1",
        claimedAt: "2026-08-13T12:00:00.000Z",
        leaseExpiresAt: "2026-08-13T12:01:00.000Z",
      }),
    ).resolves.toEqual({
      id: "change-1",
      organizationId: "organization-1",
      connectionId: "connection-1",
      registrationId: "registration-1",
      baseTransactionNumber: 42,
      tableId: "table-1",
      recordId: "record-1",
      fieldId: "field-1",
      entityType: "session",
      applicationId: "session-1",
      sourceValueJson: '"Title"',
      sourceHash: "hash-1",
      attemptCount: 2,
      claimToken: "token-1",
    });
    expect(db.statements[0]?.sql).toContain("state IN ('pending', 'retry')");
    expect(db.statements[0]?.sql).toContain("state = 'claimed' AND lease_expires_at <= ?");
    expect(db.statements[0]?.sql).toContain("ORDER BY available_at, created_at, id");
  });

  it("loads enabled projection and record mapping columns from migration 0013", async () => {
    const db = new Database([
      {
        first: {
          connection_id: "connection-1",
          table_id: "table-1",
          entity_type: "session",
          inbound_fields_json: '["title"]',
        },
      },
      {
        first: {
          id: "mapping-1",
          connection_id: "connection-1",
          table_id: "table-1",
          record_id: "record-1",
          entity_type: "session",
          application_id: "session-1",
          last_exported_version: 7,
          last_exported_hash: "export",
          last_observed_hash: null,
          mapping_version: 3,
        },
      },
    ]);
    const store = new D1AirtableInboundChangeStore(db);
    await expect(
      store.findEnabledProjection({ connectionId: "connection-1", tableId: "table-1" }),
    ).resolves.toEqual({
      connectionId: "connection-1",
      tableId: "table-1",
      entityType: "session",
      inboundFieldIds: ["title"],
    });
    await expect(
      store.findRecordMapping({
        connectionId: "connection-1",
        tableId: "table-1",
        recordId: "record-1",
      }),
    ).resolves.toEqual(expect.objectContaining({ id: "mapping-1", mappingVersion: 3 }));
  });

  it("completes retry/dead claims by token and mapping completions by version CAS", async () => {
    const retryDb = new Database([{ changes: 1 }]);
    await expect(
      new D1AirtableInboundChangeStore(retryDb).complete({
        changeId: "change-1",
        claimToken: "token-1",
        state: "retry",
        updatedAt: "failed",
        completedAt: null,
        availableAt: "later",
        lastError: "temporary",
        observedHash: null,
        mappingId: null,
        expectedMappingVersion: null,
        resultingD1Version: null,
      }),
    ).resolves.toBe(true);
    expect(retryDb.statements[0]?.sql).toContain("state = 'claimed' AND claim_token = ?");

    const mappedDb = new Database([{}, {}], [{ changes: 1 }, { changes: 1 }]);
    await expect(
      new D1AirtableInboundChangeStore(mappedDb).complete({
        changeId: "change-1",
        claimToken: "token-1",
        state: "applied",
        updatedAt: "done",
        completedAt: "done",
        availableAt: null,
        lastError: null,
        observedHash: "hash-1",
        mappingId: "mapping-1",
        expectedMappingVersion: 3,
        resultingD1Version: 8,
      }),
    ).resolves.toBe(true);
    expect(mappedDb.statements[0]?.sql).toContain("mapping_version = mapping_version + 1");
    expect(mappedDb.statements[1]?.sql).toContain("AND changes() = 1");
  });

  it("coalesces an open conflict and completes the owned claim in one batch", async () => {
    const db = new Database(
      [{}, {}, {}],
      [{ changes: 1 }, { changes: 1, rows: [{ id: "conflict-existing" }] }, { changes: 1 }],
    );
    const result = await new D1AirtableInboundChangeStore(db).createConflict({
      conflictId: "conflict-new",
      changeId: "change-1",
      claimToken: "token-1",
      organizationId: "organization-1",
      connectionId: "connection-1",
      entityType: "session",
      applicationId: "session-1",
      fieldId: "title",
      sourceTransaction: 42,
      d1Version: 8,
      d1ValueJson: '"D1"',
      airtableValueJson: '"Airtable"',
      detectedAt: "detected",
      mappingId: "mapping-1",
      expectedMappingVersion: 3,
      observedHash: "hash-1",
    });
    expect(result).toEqual({ kind: "recorded", conflictId: "conflict-existing" });
    expect(db.statements[1]?.sql).toContain(
      "ON CONFLICT(connection_id, entity_type, application_id, field_id)",
    );
    expect(db.statements[1]?.sql).toContain("WHERE airtable_sync_conflicts.status = 'open'");
    expect(db.statements[2]?.sql).toContain("state = 'conflict'");
    expect(db.statements[2]?.sql).toContain("claim_token = ?");
  });
});
