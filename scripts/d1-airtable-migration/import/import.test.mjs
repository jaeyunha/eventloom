import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseImportArguments, runImportCli } from "./import.mjs";
import {
  buildBatchSql,
  createImportPlan,
  createWranglerD1Adapter,
  D1ImportError,
  executeImportPlan,
  validateImportPlan,
  validateInventoryManifest,
} from "./import-lib.mjs";

function manifest(records) {
  return {
    format: "open-sessionboard.airtable-inventory",
    version: 1,
    tables: [{ id: "tblEvents", name: "Events", records }],
  };
}

const mapping = {
  tblEvents: {
    table: "events",
    mapRecord: (record) => ({
      id: record.applicationId,
      organizationId: record.organizationId,
      bodyJson: JSON.stringify(record.raw.fields),
    }),
  },
};

test("creates a deterministic dependency-ready import plan", () => {
  const plan = createImportPlan(
    manifest([
      {
        applicationId: "event-2",
        scope: { organizationId: "org-1", eventId: "event-2" },
        airtableRecordId: "rec-2",
        raw: { id: "rec-2", fields: { Name: "Two" } },
        rawSha256: "hash-2",
      },
      {
        applicationId: "event-1",
        scope: { organizationId: "org-1", eventId: "event-1" },
        airtableRecordId: "rec-1",
        raw: { id: "rec-1", fields: { Name: "One" } },
        rawSha256: "hash-1",
      },
    ]),
    mapping,
  );
  assert.deepEqual(
    plan.operations.map((operation) => operation.targetId),
    ["event-1", "event-2"],
  );
  assert.equal(plan.quarantine.length, 0);
  assert.equal(plan.operations[0].sourceHash, "hash-1");
});

test("uses exporter scope and Airtable record identifiers", () => {
  const result = validateInventoryManifest(
    manifest([
      {
        applicationId: "event-1",
        scope: { organizationId: "org-1", eventId: "event-1" },
        airtableRecordId: "rec-exported",
        raw: { fields: {} },
        rawSha256: "exported-hash",
      },
    ]),
  );
  assert.deepEqual(result.records[0], {
    tableId: "tblEvents",
    tableName: "Events",
    applicationId: "event-1",
    organizationId: "org-1",
    eventId: "event-1",
    recordId: "rec-exported",
    raw: { fields: {} },
    rawHash: "exported-hash",
  });
});

test("quarantines duplicate and invalid source records", () => {
  const result = validateInventoryManifest(
    manifest([
      {
        applicationId: "event-1",
        scope: { organizationId: "org-1" },
        airtableRecordId: "rec-1",
        raw: {},
      },
      {
        applicationId: "event-1",
        scope: { organizationId: "org-1" },
        airtableRecordId: "rec-2",
        raw: {},
      },
      {
        applicationId: "",
        scope: { organizationId: "org-1" },
        airtableRecordId: "rec-3",
        raw: {},
      },
      {
        applicationId: "event-4",
        scope: { organizationId: null },
        airtableRecordId: "rec-4",
        raw: {},
      },
    ]),
  );
  assert.deepEqual(
    result.quarantine.map((item) => item.reason),
    ["DUPLICATE_APPLICATION_ID", "MISSING_APPLICATION_ID", "MISSING_ORGANIZATION_SCOPE"],
  );
});

test("preserves exporter quarantine for strict plan rejection", async () => {
  const exported = manifest([]);
  exported.tables[0].quarantine = [
    { airtableRecordId: "rec-bad", reason: "MISSING_APPLICATION_ID" },
  ];
  const plan = createImportPlan(exported, mapping);
  assert.deepEqual(plan.quarantine, [
    { tableId: "tblEvents", recordId: "rec-bad", reason: "MISSING_APPLICATION_ID" },
  ]);
  const directory = await mkdtemp(join(tmpdir(), "d1-import-"));
  await assert.rejects(
    executeImportPlan({
      adapter: { applyBatch: async () => assert.fail("must not write") },
      checkpointPath: join(directory, "checkpoint.json"),
      plan,
    }),
    (error) => error.code === "QUARANTINED_ROWS",
  );
});

