import assert from "node:assert/strict";
import test from "node:test";
import { createDomainImportPlan } from "./domain-transform.mjs";
import { validateImportPlan } from "./import-lib.mjs";

const CREATED_AT = "2026-01-01T00:00:00.000Z";
const UPDATED_AT = "2026-01-02T00:00:00.000Z";

function sourceRecord(applicationId, fields, ordinal) {
  const airtableRecordId = `rec${String(ordinal).padStart(3, "0")}`;
  return {
    applicationId,
    airtableRecordId,
    scope: { organizationId: "org-test", eventId: "event-test" },
    raw: { id: airtableRecordId, createdTime: CREATED_AT, fields },
  };
}

function sourceTable(id, name, records) {
  return { id, name, recordCount: records.length, quarantineCount: 0, records, quarantine: [] };
}

function syntheticInventory() {
  let ordinal = 0;
  const record = (applicationId, fields) => sourceRecord(applicationId, fields, ++ordinal);
  const tables = [
    sourceTable("tblOrganizations", "Organizations", [
      record("org-test", {
        Name: "Test Organization",
        Slug: "Test Organization",
        "Settings JSON": JSON.stringify({
          organizationId: "org-test",
          name: "Test Organization",
        }),
      }),
    ]),
    sourceTable("tblEvents", "Events", [
      record("event-test", {
        "Application ID": "event-test",
        Name: "Test Conference",
        "Time Zone": "America/Los_Angeles",
        Version: 2,
        "Settings JSON": JSON.stringify({
          id: "event-test",
          organizationId: "org-test",
          status: "closed",
          startsAt: "2026-06-01T16:00:00.000Z",
          endsAt: "2026-06-01T23:00:00.000Z",
          cfpSettings: {
            enabled: true,
            opensAt: "2026-01-01T00:00:00.000Z",
            closesAt: "2026-02-01T00:00:00.000Z",
          },
          embedConfigurations: [
            {
              id: "embed-test",
              widgetId: "agenda",
              name: "Public agenda",
              theme: "light",
              outputFormat: "html",
              layout: "grid",
              displayFields: ["title", "speakers"],
              trackIds: ["track-platform"],
              enabled: true,
              revision: 2,
            },
          ],
        }),
      }),
    ]),
    sourceTable("tblRooms", "Rooms", [
      record("room-main", {
        "Application ID": "room-main",
        Name: "Main Hall",
        Capacity: 300,
        "Event ID": "event-test",
        "Metadata JSON": JSON.stringify({ organizationId: "org-test", eventId: "event-test" }),
      }),
    ]),
    sourceTable("tblTracks", "Tracks", [
      record("track-platform", {
        "Application ID": "track-platform",
        Name: "Platform",
        Description: "Platform engineering",
        "Event ID": "event-test",
        "Metadata JSON": JSON.stringify({ organizationId: "org-test", eventId: "event-test" }),
      }),
    ]),
    sourceTable("tblFormats", "Formats", [
      record("format-talk", {
        "Application ID": "format-talk",
        Name: "Talk",
        "Event ID": "event-test",
        "Metadata JSON": JSON.stringify({ organizationId: "org-test", eventId: "event-test" }),
      }),
    ]),
    sourceTable("tblCfpForms", "CFP Forms", [
      record("form-test", {
        "Fields JSON": JSON.stringify({
          id: "form-test",
          organizationId: "org-test",
          eventId: "event-test",
          name: "Main CFP",
          status: "published",
          version: 3,
          settings: { speakerLimit: 2, remindersEnabled: true },
          sections: [{ id: "section-session", title: "Session", order: 0 }],
          submissionFields: [
            {
              id: "field-title",
              sectionId: "section-session",
              key: "title",
              label: "Title",
              kind: "short_text",
              required: true,
            },
          ],
          participantFields: [
            {
              id: "field-bio",
              sectionId: "section-session",
              key: "bio",
              label: "Biography",
              kind: "long_text",
              required: false,
            },
          ],
          rules: [
            {
              id: "rule-title",
              priority: 1,
              when: { field: "title", operator: "is_not_empty" },
              actions: [{ type: "show", fieldId: "field-bio" }],
            },
          ],
        }),
      }),
    ]),
    sourceTable("tblSubmissions", "Submissions", [
      record("submission-test", {
        "Answers JSON": JSON.stringify({
          id: "submission-test",
          organizationId: "org-test",
          eventId: "event-test",
          formId: "form-test",
          ownerAccountId: "account-test",
          formVersion: 3,
          status: "submitted",
          completedSteps: ["session", "speakers"],
          version: 4,
          createdAt: CREATED_AT,
          updatedAt: UPDATED_AT,
          submittedAt: UPDATED_AT,
          answers: { title: "Deterministic migrations" },
          participants: [
            {
              id: "speaker-test",
              displayName: "Ada Example",
              email: "ADA@EXAMPLE.COM",
              role: "primary",
              biography: "Builds reliable systems.",
              answers: { bio: "Builds reliable systems." },
            },
          ],
          secondaryContacts: [
            { id: "contact-secondary", name: "Grace Example", email: "grace@example.com" },
          ],
        }),
      }),
    ]),
    sourceTable("tblSpeakerProfiles", "Speaker Profiles", [
      record("profile-test", {
        Biography: JSON.stringify({
          id: "profile-test",
          organizationId: "org-test",
          eventId: "event-test",
          participantId: "speaker-test",
          displayName: "Ada Example",
          email: "ada@example.com",
          jobTitle: "Staff Engineer",
          company: "Example Co",
          status: "confirmed",
          biography: "Builds reliable systems.",
          sourceType: "cfp",
          sourceId: "submission-test",
          version: 2,
          createdAt: CREATED_AT,
          updatedAt: UPDATED_AT,
          travelLogistics: { travelRequired: true, dietaryRequirements: "Vegetarian" },
        }),
      }),
    ]),
    sourceTable("tblSessions", "Sessions", [
      record("session-test", {
        "Metadata JSON": JSON.stringify({
          id: "session-test",
          organizationId: "org-test",
          eventId: "event-test",
          title: "Deterministic migrations",
          description: "A migration case study.",
          status: "accepted",
          contentStatus: "ready",
          durationMinutes: 45,
          capacityRequired: 200,
          roomId: "Main Hall",
          formatId: "Talk",
          trackIds: ["Platform"],
          speakerRoster: [{ id: "speaker-test", displayName: "Ada Example", role: "speaker" }],
          resourceIds: ["slides-test"],
          history: [
            {
              id: "history-test",
              action: "status_changed",
              version: 2,
              actorId: "organizer-test",
              occurredAt: UPDATED_AT,
              priorStatus: "proposed",
              newStatus: "accepted",
            },
          ],
          version: 2,
          createdAt: CREATED_AT,
          updatedAt: UPDATED_AT,
        }),
      }),
    ]),
    sourceTable("tblReviewPlans", "Review Plans", [
      record("review-plan-test", {
        "Rounds JSON": JSON.stringify({
          id: "review-plan-test",
          organizationId: "org-test",
          eventId: "event-test",
          name: "Initial review",
          status: "active",
          blindReview: true,
          assignmentRule: { reviewsPerSubmission: 2, maxAssignmentsPerReviewer: 5 },
          reviewerProjection: { fieldIds: ["field-title"], fileIds: [] },
          version: 1,
          createdAt: CREATED_AT,
          updatedAt: UPDATED_AT,
          rounds: [
            {
              id: "round-test",
              name: "Round one",
              sequence: 1,
              revision: 1,
              rubricRevision: 1,
              blindReview: true,
              anonymization: "speakers",
              reviewerPool: { reviewerIds: ["reviewer-test"] },
              rubric: {
                id: "rubric-test",
                name: "Talk rubric",
                criteria: [
                  {
                    id: "criterion-impact",
                    label: "Impact",
                    minimum: 1,
                    maximum: 5,
                    weight: 1,
                    required: true,
                    options: [{ id: "option-high", label: "High", value: 5 }],
                  },
                ],
              },
            },
          ],
        }),
      }),
    ]),
    sourceTable("tblDecisions", "Decisions", [
      record("decision-test", {
        "Metadata JSON": JSON.stringify({
          id: "decision-test",
          organizationId: "org-test",
          eventId: "event-test",
          planId: "review-plan-test",
          submissionId: "submission-test",
          status: "accepted",
          version: 2,
          updatedAt: UPDATED_AT,
          history: [
            {
              from: "pending",
              to: "accepted",
              reason: "Strong fit",
              decidedBy: "organizer-test",
              decidedAt: UPDATED_AT,
              idempotencyKey: "decision-transition-test",
            },
          ],
        }),
      }),
    ]),
    sourceTable("tblAgenda", "Agenda Versions", [
      record("agenda-test", {
        "Conflicts JSON": JSON.stringify({
          organizationId: "org-test",
          eventId: "event-test",
          stateVersion: 3,
          timeZone: "America/Los_Angeles",
          minimumTravelMinutes: 10,
          currentPublishedRevisionId: "revision-test",
          rooms: [{ id: "room-main", name: "Main Hall", capacity: 300 }],
          tracks: [{ id: "track-platform", name: "Platform" }],
          sessions: [
            {
              id: "session-test",
              title: "Deterministic migrations",
              summary: "A migration case study.",
              format: "Talk",
              status: "accepted",
              durationMinutes: 45,
              participantIds: ["speaker-test"],
              speakerNames: ["Ada Example"],
            },
          ],
          draft: {
            version: 3,
            timeZone: "America/Los_Angeles",
            updatedAt: UPDATED_AT,
            updatedBy: "organizer-test",
            entries: [
              {
                id: "entry-test",
                sessionId: "session-test",
                roomId: "room-main",
                trackIds: ["track-platform"],
                startsAt: "2026-06-01T17:00:00.000Z",
                endsAt: "2026-06-01T17:45:00.000Z",
                startsAtLocal: "2026-06-01T10:00:00",
                endsAtLocal: "2026-06-01T10:45:00",
                timeZone: "America/Los_Angeles",
              },
            ],
          },
          revisions: [
            {
              id: "revision-test",
              revisionNumber: 1,
              sourceDraftVersion: 3,
              timeZone: "America/Los_Angeles",
              publishedAt: UPDATED_AT,
              publishedBy: "organizer-test",
              entries: [
                {
                  id: "entry-test",
                  sessionId: "session-test",
                  roomId: "room-main",
                  trackIds: ["track-platform"],
                  startsAt: "2026-06-01T17:00:00.000Z",
                  endsAt: "2026-06-01T17:45:00.000Z",
                  startsAtLocal: "2026-06-01T10:00:00",
                  endsAtLocal: "2026-06-01T10:45:00",
                  timeZone: "America/Los_Angeles",
                },
              ],
            },
          ],
          outbox: [
            {
              id: "outbox-test",
              revisionId: "revision-test",
              type: "agenda.published",
              idempotencyKey: "agenda-published-test",
              createdAt: UPDATED_AT,
            },
          ],
          audit: [
            {
              id: "audit-test",
              actorId: "organizer-test",
              action: "agenda.published",
              details: { revisionId: "revision-test" },
              createdAt: UPDATED_AT,
            },
          ],
        }),
      }),
    ]),
    sourceTable("tblCrmContacts", "CRM Contacts", [
      record("crm-contact-test", {
        "Contact JSON": JSON.stringify({
          id: "crm-contact-test",
          organizationId: "org-test",
          firstName: "Ada",
          lastName: "Example",
          displayName: "Ada Example",
          email: "ada@example.com",
          company: "Example Co",
          source: "speaker",
          status: "active",
          pipelineStage: "speaker",
          tags: ["speaker", "vip"],
          version: 2,
          createdAt: CREATED_AT,
          updatedAt: UPDATED_AT,
        }),
      }),
    ]),
  ];
  return {
    format: "open-sessionboard.airtable-inventory",
    version: 1,
    base: { id: "appSynthetic" },
    tableCount: tables.length,
    recordCount: tables.reduce((count, table) => count + table.records.length, 0),
    quarantineCount: 0,
    tables,
  };
}

