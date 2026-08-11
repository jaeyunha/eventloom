#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ENVIRONMENTS,
  ORGANIZATION_ID_MIGRATION,
  PreflightError,
  parseDotEnv,
  parseWranglerInventory,
} from "./preflight-lib.mjs";

const MAX_PAGES = 100;
const PAGE_SIZE = 100;
const MAX_COUNT = 10_000;
const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
const AIRTABLE_API = "https://api.airtable.com/v0";
const SCOPE_FIELD_NAMES = new Set(["organizationid", "tenantid"]);
const TEXT_FIELD_TYPES = new Set([
  "singleLineText",
  "multilineText",
  "richText",
  "email",
  "url",
  "phoneNumber",
  "date",
  "dateTime",
  "singleSelect",
  "multipleSelects",
]);
const D1_REFERENCE_COLUMNS = new Map([
  ["idempotency_records", new Set(["scope", "request_digest", "response_json"])],
  ["outbox_jobs", new Set(["id", "deduplication_key", "payload_json"])],
  ["private_uploads", new Set(["scan_result_code"])],
  ["organizations", new Set(["slug", "name"])],
]);
const AIRTABLE_REFERENCE_FIELDS = new Map([
  ["Organizations", new Set(["Application ID", "Slug"])],
  ["Events", new Set(["Settings JSON"])],
  ["CFP Forms", new Set(["Fields JSON"])],
  ["Submissions", new Set(["Answers JSON"])],
  ["Review Plans", new Set(["Rounds JSON"])],
  ["Decisions", new Set(["Metadata JSON"])],
  ["Sessions", new Set(["Metadata JSON"])],
  ["Rooms", new Set(["Settings JSON"])],
  ["Tracks", new Set(["Metadata JSON", "Settings JSON"])],
  ["Audit Records", new Set(["Changes JSON"])],
  ["Published Speaker Projections", new Set(["Projection JSON"])],
  ["Formats", new Set(["Settings JSON"])],
  ["Session Settings", new Set(["Settings JSON"])],
  ["Session Roster", new Set(["Members JSON"])],
  ["File Assets", new Set(["Settings JSON"])],
  ["Email Templates", new Set(["Settings JSON"])],
  ["Email Send Snapshots", new Set(["Data JSON"])],
]);

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const defaultWranglerPath = join(repositoryRoot, "apps/api/wrangler.toml");

export class OrganizationMigrationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OrganizationMigrationError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new OrganizationMigrationError(code, message);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function boundedCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0) return 0;
  return Math.min(Math.trunc(count), MAX_COUNT);
}

function countWasTruncated(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > MAX_COUNT;
}
function addBoundedCount(container, key, delta) {
  container[key] = boundedCount((container[key] ?? 0) + delta);
}

