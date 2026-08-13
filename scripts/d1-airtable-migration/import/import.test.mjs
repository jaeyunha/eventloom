import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createImportPlan, executeImportPlan, validateInventoryManifest } from "./import-lib.mjs";

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
        organizationId: "org-1",
        eventId: "event-2",
        recordId: "rec-2",
        raw: { id: "rec-2", fields: { Name: "Two" } },
      },
      {
        applicationId: "event-1",
        organizationId: "org-1",
        eventId: "event-1",
        recordId: "rec-1",
        raw: { id: "rec-1", fields: { Name: "One" } },
      },
    ]),
    mapping,
  );
  assert.deepEqual(
    plan.operations.map((operation) => operation.targetId),
    ["event-1", "event-2"],
  );
  assert.equal(plan.quarantine.length, 0);
});

test("quarantines duplicate and invalid source records", () => {
  const result = validateInventoryManifest(
    manifest([
      { applicationId: "event-1", organizationId: "org-1", recordId: "rec-1", raw: {} },
      { applicationId: "event-1", organizationId: "org-1", recordId: "rec-2", raw: {} },
      { applicationId: "", organizationId: "org-1", recordId: "rec-3", raw: {} },
      { applicationId: "event-4", organizationId: null, recordId: "rec-4", raw: {} },
    ]),
  );
  assert.deepEqual(
    result.quarantine.map((item) => item.reason),
    ["DUPLICATE_APPLICATION_ID", "MISSING_APPLICATION_ID", "MISSING_ORGANIZATION_SCOPE"],
  );
});

test("resumes after an interrupted batch without reapplying completed operations", async () => {
  const directory = await mkdtemp(join(tmpdir(), "d1-import-"));
  const checkpointPath = join(directory, "checkpoint.json");
  const plan = createImportPlan(
    manifest(
      ["event-1", "event-2", "event-3"].map((id) => ({
        applicationId: id,
        organizationId: "org-1",
        eventId: id,
        recordId: `rec-${id}`,
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

test("repeating a completed import performs no adapter writes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "d1-import-"));
  const checkpointPath = join(directory, "checkpoint.json");
  const plan = createImportPlan(
    manifest([
      {
        applicationId: "event-1",
        organizationId: "org-1",
        eventId: "event-1",
        recordId: "rec-1",
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
