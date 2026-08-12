import assert from "node:assert/strict";
import test from "node:test";
import {
  createProductionRepairAdapter,
  ProductionRepairAdapterError,
} from "./production-repair-adapter.mjs";
import {
  buildRepairManifest,
  createRepairTransport,
  prepareRepair,
} from "./repair-devflow-production.mjs";

const CONFIG = {
  accountId: "account-test",
  apiToken: "cloudflare-secret",
  databaseId: "database-test",
  baseId: "base-test",
  accessToken: "airtable-secret",
};
const PARTICIPANT_ID = "devflow-conf-2027-participant-speaker-priya";
const PROFILE_ID = `speaker-profile:devflow-conf-2027:${PARTICIPANT_ID}`;
const CONTACT_ID = `crm-contact:${PROFILE_ID}`;

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function d1(rows = [], meta = {}) {
  return response({ success: true, result: [{ results: rows, meta }] });
}

function identityInputs() {
  return {
    "organizer-agenda": { email: "agenda@example.test", userId: "user-agenda", verified: true },
    "organizer-fixture": { email: "fixture@example.test", userId: "user-fixture", verified: true },
    "reviewer-sam": { email: "reviewer@example.test", userId: "user-reviewer", verified: true },
    "speaker-priya": { email: "priya@example.test", userId: "user-priya", verified: true },
    "speaker-marcus": { email: "marcus@example.test", userId: "user-marcus", verified: true },
    submitter: { email: "submitter@example.test", userId: "user-submitter", verified: true },
  };
}

function adapterWith(fetchImplementation) {
  return createProductionRepairAdapter({ ...CONFIG, fetchImplementation });
}
test("repair ledger records are isolated by operation digest", async () => {
  const queries = [];
  const adapter = adapterWith(async (_url, init) => {
    queries.push(JSON.parse(init.body));
    return d1();
  });
  const key = "workflow-reset:v1:delete:d1:outbox_jobs:job-1";
  const inputDigest = "a".repeat(64);

  await adapter.recordLedger({
    key,
    inputDigest,
    state: "started",
    updatedAt: "2026-08-12T00:00:00.000Z",
  });

  const durableKey = `${key}:${inputDigest}`;
  assert.equal(queries.length, 2);
  assert.equal(queries[0].params[2], durableKey);
  assert.equal(queries[1].params[2], durableKey);
});

test("D1 identity lookup normalizes email and binds every value", async () => {
  const calls = [];
  const adapter = adapterWith(async (url, init) => {
    calls.push({ url: String(url), init });
    return d1([{ id: "user-1", email: "Priya@Example.test", email_verified: 1, name: "Priya" }]);
  });
  const records = await adapter.read({
    kind: "identity",
    payload: { email: "  PRIYA@EXAMPLE.TEST " },
  });
  assert.equal(records[0].userId, "user-1");
  const request = calls[0];
  const body = JSON.parse(request.init.body);
  assert.equal(
    request.url,
    "https://api.cloudflare.com/client/v4/accounts/account-test/d1/database/database-test/query",
  );
  assert.deepEqual(body.params, ["priya@example.test"]);
  assert.equal(body.sql.includes("priya@example.test"), false);
  assert.equal(request.init.headers.Authorization, `Bearer ${CONFIG.apiToken}`);
});

test("duplicate D1 identities fail closed", async () => {
  const adapter = adapterWith(async () =>
    d1([
      { id: "user-1", email: "same@example.test", email_verified: 1 },
      { id: "user-2", email: "same@example.test", email_verified: 1 },
    ]),
  );
  await assert.rejects(
    adapter.read({ kind: "identity", payload: { email: "same@example.test" } }),
    (error) => error instanceof ProductionRepairAdapterError && error.code === "DUPLICATE_OBJECT",
  );
});

test("membership role drift is rejected before a D1 write", async () => {
  const requests = [];
  const adapter = adapterWith(async (_url, init) => {
    const body = JSON.parse(init.body);
    requests.push(body);
    return d1([{ organization_id: "ai-engineer", user_id: "user-1", role: "reviewer" }]);
  });
  await assert.rejects(
    adapter.execute({
      type: "membership",
      organizationId: "ai-engineer",
      userId: "user-1",
      role: "admin",
    }),
    (error) => error instanceof ProductionRepairAdapterError && error.code === "ROLE_DRIFT",
  );
  assert.equal(requests.length, 1);
  assert.equal(requests[0].sql.startsWith("SELECT"), true);
});

