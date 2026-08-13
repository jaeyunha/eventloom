import { createHash } from "node:crypto";

const DEFAULT_FETCH = globalThis.fetch;
export const CLOUDFLARE_API_ORIGIN = "https://api.cloudflare.com/client/v4";
export const DEFAULT_AIRTABLE_API_ORIGIN = "https://api.airtable.com";
export const APPLICATION_ID_FIELD = "Application ID";
export const REPAIR_ORGANIZATION_ID = "ai-engineer";
export const REPAIR_EVENT_ID = "devflow-conf-2027";
export const MAX_PROVIDER_RECORDS = 2;
export const MAX_DISCOVERY_RECORDS = 1000;
export const WORKFLOW_RESET_TABLES = Object.freeze([
  "Events",
  "CFP Forms",
  "Tracks",
  "Formats",
  "Rooms",
  "Session Settings",
  "Email Templates",
  "Levels",
  "Tags",
  "Session Statuses",
  "Submissions",
  "Participants",
  "Speaker Profiles",
  "Review Plans",
  "Evaluations",
  "Decisions",
  "Speaker Tasks",
  "Sessions",
  "Agenda Versions",
  "Published Speaker Projections",
  "Agenda Entries",
  "Publication Outbox",
  "Audit Records",
  "Portal Contexts",
  "Session Roster",
  "Task Forms",
  "Task Responses",
  "Portal Resources",
  "Wiki Pages",
  "File Assets",
  "File Versions",
  "File Comments",
  "Email Send Snapshots",
  "Report Definitions",
  "Report Runs",
  "Remix Candidates",
  "Remix Audit",
  "CRM Contacts",
  "CRM Segments",
  "CRM History",
  "CRM Pipeline",
  "CRM Notes",
  "CRM Event Projections",
  "CRM Outreach",
  "CRM Imports",
  "CRM Commands",
]);
export const WORKFLOW_RESET_D1_TABLES = Object.freeze([
  "speaker_grants",
  "outbox_jobs",
  "audit_events",
  "private_uploads",
]);
export const WORKFLOW_RESET_PROTECTED_TABLES = Object.freeze([
  "Organizations",
  "Memberships",
  "Reusable Fields",
]);

const AIRTABLE_LINK_TARGETS = Object.freeze({
  "Agenda Entries": Object.freeze({
    "Agenda Version": "Agenda Versions",
    Session: "Sessions",
    Room: "Rooms",
    Track: "Tracks",
  }),
  "Agenda Versions": Object.freeze({ Event: "Events" }),
  Decisions: Object.freeze({ Event: "Events", Submission: "Submissions" }),
  Evaluations: Object.freeze({
    Event: "Events",
    "Review Plan": "Review Plans",
    Submission: "Submissions",
  }),
  Participants: Object.freeze({
    Event: "Events",
    Submission: "Submissions",
    "Speaker Profile": "Speaker Profiles",
  }),
  "Review Plans": Object.freeze({ Event: "Events" }),
  Sessions: Object.freeze({ Event: "Events", Room: "Rooms", Track: "Tracks" }),
  "Speaker Profiles": Object.freeze({ Event: "Events", Participant: "Participants" }),
  "Speaker Tasks": Object.freeze({ Event: "Events", Participant: "Participants" }),
  "Session Roster": Object.freeze({
    Event: "Events",
    Submission: "Submissions",
    Participant: "Participants",
  }),
  Submissions: Object.freeze({ Event: "Events", "CFP Form": "CFP Forms" }),
});

export class ProductionRepairAdapterError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ProductionRepairAdapterError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ProductionRepairAdapterError(code, message);
}

function required(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail("CONFIGURATION_ERROR", `${label} is required.`);
  }
  return value.trim();
}

function normalizedEmail(value) {
  if (typeof value !== "string")
    fail("IDENTITY_INVALID", "A normalized identity email is required.");
  const email = value.normalize("NFC").trim().toLowerCase();
  if (email.length === 0 || !/^\S+@\S+$/.test(email)) {
    fail("IDENTITY_INVALID", "A normalized identity email is required.");
  }
  return email;
}