function normalizeFieldName(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function quoteIdentifier(value) {
  const identifier = text(value);
  if (!identifier || identifier.includes("\0") || identifier.includes('"')) {
    fail("UNSAFE_IDENTIFIER", "A provider returned an unsafe resource identifier");
  }
  return `"${identifier}"`;
}

function addBlocker(report, code, message, details = {}) {
  report.blockers.push({ code, message, ...details });
}

function resourceNamespace(environment, configuration, wrangler) {
  if (!wrangler || typeof wrangler !== "object") {
    return { environment, missing: ["WRANGLER_INVENTORY"] };
  }
  const accountId = text(configuration?.CLOUDFLARE_ACCOUNT_ID) || text(wrangler?.accountId);
  const token = text(configuration?.CLOUDFLARE_API_TOKEN);
  const databaseId = text(configuration?.D1_DATABASE_ID) || text(wrangler?.databaseId);
  const databaseName = text(wrangler?.databaseName);
  const baseId = text(configuration?.AIRTABLE_BASE_ID);
  const airtableToken = text(configuration?.AIRTABLE_ACCESS_TOKEN);
  const bucketName = text(configuration?.R2_BUCKET_NAME) || text(wrangler?.bucketName);
  const queueName = text(configuration?.QUEUE_NAME) || text(wrangler?.queueName);
  const missing = [];
  for (const [key, value] of [
    ["CLOUDFLARE_ACCOUNT_ID", accountId],
    ["CLOUDFLARE_API_TOKEN", token],
    ["D1_DATABASE_ID", databaseId],
    ["AIRTABLE_BASE_ID", baseId],
    ["AIRTABLE_ACCESS_TOKEN", airtableToken],
    ["R2_BUCKET_NAME", bucketName],
    ["QUEUE_NAME", queueName],
  ]) {
    if (!value) missing.push(key);
  }
  if (missing.length > 0) {
    return { environment, missing };
  }
  for (const [configurationKey, wranglerKey] of [
    ["CLOUDFLARE_ACCOUNT_ID", "accountId"],
    ["D1_DATABASE_ID", "databaseId"],
    ["R2_BUCKET_NAME", "bucketName"],
    ["QUEUE_NAME", "queueName"],
  ]) {
    const configured = text(configuration?.[configurationKey]);
    const inventory = text(wrangler?.[wranglerKey]);
    if (configured && inventory && configured !== inventory) {
      return {
        environment,
        missing: [],
        mismatch: configurationKey,
      };
    }
  }
  return {
    environment,
    accountId,
    token,
    databaseId,
    databaseName,
    baseId,
    airtableToken,
    bucketName,
    queueName,
    deadLetterQueueName: `${queueName}-dlq`,
  };
}

function emptyReport() {
  return {
    sourceId: ORGANIZATION_ID_MIGRATION.sourceId,
    targetId: ORGANIZATION_ID_MIGRATION.targetId,
    mode: "dry-run",
    status: "blocked",
    readyForApply: false,
    namespaces: {
      d1: [],
      airtable: [],
      r2: [],
      queue: [],
    },
    counts: {
      d1: { sourceRows: 0, targetRows: 0, rewritableRows: 0 },
      airtable: { sourceRecords: 0, targetRecords: 0, rewritableRecords: 0 },
      r2: { legacyKeys: 0, targetCollisions: 0 },
      queue: { queues: 0, deadLetterQueues: 0, messages: null },
    },
    blockers: [],
    protectedBoundaries: [...ORGANIZATION_ID_MIGRATION.protectedBoundaries],
  };
}

async function providerJson(fetchImplementation, url, token, options = {}) {
  let response;
  try {
    response = await fetchImplementation(url, {
      ...options,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {}),
      },
    });
  } catch {
    fail("PROVIDER_UNREACHABLE", "A required provider did not return a response");
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }
  if (!response.ok || payload?.success === false) {
    fail("PROVIDER_REQUEST_FAILED", "A required provider rejected the migration inventory request");
  }
  return payload;
}

function d1Rows(payload) {
  const result = Array.isArray(payload?.result) ? payload.result[0] : payload?.result;
  return Array.isArray(result?.results) ? result.results : [];
}

function d1Meta(payload) {
  const result = Array.isArray(payload?.result) ? payload.result[0] : payload?.result;
  return result?.meta ?? {};
}

async function d1Query(namespace, sql, params, fetchImplementation) {
  const payload = await providerJson(
    fetchImplementation,
    `${CLOUDFLARE_API}/accounts/${encodeURIComponent(namespace.accountId)}/d1/database/${encodeURIComponent(namespace.databaseId)}/query`,
    namespace.token,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sql, params }),
    },
  );
  if (!Array.isArray(payload?.result) && !payload?.result) {
    fail("D1_INVENTORY_INCOMPLETE", "D1 returned no inspectable query result");
  }
  return payload;
}

function rowCount(rows) {
  const row = rows[0] ?? {};
  return row.count ?? row["COUNT(*)"] ?? row["count(*)"] ?? 0;
}

function hasLegacyValue(value) {
  return typeof value === "string" && value.includes(ORGANIZATION_ID_MIGRATION.sourceId);
}

function hasExactIdentity(value, identity) {
  if (typeof value === "string") return value === identity;
  if (Array.isArray(value)) return value.some((entry) => hasExactIdentity(entry, identity));
  if (value && typeof value === "object") {
    return Object.values(value).some((entry) => hasExactIdentity(entry, identity));
  }
  return false;
}
function replaceLegacyIdentity(value) {
  if (typeof value === "string") {
    return value.replaceAll(ORGANIZATION_ID_MIGRATION.sourceId, ORGANIZATION_ID_MIGRATION.targetId);
  }
  if (Array.isArray(value)) return value.map(replaceLegacyIdentity);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, replaceLegacyIdentity(entry)]),
    );
  }
  return value;
}

function declaredReferenceField(fieldsByTable, tableName, fieldName) {
  return fieldsByTable.get(tableName)?.has(fieldName) === true;
}

