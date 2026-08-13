import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";

const MANIFEST_FORMAT = "open-sessionboard.airtable-inventory";

export class D1ImportError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "D1ImportError";
    this.code = code;
    this.details = details;
  }
}

export function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function validateInventoryManifest(manifest) {
  if (manifest?.format !== MANIFEST_FORMAT || manifest.version !== 1) {
    throw new D1ImportError("INVALID_MANIFEST", "Unsupported Airtable inventory manifest.");
  }
  if (!Array.isArray(manifest.tables)) {
    throw new D1ImportError("INVALID_MANIFEST", "Manifest tables must be an array.");
  }

  const seen = new Set();
  const quarantine = [];
  const records = [];
  for (const table of manifest.tables) {
    if (typeof table?.id !== "string" || !Array.isArray(table.records)) {
      throw new D1ImportError("INVALID_MANIFEST", "Every table requires an id and records.");
    }
    for (const record of table.records) {
      const applicationId = record?.applicationId;
      const key = `${table.id}:${applicationId}`;
      if (typeof applicationId !== "string" || applicationId.length === 0) {
        quarantine.push({
          tableId: table.id,
          recordId: record?.recordId,
          reason: "MISSING_APPLICATION_ID",
        });
        continue;
      }
      if (seen.has(key)) {
        quarantine.push({
          tableId: table.id,
          recordId: record?.recordId,
          reason: "DUPLICATE_APPLICATION_ID",
        });
        continue;
      }
      seen.add(key);
      if (record.organizationId === null || record.organizationId === undefined) {
        quarantine.push({
          tableId: table.id,
          recordId: record?.recordId,
          reason: "MISSING_ORGANIZATION_SCOPE",
        });
        continue;
      }
      records.push({
        tableId: table.id,
        tableName: table.name,
        applicationId,
        organizationId: record.organizationId,
        eventId: record.eventId ?? null,
        recordId: record.recordId,
        raw: record.raw,
        rawHash: record.rawHash ?? sha256(canonicalJson(record.raw)),
      });
    }
  }
  return { quarantine, records };
}

export function createImportPlan(manifest, mapping) {
  const { quarantine, records } = validateInventoryManifest(manifest);
  const operations = [];
  for (const record of records) {
    const target = mapping[record.tableId] ?? mapping[record.tableName];
    if (target === undefined) {
      quarantine.push({
        tableId: record.tableId,
        recordId: record.recordId,
        reason: "UNMAPPED_TABLE",
      });
      continue;
    }
    const row = target.mapRecord(record);
    if (row === null) {
      quarantine.push({
        tableId: record.tableId,
        recordId: record.recordId,
        reason: "MAPPING_REJECTED",
      });
      continue;
    }
    operations.push({
      sourceKey: `${record.tableId}:${record.applicationId}`,
      targetTable: target.table,
      targetId: row.id ?? record.applicationId,
      sourceHash: record.rawHash,
      row,
    });
  }
  operations.sort((left, right) =>
    `${left.targetTable}:${left.targetId}`.localeCompare(`${right.targetTable}:${right.targetId}`),
  );
  return {
    format: "open-sessionboard.d1-import-plan",
    version: 1,
    sourceManifestHash: sha256(canonicalJson(manifest)),
    operations,
    quarantine,
  };
}

async function writeJsonAtomically(path, value) {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${canonicalJson(value)}\n`, "utf8");
  await rename(temporaryPath, path);
}

export async function executeImportPlan({
  adapter,
  checkpointPath,
  plan,
  batchSize = 100,
  onBatchCompleted = () => {},
}) {
  let checkpoint = { planHash: sha256(canonicalJson(plan)), nextIndex: 0, applied: 0 };
  try {
    checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const expectedHash = sha256(canonicalJson(plan));
  if (checkpoint.planHash !== expectedHash) {
    throw new D1ImportError(
      "CHECKPOINT_MISMATCH",
      "Checkpoint belongs to a different import plan.",
    );
  }

  for (let index = checkpoint.nextIndex; index < plan.operations.length; index += batchSize) {
    const batch = plan.operations.slice(index, index + batchSize);
    await adapter.applyBatch(batch);
    checkpoint = {
      planHash: expectedHash,
      nextIndex: index + batch.length,
      applied: index + batch.length,
    };
    await writeJsonAtomically(checkpointPath, checkpoint);
    await onBatchCompleted(checkpoint);
  }
  return { ...checkpoint, quarantined: plan.quarantine.length };
}
