import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  applyRepair,
  applyWorkflowReset as applyWorkflowResetSource,
  buildRepairManifest,
  DevflowRepairError,
  parseArguments,
  prepareRepair,
  prepareWorkflowReset as prepareWorkflowResetSource,
  REPAIR_CONFIRMATION,
  RESET_WORKFLOW_CONFIRMATION,
  readRepairInvariantReport,
  resumeRepair,
  resumeWorkflowReset as resumeWorkflowResetSource,
  runRepair,
} from "./repair-devflow-production.mjs";

const IDS = {
  "organizer-agenda": "user-organizer-agenda",
  "organizer-fixture": "user-organizer-fixture",
  "reviewer-sam": "user-reviewer-sam",
  "speaker-priya": "user-speaker-priya",
  "speaker-marcus": "user-speaker-marcus",
  submitter: "user-submitter",
};
const PARTICIPANT_IDS = {
  "speaker-priya": "devflow-conf-2027-participant-speaker-priya",
  "speaker-marcus": "devflow-conf-2027-participant-speaker-marcus",
};
const PROFILE_IDS = {
  "speaker-priya": `speaker-profile:devflow-conf-2027:${PARTICIPANT_IDS["speaker-priya"]}`,
  "speaker-marcus": `speaker-profile:devflow-conf-2027:${PARTICIPANT_IDS["speaker-marcus"]}`,
};
const RESET_ENVIRONMENT = "staging";
const TEST_FIXTURE = {
  event: {
    name: "DevFlow Conf 2027",
    tagline: "A deterministic evaluator fixture.",
    dates: "2027-05-12 to 2027-05-13",
    location: "Test Convention Center",
    description: "Repository-owned data for the evaluator repair unit tests.",
    tracks: ["Platform & Infra", "AI Engineering", "Developer Experience"],
    session_formats: ["Talk (30 min)", "Lightning Talk (10 min)", "Workshop (120 min)"],
    rooms: ["Room 2A", "Room 2B"],
  },
  identities: {
    organizer: { name: "Jordan Alvarez", email: "organizer@example.test" },
    reviewer: { name: "Sam Reviewer", email: "reviewer@example.test" },
    speaker: {
      name: "Priya Raman",
      email: "priya@example.test",
      bio: "Platform engineer focused on reliable build systems.",
      company: "Latticework Systems",
    },
    speaker2: {
      name: "Marcus Okafor",
      email: "marcus@example.test",
      bio: "Developer experience engineer building retrieval-grounded tools.",
      company: "Northstar Labs",
    },
  },
  submissions: [
    {
      title: "Taming 40-Minute CI: Incremental Builds at Monorepo Scale",
      abstract: "Practical techniques for making large monorepo builds incremental.",
      track: "Platform & Infra",
      format: "Talk (30 min)",
      audience_level: "Advanced",
    },
    {
      title: "Your AI Pair Programmer Is Lying to You: Verification Patterns That Scale",
      abstract: "Verification patterns for safely using AI-assisted development.",
      track: "AI Engineering",
      format: "Talk (30 min)",
      audience_level: "Intermediate",
    },
    {
      title: "Docs That Answer Back: Retrieval-Grounded Documentation Sites",
      abstract: "Building useful documentation experiences with retrieval grounding.",
      track: "Developer Experience",
      format: "Lightning Talk (10 min)",
      audience_level: "Intermediate",
    },
  ],
  communications: {
    acceptance_subject: "Your session has been accepted",
    acceptance_body: "Hi {speaker_name}, your session '{talk_title}' has been accepted.",
  },
};

function prepareWorkflowReset(options) {
  return prepareWorkflowResetSource({ ...options, environment: RESET_ENVIRONMENT });
}

function applyWorkflowReset(options) {
  return applyWorkflowResetSource({ ...options, environment: RESET_ENVIRONMENT });
}

function resumeWorkflowReset(options) {
  return resumeWorkflowResetSource({ ...options, environment: RESET_ENVIRONMENT });
}

function identities() {
  return Object.fromEntries(
    Object.entries(IDS).map(([identityKey, userId]) => [
      identityKey,
      {
        email: `${identityKey.replaceAll("-", ".")}@repair.example.test`,
        userId,
        verified: true,
      },
    ]),
  );
}

function fakeTransport({
  duplicateKey,
  driftKey,
  omitBlankFields = false,
  ledgerFailureState,
  ledgerFailureKey,
} = {}) {
  const records = new Map();
  const writes = [];
  const commands = [];
  const ledgerEntries = [];
  const commandRecords = new Map();
  let failWrites = false;
  let durableLedgerFailureState = ledgerFailureState;
  let durableLedgerFailureKey = ledgerFailureKey;
  const key = (operation) => `${operation.table ?? operation.kind}:${operation.id}`;
  return {
    records,
    writes,
    commands,
    ledgerEntries,
    setFailWrites(value) {
      failWrites = value;
    },
    setLedgerFailure(value, key = durableLedgerFailureKey) {
      durableLedgerFailureState = value;
      durableLedgerFailureKey = key;
    },
    async read(operation) {
      if (operation.key === duplicateKey)
        return [
          { id: "a", fields: operation.fields },
          { id: "b", fields: operation.fields },
        ];
      if (operation.store !== "airtable") {
        const command = commandRecords.get(operation.key);
        return command === undefined ? [] : [command];
      }
      const record = records.get(key(operation));
      if (record === undefined) return [];
      if (operation.key === driftKey)
        return [{ ...record, fields: { ...record.fields, Version: 2 } }];
      return [record];
    },
    storedFields(fields) {
      if (!omitBlankFields) return fields;
      return Object.fromEntries(
        Object.entries(fields).filter(
          ([, value]) =>
            value !== undefined &&
            value !== null &&
            value !== "" &&
            (!Array.isArray(value) || value.length > 0),
        ),
      );
    },
    async write(input) {
      if (failWrites) throw new Error("injected transport failure");
      writes.push(input);
      if (input.store === "airtable") {
        const current = records.get(key(input));
        records.set(key(input), {
          id: current?.id ?? `rec-${records.size + 1}`,
          fields:
            current === undefined
              ? this.storedFields(input.fields)
              : this.storedFields({ ...current.fields, ...input.fields }),
        });
      }
    },
    async execute(command) {
      if (failWrites) throw new Error("injected command failure");
      commands.push(command);
      if (typeof command.idempotencyKey === "string") {
        commandRecords.set(command.idempotencyKey, structuredClone(command));
      }
    },
    async verifyIdentity() {},
    async recordLedger(entry) {
      ledgerEntries.push(entry);
      if (
        entry.state === durableLedgerFailureState &&
        (durableLedgerFailureKey === undefined || entry.key === durableLedgerFailureKey)
      ) {
        const error = new Error("injected durable ledger failure");
        error.code = "LEDGER_UNAVAILABLE";
        throw error;
      }
    },
  };
}