async function inspectD1(namespace, report, plan, fetchImplementation) {
  const namespaceReport = {
    environment: namespace.environment,
    databaseId: namespace.databaseId,
    databaseName: namespace.databaseName,
    tables: 0,
  };
  report.namespaces.d1.push(namespaceReport);
  const tablesPayload = await d1Query(
    namespace,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
    [],
    fetchImplementation,
  );
  const tables = d1Rows(tablesPayload);
  if (tables.length === 0) {
    addBlocker(report, "D1_INVENTORY_INCOMPLETE", "D1 returned no inspectable application tables", {
      environment: namespace.environment,
    });
    return;
  }
  for (const row of tables.slice(0, MAX_COUNT)) {
    const tableName = text(row.name);
    if (!tableName) {
      addBlocker(report, "D1_INVENTORY_INCOMPLETE", "D1 returned a table without a name", {
        environment: namespace.environment,
      });
      continue;
    }
    namespaceReport.tables += 1;
    if (tableName.includes(ORGANIZATION_ID_MIGRATION.sourceId)) {
      addBlocker(report, "LEGACY_D1_NAMESPACE", "D1 table namespace embeds the legacy identity", {
        environment: namespace.environment,
      });
    }
    const schemaPayload = await d1Query(
      namespace,
      `PRAGMA table_info(${quoteIdentifier(tableName)})`,
      [],
      fetchImplementation,
    );
    const columns = d1Rows(schemaPayload);
    if (columns.length === 0) {
      addBlocker(report, "D1_SCHEMA_INCOMPLETE", "D1 returned no inspectable columns for a table", {
        environment: namespace.environment,
      });
      continue;
    }
    const scopeColumns = columns.filter((column) =>
      SCOPE_FIELD_NAMES.has(normalizeFieldName(column.name)),
    );
    let tableHasSource = false;
    let tableHasTarget = false;
    for (const column of scopeColumns) {
      const columnName = text(column.name);
      const identifier = quoteIdentifier(columnName);
      const sourcePayload = await d1Query(
        namespace,
        `SELECT COUNT(*) AS count FROM ${quoteIdentifier(tableName)} WHERE ${identifier} = ?`,
        [ORGANIZATION_ID_MIGRATION.sourceId],
        fetchImplementation,
      );
      const targetPayload = await d1Query(
        namespace,
        `SELECT COUNT(*) AS count FROM ${quoteIdentifier(tableName)} WHERE ${identifier} = ?`,
        [ORGANIZATION_ID_MIGRATION.targetId],
        fetchImplementation,
      );
      const source = Number(rowCount(d1Rows(sourcePayload)));
      const target = Number(rowCount(d1Rows(targetPayload)));
      tableHasSource ||= source > 0;
      tableHasTarget ||= target > 0;
      addBoundedCount(report.counts.d1, "sourceRows", boundedCount(source));
      addBoundedCount(report.counts.d1, "targetRows", boundedCount(target));
      if (source > 0 && target > 0) {
        addBlocker(
          report,
          "D1_TARGET_COLLISION",
          "D1 contains both legacy and target identity rows in one tenant namespace",
          { environment: namespace.environment },
        );
      }
      if (source > 0) {
        plan.d1.push({
          namespace,
          tableName,
          columnName,
          count: boundedCount(source),
          truncated: countWasTruncated(source),
        });
        addBoundedCount(report.counts.d1, "rewritableRows", boundedCount(source));
      }
    }
    if (tableHasSource && tableHasTarget && scopeColumns.length > 1) {
      addBlocker(
        report,
        "D1_TARGET_COLLISION",
        "D1 contains legacy and target identity values across tenant columns",
        { environment: namespace.environment },
      );
    }
    for (const column of columns) {
      if (scopeColumns.includes(column)) continue;
      const columnName = text(column.name);
      const type = text(column.type).toUpperCase();
      if (
        !type ||
        (!type.includes("TEXT") &&
          !type.includes("CHAR") &&
          !type.includes("CLOB") &&
          !type.includes("JSON"))
      ) {
        continue;
      }
      const payload = await d1Query(
        namespace,
        `SELECT COUNT(*) AS count FROM ${quoteIdentifier(tableName)} WHERE ${quoteIdentifier(columnName)} LIKE ?`,
        [`%${ORGANIZATION_ID_MIGRATION.sourceId}%`],
        fetchImplementation,
      );
      const occurrences = Number(rowCount(d1Rows(payload)));
      if (occurrences > 0) {
        if (declaredReferenceField(D1_REFERENCE_COLUMNS, tableName, columnName)) {
          plan.d1.push({
            namespace,
            tableName,
            columnName,
            count: boundedCount(occurrences),
            truncated: countWasTruncated(occurrences),
            replace: true,
          });
          addBoundedCount(report.counts.d1, "rewritableRows", boundedCount(occurrences));
        } else {
          addBlocker(
            report,
            "UNSUPPORTED_D1_IDENTITY_REFERENCE",
            "D1 contains a legacy identity reference outside a declared tenant column",
            {
              environment: namespace.environment,
              tableName,
              columnName,
              count: boundedCount(occurrences),
            },
          );
        }
      }
    }
  }
  if (tables.length > MAX_COUNT) {
    addBlocker(report, "D1_INVENTORY_INCOMPLETE", "D1 table inventory exceeded the bounded scan", {
      environment: namespace.environment,
    });
  }
}

