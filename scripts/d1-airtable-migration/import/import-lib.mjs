import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";

const MANIFEST_FORMAT = "open-sessionboard.airtable-inventory";
const PLAN_FORMAT = "open-sessionboard.d1-import-plan";
const PLAN_VERSION = 1;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/u;

export const ENTITY_PRIMARY_KEYS = Object.freeze({
  agenda_drafts: Object.freeze(["organization_id", "event_id"]),
  agenda_entries: Object.freeze([
    "organization_id",
    "event_id",
    "container_type",
    "container_id",
    "id",
  ]),
  agenda_entry_tracks: Object.freeze([
    "organization_id",
    "event_id",
    "container_type",
    "container_id",
    "entry_id",
    "track_id",
  ]),
  agenda_outbox_events: Object.freeze(["id"]),
  agenda_revisions: Object.freeze(["id"]),
  agenda_states: Object.freeze(["organization_id", "event_id"]),
  airtable_connections: Object.freeze(["id"]),
  airtable_record_mappings: Object.freeze(["id"]),
  audit_events: Object.freeze(["sequence"]),
  cfp_form_fields: Object.freeze(["organization_id", "form_id", "id"]),
  cfp_form_rules: Object.freeze(["organization_id", "form_id", "id"]),
  cfp_form_sections: Object.freeze(["organization_id", "form_id", "id"]),
  cfp_forms: Object.freeze(["id"]),
  crm_contact_tags: Object.freeze(["organization_id", "contact_id", "tag"]),
  crm_contacts: Object.freeze(["id"]),
  evaluation_decision_transitions: Object.freeze(["organization_id", "decision_id", "ordinal"]),
  evaluation_decisions: Object.freeze(["id"]),
  event_embed_configurations: Object.freeze(["id"]),
  events: Object.freeze(["id"]),
  formats: Object.freeze(["id"]),
  levels: Object.freeze(["id"]),
  organizations: Object.freeze(["organization_id"]),
  participants: Object.freeze(["id"]),
  review_criteria: Object.freeze([
    "organization_id",
    "plan_id",
    "rubric_id",
    "rubric_revision",
    "id",
  ]),
  review_criterion_options: Object.freeze([
    "organization_id",
    "plan_id",
    "rubric_id",
    "rubric_revision",
    "criterion_id",
    "id",
  ]),
  review_plans: Object.freeze(["id"]),
  review_rounds: Object.freeze(["organization_id", "plan_id", "id", "revision"]),
  review_rubrics: Object.freeze(["organization_id", "plan_id", "id", "revision"]),
  reviewer_pool_members: Object.freeze(["organization_id", "event_id", "pool_id", "reviewer_id"]),
  reviewer_pools: Object.freeze(["id"]),
  rooms: Object.freeze(["id"]),
  session_history: Object.freeze(["id"]),
  session_resources: Object.freeze(["organization_id", "event_id", "session_id", "resource_id"]),
  session_settings: Object.freeze(["id"]),
  session_speakers: Object.freeze(["organization_id", "event_id", "session_id", "speaker_id"]),
  session_statuses: Object.freeze(["id"]),
  session_tracks: Object.freeze(["organization_id", "event_id", "session_id", "track_id"]),
  sessions: Object.freeze(["id"]),
  speaker_profiles: Object.freeze(["id"]),
  submission_answers: Object.freeze(["organization_id", "submission_id", "field_key"]),
  submission_participants: Object.freeze(["organization_id", "submission_id", "participant_id"]),
  submission_secondary_contacts: Object.freeze(["organization_id", "submission_id", "id"]),
  submission_versions: Object.freeze(["organization_id", "submission_id", "version"]),
  submissions: Object.freeze(["id"]),
  tags: Object.freeze(["id"]),
  tracks: Object.freeze(["id"]),
});

