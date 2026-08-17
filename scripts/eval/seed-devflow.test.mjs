import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSeedRecords,
  DevflowSeedError,
  FULL_CHAIN_MODE,
  PRODUCTION_CONFIRMATION,
  planUpserts,
  runSeed,
  SUBSET_FALLBACK_MODE,
} from "./seed-devflow.mjs";

const NOW = "2026-08-09T12:00:00.000Z";
const ENV = {
  EVAL_ENVIRONMENT: "staging",
  AIRTABLE_ACCESS_TOKEN: "test-token",
  AIRTABLE_BASE_ID: "app_test",
};
const TEST_FIXTURE = {
  event: {
    name: "Evaluator Test Conference",
    tagline: "A deterministic evaluator fixture.",
    dates: "2027-09-15 to 2027-09-16",
    location: "Test Convention Center",
    description: "Repository-owned data for the evaluator seed unit tests.",
    tracks: ["Platform & Infra", "AI Engineering"],
    session_formats: ["Talk (30 min)", "Lightning Talk (10 min)", "Workshop (120 min)"],
    rooms: ["Room 2A", "Room 2B"],
  },
  identities: {
    organizer: { name: "Test Organizer", email: "organizer@example.test" },
    reviewer: { name: "Test Reviewer", email: "reviewer@example.test" },
    reviewer2: { name: "Second Reviewer", email: "reviewer2@example.test" },
    speaker: { name: "Test Speaker", email: "speaker@example.test" },
    speaker2: { name: "Second Speaker", email: "speaker2@example.test" },
  },
  submissions: [
    { title: "Official evaluator scenario one" },
    { title: "Official evaluator scenario two" },
  ],
};

function runTestSeed(options) {
  return runSeed({ fixture: TEST_FIXTURE, ...options });
}

function fieldsFor(records, table, applicationId) {
  const record = records.find(
    (candidate) => candidate.table === table && candidate.applicationId === applicationId,
  );
  assert.ok(record, `${table}/${applicationId} was not planned`);
  return record.fields;
}

function fakeAirtable() {
  const tables = new Map();
  const requests = [];
  let nextRecordId = 1;
  function tableRecords(table) {
    const records = tables.get(table);
    if (records !== undefined) return records;
    const created = [];
    tables.set(table, created);
    return created;
  }
  function tableFromUrl(url) {
    const pathname = new URL(url).pathname.split("/");
    return decodeURIComponent(pathname[3] ?? "");
  }
  function applicationIdFromFormula(formula) {
    const match = /Application ID\}="((?:\\.|[^"])*)"/u.exec(formula ?? "");
    return match === null ? undefined : match[1].replaceAll('\\"', '"').replaceAll("\\\\", "\\");
  }
  return {
    tables,
    requests,
    fetchImplementation: async (url, init = {}) => {
      const method = init.method ?? "GET";
      requests.push({ url, method });
      assert.notEqual(method, "DELETE");
      assert.notEqual(method, "PUT");
      const table = tableFromUrl(url);
      const records = tableRecords(table);
      if (method === "GET") {
        const query = new URL(url).searchParams;
        const applicationId = applicationIdFromFormula(query.get("filterByFormula"));
        return Response.json({
          records: records.filter((record) => record.fields["Application ID"] === applicationId),
        });
      }
      const body = JSON.parse(init.body);
      if (method === "POST") {
        const record = { id: `rec_fake_${nextRecordId++}`, fields: body.fields };
        records.push(record);
        return Response.json(record, { status: 201 });
      }
      if (method === "PATCH") {
        const recordId = decodeURIComponent(new URL(url).pathname.split("/").at(-1));
        const record = records.find((candidate) => candidate.id === recordId);
        assert.ok(record, `missing fake Airtable record ${recordId}`);
        record.fields = { ...record.fields, ...body.fields };
        return Response.json(record);
      }
      return Response.json({ error: { type: "UNSUPPORTED" } }, { status: 405 });
    },
  };
}