function airtableRecords(payload) {
  return Array.isArray(payload?.records) ? payload.records : [];
}

async function airtableGet(namespace, path, fetchImplementation, query = "") {
  const separator = query ? "?" : "";
  return providerJson(
    fetchImplementation,
    `${AIRTABLE_API}${path}${separator}${query}`,
    namespace.airtableToken,
  );
}

async function inspectAirtable(namespace, report, plan, fetchImplementation) {
  const namespaceReport = {
    environment: namespace.environment,
    baseId: namespace.baseId,
    tables: 0,
  };
  report.namespaces.airtable.push(namespaceReport);
  let namespaceSourceRecords = 0;
  let namespaceTargetRecords = 0;
  const metadata = await airtableGet(
    namespace,
    `/meta/bases/${encodeURIComponent(namespace.baseId)}/tables`,
    fetchImplementation,
  );
  const tables = Array.isArray(metadata?.tables) ? metadata.tables : [];
  if (tables.length === 0) {
    addBlocker(report, "AIRTABLE_INVENTORY_INCOMPLETE", "Airtable returned no inspectable tables", {
      environment: namespace.environment,
    });
    return;
  }
  for (const table of tables.slice(0, MAX_COUNT)) {
    const tableId = text(table.id);
    const tableName = text(table.name);
    const fields = Array.isArray(table.fields) ? table.fields : [];
    if (!tableId || !tableName || fields.length === 0) {
      addBlocker(
        report,
        "AIRTABLE_SCHEMA_INCOMPLETE",
        "Airtable returned an incomplete table schema",
        {
          environment: namespace.environment,
        },
      );
      continue;
    }
    namespaceReport.tables += 1;
    const scopeFields = fields.filter((field) =>
      SCOPE_FIELD_NAMES.has(normalizeFieldName(field.name)),
    );
    let offset = "";
    let pageCount = 0;
    do {
      const query = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
      if (offset) query.set("offset", offset);
      let payload;
      try {
        payload = await airtableGet(
          namespace,
          `/${encodeURIComponent(namespace.baseId)}/${encodeURIComponent(tableId)}`,
          fetchImplementation,
          query.toString(),
        );
      } catch (error) {
        addBlocker(
          report,
          error.code ?? "AIRTABLE_INVENTORY_INCOMPLETE",
          "Airtable records could not be completely inventoried",
          { environment: namespace.environment },
        );
        break;
      }
      const records = airtableRecords(payload);
      for (const record of records) {
        const values = record?.fields && typeof record.fields === "object" ? record.fields : {};
        for (const field of fields) {
          const fieldName = text(field.name);
          const value = values[fieldName];
          if (value === undefined) continue;
          const isScope = scopeFields.includes(field);
          if (isScope && typeof value === "string") {
            if (value === ORGANIZATION_ID_MIGRATION.sourceId) {
              addBoundedCount(report.counts.airtable, "sourceRecords", 1);
              namespaceSourceRecords += 1;
              if (!TEXT_FIELD_TYPES.has(text(field.type))) {
                addBlocker(
                  report,
                  "AIRTABLE_SCOPE_FIELD_READ_ONLY",
                  "Airtable legacy identity is stored in a non-writable field",
                  { environment: namespace.environment },
                );
              } else {
                const recordId = text(record.id);
                if (!recordId) {
                  addBlocker(
                    report,
                    "AIRTABLE_RECORD_INCOMPLETE",
                    "Airtable returned a legacy record without a stable ID",
                    { environment: namespace.environment },
                  );
                  continue;
                }
                plan.airtable.push({
                  namespace,
                  tableId,
                  tableName,
                  recordId,
                  fieldName,
                });
                addBoundedCount(report.counts.airtable, "rewritableRecords", 1);
              }
            } else if (value === ORGANIZATION_ID_MIGRATION.targetId) {
              addBoundedCount(report.counts.airtable, "targetRecords", 1);
              namespaceTargetRecords += 1;
            }
            continue;
          }
          if (
            hasLegacyValue(value) ||
            hasExactIdentity(value, ORGANIZATION_ID_MIGRATION.sourceId)
          ) {
            if (declaredReferenceField(AIRTABLE_REFERENCE_FIELDS, tableName, fieldName)) {
              const recordId = text(record.id);
              if (!recordId) {
                addBlocker(
                  report,
                  "AIRTABLE_RECORD_INCOMPLETE",
                  "Airtable returned a legacy reference without a stable ID",
                  { environment: namespace.environment, tableName, fieldName },
                );
              } else {
                plan.airtable.push({
                  namespace,
                  tableId,
                  tableName,
                  recordId,
                  fieldName,
                  replacement: replaceLegacyIdentity(value),
                });
                addBoundedCount(report.counts.airtable, "rewritableRecords", 1);
              }
            } else {
              addBlocker(
                report,
                "UNSUPPORTED_AIRTABLE_IDENTITY_REFERENCE",
                "Airtable contains a legacy identity reference outside a declared tenant field",
                {
                  environment: namespace.environment,
                  tableName,
                  fieldName,
                },
              );
            }
          }
        }
      }
      offset = text(payload?.offset);
      pageCount += 1;
      if (pageCount >= MAX_PAGES && offset) {
        addBlocker(
          report,
          "AIRTABLE_INVENTORY_INCOMPLETE",
          "Airtable record inventory exceeded the bounded scan",
          { environment: namespace.environment },
        );
        break;
      }
    } while (offset);
  }
  if (tables.length > MAX_COUNT) {
    addBlocker(
      report,
      "AIRTABLE_INVENTORY_INCOMPLETE",
      "Airtable table inventory exceeded the bounded scan",
      {
        environment: namespace.environment,
      },
    );
  }
  if (namespaceSourceRecords > 0 && namespaceTargetRecords > 0) {
    addBlocker(
      report,
      "AIRTABLE_TARGET_COLLISION",
      "Airtable contains both legacy and target identity records",
      { environment: namespace.environment },
    );
  }
}