test("resumes after an interrupted batch without reapplying completed operations", async () => {
  const directory = await mkdtemp(join(tmpdir(), "d1-import-"));
  const checkpointPath = join(directory, "checkpoint.json");
  const plan = createImportPlan(
    manifest(
      ["event-1", "event-2", "event-3"].map((id) => ({
        applicationId: id,
        scope: { organizationId: "org-1", eventId: id },
        airtableRecordId: `rec-${id}`,
        raw: { fields: { Name: id } },
      })),
    ),
    mapping,
  );
  const applied = [];
  let batches = 0;
  await assert.rejects(
    executeImportPlan({
      adapter: { applyBatch: async (batch) => applied.push(...batch.map((item) => item.targetId)) },
      checkpointPath,
      plan,
      batchSize: 1,
      onBatchCompleted: async () => {
        batches += 1;
        if (batches === 2) throw new Error("interrupted");
      },
    }),
  );
  const checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
  assert.equal(checkpoint.nextIndex, 2);
  const resumed = [];
  const result = await executeImportPlan({
    adapter: { applyBatch: async (batch) => resumed.push(...batch.map((item) => item.targetId)) },
    checkpointPath,
    plan,
    batchSize: 1,
  });
  assert.deepEqual(resumed, ["event-3"]);
  assert.equal(result.applied, 3);
});

test("refuses quarantined plans before adapter writes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "d1-import-"));
  let writes = 0;
  await assert.rejects(
    executeImportPlan({
      adapter: { applyBatch: async () => (writes += 1) },
      checkpointPath: join(directory, "checkpoint.json"),
      plan: { ...createImportPlan(manifest([]), mapping), quarantine: [{ reason: "INVALID" }] },
    }),
    (error) => error instanceof D1ImportError && error.code === "QUARANTINED_ROWS",
  );
  assert.equal(writes, 0);
});

test("validates supported entities and exact target ids", () => {
  const plan = createImportPlan(
    manifest([
      {
        applicationId: "event-1",
        scope: { organizationId: "org-1" },
        airtableRecordId: "rec-1",
        raw: { fields: { name: "One" } },
      },
    ]),
    mapping,
  );
  assert.throws(
    () =>
      validateImportPlan({
        ...plan,
        operations: [{ ...plan.operations[0], targetTable: "users" }],
      }),
    (error) => error.code === "UNSUPPORTED_ENTITY_TYPE",
  );
  assert.throws(
    () =>
      validateImportPlan({ ...plan, operations: [{ ...plan.operations[0], targetId: "other" }] }),
    (error) => error.code === "INVALID_IMPORT_PLAN",
  );
});

test("builds convergent atomic batch SQL with escaped values", () => {
  const sql = buildBatchSql(
    [
      {
        targetTable: "events",
        targetId: "event-1",
        row: { id: "event-1", name: "O'Brien", version: 2, venue: null },
      },
    ],
    new Map([
      ["events", { columns: new Set(["id", "name", "version", "venue"]), primaryKey: ["id"] }],
    ]),
  );
  assert.match(sql, /^PRAGMA foreign_keys = ON;/);
  assert.match(sql, /VALUES \('event-1', 'O''Brien', NULL, 2\)/);
  assert.match(sql, /ON CONFLICT \(id\) DO UPDATE SET name = excluded.name/);
});

test("uses table-specific primary keys for upserts", () => {
  const sql = buildBatchSql(
    [
      {
        targetTable: "organizations",
        targetId: "org-1",
        row: { organization_id: "org-1", name: "Acme" },
      },
    ],
    new Map([
      [
        "organizations",
        {
          columns: new Set(["organization_id", "name"]),
          primaryKey: ["organization_id"],
        },
      ],
    ]),
  );
  assert.match(sql, /ON CONFLICT \(organization_id\) DO UPDATE SET name = excluded.name/);
});

test("fails schema preflight before the first apply batch", async () => {
  const calls = [];
  const adapter = createWranglerD1Adapter(
    { database: "DB", target: "local", wrangler: "wrangler" },
    {
      execute: async (_command, arguments_) => {
        calls.push(arguments_);
        return {
          exitCode: 0,
          stdout: JSON.stringify([
            {
              success: true,
              results: [
                { name: "organization_id", pk: 0 },
                { name: "id", pk: 1 },
              ],
            },
          ]),
        };
      },
    },
  );
  const directory = await mkdtemp(join(tmpdir(), "d1-import-"));
  await assert.rejects(
    executeImportPlan({
      adapter,
      checkpointPath: join(directory, "checkpoint.json"),
      plan: {
        format: "open-sessionboard.d1-import-plan",
        version: 1,
        sourceManifestHash: "hash",
        operations: [
          {
            sourceKey: "tblOrganizations:org-1",
            targetTable: "organizations",
            targetId: "org-1",
            sourceHash: "hash",
            row: { organization_id: "org-1", name: "Acme" },
          },
        ],
        quarantine: [],
      },
    }),
    (error) => error.code === "D1_SCHEMA_UNSUPPORTED",
  );
  assert.equal(calls.length, 1);
  assert.match(calls[0][4], /^PRAGMA table_info/);
});