test("builds exact fixture-driven CFP schema and leaves downstream state empty in full-chain mode", () => {
  const fixture = TEST_FIXTURE;
  const records = buildSeedRecords({ fixture, mode: FULL_CHAIN_MODE, now: NOW });
  const eventFields = fieldsFor(records, "Events", "devflow-conf-2027");
  const event = JSON.parse(eventFields["Settings JSON"]);
  assert.equal(event.name, fixture.event.name);
  assert.equal(event.tagline, fixture.event.tagline);
  assert.equal(event.dates, fixture.event.dates);
  assert.equal(event.location, fixture.event.location);
  assert.deepEqual(event.tracks, fixture.event.tracks);
  assert.deepEqual(event.sessionFormats, fixture.event.session_formats);
  assert.deepEqual(event.rooms, fixture.event.rooms);
  assert.equal(event.timezone, "America/Los_Angeles");
  assert.equal(eventFields["Time Zone"], "America/Los_Angeles");

  const form = JSON.parse(fieldsFor(records, "CFP Forms", "devflow-conf-2027-cfp")["Fields JSON"]);
  const byKey = new Map(form.submissionFields.map((field) => [field.key, field]));
  assert.equal(byKey.get("title")?.required, true);
  assert.equal(byKey.get("abstract")?.required, true);
  assert.deepEqual(byKey.get("track")?.options, fixture.event.tracks);
  assert.deepEqual(byKey.get("format")?.options, fixture.event.session_formats);
  assert.equal(byKey.get("speaker_bio")?.kind, "rich_text");
  assert.equal(byKey.get("key_takeaway")?.required, true);
  assert.deepEqual(byKey.get("audience_level")?.options, ["Beginner", "Intermediate", "Advanced"]);
  assert.equal(byKey.get("workshop_prerequisites")?.kind, "rich_text");
  assert.deepEqual(form.rules[0], {
    id: "rule-workshop-prerequisites",
    priority: 10,
    when: {
      type: "group",
      operator: "all",
      conditions: [
        {
          type: "predicate",
          fieldKey: "format",
          operator: "equals",
          value: "Workshop (120 min)",
        },
      ],
    },
    actions: [{ type: "show_field", fieldKey: "workshop_prerequisites" }],
  });
  assert.equal(form.submissionWindow.closeDate, "2027-04-30");
  assert.equal(form.submissionWindow.opensAt, NOW);

  const tables = new Set(records.map((record) => record.table));
  for (const forbidden of [
    "Submissions",
    "Participants",
    "Evaluations",
    "Decisions",
    "Sessions",
    "Agenda Versions",
    "Agenda Entries",
    "Published Speaker Projections",
  ]) {
    assert.equal(
      tables.has(forbidden),
      false,
      `${forbidden} must be created by the ordered UI chain`,
    );
  }
  const serialized = JSON.stringify(records);
  assert.equal(serialized.includes("password"), false);
  assert.equal(serialized.includes("sbek-"), false);
});

test("is idempotent, additive, and never issues destructive Airtable operations", async () => {
  const fake = fakeAirtable();
  const first = await runTestSeed({
    env: ENV,
    apiOrigin: "https://airtable.test",
    dryRun: false,
    now: NOW,
    fetchImplementation: fake.fetchImplementation,
  });
  const rowsAfterFirst = [...fake.tables].map(([table, rows]) => [table, rows.length]);
  const eventRow = fake.tables.get("Events")?.[0];
  assert.ok(eventRow);
  eventRow.fields.Unrelated = "keep-me";
  const second = await runTestSeed({
    env: ENV,
    apiOrigin: "https://airtable.test",
    dryRun: false,
    now: NOW,
    fetchImplementation: fake.fetchImplementation,
  });
  assert.equal(first.counts.create, first.recordCount);
  assert.equal(first.counts.update, 0);
  assert.equal(second.counts.create, 0);
  assert.equal(second.counts.update, second.recordCount);
  assert.deepEqual(
    [...fake.tables].map(([table, rows]) => [table, rows.length]),
    rowsAfterFirst,
  );
  assert.equal(fake.tables.get("Events")?.[0]?.fields.Unrelated, "keep-me");
  assert.equal(
    fake.requests.some((request) => request.method === "DELETE" || request.method === "PUT"),
    false,
  );
  assert.equal(JSON.stringify(first).includes("rec_fake"), false);
  assert.equal(JSON.stringify(first).includes("test-token"), false);
});

test("dry-run reads existing records but performs no writes", async () => {
  const fake = fakeAirtable();
  const summary = await runTestSeed({
    env: ENV,
    apiOrigin: "https://airtable.test",
    dryRun: true,
    now: NOW,
    fetchImplementation: fake.fetchImplementation,
  });
  assert.equal(summary.dryRun, true);
  assert.equal(summary.counts.create, summary.recordCount);
  assert.equal(
    fake.requests.every((request) => request.method === "GET"),
    true,
  );
  assert.equal(
    [...fake.tables].every(([, rows]) => rows.length === 0),
    true,
  );
});