function identifier(value, label) {
  if (typeof value !== "string" || value.trim().length === 0 || value.startsWith("identity:")) {
    fail("IDENTITY_UNRESOLVED", `${label} must be a resolved identifier.`);
  }
  return value.trim();
}
function speakerProfileIdFor(command, fieldName) {
  const profileId = identifier(command?.[fieldName], "Speaker profile ID");
  const eventId = identifier(command?.eventId, "Event ID");
  const prefix = `speaker-profile:${eventId}:`;
  if (!profileId.startsWith(prefix) || profileId.length === prefix.length) {
    fail("PROFILE_ID_INVALID", "Speaker profile ID is not canonical for the repair event.");
  }
  if (command?.participantId !== undefined) {
    const participantId = identifier(command.participantId, "Participant ID");
    if (profileId !== `${prefix}${participantId}`) {
      fail("PROFILE_DRIFT", "Speaker profile ID is bound to a different participant.");
    }
  }
  return profileId;
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clone(value) {
  return structuredClone(value);
}

function recordFields(record) {
  return isObject(record?.fields) ? record.fields : isObject(record) ? record : {};
}

function hideProviderRecordId(record) {
  if (!isObject(record) || typeof record.id !== "string") return record;
  const result = { ...record };
  const providerId = result.id;
  delete result.id;
  Object.defineProperty(result, "id", {
    value: providerId,
    enumerable: false,
    configurable: true,
  });
  return result;
}

function jsonValue(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail("PROVIDER_RESPONSE_INVALID", `${label} is invalid.`);
  }
  try {
    return JSON.parse(value);
  } catch {
    fail("PROVIDER_RESPONSE_INVALID", `${label} is invalid.`);
  }
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function airtableResetDigest(record) {
  const scalarFields = Object.fromEntries(
    Object.entries(recordFields(record)).filter(([, value]) => !Array.isArray(value)),
  );
  return digest(scalarFields);
}

function parseOrigin(value, label, defaultValue, expectedPath = "/") {
  let parsed;
  try {
    parsed = new URL(value ?? defaultValue);
  } catch {
    fail("CONFIGURATION_ERROR", `${label} must be an HTTPS origin.`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== expectedPath ||
    parsed.search ||
    parsed.hash
  ) {
    fail("CONFIGURATION_ERROR", `${label} must be an HTTPS origin.`);
  }
  return parsed.origin + (expectedPath === "/" ? "" : expectedPath);
}

function escapeFormula(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function pick(options, names, label) {
  for (const name of names) {
    const value = options[name];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return required(undefined, label);
}

function d1Rows(payload, maxRecords = MAX_PROVIDER_RECORDS) {
  const result = Array.isArray(payload?.result)
    ? payload.result
    : payload?.result
      ? [payload.result]
      : [];
  if (result.length !== 1 || !isObject(result[0]) || !Array.isArray(result[0].results)) {
    fail("D1_RESPONSE_INVALID", "Cloudflare D1 returned an invalid query result.");
  }
  const rows = result[0].results;
  if (rows.length > maxRecords) {
    fail("UNBOUNDED_RESULT", "Cloudflare D1 returned an unbounded result.");
  }
  return { rows, meta: result[0].meta ?? {} };
}

function safeRecordId(record) {
  return typeof record?.id === "string" && record.id.length > 0 ? record.id : undefined;
}

function identityRecord(row) {
  if (!isObject(row) || typeof row.id !== "string" || typeof row.email !== "string") {
    fail("D1_RESPONSE_INVALID", "Cloudflare D1 returned an invalid identity record.");
  }
  const fields = {
    "User ID": row.id,
    Email: row.email,
    Verified: Number(row.email_verified) === 1 || row.email_verified === true,
    "Display Name": row.name ?? null,
  };
  return {
    id: row.id,
    userId: row.id,
    email: row.email,
    emailVerified: fields.Verified,
    verified: fields.Verified,
    name: row.name ?? null,
    fields,
  };
}

function membershipRecord(row) {
  if (
    !isObject(row) ||
    typeof row.organization_id !== "string" ||
    typeof row.user_id !== "string" ||
    typeof row.role !== "string"
  ) {
    fail("D1_RESPONSE_INVALID", "Cloudflare D1 returned an invalid membership record.");
  }
  const fields = {
    "Organization ID": row.organization_id,
    "User ID": row.user_id,
    Role: row.role,
    "Created At": row.created_at ?? null,
    "Updated At": row.updated_at ?? null,
  };
  return { id: `${row.organization_id}:${row.user_id}`, ...row, fields };
}

function speakerGrantRecord(row) {
  if (
    !isObject(row) ||
    typeof row.organization_id !== "string" ||
    typeof row.speaker_profile_id !== "string" ||
    typeof row.user_id !== "string"
  ) {
    fail("D1_RESPONSE_INVALID", "Cloudflare D1 returned an invalid speaker grant record.");
  }
  const fields = {
    "Organization ID": row.organization_id,
    "Speaker Profile ID": row.speaker_profile_id,
    "User ID": row.user_id,
    "Revoked At": row.revoked_at ?? null,
  };
  return { id: `${row.organization_id}:${row.speaker_profile_id}:${row.user_id}`, ...row, fields };
}

function exactRecordOrUndefined(records, label) {
  if (!Array.isArray(records))
    fail("PROVIDER_RESPONSE_INVALID", `${label} returned invalid records.`);
  if (records.length > MAX_PROVIDER_RECORDS)
    fail("UNBOUNDED_RESULT", `${label} returned an unbounded result.`);
  if (records.length > 1)
    fail("DUPLICATE_OBJECT", `Multiple ${label} records match the exact repair key.`);
  return records[0];
}

function contactIdFor(command) {
  const profileId = speakerProfileIdFor(command, "profileId");
  const contactId = identifier(command.contactId, "CRM contact ID");
  const expectedContactId = `crm-contact:${profileId}`;
  if (contactId !== expectedContactId) {
    fail("PROFILE_DRIFT", "CRM contact ID is not bound to the canonical speaker profile.");
  }
  return contactId;
}

function historyIdFor(command) {
  return identifier(command.historyId, "CRM history ID");
}

function splitName(displayName) {
  const parts = String(displayName ?? "")
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
  return {
    firstName: parts[0] ?? null,
    lastName: parts.slice(1).join(" ") || null,
  };
}
function resetScopeProof(record) {
  const proof = {
    organizationId: false,
    eventId: false,
    foreignOrganization: false,
    foreignEvent: false,
  };
  const seen = new Set();
  const inspect = (value, depth = 0) => {
    if (value === null || value === undefined || depth > 8 || typeof value === "number") return;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          inspect(JSON.parse(trimmed), depth + 1);
        } catch {
          // Non-JSON text is not scope metadata.
        }
      }
      return;
    }
    if (typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) inspect(item, depth + 1);
      return;
    }
    for (const [name, child] of Object.entries(value)) {
      const normalized = name.toLowerCase().replaceAll(/[\s_-]+/gu, "");
      const strongOrganization = normalized === "organizationid" || normalized === "tenantid";
      const bareOrganization = normalized === "organization" && depth <= 1;
      const strongEvent = normalized === "eventid" || normalized === "eventslug";
      const bareEvent = normalized === "event" && depth <= 1;
      const primitiveScopeValue =
        typeof child === "string" ||
        (Array.isArray(child) &&
          child.length > 0 &&
          child.every((entry) => typeof entry === "string"));
      const exactOrganization =
        child === REPAIR_ORGANIZATION_ID ||
        (Array.isArray(child) && child.length === 1 && child[0] === REPAIR_ORGANIZATION_ID);
      const exactEvent =
        child === REPAIR_EVENT_ID ||
        (Array.isArray(child) && child.length === 1 && child[0] === REPAIR_EVENT_ID);
      if (strongOrganization || bareOrganization) {
        if (exactOrganization) {
          proof.organizationId = true;
        } else if (primitiveScopeValue && (strongOrganization || typeof child === "string")) {
          proof.foreignOrganization = true;
        }
      } else if (strongEvent || bareEvent) {
        if (exactEvent) {
          proof.eventId = true;
        } else if (primitiveScopeValue && (strongEvent || typeof child === "string")) {
          proof.foreignEvent = true;
        }
      }
      inspect(child, depth + 1);
    }
  };
  inspect(record);
  return proof;
}
function resetTenantCanBeDerivedFromEvent(table) {
  return WORKFLOW_RESET_TABLES.includes(table);
}

