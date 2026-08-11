import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AirtableProvisionError,
  APPLICATION_ID_FIELD,
  parseProvisioningArguments,
  provisionAirtableSchema,
  readAirtableConfiguration,
  TABLE_DEFINITIONS,
} from "./provision.mjs";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function metadataMock(initialTables = []) {
  const tables = structuredClone(initialTables);
  let nextTable = 1;
  let nextField = 1;
  const requests = [];
  const fetchImplementation = async (url, options = {}) => {
    const parsed = new URL(url);
    const path = parsed.pathname;
    const method = options.method ?? "GET";
    const body = options.body === undefined ? undefined : JSON.parse(options.body);
    requests.push({ method, path, body, authorization: options.headers?.Authorization });

    if (method === "GET" && path.endsWith("/tables")) return jsonResponse({ tables });
    const tableMatch = path.match(/\/tables\/(tbl\d+)(?:\/fields(?:\/(fld\d+))?)?$/);
    if (method === "POST" && path.endsWith("/tables")) {
      const table = {
        id: `tbl${String(nextTable++).padStart(3, "0")}`,
        name: body.name,
        description: body.description,
        fields: body.fields.map((field) => ({
          ...field,
          id: `fld${String(nextField++).padStart(3, "0")}`,
        })),
      };
      tables.push(table);
      return jsonResponse(table, 200);
    }
    if (tableMatch === null) return jsonResponse({ error: { type: "NOT_FOUND" } }, 404);
    const [, tableId, fieldId] = tableMatch;
    const table = tables.find((candidate) => candidate.id === tableId);
    if (table === undefined) return jsonResponse({ error: { type: "NOT_FOUND" } }, 404);
    if (method === "PATCH" && fieldId === undefined) {
      Object.assign(table, body);
      return jsonResponse(table);
    }
    if (method === "POST" && fieldId === undefined) {
      const field = { ...body, id: `fld${String(nextField++).padStart(3, "0")}` };
      table.fields.push(field);
      return jsonResponse(field);
    }
    if (method === "PATCH" && fieldId !== undefined) {
      const field = table.fields.find((candidate) => candidate.id === fieldId);
      if (field === undefined) return jsonResponse({ error: { type: "NOT_FOUND" } }, 404);
      Object.assign(field, body);
      return jsonResponse(field);
    }
    return jsonResponse({ error: { type: "INVALID_REQUEST" } }, 400);
  };
  return { fetchImplementation, requests, tables };
}

test("creates the complete schema and is idempotent on a repeated apply", async () => {
  const mock = metadataMock();
  const first = await provisionAirtableSchema({
    accessToken: "test-token",
    baseId: "app_test",
    mode: "apply",
    fetchImplementation: mock.fetchImplementation,
    apiOrigin: "https://airtable.test",
  });

  assert.equal(first.createdTables.length, TABLE_DEFINITIONS.length);
  assert.equal(first.addedFields.length > TABLE_DEFINITIONS.length, true);
  assert.equal(mock.tables.length, TABLE_DEFINITIONS.length);
  for (const table of mock.tables) {
    assert.equal(
      table.fields.some((field) => field.name === APPLICATION_ID_FIELD),
      true,
    );
  }
  const requestsAfterFirstApply = mock.requests.length;

  const second = await provisionAirtableSchema({
    accessToken: "test-token",
    baseId: "app_test",
    mode: "apply",
    fetchImplementation: mock.fetchImplementation,
    apiOrigin: "https://airtable.test",
  });

  assert.deepEqual(second.createdTables, []);
  assert.deepEqual(second.addedFields, []);
  assert.deepEqual(second.updatedFields, []);
  assert.deepEqual(second.updatedTables, []);
  assert.equal(mock.requests.length, requestsAfterFirstApply + 2);
  assert.equal(mock.requests.at(-1).method, "GET");
  assert.equal(
    mock.requests.some((request) => request.method === "DELETE" || request.method === "PUT"),
    false,
  );
});