test("unresolved reviewer pools defer provider reads until identity resolution", async () => {
  let calls = 0;
  const adapter = adapterWith(async () => {
    calls += 1;
    return response({ records: [] });
  });
  const records = await adapter.read({
    kind: "reviewer-pool",
    payload: {
      reviewPlanId: "plan-1",
      roundId: "round-1",
      reviewerId: "identity:reviewer-sam",
    },
  });
  assert.deepEqual(records, []);
  assert.equal(calls, 0);
});

test("prepare with the built-in adapter performs no provider writes", async () => {
  const requests = [];
  const adapter = adapterWith(async (url, init) => {
    requests.push({ url: String(url), method: init.method ?? "GET", body: init.body });
    if (String(url).includes("api.cloudflare.com")) return d1([]);
    return response({ records: [] });
  });
  const manifest = buildRepairManifest({ identities: identityInputs() });
  const prepared = await prepareRepair({
    manifest,
    transport: createRepairTransport({ airtable: adapter.airtable, commandAdapter: adapter }),
    now: "2026-08-09T12:00:00.000Z",
    writeManifest: false,
  });
  assert.equal(prepared.prepared.writes, 0);
  assert.equal(
    requests.some(
      (request) =>
        request.method !== "GET" &&
        !(
          request.url.includes("api.cloudflare.com") &&
          typeof request.body === "string" &&
          JSON.parse(request.body).sql.trimStart().startsWith("SELECT")
        ),
    ),
    false,
  );
});

test("Airtable lookup verifies and normalizes linked Application IDs", async () => {
  const adapter = adapterWith(async (url) => {
    const parsed = new URL(url);
    const table = decodeURIComponent(parsed.pathname.split("/").at(-1));
    if (table === "Review Plans") {
      return response({
        records: [
          {
            id: "rec-plan",
            fields: {
              "Application ID": "plan-1",
              Event: ["rec-event"],
              Name: "Initial Review",
            },
          },
        ],
      });
    }
    if (table === "Events") {
      return response({
        records: [{ id: "rec-event", fields: { "Application ID": "event-1" } }],
      });
    }
    return response({ records: [] });
  });
  const records = await adapter.airtable.lookup({
    table: "Review Plans",
    id: "plan-1",
    fields: { Event: "event-1" },
  });
  assert.equal(records[0].fields.Event, "event-1");
});