export const SUPPORTED_ENTITY_TYPES = Object.freeze(Object.keys(ENTITY_PRIMARY_KEYS));
const SUPPORTED_ENTITY_TYPE_SET = new Set(SUPPORTED_ENTITY_TYPES);

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
    if (table.quarantine !== undefined && !Array.isArray(table.quarantine)) {
      throw new D1ImportError("INVALID_MANIFEST", "Table quarantine must be an array.");
    }
    if (
      table.quarantineCount !== undefined &&
      (!Number.isInteger(table.quarantineCount) ||
        table.quarantineCount < 0 ||
        table.quarantineCount !== (table.quarantine?.length ?? 0))
    ) {
      throw new D1ImportError("INVALID_MANIFEST", "Table quarantine count is inconsistent.");
    }
    for (const item of table.quarantine ?? []) {
      quarantine.push({
        tableId: table.id,
        recordId: item?.airtableRecordId,
        reason: item?.reason ?? "EXPORTED_QUARANTINE",
      });
    }
    for (const record of table.records) {
      const applicationId = record?.applicationId;
      const key = `${table.id}:${applicationId}`;
      if (typeof applicationId !== "string" || applicationId.length === 0) {
        quarantine.push({
          tableId: table.id,
          recordId: record?.airtableRecordId,
          reason: "MISSING_APPLICATION_ID",
        });
        continue;
      }
      if (seen.has(key)) {
        quarantine.push({
          tableId: table.id,
          recordId: record?.airtableRecordId,
          reason: "DUPLICATE_APPLICATION_ID",
        });
        continue;
      }
      seen.add(key);
      if (record.scope?.organizationId === null || record.scope?.organizationId === undefined) {
        quarantine.push({
          tableId: table.id,
          recordId: record?.airtableRecordId,
          reason: "MISSING_ORGANIZATION_SCOPE",
        });
        continue;
      }
      records.push({
        tableId: table.id,
        tableName: table.name,
        applicationId,
        organizationId: record.scope.organizationId,
        eventId: record.scope.eventId ?? null,
        recordId: record.airtableRecordId,
        raw: record.raw,
        rawHash: record.rawSha256 ?? sha256(canonicalJson(record.raw)),
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
    const primaryKey = ENTITY_PRIMARY_KEYS[target.table];
    operations.push({
      sourceKey: `${record.tableId}:${record.applicationId}`,
      targetTable: target.table,
      targetId: (primaryKey?.length === 1 ? row[primaryKey[0]] : undefined) ?? record.applicationId,
      sourceHash: record.rawHash,
      row,
    });
  }
  operations.sort((left, right) =>
    `${left.targetTable}:${left.targetId}`.localeCompare(`${right.targetTable}:${right.targetId}`),
  );
  return {
    format: PLAN_FORMAT,
    version: PLAN_VERSION,
    sourceManifestHash: sha256(canonicalJson(manifest)),
    operations,
    quarantine,
  };
}

function fail(code, message, details) {
  throw new D1ImportError(code, message, details);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredText(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail("INVALID_IMPORT_PLAN", `${name} must be a nonempty string.`);
  }
  return value;
}

export function validateImportPlan(plan) {
  if (!isObject(plan) || plan.format !== PLAN_FORMAT || plan.version !== PLAN_VERSION) {
    fail("INVALID_IMPORT_PLAN", "Unsupported D1 import plan.");
  }
  requiredText(plan.sourceManifestHash, "sourceManifestHash");
  if (!Array.isArray(plan.operations) || !Array.isArray(plan.quarantine)) {
    fail("INVALID_IMPORT_PLAN", "Import plan operations and quarantine must be arrays.");
  }
  if (plan.quarantine.length > 0) {
    fail(
      "QUARANTINED_ROWS",
      `Import plan contains ${plan.quarantine.length} quarantined row(s); refusing to continue.`,
    );
  }

  const targets = new Set();
  for (const [index, operation] of plan.operations.entries()) {
    if (!isObject(operation))
      fail("INVALID_IMPORT_PLAN", `operations[${index}] must be an object.`);
    requiredText(operation.sourceKey, `operations[${index}].sourceKey`);
    const targetTable = requiredText(operation.targetTable, `operations[${index}].targetTable`);
    const targetId = requiredText(operation.targetId, `operations[${index}].targetId`);
    requiredText(operation.sourceHash, `operations[${index}].sourceHash`);
    if (!SUPPORTED_ENTITY_TYPE_SET.has(targetTable)) {
      fail("UNSUPPORTED_ENTITY_TYPE", `Import target ${targetTable} is not supported.`);
    }
    if (!isObject(operation.row)) {
      fail("INVALID_IMPORT_PLAN", `operations[${index}].row must be an object.`);
    }
    const primaryKey = ENTITY_PRIMARY_KEYS[targetTable];
    if (
      primaryKey.length === 1 &&
      primaryKey[0] !== "sequence" &&
      operation.row[primaryKey[0]] !== targetId
    ) {
      fail("INVALID_IMPORT_PLAN", `operations[${index}].row.${primaryKey[0]} must equal targetId.`);
    }
    for (const column of primaryKey) {
      if (column !== "sequence" && operation.row[column] === undefined) {
        fail("INVALID_IMPORT_PLAN", `operations[${index}].row.${column} is required.`);
      }
    }
    const targetKey = `${targetTable}:${targetId}`;
    if (targets.has(targetKey)) {
      fail("INVALID_IMPORT_PLAN", `Import plan contains duplicate target ${targetKey}.`);
    }
    targets.add(targetKey);
    for (const [column, value] of Object.entries(operation.row)) {
      if (!IDENTIFIER.test(column)) {
        fail("INVALID_IMPORT_PLAN", `Unsupported column name in ${targetKey}.`);
      }
      if (
        value !== null &&
        typeof value !== "string" &&
        typeof value !== "boolean" &&
        !(typeof value === "number" && Number.isFinite(value))
      ) {
        fail("INVALID_IMPORT_PLAN", `Unsupported value for ${targetKey}.${column}.`);
      }
    }
  }
  return plan;
}

function sqlValue(value) {
  if (value === null) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") return String(value);
  return `'${value.replaceAll("'", "''")}'`;
}

function validateTableSchema(table, schema) {
  if (!isObject(schema) || !(schema.columns instanceof Set) || !Array.isArray(schema.primaryKey)) {
    fail("D1_SCHEMA_UNSUPPORTED", `${table} schema metadata is invalid.`);
  }
  const expectedPrimaryKey = ENTITY_PRIMARY_KEYS[table];
  if (expectedPrimaryKey[0] === "sequence") {
    if (schema.primaryKey.length !== 1 || schema.primaryKey[0] !== "sequence") {
      fail("D1_SCHEMA_UNSUPPORTED", `${table} primary key must be (sequence).`);
    }
    return;
  }
  if (
    expectedPrimaryKey.length !== schema.primaryKey.length ||
    expectedPrimaryKey.some((column, index) => schema.primaryKey[index] !== column)
  ) {
    fail(
      "D1_SCHEMA_UNSUPPORTED",
      `${table} primary key must be (${expectedPrimaryKey.join(", ")}).`,
    );
  }
}

export function buildBatchSql(batch, schemas) {
  const statements = [];
  for (const operation of batch) {
    const columns = Object.keys(operation.row).sort((left, right) =>
      left.localeCompare(right, "en"),
    );
    const schema = schemas.get(operation.targetTable);
    validateTableSchema(operation.targetTable, schema);
    for (const column of columns) {
      if (!schema.columns.has(column)) {
        fail("D1_SCHEMA_UNSUPPORTED", `${operation.targetTable}.${column} does not exist.`);
      }
    }
    const primaryKey = ENTITY_PRIMARY_KEYS[operation.targetTable];
    const conflictKey = primaryKey[0] === "sequence" ? ["id"] : primaryKey;
    const updateColumns = columns.filter((column) => !conflictKey.includes(column));
    const conflictAction =
      updateColumns.length === 0
        ? "DO NOTHING"
        : `DO UPDATE SET ${updateColumns.map((column) => `${column} = excluded.${column}`).join(", ")}`;
    statements.push(
      `INSERT INTO ${operation.targetTable} (${columns.join(", ")}) VALUES (${columns
        .map((column) => sqlValue(operation.row[column]))
        .join(", ")}) ON CONFLICT (${conflictKey.join(", ")}) ${conflictAction};`,
    );
  }
  return `PRAGMA foreign_keys = ON;\n${statements.join("\n")}`;
}

function wranglerArguments(options, sql) {
  const arguments_ = ["d1", "execute", options.database, "--command", sql, "--json", "--yes"];
  arguments_.push(options.target === "remote" ? "--remote" : "--local");
  if (options.cwd !== undefined) arguments_.push("--cwd", options.cwd);
  if (options.config !== undefined) arguments_.push("--config", options.config);
  if (options.environment !== undefined) arguments_.push("--env", options.environment);
  if (options.persistTo !== undefined) arguments_.push("--persist-to", options.persistTo);
  return arguments_;
}

function parseD1Response(result) {
  if (!isObject(result) || result.exitCode !== 0) {
    fail("D1_EXECUTION_FAILED", "Wrangler D1 execution failed.");
  }
  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    fail("D1_RESPONSE_INVALID", "Wrangler returned invalid D1 JSON.");
  }
  if (!Array.isArray(payload) || payload.some((entry) => entry?.success === false)) {
    fail("D1_EXECUTION_FAILED", "D1 reported an unsuccessful query.");
  }
  return payload;
}

