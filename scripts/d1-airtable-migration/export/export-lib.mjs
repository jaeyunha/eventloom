import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const MANIFEST_FORMAT = "open-sessionboard.airtable-inventory";
export const MANIFEST_VERSION = 1;
export const DEFAULT_API_ORIGIN = "https://api.airtable.com";
export const DEFAULT_OUTPUT = "airtable-inventory.json";
export const DEFAULT_APPLICATION_ID_FIELD = "Application ID";
export const DEFAULT_ORGANIZATION_ID_FIELD = "Organization ID";
export const DEFAULT_EVENT_ID_FIELD = "Event ID";

const CHECKPOINT_FORMAT = "open-sessionboard.airtable-inventory-checkpoint";
const CHECKPOINT_VERSION = 1;
const RECORD_PAGE_SIZE = 100;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;

export class AirtableExportError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "AirtableExportError";
    this.code = code;
  }
}

function fail(code, message, options) {
  throw new AirtableExportError(code, message, options);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredText(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail("CONFIGURATION_ERROR", `${name} is required.`);
  }
  return value.trim();
}

function optionalText(value, name) {
  if (value === undefined) return undefined;
  return requiredText(value, name);
}

function validateIdentifier(value, name) {
  const result = requiredText(value, name);
  if (!IDENTIFIER.test(result)) {
    fail("CONFIGURATION_ERROR", `${name} contains unsupported characters.`);
  }
  return result;
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right, "en"))
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function digest(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function normalizedTableConfiguration(value, index) {
  if (typeof value === "string") {
    return { selector: requiredText(value, `tables[${index}]`) };
  }
  if (!isObject(value)) fail("CONFIGURATION_ERROR", `tables[${index}] must be a string or object.`);
  const id = optionalText(value.id, `tables[${index}].id`);
  const name = optionalText(value.name, `tables[${index}].name`);
  if (id === undefined && name === undefined) {
    fail("CONFIGURATION_ERROR", `tables[${index}] requires id or name.`);
  }
  return {
    ...(id === undefined ? {} : { id }),
    ...(name === undefined ? {} : { name }),
    applicationIdField:
      optionalText(value.applicationIdField, `tables[${index}].applicationIdField`) ??
      DEFAULT_APPLICATION_ID_FIELD,
    organizationIdField:
      optionalText(value.organizationIdField, `tables[${index}].organizationIdField`) ??
      DEFAULT_ORGANIZATION_ID_FIELD,
    eventIdField:
      optionalText(value.eventIdField, `tables[${index}].eventIdField`) ?? DEFAULT_EVENT_ID_FIELD,
  };
}

export function readExportConfiguration(environment = process.env, fileConfiguration = {}) {
  if (!isObject(fileConfiguration))
    fail("CONFIGURATION_ERROR", "The configuration must be an object.");
  const accessToken = requiredText(
    fileConfiguration.accessToken ?? environment.AIRTABLE_ACCESS_TOKEN,
    "AIRTABLE_ACCESS_TOKEN",
  );
  const baseId = validateIdentifier(
    fileConfiguration.baseId ?? environment.AIRTABLE_BASE_ID,
    "AIRTABLE_BASE_ID",
  );
  const configuredTables = fileConfiguration.tables;
  if (configuredTables !== undefined && !Array.isArray(configuredTables)) {
    fail("CONFIGURATION_ERROR", "tables must be an array.");
  }
  return {
    accessToken,
    baseId,
    tables: configuredTables?.map(normalizedTableConfiguration),
  };
}

export function parseExportArguments(arguments_) {
  const options = {
    help: false,
    dryRun: false,
    resume: false,
    output: DEFAULT_OUTPUT,
    tables: [],
  };
  const takeValue = (argument, index) => {
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith("--"))
      fail("ARGUMENT_ERROR", `${argument} requires a value.`);
    return value;
  };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--resume") options.resume = true;
    else if (["--output", "--config", "--base-id", "--api-origin", "--table"].includes(argument)) {
      const value = takeValue(argument, index);
      index += 1;
      if (argument === "--output") options.output = value;
      else if (argument === "--config") options.config = value;
      else if (argument === "--base-id") options.baseId = value;
      else if (argument === "--api-origin") options.apiOrigin = value;
      else options.tables.push(value);
    } else fail("ARGUMENT_ERROR", `Unknown argument: ${argument}`);
  }
  return options;
}