export function createProductionRepairAdapter(options = {}) {
  const accountId = pick(
    options,
    ["accountId", "cloudflareAccountId", "CLOUDFLARE_ACCOUNT_ID"],
    "CLOUDFLARE_ACCOUNT_ID",
  );
  const apiToken = pick(
    options,
    ["apiToken", "cloudflareApiToken", "CLOUDFLARE_API_TOKEN"],
    "CLOUDFLARE_API_TOKEN",
  );
  const databaseId = pick(
    options,
    ["databaseId", "d1DatabaseId", "D1_DATABASE_ID"],
    "D1_DATABASE_ID",
  );
  const baseId = pick(
    options,
    ["baseId", "airtableBaseId", "AIRTABLE_BASE_ID"],
    "AIRTABLE_BASE_ID",
  );
  const airtableToken = pick(
    options,
    ["accessToken", "airtableAccessToken", "AIRTABLE_ACCESS_TOKEN"],
    "AIRTABLE_ACCESS_TOKEN",
  );
  const airtableOrigin = parseOrigin(
    options.airtableApiOrigin ?? options.apiOrigin ?? options.AIRTABLE_API_ORIGIN,
    "AIRTABLE_API_ORIGIN",
    DEFAULT_AIRTABLE_API_ORIGIN,
  );
  const fetchImplementation = options.fetchImplementation ?? options.fetch ?? DEFAULT_FETCH;
  if (typeof fetchImplementation !== "function")
    fail("CONFIGURATION_ERROR", "A fetch implementation is required.");
  const d1Origin = parseOrigin(
    options.cloudflareApiOrigin ?? options.CLOUDFLARE_API_ORIGIN,
    "CLOUDFLARE_API_ORIGIN",
    CLOUDFLARE_API_ORIGIN,
    "/client/v4",
  );
  const now = () => {
    const value = options.now;
    if (typeof value === "function") return new Date(value()).toISOString();
    if (value !== undefined) return new Date(value).toISOString();
    return new Date().toISOString();
  };

  async function readJsonResponse(response, failureCode, failureMessage) {
    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }
    if (!response.ok || payload?.success === false) fail(failureCode, failureMessage);
    if (!isObject(payload)) fail(failureCode, failureMessage);
    return payload;
  }

  async function d1Query(sql, params, maxRecords = MAX_PROVIDER_RECORDS) {
    if (!Array.isArray(params)) fail("D1_QUERY_INVALID", "D1 query parameters must be an array.");
    let response;
    try {
      response = await fetchImplementation(
        `${d1Origin}/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sql, params }),
        },
      );
    } catch {
      fail("D1_REQUEST_FAILED", "Cloudflare D1 request failed.");
    }
    const payload = await readJsonResponse(
      response,
      "D1_REQUEST_FAILED",
      "Cloudflare D1 request failed.",
    );
    return d1Rows(payload, maxRecords);
  }

  function airtableUrl(table, suffix = "") {
    return `${airtableOrigin}/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}${suffix}`;
  }

  async function airtableRequest(table, suffix = "", init = {}, requestOptions = {}) {
    let response;
    try {
      response = await fetchImplementation(airtableUrl(table, suffix), {
        ...init,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${airtableToken}`,
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });
    } catch {
      fail("AIRTABLE_REQUEST_FAILED", "Airtable request failed.");
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    if (!response.ok) {
      if (requestOptions.allowNotFound === true && response.status === 404) {
        return { notFound: true };
      }
      fail("AIRTABLE_REQUEST_FAILED", "Airtable request failed.");
    }
    if (!isObject(payload)) fail("AIRTABLE_RESPONSE_INVALID", "Airtable returned invalid data.");
    return payload;
  }

  async function airtableLookup(table, applicationId, options = {}) {
    const id = identifier(applicationId, "Airtable Application ID");
    if (/^rec[a-zA-Z0-9]{10,}$/u.test(id)) {
      fail(
        "APPLICATION_ID_REQUIRED",
        "Airtable operations require an Application ID, not a provider record ID.",
      );
    }
    if (table === "Speaker Profiles" && options.allowNonCanonical !== true) {
      speakerProfileIdFor({ eventId: REPAIR_EVENT_ID, speakerProfileId: id }, "speakerProfileId");
    }
    const query = new URLSearchParams({
      maxRecords: String(MAX_PROVIDER_RECORDS),
      filterByFormula: `{${APPLICATION_ID_FIELD}}="${escapeFormula(id)}"`,
    });
    const payload = await airtableRequest(table, `?${query.toString()}`);
    if (!Array.isArray(payload.records))
      fail("AIRTABLE_RESPONSE_INVALID", "Airtable returned invalid records.");
    if (payload.records.length > MAX_PROVIDER_RECORDS)
      fail("UNBOUNDED_RESULT", "Airtable returned an unbounded result.");
    return payload.records;
  }
  async function airtableLookupByRecordId(table, recordId) {
    const id = identifier(recordId, "Airtable record identity");
    const payload = await airtableRequest(
      table,
      `/${encodeURIComponent(id)}`,
      { method: "GET" },
      { allowNotFound: true },
    );
    return payload.notFound === true ? [] : [payload];
  }
  async function airtableList(table) {
    const records = [];
    let offset;
    while (records.length <= MAX_DISCOVERY_RECORDS) {
      const query = new URLSearchParams({ maxRecords: "100" });
      if (offset !== undefined) query.set("offset", offset);
      const payload = await airtableRequest(table, `?${query.toString()}`);
      if (!Array.isArray(payload.records))
        fail("AIRTABLE_RESPONSE_INVALID", "Airtable discovery returned invalid records.");
      records.push(...payload.records);
      if (records.length > MAX_DISCOVERY_RECORDS)
        fail("UNBOUNDED_RESULT", "Airtable discovery returned too many records.");
      if (typeof payload.offset !== "string" || payload.records.length === 0) break;
      offset = payload.offset;
    }
    return records;
  }

  function resetAirtableRecord(table, record, digestRecord = record) {
    const fields = recordFields(record);
    const target = {
      store: "airtable",
      table,
      applicationId:
        typeof fields[APPLICATION_ID_FIELD] === "string" ? fields[APPLICATION_ID_FIELD] : undefined,
      id: fields[APPLICATION_ID_FIELD] ?? safeRecordId(record),
      fields: clone(fields),
      expectedVersion: Number(fields.Version ?? fields["Current Version"] ?? fields.version) || 1,
      recordDigest: airtableResetDigest(digestRecord),
    };
    Object.defineProperty(target, "recordId", {
      value: safeRecordId(record),
      enumerable: false,
      configurable: true,
    });
    return target;
  }

  async function discoverAirtableWorkflowRecords(scope = {}) {
    const discovered = [];
    const chainedCrmContactIds = new Set(scope.chainContext?.crmContactIds ?? []);
    for (const table of WORKFLOW_RESET_TABLES) {
      const records = await airtableList(table);
      for (const record of records) {
        const [normalized] = await normalizeAirtableRecordLinks(
          { table, fields: { Event: REPAIR_EVENT_ID } },
          [record],
        );
        const target = resetAirtableRecord(table, normalized, record);
        target.scopeProof = resetScopeProof(normalized);
        if (
          table === "CRM Contacts" &&
          typeof target.applicationId === "string" &&
          chainedCrmContactIds.has(target.applicationId)
        ) {
          target.scopeProof.organizationId = true;
          target.scopeProof.eventId = true;
        }
        discovered.push(target);
      }
    }
    return discovered;
  }

  function eventFromJson(value) {
    if (typeof value !== "string" || value.trim().length === 0) return undefined;
    try {
      const parsed = JSON.parse(value);
      if (!isObject(parsed)) return undefined;
      return parsed.eventId ?? parsed.event_id;
    } catch {
      return undefined;
    }
  }

  async function discoverD1WorkflowRecords() {
    const discovered = [];
    const grants = await d1Query(
      `SELECT organization_id, speaker_profile_id, user_id, created_at, revoked_at
         FROM speaker_grants
        WHERE organization_id = ? AND speaker_profile_id LIKE ?
        LIMIT ?`,
      [REPAIR_ORGANIZATION_ID, `speaker-profile:${REPAIR_EVENT_ID}:%`, MAX_DISCOVERY_RECORDS],
      MAX_DISCOVERY_RECORDS,
    );
    for (const row of grants.rows) {
      if (
        row.organization_id !== REPAIR_ORGANIZATION_ID ||
        typeof row.speaker_profile_id !== "string" ||
        !row.speaker_profile_id.startsWith(`speaker-profile:${REPAIR_EVENT_ID}:`)
      ) {
        continue;
      }
      discovered.push({
        store: "d1",
        table: "speaker_grants",
        kind: "speaker-grant",
        id: `${row.organization_id}:${row.speaker_profile_id}:${row.user_id}`,
        recordId: `${row.organization_id}:${row.speaker_profile_id}:${row.user_id}`,
        applicationId: `${row.organization_id}:${row.speaker_profile_id}:${row.user_id}`,
        fields: {
          "Organization ID": row.organization_id,
          "Event ID": REPAIR_EVENT_ID,
          "Speaker Profile ID": row.speaker_profile_id,
          "User ID": row.user_id,
          "Revoked At": row.revoked_at ?? null,
        },
        row: clone(row),
        recordDigest: digest(row),
      });
    }
    const outbox = await d1Query(
      `SELECT id, tenant_id, topic, deduplication_key, payload_json, state, created_at, updated_at
         FROM outbox_jobs
        WHERE tenant_id = ?
        LIMIT ?`,
      [REPAIR_ORGANIZATION_ID, MAX_DISCOVERY_RECORDS],
      MAX_DISCOVERY_RECORDS,
    );
    for (const row of outbox.rows) {
      const eventId = eventFromJson(row.payload_json);
      if (row.tenant_id !== REPAIR_ORGANIZATION_ID || eventId !== REPAIR_EVENT_ID) continue;
      discovered.push({
        store: "d1",
        table: "outbox_jobs",
        id: row.id,
        recordId: row.id,
        applicationId: row.id,
        fields: {
          "Organization ID": row.tenant_id,
          "Event ID": eventId,
          "Payload JSON": row.payload_json,
          Topic: row.topic,
          State: row.state,
        },
        row: clone(row),
        recordDigest: digest(row),
      });
    }
    const audits = await d1Query(
      `SELECT sequence, id, tenant_id, actor_type, actor_id, action, resource_type, resource_id,
              details_json, occurred_at
         FROM audit_events
        WHERE tenant_id = ?
        LIMIT ?`,
      [REPAIR_ORGANIZATION_ID, MAX_DISCOVERY_RECORDS],
      MAX_DISCOVERY_RECORDS,
    );
    for (const row of audits.rows) {
      const eventId = eventFromJson(row.details_json);
      if (row.tenant_id !== REPAIR_ORGANIZATION_ID || eventId !== REPAIR_EVENT_ID) continue;
      discovered.push({
        store: "d1",
        table: "audit_events",
        id: row.sequence ?? row.id,
        recordId: row.sequence ?? row.id,
        applicationId: row.id,
        fields: {
          "Organization ID": row.tenant_id,
          "Event ID": eventId,
          "Details JSON": row.details_json,
          Action: row.action,
          "Resource Type": row.resource_type,
          "Resource ID": row.resource_id,
        },
        row: clone(row),
        recordDigest: digest(row),
      });
    }
    const uploads = await d1Query(
      `SELECT id, tenant_id, object_key, content_type, byte_size, checksum_sha256, state,
              scan_result_code, created_at, updated_at
         FROM private_uploads
        WHERE tenant_id = ? AND object_key LIKE ?
        LIMIT ?`,
      [REPAIR_ORGANIZATION_ID, `events/${REPAIR_EVENT_ID}/%`, MAX_DISCOVERY_RECORDS],
      MAX_DISCOVERY_RECORDS,
    );
    for (const row of uploads.rows) {
      if (
        row.tenant_id !== REPAIR_ORGANIZATION_ID ||
        typeof row.object_key !== "string" ||
        !row.object_key.startsWith(`events/${REPAIR_EVENT_ID}/`)
      ) {
        continue;
      }
      discovered.push({
        store: "d1",
        table: "private_uploads",
        id: row.id,
        recordId: row.id,
        applicationId: row.id,
        fields: {
          "Organization ID": row.tenant_id,
          "Event ID": REPAIR_EVENT_ID,
          "Object Key": row.object_key,
          State: row.state,
        },
        row: clone(row),
        recordDigest: digest(row),
      });
    }
    return discovered;
  }

  async function discoverWorkflowRecords(scope = {}) {
    return [
      ...(await discoverAirtableWorkflowRecords(scope)),
      ...(await discoverD1WorkflowRecords()),
    ];
  }

  async function normalizeAirtableRecordLinks(operation, records) {
    const targets = AIRTABLE_LINK_TARGETS[operation.table];
    if (targets === undefined) return records.map((record) => hideProviderRecordId(record));
    return Promise.all(
      records.map(async (record) => {
        if (!isObject(record?.fields)) return hideProviderRecordId(record);
        const fields = clone(record.fields);
        for (const [fieldName, targetTable] of Object.entries(targets)) {
          const expected = operation.fields?.[fieldName] ?? operation.ownedFields?.[fieldName];
          const actual = fields[fieldName];
          if (typeof expected !== "string" || !Array.isArray(actual) || actual.length !== 1) {
            continue;
          }
          const target = exactRecordOrUndefined(
            await airtableLookup(targetTable, expected),
            `${targetTable} link`,
          );
          if (target !== undefined && safeRecordId(target) === actual[0]) {
            fields[fieldName] = expected;
          }
        }
        return hideProviderRecordId({ ...record, fields });
      }),
    );
  }

  async function airtableWrite(table, existing, fields) {
    if (!isObject(fields)) fail("AIRTABLE_WRITE_INVALID", "Airtable repair fields are invalid.");
    const recordId = safeRecordId(existing);
    const suffix = recordId === undefined ? "" : `/${encodeURIComponent(recordId)}`;
    const method = recordId === undefined ? "POST" : "PATCH";
    return airtableRequest(table, suffix, {
      method,
      body: JSON.stringify({ fields: clone(fields), typecast: true }),
    });
  }
  async function airtableDelete(input) {
    if (input?.organizationId !== REPAIR_ORGANIZATION_ID || input?.eventId !== REPAIR_EVENT_ID) {
      fail("SCOPE_MISMATCH", "The reset delete scope is immutable.");
    }
    const table = required(input?.table, "Airtable table");
    if (
      WORKFLOW_RESET_PROTECTED_TABLES.some(
        (candidate) => candidate.toLowerCase() === table.toLowerCase(),
      )
    ) {
      fail("RESET_PROTECTED_TARGET", "The workflow reset cannot delete foundation records.");
    }
    const suppliedRecordId =
      typeof input.recordId === "string" && input.recordId.length > 0 ? input.recordId : undefined;
    let current;
    if (typeof input.applicationId === "string" && input.applicationId.length > 0) {
      const matches = await airtableLookup(table, input.applicationId, {
        allowNonCanonical: true,
      });
      current = exactRecordOrUndefined(matches, "Airtable reset record");
    } else if (suppliedRecordId !== undefined) {
      current = exactRecordOrUndefined(
        await airtableLookupByRecordId(table, suppliedRecordId),
        "Airtable reset record",
      );
    } else {
      fail("APPLICATION_ID_REQUIRED", "Airtable reset records require an Application ID.");
    }
    if (current === undefined) return { missing: true };
    const proof = resetScopeProof(current);
    if (input?.scopeProof?.organizationId === true) proof.organizationId = true;
    if (input?.scopeProof?.eventId === true) proof.eventId = true;
    if (input?.scopeProof?.foreignOrganization === true) proof.foreignOrganization = true;
    if (input?.scopeProof?.foreignEvent === true) proof.foreignEvent = true;
    if (!proof.organizationId && proof.eventId && resetTenantCanBeDerivedFromEvent(table)) {
      proof.organizationId = true;
    }
    if (
      proof.foreignOrganization ||
      proof.foreignEvent ||
      !proof.organizationId ||
      !proof.eventId
    ) {
      fail("SCOPE_DRIFT", "The reset record does not have exact organization and event scope.");
    }
    const currentRecordId = safeRecordId(current);
    if (currentRecordId === undefined) {
      fail("AIRTABLE_RESPONSE_INVALID", "The reset record has no provider identity.");
    }
    if (suppliedRecordId !== undefined && currentRecordId !== suppliedRecordId) {
      fail("RESET_IDENTITY_CONFLICT", "The reset record identity changed before deletion.");
    }
    const currentDigest = airtableResetDigest(current);
    if (typeof input.recordDigest === "string" && input.recordDigest !== currentDigest) {
      fail("RESET_VERSION_CONFLICT", "The reset record changed before deletion.");
    }
    await airtableRequest(table, `/${encodeURIComponent(currentRecordId)}`, { method: "DELETE" });
    return { deleted: true };
  }

  async function d1Delete(input) {
    const table = required(input?.table, "D1 reset table");
    const row = input?.row;
    if (!isObject(row)) fail("RESET_TARGET_INVALID", "The D1 reset row is invalid.");
    if (typeof input.recordDigest === "string" && digest(row) !== input.recordDigest) {
      fail("RESET_VERSION_CONFLICT", "The D1 reset record changed before deletion.");
    }
    const tenantId = table === "speaker_grants" ? row.organization_id : row.tenant_id;
    if (tenantId !== REPAIR_ORGANIZATION_ID) {
      fail("SCOPE_MISMATCH", "The D1 reset row has foreign organization scope.");
    }
    if (table === "speaker_grants") {
      const profileId = required(row.speaker_profile_id, "Speaker profile ID");
      if (!profileId.startsWith(`speaker-profile:${REPAIR_EVENT_ID}:`)) {
        fail("SCOPE_MISMATCH", "The speaker grant has foreign event scope.");
      }
      await d1Query(
        `DELETE FROM speaker_grants
          WHERE organization_id = ? AND speaker_profile_id = ? AND user_id = ?`,
        [row.organization_id, profileId, required(row.user_id, "User ID")],
      );
      return { deleted: true, id: input.recordId };
    }
    if (table === "outbox_jobs") {
      const payload = jsonValue(row.payload_json, "Outbox payload");
      if (payload.eventId !== REPAIR_EVENT_ID) {
        fail("SCOPE_MISMATCH", "The outbox job has foreign event scope.");
      }
      await d1Query(
        `DELETE FROM outbox_jobs
          WHERE id = ? AND tenant_id = ? AND payload_json = ?`,
        [required(row.id, "Outbox job ID"), row.tenant_id, row.payload_json],
      );
      return { deleted: true, id: input.recordId };
    }
    if (table === "audit_events") {
      const details = jsonValue(row.details_json, "Audit details");
      if (details.eventId !== REPAIR_EVENT_ID) {
        fail("SCOPE_MISMATCH", "The audit event has foreign event scope.");
      }
      await d1Query(
        `DELETE FROM audit_events
          WHERE sequence = ? AND id = ? AND tenant_id = ? AND details_json = ?`,
        [row.sequence, row.id, row.tenant_id, row.details_json],
      );
      return { deleted: true, id: input.recordId };
    }
    if (table === "private_uploads") {
      const objectKey = required(row.object_key, "Private upload object key");
      if (!objectKey.startsWith(`events/${REPAIR_EVENT_ID}/`)) {
        fail("SCOPE_MISMATCH", "The private upload has foreign event scope.");
      }
      await d1Query(
        `DELETE FROM private_uploads
          WHERE id = ? AND tenant_id = ? AND object_key = ?`,
        [required(row.id, "Private upload ID"), row.tenant_id, objectKey],
      );
      return { deleted: true, id: input.recordId };
    }
    fail("RESET_TABLE_UNSUPPORTED", "The D1 reset table is unsupported.");
  }

  async function deleteWorkflowRecord(input) {
    if (!isObject(input)) fail("RESET_TARGET_INVALID", "A reset target is required.");
    if (input.organizationId !== REPAIR_ORGANIZATION_ID || input.eventId !== REPAIR_EVENT_ID) {
      fail("SCOPE_MISMATCH", "The reset target scope is immutable.");
    }
    if (input.store === "airtable") return airtableDelete(input);
    if (input.store === "d1") return d1Delete(input);
    fail("RESET_STORE_UNSUPPORTED", "The reset target store is unsupported.");
  }

  async function readIdentity(email) {
    const normalized = normalizedEmail(email);
    const { rows } = await d1Query(
      `SELECT id, email, email_verified, name
         FROM auth_users
        WHERE lower(email) = lower(?)
        LIMIT 2`,
      [normalized],
    );
    const row = exactRecordOrUndefined(rows, "Better Auth identity");
    return row === undefined ? undefined : identityRecord(row);
  }

  async function readMembership(command) {
    const organizationId = identifier(command.organizationId, "Organization ID");
    const userId = identifier(command.userId, "User ID");
    const { rows } = await d1Query(
      `SELECT organization_id, user_id, role, created_at, updated_at
         FROM organization_memberships
        WHERE organization_id = ? AND user_id = ?
        LIMIT 2`,
      [organizationId, userId],
    );
    const row = exactRecordOrUndefined(rows, "organization membership");
    return row === undefined ? undefined : membershipRecord(row);
  }

  async function readSpeakerGrant(command) {
    const organizationId = identifier(command.organizationId, "Organization ID");
    const profileId = speakerProfileIdFor(command, "speakerProfileId");
    const { rows } = await d1Query(
      `SELECT organization_id, speaker_profile_id, user_id, created_at, revoked_at
         FROM speaker_grants
        WHERE organization_id = ? AND speaker_profile_id = ?
        LIMIT 2`,
      [organizationId, profileId],
    );
    const row = exactRecordOrUndefined(rows, "speaker grant");
    return row === undefined ? undefined : speakerGrantRecord(row);
  }

  async function readReviewPlan(command) {
    const planId = identifier(command.reviewPlanId, "Review Plan ID");
    const rawRecords = await airtableLookup("Review Plans", planId);
    const rawRecord = exactRecordOrUndefined(rawRecords, "Review Plan");
    if (rawRecord === undefined) return undefined;
    const [record] = await normalizeAirtableRecordLinks(
      { table: "Review Plans", fields: { Event: REPAIR_EVENT_ID } },
      [rawRecord],
    );
    const fields = recordFields(record);
    if (fields.Event !== undefined && fields.Event !== REPAIR_EVENT_ID) {
      fail("SCOPE_DRIFT", "The authoritative Review Plan has foreign event scope.");
    }
    const plan = jsonValue(fields["Rounds JSON"], "Review Plan rounds");
    const roundId = identifier(command.roundId, "Review round ID");
    const reviewerId = identifier(command.reviewerId, "Reviewer ID");
    const rounds = Array.isArray(plan?.rounds) ? plan.rounds : [];
    const round = rounds.find(
      (candidate) => candidate?.id === roundId || candidate?.roundId === roundId,
    );
    if (!isObject(round))
      fail("REVIEW_PLAN_DRIFT", "The authoritative Review Plan round is missing.");
    const reviewerIds = Array.isArray(round.reviewerPool?.reviewerIds)
      ? round.reviewerPool.reviewerIds
      : Array.isArray(round.reviewerIds)
        ? round.reviewerIds
        : [];
    if (reviewerIds.length !== 1 || reviewerIds[0] !== reviewerId) {
      fail("REVIEW_PLAN_DRIFT", "The authoritative Review Plan reviewer pool differs.");
    }
    return {
      id: planId,
      fields: {
        [APPLICATION_ID_FIELD]: planId,
        "Round ID": roundId,
        "Reviewer ID": reviewerId,
        "Organization ID": REPAIR_ORGANIZATION_ID,
        "Event ID": REPAIR_EVENT_ID,
      },
      round,
    };
  }

  async function readCrm(command) {
    const organizationId = identifier(command.organizationId, "Organization ID");
    if (organizationId !== REPAIR_ORGANIZATION_ID)
      fail("SCOPE_MISMATCH", "CRM repair scope is immutable.");
    const eventId = identifier(command.eventId, "Event ID");
    if (eventId !== REPAIR_EVENT_ID) fail("SCOPE_MISMATCH", "CRM repair scope is immutable.");
    const contactId = contactIdFor(command);
    const historyId = historyIdFor(command);
    const contactRecords = await airtableLookup("CRM Contacts", contactId);
    const contact = exactRecordOrUndefined(contactRecords, "CRM contact");
    const historyRecords = await airtableLookup("CRM History", historyId);
    const history = exactRecordOrUndefined(historyRecords, "CRM history");
    if (contact === undefined && history !== undefined) {
      fail("CRM_DRIFT", "A CRM draft history record has no authoritative contact.");
    }
    if (contact === undefined) return undefined;
    const contactFields = recordFields(contact);
    if (
      contactFields["Organization ID"] !== undefined &&
      contactFields["Organization ID"] !== organizationId
    ) {
      fail("SCOPE_DRIFT", "The CRM contact has foreign organization scope.");
    }
    const expectedEmail = normalizedEmail(command.recipientEmail);
    if (
      contactFields.Email !== undefined &&
      normalizedEmail(contactFields.Email) !== expectedEmail
    ) {
      fail("IDENTITY_DRIFT", "The CRM contact email differs from the exact recipient.");
    }
    if (history !== undefined) {
      const historyFields = recordFields(history);
      const historyPayload = historyFields["History JSON"];
      if (typeof historyPayload === "string") {
        const parsed = jsonValue(historyPayload, "CRM history payload");
        if (parsed.status !== "draft" || parsed.sentAt !== null) {
          fail("CRM_DRIFT", "The CRM acceptance history is not an unsent draft.");
        }
      }
    }
    return {
      id: contactId,
      fields: {
        [APPLICATION_ID_FIELD]: contactId,
        "Organization ID": organizationId,
        "Event ID": eventId,
        "Contact ID": contactId,
        "Contact User ID": command.contactUserId,
        "Activity ID": command.activityId,
        "Template ID": command.templateId,
        Status: "draft",
        "Sent At": null,
      },
      contact: hideProviderRecordId(contact),
      history: hideProviderRecordId(history),
    };
  }

  async function read(operation) {
    if (!isObject(operation)) fail("COMMAND_INVALID", "A repair operation is required.");
    if (operation.kind === "identity" || operation.store === "auth") {
      const email = operation.payload?.email ?? operation.email;
      const record = await readIdentity(email);
      return record === undefined ? [] : [record];
    }
    const command = operation.payload ?? operation;
    switch (operation.kind ?? command.type) {
      case "membership": {
        if (typeof command.userId !== "string" || command.userId.startsWith("identity:")) return [];
        const record = await readMembership(command);
        return record === undefined ? [] : [record];
      }
      case "speaker-grant": {
        if (typeof command.userId !== "string" || command.userId.startsWith("identity:")) return [];
        const record = await readSpeakerGrant(command);
        return record === undefined ? [] : [record];
      }
      case "reviewer-pool": {
        if (typeof command.reviewerId !== "string" || command.reviewerId.startsWith("identity:")) {
          return [];
        }
        const record = await readReviewPlan(command);
        return record === undefined ? [] : [record];
      }
      case "crm-activity": {
        const record = await readCrm(command);
        return record === undefined ? [] : [record];
      }
      default:
        fail("COMMAND_UNSUPPORTED", "The production repair command kind is unsupported.");
    }
  }

  async function executeIdentity(command) {
    const email = normalizedEmail(command.email);
    const userId = identifier(command.userId, "User ID");
    const existing = await readIdentity(email);
    if (existing === undefined || existing.userId !== userId) {
      fail("IDENTITY_DRIFT", "The Better Auth identity no longer matches the exact repair email.");
    }
    if (!existing.verified) {
      if (command.credentialBacked !== true) {
        fail(
          "IDENTITY_VERIFICATION_REQUIRED",
          "Credential-backed apply is required to verify this identity.",
        );
      }
      await d1Query(
        `UPDATE auth_users
            SET email_verified = 1, updated_at = ?
          WHERE id = ? AND lower(email) = lower(?)`,
        [now(), userId, email],
      );
    }
    const verified = await readIdentity(email);
    if (verified === undefined || verified.userId !== userId || !verified.verified) {
      fail(
        "IDENTITY_VERIFICATION_FAILED",
        "Better Auth identity verification could not be confirmed.",
      );
    }
    return verified;
  }

  async function executeMembership(command) {
    const organizationId = identifier(command.organizationId, "Organization ID");
    const userId = identifier(command.userId, "User ID");
    const role = identifier(command.role, "Membership role");
    if (organizationId !== REPAIR_ORGANIZATION_ID)
      fail("SCOPE_MISMATCH", "Membership repair scope is immutable.");
    const existing = await readMembership(command);
    if (existing !== undefined) {
      if (existing.fields.Role !== role)
        fail("ROLE_DRIFT", "The existing organization membership role differs.");
      return existing;
    }
    await d1Query(
      `INSERT INTO organization_memberships
          (organization_id, user_id, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (organization_id, user_id) DO UPDATE SET
          role = organization_memberships.role,
          updated_at = organization_memberships.updated_at
        WHERE organization_memberships.role = excluded.role`,
      [organizationId, userId, role, now(), now()],
    );
    const after = await readMembership(command);
    if (after === undefined || after.fields.Role !== role) {
      fail("WRITE_NOT_VERIFIED", "The organization membership write could not be verified.");
    }
    return after;
  }

  async function verifySpeakerProfile(command) {
    const profileId = speakerProfileIdFor(command, "speakerProfileId");
    const records = await airtableLookup("Speaker Profiles", profileId);
    const profile = exactRecordOrUndefined(records, "Speaker Profile");
    if (profile === undefined) return;
    const fields = recordFields(profile);
    if (fields.Event !== undefined && fields.Event !== REPAIR_EVENT_ID) {
      fail("SCOPE_DRIFT", "The Speaker Profile has foreign event scope.");
    }
    const biography = fields.Biography;
    if (typeof biography !== "string")
      fail("PROFILE_DRIFT", "The Speaker Profile binding is invalid.");
    const profileValue = jsonValue(biography, "Speaker Profile binding");
    if (
      profileValue.organizationId !== undefined &&
      profileValue.organizationId !== REPAIR_ORGANIZATION_ID
    ) {
      fail("SCOPE_DRIFT", "The Speaker Profile has foreign organization scope.");
    }
    const expectedUserId = identifier(command.userId, "User ID");
    if (profileValue.id !== profileId) {
      fail("PROFILE_DRIFT", "The Speaker Profile has a non-canonical identity.");
    }
    if (
      command.participantId !== undefined &&
      profileValue.participantId !== command.participantId
    ) {
      fail("IDENTITY_DRIFT", "The Speaker Profile is bound to a different participant.");
    }
    if (profileValue.userId !== undefined && profileValue.userId !== expectedUserId) {
      fail("IDENTITY_DRIFT", "The Speaker Profile is bound to a different user.");
    }
    if (
      profileValue.email !== undefined &&
      normalizedEmail(profileValue.email) !== normalizedEmail(command.email)
    ) {
      fail("IDENTITY_DRIFT", "The Speaker Profile is bound to a different email.");
    }
  }

  async function executeSpeakerGrant(command) {
    const organizationId = identifier(command.organizationId, "Organization ID");
    const profileId = speakerProfileIdFor(command, "speakerProfileId");
    const userId = identifier(command.userId, "User ID");
    if (organizationId !== REPAIR_ORGANIZATION_ID || command.eventId !== REPAIR_EVENT_ID) {
      fail("SCOPE_MISMATCH", "Speaker grant repair scope is immutable.");
    }
    await verifySpeakerProfile(command);
    const existing = await readSpeakerGrant(command);
    if (existing !== undefined && existing.fields["User ID"] !== userId) {
      fail("IDENTITY_DRIFT", "The speaker grant is bound to a different user.");
    }
    if (existing === undefined || existing.fields["Revoked At"] !== null) {
      await d1Query(
        `INSERT INTO speaker_grants
            (organization_id, speaker_profile_id, user_id, created_at, revoked_at)
         VALUES (?, ?, ?, ?, NULL)
         ON CONFLICT (organization_id, speaker_profile_id, user_id) DO UPDATE SET
            revoked_at = NULL`,
        [organizationId, profileId, userId, now()],
      );
    }
    const after = await readSpeakerGrant(command);
    if (
      after === undefined ||
      after.fields["User ID"] !== userId ||
      after.fields["Revoked At"] !== null
    ) {
      fail("WRITE_NOT_VERIFIED", "The speaker grant write could not be verified.");
    }
    return after;
  }

  function contactPayload(command, existing) {
    const contactId = contactIdFor(command);
    const displayName = identifier(command.displayName, "CRM contact display name");
    const email = normalizedEmail(command.recipientEmail);
    const names = splitName(displayName);
    const existingFields = recordFields(existing);
    const existingJson =
      typeof existingFields["Contact JSON"] === "string"
        ? jsonValue(existingFields["Contact JSON"], "CRM contact payload")
        : {};
    if (isObject(existingJson)) {
      if (
        existingJson.organizationId !== undefined &&
        existingJson.organizationId !== command.organizationId
      ) {
        fail("SCOPE_DRIFT", "The CRM contact has foreign organization scope.");
      }
      if (existingJson.email !== undefined && normalizedEmail(existingJson.email) !== email) {
        fail("IDENTITY_DRIFT", "The CRM contact email differs from the exact recipient.");
      }
      if (
        existingJson.customFields?.participantId !== undefined &&
        command.participantId !== undefined &&
        existingJson.customFields.participantId !== command.participantId
      ) {
        fail("IDENTITY_DRIFT", "The CRM contact is bound to a different participant.");
      }
      if (
        existingJson.customFields?.profileId !== undefined &&
        existingJson.customFields.profileId !== command.profileId
      ) {
        fail("PROFILE_DRIFT", "The CRM contact is bound to a different speaker profile.");
      }
    }
    const version = Number(existingFields.Version);
    return {
      id: contactId,
      organizationId: command.organizationId,
      firstName: command.firstName ?? names.firstName,
      lastName: command.lastName ?? names.lastName,
      displayName,
      email,
      phone: null,
      company: command.company ?? null,
      title: command.title ?? null,
      website: null,
      linkedinUrl: null,
      notes: null,
      tags: ["speaker", "acceptance"],
      customFields: {
        participantId: command.participantId,
        userId: command.contactUserId,
        profileId: command.profileId,
        eventId: command.eventId,
      },
      source: "speaker",
      status: "active",
      mergedIntoId: null,
      pipelineStage: "accepted",
      version: Number.isFinite(version) && version > 0 ? version + 1 : 1,
      createdAt: typeof existingJson.createdAt === "string" ? existingJson.createdAt : now(),
      updatedAt: now(),
    };
  }

  function contactFields(contact, command) {
    return {
      [APPLICATION_ID_FIELD]: contact.id,
      "Organization ID": contact.organizationId,
      "Display Name": contact.displayName,
      "First Name": contact.firstName,
      "Last Name": contact.lastName,
      Email: contact.email,
      Phone: contact.phone,
      Company: contact.company,
      Title: contact.title,
      Website: contact.website,
      "LinkedIn URL": contact.linkedinUrl,
      Notes: contact.notes,
      "Tags JSON": JSON.stringify(contact.tags),
      "Custom Fields JSON": JSON.stringify(contact.customFields),
      Source: contact.source,
      Status: contact.status,
      "Merged Into ID": contact.mergedIntoId,
      "Pipeline Stage": contact.pipelineStage,
      Version: contact.version,
      "Created At": contact.createdAt,
      "Updated At": contact.updatedAt,
      "Contact JSON": JSON.stringify(contact),
      "Settings JSON": JSON.stringify({ acceptance: { status: "draft", sentAt: null } }),
      "Audit JSON": JSON.stringify({ source: "production-repair", activityId: command.activityId }),
      "Provenance JSON": JSON.stringify({
        organizationId: command.organizationId,
        participantId: command.participantId,
        eventId: command.eventId,
        profileId: command.profileId,
        contactUserId: command.contactUserId,
      }),
    };
  }

  function historyPayload(command, contact) {
    const id = historyIdFor(command);
    return {
      id,
      organizationId: command.organizationId,
      contactId: contact.id,
      kind: "session",
      eventId: command.eventId,
      sessionId: command.sessionId ?? null,
      title: command.subject,
      detail: command.body,
      occurredAt: now(),
      metadata: {
        activityId: command.activityId,
        templateId: command.templateId,
        recipientUserId: command.contactUserId,
        recipientEmail: normalizedEmail(command.recipientEmail),
        subject: command.subject,
        body: command.body,
        status: "draft",
        sentAt: null,
      },
      status: "draft",
      sentAt: null,
    };
  }

  function historyFields(history, command) {
    return {
      [APPLICATION_ID_FIELD]: history.id,
      "Organization ID": history.organizationId,
      "Contact ID": history.contactId,
      "Event ID": history.eventId,
      "Session ID": history.sessionId,
      Kind: history.kind,
      Title: history.title,
      Detail: history.detail,
      "Occurred At": history.occurredAt,
      "Metadata JSON": JSON.stringify(history.metadata),
      "History JSON": JSON.stringify(history),
      "Settings JSON": JSON.stringify({ status: "draft", sentAt: null }),
      "Audit JSON": JSON.stringify({ source: "production-repair", activityId: command.activityId }),
      "Provenance JSON": JSON.stringify({
        organizationId: command.organizationId,
        eventId: command.eventId,
        contactId: history.contactId,
        recipientUserId: command.contactUserId,
      }),
    };
  }

  async function executeCrm(command) {
    const organizationId = identifier(command.organizationId, "Organization ID");
    const eventId = identifier(command.eventId, "Event ID");
    if (organizationId !== REPAIR_ORGANIZATION_ID || eventId !== REPAIR_EVENT_ID) {
      fail("SCOPE_MISMATCH", "CRM repair scope is immutable.");
    }
    if (command.status !== "draft" || command.sentAt !== null) {
      fail("CRM_SEND_FORBIDDEN", "Production repair CRM activity must remain an unsent draft.");
    }
    const contactId = contactIdFor(command);
    const historyId = historyIdFor(command);
    const contactRecords = await airtableLookup("CRM Contacts", contactId);
    const existingContact = exactRecordOrUndefined(contactRecords, "CRM contact");
    const historyRecords = await airtableLookup("CRM History", historyId);
    const existingHistory = exactRecordOrUndefined(historyRecords, "CRM history");
    if (existingHistory !== undefined) {
      const existingHistoryFields = recordFields(existingHistory);
      const existingHistoryJson =
        typeof existingHistoryFields["History JSON"] === "string"
          ? jsonValue(existingHistoryFields["History JSON"], "CRM history payload")
          : undefined;
      if (
        !isObject(existingHistoryJson) ||
        existingHistoryJson.contactId !== contactId ||
        existingHistoryJson.status !== "draft" ||
        existingHistoryJson.sentAt !== null
      ) {
        fail("CRM_DRIFT", "The existing CRM acceptance history differs from the draft command.");
      }
    }
    const contact = contactPayload(command, existingContact);
    if (existingContact === undefined || existingHistory === undefined) {
      if (existingContact === undefined || existingHistory === undefined) {
        await airtableWrite("CRM Contacts", existingContact, contactFields(contact, command));
      }
      if (existingHistory === undefined) {
        const history = historyPayload(command, contact);
        await airtableWrite("CRM History", undefined, historyFields(history, command));
      }
    }
    const afterContacts = await airtableLookup("CRM Contacts", contactId);
    const afterContact = exactRecordOrUndefined(afterContacts, "CRM contact");
    const afterHistory = exactRecordOrUndefined(
      await airtableLookup("CRM History", historyId),
      "CRM history",
    );
    if (afterContact === undefined || afterHistory === undefined) {
      fail("WRITE_NOT_VERIFIED", "The CRM draft write could not be verified.");
    }
    const afterHistoryFields = recordFields(afterHistory);
    const afterHistoryJson = jsonValue(afterHistoryFields["History JSON"], "CRM history payload");
    if (afterHistoryJson.status !== "draft" || afterHistoryJson.sentAt !== null) {
      fail("CRM_SEND_FORBIDDEN", "The CRM acceptance activity was not preserved as a draft.");
    }
    return {
      id: afterHistory.id ?? historyId,
      fields: {
        [APPLICATION_ID_FIELD]: command.activityId,
        "Organization ID": organizationId,
        "Event ID": eventId,
        "Contact ID": contactId,
        "Contact User ID": command.contactUserId,
        "Activity ID": command.activityId,
        "Template ID": command.templateId,
        Status: "draft",
        "Sent At": null,
      },
      contact: hideProviderRecordId(afterContact),
      history: hideProviderRecordId(afterHistory),
    };
  }

  async function executeReviewerPool(command) {
    const receipt = await readReviewPlan(command);
    if (receipt === undefined)
      fail("REVIEW_PLAN_MISSING", "The authoritative Review Plan is missing.");
    return {
      ...receipt,
      fields: {
        ...receipt.fields,
        "Repair Command": command.idempotencyKey ?? command.type,
        State: "verified",
      },
    };
  }

  async function execute(command) {
    if (!isObject(command)) fail("COMMAND_INVALID", "A repair command is required.");
    switch (command.type) {
      case "repair-identity":
        return executeIdentity(command);
      case "membership":
        return executeMembership(command);
      case "speaker-grant":
        return executeSpeakerGrant(command);
      case "reviewer-pool":
        return executeReviewerPool(command);
      case "crm-activity":
        return executeCrm(command);
      default:
        fail("COMMAND_UNSUPPORTED", "The production repair command kind is unsupported.");
    }
  }

  async function resolveUserId(input) {
    const record = await readIdentity(input?.email);
    return record === undefined
      ? undefined
      : { userId: record.userId, email: record.email, verified: record.verified };
  }
  async function verifyIdentity(input) {
    const email = normalizedEmail(input?.email);
    const userId = identifier(input?.userId, "User ID");
    const existing = await readIdentity(email);
    if (existing === undefined || existing.userId !== userId) {
      fail("IDENTITY_DRIFT", "The Better Auth identity no longer matches the exact repair email.");
    }
    if (!existing.verified) {
      if (input?.credentialBacked !== true) {
        fail(
          "IDENTITY_VERIFICATION_REQUIRED",
          "Credential-backed apply is required to verify this identity.",
        );
      }
      await d1Query(
        `UPDATE auth_users
            SET email_verified = 1, updated_at = ?
          WHERE id = ? AND lower(email) = lower(?)`,
        [now(), userId, email],
      );
    }
    const after = await readIdentity(email);
    if (after === undefined || after.userId !== userId || !after.verified) {
      fail(
        "IDENTITY_VERIFICATION_FAILED",
        "Better Auth identity verification could not be confirmed.",
      );
    }
    return true;
  }

  async function recordLedger(entry) {
    if (!isObject(entry)) fail("LEDGER_INVALID", "A repair ledger entry is required.");
    const key = identifier(entry.key, "Repair ledger key");
    const requestDigest = required(entry.inputDigest, "Repair ledger digest");
    if (!/^[a-f0-9]{64}$/u.test(requestDigest))
      fail("LEDGER_INVALID", "Repair ledger digest is invalid.");
    const durableKey = `${key}:${requestDigest}`;
    const tenantId = REPAIR_ORGANIZATION_ID;
    const scope = "production-repair";
    const state =
      entry.state === "complete"
        ? "completed"
        : entry.state === "started"
          ? "processing"
          : "failed";
    const responseJson = JSON.stringify({
      key,
      state: entry.state,
      expectedObjectId: entry.expectedObjectId,
      inputDigest: requestDigest,
      updatedAt: entry.updatedAt,
      ...(entry.userId === undefined ? {} : { userId: entry.userId }),
      ...(entry.version === undefined ? {} : { version: entry.version }),
      ...(entry.recovered === undefined ? {} : { recovered: entry.recovered }),
    });
    const existingQuery = await d1Query(
      `SELECT tenant_id, scope, idempotency_key, request_digest, state, response_json
         FROM idempotency_records
        WHERE tenant_id = ? AND scope = ? AND idempotency_key = ?
        LIMIT 2`,
      [tenantId, scope, durableKey],
    );
    const existing = exactRecordOrUndefined(existingQuery.rows, "repair ledger");
    if (existing !== undefined && existing.request_digest !== requestDigest) {
      fail(
        "LEDGER_DIGEST_MISMATCH",
        "The durable repair ledger digest differs from the command digest.",
      );
    }
    const createdAt = typeof entry.updatedAt === "string" ? entry.updatedAt : now();
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    await d1Query(
      `INSERT INTO idempotency_records
          (tenant_id, scope, idempotency_key, request_digest, state, response_status, response_json, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (tenant_id, scope, idempotency_key) DO UPDATE SET
          request_digest = excluded.request_digest,
          state = excluded.state,
          response_status = excluded.response_status,
          response_json = excluded.response_json,
          expires_at = excluded.expires_at`,
      [tenantId, scope, durableKey, requestDigest, state, 200, responseJson, createdAt, expiresAt],
    );
    return { key, state: entry.state, requestDigest };
  }

  const airtable = {
    lookup: async (operation) => {
      if (!isObject(operation)) fail("COMMAND_INVALID", "An Airtable operation is required.");
      const records =
        typeof operation.applicationId === "string" && operation.applicationId.length > 0
          ? await airtableLookup(operation.table, operation.applicationId, {
              allowNonCanonical: operation.phase === "reset-workflow",
            })
          : operation.phase === "reset-workflow" && typeof operation.recordId === "string"
            ? await airtableLookupByRecordId(operation.table, operation.recordId)
            : fail("APPLICATION_ID_REQUIRED", "Airtable operations require an Application ID.");
      return normalizeAirtableRecordLinks(operation, records);
    },
    write: async (input) => airtableWrite(input.table, input.existing, input.fields),
    delete: async (input) => airtableDelete(input),
  };

  return {
    read,
    lookup: read,
    execute,
    discoverWorkflowRecords,
    listWorkflowRecords: discoverWorkflowRecords,
    delete: deleteWorkflowRecord,
    listEventRecords: discoverWorkflowRecords,
    listScopedRecords: discoverWorkflowRecords,
    write: async (input) => {
      if (input?.store === "airtable") return airtable.write(input);
      return execute(input?.command ?? input?.payload ?? input);
    },
    verifyIdentity,
    resolveUserId,
    recordLedger,
    airtable,
    // Exposed for deterministic adapter tests without exposing any credentials.
    _internals: Object.freeze({
      d1Query,
      airtableLookup,
      airtableWrite,
      airtableDelete,
      digest,
      airtableResetDigest,
      resetScopeProof,
    }),
  };
}

export const createCloudflareD1RepairAdapter = createProductionRepairAdapter;
export const createBuiltInProductionRepairAdapter = createProductionRepairAdapter;
export default createProductionRepairAdapter;
