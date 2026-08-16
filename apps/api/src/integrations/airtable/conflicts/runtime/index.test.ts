import { describe, expect, it, vi } from "vitest";
import type { AirtableD1Database } from "../../d1/adapters";
import {
  AirtableConflictHttpProviderCommands,
  AllowlistedAirtableConflictDomainCommands,
  createAirtableConflictRuntime,
  D1AirtableConflictRecordBindingStore,
  UnsupportedAirtableConflictPathError,
} from "./index";

type Row = Record<string, unknown>;

class Statement {
  readonly values: unknown[] = [];

  constructor(
    readonly sql: string,
    private readonly result: {
      readonly first?: Row | null;
      readonly rows?: Row[];
      readonly changes?: number;
    },
  ) {}

  bind(...values: unknown[]) {
    this.values.push(...values);
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
    const statement = new Statement(sql, this.results[this.statements.length] ?? {});
    this.statements.push(statement);
    return statement;
  }

  async batch<T>() {
    return [] as { results?: T[]; meta?: { changes?: number } }[];
  }
}

const bindingRow: Row = {
  organization_id: "organization-1",
  connection_id: "connection-1",
  base_id: "base-1",
  credential_reference: "credential-1",
  table_id: "table-1",
  record_id: "record-1",
  field_mapping_json: JSON.stringify({ title: "field-title", description: "field-description" }),
  inbound_fields_json: JSON.stringify(["title"]),
};

const resolvingConflict: Row = {
  id: "conflict-1",
  organization_id: "organization-1",
  connection_id: "connection-1",
  entity_type: "session",
  application_id: "session-1",
  field_id: "title",
  source_transaction: 12,
  d1_version: 7,
  d1_value_json: '"D1 title"',
  airtable_value_json: '"Airtable title"',
  status: "resolving",
  resolution: "use_airtable",
  resolver_id: "user-1",
  detected_at: "2026-08-13T12:00:00.000Z",
  resolving_at: "2026-08-13T12:01:00.000Z",
  resolved_at: null,
  resolution_command_id: "command-1",
};

describe("AllowlistedAirtableConflictDomainCommands", () => {
  it("dispatches only an exact entity and inbound field path", async () => {
    const applyValue = vi.fn(async () => ({ kind: "applied" as const, version: 8 }));
    const commands = new AllowlistedAirtableConflictDomainCommands([
      { entityType: "session", fieldId: "title", applyValue },
    ]);

    await expect(
      commands.applyValue({
        commandId: "command-1",
        organizationId: "organization-1",
        entityType: "session",
        applicationId: "session-1",
        fieldId: "title",
        valueJson: '"Reviewed title"',
        expectedVersion: 7,
      }),
    ).resolves.toEqual({ kind: "applied", version: 8 });
    expect(applyValue).toHaveBeenCalledWith({
      commandId: "command-1",
      organizationId: "organization-1",
      applicationId: "session-1",
      valueJson: '"Reviewed title"',
      expectedVersion: 7,
    });

    await expect(
      commands.applyValue({
        commandId: "command-2",
        organizationId: "organization-1",
        entityType: "session",
        applicationId: "session-1",
        fieldId: "status",
        valueJson: '"Accepted"',
        expectedVersion: 7,
      }),
    ).rejects.toBeInstanceOf(UnsupportedAirtableConflictPathError);
    expect(applyValue).toHaveBeenCalledOnce();
  });
});

describe("D1AirtableConflictRecordBindingStore", () => {
  it("requires an organization-scoped connected mapping and resolves the Airtable field ID", async () => {
    const database = new Database([{ first: bindingRow }]);
    const store = new D1AirtableConflictRecordBindingStore(database);

    await expect(
      store.find({
        organizationId: "organization-1",
        connectionId: "connection-1",
        entityType: "session",
        applicationId: "session-1",
        fieldId: "title",
      }),
    ).resolves.toEqual({
      organizationId: "organization-1",
      connectionId: "connection-1",
      baseId: "base-1",
      credentialReference: "credential-1",
      tableId: "table-1",
      recordId: "record-1",
      airtableFieldId: "field-title",
    });

    expect(database.statements[0]?.sql).toContain("c.organization_id = ? AND c.id = ?");
    expect(database.statements[0]?.sql).toContain("c.status = 'connected'");
    expect(database.statements[0]?.sql).toContain("p.enabled = 1");
    expect(database.statements[0]?.sql).toContain("p.inbound_fields_json");
    expect(database.statements[0]?.sql).toContain("m.application_id = ?");
    expect(database.statements[0]?.values).toEqual([
      "organization-1",
      "connection-1",
      "session",
      "session-1",
    ]);
  });

  it("does not invent an Airtable field for an unsupported source path", async () => {
    const store = new D1AirtableConflictRecordBindingStore(new Database([{ first: bindingRow }]));
    await expect(
      store.find({
        organizationId: "organization-1",
        connectionId: "connection-1",
        entityType: "session",
        applicationId: "session-1",
        fieldId: "status",
      }),
    ).resolves.toBeNull();
  });
});