export const HELP_TEXT = `Usage: node scripts/d1-airtable-migration/export/export.mjs [options]

Read every configured Airtable table and write a deterministic inventory manifest.
This command never writes to Airtable.

Options:
  --config <path>      JSON config with baseId and optional tables
  --base-id <id>       Override AIRTABLE_BASE_ID or config baseId
  --table <id|name>    Export one table; repeat to export multiple tables
  --output <path>      Manifest path (default: airtable-inventory.json)
  --api-origin <url>   Airtable API origin (for testing)
  --resume             Resume from <output>.checkpoint.json
  --dry-run            Validate config and print the planned read without network or files
  -h, --help           Show this help

Environment:
  AIRTABLE_ACCESS_TOKEN  Required read-only Airtable token
  AIRTABLE_BASE_ID       Required unless supplied by config or --base-id
`;

function safeApiOrigin(value) {
  const raw = value ?? DEFAULT_API_ORIGIN;
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail("CONFIGURATION_ERROR", "apiOrigin must be an absolute HTTP(S) URL.");
  }
  if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password) {
    fail("CONFIGURATION_ERROR", "apiOrigin must be an HTTP(S) origin without credentials.");
  }
  return url.origin;
}

async function airtableRequest({ fetchImplementation, accessToken, url, operation }) {
  let response;
  try {
    response = await fetchImplementation(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
  } catch (cause) {
    fail("AIRTABLE_REQUEST_FAILED", `Airtable ${operation} request failed.`, { cause });
  }
  let payload;
  try {
    payload = await response.json();
  } catch (cause) {
    fail("AIRTABLE_RESPONSE_INVALID", `Airtable returned invalid JSON for ${operation}.`, {
      cause,
    });
  }
  if (!response.ok) {
    const requestId = response.headers?.get?.("x-airtable-request-id");
    fail(
      "AIRTABLE_REQUEST_FAILED",
      `Airtable ${operation} request failed with HTTP ${response.status}${requestId ? ` (request ${requestId})` : ""}.`,
    );
  }
  if (!isObject(payload))
    fail("AIRTABLE_RESPONSE_INVALID", `Airtable returned invalid data for ${operation}.`);
  return payload;
}

function resolveTables(schemaTables, configuredTables) {
  if (!Array.isArray(schemaTables))
    fail("AIRTABLE_RESPONSE_INVALID", "Airtable schema has no tables array.");
  const tables = schemaTables.map((table) => {
    if (
      !isObject(table) ||
      typeof table.id !== "string" ||
      typeof table.name !== "string" ||
      !Array.isArray(table.fields)
    ) {
      fail("AIRTABLE_RESPONSE_INVALID", "Airtable returned an invalid table schema.");
    }
    return table;
  });
  if (configuredTables === undefined || configuredTables.length === 0) return tables;
  const selected = configuredTables.map((configuration) => {
    const candidates = tables.filter((table) => {
      if (configuration.selector !== undefined) {
        return table.id === configuration.selector || table.name === configuration.selector;
      }
      return (
        (configuration.id === undefined || table.id === configuration.id) &&
        (configuration.name === undefined || table.name === configuration.name)
      );
    });
    if (candidates.length !== 1) {
      fail(
        "CONFIGURATION_ERROR",
        `Configured table ${configuration.selector ?? configuration.id ?? configuration.name} matched ${candidates.length} schema tables.`,
      );
    }
    return { table: candidates[0], configuration };
  });
  if (new Set(selected.map(({ table }) => table.id)).size !== selected.length) {
    fail("CONFIGURATION_ERROR", "Configured tables contain duplicates.");
  }
  return selected.map(({ table }) => table);
}

function tableSettings(table, configurations) {
  const configuration = configurations?.find((candidate) =>
    candidate.selector !== undefined
      ? candidate.selector === table.id || candidate.selector === table.name
      : (candidate.id === undefined || candidate.id === table.id) &&
        (candidate.name === undefined || candidate.name === table.name),
  );
  return {
    applicationIdField: configuration?.applicationIdField ?? DEFAULT_APPLICATION_ID_FIELD,
    organizationIdField: configuration?.organizationIdField ?? DEFAULT_ORGANIZATION_ID_FIELD,
    eventIdField: configuration?.eventIdField ?? DEFAULT_EVENT_ID_FIELD,
  };
}

async function atomicWrite(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, canonicalJson(value), { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

async function loadCheckpoint(path) {
  let source;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT")
      fail("CHECKPOINT_MISSING", `Resume checkpoint does not exist: ${path}`);
    throw error;
  }
  let checkpoint;
  try {
    checkpoint = JSON.parse(source);
  } catch (cause) {
    fail("CHECKPOINT_INVALID", `Resume checkpoint is not valid JSON: ${path}`, { cause });
  }
  if (
    checkpoint?.format !== CHECKPOINT_FORMAT ||
    checkpoint?.version !== CHECKPOINT_VERSION ||
    !isObject(checkpoint.tables)
  ) {
    fail("CHECKPOINT_INVALID", `Resume checkpoint has an unsupported format: ${path}`);
  }
  return checkpoint;
}

function checkpointFor(baseId, schemaPayload, tables) {
  return {
    format: CHECKPOINT_FORMAT,
    version: CHECKPOINT_VERSION,
    baseId,
    schema: schemaPayload,
    selectedTableIds: tables.map((table) => table.id),
    tables: Object.fromEntries(
      tables.map((table) => [table.id, { complete: false, nextOffset: null, records: [] }]),
    ),
  };
}

function validateCheckpoint(checkpoint, baseId, tableIds) {
  if (
    checkpoint.baseId !== baseId ||
    JSON.stringify(checkpoint.selectedTableIds) !== JSON.stringify(tableIds)
  ) {
    fail("CHECKPOINT_MISMATCH", "Resume checkpoint does not match the requested base and tables.");
  }
}

function applicationId(record, table, fieldName) {
  const value = record.fields?.[fieldName];
  if (typeof value !== "string" || value.trim().length === 0 || value !== value.trim()) {
    fail(
      "APPLICATION_ID_INVALID",
      `${table.name}/${record.id ?? "unknown record"} has no stable ${fieldName}.`,
    );
  }
  return value;
}

function scalarScope(value, table, record, fieldName) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value !== value.trim() || value.length === 0) {
    fail("SCOPE_INVALID", `${table.name}/${record.id} has an invalid ${fieldName}.`);
  }
  return value;
}