test("CRM apply writes contact and recipient-scoped draft history without sending", async () => {
  const requests = [];
  const records = new Map();
  const adapter = adapterWith(async (url, init = {}) => {
    const method = init.method ?? "GET";
    const parsedUrl = new URL(url);
    const parts = parsedUrl.pathname.split("/");
    const table = decodeURIComponent(parts.at(-1));
    const body = init.body === undefined ? undefined : JSON.parse(init.body);
    requests.push({ url: String(url), method, table, body });
    if (method === "GET") {
      assert.equal(parsedUrl.searchParams.get("maxRecords"), "2");
      assert.match(parsedUrl.searchParams.get("filterByFormula"), /^\{Application ID\}=/u);
      const applicationId = parsedUrl.searchParams
        .get("filterByFormula")
        .match(/="((?:\\"|[^" ])*)"/u)?.[1]
        ?.replaceAll('\\"', '"');
      const record = records.get(`${table}:${applicationId}`);
      return response({ records: record === undefined ? [] : [record] });
    }
    const applicationId = body.fields["Application ID"];
    const record = { id: `rec-${records.size + 1}`, fields: body.fields };
    records.set(`${table}:${applicationId}`, record);
    return response(record);
  });
  const command = {
    type: "crm-activity",
    operation: "ensure",
    organizationId: "ai-engineer",
    eventId: "devflow-conf-2027",
    identityKey: "speaker-priya",
    participantId: PARTICIPANT_ID,
    profileId: PROFILE_ID,
    contactId: CONTACT_ID,
    historyId: "activity-1:history",
    displayName: "Priya Raman",
    contactUserId: "user-priya",
    recipientEmail: "priya@example.test",
    activityId: "activity-1",
    templateId: "template-1",
    sessionId: "session-1",
    subject: "Your talk was accepted",
    body: "Congratulations, Priya.",
    status: "draft",
    sentAt: null,
  };
  const result = await adapter.execute(command);
  assert.equal(result.fields.Status, "draft");
  assert.equal(result.fields["Sent At"], null);
  assert.deepEqual(
    requests.filter((request) => request.method !== "GET").map((request) => request.table),
    ["CRM Contacts", "CRM History"],
  );
  assert.equal(
    requests.some((request) => /send|mail|opensend/iu.test(request.url)),
    false,
  );
  const contactWrite = requests.find(
    (request) => request.table === "CRM Contacts" && request.method !== "GET",
  );
  assert.equal(contactWrite.body.fields["Application ID"], CONTACT_ID);
  const history = requests.find(
    (request) => request.table === "CRM History" && request.method !== "GET",
  );
  assert.equal(history.body.fields["History JSON"].includes('"status":"draft"'), true);
  assert.equal(history.body.fields["History JSON"].includes('"sentAt":null'), true);
});
test("legacy speaker profile IDs are rejected before Airtable lookup", async () => {
  let calls = 0;
  const adapter = adapterWith(async () => {
    calls += 1;
    return response({ records: [] });
  });
  await assert.rejects(
    adapter.read({
      kind: "crm-activity",
      payload: {
        organizationId: "ai-engineer",
        eventId: "devflow-conf-2027",
        profileId: "devflow-conf-2027-speaker-priya-raman",
        recipientEmail: "priya@example.test",
        activityId: "activity-legacy",
      },
    }),
    (error) => error instanceof ProductionRepairAdapterError && error.code === "PROFILE_ID_INVALID",
  );
  await assert.rejects(
    adapter.airtable.lookup({
      table: "Speaker Profiles",
      id: "devflow-conf-2027-speaker-priya-raman",
    }),
    (error) => error instanceof ProductionRepairAdapterError && error.code === "PROFILE_ID_INVALID",
  );
  assert.equal(calls, 0);
});

test("speaker grant lookup uses the canonical event participant profile ID", async () => {
  const requests = [];
  const adapter = adapterWith(async (_url, init) => {
    const body = JSON.parse(init.body);
    requests.push(body);
    return d1([
      {
        organization_id: "ai-engineer",
        speaker_profile_id: PROFILE_ID,
        user_id: "user-priya",
        revoked_at: null,
      },
    ]);
  });
  const records = await adapter.read({
    kind: "speaker-grant",
    payload: {
      organizationId: "ai-engineer",
      eventId: "devflow-conf-2027",
      participantId: PARTICIPANT_ID,
      speakerProfileId: PROFILE_ID,
      userId: "user-priya",
    },
  });
  assert.equal(records[0].fields["Speaker Profile ID"], PROFILE_ID);
  assert.deepEqual(requests[0].params, ["ai-engineer", PROFILE_ID]);
});

test("provider failures do not echo secrets", async () => {
  const adapter = adapterWith(async () => response({ error: CONFIG.apiToken }, 500));
  await assert.rejects(
    adapter.read({ kind: "identity", payload: { email: "secret@example.test" } }),
    (error) => {
      assert.equal(error instanceof ProductionRepairAdapterError, true);
      assert.equal(error.message.includes(CONFIG.apiToken), false);
      return error.code === "D1_REQUEST_FAILED";
    },
  );
});
test("workflow deletes use exact provider identity and optimistic record digest", async () => {
  const requests = [];
  const record = {
    id: "rec-session",
    fields: {
      "Application ID": "session-1",
      "Organization ID": "ai-engineer",
      "Event ID": "devflow-conf-2027",
      Version: 3,
    },
  };
  let deleted = false;
  const adapter = adapterWith(async (url, init = {}) => {
    const method = init.method ?? "GET";
    requests.push({ url: String(url), method });
    if (method === "GET") {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/Sessions/rec-session")) {
        return response(deleted ? {} : record);
      }
      return response({ records: deleted ? [] : [record] });
    }
    if (method === "DELETE") {
      deleted = true;
      return response({ id: "rec-session", deleted: true });
    }
    return response({});
  });
  const result = await adapter.delete({
    store: "airtable",
    table: "Sessions",
    applicationId: "session-1",
    recordId: "rec-session",
    recordDigest: adapter._internals.airtableResetDigest(record),
    organizationId: "ai-engineer",
    eventId: "devflow-conf-2027",
  });
  assert.equal(result.deleted, true);
  assert.equal(requests.at(-1).method, "DELETE");
  const missing = await adapter.delete({
    store: "airtable",
    table: "Sessions",
    applicationId: "session-1",
    recordId: "rec-session",
    recordDigest: adapter._internals.airtableResetDigest(record),
    organizationId: "ai-engineer",
    eventId: "devflow-conf-2027",
  });
  assert.equal(missing.missing, true);
});
test("workflow reset ignores linked array drift but rejects scalar drift before delete", async () => {
  const record = {
    id: "rec-participant",
    fields: {
      "Application ID": "participant-1",
      "Organization ID": "ai-engineer",
      "Event ID": "devflow-conf-2027",
      Version: 3,
      Name: "Priya Raman",
      "Session Roster": ["rec-roster"],
    },
  };
  const current = structuredClone(record);
  let deleteCount = 0;
  const adapter = adapterWith(async (url, init = {}) => {
    const method = init.method ?? "GET";
    const parsed = new URL(url);
    if (parsed.hostname === "api.cloudflare.com") return d1([]);
    const table = decodeURIComponent(parsed.pathname.split("/").at(-1));
    if (method === "GET") {
      return table === "Participants"
        ? response({ records: [current] })
        : response({ records: [] });
    }
    if (method === "DELETE") {
      deleteCount += 1;
      return response({ id: current.id, deleted: true });
    }
    return response({});
  });

  const discovered = await adapter.discoverWorkflowRecords();
  const target = discovered.find(
    (candidate) => candidate.store === "airtable" && candidate.table === "Participants",
  );
  assert.ok(target);
  assert.equal(target.recordDigest, adapter._internals.airtableResetDigest(record));

  current.fields["Session Roster"] = [];
  const arrayDriftResult = await adapter.delete({
    ...target,
    organizationId: "ai-engineer",
    eventId: "devflow-conf-2027",
  });
  assert.equal(arrayDriftResult.deleted, true);
  assert.equal(deleteCount, 1);

  current.fields.Name = "Changed";
  await assert.rejects(
    adapter.delete({
      ...target,
      organizationId: "ai-engineer",
      eventId: "devflow-conf-2027",
    }),
    (error) =>
      error instanceof ProductionRepairAdapterError && error.code === "RESET_VERSION_CONFLICT",
  );
  assert.equal(deleteCount, 1);
});

