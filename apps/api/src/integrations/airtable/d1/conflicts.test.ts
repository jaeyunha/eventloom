import { describe, expect, it } from "vitest";
import type { AirtableD1Database } from "./adapters";
import { D1AirtableConflictStore } from "./conflicts";

type Row = Record<string, unknown>;

class Statement {
  values: (string | number | null)[] = [];

  constructor(
    readonly sql: string,
    private readonly result: { first?: Row | null; rows?: Row[]; changes?: number },
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

  constructor(private readonly results: Statement["result"][]) {}

  prepare(sql: string) {
    const result = this.results[this.statements.length] ?? {};
    const statement = new Statement(sql, result);
    this.statements.push(statement);
    return statement;
  }

  async batch<T>() {
    return [] as { results?: T[]; meta?: { changes?: number } }[];
  }
}

const openRow: Row = {
  id: "conflict-1",
  organization_id: "organization-1",
  connection_id: "connection-1",
  entity_type: "session",
  application_id: "session-1",
  field_id: "title",
  source_transaction: 42,
  d1_version: 7,
  d1_value_json: '"D1 title"',
  airtable_value_json: '"Airtable title"',
  status: "open",
  resolution: null,
  resolver_id: null,
  detected_at: "2026-01-02T03:00:00.000Z",
  resolving_at: null,
  resolved_at: null,
  resolution_command_id: null,
};

const resolvingRow: Row = {
  ...openRow,
  status: "resolving",
  resolution: "use_airtable",
  resolver_id: "user-1",
  resolving_at: "2026-01-02T03:04:05.000Z",
  resolution_command_id: "command-1",
};

const beginInput = {
  conflictId: "conflict-1",
  organizationId: "organization-1",
  resolution: "use_airtable" as const,
  resolverId: "user-1",
  commandId: "command-1",
  resolvingAt: "2026-01-02T03:04:05.000Z",
};

describe("D1AirtableConflictStore", () => {
  it("claims an open conflict with organization scope and command uniqueness", async () => {
    const db = new Database([{ first: resolvingRow }]);
    const store = new D1AirtableConflictStore(db);

    await expect(store.beginResolution(beginInput)).resolves.toEqual({
      kind: "started",
      conflict: {
        id: "conflict-1",
        organizationId: "organization-1",
        connectionId: "connection-1",
        entityType: "session",
        applicationId: "session-1",
        fieldId: "title",
        sourceTransaction: 42,
        d1Version: 7,
        d1ValueJson: '"D1 title"',
        airtableValueJson: '"Airtable title"',
        status: "resolving",
        resolution: "use_airtable",
        resolverId: "user-1",
        resolutionCommandId: "command-1",
      },
    });

    expect(db.statements[0]?.sql).toContain("status = 'open'");
    expect(db.statements[0]?.sql).toContain("organization_id = ?");
    expect(db.statements[0]?.sql).toContain("NOT EXISTS");
    expect(db.statements[0]?.sql).toContain("resolution_command_id = ?");
    expect(db.statements[0]?.values).toEqual([
      "use_airtable",
      "user-1",
      "2026-01-02T03:04:05.000Z",
      "command-1",
      "conflict-1",
      "organization-1",
      "command-1",
    ]);
  });

  it("returns an idempotent replay after a failed claim", async () => {
    const db = new Database([{ first: null }, { first: resolvingRow }]);
    const store = new D1AirtableConflictStore(db);

    await expect(store.beginResolution(beginInput)).resolves.toEqual({
      kind: "replay",
      conflict: expect.objectContaining({
        id: "conflict-1",
        status: "resolving",
        resolutionCommandId: "command-1",
      }),
    });
    expect(db.statements).toHaveLength(2);
  });

  it("distinguishes command reuse from a competing resolution", async () => {
    const existing = {
      ...resolvingRow,
      resolver_id: "user-2",
      resolution_command_id: "other-command",
    };
    const reusedDb = new Database([
      { first: null },
      { first: existing },
      { first: { id: "conflict-2" } },
    ]);

    await expect(
      new D1AirtableConflictStore(reusedDb).beginResolution(beginInput),
    ).resolves.toEqual({
      kind: "command_reused",
    });

    const competingDb = new Database([{ first: null }, { first: existing }, { first: null }]);
    await expect(
      new D1AirtableConflictStore(competingDb).beginResolution(beginInput),
    ).resolves.toEqual({
      kind: "already_resolving",
      conflict: expect.objectContaining({ resolutionCommandId: "other-command" }),
    });
  });

  it("completes and reopens only the matching organization-scoped claim", async () => {
    const db = new Database([{ changes: 1 }, { changes: 1 }]);
    const store = new D1AirtableConflictStore(db);

    await expect(
      store.completeResolution({
        conflictId: "conflict-1",
        organizationId: "organization-1",
        commandId: "command-1",
        resolvedAt: "2026-01-02T03:05:00.000Z",
      }),
    ).resolves.toBe(true);
    await expect(
      store.reopenResolution({
        conflictId: "conflict-1",
        organizationId: "organization-1",
        commandId: "command-1",
      }),
    ).resolves.toBe(true);

    expect(db.statements[0]?.sql).toContain("status = 'resolving'");
    expect(db.statements[0]?.sql).toContain("resolution_command_id = ?");
    expect(db.statements[1]?.sql).toContain("resolution = NULL");
    expect(db.statements[1]?.sql).toContain("resolver_id = NULL");
    expect(db.statements[1]?.sql).toContain("resolution_command_id = NULL");
  });

  it("lists unresolved conflicts for the exact organization and connection in stable UI order", async () => {
    const resolvedRow = {
      ...resolvingRow,
      id: "conflict-2",
      status: "resolved",
      resolved_at: "2026-01-02T03:06:00.000Z",
      detected_at: "2026-01-02T03:05:00.000Z",
    };
    const db = new Database([{ rows: [resolvedRow, openRow] }]);
    const store = new D1AirtableConflictStore(db);

    await expect(
      store.listByOrganizationAndConnection({
        organizationId: "organization-1",
        connectionId: "connection-1",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "conflict-2",
        status: "resolved",
        detectedAt: "2026-01-02T03:05:00.000Z",
        resolvingAt: "2026-01-02T03:04:05.000Z",
        resolvedAt: "2026-01-02T03:06:00.000Z",
      }),
      expect.objectContaining({
        id: "conflict-1",
        status: "open",
        detectedAt: "2026-01-02T03:00:00.000Z",
        resolvingAt: null,
        resolvedAt: null,
      }),
    ]);

    expect(db.statements[0]?.sql).toContain("organization_id = ? AND connection_id = ?");
    expect(db.statements[0]?.sql).toContain("status IN ('open', 'resolving')");
    expect(db.statements[0]?.sql).toContain("ORDER BY detected_at DESC, id ASC");
    expect(db.statements[0]?.values).toEqual(["organization-1", "connection-1"]);
  });
});