function build() {
  return buildRepairManifest({ fixture: TEST_FIXTURE, identities: identities() });
}
function temporaryManifestPath() {
  const directory = mkdtempSync(join(tmpdir(), "devflow-repair-test-"));
  return {
    path: join(directory, "manifest.json"),
    cleanup() {
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
function resetTransport() {
  const transport = fakeTransport();
  const discovered = [];
  const deletes = [];
  transport.discovered = discovered;
  transport.deletes = deletes;
  transport.add = (table, id, fields, recordId = `${table}-${id}`) => {
    const record = { id: recordId, fields: { ...fields } };
    transport.records.set(`${table}:${id}`, record);
    discovered.push({ store: "airtable", table, applicationId: id, ...record });
    return record;
  };
  transport.discoverWorkflowRecords = async () => discovered.slice();
  transport.delete = async (operation) => {
    deletes.push(operation);
    transport.records.delete(`${operation.table}:${operation.id}`);
    const index = discovered.findIndex(
      (record) => record.table === operation.table && record.id === operation.recordId,
    );
    if (index >= 0) discovered.splice(index, 1);
  };
  return transport;
}

function addWorkflowRecords(transport, manifest) {
  for (const operation of manifest.operations) {
    if (operation.store !== "airtable") continue;
    transport.add(operation.table, operation.id, {
      ...operation.fields,
      "Organization ID": "ai-engineer",
      "Event ID": "devflow-conf-2027",
    });
  }
  const unknownId = "evaluator-created-unknown";
  transport.add("Task Responses", unknownId, {
    "Application ID": unknownId,
    "Organization ID": "ai-engineer",
    "Event ID": "devflow-conf-2027",
    "Response JSON": JSON.stringify({
      tenantId: "ai-engineer",
      eventId: "devflow-conf-2027",
      id: unknownId,
    }),
  });
  const d1Id = "outbox-evaluator-created";
  const d1Record = {
    store: "d1",
    table: "durable_outbox",
    id: d1Id,
    recordId: d1Id,
    applicationId: d1Id,
    fields: {
      "Organization ID": "ai-engineer",
      "Event ID": "devflow-conf-2027",
      "Payload JSON": JSON.stringify({
        tenantId: "ai-engineer",
        eventId: "devflow-conf-2027",
      }),
    },
  };
  transport.records.set(`${d1Record.table}:${d1Id}`, d1Record);
  transport.discovered.push(d1Record);
  transport.add("Sessions", "foreign-event-session", {
    "Application ID": "foreign-event-session",
    "Organization ID": "ai-engineer",
    "Event ID": "other-event",
  });
  transport.add("Sessions", "foreign-org-session", {
    "Application ID": "foreign-org-session",
    "Organization ID": "other-org",
    "Event ID": "devflow-conf-2027",
  });
  transport.add("Memberships", "membership:keep", {
    "Application ID": "membership:keep",
    "Organization ID": "ai-engineer",
    "Event ID": "devflow-conf-2027",
  });
}

test("builds the strict six-identity ledger and exact canonical graph", () => {
  const manifest = build();
  assert.deepEqual(
    manifest.identityLedger.map((identity) => identity.identityKey),
    [
      "organizer-agenda",
      "organizer-fixture",
      "reviewer-sam",
      "speaker-priya",
      "speaker-marcus",
      "submitter",
    ],
  );
  assert.equal(new Set(manifest.identityLedger.map((identity) => identity.emailDigest)).size, 6);
  const speakerLedger = manifest.identityLedger.filter((identity) =>
    identity.identityKey.startsWith("speaker-"),
  );
  assert.deepEqual(
    speakerLedger.map((identity) => [
      identity.identityKey,
      identity.participantId,
      identity.speakerProfileId,
    ]),
    [
      ["speaker-priya", PARTICIPANT_IDS["speaker-priya"], PROFILE_IDS["speaker-priya"]],
      ["speaker-marcus", PARTICIPANT_IDS["speaker-marcus"], PROFILE_IDS["speaker-marcus"]],
    ],
  );
  assert.equal(JSON.stringify(manifest).includes("devflow-conf-2027-speaker-"), false);
  assert.equal(
    manifest.graph.sessions.every(
      (session) =>
        !Object.hasOwn(session, "speakerProfileIds") &&
        session.speakerIds.every((id) => Object.values(PARTICIPANT_IDS).includes(id)) &&
        session.speakerRoster.every((reference) =>
          Object.values(PARTICIPANT_IDS).includes(reference.id),
        ),
    ),
    true,
  );
  const projectionOperation = manifest.operations.find(
    (operation) => operation.table === "Published Speaker Projections",
  );
  assert.equal(projectionOperation.applicationId, `published-speakers:${manifest.eventId}`);
  const profileOperations = manifest.operations.filter(
    (operation) => operation.table === "Speaker Profiles",
  );
  assert.deepEqual(
    profileOperations.map((operation) => [
      operation.applicationId,
      JSON.parse(operation.fields.Biography).participantId,
      operation.fields.Participant,
    ]),
    [
      [
        PROFILE_IDS["speaker-priya"],
        PARTICIPANT_IDS["speaker-priya"],
        PARTICIPANT_IDS["speaker-priya"],
      ],
      [
        PROFILE_IDS["speaker-marcus"],
        PARTICIPANT_IDS["speaker-marcus"],
        PARTICIPANT_IDS["speaker-marcus"],
      ],
    ],
  );
  const sessionOperations = manifest.operations.filter(
    (operation) => operation.table === "Sessions",
  );
  assert.equal(
    sessionOperations.every((operation) =>
      JSON.parse(operation.fields["Speaker IDs JSON"]).every((id) =>
        Object.values(PARTICIPANT_IDS).includes(id),
      ),
    ),
    true,
  );
  const requiredSessionFields = [
    "tenantId",
    "organizationId",
    "eventId",
    "createdAt",
    "updatedAt",
    "createdBy",
    "updatedBy",
    "history",
  ];
  assert.equal(
    manifest.graph.sessions.every((session) =>
      requiredSessionFields.every((field) => Object.hasOwn(session, field)),
    ),
    true,
  );
  assert.equal(
    sessionOperations.every((operation) => {
      const metadata = JSON.parse(operation.fields["Metadata JSON"]);
      return (
        requiredSessionFields.every((field) => Object.hasOwn(metadata, field)) &&
        operation.fields["Organization ID"] === metadata.organizationId &&
        operation.fields["Event ID"] === metadata.eventId &&
        operation.fields["Created At"] === metadata.createdAt &&
        operation.fields["Updated At"] === metadata.updatedAt &&
        operation.fields["Created By User ID"] === metadata.createdBy &&
        operation.fields["Updated By User ID"] === metadata.updatedBy &&
        operation.fields["History JSON"] === JSON.stringify(metadata.history)
      );
    }),
    true,
  );
  const currentAgendaRevision = manifest.graph.agenda.revisions.find(
    (revision) => revision.id === manifest.graph.agenda.currentPublishedRevisionId,
  );
  assert.ok(currentAgendaRevision);
  assert.deepEqual(manifest.graph.projection.revision, {
    id: currentAgendaRevision.id,
    number: currentAgendaRevision.revisionNumber,
    publishedAt: currentAgendaRevision.publishedAt,
  });
  assert.equal(projectionOperation.fields["Revision ID"], currentAgendaRevision.id);
  const scheduledParticipantIds = [
    ...new Set(
      manifest.graph.sessions
        .filter((session) => session.roomId !== null)
        .flatMap((session) => session.speakerIds),
    ),
  ];
  const profilesByParticipant = new Map(
    profileOperations.map((operation) => {
      const profile = JSON.parse(operation.fields.Biography);
      return [profile.participantId, profile];
    }),
  );
  assert.deepEqual(scheduledParticipantIds.sort(), Object.values(PARTICIPANT_IDS).sort());
  assert.deepEqual(
    scheduledParticipantIds.map(
      (participantId) => profilesByParticipant.get(participantId)?.displayName,
    ),
    ["Marcus Okafor", "Priya Raman"],
  );
  assert.equal(manifest.graph.proposals.length, 3);
  assert.equal(manifest.graph.sessions.filter((session) => session.roomId !== null).length, 3);
  assert.equal(manifest.graph.sessions.filter((session) => session.roomId === null).length, 1);
  assert.equal(manifest.graph.tasks.length, 10);
  assert.equal(
    manifest.graph.tasks.every(
      (task) =>
        task.id.includes(`:${task.participantId}:`) &&
        task.profileId === PROFILE_IDS[task.identityKey],
    ),
    true,
  );
  assert.equal(
    manifest.graph.communication.activities.every((activity) => activity.sentAt === null),
    true,
  );
  assert.deepEqual(
    manifest.graph.projection.speakers.find((speaker) => speaker.displayName === "Marcus Okafor")
      .sessionIds,
    [manifest.graph.sessions[2].id],
  );
  assert.deepEqual(
    manifest.graph.projection.speakers.find((speaker) => speaker.displayName === "Priya Raman")
      .sessionIds,
    [manifest.graph.sessions[0].id, manifest.graph.sessions[1].id],
  );
  assert.deepEqual(
    manifest.graph.projection.speakers.map((speaker) => speaker.id),
    [PROFILE_IDS["speaker-priya"], PROFILE_IDS["speaker-marcus"]],
  );
  assert.equal(
    manifest.graph.projection.speakers.find((speaker) => speaker.displayName === "Priya Raman")
      .organization,
    "Latticework Systems",
  );
  const evaluation = manifest.operations.find((operation) => operation.table === "Evaluations");
  assert.equal(evaluation.applicationId, evaluation.id);
  const storedEvaluation = JSON.parse(evaluation.fields["Scores JSON"]);
  assert.equal(storedEvaluation.id, evaluation.id);
  assert.equal(storedEvaluation.tenantId, manifest.organizationId);
  assert.equal(storedEvaluation.eventId, manifest.eventId);
  assert.equal(storedEvaluation.reviewerId, IDS["reviewer-sam"]);
  assert.equal(storedEvaluation.status, "assigned");
  const reviewPlan = manifest.operations.find((operation) => operation.table === "Review Plans");
  assert.equal(JSON.parse(reviewPlan.fields["Rounds JSON"]).status, "open");
  const storedSubmissions = manifest.operations.filter(
    (operation) =>
      operation.table === "Submissions" && !operation.id.startsWith("speaker-submission:"),
  );
  assert.equal(
    storedSubmissions.every((operation) => {
      const payload = JSON.parse(operation.fields["Answers JSON"]);
      return (
        payload.id === operation.id &&
        payload.tenantId === manifest.organizationId &&
        payload.eventId === manifest.eventId &&
        payload.status === "submitted" &&
        payload.participants.length === 1
      );
    }),
    true,
  );
  const speakerSubmissions = manifest.operations.filter(
    (operation) =>
      operation.table === "Submissions" && operation.id.startsWith("speaker-submission:"),
  );
  assert.equal(speakerSubmissions.length, 3);
  assert.equal(
    speakerSubmissions.every((operation) => {
      const payload = JSON.parse(operation.fields["Answers JSON"]);
      return (
        payload.id === operation.id &&
        payload.entityType === "speaker_submission" &&
        payload.status === "accepted" &&
        payload.participantIds.length === 1
      );
    }),
    true,
  );
  const rosterEntries = manifest.operations.filter(
    (operation) => operation.table === "Session Roster",
  );
  assert.equal(rosterEntries.length, 3);
  assert.equal(
    rosterEntries.every((operation) => {
      const payload = JSON.parse(operation.fields["Members JSON"]);
      return (
        operation.fields.Participant === payload.participantId &&
        operation.fields["Participant ID"] === payload.participantId &&
        Object.values(PARTICIPANT_IDS).includes(payload.participantId) &&
        payload.id === operation.id &&
        payload.tenantId === manifest.organizationId &&
        payload.submissionId.startsWith("speaker-submission:") &&
        payload.status === "active"
      );
    }),
    true,
  );
  const speakerTasks = manifest.operations.filter(
    (operation) => operation.table === "Speaker Tasks",
  );
  assert.equal(speakerTasks.length, 10);
  assert.equal(
    speakerTasks.every((operation) => {
      const payload = JSON.parse(operation.fields["Owner JSON"]);
      return (
        operation.fields.Participant === payload.participantId &&
        Object.values(PARTICIPANT_IDS).includes(payload.participantId) &&
        payload.profileId === PROFILE_IDS[payload.identityKey] &&
        payload.eventId === manifest.eventId &&
        payload.submissionId.startsWith("speaker-submission:") &&
        payload.owner === "speaker" &&
        payload.participantId.length > 0 &&
        payload.dependencyIds.length === 0 &&
        payload.reminderOffsetsMinutes.length === 2 &&
        typeof payload.updatedAt === "string"
      );
    }),
    true,
  );
  const uploadTasks = speakerTasks
    .map((operation) => JSON.parse(operation.fields["Owner JSON"]))
    .filter((task) => task.type === "upload");
  assert.deepEqual(uploadTasks.map((task) => task.acceptedAssetKinds[0]).sort(), [
    "headshot",
    "headshot",
    "slides",
    "slides",
  ]);
  const storedDecisions = manifest.operations.filter(
    (operation) => operation.table === "Decisions",
  );
  assert.equal(
    storedDecisions.every((operation) => {
      const payload = JSON.parse(operation.fields["Metadata JSON"]);
      return (
        payload.id === operation.id &&
        payload.status === "accepted" &&
        payload.history[0]?.decidedBy === IDS["organizer-agenda"]
      );
    }),
    true,
  );
  const agendaOperation = manifest.operations.find(
    (operation) => operation.table === "Agenda Versions",
  );
  const storedAgenda = JSON.parse(agendaOperation.fields["Conflicts JSON"]);
  assert.equal(storedAgenda.draft.entries.length, 3);
  assert.equal(
    storedAgenda.sessions.every((session) => session.status === "accepted"),
    true,
  );
  assert.equal(storedAgenda.revisions[0].entries.length, 3);
  assert.equal(storedAgenda.currentPublishedRevisionId, storedAgenda.revisions[0].id);
  assert.equal(storedAgenda.revisions[0].publishedBy, IDS["organizer-agenda"]);
  const storedEntries = manifest.operations.filter(
    (operation) => operation.table === "Agenda Entries",
  );
  assert.equal(storedEntries.length, 3);
  assert.equal(
    storedEntries.every((operation) => {
      const payload = JSON.parse(operation.fields["Metadata JSON"]);
      return (
        operation.applicationId === `${manifest.eventId}:${payload.entry.id}` &&
        operation.fields["Agenda Version"] === manifest.eventId &&
        payload.eventId === manifest.eventId
      );
    }),
    true,
  );
});
test("serializes a complete canonical communication template", () => {
  const manifest = build();
  const operation = manifest.operations.find((candidate) => candidate.table === "Email Templates");
  assert.ok(operation);

  const template = manifest.graph.communication.template;
  const settings = JSON.parse(operation.fields["Settings JSON"]);
  const templateFields = [
    "id",
    "tenantId",
    "organizationId",
    "eventId",
    "name",
    "purpose",
    "version",
    "status",
    "sender",
    "subject",
    "html",
    "text",
    "variables",
    "createdBy",
    "createdAt",
    "updatedAt",
    "approvedBy",
    "approvedAt",
  ];
  assert.deepEqual(Object.keys(settings).sort(), [...templateFields].sort());
  assert.deepEqual(settings, template);
  assert.equal(operation.fields["Application ID"], template.id);
  assert.equal(operation.fields["Organization ID"], template.tenantId);
  assert.equal(operation.fields["Event ID"], template.eventId);
  assert.equal(operation.fields.Name, template.name);
  assert.equal(operation.fields.Purpose, template.purpose);
  assert.equal(operation.fields.Status, template.status);
  assert.equal(operation.fields.Sender, template.sender);
  assert.equal(operation.fields.Subject, template.subject);
  assert.equal(operation.fields.HTML, template.html);
  assert.equal(operation.fields.Text, template.text);
  assert.deepEqual(JSON.parse(operation.fields["Variables JSON"]), template.variables);
  assert.equal(operation.fields.Version, template.version);
  assert.equal(template.status, "draft");
  assert.equal(template.approvedBy, null);
  assert.equal(template.approvedAt, null);
});

test("rejects incomplete session metadata and unresolved publication revisions", async () => {
  const incompleteSession = build();
  delete incompleteSession.graph.sessions[0].updatedBy;
  await assert.rejects(
    readRepairInvariantReport({ manifest: incompleteSession }),
    (error) =>
      error instanceof DevflowRepairError &&
      error.code === "MANIFEST_INVALID" &&
      error.message.includes("updatedBy"),
  );

  const inconsistentOperation = build();
  const sessionOperation = inconsistentOperation.operations.find(
    (operation) => operation.table === "Sessions",
  );
  sessionOperation.fields["Created At"] = "2026-08-10T00:00:00.000Z";
  await assert.rejects(
    readRepairInvariantReport({ manifest: inconsistentOperation }),
    (error) =>
      error instanceof DevflowRepairError &&
      error.code === "MANIFEST_INVALID" &&
      error.message.includes("metadata fields are inconsistent"),
  );

  const unresolvedRevision = build();
  const projectionOperation = unresolvedRevision.operations.find(
    (operation) => operation.table === "Published Speaker Projections",
  );
  projectionOperation.fields["Revision ID"] = `${unresolvedRevision.eventId}-other-revision`;
  await assert.rejects(
    readRepairInvariantReport({ manifest: unresolvedRevision }),
    (error) =>
      error instanceof DevflowRepairError &&
      error.code === "MANIFEST_INVALID" &&
      error.message.includes("revision references do not resolve"),
  );
});
test("persists independent review rounds and deterministic proposal session IDs", () => {
  const manifest = build();
  const replay = build();
  const reviewPlanOperation = manifest.operations.find(
    (operation) => operation.table === "Review Plans",
  );
  assert.ok(reviewPlanOperation);
  const plan = JSON.parse(reviewPlanOperation.fields["Rounds JSON"]);
  const reviewPlanId = `${manifest.eventId}-initial-review`;
  const [initialRound, finalRound] = plan.rounds;
  assert.deepEqual(
    plan.rounds.map((round) => ({
      id: round.id,
      name: round.name,
      sequence: round.sequence,
      opensAt: round.opensAt,
      closesAt: round.closesAt,
      reviewerIds: round.reviewerPool?.reviewerIds,
      rubricId: round.rubric.id,
    })),
    [
      {
        id: `${reviewPlanId}-round-initial`,
        name: "Initial Review",
        sequence: 1,
        opensAt: "2026-08-01T00:00:00.000Z",
        closesAt: "2026-10-15T23:59:59.000Z",
        reviewerIds: [IDS["reviewer-sam"]],
        rubricId: `${reviewPlanId}-rubric-initial`,
      },
      {
        id: `${reviewPlanId}-round-final`,
        name: "Final Review",
        sequence: 2,
        opensAt: "2026-10-16T00:00:00.000Z",
        closesAt: "2026-11-30T23:59:59.000Z",
        reviewerIds: [],
        rubricId: `${reviewPlanId}-rubric-final`,
      },
    ],
  );
  assert.equal(plan.status, "open");
  assert.ok(Date.parse(plan.closesAt) >= Date.parse(finalRound.closesAt));
  assert.equal(initialRound.blindReview, true);
  assert.equal(initialRound.anonymization, "double");
  assert.notEqual(initialRound.rubric.id, finalRound.rubric.id);
  assert.deepEqual(
    Object.fromEntries(
      initialRound.rubric.criteria.map((criterion) => [
        criterion.id,
        [criterion.inputType, criterion.weight],
      ]),
    ),
    {
      originality: ["numeric", 2],
      relevance: ["numeric", 1],
      recommendation: ["dropdown", 0],
      comments: ["free_text", 0],
    },
  );
  assert.deepEqual(
    finalRound.rubric.criteria.map((criterion) => [criterion.id, criterion.inputType]),
    [
      ["final-recommendation", "dropdown"],
      ["program-notes", "free_text"],
    ],
  );
  const assignments = manifest.operations.filter((operation) => operation.table === "Evaluations");
  assert.equal(assignments.length, 3);
  assert.equal(
    assignments.every((operation) => {
      const scores = JSON.parse(operation.fields["Scores JSON"]);
      return operation.fields["Round ID"] === initialRound.id && scores.roundId === initialRound.id;
    }),
    true,
  );
  const proposalSessions = manifest.graph.sessions.filter((session) => session.proposalId !== null);
  assert.deepEqual(
    proposalSessions.map((session) => [session.proposalId, session.id]),
    manifest.graph.proposals.map((proposal) => [proposal.id, `session-${proposal.id}`]),
  );
  const lightning = manifest.graph.sessions.find((session) => session.proposalId === null);
  assert.equal(lightning.id, "devflow-conf-2027-session-lightning-agents-in-production-q-a");
  assert.equal(manifest.digest, replay.digest);
  assert.deepEqual(
    manifest.operations.map((operation) => [operation.key, operation.id, operation.inputDigest]),
    replay.operations.map((operation) => [operation.key, operation.id, operation.inputDigest]),
  );
  assert.deepEqual(
    manifest.graph.sessions.map((session) => [session.id, session.proposalId]),
    replay.graph.sessions.map((session) => [session.id, session.proposalId]),
  );
});

test("prepare is read-only and plans all writes", async () => {
  const manifest = build();
  const transport = fakeTransport();
  const result = await prepareRepair({
    manifest,
    transport,
    now: "2026-08-09T12:00:00.000Z",
    writeManifest: false,
  });
  assert.equal(result.prepared.dryRun, true);
  assert.equal(result.prepared.writes, 0);
  assert.equal(transport.writes.length, 0);
  assert.equal(transport.commands.length, 0);
  assert.equal(
    result.prepared.plan.some((action) => action.action === "create"),
    true,
  );
});

test("duplicate and optimistic drift are hard stops", async () => {
  const manifest = build();
  const first = manifest.operations[0];
  await assert.rejects(
    prepareRepair({
      manifest,
      transport: fakeTransport({ duplicateKey: first.key }),
      writeManifest: false,
    }),
    (error) => error instanceof DevflowRepairError && error.code === "DUPLICATE_OBJECT",
  );
  const transport = fakeTransport();
  transport.records.set(`${first.table}:${first.id}`, {
    id: "existing-foundation",
    fields: first.fields,
  });
  const prepared = await prepareRepair({ manifest, transport, writeManifest: false });
  const drifted = fakeTransport({ driftKey: first.key });
  drifted.records.set(`${first.table}:${first.id}`, {
    id: "existing-foundation",
    fields: first.fields,
  });
  await assert.rejects(
    applyRepair({
      manifest,
      prepared,
      transport: drifted,
      confirm: REPAIR_CONFIRMATION,
      options: { environment: "production" },
    }),
    (error) => error instanceof DevflowRepairError && error.code === "VERSION_CONFLICT",
  );
});

test("partial failure can resume from the durable run ledger", async () => {
  const manifest = build();
  const transport = fakeTransport();
  const prepared = await prepareRepair({ manifest, transport, writeManifest: false });
  await assert.rejects(
    applyRepair({ manifest, prepared, transport, confirm: REPAIR_CONFIRMATION, failureAfter: 1 }),
    (error) => error instanceof DevflowRepairError && error.code === "PARTIAL_REPAIR",
  );
  const resumed = await resumeRepair({
    manifest,
    transport,
    confirm: REPAIR_CONFIRMATION,
    writeManifest: false,
  });
  assert.equal(resumed.status, "applied");
  assert.equal(
    Object.values(manifest.runLedger).every((entry) => entry.state === "complete"),
    true,
  );
});

test("durable complete failure checkpoints a retryable state and resumes without rewriting", async () => {
  const temporary = temporaryManifestPath();
  try {
    const manifest = build();
    const target = manifest.operations.find((operation) => operation.table === "Sessions");
    const transport = fakeTransport({
      ledgerFailureState: "complete",
      ledgerFailureKey: target.key,
    });
    const prepared = await prepareRepair({ manifest, transport, writeManifest: false });
    let failure;
    await assert.rejects(
      applyRepair({
        manifest,
        manifestPath: temporary.path,
        prepared,
        transport,
        confirm: REPAIR_CONFIRMATION,
      }),
      (error) => {
        failure = error;
        return error instanceof DevflowRepairError && error.code === "LEDGER_WRITE_FAILED";
      },
    );
    assert.deepEqual(failure.details, {
      phase: "repair",
      ledgerKey: target.key,
      state: "complete",
      causeCode: "LEDGER_UNAVAILABLE",
      checkpoint: {
        attempted: true,
        persisted: true,
        path: temporary.path,
        recoveryState: "started",
      },
    });
    const checkpoint = JSON.parse(readFileSync(temporary.path, "utf8"));
    assert.equal(checkpoint.runLedger[target.key].state, "started");
    assert.equal(checkpoint.runLedger[target.key].durableLedgerFailure.attemptedState, "complete");
    assert.equal(transport.writes.filter((operation) => operation.key === target.key).length, 1);
    const stored = transport.records.get(`${target.table}:${target.id}`);
    stored.fields["External Observation"] = "preserved";

    transport.setLedgerFailure(undefined);
    const resumed = await resumeRepair({
      manifest: checkpoint,
      manifestPath: temporary.path,
      transport,
      confirm: REPAIR_CONFIRMATION,
      writeManifest: false,
    });
    assert.equal(resumed.status, "applied");
    assert.equal(checkpoint.runLedger[target.key].state, "complete");
    assert.equal(transport.writes.filter((operation) => operation.key === target.key).length, 1);
    assert.equal(stored.fields["External Observation"], "preserved");
  } finally {
    temporary.cleanup();
  }
});

test("durable started failure remains retryable without writing a manifest", async () => {
  const manifest = build();
  const target = manifest.operations.find((operation) => operation.table === "Sessions");
  const transport = fakeTransport({
    ledgerFailureState: "started",
    ledgerFailureKey: target.key,
  });
  const prepared = await prepareRepair({ manifest, transport, writeManifest: false });
  let failure;
  await assert.rejects(
    applyRepair({
      manifest,
      prepared,
      transport,
      confirm: REPAIR_CONFIRMATION,
      writeManifest: false,
    }),
    (error) => {
      failure = error;
      return error instanceof DevflowRepairError && error.code === "LEDGER_WRITE_FAILED";
    },
  );
  assert.equal(failure.details.checkpoint.attempted, false);
  assert.equal(failure.details.checkpoint.persisted, false);
  assert.equal(failure.details.checkpoint.recoveryState, "started");
  assert.equal(manifest.runLedger[target.key].state, "started");
  assert.equal(manifest.runLedger[target.key].durableLedgerFailure.attemptedState, "started");
  assert.equal(transport.writes.filter((operation) => operation.key === target.key).length, 0);

  transport.setLedgerFailure(undefined);
  const resumed = await resumeRepair({
    manifest,
    transport,
    confirm: REPAIR_CONFIRMATION,
    writeManifest: false,
  });
  assert.equal(resumed.status, "applied");
  assert.equal(manifest.runLedger[target.key].state, "complete");
  assert.equal(transport.writes.filter((operation) => operation.key === target.key).length, 1);
});

test("apply refuses to mutate without a durable ledger capability", async () => {
  const manifest = build();
  const transport = fakeTransport();
  delete transport.recordLedger;
  const prepared = await prepareRepair({ manifest, transport, writeManifest: false });
  let failure;
  await assert.rejects(
    applyRepair({
      manifest,
      prepared,
      transport,
      confirm: REPAIR_CONFIRMATION,
      writeManifest: false,
    }),
    (error) => {
      failure = error;
      return error instanceof DevflowRepairError && error.code === "LEDGER_WRITE_FAILED";
    },
  );
  assert.equal(failure.details.causeCode, "LEDGER_UNAVAILABLE");
  assert.equal(failure.details.state, "started");
  assert.equal(failure.details.checkpoint.recoveryState, "started");
  assert.equal(transport.writes.length, 0);
  assert.equal(transport.commands.length, 0);
});

test("post-write reconciliation rejects an owned-field mutation before retry", async () => {
  const manifest = build();
  const target = manifest.operations.find((operation) => operation.table === "Sessions");
  const transport = fakeTransport({
    ledgerFailureState: "complete",
    ledgerFailureKey: target.key,
  });
  const prepared = await prepareRepair({ manifest, transport, writeManifest: false });
  await assert.rejects(
    applyRepair({
      manifest,
      prepared,
      transport,
      confirm: REPAIR_CONFIRMATION,
      writeManifest: false,
    }),
    (error) => error instanceof DevflowRepairError && error.code === "LEDGER_WRITE_FAILED",
  );
  const stored = transport.records.get(`${target.table}:${target.id}`);
  stored.fields.Title = "Changed before reconciliation";
  transport.setLedgerFailure(undefined);

  await assert.rejects(
    applyRepair({
      manifest,
      prepared,
      transport,
      confirm: REPAIR_CONFIRMATION,
      writeManifest: false,
    }),
    (error) =>
      error instanceof DevflowRepairError &&
      error.code === "LEDGER_RECONCILIATION_CONFLICT" &&
      error.details.ledgerKey === target.key,
  );
  assert.equal(transport.writes.filter((operation) => operation.key === target.key).length, 1);
});

test("apply verifies Airtable records when blank cells are omitted", async () => {
  const manifest = build();
  const transport = fakeTransport({ omitBlankFields: true });
  const prepared = await prepareRepair({ manifest, transport, writeManifest: false });
  const result = await applyRepair({
    manifest,
    prepared,
    transport,
    confirm: REPAIR_CONFIRMATION,
  });
  assert.equal(result.status, "applied");
});

test("prepare treats equivalent ISO-offset timestamps as unchanged", async () => {
  const manifest = build();
  const transport = fakeTransport();
  const operation = manifest.operations.find((candidate) => candidate.table === "Speaker Tasks");
  transport.records.set(`${operation.table}:${operation.id}`, {
    id: "existing-speaker-task",
    fields: {
      ...operation.fields,
      "Due At": new Date(operation.fields["Due At"]).toISOString(),
    },
  });
  const prepared = await prepareRepair({ manifest, transport, writeManifest: false });
  assert.equal(prepared.prepared.plan.find((item) => item.key === operation.key).action, "skip");
});

test("apply records unchanged operations without rewriting them", async () => {
  const manifest = build();
  const transport = fakeTransport();
  const operation = manifest.operations.find((candidate) => candidate.table === "Events");
  transport.records.set(`${operation.table}:${operation.id}`, {
    id: "existing-event",
    fields: operation.fields,
  });
  const prepared = await prepareRepair({ manifest, transport, writeManifest: false });
  const result = await applyRepair({
    manifest,
    prepared,
    transport,
    confirm: REPAIR_CONFIRMATION,
  });
  assert.equal(result.status, "applied");
  assert.equal(
    transport.writes.some((write) => write.key === operation.key),
    false,
  );
  assert.equal(manifest.runLedger[operation.key].skipped, true);
});

test("apply creates an unresolved identity before dependent writes", async () => {
  const unresolved = identities();
  delete unresolved["organizer-fixture"].userId;
  unresolved["organizer-fixture"].verified = false;
  const manifest = buildRepairManifest({ fixture: TEST_FIXTURE, identities: unresolved });
  const transport = fakeTransport();
  const prepared = await prepareRepair({ manifest, transport, writeManifest: false });
  let signupName;
  const result = await applyRepair({
    manifest,
    prepared,
    transport,
    credentials: {
      "organizer-fixture": {
        password: "A-strong-test-password-2027",
      },
    },
    options: {
      apiOrigin: "https://api.example.test",
      webOrigin: "https://web.example.test",
      fetchImplementation: async (_url, init) => {
        signupName = JSON.parse(init.body).name;
        return new Response(JSON.stringify({ user: { id: IDS["organizer-fixture"] } }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      },
    },
    confirm: REPAIR_CONFIRMATION,
  });
  assert.equal(result.status, "applied");
  assert.equal(
    manifest.identityLedger.find((identity) => identity.identityKey === "organizer-fixture")
      ?.userId,
    IDS["organizer-fixture"],
  );
  assert.equal(signupName, "Jordan Alvarez");
  const sessionOperation = manifest.operations.find((operation) => operation.table === "Sessions");
  const sessionMetadata = JSON.parse(sessionOperation.fields["Metadata JSON"]);
  assert.equal(sessionMetadata.createdBy, IDS["organizer-fixture"]);
  assert.equal(sessionMetadata.updatedBy, IDS["organizer-fixture"]);
  assert.equal(sessionOperation.fields["Created By User ID"], IDS["organizer-fixture"]);
  assert.equal(sessionOperation.fields["Updated By User ID"], IDS["organizer-fixture"]);
  assert.equal(
    manifest.graph.sessions.every(
      (session) =>
        session.createdBy === IDS["organizer-fixture"] &&
        session.updatedBy === IDS["organizer-fixture"],
    ),
    true,
  );
});

test("runRepair forwards production account origins to identity resolution", async () => {
  const unresolved = identities();
  delete unresolved["organizer-fixture"].userId;
  unresolved["organizer-fixture"].verified = false;
  const manifest = buildRepairManifest({ fixture: TEST_FIXTURE, identities: unresolved });
  const transport = fakeTransport();
  let signupUrl;
  const result = await runRepair({
    phase: "apply",
    manifest,
    transport,
    credentials: {
      "organizer-fixture": {
        password: "A-strong-test-password-2027",
      },
    },
    environment: "production",
    apiOrigin: "https://api.example.test",
    webOrigin: "https://web.example.test",
    fetchImplementation: async (url) => {
      signupUrl = String(url);
      return new Response(JSON.stringify({ user: { id: IDS["organizer-fixture"] } }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    },
    confirm: REPAIR_CONFIRMATION,
  });

  assert.equal(result.status, "applied");
  assert.equal(signupUrl, "https://api.example.test/api/auth/sign-up/email");
});

test("identity email collisions never merge by name or alias", () => {
  const duplicate = identities();
  duplicate["organizer-agenda"].email = duplicate["organizer-fixture"].email;
  assert.throws(
    () => buildRepairManifest({ fixture: TEST_FIXTURE, identities: duplicate }),
    (error) => error instanceof DevflowRepairError && error.code === "DUPLICATE_IDENTITY",
  );
});

test("invariant report is read-only and seals the public graph", async () => {
  const manifest = build();
  const report = await readRepairInvariantReport({ manifest });
  assert.equal(report.ok, true);
  assert.equal(report.checks.publicGraph, true);
  assert.equal(report.counts.publishedSessions, 3);
  assert.equal(report.counts.unscheduledSessions, 1);
});
test("workflow reset plans without writes, removes unknown scoped records, and preserves protected records", async () => {
  const manifest = build();
  const transport = resetTransport();
  addWorkflowRecords(transport, manifest);
  const prepared = await prepareWorkflowReset({
    manifest,
    transport,
    writeManifest: false,
    now: "2026-08-09T12:00:00.000Z",
  });
  assert.equal(transport.writes.length, 0);
  assert.equal(transport.commands.length, 0);
  assert.ok(
    prepared.prepared.plan.deletes.some((entry) => entry.id === "evaluator-created-unknown"),
  );
  assert.ok(
    prepared.prepared.plan.deletes.some(
      (entry) => entry.table === "Agenda Versions" && entry.id === "devflow-conf-2027",
    ),
  );
  assert.ok(
    prepared.prepared.plan.deletes.some(
      (entry) =>
        entry.table === "Published Speaker Projections" &&
        entry.id === "published-speakers:devflow-conf-2027",
    ),
  );
  assert.ok(
    prepared.prepared.plan.deletes.some(
      (entry) => entry.store === "d1" && entry.id === "outbox-evaluator-created",
    ),
  );
  const result = await applyWorkflowReset({
    manifest,
    prepared,
    transport,
    confirm: RESET_WORKFLOW_CONFIRMATION,
    writeManifest: false,
  });
  assert.equal(result.status, "applied");
  assert.ok(transport.deletes.some((operation) => operation.id === "evaluator-created-unknown"));
  assert.ok(
    transport.deletes.some(
      (operation) => operation.table === "Agenda Versions" && operation.id === "devflow-conf-2027",
    ),
  );
  assert.ok(
    transport.deletes.some(
      (operation) =>
        operation.table === "Published Speaker Projections" &&
        operation.id === "published-speakers:devflow-conf-2027",
    ),
  );
  assert.equal(transport.records.has("Events:devflow-conf-2027"), true);
  assert.equal(transport.records.has("Memberships:membership:keep"), true);
  assert.equal(transport.records.has("Sessions:foreign-event-session"), true);
  assert.equal(transport.records.has("Sessions:foreign-org-session"), true);
  assert.equal(transport.writes.length, 0);
  assert.equal(transport.records.has("durable_outbox:outbox-evaluator-created"), false);
  const second = await applyWorkflowReset({
    manifest,
    transport,
    confirm: RESET_WORKFLOW_CONFIRMATION,
    writeManifest: false,
  });
  assert.equal(second.writes, 0);
  assert.equal(second.deletes, 0);
});
test("workflow reset persists legacy speaker-profile deletions across manifest roundtrip", async () => {
  const manifest = build();
  const transport = resetTransport();
  addWorkflowRecords(transport, manifest);
  const legacyId = "devflow-conf-2027-speaker-priya-raman";
  transport.add(
    "Speaker Profiles",
    legacyId,
    {
      "Application ID": legacyId,
      "Organization ID": "ai-engineer",
      "Event ID": "devflow-conf-2027",
      Participant: PARTICIPANT_IDS["speaker-priya"],
    },
    "legacy-speaker-profile-record",
  );

  const first = await prepareWorkflowReset({
    manifest,
    transport,
    writeManifest: false,
    now: "2026-08-09T12:00:00.000Z",
  });
  const persistedManifest = JSON.parse(JSON.stringify(first.manifest));
  assert.ok(
    persistedManifest.resetWorkflow.deletions.some(
      (entry) => entry.table === "Speaker Profiles" && entry.id === legacyId,
    ),
  );

  const prepared = await prepareWorkflowReset({
    manifest: persistedManifest,
    transport,
    writeManifest: false,
    now: "2026-08-09T12:00:00.000Z",
  });
  const result = await applyWorkflowReset({
    manifest: persistedManifest,
    prepared,
    transport,
    confirm: RESET_WORKFLOW_CONFIRMATION,
    writeManifest: false,
  });

  assert.equal(result.status, "applied");
  assert.ok(
    transport.deletes.some(
      (operation) => operation.table === "Speaker Profiles" && operation.id === legacyId,
    ),
  );
  assert.equal(transport.records.has(`Speaker Profiles:${legacyId}`), false);
  assert.ok(transport.deletes.some((operation) => operation.id === "evaluator-created-unknown"));
  assert.equal(transport.records.has("Events:devflow-conf-2027"), true);
  assert.equal(transport.records.has("Memberships:membership:keep"), true);
  assert.equal(transport.records.has("Sessions:foreign-event-session"), true);
  assert.equal(transport.records.has("Sessions:foreign-org-session"), true);
});

test("workflow reset resumes after a partial delete and rejects unsafe confirmation", async () => {
  const manifest = build();
  const transport = resetTransport();
  addWorkflowRecords(transport, manifest);
  const prepared = await prepareWorkflowReset({ manifest, transport, writeManifest: false });
  await assert.rejects(
    applyWorkflowReset({
      manifest,
      prepared,
      transport,
      confirm: "wrong",
      writeManifest: false,
    }),
    (error) => error instanceof DevflowRepairError && error.code === "RESET_CONFIRMATION_REQUIRED",
  );
  await assert.rejects(
    applyWorkflowReset({
      manifest,
      prepared,
      transport,
      confirm: RESET_WORKFLOW_CONFIRMATION,
      failureAfter: 1,
      writeManifest: false,
    }),
    (error) => error instanceof DevflowRepairError && error.code === "PARTIAL_RESET",
  );
  const resumed = await resumeWorkflowReset({
    manifest,
    transport,
    confirm: RESET_WORKFLOW_CONFIRMATION,
    writeManifest: false,
  });
  assert.equal(resumed.status, "applied");
  assert.equal(
    Object.values(manifest.resetLedger).every((entry) => entry.state === "complete"),
    true,
  );
});

test("workflow reset replays a failed durable completion without deleting twice", async () => {
  const temporary = temporaryManifestPath();
  try {
    const manifest = build();
    const transport = resetTransport();
    addWorkflowRecords(transport, manifest);
    const prepared = await prepareWorkflowReset({ manifest, transport, writeManifest: false });
    const target = prepared.targets[0];
    transport.setLedgerFailure("complete", target.key);
    let failure;
    await assert.rejects(
      applyWorkflowReset({
        manifest,
        manifestPath: temporary.path,
        prepared,
        transport,
        confirm: RESET_WORKFLOW_CONFIRMATION,
      }),
      (error) => {
        failure = error;
        return error instanceof DevflowRepairError && error.code === "LEDGER_WRITE_FAILED";
      },
    );
    assert.equal(failure.details.phase, "reset-workflow");
    assert.equal(failure.details.ledgerKey, target.key);
    assert.equal(failure.details.checkpoint.recoveryState, "started");
    assert.equal(failure.details.checkpoint.persisted, true);
    assert.equal(transport.deletes.filter((operation) => operation.key === target.key).length, 1);

    const checkpoint = JSON.parse(readFileSync(temporary.path, "utf8"));
    assert.equal(checkpoint.resetLedger[target.key].state, "started");
    transport.setLedgerFailure(undefined);
    const resumed = await resumeWorkflowReset({
      manifest: checkpoint,
      manifestPath: temporary.path,
      transport,
      confirm: RESET_WORKFLOW_CONFIRMATION,
      writeManifest: false,
    });
    assert.equal(resumed.status, "applied");
    assert.equal(checkpoint.resetLedger[target.key].state, "complete");
    assert.equal(checkpoint.resetLedger[target.key].recovered, true);
    assert.equal(transport.deletes.filter((operation) => operation.key === target.key).length, 1);
  } finally {
    temporary.cleanup();
  }
});

test("workflow reset retries a failed durable start before deleting", async () => {
  const manifest = build();
  const transport = resetTransport();
  addWorkflowRecords(transport, manifest);
  const prepared = await prepareWorkflowReset({ manifest, transport, writeManifest: false });
  const target = prepared.targets[0];
  transport.setLedgerFailure("started", target.key);
  await assert.rejects(
    applyWorkflowReset({
      manifest,
      prepared,
      transport,
      confirm: RESET_WORKFLOW_CONFIRMATION,
      writeManifest: false,
    }),
    (error) => error instanceof DevflowRepairError && error.code === "LEDGER_WRITE_FAILED",
  );
  assert.equal(manifest.resetLedger[target.key].state, "started");
  assert.equal(manifest.resetLedger[target.key].durableLedgerFailure.attemptedState, "started");
  assert.equal(transport.deletes.filter((operation) => operation.key === target.key).length, 0);

  transport.setLedgerFailure(undefined);
  const resumed = await resumeWorkflowReset({
    manifest,
    transport,
    confirm: RESET_WORKFLOW_CONFIRMATION,
    writeManifest: false,
  });
  assert.equal(resumed.status, "applied");
  assert.equal(manifest.resetLedger[target.key].state, "complete");
  assert.equal(transport.deletes.filter((operation) => operation.key === target.key).length, 1);
});

test("foundation reconciliation preserves an unowned mutation without rewriting", async () => {
  const manifest = build();
  const transport = resetTransport();
  const prepared = await prepareWorkflowReset({ manifest, transport, writeManifest: false });
  const target = prepared.foundationOperations[0];
  transport.setLedgerFailure("complete");
  let failure;
  await assert.rejects(
    applyWorkflowReset({
      manifest,
      prepared,
      transport,
      confirm: RESET_WORKFLOW_CONFIRMATION,
      writeManifest: false,
    }),
    (error) => {
      failure = error;
      return error instanceof DevflowRepairError && error.code === "LEDGER_WRITE_FAILED";
    },
  );
  const stored = transport.records.get(`${target.table}:${target.id}`);
  stored.fields["External Observation"] = "preserved";
  transport.setLedgerFailure(undefined);

  const resumed = await resumeWorkflowReset({
    manifest,
    transport,
    confirm: RESET_WORKFLOW_CONFIRMATION,
    writeManifest: false,
  });
  assert.equal(resumed.status, "applied");
  assert.equal(manifest.resetLedger[failure.details.ledgerKey].state, "complete");
  assert.equal(transport.writes.filter((operation) => operation.key === target.key).length, 1);
  assert.equal(stored.fields["External Observation"], "preserved");
});

test("foundation reconciliation rejects an owned-field mutation before rewriting", async () => {
  const manifest = build();
  const transport = resetTransport();
  const prepared = await prepareWorkflowReset({ manifest, transport, writeManifest: false });
  const target = prepared.foundationOperations[0];
  transport.setLedgerFailure("complete");
  let failure;
  await assert.rejects(
    applyWorkflowReset({
      manifest,
      prepared,
      transport,
      confirm: RESET_WORKFLOW_CONFIRMATION,
      writeManifest: false,
    }),
    (error) => {
      failure = error;
      return error instanceof DevflowRepairError && error.code === "LEDGER_WRITE_FAILED";
    },
  );
  const stored = transport.records.get(`${target.table}:${target.id}`);
  const ownedField = Object.keys(target.ownedFields).find(
    (field) => field !== "Application ID" && typeof stored.fields[field] === "string",
  );
  stored.fields[ownedField] = "Changed before reconciliation";
  transport.setLedgerFailure(undefined);

  await assert.rejects(
    resumeWorkflowReset({
      manifest,
      transport,
      confirm: RESET_WORKFLOW_CONFIRMATION,
      writeManifest: false,
    }),
    (error) =>
      error instanceof DevflowRepairError &&
      error.code === "LEDGER_RECONCILIATION_CONFLICT" &&
      error.details.ledgerKey === failure.details.ledgerKey,
  );
  assert.equal(transport.writes.filter((operation) => operation.key === target.key).length, 1);
});

test("reset CLI requires an explicit confirmation only for destructive mode", () => {
  const plan = parseArguments(["--reset-workflow"]);
  assert.equal(plan.phase, "reset-workflow");
  assert.equal(plan.dryRun, true);
  assert.throws(
    () => parseArguments(["--reset-workflow", "--apply"]),
    (error) => error instanceof DevflowRepairError && error.code === "RESET_CONFIRMATION_REQUIRED",
  );
  const manifestBound = parseArguments([
    "--reset-workflow",
    "--confirm",
    "I_UNDERSTAND_PRODUCTION_DEVFLOW_RESET:digest",
  ]);
  assert.equal(manifestBound.dryRun, false);
  const apply = parseArguments(["--reset-workflow", "--confirm", "ai-engineer"]);
  assert.equal(apply.dryRun, false);
});