test("D1 reset deletes tenant-scoped outbox rows and rejects foreign tenants", async () => {
  const queries = [];
  const adapter = adapterWith(async (_url, init = {}) => {
    queries.push(JSON.parse(init.body));
    return d1([], { changes: 1 });
  });
  const row = {
    id: "outbox-1",
    tenant_id: "ai-engineer",
    topic: "cache-invalidation",
    payload_json: JSON.stringify({ eventId: "devflow-conf-2027" }),
  };

  const result = await adapter.delete({
    store: "d1",
    table: "outbox_jobs",
    recordId: row.id,
    row,
    recordDigest: adapter._internals.digest(row),
    organizationId: "ai-engineer",
    eventId: "devflow-conf-2027",
  });

  assert.equal(result.deleted, true);
  assert.match(queries[0].sql, /DELETE FROM outbox_jobs/u);
  assert.deepEqual(queries[0].params, [row.id, "ai-engineer", row.payload_json]);

  await assert.rejects(
    adapter.delete({
      store: "d1",
      table: "outbox_jobs",
      recordId: row.id,
      row: { ...row, tenant_id: "foreign-organization" },
      organizationId: "ai-engineer",
      eventId: "devflow-conf-2027",
    }),
    (error) => error instanceof ProductionRepairAdapterError && error.code === "SCOPE_MISMATCH",
  );
  assert.equal(queries.length, 1);
});

test("projection scope proof ignores nested display fields and rejects strong foreign IDs", () => {
  const adapter = adapterWith(async () => d1());
  const agenda = adapter._internals.resetScopeProof({
    fields: {
      Event: "devflow-conf-2027",
      "Conflicts JSON": JSON.stringify({
        eventId: "devflow-conf-2027",
        event: { slug: "devflow-conf-2027" },
      }),
    },
  });
  const speakers = adapter._internals.resetScopeProof({
    fields: {
      "Organization ID": "ai-engineer",
      "Event Slug": "devflow-conf-2027",
      "Projection JSON": JSON.stringify({
        event: { slug: "devflow-conf-2027" },
        speakers: [{ organization: "Buildkite" }],
      }),
    },
  });
  const foreign = adapter._internals.resetScopeProof({
    fields: {
      "Organization ID": "ai-engineer",
      "Event Slug": "foreign-event",
      "Projection JSON": JSON.stringify({
        organizationId: "foreign-organization",
        eventId: "foreign-event",
      }),
    },
  });

  assert.deepEqual(agenda, {
    organizationId: false,
    eventId: true,
    foreignOrganization: false,
    foreignEvent: false,
  });
  assert.deepEqual(speakers, {
    organizationId: true,
    eventId: true,
    foreignOrganization: false,
    foreignEvent: false,
  });
  assert.deepEqual(foreign, {
    organizationId: true,
    eventId: false,
    foreignOrganization: true,
    foreignEvent: true,
  });
});