async function inspectR2(namespace, report, fetchImplementation) {
  const namespaceReport = {
    environment: namespace.environment,
    bucketName: namespace.bucketName,
    objectInventoryComplete: true,
  };
  report.namespaces.r2.push(namespaceReport);
  let namespaceLegacyKeys = 0;
  let namespaceTargetCollisions = 0;
  const keys = new Set();
  let cursor = "";
  let pageCount = 0;
  do {
    const query = new URLSearchParams({ limit: "1000" });
    if (cursor) query.set("cursor", cursor);
    let payload;
    try {
      payload = await providerJson(
        fetchImplementation,
        `${CLOUDFLARE_API}/accounts/${encodeURIComponent(namespace.accountId)}/r2/buckets/${encodeURIComponent(namespace.bucketName)}/objects?${query.toString()}`,
        namespace.token,
      );
    } catch (error) {
      namespaceReport.objectInventoryComplete = false;
      addBlocker(
        report,
        error.code ?? "R2_INVENTORY_INCOMPLETE",
        "R2 object key inventory could not be completed",
        { environment: namespace.environment },
      );
      break;
    }
    const result = payload?.result ?? {};
    const objects = Array.isArray(result) ? result : result.objects;
    if (!Array.isArray(objects)) {
      namespaceReport.objectInventoryComplete = false;
      addBlocker(report, "R2_INVENTORY_INCOMPLETE", "R2 returned no inspectable object list", {
        environment: namespace.environment,
      });
      break;
    }
    for (const object of objects) {
      const key = text(object?.key);
      if (!key) {
        namespaceReport.objectInventoryComplete = false;
        addBlocker(report, "R2_INVENTORY_INCOMPLETE", "R2 returned an object without a key", {
          environment: namespace.environment,
        });
        continue;
      }
      keys.add(key);
      if (key.includes(ORGANIZATION_ID_MIGRATION.sourceId)) {
        addBoundedCount(report.counts.r2, "legacyKeys", 1);
        namespaceLegacyKeys += 1;
      }
    }
    cursor = text(result?.cursor ?? payload?.cursor);
    pageCount += 1;
    if (pageCount >= MAX_PAGES && cursor) {
      namespaceReport.objectInventoryComplete = false;
      addBlocker(
        report,
        "R2_INVENTORY_INCOMPLETE",
        "R2 object inventory exceeded the bounded scan",
        {
          environment: namespace.environment,
        },
      );
      break;
    }
  } while (cursor);
  for (const key of keys) {
    if (!key.includes(ORGANIZATION_ID_MIGRATION.sourceId)) continue;
    const targetKey = key.replaceAll(
      ORGANIZATION_ID_MIGRATION.sourceId,
      ORGANIZATION_ID_MIGRATION.targetId,
    );
    if (keys.has(targetKey)) {
      addBoundedCount(report.counts.r2, "targetCollisions", 1);
      namespaceTargetCollisions += 1;
    }
  }
  if (namespaceLegacyKeys > 0) {
    addBlocker(
      report,
      "R2_OBJECT_KEY_REWRITE_REQUIRED",
      "R2 contains legacy identity object keys that cannot be rewritten safely by this tool",
      { environment: namespace.environment, count: boundedCount(namespaceLegacyKeys) },
    );
  }
  if (namespaceTargetCollisions > 0) {
    addBlocker(
      report,
      "R2_TARGET_COLLISION",
      "R2 contains target object keys that would collide with legacy keys",
      { environment: namespace.environment, count: boundedCount(namespaceTargetCollisions) },
    );
  }
}