test("Wrangler adapter uses local or remote execute without exposing stderr", async () => {
  const calls = [];
  const adapter = createWranglerD1Adapter(
    { database: "DB", target: "remote", wrangler: "wrangler" },
    {
      execute: async (command, arguments_) => {
        calls.push({ command, arguments_ });
        return arguments_.includes("PRAGMA table_info(events)")
          ? {
              exitCode: 0,
              stdout: JSON.stringify([{ success: true, results: [{ name: "id", pk: 1 }] }]),
            }
          : { exitCode: 0, stdout: JSON.stringify([{ success: true, results: [] }]) };
      },
    },
  );
  await adapter.applyBatch([{ targetTable: "events", targetId: "e", row: { id: "e" } }]);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.arguments_.includes("--remote")));
  assert.ok(calls.every((call) => call.arguments_.includes("--json")));
});

test("parses dry-run defaults and rejects unsafe argument combinations", () => {
  assert.deepEqual(parseImportArguments(["--plan", "plan.json"]), {
    help: false,
    mode: "dry-run",
    target: "local",
    batchSize: 100,
    wrangler: "wrangler",
    plan: "plan.json",
  });
  assert.throws(
    () => parseImportArguments(["--plan", "plan.json", "--apply"]),
    (error) => error.code === "ARGUMENT_ERROR",
  );
  assert.throws(
    () => parseImportArguments(["--plan", "plan.json", "--local", "--remote"]),
    (error) => error.code === "ARGUMENT_ERROR",
  );
});

test("CLI dry-run validates a plan and never invokes Wrangler", async () => {
  const directory = await mkdtemp(join(tmpdir(), "d1-import-"));
  const path = join(directory, "plan.json");
  await writeFile(path, JSON.stringify(createImportPlan(manifest([]), mapping)));
  let calls = 0;
  let output = "";
  const exitCode = await runImportCli({
    arguments: ["--plan", path],
    stdout: { write: (chunk) => (output += chunk) },
    stderr: { write: () => {} },
    execute: async () => (calls += 1),
  });
  assert.equal(exitCode, 0);
  assert.equal(calls, 0);
  assert.equal(JSON.parse(output).format, "open-sessionboard.d1-import-plan");
});

test("CLI plan input honors explicit quarantine allowance", async () => {
  const directory = await mkdtemp(join(tmpdir(), "d1-import-"));
  const path = join(directory, "plan.json");
  const plan = {
    ...createImportPlan(manifest([]), mapping),
    quarantine: [{ reason: "LEGACY_DUPLICATE_PROJECTION" }],
  };
  await writeFile(path, JSON.stringify(plan));
  let output = "";
  const exitCode = await runImportCli({
    arguments: ["--plan", path, "--allow-quarantine"],
    stdout: { write: (chunk) => (output += chunk) },
    stderr: { write: () => {} },
    execute: async () => {
      throw new Error("Wrangler must not run during dry-run.");
    },
  });
  assert.equal(exitCode, 0);
  assert.equal(JSON.parse(output).quarantine.length, 1);
});

test("repeating a completed import performs no adapter writes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "d1-import-"));
  const checkpointPath = join(directory, "checkpoint.json");
  const plan = createImportPlan(
    manifest([
      {
        applicationId: "event-1",
        scope: { organizationId: "org-1", eventId: "event-1" },
        airtableRecordId: "rec-1",
        raw: { fields: { Name: "One" } },
      },
    ]),
    mapping,
  );
  let writes = 0;
  const adapter = {
    applyBatch: async () => {
      writes += 1;
    },
  };
  await executeImportPlan({ adapter, checkpointPath, plan });
  await executeImportPlan({ adapter, checkpointPath, plan });
  assert.equal(writes, 1);
});