function linkedRecordIds(record, fieldName) {
  const value = record.fields?.[fieldName];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return [];
  return value;
}

function deriveScopes(tables, recordsByTable, settingsByTable) {
  const byRecordId = new Map();
  const scopes = new Map();
  for (const table of tables) {
    const settings = settingsByTable.get(table.id);
    for (const record of recordsByTable.get(table.id)) {
      byRecordId.set(record.id, { table, record });
      const appId = applicationId(record, table, settings.applicationIdField);
      scopes.set(record.id, {
        organizationId:
          table.name === "Organizations"
            ? appId
            : scalarScope(
                record.fields?.[settings.organizationIdField],
                table,
                record,
                settings.organizationIdField,
              ),
        eventId:
          table.name === "Events"
            ? appId
            : scalarScope(
                record.fields?.[settings.eventIdField],
                table,
                record,
                settings.eventIdField,
              ),
      });
    }
  }

  const merge = (recordId, key, candidates, context) => {
    const distinct = [...new Set(candidates.filter((value) => value !== null))];
    if (distinct.length > 1)
      fail("SCOPE_CONFLICT", `${context} resolves to conflicting ${key} values.`);
    if (distinct.length === 1) {
      const scope = scopes.get(recordId);
      if (scope[key] !== null && scope[key] !== distinct[0]) {
        fail("SCOPE_CONFLICT", `${context} conflicts with its explicit ${key}.`);
      }
      if (scope[key] === null) {
        scope[key] = distinct[0];
        return true;
      }
    }
    return false;
  };

  let changed = true;
  while (changed) {
    changed = false;
    for (const table of tables) {
      const scopeLinks = new Map(
        table.fields
          .filter(
            (field) =>
              field?.type === "multipleRecordLinks" &&
              (field.name === "Organization" || field.name === "Event"),
          )
          .map((field) => [field.name, field]),
      );
      for (const record of recordsByTable.get(table.id)) {
        const linkedScopes = (fieldName) =>
          linkedRecordIds(record, scopeLinks.get(fieldName)?.name)
            .filter((id) => byRecordId.has(id))
            .map((id) => scopes.get(id));
        changed =
          merge(
            record.id,
            "organizationId",
            [...linkedScopes("Organization"), ...linkedScopes("Event")].map(
              (scope) => scope.organizationId,
            ),
            `${table.name}/${record.id}`,
          ) || changed;
        changed =
          merge(
            record.id,
            "eventId",
            linkedScopes("Event").map((scope) => scope.eventId),
            `${table.name}/${record.id}`,
          ) || changed;
      }
    }
  }
  return scopes;
}