async function inspectQueue(namespace, report, fetchImplementation, queuesDrained) {
  const namespaceReport = {
    environment: namespace.environment,
    queueName: namespace.queueName,
    deadLetterQueueName: namespace.deadLetterQueueName,
    messagesInspectable: false,
    drainConfirmed: queuesDrained,
  };
  report.namespaces.queue.push(namespaceReport);
  try {
    const payload = await providerJson(
      fetchImplementation,
      `${CLOUDFLARE_API}/accounts/${encodeURIComponent(namespace.accountId)}/queues?name=${encodeURIComponent(namespace.queueName)}`,
      namespace.token,
    );
    const result = Array.isArray(payload?.result) ? payload.result : payload?.result?.queues;
    const queues = Array.isArray(result) ? result : [];
    const names = new Set(queues.map((queue) => text(queue?.queue_name ?? queue?.name)));
    if (!names.has(namespace.queueName)) {
      addBlocker(
        report,
        "QUEUE_NAMESPACE_MISMATCH",
        "Cloudflare did not return the configured queue",
        {
          environment: namespace.environment,
        },
      );
    } else {
      report.counts.queue.queues += 1;
    }
    if (names.has(namespace.deadLetterQueueName)) report.counts.queue.deadLetterQueues += 1;
  } catch (error) {
    addBlocker(
      report,
      error.code ?? "QUEUE_INVENTORY_INCOMPLETE",
      "Queue namespace inventory could not be completed",
      { environment: namespace.environment },
    );
  }
  if (queuesDrained) {
    report.counts.queue.messages = 0;
  } else {
    addBlocker(
      report,
      "QUEUE_PAYLOADS_UNINSPECTABLE",
      "Queue messages cannot be inspected or safely rewritten through the management API",
      { environment: namespace.environment },
    );
  }
}

function assertNoNamespaceCollisions(report) {
  for (const [kind, namespaces] of Object.entries(report.namespaces)) {
    const seen = new Map();
    for (const namespace of namespaces) {
      const value =
        namespace.databaseId ?? namespace.baseId ?? namespace.bucketName ?? namespace.queueName;
      if (!value) continue;
      const prior = seen.get(value);
      if (prior && prior !== namespace.environment) {
        addBlocker(
          report,
          "NAMESPACE_COLLISION",
          `${kind} namespace is shared across environments`,
        );
      } else {
        seen.set(value, namespace.environment);
      }
    }
  }
}

export async function inspectOrganizationIdMigration({
  configurations = {},
  wranglerInventory = {},
  environments = ENVIRONMENTS,
  fetchImplementation = fetch,
  queuesDrained = false,
} = {}) {
  const report = emptyReport();
  const plan = { d1: [], airtable: [] };
  for (const environment of environments) {
    if (!ENVIRONMENTS.includes(environment)) {
      addBlocker(report, "INVALID_ENVIRONMENT", "Migration environment is unsupported");
      continue;
    }
    for (const key of [
      "ORGANIZATION_ID",
      "NEXT_PUBLIC_ORGANIZATION_ID",
      "ORGANIZER_AUTOJOIN_ORGANIZATION_ID",
      "EVAL_ORGANIZATION_ID",
    ]) {
      const value = text(configurations[environment]?.[key]);
      if (!value) continue;
      if (value === ORGANIZATION_ID_MIGRATION.sourceId) {
        addBlocker(
          report,
          "LEGACY_ORGANIZATION_ID_CONFIGURATION",
          `${environment} still declares the legacy organization identity`,
          { environment, key },
        );
      } else if (value !== ORGANIZATION_ID_MIGRATION.targetId) {
        addBlocker(
          report,
          "AMBIGUOUS_ORGANIZATION_ID_CONFIGURATION",
          `${environment} declares an unsupported organization identity`,
          { environment, key },
        );
      }
    }
    const namespace = resourceNamespace(
      environment,
      configurations[environment],
      wranglerInventory[environment],
    );
    if (namespace.missing?.length > 0) {
      addBlocker(
        report,
        "MIGRATION_CONFIGURATION_INCOMPLETE",
        `${environment} migration configuration is incomplete`,
        {
          environment,
        },
      );
      continue;
    }
    if (namespace.mismatch) {
      addBlocker(
        report,
        "MIGRATION_CONFIGURATION_MISMATCH",
        `${environment} migration configuration disagrees with Wrangler`,
        {
          environment,
        },
      );
      continue;
    }
    try {
      await inspectD1(namespace, report, plan, fetchImplementation);
    } catch (error) {
      addBlocker(
        report,
        error.code ?? "D1_INVENTORY_INCOMPLETE",
        "D1 namespace inventory could not be completed",
        {
          environment,
        },
      );
    }
    try {
      await inspectAirtable(namespace, report, plan, fetchImplementation);
    } catch (error) {
      addBlocker(
        report,
        error.code ?? "AIRTABLE_INVENTORY_INCOMPLETE",
        "Airtable namespace inventory could not be completed",
        {
          environment,
        },
      );
    }
    try {
      await inspectR2(namespace, report, fetchImplementation);
    } catch (error) {
      addBlocker(
        report,
        error.code ?? "R2_INVENTORY_INCOMPLETE",
        "R2 namespace inventory could not be completed",
        {
          environment,
        },
      );
    }
    try {
      await inspectQueue(namespace, report, fetchImplementation, queuesDrained);
    } catch (error) {
      addBlocker(
        report,
        error.code ?? "QUEUE_INVENTORY_INCOMPLETE",
        "Queue namespace inventory could not be completed",
        {
          environment,
        },
      );
    }
  }
  assertNoNamespaceCollisions(report);
  if (report.blockers.length === 0) {
    report.status = "ready";
    report.readyForApply = true;
  }
  Object.defineProperty(report, "plan", { value: plan, enumerable: false });
  return report;
}