test("dry-run reads metadata and emits a mutation plan without writing", async () => {
  const mock = metadataMock([
    {
      id: "tbl001",
      name: "Table 1",
      description: "Unmanaged table",
      fields: [{ id: "fld001", name: "Name", type: "singleLineText" }],
    },
  ]);
  const summary = await provisionAirtableSchema({
    accessToken: "test-token",
    baseId: "app_test",
    mode: "dry-run",
    fetchImplementation: mock.fetchImplementation,
    apiOrigin: "https://airtable.test",
  });

  assert.equal(summary.mode, "dry-run");
  assert.equal(summary.createdTables.length, TABLE_DEFINITIONS.length);
  assert.equal(
    summary.actions.some((action) => action.action === "create-table"),
    true,
  );
  assert.deepEqual(
    mock.requests.map((request) => request.method),
    ["GET"],
  );
  assert.equal(mock.tables.length, 1);
});

test("reconciles missing fields and descriptions without deleting unmanaged fields", async () => {
  const source = metadataMock();
  await provisionAirtableSchema({
    accessToken: "test-token",
    baseId: "app_test",
    mode: "apply",
    fetchImplementation: source.fetchImplementation,
    apiOrigin: "https://airtable.test",
  });
  const events = source.tables.find((table) => table.name === "Events");
  events.fields = events.fields.filter((field) => field.name !== "Settings JSON");
  events.fields.push({ id: "fld-unmanaged", name: "Operator Note", type: "multilineText" });
  events.description = "old description";
  const before = events.fields.length;

  const result = await provisionAirtableSchema({
    accessToken: "test-token",
    baseId: "app_test",
    mode: "apply",
    fetchImplementation: source.fetchImplementation,
    apiOrigin: "https://airtable.test",
  });

  assert.equal(result.addedFields.includes("Events.Settings JSON"), true);
  assert.equal(result.updatedTables.includes("Events"), true);
  assert.equal(
    events.fields.some((field) => field.name === "Operator Note"),
    true,
  );
  assert.equal(events.fields.length, before + 1);
});