test("production requires the exact confirmation before Airtable lookup", async () => {
  const fake = fakeAirtable();
  await assert.rejects(
    runTestSeed({
      env: { ...ENV, EVAL_ENVIRONMENT: "production" },
      apiOrigin: "https://airtable.test",
      dryRun: false,
      fetchImplementation: fake.fetchImplementation,
    }),
    (error) =>
      error instanceof DevflowSeedError && error.code === "PRODUCTION_CONFIRMATION_REQUIRED",
  );
  assert.equal(fake.requests.length, 0);

  const allowed = await runTestSeed({
    env: {
      ...ENV,
      EVAL_ENVIRONMENT: "production",
      EVAL_PRODUCTION_CONFIRMATION: PRODUCTION_CONFIRMATION,
    },
    apiOrigin: "https://airtable.test",
    dryRun: true,
    now: NOW,
    fetchImplementation: fake.fetchImplementation,
  });
  assert.equal(allowed.environment, "production");
});

test("duplicate Application IDs abort before any write", async () => {
  const fixture = TEST_FIXTURE;
  const records = buildSeedRecords({ fixture, mode: FULL_CHAIN_MODE, now: NOW });
  assert.throws(
    () => planUpserts([records[0], { ...records[0], fields: { ...records[0].fields } }]),
    (error) => error instanceof DevflowSeedError && error.code === "DUPLICATE_APPLICATION_ID",
  );
  const fake = fakeAirtable();
  const duplicateFields = records[0].fields;
  fake.tables.set("Events", [
    { id: "rec_duplicate_a", fields: duplicateFields },
    { id: "rec_duplicate_b", fields: duplicateFields },
  ]);
  await assert.rejects(
    runTestSeed({
      env: ENV,
      apiOrigin: "https://airtable.test",
      dryRun: false,
      now: NOW,
      fetchImplementation: fake.fetchImplementation,
    }),
    (error) => error instanceof DevflowSeedError && error.code === "DUPLICATE_APPLICATION_ID",
  );
  assert.equal(
    fake.requests.every((request) => request.method === "GET"),
    true,
  );
});

test("subset fallback is explicit and adds only downstream fixture projections", () => {
  const records = buildSeedRecords({
    fixture: TEST_FIXTURE,
    mode: SUBSET_FALLBACK_MODE,
    now: NOW,
  });
  const tables = new Set(records.map((record) => record.table));
  assert.equal(tables.has("Review Plans"), true);
  assert.equal(tables.has("Sessions"), true);
  assert.equal(tables.has("Agenda Versions"), true);
  assert.equal(tables.has("Agenda Entries"), true);
  assert.equal(tables.has("Published Speaker Projections"), true);
  const plan = JSON.parse(
    fieldsFor(records, "Review Plans", "devflow-conf-2027-initial-review")["Rounds JSON"],
  );
  assert.equal(plan.rounds[0].blindReview, true);
  assert.deepEqual(
    plan.rounds[0].rubric.criteria.map((criterion) => criterion.label),
    ["Originality", "Relevance", "Recommendation", "Comments"],
  );
  const projection = JSON.parse(
    fieldsFor(
      records,
      "Published Speaker Projections",
      "agenda-foundation-speakers:devflow-conf-2027:revision-1",
    )["Projection JSON"],
  );
  assert.deepEqual(
    projection.speakers.map((speaker) => speaker.displayName),
    ["Agenda Foundation Presenter A", "Agenda Foundation Presenter B"],
  );
  assert.equal(JSON.stringify(projection).includes("sbek-"), false);
  const fixture = TEST_FIXTURE;
  const scenarioTitles = new Set(fixture.submissions.map((submission) => submission.title));
  const fallbackSessions = records
    .filter((record) => record.table === "Sessions")
    .map((record) => record.fields.Title);
  assert.equal(
    fallbackSessions.some((title) => scenarioTitles.has(title)),
    false,
  );
  const scenarioNames = new Set([
    fixture.identities.speaker.name,
    fixture.identities.speaker2.name,
  ]);
  assert.equal(
    projection.speakers.some((speaker) => scenarioNames.has(speaker.displayName)),
    false,
  );
});