function operation(plan, table, id) {
  return plan.operations.find(
    (candidate) => candidate.targetTable === table && candidate.targetId === id,
  );
}

function countByTargetTable(plan) {
  return Object.fromEntries(
    plan.operations.reduce((counts, item) => {
      counts.set(item.targetTable, (counts.get(item.targetTable) ?? 0) + 1);
      return counts;
    }, new Map()),
  );
}

const inventory = syntheticInventory();

test("synthetic inventory covers representative domain transforms without quarantine", () => {
  assert.equal(inventory.tableCount, 13);
  assert.equal(inventory.recordCount, 13);
  assert.equal(
    inventory.tables.reduce((count, table) => count + table.recordCount, 0),
    13,
  );
  assert.ok(inventory.tables.every((table) => table.quarantineCount === 0));

  const plan = createDomainImportPlan(inventory);
  validateImportPlan(plan);
  assert.equal(plan.quarantine.length, 0);
  assert.equal(plan.operations.length, 59);
  assert.deepEqual(countByTargetTable(plan), {
    organizations: 1,
    events: 1,
    event_embed_configurations: 1,
    rooms: 1,
    tracks: 1,
    formats: 1,
    session_statuses: 1,
    cfp_forms: 1,
    cfp_form_sections: 1,
    cfp_form_fields: 2,
    cfp_form_rules: 1,
    submissions: 1,
    submission_versions: 1,
    submission_answers: 1,
    participants: 1,
    submission_participants: 1,
    submission_secondary_contacts: 1,
    speaker_profiles: 1,
    sessions: 1,
    session_tracks: 1,
    session_speakers: 1,
    session_resources: 1,
    session_history: 1,
    review_plans: 1,
    review_rubrics: 1,
    review_rounds: 1,
    review_criteria: 1,
    review_criterion_options: 1,
    reviewer_pools: 1,
    reviewer_pool_members: 1,
    evaluation_decisions: 1,
    evaluation_decision_transitions: 1,
    agenda_states: 1,
    agenda_drafts: 1,
    agenda_revisions: 1,
    agenda_entries: 2,
    agenda_entry_tracks: 2,
    agenda_outbox_events: 1,
    audit_events: 1,
    crm_contacts: 1,
    crm_contact_tags: 2,
    airtable_connections: 1,
    airtable_record_mappings: 13,
  });

  assert.deepEqual(operation(plan, "events", "event-test").row, {
    id: "event-test",
    organization_id: "org-test",
    slug: "event-test",
    name: "Test Conference",
    status: "archived",
    legacy_retired_at: CREATED_AT,
    time_zone: "America/Los_Angeles",
    starts_at: "2026-06-01T16:00:00.000Z",
    ends_at: "2026-06-01T23:00:00.000Z",
    venue: null,
    cfp_enabled: 1,
    cfp_opens_at: "2026-01-01T00:00:00.000Z",
    cfp_closes_at: "2026-02-01T00:00:00.000Z",
    default_duration_minutes: 30,
    default_calendar_time_zone: "America/Los_Angeles",
    default_calendar_location: null,
    version: 2,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    created_by: "system",
    updated_by: "system",
  });

  assert.deepEqual(operation(plan, "submission_answers", "submission-test:answer:title").row, {
    organization_id: "org-test",
    submission_id: "submission-test",
    field_key: "title",
    value_json: '"Deterministic migrations"',
    asset_id: null,
  });
  assert.equal(
    operation(plan, "participants", "speaker-test").row.normalized_email,
    "ada@example.com",
  );
  assert.deepEqual(
    operation(plan, "submission_participants", "submission-test:participant:speaker-test").row,
    {
      organization_id: "org-test",
      event_id: "event-test",
      submission_id: "submission-test",
      participant_id: "speaker-test",
      role: "primary",
      biography: "Builds reliable systems.",
      answers_json: '{"bio":"Builds reliable systems."}',
      ordinal: 0,
    },
  );
  assert.equal(
    operation(plan, "speaker_profiles", "profile-test").row.participant_id,
    "speaker-test",
  );

  const session = operation(plan, "sessions", "session-test").row;
  assert.equal(session.room_id, "room-main");
  assert.equal(session.format_id, "format-talk");
  assert.equal(
    operation(plan, "session_tracks", "session-test:track:Platform").row.track_id,
    "track-platform",
  );
  assert.equal(
    operation(plan, "session_speakers", "session-test:speaker:speaker-test").row.speaker_id,
    "speaker-test",
  );

  const criterion = operation(
    plan,
    "review_criteria",
    "review-plan-test:rubric-test:criterion-impact",
  ).row;
  assert.equal(criterion.plan_id, "review-plan-test");
  assert.equal(criterion.rubric_id, "rubric-test");
  assert.equal(
    operation(plan, "evaluation_decisions", "decision-test").row.submission_id,
    "submission-test",
  );
  assert.deepEqual(
    operation(plan, "evaluation_decision_transitions", "decision-test:transition:0").row,
    {
      organization_id: "org-test",
      event_id: "event-test",
      decision_id: "decision-test",
      ordinal: 0,
      from_status: "pending",
      to_status: "accepted",
      reason: "Strong fit",
      decided_by: "organizer-test",
      decided_at: UPDATED_AT,
      idempotency_key: "decision-transition-test",
    },
  );

  const agendaEntry = operation(plan, "agenda_entries", "revision:revision-test:entry-test").row;
  assert.equal(agendaEntry.session_id, "session-test");
  assert.equal(agendaEntry.room_id, "room-main");
  assert.equal(agendaEntry.title, "Deterministic migrations");
  assert.equal(agendaEntry.speaker_names_json, '["Ada Example"]');
  assert.equal(agendaEntry.track_names_json, '["Platform"]');
  assert.equal(
    operation(plan, "agenda_entry_tracks", "revision:revision-test:entry-test:track-platform").row
      .track_id,
    "track-platform",
  );

  assert.deepEqual(operation(plan, "crm_contact_tags", "crm-contact-test:tag:vip").row, {
    organization_id: "org-test",
    contact_id: "crm-contact-test",
    tag: "vip",
  });
  const sessionMapping = plan.operations.find(
    (item) =>
      item.targetTable === "airtable_record_mappings" &&
      item.row.table_id === "tblSessions" &&
      item.row.application_id === "session-test",
  );
  assert.equal(sessionMapping.row.connection_id, "airtable-import:appSynthetic");

  const index = (table) => plan.operations.findIndex((item) => item.targetTable === table);
  assert.ok(index("organizations") < index("events"));
  assert.ok(index("events") < index("cfp_forms"));
  assert.ok(index("cfp_forms") < index("submissions"));
  assert.ok(index("participants") < index("sessions"));
  assert.ok(index("review_plans") < index("evaluation_decisions"));
  assert.ok(index("agenda_revisions") < index("agenda_entries"));
  assert.ok(index("airtable_connections") < index("airtable_record_mappings"));
});

test("domain plans are deterministic for synthetic input", () => {
  assert.deepEqual(createDomainImportPlan(inventory), createDomainImportPlan(inventory));
});