test("reports missing metadata scope without exposing credentials", async () => {
  const secret = "pat_secret_value";
  const error = await assert.rejects(
    provisionAirtableSchema({
      accessToken: secret,
      baseId: "app_test",
      mode: "dry-run",
      fetchImplementation: async () =>
        jsonResponse({ error: { type: "INVALID_PERMISSIONS" } }, 403),
      apiOrigin: "https://airtable.test",
    }),
    (candidate) => {
      assert.equal(candidate instanceof AirtableProvisionError, true);
      assert.equal(candidate.code, "INSUFFICIENT_SCOPE");
      assert.match(candidate.message, /schema\.bases:read/);
      assert.equal(candidate.message.includes(secret), false);
      return true;
    },
  );
  assert.equal(error, undefined);
});
test("provisions the immutable published speaker projection table", () => {
  const definition = TABLE_DEFINITIONS.find(
    (candidate) => candidate.name === "Published Speaker Projections",
  );
  assert.ok(definition);
  assert.deepEqual(
    definition.fields.map((field) => field.name),
    [
      "Application ID",
      "Organization ID",
      "Event Slug",
      "Revision ID",
      "Revision Number",
      "Published At",
      "Projection JSON",
    ],
  );
});
test("covers the expanded business-authority schema and sender identities", () => {
  const requiredTables = [
    "Sessions",
    "Rooms",
    "Tracks",
    "Formats",
    "Levels",
    "Tags",
    "Session Statuses",
    "Session Settings",
    "Portal Contexts",
    "Session Roster",
    "Task Forms",
    "Task Responses",
    "Portal Resources",
    "Wiki Pages",
    "File Assets",
    "File Versions",
    "File Comments",
    "Email Templates",
    "Email Send Snapshots",
    "Report Definitions",
    "Report Runs",
    "Remix Candidates",
    "Remix Audit",
    "Reusable Fields",
  ];
  const definitions = new Map(TABLE_DEFINITIONS.map((definition) => [definition.name, definition]));
  for (const tableName of requiredTables) {
    const definition = definitions.get(tableName);
    assert.ok(definition, `missing Airtable table definition: ${tableName}`);
    const fieldNames = new Set(definition.fields.map((field) => field.name));
    for (const fieldName of [
      APPLICATION_ID_FIELD,
      "Organization ID",
      "Event ID",
      "Version",
      "Status",
      "Settings JSON",
      "Audit JSON",
      "Provenance JSON",
    ]) {
      assert.equal(
        fieldNames.has(fieldName),
        true,
        `${tableName} is missing required ${fieldName} field`,
      );
    }
  }

  const emailTemplate = definitions.get("Email Templates");
  const senderField = emailTemplate?.fields.find((field) => field.name === "Sender");
  assert.deepEqual(
    senderField?.options?.choices?.map((choice) => choice.name),
    [
      "auth@sessionboard.namuh.co",
      "speakers@sessionboard.namuh.co",
      "calendar@sessionboard.namuh.co",
    ],
  );

  const expectedSenders = [
    "auth@sessionboard.namuh.co",
    "speakers@sessionboard.namuh.co",
    "calendar@sessionboard.namuh.co",
  ];
  const envExample = readFileSync(".env.example", "utf8");
  const setupGuide = readFileSync("docs/setup.md", "utf8");
  for (const sender of expectedSenders) {
    assert.equal(envExample.includes(sender), true);
    assert.equal(setupGuide.includes(sender), true);
  }
  assert.equal(envExample.includes("foreverbrowsing.com"), false);
  assert.equal(setupGuide.includes("foreverbrowsing.com"), false);
  assert.equal(readFileSync("ARCHITECTURE.md", "utf8").includes("Accelevents"), false);
});
test("declares dedicated CRM authority tables and payload fields", () => {
  const definitions = new Map(TABLE_DEFINITIONS.map((definition) => [definition.name, definition]));
  const payloadFields = new Map([
    ["CRM Contacts", "Contact JSON"],
    ["CRM Segments", "Segment JSON"],
    ["CRM History", "History JSON"],
    ["CRM Pipeline", "Pipeline JSON"],
    ["CRM Notes", "Note JSON"],
    ["CRM Event Projections", "Projection JSON"],
    ["CRM Outreach", "Outreach JSON"],
    ["CRM Imports", "Import JSON"],
    ["CRM Commands", "Result JSON"],
  ]);
  for (const [tableName, payloadField] of payloadFields) {
    const definition = definitions.get(tableName);
    assert.ok(definition, `missing CRM table definition: ${tableName}`);
    const fields = new Set(definition.fields.map((field) => field.name));
    assert.equal(fields.has(APPLICATION_ID_FIELD), true);
    assert.equal(fields.has("Organization ID"), true);
    assert.equal(fields.has(payloadField), true);
  }
});

test("validates configuration and command modes", () => {
  assert.deepEqual(
    readAirtableConfiguration({ AIRTABLE_ACCESS_TOKEN: " token ", AIRTABLE_BASE_ID: " app " }),
    {
      accessToken: "token",
      baseId: "app",
    },
  );
  assert.throws(
    () => readAirtableConfiguration({ AIRTABLE_ACCESS_TOKEN: "token" }),
    (error) => error.code === "CONFIGURATION_ERROR" && error.message.includes("AIRTABLE_BASE_ID"),
  );
  assert.deepEqual(parseProvisioningArguments(["--apply"]), { help: false, mode: "apply" });
  assert.deepEqual(parseProvisioningArguments(["--dry-run"]), { help: false, mode: "dry-run" });
  assert.throws(
    () => parseProvisioningArguments(["--apply", "--dry-run"]),
    /either --apply or --dry-run/,
  );
});