async function applyD1Operations(plan, fetchImplementation) {
  let rows = 0;
  for (const operation of plan.d1) {
    if (operation.truncated)
      fail("D1_OPERATION_UNBOUNDED", "D1 rewrite count exceeded the bounded limit");
    const identifier = quoteIdentifier(operation.columnName);
    const payload = await d1Query(
      operation.namespace,
      operation.replace === true
        ? `UPDATE ${quoteIdentifier(operation.tableName)} SET ${identifier} = REPLACE(${identifier}, ?, ?) WHERE ${identifier} LIKE ?`
        : `UPDATE ${quoteIdentifier(operation.tableName)} SET ${identifier} = ? WHERE ${identifier} = ?`,
      operation.replace === true
        ? [
            ORGANIZATION_ID_MIGRATION.sourceId,
            ORGANIZATION_ID_MIGRATION.targetId,
            `%${ORGANIZATION_ID_MIGRATION.sourceId}%`,
          ]
        : [ORGANIZATION_ID_MIGRATION.targetId, ORGANIZATION_ID_MIGRATION.sourceId],
      fetchImplementation,
    );
    rows += boundedCount(d1Meta(payload).changes ?? operation.count);
  }
  return rows;
}

async function applyAirtableOperations(plan, fetchImplementation) {
  let records = 0;
  for (const operation of plan.airtable) {
    if (!operation.recordId)
      fail("AIRTABLE_OPERATION_UNBOUNDED", "Airtable returned a record without an ID");
    await providerJson(
      fetchImplementation,
      `${AIRTABLE_API}/${encodeURIComponent(operation.namespace.baseId)}/${encodeURIComponent(operation.tableId)}/${encodeURIComponent(operation.recordId)}`,
      operation.namespace.airtableToken,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fields: {
            [operation.fieldName]: operation.replacement ?? ORGANIZATION_ID_MIGRATION.targetId,
          },
        }),
      },
    );
    records += 1;
  }
  return records;
}

export async function applyOrganizationIdMigration(
  report,
  { fetchImplementation = fetch, confirmation = "" } = {},
) {
  if (
    !report ||
    report.sourceId !== ORGANIZATION_ID_MIGRATION.sourceId ||
    report.targetId !== ORGANIZATION_ID_MIGRATION.targetId
  ) {
    fail(
      "INVALID_MIGRATION_REPORT",
      "Migration report does not match the approved identity change",
    );
  }
  if (confirmation !== ORGANIZATION_ID_MIGRATION.targetId) {
    fail(
      "APPLY_CONFIRMATION_REQUIRED",
      "Apply requires confirmation of the target organization identity",
    );
  }
  if (report.blockers.length > 0 || !report.readyForApply || !report.plan) {
    fail("MIGRATION_BLOCKED", "Migration has blocking preconditions; no changes were applied");
  }
  const applied = {
    d1Rows: await applyD1Operations(report.plan, fetchImplementation),
    airtableRecords: await applyAirtableOperations(report.plan, fetchImplementation),
  };
  return {
    ...report,
    mode: "apply",
    status: "applied",
    readyForApply: false,
    applied,
  };
}