function buildManifest(baseId, schemaPayload, tables, recordsByTable, configurations) {
  const settingsByTable = new Map(
    tables.map((table) => [table.id, tableSettings(table, configurations)]),
  );
  const scopes = deriveScopes(tables, recordsByTable, settingsByTable);
  const manifestTables = tables.map((table) => {
    const settings = settingsByTable.get(table.id);
    const seenApplicationIds = new Set();
    const records = recordsByTable.get(table.id).map((record) => {
      if (!isObject(record) || typeof record.id !== "string" || !isObject(record.fields)) {
        fail("AIRTABLE_RESPONSE_INVALID", `${table.name} contains an invalid record.`);
      }
      const appId = applicationId(record, table, settings.applicationIdField);
      if (seenApplicationIds.has(appId)) {
        fail(
          "APPLICATION_ID_DUPLICATE",
          `${table.name} contains duplicate ${settings.applicationIdField} ${appId}.`,
        );
      }
      seenApplicationIds.add(appId);
      return {
        airtableRecordId: record.id,
        applicationId: appId,
        scope: scopes.get(record.id),
        fields: record.fields,
        raw: record,
        rawSha256: digest(record),
      };
    });
    records.sort(
      (left, right) =>
        left.applicationId.localeCompare(right.applicationId, "en") ||
        left.airtableRecordId.localeCompare(right.airtableRecordId, "en"),
    );
    return {
      id: table.id,
      name: table.name,
      applicationIdField: settings.applicationIdField,
      organizationIdField: settings.organizationIdField,
      eventIdField: settings.eventIdField,
      schema: table,
      schemaSha256: digest(table),
      recordCount: records.length,
      records,
    };
  });
  manifestTables.sort(
    (left, right) =>
      left.name.localeCompare(right.name, "en") || left.id.localeCompare(right.id, "en"),
  );
  return {
    format: MANIFEST_FORMAT,
    version: MANIFEST_VERSION,
    base: { id: baseId },
    schema: { raw: schemaPayload, rawSha256: digest(schemaPayload) },
    tableCount: manifestTables.length,
    recordCount: manifestTables.reduce((sum, table) => sum + table.recordCount, 0),
    tables: manifestTables,
  };
}

export async function exportAirtableInventory(options) {
  const accessToken = requiredText(options.accessToken, "accessToken");
  const baseId = validateIdentifier(options.baseId, "baseId");
  const apiOrigin = safeApiOrigin(options.apiOrigin);
  const fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
  if (typeof fetchImplementation !== "function")
    fail("CONFIGURATION_ERROR", "A fetch implementation is required.");
  const outputPath = resolve(options.outputPath ?? DEFAULT_OUTPUT);
  const checkpointPath = `${outputPath}.checkpoint.json`;

  const schemaUrl = `${apiOrigin}/v0/meta/bases/${encodeURIComponent(baseId)}/tables`;
  let checkpoint;
  let schemaPayload;
  let tables;
  if (options.resume) {
    checkpoint = await loadCheckpoint(checkpointPath);
    schemaPayload = checkpoint.schema;
    tables = resolveTables(schemaPayload.tables, options.tables);
    validateCheckpoint(
      checkpoint,
      baseId,
      tables.map((table) => table.id),
    );
  } else {
    schemaPayload = await airtableRequest({
      fetchImplementation,
      accessToken,
      url: schemaUrl,
      operation: "schema",
    });
    tables = resolveTables(schemaPayload.tables, options.tables);
    checkpoint = checkpointFor(baseId, schemaPayload, tables);
    await atomicWrite(checkpointPath, checkpoint);
  }

  for (const table of tables) {
    const state = checkpoint.tables[table.id];
    if (!isObject(state) || !Array.isArray(state.records))
      fail("CHECKPOINT_INVALID", `Checkpoint state for ${table.name} is invalid.`);
    if (state.complete) continue;
    let offset = state.nextOffset;
    do {
      const url = new URL(
        `${apiOrigin}/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table.id)}`,
      );
      url.searchParams.set("pageSize", String(RECORD_PAGE_SIZE));
      url.searchParams.set("returnFieldsByFieldId", "false");
      if (offset !== null) url.searchParams.set("offset", offset);
      const page = await airtableRequest({
        fetchImplementation,
        accessToken,
        url: url.href,
        operation: `records for ${table.name}`,
      });
      if (!Array.isArray(page.records))
        fail("AIRTABLE_RESPONSE_INVALID", `Airtable returned invalid records for ${table.name}.`);
      state.records.push(...page.records);
      if (page.offset !== undefined && typeof page.offset !== "string") {
        fail("AIRTABLE_RESPONSE_INVALID", `Airtable returned an invalid offset for ${table.name}.`);
      }
      offset = page.offset ?? null;
      state.nextOffset = offset;
      state.complete = offset === null;
      await atomicWrite(checkpointPath, checkpoint);
    } while (offset !== null);
  }

  const recordsByTable = new Map(
    tables.map((table) => [table.id, checkpoint.tables[table.id].records]),
  );
  const manifest = buildManifest(baseId, schemaPayload, tables, recordsByTable, options.tables);
  await atomicWrite(outputPath, manifest);
  await rm(checkpointPath, { force: true });
  return { manifest, outputPath, checkpointPath };
}

export async function readJsonConfiguration(path) {
  let source;
  try {
    source = await readFile(path, "utf8");
  } catch (cause) {
    fail("CONFIGURATION_ERROR", `Could not read configuration file: ${path}`, { cause });
  }
  try {
    return JSON.parse(source);
  } catch (cause) {
    fail("CONFIGURATION_ERROR", `Configuration file is not valid JSON: ${path}`, { cause });
  }
}
