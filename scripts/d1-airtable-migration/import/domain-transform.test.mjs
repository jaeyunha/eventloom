import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createDomainImportPlan } from "./domain-transform.mjs";
import { validateImportPlan } from "./import-lib.mjs";

const manifests = {
  production: "/tmp/eventloom-production-core-inventory.json",
  staging: "/tmp/eventloom-staging-core-inventory.json",
};

async function plan(name) {
  return createDomainImportPlan(JSON.parse(await readFile(manifests[name], "utf8")));
}

function operation(planValue, table, id) {
  return planValue.operations.find(
    (candidate) => candidate.targetTable === table && candidate.targetId === id,
  );
}

test("production manifest decodes current and legacy entities in dependency order", async () => {
  const value = await plan("production");
  validateImportPlan({ ...value, quarantine: [] });
  assert.equal(value.operations.length, 264);
  assert.deepEqual(
    value.quarantine.map((item) => item.reason),
    [
      "SPEAKER_SUBMISSION_PROJECTION_HAS_NO_LOSSLESS_NUMBERED_SCHEMA_TARGET",
      "SPEAKER_SUBMISSION_PROJECTION_HAS_NO_LOSSLESS_NUMBERED_SCHEMA_TARGET",
    ],
  );

  const legacyEvent = operation(value, "events", "open-sessionboard-conf").row;
  assert.equal(legacyEvent.organization_id, "ai-engineer");
  assert.equal(legacyEvent.time_zone, "America/Los_Angeles");
  assert.equal(legacyEvent.status, "active");
  assert.equal(legacyEvent.cfp_enabled, 1);

  const currentEvent = operation(value, "events", "devflow-conf-2027").row;
  assert.equal(currentEvent.status, "active");
  assert.equal(currentEvent.version, 2);

  assert.ok(operation(value, "cfp_form_fields", "devflow-conf-2027-cfp:submission:field-title"));
  assert.ok(
    operation(
      value,
      "submission_answers",
      "submission_480ee5f8-647c-48a1-a082-b545b4b8482b:answer:title",
    ),
  );
  assert.ok(
    operation(value, "speaker_profiles", "speaker-profile:devflow-conf-2027:primary-speaker"),
  );
  assert.ok(
    operation(
      value,
      "review_criteria",
      "plan-devflow-conf-2027-devflow-2027-initial-review:rubric-1:criterion-1-1",
    ),
  );
  assert.ok(
    operation(
      value,
      "evaluation_decision_transitions",
      "decision:plan-devflow-conf-2027-devflow-2027-initial-review:submission_480ee5f8-647c-48a1-a082-b545b4b8482b:transition:0",
    ),
  );
  assert.ok(
    operation(
      value,
      "agenda_entries",
      "revision:revision_c5403bb9-fd4b-413f-8125-76c31bf31389:entry_session-submission_480ee5f8-647c-48a1-a082-b545b4b8482b",
    ),
  );
  assert.ok(
    operation(
      value,
      "airtable_record_mappings",
      "airtable-mapping:4d012e0c78ff3f0a11e062222419dad9",
    ),
  );

  const index = (table) => value.operations.findIndex((item) => item.targetTable === table);
  assert.ok(index("organizations") < index("events"));
  assert.ok(index("events") < index("cfp_forms"));
  assert.ok(index("cfp_forms") < index("submissions"));
  assert.ok(index("participants") < index("sessions"));
  assert.ok(index("review_plans") < index("evaluation_decisions"));
  assert.ok(index("agenda_revisions") < index("agenda_entries"));
  assert.ok(index("airtable_connections") < index("airtable_record_mappings"));
});

test("staging aggregate is losslessly decomposed without quarantine", async () => {
  const value = await plan("staging");
  validateImportPlan(value);
  assert.equal(value.operations.length, 112);
  assert.equal(value.quarantine.length, 0);
  assert.ok(operation(value, "sessions", "session_entry_keynote"));
  assert.ok(operation(value, "participants", "speaker_morgan"));
  assert.ok(operation(value, "agenda_drafts", "open-sessionboard-conf"));
  assert.ok(operation(value, "agenda_revisions", "revision_demo_3"));
  assert.ok(
    operation(
      value,
      "agenda_entry_tracks",
      "revision:revision_demo_3:entry_panel:track_operations",
    ),
  );
});

test("domain plans are deterministic", async () => {
  const first = await plan("production");
  const second = await plan("production");
  assert.deepEqual(first, second);
});