describe("AirtableConflictHttpProviderCommands", () => {
  it("patches the bound record with the mapped field and parsed JSON value", async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ id: "record-1" }), { status: 200 }),
    );
    const provider = new AirtableConflictHttpProviderCommands({
      bindings: {
        find: vi.fn(async () => ({
          organizationId: "organization-1",
          connectionId: "connection-1",
          baseId: "base/1",
          credentialReference: "credential-1",
          tableId: "table 1",
          recordId: "record-1",
          airtableFieldId: "field-title",
        })),
      },
      secrets: { get: vi.fn(async () => "access-token") },
      fetch: fetcher,
      apiOrigin: "https://airtable.example.test/",
    });

    await expect(
      provider.writeValue({
        commandId: "command-1",
        organizationId: "organization-1",
        connectionId: "connection-1",
        entityType: "session",
        applicationId: "session-1",
        fieldId: "title",
        valueJson: '"D1 title"',
      }),
    ).resolves.toEqual({ kind: "applied" });

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(
      "https://airtable.example.test/v0/base%2F1/table%201/record-1",
      {
        method: "PATCH",
        headers: {
          accept: "application/json",
          authorization: "Bearer access-token",
          "content-type": "application/json",
          "x-airtable-client-request-id": "command-1",
        },
        body: JSON.stringify({ fields: { "field-title": "D1 title" } }),
      },
    );
  });
});

describe("createAirtableConflictRuntime", () => {
  it("lists the active connection conflicts and forwards resolver, idempotency, and manual JSON", async () => {
    const listDatabase = new Database([
      {
        rows: [
          {
            ...resolvingConflict,
            status: "open",
            resolution: null,
            resolver_id: null,
            resolving_at: null,
            resolution_command_id: null,
          },
        ],
      },
    ]);
    const listRuntime = createAirtableConflictRuntime({
      database: listDatabase,
      connectionForOrganization: vi.fn(async () => ({ id: "connection-1" })),
      domainBindings: [],
      secrets: { get: vi.fn(async () => "access-token") },
    });

    await expect(listRuntime.listConflicts("organization-1")).resolves.toEqual([
      expect.objectContaining({ id: "conflict-1", status: "open" }),
    ]);
    expect(listDatabase.statements[0]?.values).toEqual(["organization-1", "connection-1"]);

    const applyValue = vi.fn(async () => ({ kind: "applied" as const, version: 8 }));
    const resolveDatabase = new Database([
      { first: { ...resolvingConflict, resolution: "manual" } },
      { changes: 1 },
    ]);
    const resolveRuntime = createAirtableConflictRuntime({
      database: resolveDatabase,
      connectionForOrganization: vi.fn(async () => ({ id: "connection-1" })),
      domainBindings: [{ entityType: "session", fieldId: "title", applyValue }],
      secrets: { get: vi.fn(async () => "access-token") },
      now: () => new Date("2026-08-13T12:01:00.000Z"),
    });

    await expect(
      resolveRuntime.resolveConflict("organization-1", "conflict-1", {
        resolution: "manual",
        resolverId: "user-1",
        commandId: "command-1",
        manualValue: { valueJson: '"Reviewed title"' },
      }),
    ).resolves.toEqual({
      kind: "resolved",
      conflictId: "conflict-1",
      resolution: "manual",
    });
    expect(applyValue).toHaveBeenCalledWith({
      commandId: "command-1",
      organizationId: "organization-1",
      applicationId: "session-1",
      valueJson: '"Reviewed title"',
      expectedVersion: 7,
    });
    expect(resolveDatabase.statements[0]?.values).toEqual([
      "manual",
      "user-1",
      "2026-08-13T12:01:00.000Z",
      "command-1",
      "conflict-1",
      "organization-1",
      "command-1",
    ]);
  });

  it("reopens rather than resolves when the entity/path has no registered domain command", async () => {
    const database = new Database([{ first: resolvingConflict }, { changes: 1 }]);
    const runtime = createAirtableConflictRuntime({
      database,
      connectionForOrganization: vi.fn(async () => ({ id: "connection-1" })),
      domainBindings: [],
      secrets: { get: vi.fn(async () => "access-token") },
      now: () => new Date("2026-08-13T12:01:00.000Z"),
    });

    await expect(
      runtime.resolveConflict("organization-1", "conflict-1", {
        resolution: "use_airtable",
        resolverId: "user-1",
        commandId: "command-1",
      }),
    ).rejects.toBeInstanceOf(UnsupportedAirtableConflictPathError);
    expect(database.statements).toHaveLength(2);
    expect(database.statements[1]?.sql).toContain("status = 'open'");
    expect(database.statements[1]?.sql).toContain("resolution_command_id = NULL");
  });
});