export function parseMigrationArguments(argv) {
  const options = {
    apply: false,
    confirmation: "",
    environments: [...ENVIRONMENTS],
    environmentSources: {},
    wranglerPath: defaultWranglerPath,
    queuesDrained: false,
  };
  let requestedEnvironments = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") {
      options.apply = true;
    } else if (argument === "--confirm") {
      options.confirmation = text(argv[++index]);
    } else if (argument === "--environment") {
      const environment = text(argv[++index]);
      if (!ENVIRONMENTS.includes(environment))
        fail("INVALID_ARGUMENT", "Unknown migration environment");
      if (!requestedEnvironments) {
        options.environments = [];
        requestedEnvironments = true;
      }
      if (options.environments.includes(environment))
        fail("INVALID_ARGUMENT", "Duplicate migration environment");
      options.environments.push(environment);
    } else if (argument === "--env") {
      const assignment = text(argv[++index]);
      const separator = assignment.indexOf("=");
      if (separator < 1) fail("INVALID_ARGUMENT", "--env must be environment=path");
      const environment = assignment.slice(0, separator);
      const source = assignment.slice(separator + 1);
      if (!ENVIRONMENTS.includes(environment) || !source)
        fail("INVALID_ARGUMENT", "--env must name an environment and source");
      if (Object.hasOwn(options.environmentSources, environment))
        fail("INVALID_ARGUMENT", "Duplicate --env assignment");
      options.environmentSources[environment] = source;
    } else if (argument === "--wrangler") {
      options.wranglerPath = text(argv[++index]);
      if (!options.wranglerPath) fail("INVALID_ARGUMENT", "--wrangler requires a path");
    } else if (argument === "--dry-run") {
      options.apply = false;
    } else if (argument === "--confirm-queues-drained") {
      options.queuesDrained = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      fail("INVALID_ARGUMENT", "Unknown migration argument");
    }
  }
  if (options.help) return options;
  if (options.apply && options.confirmation !== ORGANIZATION_ID_MIGRATION.targetId) {
    fail("APPLY_CONFIRMATION_REQUIRED", "Apply requires --confirm ai-engineer");
  }
  for (const environment of options.environments) {
    if (!options.environmentSources[environment]) {
      fail("INVALID_ARGUMENT", `--env ${environment}=<path|-> is required`);
    }
  }
  return options;
}

function loadConfiguration(environment, source) {
  if (source === "-") return { ...process.env, APP_ENV: environment };
  try {
    return parseDotEnv(readFileSync(resolve(source), "utf8"));
  } catch (error) {
    if (error instanceof PreflightError) throw error;
    fail("ENV_FILE_UNREADABLE", `Could not read the ${environment} migration environment file`);
  }
}

function usage() {
  return [
    "Usage: node scripts/release/migrate-organization-id.mjs --env local=<path|-> --env staging=<path|-> --env production=<path|->",
    "  [--environment <local|staging|production>] [--wrangler <path>] [--dry-run]",
    "  --apply --confirm ai-engineer --confirm-queues-drained",
    "",
    "Dry-run is the default. Apply is refused unless every inspected boundary is complete and collision-free.",
  ].join("\n");
}

export async function runMigration({ options, fetchImplementation = fetch } = {}) {
  const configurations = Object.fromEntries(
    options.environments.map((environment) => [
      environment,
      loadConfiguration(environment, options.environmentSources[environment]),
    ]),
  );
  const wranglerSource = readFileSync(resolve(options.wranglerPath), "utf8");
  const fullInventory = parseWranglerInventory(wranglerSource);
  const wranglerInventory = Object.fromEntries(
    options.environments.map((environment) => [environment, fullInventory[environment]]),
  );
  const report = await inspectOrganizationIdMigration({
    configurations,
    wranglerInventory,
    environments: options.environments,
    fetchImplementation,
    queuesDrained: options.queuesDrained,
  });
  if (!options.apply) return report;
  return applyOrganizationIdMigration(report, {
    fetchImplementation,
    confirmation: options.confirmation,
  });
}

let invocationMode = "dry-run";
async function main() {
  const options = parseMigrationArguments(process.argv.slice(2));
  invocationMode = options.apply ? "apply" : "dry-run";
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const report = await runMigration({ options });
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (report.status === "blocked") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    const knownError =
      error instanceof OrganizationMigrationError || error instanceof PreflightError;
    process.stderr.write(
      `${JSON.stringify({
        sourceId: ORGANIZATION_ID_MIGRATION.sourceId,
        targetId: ORGANIZATION_ID_MIGRATION.targetId,
        mode: invocationMode,
        status: "blocked",
        readyForApply: false,
        blockers: [
          {
            code: knownError ? error.code : "UNEXPECTED_MIGRATION_FAILURE",
            message: knownError ? error.message : "Unexpected migration failure",
          },
        ],
      })}\n`,
    );
    process.exitCode = 1;
  }
}