export function createWranglerD1Adapter(options, { execute } = {}) {
  if (typeof execute !== "function") fail("INVALID_ADAPTER", "A Wrangler executor is required.");
  const schemas = new Map();
  const run = async (sql) =>
    parseD1Response(await execute(options.wrangler, wranglerArguments(options, sql)));

  const prepare = async (operations) => {
    const tables = [...new Set(operations.map((operation) => operation.targetTable))];
    for (const table of tables) {
      if (schemas.has(table)) continue;
      const payload = await run(`PRAGMA table_info(${table})`);
      const columns = payload.flatMap((entry) =>
        Array.isArray(entry.results) ? entry.results : [],
      );
      const primaryKey = columns
        .filter((column) => Number.isInteger(column?.pk) && column.pk > 0)
        .sort((left, right) => left.pk - right.pk)
        .map((column) => column.name);
      const schema = { columns: new Set(columns.map((column) => column?.name)), primaryKey };
      validateTableSchema(table, schema);
      schemas.set(table, schema);
    }
  };
  return {
    prepare,
    async applyBatch(batch) {
      await prepare(batch);
      await run(buildBatchSql(batch, schemas));
    },
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
  allowQuarantine = false,
}) {
  if (allowQuarantine) validateImportPlan({ ...plan, quarantine: [] });
  else validateImportPlan(plan);
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    fail("INVALID_BATCH_SIZE", "batchSize must be a positive integer.");
  }
  let checkpoint = { planHash: sha256(canonicalJson(plan)), nextIndex: 0, applied: 0 };
  try {
    checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const expectedHash = sha256(canonicalJson(plan));
  if (
    !isObject(checkpoint) ||
    typeof checkpoint.planHash !== "string" ||
    !Number.isInteger(checkpoint.nextIndex) ||
    checkpoint.nextIndex < 0 ||
    checkpoint.nextIndex > plan.operations.length ||
    !Number.isInteger(checkpoint.applied) ||
    checkpoint.applied !== checkpoint.nextIndex
  ) {
    fail("INVALID_CHECKPOINT", "Import checkpoint is invalid.");
  }
  if (checkpoint.planHash !== expectedHash) {
    throw new D1ImportError(
      "CHECKPOINT_MISMATCH",
      "Checkpoint belongs to a different import plan.",
    );
  }

  if (checkpoint.nextIndex < plan.operations.length && typeof adapter.prepare === "function") {
    await adapter.prepare(plan.operations.slice(checkpoint.nextIndex));
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
