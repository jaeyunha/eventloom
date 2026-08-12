#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createProductionRepairAdapter } from "./production-repair-adapter.mjs";
import { createBetterAuthAccount } from "./provision-personas.mjs";
import {
  APPLICATION_ID_FIELD,
  buildSeedRecords,
  FULL_CHAIN_MODE,
  loadFixture,
  loadSeedConfig,
  stableId,
} from "./seed-devflow.mjs";

export const REPAIR_VERSION = "repair:v5";
export const CANONICAL_ORGANIZATION_ID = "ai-engineer";
export const CANONICAL_EVENT_ID = "devflow-conf-2027";
export const DEFAULT_REPAIR_MANIFEST_PATH = "/tmp/killmysaas-evals/devflow-repair-manifest.json";
export const DEFAULT_REPAIR_LEDGER_PATH = "/tmp/killmysaas-evals/devflow-repair-ledger.json";
export const DEFAULT_REPAIR_CONFIG_PATH = "/tmp/killmysaas-evals/devflow-repair-config.json";
export const DEFAULT_AIRTABLE_API_ORIGIN = "https://api.airtable.com";
export const REPAIR_CONFIRMATION = CANONICAL_ORGANIZATION_ID;
export const REPAIR_PHASES = Object.freeze([
  "prepare",
  "apply",
  "resume",
  "invariants",
  "reset-workflow",
  "reset",
]);

export const RESET_WORKFLOW_VERSION = "workflow-reset:v1";
export const RESET_WORKFLOW_CONFIRMATION = CANONICAL_ORGANIZATION_ID;
export const RESET_WORKFLOW_PHASE = "reset-workflow";
export const RESET_PROTECTED_TABLES = Object.freeze([
  "Organizations",
  "Memberships",
  "Events",
  "CFP Forms",
  "Tracks",
  "Formats",
  "Rooms",
  "Session Settings",
  "Levels",
  "Tags",
  "Session Statuses",
  "Reusable Fields",
]);
export const RESET_DISCOVERY_TABLES = Object.freeze([
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
  "Email Templates",
  "Email Send Snapshots",
  "Report Definitions",
  "Report Runs",
  "Remix Candidates",
  "Remix Audit",
  "CRM Contacts",
  "CRM History",
  "CRM Pipeline",
  "CRM Notes",
  "CRM Event Projections",
  "CRM Outreach",
]);
export const RESET_DELETE_ORDER = Object.freeze([
  "CRM Outreach",
  "CRM History",
  "CRM Pipeline",
  "CRM Notes",
  "CRM Event Projections",
  "Email Send Snapshots",
  "Email Templates",
  "File Comments",
  "File Versions",
  "File Assets",
  "Task Responses",
  "Task Forms",
  "Portal Resources",
  "Wiki Pages",
  "Session Roster",
  "Participants",
  "Speaker Tasks",
  "Published Speaker Projections",
  "Agenda Entries",
  "Agenda Versions",
  "Sessions",
  "Remix Audit",
  "Remix Candidates",
  "Audit Records",
  "Publication Outbox",
  "Decisions",
  "Evaluations",
  "Review Plans",
  "Submissions",
  "Speaker Profiles",
  "CRM Contacts",
]);
export const IDENTITY_KEYS = Object.freeze([
  "organizer-agenda",
  "organizer-fixture",
  "reviewer-sam",
  "speaker-priya",
  "speaker-marcus",
  "submitter",
]);

const IDENTITY_SOURCE_KEYS = Object.freeze({
  "organizer-fixture": "organizer",
  "reviewer-sam": "reviewer",
  "speaker-priya": "speaker",
  "speaker-marcus": "speaker2",
});
const SPEAKER_PARTICIPANT_IDS = Object.freeze({
  "speaker-priya": stableId(CANONICAL_EVENT_ID, "participant", "speaker-priya"),
  "speaker-marcus": stableId(CANONICAL_EVENT_ID, "participant", "speaker-marcus"),
});
const SPEAKER_PROFILE_IDS = Object.freeze({
  "speaker-priya": `speaker-profile:${CANONICAL_EVENT_ID}:${
    SPEAKER_PARTICIPANT_IDS["speaker-priya"]
  }`,
  "speaker-marcus": `speaker-profile:${CANONICAL_EVENT_ID}:${
    SPEAKER_PARTICIPANT_IDS["speaker-marcus"]
  }`,
});
const REVIEW_PLAN_ID = `${CANONICAL_EVENT_ID}-initial-review`;
const REVIEW_FINAL_ROUND_ID = `${REVIEW_PLAN_ID}-round-final`;
const REVIEW_ROUND_ID = `${REVIEW_PLAN_ID}-round-initial`;
const AGENDA_REVISION_ID = `${CANONICAL_EVENT_ID}-agenda-revision-1`;
const PUBLISHED_SPEAKERS_ID = `published-speakers:${CANONICAL_EVENT_ID}`;
const REVIEW_WINDOW_DEFAULT = Object.freeze({
  opensAt: "2026-08-01T00:00:00.000Z",
  closesAt: "2027-04-30T23:59:59.000Z",
});
const REVIEW_ROUND_DATES = Object.freeze({
  initialClosesAt: "2026-10-15T23:59:59.000Z",
  finalOpensAt: "2026-10-16T00:00:00.000Z",
  finalClosesAt: "2026-11-30T23:59:59.000Z",
});
const PUBLISHED_AT_DEFAULT = "2026-08-09T12:00:00.000Z";
const TASK_NAMES = Object.freeze([
  "Confirm participation",
  "Upload headshot",
  "Complete bio and profile",
  "Upload final slides by 2027-05-01",
  "Sign speaker release form",
]);
const DEFAULT_TASK_POLICY = Object.freeze({
  defaultDueAt: "2027-04-01T23:59:59-07:00",
  slidesDueAt: "2027-05-01T23:59:59-07:00",
});
const SESSION_TITLES = Object.freeze({
  taming: "Taming 40-Minute CI: Incremental Builds at Monorepo Scale",
  pair: "Your AI Pair Programmer Is Lying to You: Verification Patterns That Scale",
  docs: "Docs That Answer Back: Retrieval-Grounded Documentation Sites",
  lightning: "Lightning: Agents in Production Q&A",
});
const ENVIRONMENTS = new Set(["local", "staging", "production"]);
const DEFAULT_FETCH = globalThis.fetch;

export class DevflowRepairError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "DevflowRepairError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details = undefined) {
  throw new DevflowRepairError(code, message, details);
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clone(value) {
  return structuredClone(value);
}

function text(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail("CONFIGURATION_ERROR", `${label} is required.`);
  }
  return value.trim();
}

function optionalText(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeEmail(value, label) {
  const email = text(value, label).toLowerCase();
  if (!/^\S+@\S+$/u.test(email)) fail("INVALID_EMAIL", `${label} is invalid.`);
  return email;
}

function dateIso(value, label) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) fail("CONFIGURATION_ERROR", `${label} must be a valid date.`);
  return date.toISOString();
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function emailDigest(email) {
  return createHash("sha256").update(normalizeEmail(email, "identity email")).digest("hex");
}

function json(value) {
  return JSON.stringify(value);
}

function slug(value) {
  return String(value)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function ledgerKey(kind, value) {
  return `${REPAIR_VERSION}:${kind}:${value}`;
}

function ensureScope(config) {
  if (
    config.organizationId !== CANONICAL_ORGANIZATION_ID ||
    config.eventId !== CANONICAL_EVENT_ID
  ) {
    fail("SCOPE_MISMATCH", "The DevFlow repair scope is immutable.");
  }
}

function exactSubmission(fixture, title) {
  const matches = fixture.submissions.filter((submission) => submission?.title === title);
  if (matches.length !== 1) {
    fail("FIXTURE_INVALID", `The official fixture must contain exactly one ${title} submission.`);
  }
  return matches[0];
}

function sourceIdentity(fixture, key) {
  const identity = fixture.identities?.[key];
  if (!isObject(identity))
    fail("FIXTURE_INVALID", `The official fixture is missing the ${key} identity.`);
  return identity;
}

function sourceIdentityInput(supplied, config, fixture, identityKey) {
  const sourceKey = IDENTITY_SOURCE_KEYS[identityKey];
  const source = sourceKey === undefined ? {} : sourceIdentity(fixture, sourceKey);
  const sourceWithoutPassword = { ...source };
  delete sourceWithoutPassword.password;
  const fromConfig = config?.repair?.identities?.[identityKey];
  const fromInput = supplied?.[identityKey];
  if (fromInput !== undefined && (!isObject(fromInput) || Array.isArray(fromInput))) {
    fail("IDENTITY_INVALID", `Identity ${identityKey} must be an object.`);
  }
  return {
    ...sourceWithoutPassword,
    ...(isObject(fromConfig) ? fromConfig : {}),
    ...(fromInput ?? {}),
  };
}

function buildIdentityLedger({ fixture, config, identities, requireUserIds = false }) {
  const supplied = isObject(identities) ? identities : {};
  const rows = [];
  const seenEmails = new Map();
  const seenUserIds = new Map();
  const credentials = {};
  for (const identityKey of IDENTITY_KEYS) {
    const input = sourceIdentityInput(supplied, config, fixture, identityKey);
    const email = normalizeEmail(input.email, `${identityKey} email`);
    if (seenEmails.has(email)) {
      fail(
        "DUPLICATE_IDENTITY",
        `Identity emails must be one-to-one; ${identityKey} collides with ${seenEmails.get(email)}.`,
      );
    }
    seenEmails.set(email, identityKey);
    const userId = optionalText(input.userId);
    if (userId !== undefined) {
      if (seenUserIds.has(userId)) {
        fail(
          "DUPLICATE_IDENTITY",
          `Identity user IDs must be one-to-one; ${identityKey} collides with ${seenUserIds.get(userId)}.`,
        );
      }
      seenUserIds.set(userId, identityKey);
    }
    if (requireUserIds && userId === undefined) {
      fail("IDENTITY_UNRESOLVED", `Identity ${identityKey} has no resolved Better Auth user ID.`);
    }
    const participantId = SPEAKER_PARTICIPANT_IDS[identityKey];
    const speakerProfileId = SPEAKER_PROFILE_IDS[identityKey];
    rows.push({
      identityKey,
      email,
      emailDigest: emailDigest(email),
      userId,
      verified: input.verified === true,
      displayName: optionalText(input.name) ?? optionalText(input.displayName) ?? identityKey,
      ...(participantId === undefined ? {} : { participantId }),
      ...(speakerProfileId === undefined ? {} : { speakerProfileId }),
    });
    if (typeof input.password === "string" && input.password.length > 0) {
      credentials[identityKey] = {
        email,
        password: input.password,
        name: optionalText(input.name) ?? optionalText(input.displayName) ?? identityKey,
      };
    }
  }
  return { rows, credentials };
}

function identityByKey(manifest, identityKey) {
  const row = manifest.identityLedger.find((candidate) => candidate.identityKey === identityKey);
  if (row === undefined) fail("IDENTITY_INVALID", `Unknown repair identity ${identityKey}.`);
  return row;
}

function userIdOrRef(manifest, identityKey) {
  return identityByKey(manifest, identityKey).userId ?? `identity:${identityKey}`;
}

function catalogMaps(fixture, eventId) {
  const tracks = new Map(
    fixture.event.tracks.map((name) => [name, stableId(eventId, "track", name)]),
  );
  const formats = new Map(
    fixture.event.session_formats.map((name) => [name, stableId(eventId, "format", name)]),
  );
  const rooms = new Map(fixture.event.rooms.map((name) => [name, stableId(eventId, "room", name)]));
  for (const [label, map] of [
    ["track", tracks],
    ["format", formats],
    ["room", rooms],
  ]) {
    if ([...map.values()].some((id) => typeof id !== "string" || id.length === 0)) {
      fail("FIXTURE_INVALID", `The official fixture has an invalid ${label} catalog.`);
    }
  }
  return { tracks, formats, rooms };
}

function taskType(title) {
  if (/headshot|slides/iu.test(title)) return "upload";
  return "action";
}
function localIso(value, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
}

function buildReviewPlan(config, reviewerId) {
  const window = config.repair?.reviewWindow ?? REVIEW_WINDOW_DEFAULT;
  const opensAt = dateIso(window.opensAt, "review window opening");
  const closesAt = dateIso(window.closesAt, "review window close");
  if (new Date(opensAt).getTime() >= new Date(closesAt).getTime()) {
    fail("CONFIGURATION_ERROR", "The review window must open before it closes.");
  }
  if (new Date(closesAt).getTime() < new Date(REVIEW_ROUND_DATES.finalClosesAt).getTime()) {
    fail("CONFIGURATION_ERROR", "The review window must close after both review rounds.");
  }
  const rounds = [
    {
      id: REVIEW_ROUND_ID,
      name: "Initial Review",
      sequence: 1,
      opensAt,
      closesAt: REVIEW_ROUND_DATES.initialClosesAt,
      blindReview: true,
      anonymization: "double",
      reviewerPool: { name: "Initial Review pool", reviewerIds: reviewerId ? [reviewerId] : [] },
      rubric: {
        id: `${REVIEW_PLAN_ID}-rubric-initial`,
        name: "Initial Review rubric",
        criteria: [
          {
            id: "originality",
            label: "Originality",
            description: "How distinct and inventive is this proposal?",
            minimum: 1,
            maximum: 5,
            weight: 2,
            required: true,
            inputType: "numeric",
          },
          {
            id: "relevance",
            label: "Relevance",
            description: "How relevant is this proposal to the event audience?",
            minimum: 1,
            maximum: 5,
            weight: 1,
            required: true,
            inputType: "numeric",
          },
          {
            id: "recommendation",
            label: "Recommendation",
            description: "Recommendation for the program committee.",
            minimum: 0,
            maximum: 0,
            weight: 0,
            required: true,
            inputType: "dropdown",
            options: [
              { label: "Accept", value: "accept" },
              { label: "Maybe", value: "maybe" },
              { label: "Reject", value: "reject" },
            ],
          },
          {
            id: "comments",
            label: "Comments",
            description: "Notes for the program committee.",
            minimum: 0,
            maximum: 0,
            weight: 0,
            required: false,
            inputType: "free_text",
          },
        ],
      },
    },
    {
      id: REVIEW_FINAL_ROUND_ID,
      name: "Final Review",
      sequence: 2,
      opensAt: REVIEW_ROUND_DATES.finalOpensAt,
      closesAt: REVIEW_ROUND_DATES.finalClosesAt,
      blindReview: false,
      anonymization: "none",
      reviewerPool: { name: "Final Review pool", reviewerIds: [] },
      rubric: {
        id: `${REVIEW_PLAN_ID}-rubric-final`,
        name: "Final Review rubric",
        criteria: [
          {
            id: "final-recommendation",
            label: "Final recommendation",
            description: "Final recommendation for the program committee.",
            minimum: 0,
            maximum: 0,
            weight: 0,
            required: true,
            inputType: "dropdown",
            options: [
              { label: "Advance", value: "advance" },
              { label: "Hold", value: "hold" },
              { label: "Reject", value: "reject" },
            ],
          },
          {
            id: "program-notes",
            label: "Program notes",
            description: "Final notes for program handoff.",
            minimum: 0,
            maximum: 0,
            weight: 0,
            required: false,
            inputType: "free_text",
          },
        ],
      },
    },
  ];
  return {
    id: REVIEW_PLAN_ID,
    tenantId: CANONICAL_ORGANIZATION_ID,
    organizationId: CANONICAL_ORGANIZATION_ID,
    eventId: CANONICAL_EVENT_ID,
    name: "Initial Review",
    status: "open",
    blindReview: true,
    opensAt,
    closesAt,
    assignmentRule: {
      reviewsPerSubmission: 1,
      maxAssignmentsPerReviewer: 5,
      autoDistribute: false,
    },
    rounds,
    reviewerProjection: { visibleFieldIds: [], visibleFileIds: [] },
    version: 1,
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
  };
}

function proposalKeyTakeaway(config, title) {
  const values = config.repair?.keyTakeaways;
  const value = values?.[slug(title)];
  if (typeof value !== "string" || value.trim().length === 0) {
    fail("FIXTURE_INVALID", `A manifest-owned key takeaway is required for ${title}.`);
  }
  return value.trim();
}

function proposalSpecs({ fixture, config, manifest }) {
  const priya = sourceIdentity(fixture, "speaker");
  const marcus = sourceIdentity(fixture, "speaker2");
  const sources = [
    exactSubmission(fixture, SESSION_TITLES.taming),
    exactSubmission(fixture, SESSION_TITLES.pair),
    exactSubmission(fixture, SESSION_TITLES.docs),
  ];
  const speakerForTitle = new Map([
    [SESSION_TITLES.taming, "speaker-priya"],
    [SESSION_TITLES.pair, "speaker-priya"],
    [SESSION_TITLES.docs, "speaker-marcus"],
  ]);
  return sources.map((source) => {
    const identityKey = speakerForTitle.get(source.title);
    const identity = identityByKey(manifest, identityKey);
    const person = identityKey === "speaker-priya" ? priya : marcus;
    const proposalId = stableId(CANONICAL_EVENT_ID, "submission", source.title);
    const participantId = SPEAKER_PARTICIPANT_IDS[identityKey];
    const profileId = SPEAKER_PROFILE_IDS[identityKey];
    const answers = {
      "field-title": source.title,
      "field-abstract": source.abstract,
      "field-track": source.track,
      "field-format": source.format,
      "field-speaker-bio": person.bio ?? "",
      "field-key-takeaway": proposalKeyTakeaway(config, source.title),
      "field-audience-level": source.audience_level ?? "Intermediate",
      "field-workshop-prerequisites": "",
    };
    return {
      id: proposalId,
      title: source.title,
      abstract: source.abstract,
      format: source.format,
      track: source.track,
      audienceLevel: source.audience_level ?? "Intermediate",
      keyTakeaway: answers["field-key-takeaway"],
      identityKey,
      participantId,
      profileId,
      participant: {
        id: participantId,
        eventId: CANONICAL_EVENT_ID,
        submissionId: proposalId,
        profileId,
        identityKey,
        userId: identity.userId ?? `identity:${identityKey}`,
        firstName: person.name.split(/\s+/u)[0] ?? person.name,
        lastName: person.name.split(/\s+/u).slice(1).join(" "),
        email: identity.email,
        biography: person.bio ?? "",
        role: "primary_speaker",
      },
      answers,
      status: "accepted",
      submittedAt: manifest.cfp.opensAt,
    };
  });
}

function sessionSpecs({ config, proposals, catalogs, manifest }) {
  const trackId = (name) => catalogs.tracks.get(name);
  const formatId = (name) => catalogs.formats.get(name);
  const roomId = (name) => catalogs.rooms.get(name);
  const actorId = userIdOrRef(manifest, "organizer-fixture");
  const metadataTimestamp = "2026-08-09T00:00:00.000Z";
  const proposalByTitle = new Map(proposals.map((proposal) => [proposal.title, proposal]));
  const entries = [
    {
      key: "taming",
      title: SESSION_TITLES.taming,
      identityKeys: ["speaker-priya"],
      track: "Platform & Infra",
      format: "Talk (30 min)",
      room: "Room 2A",
      startsAt: "2027-05-12T17:00:00.000Z",
      endsAt: "2027-05-12T17:30:00.000Z",
      proposal: proposalByTitle.get(SESSION_TITLES.taming),
    },
    {
      key: "pair",
      title: SESSION_TITLES.pair,
      identityKeys: ["speaker-priya"],
      track: "AI Engineering",
      format: "Talk (30 min)",
      room: "Room 2B",
      startsAt: "2027-05-12T21:00:00.000Z",
      endsAt: "2027-05-12T21:30:00.000Z",
      proposal: proposalByTitle.get(SESSION_TITLES.pair),
    },
    {
      key: "docs",
      title: SESSION_TITLES.docs,
      identityKeys: ["speaker-marcus"],
      track: "Developer Experience",
      format: "Lightning Talk (10 min)",
      room: "Room 2B",
      startsAt: "2027-05-13T18:00:00.000Z",
      endsAt: "2027-05-13T18:10:00.000Z",
      proposal: proposalByTitle.get(SESSION_TITLES.docs),
    },
    {
      key: "lightning",
      title: SESSION_TITLES.lightning,
      identityKeys: ["speaker-marcus"],
      track: "AI Engineering",
      format: "Lightning Talk (10 min)",
      room: null,
      startsAt: null,
      endsAt: null,
      proposal: null,
    },
  ];
  return entries.map((entry) => {
    const id =
      entry.proposal === null
        ? stableId(CANONICAL_EVENT_ID, "session", entry.title)
        : `session-${entry.proposal.id}`;
    const trackApplicationId = trackId(entry.track);
    const formatApplicationId = formatId(entry.format);
    const roomApplicationId = entry.room === null ? null : roomId(entry.room);
    if (trackApplicationId === undefined || formatApplicationId === undefined) {
      fail("FIXTURE_INVALID", `Cannot resolve catalog for ${entry.title}.`);
    }
    if (entry.room !== null && roomApplicationId === undefined) {
      fail("FIXTURE_INVALID", `Cannot resolve room for ${entry.title}.`);
    }
    const participantIds = entry.identityKeys.map(
      (identityKey) => SPEAKER_PARTICIPANT_IDS[identityKey],
    );
    return {
      id,
      key: entry.key,
      tenantId: CANONICAL_ORGANIZATION_ID,
      organizationId: CANONICAL_ORGANIZATION_ID,
      eventId: CANONICAL_EVENT_ID,
      title: entry.title,
      description:
        entry.proposal?.abstract ?? "A practical Q&A on running AI agents in production.",
      status: "confirmed",
      contentStatus: "Approved",
      publicationStatus: entry.room === null ? "unpublished" : "published",
      durationMinutes: entry.format.startsWith("Lightning") ? 10 : 30,
      capacityRequired: 1,
      track: entry.track,
      trackId: trackApplicationId,
      trackIds: [trackApplicationId],
      format: entry.format,
      formatId: formatApplicationId,
      room: entry.room,
      roomId: roomApplicationId,
      startsAt: entry.startsAt,
      endsAt: entry.endsAt,
      timeZone: config.timezone,
      tagIds: [],
      resourceIds: [],
      identityKeys: entry.identityKeys,
      participantIds,
      speakerIds: participantIds,
      speakerRoster: participantIds.map((id) => ({ id, role: "speaker" })),
      proposalId: entry.proposal?.id ?? null,
      version: 1,
      createdAt: metadataTimestamp,
      updatedAt: metadataTimestamp,
      createdBy: actorId,
      updatedBy: actorId,
      history: [],
    };
  });
}

function taskSpecs({ config, proposals }) {
  const policy = { ...DEFAULT_TASK_POLICY, ...(config.repair?.taskPolicy ?? {}) };
  const byIdentity = new Map();
  for (const proposal of proposals) {
    const list = byIdentity.get(proposal.identityKey) ?? [];
    list.push(proposal);
    byIdentity.set(proposal.identityKey, list);
  }
  const tasks = [];
  for (const identityKey of ["speaker-priya", "speaker-marcus"]) {
    const profileId = SPEAKER_PROFILE_IDS[identityKey];
    const proposal = byIdentity.get(identityKey)?.[0];
    if (proposal === undefined) {
      fail("INVALID_FIXTURE", `No accepted proposal is available for ${identityKey}.`);
    }
    const participantId = SPEAKER_PARTICIPANT_IDS[identityKey];
    const submissionId = `speaker-submission:${proposal.id}`;
    for (const title of TASK_NAMES) {
      const id = `${CANONICAL_EVENT_ID}:task:${participantId}:${slug(title)}`;
      const dueAt = /slides/iu.test(title) ? policy.slidesDueAt : policy.defaultDueAt;
      const type = taskType(title);
      dateIso(dueAt, `due date for ${title}`);
      tasks.push({
        id,
        eventId: CANONICAL_EVENT_ID,
        submissionId,
        participantId,
        type,
        owner: "speaker",
        title,
        description: title,
        status: "not_started",
        completedAt: null,
        dueAt: text(dueAt, `due date for ${title}`),
        dependencyIds: [],
        reminderOffsetsMinutes: [10_080, 1_440],
        ...(type === "upload"
          ? /headshot/iu.test(title)
            ? {
                acceptedAssetKinds: ["headshot"],
                allowedMimeTypes: ["image/png", "image/jpeg"],
                maxBytes: 10 * 1024 * 1024,
              }
            : {
                acceptedAssetKinds: ["slides"],
                allowedMimeTypes: ["application/pdf"],
                maxBytes: 50 * 1024 * 1024,
              }
          : {}),
        identityKey,
        profileId,
        version: 1,
        updatedAt: config.repair?.publishedAt ?? PUBLISHED_AT_DEFAULT,
      });
    }
  }
  return tasks;
}

function communicationSpecs({ fixture, sessions, manifest, config }) {
  const communication = fixture.communications ?? {};
  const templateId =
    config.repair?.communication?.templateId ?? `${CANONICAL_EVENT_ID}:communication:acceptance`;
  const templateBody =
    communication.acceptance_body ??
    "Hi {speaker_name}, congratulations! Your session '{talk_title}' has been accepted.";
  const templateTimestamp = config.repair?.publishedAt ?? PUBLISHED_AT_DEFAULT;
  const template = {
    id: templateId,
    tenantId: CANONICAL_ORGANIZATION_ID,
    eventId: CANONICAL_EVENT_ID,
    name: "DevFlow Conf 2027 acceptance",
    purpose: "decision",
    version: 1,
    status: "draft",
    sender: "speakers@sessionboard.namuh.co",
    subject: communication.acceptance_subject ?? "Your talk has been accepted to DevFlow Conf 2027",
    html: templateBody,
    text: templateBody,
    variables: ["speaker_name", "talk_title"],
    createdBy: userIdOrRef(manifest, "organizer-fixture"),
    createdAt: templateTimestamp,
    updatedAt: templateTimestamp,
    approvedBy: null,
    approvedAt: null,
  };
  const activities = [];
  for (const session of sessions.filter((candidate) => candidate.proposalId !== null)) {
    const identityKey = session.identityKeys[0];
    const identity = identityByKey(manifest, identityKey);
    const source =
      identityKey === "speaker-priya" ? fixture.identities.speaker : fixture.identities.speaker2;
    const activityId = `${templateId}:${SPEAKER_PROFILE_IDS[identityKey]}:${session.id}`;
    const participantId = SPEAKER_PARTICIPANT_IDS[identityKey];
    activities.push({
      id: activityId,
      templateId,
      sessionId: session.id,
      participantId,
      profileId: SPEAKER_PROFILE_IDS[identityKey],
      identityKey,
      recipientUserId: identity.userId ?? `identity:${identityKey}`,
      recipientEmail: identity.email,
      status: "draft",
      sentAt: null,
      subject: template.subject,
      body: template.text
        .replaceAll("{speaker_name}", source.name)
        .replaceAll("{talk_title}", session.title),
    });
  }
  return { template, activities };
}

function publicProjection({ fixture, config, sessions }) {
  const scheduled = sessions.filter((session) => session.roomId !== null);
  const byParticipant = new Map();
  for (const session of scheduled) {
    for (const participantId of session.speakerIds) {
      const current = byParticipant.get(participantId) ?? [];
      current.push(session);
      byParticipant.set(participantId, current);
    }
  }
  const speakers = ["speaker-priya", "speaker-marcus"].map((identityKey) => {
    const source =
      identityKey === "speaker-priya" ? fixture.identities.speaker : fixture.identities.speaker2;
    const participantId = SPEAKER_PARTICIPANT_IDS[identityKey];
    const profileSessions = byParticipant.get(participantId) ?? [];
    return {
      id: SPEAKER_PROFILE_IDS[identityKey],
      displayName: source.name,
      pronouns: null,
      jobTitle: source.title ?? null,
      organization: source.company ?? null,
      biography: source.bio ?? "",
      photoUrl: null,
      sessionIds: profileSessions.map((session) => session.id),
      sessionTitles: profileSessions.map((session) => session.title),
      trackNames: profileSessions.map((session) => session.track),
    };
  });
  const event = {
    slug: CANONICAL_EVENT_ID,
    name: fixture.event.name,
    timeZone: config.timezone,
    startsOn: "2027-05-12",
    endsOn: "2027-05-14",
    venueName: fixture.event.location,
  };
  return {
    event,
    revision: {
      id: AGENDA_REVISION_ID,
      number: 1,
      publishedAt: config.repair?.publishedAt ?? PUBLISHED_AT_DEFAULT,
    },
    speakers,
  };
}

function agendaState({ config, sessions, fixture, catalogs, manifest }) {
  const scheduled = sessions.filter((session) => session.roomId !== null);
  const entries = scheduled.map((session, index) => ({
    id: `${CANONICAL_EVENT_ID}:entry:${session.id}`,
    eventId: CANONICAL_EVENT_ID,
    sessionId: session.id,
    roomId: session.roomId,
    trackIds: [session.trackId],
    participantIds: session.participantIds,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    startsAtLocal: localIso(session.startsAt, config.timezone),
    endsAtLocal: localIso(session.endsAt, config.timezone),
    timeZone: config.timezone,
    sortOrder: index,
    metadata: {
      title: session.title,
      summary: session.description,
      format: session.format,
      speakerNames: session.identityKeys.map(
        (identityKey) => identityByKey(manifest, identityKey).displayName,
      ),
      roomName: session.room,
      trackNames: [session.track],
    },
  }));
  const publishedAt = config.repair?.publishedAt ?? PUBLISHED_AT_DEFAULT;
  const actorId = userIdOrRef(manifest, "organizer-agenda");
  const event = {
    slug: CANONICAL_EVENT_ID,
    name: fixture.event.name,
    timeZone: config.timezone,
    startsOn: "2027-05-12",
    endsOn: "2027-05-14",
    venueName: fixture.event.location,
  };
  const revision = {
    id: AGENDA_REVISION_ID,
    eventId: CANONICAL_EVENT_ID,
    revisionNumber: 1,
    sourceDraftVersion: 1,
    timeZone: config.timezone,
    entries,
    warningOverrides: [],
    publishedAt,
    publishedBy: actorId,
    rollbackOfRevisionId: null,
    event,
  };
  return {
    id: CANONICAL_EVENT_ID,
    eventId: CANONICAL_EVENT_ID,
    stateVersion: 1,
    timeZone: config.timezone,
    minimumTravelMinutes: 10,
    sessions: sessions.map((session) => ({
      id: session.id,
      title: session.title,
      status: "accepted",
      participantIds: session.participantIds,
      resourceIds: [],
      capacityRequired: 1,
      durationMinutes: session.durationMinutes,
      summary: session.description,
      format: session.format,
      speakerNames: session.identityKeys.map(
        (identityKey) => identityByKey(manifest, identityKey).displayName,
      ),
    })),
    rooms: [...catalogs.rooms.entries()].map(([name, id]) => ({ id, name, capacity: 500 })),
    tracks: [...catalogs.tracks.entries()].map(([name, id]) => ({ id, name })),
    draft: {
      eventId: CANONICAL_EVENT_ID,
      version: 1,
      timeZone: config.timezone,
      entries,
      warningOverrides: [],
      updatedAt: publishedAt,
      updatedBy: actorId,
    },
    revisions: [revision],
    currentPublishedRevisionId: AGENDA_REVISION_ID,
    outbox: [],
    audit: [],
    suggestionRuns: [],
    revisionNumber: 1,
    status: "published",
    entries,
    warningOverrides: [],
    publishedAt,
    event,
  };
}

function airtableOperation({
  table,
  id,
  fields,
  phase,
  dependsOn = [],
  immutable = [],
  input,
  ledgerKind,
  ledgerId = id,
}) {
  if (!isObject(fields) || fields[APPLICATION_ID_FIELD] !== id) {
    fail("MANIFEST_INVALID", `${table}/${id} has an unstable Application ID.`);
  }
  const ownedFields = { ...fields };
  delete ownedFields.Version;
  delete ownedFields["Current Version"];
  const versionField = Object.hasOwn(fields, "Current Version")
    ? "Current Version"
    : Object.hasOwn(fields, "Version")
      ? "Version"
      : undefined;
  const defaultKinds = {
    Submissions: "submission",
    Participants: "participant",
    "Speaker Profiles": "speaker-profile",
    "Review Plans": "review-plan",
    Evaluations: "review-assignment",
    Decisions: "decision",
    Sessions: "session",
    "Speaker Tasks": "task",
    "Email Templates": "email-template",
    "Agenda Versions": "agenda",
    "Agenda Entries": "agenda-entry",
    "Published Speaker Projections": "speaker-projection",
  };
  return {
    key: ledgerKey(
      ledgerKind ?? defaultKinds[table] ?? table.toLowerCase().replaceAll(" ", "-"),
      ledgerId,
    ),
    phase,
    store: "airtable",
    versionField,
    table,
    id,
    applicationId: id,
    fields: clone(fields),
    ownedFields,
    immutable: [APPLICATION_ID_FIELD, ...immutable],
    dependsOn: [...dependsOn],
    inputDigest: digest(input ?? fields),
  };
}

function commandOperation({ kind, id, payload, phase, dependsOn = [], input, ledgerKind = kind }) {
  const immutableByKind = {
    identity: ["emailDigest", "email"],
    membership: ["organizationId", "userId", "role"],
    "speaker-grant": [
      "organizationId",
      "eventId",
      "userId",
      "speakerProfileId",
      "participantId",
      "displayName",
    ],
    "reviewer-pool": ["roundId", "reviewerId", "reviewPlanId", "eventId"],
    "crm-activity": [
      "organizationId",
      "eventId",
      "activityId",
      "templateId",
      "contactId",
      "participantId",
      "profileId",
      "displayName",
    ],
  };
  return {
    key: ledgerKey(ledgerKind, id),
    phase,
    store: "d1",
    kind,
    id,
    payload: clone(payload),
    immutable: immutableByKind[kind] ?? [],
    dependsOn: [...dependsOn],
    inputDigest: digest(input ?? payload),
  };
}

function foundationOperations({ fixture, config }) {
  const records = buildSeedRecords({
    fixture,
    seedConfig: config,
    mode: FULL_CHAIN_MODE,
    now: config.cfp.opensAt,
  });
  return records.map((record) =>
    airtableOperation({
      table: record.table,
      id: record.applicationId,
      fields: record.fields,
      phase: "foundation",
      immutable: ["Organization ID", "Event ID"].filter((field) =>
        Object.hasOwn(record.fields, field),
      ),
      input: record.fields,
    }),
  );
}

function dynamicOperations({
  manifest,
  fixture,
  config,
  proposals,
  sessions,
  tasks,
  communication,
  agenda,
  projection,
}) {
  const operations = [];
  for (const identityKey of IDENTITY_KEYS) {
    const identity = identityByKey(manifest, identityKey);
    operations.push(
      commandOperation({
        kind: "identity",
        id: `${identityKey}:${identity.emailDigest}`,
        phase: "identity",
        payload: {
          type: "repair-identity",
          operation: "ensure",
          identityKey,
          email: identity.email,
          emailDigest: identity.emailDigest,
          userId: identity.userId,
          verified: identity.verified,
          displayName: identity.displayName,
          idempotencyKey: ledgerKey("identity", `${identityKey}:${identity.emailDigest}`),
        },
        input: identity,
      }),
    );
  }
  const membershipInputs = [
    ["organizer-agenda", "owner"],
    ["organizer-fixture", "admin"],
    ["reviewer-sam", "reviewer"],
  ];
  for (const [identityKey, role] of membershipInputs) {
    const identity = identityByKey(manifest, identityKey);
    operations.push(
      commandOperation({
        kind: "membership",
        id: `${CANONICAL_ORGANIZATION_ID}:${identity.userId ?? `identity:${identityKey}`}:${role}`,
        phase: "access",
        dependsOn: [ledgerKey("identity", `${identityKey}:${identity.emailDigest}`)],
        payload: {
          type: "membership",
          operation: "ensure",
          organizationId: CANONICAL_ORGANIZATION_ID,
          eventId: CANONICAL_EVENT_ID,
          identityKey,
          userId: userIdOrRef(manifest, identityKey),
          email: identity.email,
          displayName: identity.displayName,
          role,
          idempotencyKey: ledgerKey(
            "membership",
            `${CANONICAL_ORGANIZATION_ID}:${identity.userId ?? `identity:${identityKey}`}:${role}`,
          ),
        },
      }),
    );
  }
  for (const identityKey of ["speaker-priya", "speaker-marcus"]) {
    const identity = identityByKey(manifest, identityKey);
    const participantId = SPEAKER_PARTICIPANT_IDS[identityKey];
    const profileId = SPEAKER_PROFILE_IDS[identityKey];
    operations.push(
      commandOperation({
        kind: "speaker-grant",
        id: `${CANONICAL_ORGANIZATION_ID}:${CANONICAL_EVENT_ID}:${profileId}:${identity.userId ?? `identity:${identityKey}`}`,
        phase: "access",
        dependsOn: [ledgerKey("identity", `${identityKey}:${identity.emailDigest}`)],
        payload: {
          type: "speaker-grant",
          operation: "ensure",
          organizationId: CANONICAL_ORGANIZATION_ID,
          eventId: CANONICAL_EVENT_ID,
          identityKey,
          participantId,
          userId: userIdOrRef(manifest, identityKey),
          email: identity.email,
          displayName: identity.displayName,
          profile: {
            id: profileId,
            participantId,
            displayName: identity.displayName,
            email: identity.email,
          },
          speakerProfileId: profileId,
          idempotencyKey: ledgerKey(
            "speaker-grant",
            `${CANONICAL_ORGANIZATION_ID}:${CANONICAL_EVENT_ID}:${profileId}:${identity.userId ?? `identity:${identityKey}`}`,
          ),
        },
      }),
    );
  }
  const reviewerId = userIdOrRef(manifest, "reviewer-sam");
  const reviewPlan = buildReviewPlan(
    config,
    reviewerId.startsWith("identity:") ? undefined : reviewerId,
  );
  operations.push(
    airtableOperation({
      table: "Review Plans",
      id: REVIEW_PLAN_ID,
      fields: {
        [APPLICATION_ID_FIELD]: REVIEW_PLAN_ID,
        Name: reviewPlan.name,
        Event: CANONICAL_EVENT_ID,
        Status: reviewPlan.status,
        "Rounds JSON": json(reviewPlan),
        Version: 1,
      },
      phase: "review",
      immutable: ["Event", "Name"],
      input: reviewPlan,
    }),
  );
  const reviewerPoolId = `${REVIEW_ROUND_ID}:${reviewerId}`;
  operations.push(
    commandOperation({
      kind: "reviewer-pool",
      id: reviewerPoolId,
      phase: "review",
      dependsOn: [
        ledgerKey("review-plan", REVIEW_PLAN_ID),
        ledgerKey(
          "identity",
          `reviewer-sam:${identityByKey(manifest, "reviewer-sam").emailDigest}`,
        ),
      ],
      payload: {
        type: "reviewer-pool",
        operation: "ensure",
        roundId: REVIEW_ROUND_ID,
        reviewPlanId: REVIEW_PLAN_ID,
        eventId: CANONICAL_EVENT_ID,
        displayName: identityByKey(manifest, "reviewer-sam").displayName,
        reviewerId,
        idempotencyKey: ledgerKey("reviewer-pool", reviewerPoolId),
      },
      ledgerKind: "reviewer-pool",
      input: { roundId: REVIEW_ROUND_ID, reviewerId },
    }),
  );
  const participantIdsSeen = new Set();
  for (const proposal of proposals) {
    const participant = proposal.participant;
    const submissionRecord = {
      id: proposal.id,
      tenantId: CANONICAL_ORGANIZATION_ID,
      eventId: CANONICAL_EVENT_ID,
      formId: config.cfp.formId,
      ownerAccountId: userIdOrRef(manifest, "submitter"),
      formVersion: 1,
      version: 1,
      status: "submitted",
      completedSteps: ["welcome", "account", "submission", "participant", "review"],
      answers: proposal.answers,
      participants: [
        {
          id: participant.id,
          firstName: participant.firstName,
          lastName: participant.lastName,
          email: participant.email,
          role: "primary",
          biography: participant.biography,
          answers: {},
        },
      ],
      secondaryContacts: [],
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:00:00.000Z",
      submittedAt: proposal.submittedAt,
    };
    if (!participantIdsSeen.has(participant.id)) {
      participantIdsSeen.add(participant.id);
      operations.push(
        airtableOperation({
          table: "Participants",
          id: participant.id,
          fields: {
            [APPLICATION_ID_FIELD]: participant.id,
            Event: CANONICAL_EVENT_ID,
            Submission: proposal.id,
            "Speaker Profile": participant.profileId,
            Role: participant.role,
            "First Name": participant.firstName,
            "Last Name": participant.lastName,
            Email: participant.email,
            "User ID": participant.userId,
            "Created At": "2026-08-09T00:00:00.000Z",
            "Updated At": "2026-08-09T00:00:00.000Z",
          },
          phase: "submissions",
          input: participant,
        }),
      );
    }
    operations.push(
      airtableOperation({
        table: "Submissions",
        id: proposal.id,
        fields: {
          [APPLICATION_ID_FIELD]: proposal.id,
          Event: CANONICAL_EVENT_ID,
          "CFP Form": config.cfp.formId,
          "Submitter Account ID": userIdOrRef(manifest, "submitter"),
          Status: "submitted",
          Title: proposal.title,
          Abstract: proposal.abstract,
          "Answers JSON": json(submissionRecord),
          "Participant IDs JSON": json([participant.id]),
          "Secondary Contact IDs JSON": json([]),
          "Current Version": 1,
          "Submitted At": proposal.submittedAt,
          "Created At": "2026-08-09T00:00:00.000Z",
          "Updated At": "2026-08-09T00:00:00.000Z",
        },
        phase: "submissions",
        immutable: ["Submitter Account ID", "Title"],
        dependsOn: [
          ledgerKey("identity", `submitter:${identityByKey(manifest, "submitter").emailDigest}`),
        ],
        input: proposal,
      }),
    );
    const speakerSubmissionId = `speaker-submission:${proposal.id}`;
    const acceptedAt = config.repair?.publishedAt ?? PUBLISHED_AT_DEFAULT;
    const speakerSubmissionRecord = {
      id: speakerSubmissionId,
      eventId: CANONICAL_EVENT_ID,
      formId: config.cfp.formId,
      title: proposal.title,
      status: "accepted",
      participantIds: [participant.id],
      primaryParticipantId: participant.id,
      version: 1,
      updatedAt: acceptedAt,
      entityType: "speaker_submission",
    };
    operations.push(
      airtableOperation({
        table: "Submissions",
        id: speakerSubmissionId,
        fields: {
          [APPLICATION_ID_FIELD]: speakerSubmissionId,
          Event: CANONICAL_EVENT_ID,
          "CFP Form": config.cfp.formId,
          Status: "accepted",
          Title: proposal.title,
          Abstract: proposal.abstract,
          "Answers JSON": json(speakerSubmissionRecord),
          "Participant IDs JSON": json([participant.id]),
          "Secondary Contact IDs JSON": json([]),
          "Current Version": 1,
          "Submitted At": proposal.submittedAt,
          "Created At": acceptedAt,
          "Updated At": acceptedAt,
        },
        phase: "decisions",
        immutable: ["Title"],
        dependsOn: [ledgerKey("submission", proposal.id)],
        ledgerId: speakerSubmissionId,
        input: speakerSubmissionRecord,
      }),
    );
    const rosterId = `roster:${CANONICAL_EVENT_ID}:${speakerSubmissionId}:${participant.id}`;
    const rosterRecord = {
      id: rosterId,
      tenantId: CANONICAL_ORGANIZATION_ID,
      eventId: CANONICAL_EVENT_ID,
      submissionId: speakerSubmissionId,
      participantId: participant.id,
      displayName: `${participant.firstName} ${participant.lastName}`.trim(),
      email: participant.email,
      role: "primary",
      status: "active",
      version: 1,
      createdAt: acceptedAt,
      updatedAt: acceptedAt,
    };
    operations.push(
      airtableOperation({
        table: "Session Roster",
        id: rosterId,
        fields: {
          [APPLICATION_ID_FIELD]: rosterId,
          "Organization ID": CANONICAL_ORGANIZATION_ID,
          "Event ID": CANONICAL_EVENT_ID,
          Event: CANONICAL_EVENT_ID,
          Submission: speakerSubmissionId,
          Participant: participant.id,
          "Submission ID": speakerSubmissionId,
          "Participant ID": participant.id,
          "Display Name": rosterRecord.displayName,
          Email: participant.email,
          Role: "primary",
          Status: "active",
          "Members JSON": json(rosterRecord),
          Version: 1,
          "Created At": acceptedAt,
          "Updated At": acceptedAt,
        },
        phase: "decisions",
        immutable: ["Submission ID", "Participant ID"],
        dependsOn: [
          ledgerKey("submission", speakerSubmissionId),
          ledgerKey("participant", participant.id),
        ],
        input: rosterRecord,
      }),
    );
    const assignmentId = `${CANONICAL_EVENT_ID}:review-assignment:${REVIEW_ROUND_ID}:${reviewerId}:${proposal.id}`;
    operations.push(
      airtableOperation({
        table: "Evaluations",
        id: assignmentId,
        fields: {
          [APPLICATION_ID_FIELD]: assignmentId,
          Event: CANONICAL_EVENT_ID,
          "Review Plan": REVIEW_PLAN_ID,
          Submission: proposal.id,
          "Round ID": REVIEW_ROUND_ID,
          "Reviewer ID": reviewerId,
          Status: "assigned",
          "Scores JSON": json({
            id: assignmentId,
            tenantId: CANONICAL_ORGANIZATION_ID,
            eventId: CANONICAL_EVENT_ID,
            planId: REVIEW_PLAN_ID,
            roundId: REVIEW_ROUND_ID,
            submissionId: proposal.id,
            reviewerId,
            status: "assigned",
            planVersion: 1,
            rubricRevision: 1,
            submissionRevision: 1,
            version: 1,
            createdAt: config.repair?.reviewWindow?.opensAt ?? REVIEW_WINDOW_DEFAULT.opensAt,
            updatedAt: config.repair?.reviewWindow?.opensAt ?? REVIEW_WINDOW_DEFAULT.opensAt,
          }),
          "Overall Comment": "",
          Version: 1,
          "Assigned At": config.repair?.reviewWindow?.opensAt ?? REVIEW_WINDOW_DEFAULT.opensAt,
        },
        phase: "review",
        immutable: ["Reviewer ID", "Submission", "Round ID"],
        dependsOn: [
          ledgerKey("reviewer-pool", `${REVIEW_ROUND_ID}:${reviewerId}`),
          ledgerKey("submission", proposal.id),
        ],
        ledgerId: `${REVIEW_ROUND_ID}:${reviewerId}:${proposal.id}`,
        input: { proposalId: proposal.id, reviewerId, roundId: REVIEW_ROUND_ID },
      }),
    );
    const decisionId = stableId(CANONICAL_EVENT_ID, "decision", proposal.title);
    const decisionReason =
      "Canonical repair decision from the approved DevFlow production manifest.";
    const decisionAt = config.repair?.publishedAt ?? PUBLISHED_AT_DEFAULT;
    const decisionIdempotencyKey = `decision:${proposal.id}:accept`;
    operations.push(
      airtableOperation({
        table: "Decisions",
        id: decisionId,
        fields: {
          [APPLICATION_ID_FIELD]: decisionId,
          Event: CANONICAL_EVENT_ID,
          Submission: proposal.id,
          Decision: "accepted",
          Reason: decisionReason,
          "Decided By User ID": userIdOrRef(manifest, "organizer-agenda"),
          "Decided At": decisionAt,
          Version: 1,
          "Metadata JSON": json({
            id: decisionId,
            tenantId: CANONICAL_ORGANIZATION_ID,
            eventId: CANONICAL_EVENT_ID,
            planId: REVIEW_PLAN_ID,
            submissionId: proposal.id,
            status: "accepted",
            version: 1,
            history: [
              {
                from: null,
                to: "accepted",
                reason: decisionReason,
                decidedBy: userIdOrRef(manifest, "organizer-agenda"),
                decidedAt: decisionAt,
                idempotencyKey: decisionIdempotencyKey,
              },
            ],
            updatedAt: decisionAt,
          }),
        },
        phase: "decisions",
        immutable: ["Submission", "Decision"],
        dependsOn: [
          ledgerKey("submission", proposal.id),
          ledgerKey(
            "identity",
            `organizer-agenda:${identityByKey(manifest, "organizer-agenda").emailDigest}`,
          ),
        ],
        input: { proposalId: proposal.id, decision: "accept" },
        ledgerId: `${proposal.id}:accept`,
      }),
    );
  }
  for (const identityKey of ["speaker-priya", "speaker-marcus"]) {
    const identity = identityByKey(manifest, identityKey);
    const participantId = SPEAKER_PARTICIPANT_IDS[identityKey];
    const profileId = SPEAKER_PROFILE_IDS[identityKey];
    const source =
      identityKey === "speaker-priya" ? fixture.identities.speaker : fixture.identities.speaker2;
    const profileValue = {
      id: profileId,
      tenantId: CANONICAL_ORGANIZATION_ID,
      organizationId: CANONICAL_ORGANIZATION_ID,
      eventId: CANONICAL_EVENT_ID,
      participantId,
      userId: identity.userId ?? `identity:${identityKey}`,
      email: identity.email,
      displayName: source.name,
      biography: source.bio ?? "",
      company: source.company ?? "",
      jobTitle: source.title ?? "",
      status: "accepted",
      version: 1,
    };
    operations.push(
      airtableOperation({
        table: "Speaker Profiles",
        id: profileId,
        fields: {
          [APPLICATION_ID_FIELD]: profileId,
          Event: CANONICAL_EVENT_ID,
          Participant: participantId,
          Biography: json(profileValue),
          Company: source.company ?? "",
          "Job Title": source.title ?? "",
          Location: "",
          Version: 1,
        },
        phase: "profiles",
        dependsOn: [
          ledgerKey(
            "speaker-grant",
            `${CANONICAL_ORGANIZATION_ID}:${CANONICAL_EVENT_ID}:${profileId}:${identity.userId ?? `identity:${identityKey}`}`,
          ),
        ],
        immutable: ["Event", "Participant"],
        input: profileValue,
      }),
    );
  }
  for (const session of sessions) {
    operations.push(
      airtableOperation({
        table: "Sessions",
        id: session.id,
        fields: {
          [APPLICATION_ID_FIELD]: session.id,
          "Organization ID": session.organizationId,
          "Event ID": session.eventId,
          Event: session.eventId,
          Title: session.title,
          Description: session.description,
          Status: session.status,
          Format: session.format.startsWith("Lightning") ? "other" : "talk",
          "Duration Minutes": session.durationMinutes,
          "Participant IDs JSON": json(session.participantIds),
          "Speaker IDs JSON": json(session.speakerIds),
          "Speaker Roster JSON": json(session.speakerRoster),
          "Track IDs JSON": json(session.trackIds),
          "Tag IDs JSON": json(session.tagIds),
          "Resource IDs JSON": json(session.resourceIds),
          "Format ID": session.formatId,
          Room: session.roomId,
          Track: session.trackId,
          "Starts At": session.startsAt,
          "Ends At": session.endsAt,
          "Time Zone": session.timeZone,
          "Capacity Required": session.capacityRequired,
          "Metadata JSON": json(session),
          "Settings JSON": json({
            publicationStatus: session.publicationStatus,
            contentStatus: session.contentStatus,
            roomId: session.roomId,
            trackId: session.trackId,
            formatId: session.formatId,
          }),
          "Audit JSON": json({
            action: "created",
            actorId: session.createdBy,
            occurredAt: session.createdAt,
            source: "production-repair",
          }),
          "Provenance JSON": json({
            source: "production-repair",
            organizationId: session.organizationId,
            eventId: session.eventId,
            actorId: session.createdBy,
          }),
          "Created By User ID": session.createdBy,
          "Updated By User ID": session.updatedBy,
          "Created At": session.createdAt,
          "Updated At": session.updatedAt,
          "History JSON": json(session.history),
          Version: session.version,
        },
        phase: "sessions",
        dependsOn:
          session.proposalId === null
            ? []
            : [ledgerKey("decision", `${session.proposalId}:accept`)],
        immutable: ["Organization ID", "Event ID", "Title", "Status"],
        input: session,
      }),
    );
  }
  for (const task of tasks) {
    operations.push(
      airtableOperation({
        table: "Speaker Tasks",
        id: task.id,
        fields: {
          [APPLICATION_ID_FIELD]: task.id,
          Event: CANONICAL_EVENT_ID,
          Participant: task.participantId,
          Title: task.title,
          Description: task.description,
          Type: task.type,
          Status: task.status,
          "Owner JSON": json({ ...task, completedAt: null }),
          "Due At": task.dueAt,
          "Dependency IDs JSON": json([]),
          "Reminders JSON": json([]),
          "Completion Payload JSON": json(null),
          Version: 1,
          "Created At": "2026-08-09T00:00:00.000Z",
          "Updated At": "2026-08-09T00:00:00.000Z",
        },
        phase: "speaker-content",
        dependsOn: [ledgerKey("speaker-profile", task.profileId)],
        immutable: ["Participant", "Title", "Due At"],
        input: task,
      }),
    );
  }
  operations.push(
    airtableOperation({
      table: "Email Templates",
      id: communication.template.id,
      fields: {
        [APPLICATION_ID_FIELD]: communication.template.id,
        "Organization ID": communication.template.tenantId,
        "Event ID": communication.template.eventId,
        Name: communication.template.name,
        Purpose: communication.template.purpose,
        Status: communication.template.status,
        Sender: communication.template.sender,
        Subject: communication.template.subject,
        HTML: communication.template.html,
        Text: communication.template.text,
        "Variables JSON": json(communication.template.variables),
        "Settings JSON": json(communication.template),
        Version: communication.template.version,
      },
      phase: "crm",
      immutable: ["Organization ID", "Event ID", "Purpose", "Subject"],
      input: communication.template,
    }),
  );
  for (const activity of communication.activities) {
    operations.push(
      commandOperation({
        kind: "crm-activity",
        id: activity.id,
        phase: "crm",
        dependsOn: [
          ledgerKey("email-template", communication.template.id),
          ledgerKey("session", activity.sessionId),
        ],
        ledgerKind: "crm",
        payload: {
          type: "crm-activity",
          operation: "ensure",
          organizationId: CANONICAL_ORGANIZATION_ID,
          identityKey: activity.identityKey,
          profileId: activity.profileId,
          participantId: activity.participantId,
          sessionId: activity.sessionId,
          contactId: `crm-contact:${activity.profileId}`,
          historyId: `${activity.id}:history`,
          displayName: identityByKey(manifest, activity.identityKey).displayName,
          contact: {
            id: `crm-contact:${activity.profileId}`,
            participantId: activity.participantId,
            profileId: activity.profileId,
            displayName: identityByKey(manifest, activity.identityKey).displayName,
            email: activity.recipientEmail,
          },
          eventId: CANONICAL_EVENT_ID,
          idempotencyKey: ledgerKey("crm", activity.id),
          activityId: activity.id,
          templateId: activity.templateId,
          contactUserId: activity.recipientUserId,
          recipientEmail: activity.recipientEmail,
          subject: activity.subject,
          body: activity.body,
          status: "draft",
          sentAt: null,
        },
        input: activity,
      }),
    );
  }
  const agendaVersionFields = {
    [APPLICATION_ID_FIELD]: CANONICAL_EVENT_ID,
    "Agenda ID": CANONICAL_EVENT_ID,
    Event: CANONICAL_EVENT_ID,
    Number: 1,
    Status: "published",
    "Conflicts JSON": json(agenda),
    "Published At": agenda.publishedAt,
  };
  operations.push(
    airtableOperation({
      table: "Agenda Versions",
      id: CANONICAL_EVENT_ID,
      fields: agendaVersionFields,
      phase: "publication",
      dependsOn: sessions
        .filter((session) => session.roomId !== null)
        .map((session) => ledgerKey("session", session.id)),
      input: agenda,
      ledgerId: AGENDA_REVISION_ID,
    }),
  );
  for (const entry of agenda.entries) {
    const storedEntryId = `${CANONICAL_EVENT_ID}:${entry.id}`;
    const storedEntry = { id: storedEntryId, eventId: CANONICAL_EVENT_ID, entry };
    operations.push(
      airtableOperation({
        table: "Agenda Entries",
        id: storedEntryId,
        fields: {
          [APPLICATION_ID_FIELD]: storedEntryId,
          "Agenda Version": CANONICAL_EVENT_ID,
          Session: entry.sessionId,
          Room: entry.roomId,
          Track: entry.trackIds[0],
          "Participant IDs JSON": json(entry.participantIds),
          "Starts At": entry.startsAt,
          "Ends At": entry.endsAt,
          "Time Zone": entry.timeZone,
          "Sort Order": entry.sortOrder,
          "Metadata JSON": json(storedEntry),
        },
        phase: "publication",
        dependsOn: [ledgerKey("agenda", AGENDA_REVISION_ID), ledgerKey("session", entry.sessionId)],
        immutable: ["Agenda Version", "Session", "Starts At", "Ends At"],
        input: storedEntry,
      }),
    );
  }
  operations.push(
    airtableOperation({
      table: "Published Speaker Projections",
      id: PUBLISHED_SPEAKERS_ID,
      fields: {
        [APPLICATION_ID_FIELD]: PUBLISHED_SPEAKERS_ID,
        "Organization ID": CANONICAL_ORGANIZATION_ID,
        "Event Slug": CANONICAL_EVENT_ID,
        "Revision ID": AGENDA_REVISION_ID,
        "Revision Number": 1,
        "Published At": projection.revision.publishedAt,
        "Projection JSON": json(projection),
      },
      phase: "publication",
      dependsOn: sessions
        .filter((session) => session.roomId !== null)
        .map((session) => ledgerKey("session", session.id)),
      immutable: ["Organization ID", "Event Slug", "Revision ID", "Revision Number"],
      input: projection,
    }),
  );
  return operations;
}

const REQUIRED_SESSION_METADATA_FIELDS = Object.freeze([
  "id",
  "tenantId",
  "organizationId",
  "eventId",
  "title",
  "description",
  "status",
  "durationMinutes",
  "capacityRequired",
  "trackId",
  "trackIds",
  "formatId",
  "tagIds",
  "speakerIds",
  "resourceIds",
  "timeZone",
  "version",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
  "history",
]);

function assertSessionMetadata(value, label) {
  if (!isObject(value)) fail("MANIFEST_INVALID", `${label} metadata must be an object.`);
  for (const field of REQUIRED_SESSION_METADATA_FIELDS) {
    const fieldValue = value[field];
    if (
      fieldValue === undefined ||
      fieldValue === null ||
      (typeof fieldValue === "string" && fieldValue.trim().length === 0)
    ) {
      fail("MANIFEST_INVALID", `${label} metadata is missing ${field}.`);
    }
  }
  for (const field of ["trackIds", "tagIds", "speakerIds", "resourceIds", "history"]) {
    if (!Array.isArray(value[field])) {
      fail("MANIFEST_INVALID", `${label} metadata field ${field} must be an array.`);
    }
  }
  if (!Number.isSafeInteger(value.version) || value.version < 1) {
    fail("MANIFEST_INVALID", `${label} metadata version must be a positive integer.`);
  }
  if (
    value.tenantId !== CANONICAL_ORGANIZATION_ID ||
    value.organizationId !== CANONICAL_ORGANIZATION_ID
  ) {
    fail("MANIFEST_INVALID", `${label} metadata has a non-canonical organization scope.`);
  }
  if (value.eventId !== CANONICAL_EVENT_ID) {
    fail("MANIFEST_INVALID", `${label} metadata has a non-canonical event scope.`);
  }
  return value;
}

function parseSessionMetadata(operation) {
  const raw = operation.fields?.["Metadata JSON"];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    fail("MANIFEST_INVALID", `Session operation ${operation.key} has no Metadata JSON.`);
  }
  try {
    return assertSessionMetadata(JSON.parse(raw), `Session operation ${operation.key}`);
  } catch (error) {
    if (error instanceof DevflowRepairError) throw error;
    fail("MANIFEST_INVALID", `Session operation ${operation.key} has invalid Metadata JSON.`);
  }
}

function ensureManifestShape(manifest) {
  if (!isObject(manifest) || manifest.version !== REPAIR_VERSION) {
    fail("MANIFEST_INVALID", "The repair manifest version is unsupported.");
  }
  if (
    manifest.organizationId !== CANONICAL_ORGANIZATION_ID ||
    manifest.eventId !== CANONICAL_EVENT_ID
  ) {
    fail("SCOPE_MISMATCH", "The repair manifest scope is immutable.");
  }
  if (manifest.resetWorkflow !== undefined) {
    if (
      !isObject(manifest.resetWorkflow) ||
      manifest.resetWorkflow.version !== RESET_WORKFLOW_VERSION ||
      manifest.resetWorkflow.organizationId !== CANONICAL_ORGANIZATION_ID ||
      manifest.resetWorkflow.eventId !== CANONICAL_EVENT_ID ||
      !Array.isArray(manifest.resetWorkflow.deletions) ||
      !Array.isArray(manifest.resetWorkflow.foundation)
    ) {
      fail("MANIFEST_INVALID", "The workflow reset plan is invalid.");
    }
  }
  const resetOnly = manifest.resetOnly === true;
  if (
    !Array.isArray(manifest.identityLedger) ||
    (!resetOnly && manifest.identityLedger.length !== IDENTITY_KEYS.length) ||
    (resetOnly && manifest.identityLedger.length !== 0)
  ) {
    fail(
      "MANIFEST_INVALID",
      resetOnly
        ? "A reset manifest must not contain identity ledger rows."
        : "The repair manifest must contain exactly six identity ledger rows.",
    );
  }
  const keys = new Set();
  const emails = new Set();
  const users = new Set();
  for (const row of manifest.identityLedger) {
    if (!IDENTITY_KEYS.includes(row.identityKey) || keys.has(row.identityKey)) {
      fail(
        "IDENTITY_DRIFT",
        "The repair identity ledger contains duplicate or unknown identities.",
      );
    }
    keys.add(row.identityKey);
    const expectedParticipantId = SPEAKER_PARTICIPANT_IDS[row.identityKey];
    const expectedProfileId = SPEAKER_PROFILE_IDS[row.identityKey];
    if (expectedParticipantId === undefined) {
      if (row.participantId !== undefined || row.speakerProfileId !== undefined) {
        fail("IDENTITY_DRIFT", `Identity ${row.identityKey} has an unexpected speaker binding.`);
      }
    } else if (
      row.participantId !== expectedParticipantId ||
      row.speakerProfileId !== expectedProfileId
    ) {
      fail("IDENTITY_DRIFT", `Identity ${row.identityKey} has a non-canonical speaker binding.`);
    }
    if (typeof row.emailDigest !== "string" || row.emailDigest.length !== 64) {
      fail("IDENTITY_INVALID", `Identity ${row.identityKey} has no email digest.`);
    }
    if (emails.has(row.emailDigest))
      fail("DUPLICATE_IDENTITY", "Identity email digests must be one-to-one.");
    emails.add(row.emailDigest);
    if (row.userId !== undefined) {
      if (typeof row.userId !== "string" || row.userId.length === 0 || users.has(row.userId)) {
        fail("IDENTITY_DRIFT", "Identity user IDs must be one-to-one.");
      }
      users.add(row.userId);
    }
  }
  if (!Array.isArray(manifest.operations))
    fail("MANIFEST_INVALID", "Repair operations are required.");
  const operationKeys = new Set();
  for (const operation of manifest.operations) {
    if (!isObject(operation) || typeof operation.key !== "string")
      fail("MANIFEST_INVALID", "A repair operation has no ledger key.");
    if (operationKeys.has(operation.key))
      fail("DUPLICATE_LEDGER_KEY", `Duplicate repair ledger key ${operation.key}.`);
    operationKeys.add(operation.key);
  }
  const graph = manifest.graph;
  if (graph !== null && graph !== undefined) {
    if (!isObject(graph) || !Array.isArray(graph.sessions)) {
      fail("MANIFEST_INVALID", "The repair graph sessions are required.");
    }
    for (const session of graph.sessions) {
      if (!isObject(session)) fail("MANIFEST_INVALID", "A repair graph session must be an object.");
      assertSessionMetadata(session, `Graph session ${session.id ?? "<unknown>"}`);
      if (Object.hasOwn(session, "speakerProfileIds")) {
        fail("MANIFEST_INVALID", "The repair graph cannot contain speakerProfileIds.");
      }
      if (
        !Array.isArray(session.speakerIds) ||
        session.speakerIds.some((id) => !Object.values(SPEAKER_PARTICIPANT_IDS).includes(id))
      ) {
        fail("IDENTITY_DRIFT", "The repair graph session speaker IDs are not participant IDs.");
      }
      if (
        !Array.isArray(session.speakerRoster) ||
        session.speakerRoster.some(
          (reference) => !Object.values(SPEAKER_PARTICIPANT_IDS).includes(reference?.id),
        )
      ) {
        fail("IDENTITY_DRIFT", "The repair graph speaker roster is not participant-scoped.");
      }
    }
  }
  const participantIds = new Set(Object.values(SPEAKER_PARTICIPANT_IDS));
  const profileIds = new Set(Object.values(SPEAKER_PROFILE_IDS));
  if (isObject(graph)) {
    if (
      Array.isArray(graph.proposals) &&
      graph.proposals.some(
        (proposal) =>
          !participantIds.has(proposal.participantId) ||
          !profileIds.has(proposal.profileId) ||
          proposal.profileId !== SPEAKER_PROFILE_IDS[proposal.identityKey],
      )
    ) {
      fail("IDENTITY_DRIFT", "The repair graph proposal speaker binding is not canonical.");
    }
    if (
      Array.isArray(graph.tasks) &&
      graph.tasks.some(
        (task) =>
          !participantIds.has(task.participantId) ||
          !profileIds.has(task.profileId) ||
          task.profileId !== SPEAKER_PROFILE_IDS[task.identityKey],
      )
    ) {
      fail("IDENTITY_DRIFT", "The repair graph task speaker binding is not canonical.");
    }
    if (
      Array.isArray(graph.communication?.activities) &&
      graph.communication.activities.some(
        (activity) =>
          !participantIds.has(activity.participantId) ||
          !profileIds.has(activity.profileId) ||
          activity.profileId !== SPEAKER_PROFILE_IDS[activity.identityKey],
      )
    ) {
      fail("IDENTITY_DRIFT", "The repair graph communication speaker binding is not canonical.");
    }
    if (
      Array.isArray(graph.projection?.speakers) &&
      graph.projection.speakers.some((speaker) => !profileIds.has(speaker.id))
    ) {
      fail("IDENTITY_DRIFT", "The public speaker projection IDs are not canonical.");
    }
    const currentRevisionId = graph.agenda?.currentPublishedRevisionId;
    const agendaRevision = Array.isArray(graph.agenda?.revisions)
      ? graph.agenda.revisions.find((revision) => revision?.id === currentRevisionId)
      : undefined;
    const projectionRevision = graph.projection?.revision;
    const projectionOperation = manifest.operations.find(
      (operation) => operation.table === "Published Speaker Projections",
    );
    if (
      currentRevisionId !== AGENDA_REVISION_ID ||
      !isObject(agendaRevision) ||
      !isObject(projectionRevision) ||
      projectionRevision.id !== agendaRevision.id ||
      projectionRevision.number !== agendaRevision.revisionNumber ||
      projectionRevision.publishedAt !== agendaRevision.publishedAt ||
      !isObject(projectionOperation) ||
      projectionOperation.fields?.["Revision ID"] !== agendaRevision.id ||
      projectionOperation.fields?.["Revision Number"] !== agendaRevision.revisionNumber ||
      projectionOperation.fields?.["Published At"] !== agendaRevision.publishedAt
    ) {
      fail(
        "MANIFEST_INVALID",
        "The canonical agenda and speaker projection revision references do not resolve.",
      );
    }
  }
  for (const operation of manifest.operations) {
    if (operation.table === "Sessions") {
      const metadata = parseSessionMetadata(operation);
      if (
        metadata.id !== operation.id ||
        operation.fields?.["Organization ID"] !== metadata.organizationId ||
        operation.fields?.["Event ID"] !== metadata.eventId ||
        operation.fields?.Version !== metadata.version ||
        operation.fields?.["Created By User ID"] !== metadata.createdBy ||
        operation.fields?.["Updated By User ID"] !== metadata.updatedBy ||
        operation.fields?.["Created At"] !== metadata.createdAt ||
        operation.fields?.["Updated At"] !== metadata.updatedAt ||
        operation.fields?.["History JSON"] !== json(metadata.history)
      ) {
        fail(
          "MANIFEST_INVALID",
          `Session operation ${operation.key} metadata fields are inconsistent.`,
        );
      }
    }
    if (operation.table === "Speaker Profiles" && !profileIds.has(operation.id)) {
      fail("IDENTITY_DRIFT", "A speaker profile operation has a non-canonical ID.");
    }
    if (
      operation.table === "Participants" &&
      operation.fields?.["Speaker Profile"] !== undefined &&
      !profileIds.has(operation.fields["Speaker Profile"])
    ) {
      fail("IDENTITY_DRIFT", "A participant operation has a non-canonical profile reference.");
    }
    if (
      operation.table === "Speaker Tasks" &&
      operation.fields?.Participant !== undefined &&
      !participantIds.has(operation.fields.Participant)
    ) {
      fail("IDENTITY_DRIFT", "A speaker task operation has a non-canonical participant.");
    }
    if (
      operation.kind === "speaker-grant" &&
      !profileIds.has(operation.payload?.speakerProfileId)
    ) {
      fail("IDENTITY_DRIFT", "A speaker grant operation has a non-canonical profile ID.");
    }
    if (
      operation.kind === "crm-activity" &&
      (!profileIds.has(operation.payload?.profileId) ||
        !participantIds.has(operation.payload?.participantId))
    ) {
      fail("IDENTITY_DRIFT", "A CRM operation has a non-canonical speaker binding.");
    }
  }
  const canonicalPayload = {
    identityLedger: manifest.identityLedger,
    graph: manifest.graph,
    operations: manifest.operations,
  };
  if (JSON.stringify(canonicalPayload).includes(`${CANONICAL_EVENT_ID}-speaker-`)) {
    fail("MANIFEST_INVALID", "The repair manifest contains a legacy speaker profile ID.");
  }
  return manifest;
}
function computeManifestDigest(manifest) {
  return digest({
    version: manifest.version,
    organizationId: manifest.organizationId,
    eventId: manifest.eventId,
    cfp: manifest.cfp,
    reviewWindow: manifest.reviewWindow,
    identityLedger: manifest.identityLedger,
    graph: manifest.graph,
    operations: manifest.operations.map((operation) => ({
      key: operation.key,
      inputDigest: operation.inputDigest,
    })),
  });
}

export function buildRepairManifest(options = {}) {
  const config = options.seedConfig ?? loadSeedConfig(options.seedConfigPath);
  const fixture = options.fixture ?? loadFixture(options.sourcePath ?? config.source);
  ensureScope(config);
  if (
    Array.isArray(config.repair?.identityKeys) &&
    JSON.stringify(config.repair.identityKeys) !== JSON.stringify(IDENTITY_KEYS)
  ) {
    fail("CONFIGURATION_ERROR", "The project repair fixture identity keys are not canonical.");
  }
  if (
    config.repair?.manifestVersion !== undefined &&
    config.repair.manifestVersion !== REPAIR_VERSION
  ) {
    fail("CONFIGURATION_ERROR", "The project repair fixture has an unsupported manifest version.");
  }
  const identity = buildIdentityLedger({
    fixture,
    config,
    identities: options.identities ?? options.identityInputs ?? options.credentials,
  });
  const manifest = {
    version: REPAIR_VERSION,
    organizationId: CANONICAL_ORGANIZATION_ID,
    eventId: CANONICAL_EVENT_ID,
    timezone: config.timezone,
    createdAt: options.createdAt ?? "2026-08-09T12:00:00.000Z",
    cfp: {
      formId: config.cfp.formId,
      opensAt: dateIso(options.opensAt ?? config.cfp.opensAt, "CFP opening time"),
      closesAt: dateIso(config.cfp.closeAt, "CFP close time"),
      closeDate: config.cfp.closeDate,
      keyTakeawayFieldId: config.cfp.keyTakeawayFieldId,
    },
    reviewWindow: {
      opensAt: dateIso(
        options.reviewWindow?.opensAt ??
          config.repair?.reviewWindow?.opensAt ??
          REVIEW_WINDOW_DEFAULT.opensAt,
        "review window opening",
      ),
      closesAt: dateIso(
        options.reviewWindow?.closesAt ??
          config.repair?.reviewWindow?.closesAt ??
          REVIEW_WINDOW_DEFAULT.closesAt,
        "review window close",
      ),
    },
    identityLedger: identity.rows,
    graph: null,
    operations: [],
    runLedger: {},
    source: { sourcePath: config.source ?? null, fixtureImmutable: true },
  };
  const planningConfig = {
    ...config,
    repair: { ...(config.repair ?? {}), reviewWindow: manifest.reviewWindow },
  };
  const catalogs = catalogMaps(fixture, CANONICAL_EVENT_ID);
  const proposals = proposalSpecs({ fixture, config, manifest });
  const sessions = sessionSpecs({ config, proposals, catalogs, manifest });
  const tasks = taskSpecs({ config, proposals });
  const communication = communicationSpecs({ fixture, sessions, manifest, config });
  const agenda = agendaState({ config, sessions, fixture, catalogs, manifest });
  const projection = publicProjection({ fixture, config, sessions });
  const foundationConfig = {
    ...config,
    cfp: { ...config.cfp, opensAt: manifest.cfp.opensAt },
  };
  const foundation = foundationOperations({ fixture, config: foundationConfig });
  const dynamic = dynamicOperations({
    manifest,
    fixture,
    config: planningConfig,
    proposals,
    sessions,
    tasks,
    communication,
    agenda,
    projection,
  });
  manifest.graph = {
    catalogs: {
      tracks: Object.fromEntries(catalogs.tracks),
      formats: Object.fromEntries(catalogs.formats),
      rooms: Object.fromEntries(catalogs.rooms),
    },
    proposals,
    sessions,
    tasks,
    communication,
    agenda,
    projection,
    reviewPlan: buildReviewPlan(planningConfig, userIdOrRef(manifest, "reviewer-sam")),
  };
  manifest.operations = [...foundation, ...dynamic];
  manifest.digest = computeManifestDigest(manifest);
  ensureManifestShape(manifest);
  Object.defineProperty(manifest, "credentials", {
    value: identity.credentials,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(manifest, "manifest", {
    value: manifest,
    enumerable: false,
    configurable: true,
  });
  return manifest;
}

function safeManifestForWrite(manifest) {
  const sanitized = clone(manifest);
  delete sanitized.credentials;
  for (const row of sanitized.identityLedger ?? []) delete row.password;
  return sanitized;
}

export function writeRepairManifest(manifestPath, manifest) {
  const targetPath = isAbsolute(manifestPath) ? manifestPath : resolve(manifestPath);
  try {
    mkdirSync(dirname(targetPath), { recursive: true, mode: 0o700 });
    writeFileSync(targetPath, `${JSON.stringify(safeManifestForWrite(manifest), null, 2)}\n`, {
      mode: 0o600,
    });
    chmodSync(targetPath, 0o600);
  } catch {
    fail("MANIFEST_WRITE_FAILED", "The repair manifest could not be written.");
  }
  return targetPath;
}

export function readRepairManifest(manifestPath) {
  let value;
  try {
    value = JSON.parse(
      readFileSync(isAbsolute(manifestPath) ? manifestPath : resolve(manifestPath), "utf8"),
    );
  } catch {
    fail("MANIFEST_READ_FAILED", "The repair manifest could not be read.");
  }
  ensureManifestShape(value);
  return value;
}

function recordFields(record) {
  if (!isObject(record)) return {};
  return isObject(record.fields) ? record.fields : record;
}

function recordValue(record, ...names) {
  const fields = recordFields(record);
  for (const name of names) {
    if (fields[name] !== undefined) return fields[name];
    if (isObject(record) && record[name] !== undefined) return record[name];
  }
  return undefined;
}

function existingVersion(record) {
  const value = recordValue(record, "Version", "Current Version", "version", "currentVersion");
  const number = Number(value);
  return Number.isFinite(number) ? number : 1;
}

function existingIdentityEmail(record) {
  return optionalText(recordValue(record, "Email", "email"))?.toLowerCase();
}

function isBlankCellValue(value) {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

function isSameIsoInstant(expected, actual) {
  if (
    typeof expected !== "string" ||
    typeof actual !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(expected) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(actual)
  ) {
    return false;
  }
  return Date.parse(expected) === Date.parse(actual);
}

function repairFieldValuesMatch(expected, actual) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) return true;
  if (isSameIsoInstant(expected, actual)) return true;
  return isBlankCellValue(expected) && isBlankCellValue(actual);
}

function existingMatchesOwned(operation, record) {
  const fields = recordFields(record);
  for (const [name, expected] of Object.entries(operation.ownedFields ?? {})) {
    if (name === "Application ID") continue;
    const actual = Object.hasOwn(fields, name) ? fields[name] : record[name];
    if (!repairFieldValuesMatch(expected, actual)) return false;
  }
  return true;
}

function scopeDrift(_operation, record) {
  const organizationId = recordValue(record, "Organization ID", "organizationId", "tenantId");
  const eventId = recordValue(record, "Event ID", "eventId");
  if (organizationId !== undefined && organizationId !== CANONICAL_ORGANIZATION_ID)
    return "organization";
  if (eventId !== undefined && eventId !== CANONICAL_EVENT_ID) return "event";
  const fields = recordFields(record);
  for (const value of Object.values(fields)) {
    if (typeof value !== "string" || !value.trim().startsWith("{")) continue;
    try {
      const parsed = JSON.parse(value);
      if (
        parsed?.organizationId !== undefined &&
        parsed.organizationId !== CANONICAL_ORGANIZATION_ID
      )
        return "organization";
      if (parsed?.tenantId !== undefined && parsed.tenantId !== CANONICAL_ORGANIZATION_ID)
        return "organization";
      if (parsed?.eventId !== undefined && parsed.eventId !== CANONICAL_EVENT_ID) return "event";
    } catch {
      // Non-JSON text fields are not scope metadata.
    }
  }
  return undefined;
}

function immutableDrift(operation, record) {
  for (const name of operation.immutable ?? []) {
    const expected = Object.hasOwn(operation.payload ?? {}, name)
      ? operation.payload[name]
      : operation.fields?.[name];
    if (
      expected === undefined ||
      (typeof expected === "string" && expected.startsWith("identity:"))
    )
      continue;
    const actual = recordValue(record, name) ?? record?.payload?.[name] ?? record?.command?.[name];
    if (actual !== undefined && !repairFieldValuesMatch(expected, actual)) return name;
  }
  return undefined;
}

function normalizeReadResult(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  if (isObject(value) && Array.isArray(value.records)) return value.records;
  if (isObject(value) && value.record !== undefined) return normalizeReadResult(value.record);
  return [value];
}

async function readOperation(transport, operation) {
  if (transport === undefined || transport === null) return [];
  if (typeof transport.snapshot === "function") {
    const snapshot = await transport.snapshot(operation);
    if (snapshot !== undefined) return normalizeReadResult(snapshot);
  }
  const method = ["lookup", "list", "read", "get", "find"].find(
    (name) => typeof transport[name] === "function",
  );
  if (method === undefined) return [];
  try {
    return normalizeReadResult(await transport[method](operation));
  } catch (error) {
    if (isObject(error) && typeof error.code === "string")
      fail(
        error.code,
        typeof error.message === "string"
          ? error.message
          : `Repair preflight could not read ${operation.key}.`,
      );
    fail("TRANSPORT_READ_FAILED", `Repair preflight could not read ${operation.key}.`);
  }
}
function resetScopeValue(value, expected) {
  if (typeof value === "string") return value === expected;
  if (Array.isArray(value)) return value.length === 1 && value[0] === expected;
  return false;
}

function resetScopeName(name) {
  return String(name)
    .toLowerCase()
    .replaceAll(/[\s_-]+/gu, "");
}

function resetWorkflowScope(record) {
  const result = {
    organizationId: false,
    eventId: false,
    foreignOrganization: false,
    foreignEvent: false,
  };
  const visited = new Set();
  const inspect = (value, depth = 0) => {
    if (value === null || value === undefined || depth > 8) return;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (
        (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]"))
      ) {
        try {
          inspect(JSON.parse(trimmed), depth + 1);
        } catch {
          // Non-JSON text is not scope metadata.
        }
      }
      return;
    }
    if (typeof value !== "object") return;
    if (visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      for (const entry of value) inspect(entry, depth + 1);
      return;
    }
    for (const [name, child] of Object.entries(value)) {
      const normalized = resetScopeName(name);
      const strongOrganization = normalized === "organizationid" || normalized === "tenantid";
      const bareOrganization = normalized === "organization" && depth <= 1;
      const strongEvent = normalized === "eventid" || normalized === "eventslug";
      const bareEvent = normalized === "event" && depth <= 1;
      const primitiveScopeValue =
        typeof child === "string" ||
        (Array.isArray(child) &&
          child.length > 0 &&
          child.every((entry) => typeof entry === "string"));
      if (strongOrganization || bareOrganization) {
        if (resetScopeValue(child, CANONICAL_ORGANIZATION_ID)) {
          result.organizationId = true;
        } else if (primitiveScopeValue && (strongOrganization || typeof child === "string")) {
          result.foreignOrganization = true;
        }
      } else if (strongEvent || bareEvent) {
        if (resetScopeValue(child, CANONICAL_EVENT_ID)) {
          result.eventId = true;
        } else if (primitiveScopeValue && (strongEvent || typeof child === "string")) {
          result.foreignEvent = true;
        }
      }
      inspect(child, depth + 1);
    }
  };
  inspect(record);
  return result;
}
function resetTenantCanBeDerivedFromEvent(table) {
  return new Set([
    "Participants",
    "Speaker Profiles",
    "Review Plans",
    "Evaluations",
    "Decisions",
    "Speaker Tasks",
    "Submissions",
    "Agenda Versions",
    "Agenda Entries",
  ]).has(table);
}

function resetProtectedTable(table) {
  if (typeof table !== "string" || table.trim().length === 0) return true;
  if (RESET_PROTECTED_TABLES.some((candidate) => candidate.toLowerCase() === table.toLowerCase())) {
    return true;
  }
  const normalized = table.toLowerCase().replaceAll(/[\s_-]+/gu, "");
  return (
    normalized.includes("identity") ||
    normalized.includes("membership") ||
    normalized === "members" ||
    normalized.includes("organization") ||
    normalized.includes("credential") ||
    normalized === "users" ||
    normalized === "accounts" ||
    normalized === "authusers" ||
    normalized === "authaccounts"
  );
}

function normalizeResetDiscovery(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  if (isObject(value) && Array.isArray(value.records)) return value.records;
  if (isObject(value) && Array.isArray(value.airtableRecords)) {
    return [...value.airtableRecords, ...(Array.isArray(value.d1Records) ? value.d1Records : [])];
  }
  if (isObject(value)) {
    const nested = Object.values(value).filter(Array.isArray).flat();
    if (nested.length > 0) return nested;
  }
  return [value];
}

function resetTargetFromRecord(candidate, fallback = {}) {
  const raw = isObject(candidate?.record) ? { ...candidate.record, ...candidate } : candidate;
  const table = raw?.table ?? fallback.table;
  const store = raw?.store ?? fallback.store ?? "airtable";
  if (resetProtectedTable(table)) return undefined;
  const fields = recordFields(raw);
  const normalizedTable = String(table).toLowerCase();
  if (
    ["crm contacts", "crm pipeline", "crm notes"].includes(normalizedTable) &&
    fields["Event ID"] === undefined &&
    fields.Event === undefined
  ) {
    const jsonFields = Object.entries(fields)
      .filter(([, value]) => typeof value === "string" && value.trim().startsWith("{"))
      .map(([, value]) => {
        try {
          return JSON.parse(value);
        } catch {
          return undefined;
        }
      })
      .filter(isObject);
    const evaluatorOwned = jsonFields.some((value) => value.source === "production-repair");
    if (!jsonFields.some((value) => value.eventId === CANONICAL_EVENT_ID) && !evaluatorOwned) {
      return undefined;
    }
  }
  const proof = resetWorkflowScope({
    fields,
    payload: raw?.payload,
    command: raw?.command,
    row: raw?.row,
  });
  if (candidate?.scopeProof?.organizationId === true) proof.organizationId = true;
  if (candidate?.scopeProof?.eventId === true) proof.eventId = true;
  if (candidate?.scopeProof?.foreignOrganization === true) proof.foreignOrganization = true;
  if (candidate?.scopeProof?.foreignEvent === true) proof.foreignEvent = true;
  if (!proof.organizationId && proof.eventId && resetTenantCanBeDerivedFromEvent(table)) {
    proof.organizationId = true;
  }
  if (proof.foreignOrganization || proof.foreignEvent || !proof.organizationId || !proof.eventId) {
    return undefined;
  }
  const providerId = raw?.recordId ?? raw?.providerId ?? raw?.id ?? raw?.record?.id;
  if (providerId === undefined || providerId === null || String(providerId).length === 0) {
    return undefined;
  }
  const applicationId =
    raw?.applicationId ??
    fields[APPLICATION_ID_FIELD] ??
    fields.applicationId ??
    (store === "airtable" ? undefined : raw?.id);
  const id = applicationId ?? String(providerId);
  const recordDigest =
    raw?.recordDigest ?? digest(raw?.row ?? (Object.keys(fields).length === 0 ? raw : fields));
  const operation = {
    key: `${RESET_WORKFLOW_VERSION}:delete:${store}:${table}:${String(providerId)}`,
    version: RESET_WORKFLOW_VERSION,
    phase: RESET_WORKFLOW_PHASE,
    action: "delete",
    store,
    table,
    id: String(id),
    applicationId: applicationId === undefined ? undefined : String(applicationId),
    recordId: String(providerId),
    expectedVersion: existingVersion(raw),
    recordDigest,
    organizationId: CANONICAL_ORGANIZATION_ID,
    eventId: CANONICAL_EVENT_ID,
    scopeProof: { organizationId: true, eventId: true },
    inputDigest: digest({
      store,
      table,
      id: String(id),
      recordId: String(providerId),
      recordDigest,
    }),
  };
  Object.defineProperty(operation, "record", {
    value: clone(raw),
    enumerable: false,
    configurable: true,
  });
  return operation;
}

function resetPlanEntry(operation, action = "delete") {
  return {
    key: operation.key,
    action,
    store: operation.store,
    table: operation.table,
    id: operation.id,
    recordId: operation.recordId,
    expectedVersion: operation.expectedVersion,
    scopeProof: operation.scopeProof,
  };
}

function resetFoundationOperations(manifest) {
  return manifest.operations.filter(
    (operation) =>
      operation.phase === "foundation" &&
      operation.store === "airtable" &&
      resetProtectedTable(operation.table),
  );
}

async function discoverWorkflowResetTargets({ manifest, transport }) {
  if (transport === undefined || transport === null) {
    fail("TRANSPORT_REQUIRED", "A reset planning transport is required.");
  }
  const discovered = [];
  const discoveryMethod = [
    "discoverWorkflowRecords",
    "listWorkflowRecords",
    "discoverEventRecords",
    "listEventRecords",
    "listScopedRecords",
  ].find((name) => typeof transport[name] === "function");
  if (discoveryMethod !== undefined) {
    discovered.push(
      ...normalizeResetDiscovery(
        await transport[discoveryMethod]({
          organizationId: CANONICAL_ORGANIZATION_ID,
          eventId: CANONICAL_EVENT_ID,
          tables: RESET_DISCOVERY_TABLES,
        }),
      ),
    );
  }
  const fallbackOperations = manifest.operations.filter(
    (operation) =>
      !resetProtectedTable(operation.table) &&
      operation.phase !== "foundation" &&
      operation.kind !== "identity" &&
      operation.kind !== "membership",
  );
  for (const operation of fallbackOperations) {
    const records = await readOperation(transport, operation);
    if (records.length > 1) {
      fail("DUPLICATE_OBJECT", `Multiple reset records match ${operation.key}.`);
    }
    if (records[0] !== undefined) {
      discovered.push({
        ...records[0],
        table: records[0].table ?? operation.table,
        store: records[0].store ?? operation.store,
        applicationId: records[0].applicationId ?? operation.applicationId ?? operation.id,
        kind: records[0].kind ?? operation.kind,
      });
    }
  }
  const targets = [];
  const seen = new Set();
  for (const candidate of discovered) {
    const target = resetTargetFromRecord(candidate);
    if (target === undefined || seen.has(target.key)) continue;
    seen.add(target.key);
    targets.push(target);
  }
  const rank = (table) => {
    const index = RESET_DELETE_ORDER.indexOf(table);
    return index < 0 ? RESET_DELETE_ORDER.length : index;
  };
  targets.sort(
    (left, right) => rank(left.table) - rank(right.table) || left.key.localeCompare(right.key),
  );
  return targets;
}

export function buildWorkflowResetManifest(options = {}) {
  const config = options.seedConfig ?? loadSeedConfig(options.seedConfigPath);
  const fixture = options.fixture ?? loadFixture(options.sourcePath ?? config.source);
  ensureScope(config);
  const foundationConfig = {
    ...config,
    cfp: { ...config.cfp, opensAt: config.cfp.opensAt },
  };
  const foundation = foundationOperations({ fixture, config: foundationConfig });
  const manifest = {
    version: REPAIR_VERSION,
    resetOnly: true,
    organizationId: CANONICAL_ORGANIZATION_ID,
    eventId: CANONICAL_EVENT_ID,
    timezone: config.timezone,
    createdAt: options.createdAt ?? new Date().toISOString(),
    cfp: {
      formId: config.cfp.formId,
      opensAt: dateIso(config.cfp.opensAt, "CFP opening time"),
      closesAt: dateIso(config.cfp.closeAt, "CFP close time"),
      closeDate: config.cfp.closeDate,
      keyTakeawayFieldId: config.cfp.keyTakeawayFieldId,
    },
    reviewWindow: {
      opensAt: dateIso(
        config.repair?.reviewWindow?.opensAt ?? REVIEW_WINDOW_DEFAULT.opensAt,
        "review window opening",
      ),
      closesAt: dateIso(
        config.repair?.reviewWindow?.closesAt ?? REVIEW_WINDOW_DEFAULT.closesAt,
        "review window close",
      ),
    },
    identityLedger: [],
    graph: null,
    operations: foundation,
    runLedger: {},
    resetLedger: {},
    source: { sourcePath: config.source ?? null, fixtureImmutable: true },
  };
  manifest.digest = computeManifestDigest(manifest);
  ensureManifestShape(manifest);
  return manifest;
}

export async function prepareWorkflowReset({
  manifest: suppliedManifest,
  manifestPath = DEFAULT_REPAIR_MANIFEST_PATH,
  transport,
  organizationId = CANONICAL_ORGANIZATION_ID,
  eventId = CANONICAL_EVENT_ID,
  now = new Date().toISOString(),
  writeManifest = true,
} = {}) {
  const manifest = suppliedManifest ?? readRepairManifest(manifestPath);
  ensureManifestShape(manifest);
  if (
    organizationId !== CANONICAL_ORGANIZATION_ID ||
    eventId !== CANONICAL_EVENT_ID ||
    manifest.organizationId !== CANONICAL_ORGANIZATION_ID ||
    manifest.eventId !== CANONICAL_EVENT_ID
  ) {
    fail("SCOPE_MISMATCH", "The workflow reset scope is immutable.");
  }
  const nowIso = dateIso(now, "workflow reset planning time");
  const targets = await discoverWorkflowResetTargets({ manifest, transport });
  const foundation = resetFoundationOperations(manifest);
  const foundationPlan = [];
  for (const operation of foundation) {
    const records = await readOperation(transport, operation);
    if (records.length > 1)
      fail("DUPLICATE_OBJECT", `Multiple reset foundation records match ${operation.key}.`);
    const existing = records[0];
    const action = planStatusFor(existing, operation);
    foundationPlan.push({
      key: operation.key,
      action,
      table: operation.table,
      id: operation.id,
      expectedVersion: existing === undefined ? null : existingVersion(existing),
    });
  }
  const deletionPlan = targets.map((target) => resetPlanEntry(target));
  const resetDigest = digest({
    version: RESET_WORKFLOW_VERSION,
    organizationId: CANONICAL_ORGANIZATION_ID,
    eventId: CANONICAL_EVENT_ID,
    deletionPlan,
    foundationPlan,
  });
  manifest.resetWorkflow = {
    version: RESET_WORKFLOW_VERSION,
    organizationId: CANONICAL_ORGANIZATION_ID,
    eventId: CANONICAL_EVENT_ID,
    plannedAt: nowIso,
    digest: resetDigest,
    deletions: clone(deletionPlan),
    foundation: clone(foundationPlan),
  };
  const combinedPlan = [...clone(deletionPlan), ...clone(foundationPlan)];
  Object.defineProperties(combinedPlan, {
    deletes: { value: clone(deletionPlan), enumerable: false },
    foundation: { value: clone(foundationPlan), enumerable: false },
    operations: { value: combinedPlan, enumerable: false },
  });
  if (!isObject(manifest.resetLedger)) manifest.resetLedger = {};
  const prepared = {
    version: RESET_WORKFLOW_VERSION,
    phase: RESET_WORKFLOW_PHASE,
    dryRun: true,
    status: "ready",
    plannedAt: nowIso,
    manifestDigest: resetDigest,
    plan: combinedPlan,
    deletes: clone(deletionPlan),
    foundation: clone(foundationPlan),
    writes: 0,
    deleteCount: deletionPlan.length,
    restoreCount: foundationPlan.filter((entry) => entry.action !== "skip").length,
  };
  if (writeManifest) writeRepairManifest(manifestPath, manifest);
  return { prepared, manifest, targets, foundationOperations: foundation };
}
async function readResetTarget(transport, operation) {
  if (operation.applicationId === undefined || operation.store !== "airtable") {
    return operation.record;
  }
  const records = await readOperation(transport, {
    ...operation,
    applicationId: operation.applicationId,
    id: operation.applicationId,
  });
  if (records.length > 1)
    fail("DUPLICATE_OBJECT", `Multiple reset records match ${operation.key}.`);
  const current = records[0];
  if (current === undefined) return undefined;
  const currentId = current.id ?? current.recordId;
  if (currentId !== undefined && String(currentId) !== operation.recordId) {
    fail("RESET_IDENTITY_CONFLICT", "The reset record identity changed before deletion.");
  }
  const proof = resetWorkflowScope(current);
  if (operation.scopeProof?.organizationId === true) proof.organizationId = true;
  if (operation.scopeProof?.eventId === true) proof.eventId = true;
  if (operation.scopeProof?.foreignOrganization === true) proof.foreignOrganization = true;
  if (operation.scopeProof?.foreignEvent === true) proof.foreignEvent = true;
  if (proof.foreignOrganization || proof.foreignEvent || !proof.organizationId || !proof.eventId) {
    fail("SCOPE_DRIFT", `The reset target ${operation.key} no longer has exact scope proof.`);
  }
  if (
    operation.expectedVersion !== undefined &&
    existingVersion(current) !== operation.expectedVersion
  ) {
    fail("RESET_VERSION_CONFLICT", `The reset target ${operation.key} changed before deletion.`);
  }
  return current;
}

async function deleteResetTarget(transport, operation) {
  if (transport === undefined || transport === null) {
    fail("TRANSPORT_REQUIRED", "A reset apply transport is required.");
  }
  const input = {
    ...operation,
    organizationId: CANONICAL_ORGANIZATION_ID,
    eventId: CANONICAL_EVENT_ID,
    expected: operation.record === undefined ? undefined : clone(operation.record),
    row: operation.record?.row,
  };
  try {
    if (typeof transport.delete === "function") return await transport.delete(input);
    if (typeof transport.deleteWorkflowRecord === "function")
      return await transport.deleteWorkflowRecord(input);
    if (typeof transport.deleteRecord === "function") return await transport.deleteRecord(input);
    if (typeof transport.removeRecord === "function") return await transport.removeRecord(input);
    if (typeof transport.remove === "function") return await transport.remove(input);
  } catch (error) {
    if (error instanceof DevflowRepairError) throw error;
    if (isObject(error) && typeof error.code === "string")
      fail(error.code, typeof error.message === "string" ? error.message : "Reset delete failed.");
    fail("TRANSPORT_DELETE_FAILED", `Reset delete failed for ${operation.key}.`);
  }
  fail("TRANSPORT_DELETE_UNSUPPORTED", "The repair transport cannot delete workflow records.");
}

function resetLedgerEntry(manifest, operation, state, extra = {}) {
  if (!isObject(manifest.resetLedger)) manifest.resetLedger = {};
  const entry = {
    key: operation.key,
    state,
    expectedObjectId: operation.id,
    inputDigest: operation.inputDigest,
    updatedAt: new Date().toISOString(),
    ...extra,
  };
  manifest.resetLedger[operation.key] = entry;
  return entry;
}

function resetFoundationLedgerKey(operation) {
  return `${RESET_WORKFLOW_VERSION}:foundation:${operation.key}`;
}

export async function applyWorkflowReset({
  prepared,
  manifest: suppliedManifest,
  manifestPath = DEFAULT_REPAIR_MANIFEST_PATH,
  transport,
  confirm,
  now = new Date().toISOString(),
  organizationId = CANONICAL_ORGANIZATION_ID,
  eventId = CANONICAL_EVENT_ID,
  failureAfter,
  writeManifest = true,
} = {}) {
  if (organizationId !== CANONICAL_ORGANIZATION_ID || eventId !== CANONICAL_EVENT_ID) {
    fail("SCOPE_MISMATCH", "The workflow reset scope is immutable.");
  }
  if (confirm !== RESET_WORKFLOW_CONFIRMATION) {
    fail(
      "RESET_CONFIRMATION_REQUIRED",
      `Workflow reset requires --confirm ${CANONICAL_ORGANIZATION_ID}.`,
    );
  }
  const manifest = suppliedManifest ?? prepared?.manifest ?? readRepairManifest(manifestPath);
  ensureManifestShape(manifest);
  const preflight =
    prepared?.prepared?.version === RESET_WORKFLOW_VERSION
      ? prepared
      : await prepareWorkflowReset({
          manifest,
          manifestPath,
          transport,
          now,
          organizationId,
          eventId,
          writeManifest: false,
        });
  const targets = preflight.targets ?? [];
  const foundation = preflight.foundationOperations ?? resetFoundationOperations(manifest);
  if (
    preflight.prepared?.manifestDigest !== undefined &&
    manifest.resetWorkflow?.digest !== undefined &&
    preflight.prepared.manifestDigest !== manifest.resetWorkflow.digest
  ) {
    fail("RESET_PLAN_DRIFT", "The prepared workflow reset plan no longer matches the manifest.");
  }
  let writes = 0;
  let deletes = 0;
  let restored = 0;
  for (const operation of targets) {
    const existingLedger = manifest.resetLedger?.[operation.key];
    if (existingLedger?.state === "complete") continue;
    const current = await readResetTarget(transport, operation);
    if (current === undefined) {
      const complete = resetLedgerEntry(manifest, operation, "complete", { missing: true });
      await notifyLedger(transport, complete, {
        manifest,
        manifestPath,
        writeManifest,
        phase: "reset-workflow",
      });
      continue;
    }
    const started = resetLedgerEntry(manifest, operation, "started", {
      expectedVersion: operation.expectedVersion,
    });
    await notifyLedger(transport, started, {
      manifest,
      manifestPath,
      writeManifest,
      phase: "reset-workflow",
    });
    await deleteResetTarget(transport, operation);
    writes += 1;
    deletes += 1;
    const after =
      operation.store === "airtable" && operation.applicationId !== undefined
        ? await readResetTarget(transport, operation)
        : (await discoverWorkflowResetTargets({ manifest, transport })).find(
            (candidate) => candidate.key === operation.key,
          );
    if (after !== undefined) {
      fail("RESET_NOT_VERIFIED", `Reset delete ${operation.key} could not be verified.`);
    }
    const complete = resetLedgerEntry(manifest, operation, "complete", {
      deleted: true,
      version: operation.expectedVersion,
    });
    await notifyLedger(transport, complete, {
      manifest,
      manifestPath,
      writeManifest,
      phase: "reset-workflow",
    });
    if (failureAfter !== undefined && writes >= failureAfter) {
      fail("PARTIAL_RESET", "Injected workflow reset failure after the requested write count.");
    }
    if (writeManifest) writeRepairManifest(manifestPath, manifest);
  }
  for (const operation of foundation) {
    const key = resetFoundationLedgerKey(operation);
    const existingLedger = manifest.resetLedger?.[key];
    if (existingLedger?.state === "complete") continue;
    const records = await readOperation(transport, operation);
    if (records.length > 1)
      fail("DUPLICATE_OBJECT", `Multiple reset foundation records match ${operation.key}.`);
    const existing = records[0];
    if (existing !== undefined && scopeDrift(operation, existing) !== undefined) {
      fail("SCOPE_DRIFT", `Foundation ${operation.key} has foreign scope.`);
    }
    if (reconcilePostWriteCheckpoint(operation, existing, existingLedger, "Foundation restore")) {
      const complete = resetLedgerEntry(manifest, { ...operation, key }, "complete", {
        recovered: true,
        version: existingVersion(existing),
      });
      await notifyLedger(transport, complete, {
        manifest,
        manifestPath,
        writeManifest,
        phase: "reset-workflow",
      });
      continue;
    }
    const planned =
      preflight.prepared?.foundation?.find((entry) => entry.key === operation.key) ??
      preflight.prepared?.plan?.foundation?.find((entry) => entry.key === operation.key);
    if (
      planned?.expectedVersion !== null &&
      planned?.expectedVersion !== undefined &&
      existing !== undefined &&
      existingVersion(existing) !== planned.expectedVersion
    ) {
      fail("RESET_VERSION_CONFLICT", `Foundation ${operation.key} changed before restore.`);
    }
    const action = planStatusFor(existing, operation);
    if (action === "skip") {
      const complete = resetLedgerEntry(manifest, { ...operation, key }, "complete", {
        skipped: true,
        version: existingVersion(existing),
      });
      await notifyLedger(transport, complete, {
        manifest,
        manifestPath,
        writeManifest,
        phase: "reset-workflow",
      });
      continue;
    }
    const started = resetLedgerEntry(manifest, { ...operation, key }, "started", {
      expectedVersion: existing === undefined ? null : existingVersion(existing),
    });
    await notifyLedger(transport, started, {
      manifest,
      manifestPath,
      writeManifest,
      phase: "reset-workflow",
    });
    await writeOperation(transport, operation, existing);
    writes += 1;
    restored += 1;
    const after = await readOperation(transport, operation);
    if (
      after.length !== 1 ||
      (operation.store === "airtable" && !existingMatchesOwned(operation, after[0]))
    ) {
      fail("RESET_NOT_VERIFIED", `Foundation restore ${operation.key} could not be verified.`);
    }
    const complete = resetLedgerEntry(manifest, { ...operation, key }, "complete", {
      version: existingVersion(after[0]),
    });
    await notifyLedger(transport, complete, {
      manifest,
      manifestPath,
      writeManifest,
      phase: "reset-workflow",
    });
    if (failureAfter !== undefined && writes >= failureAfter) {
      fail("PARTIAL_RESET", "Injected workflow reset failure after the requested write count.");
    }
    if (writeManifest) writeRepairManifest(manifestPath, manifest);
  }
  manifest.resetWorkflow.appliedAt = dateIso(now, "workflow reset apply time");
  manifest.resetWorkflow.status = "applied";
  if (writeManifest) writeRepairManifest(manifestPath, manifest);
  return {
    phase: RESET_WORKFLOW_PHASE,
    dryRun: false,
    status: "applied",
    writes,
    deletes,
    restored,
    operationCount: targets.length + foundation.length,
    resetDigest: manifest.resetWorkflow.digest,
  };
}

async function reconcileResetLedger({ manifest, manifestPath, transport, writeManifest }) {
  const deletions = manifest.resetWorkflow?.deletions;
  if (!Array.isArray(deletions)) return;
  for (const planned of deletions) {
    const ledger = manifest.resetLedger?.[planned.key];
    if (ledger?.state !== "started" || ledger.durableLedgerFailure?.attemptedState !== "complete") {
      continue;
    }
    const operation = {
      ...planned,
      applicationId: planned.store === "airtable" ? planned.id : undefined,
      inputDigest: ledger.inputDigest,
    };
    const records =
      operation.store === "airtable"
        ? [await readResetTarget(transport, operation)].filter((record) => record !== undefined)
        : (await discoverWorkflowResetTargets({ manifest, transport })).filter(
            (candidate) => candidate.key === operation.key,
          );
    if (records.length > 1) {
      fail("DUPLICATE_OBJECT", `Multiple reset records match ${operation.key} during resume.`);
    }
    if (records[0] !== undefined) continue;
    const complete = resetLedgerEntry(manifest, operation, "complete", {
      missing: true,
      recovered: true,
    });
    await notifyLedger(transport, complete, {
      manifest,
      manifestPath,
      writeManifest,
      phase: "reset-workflow",
    });
  }
}

export async function resumeWorkflowReset(options = {}) {
  const manifest =
    options.manifest ?? readRepairManifest(options.manifestPath ?? DEFAULT_REPAIR_MANIFEST_PATH);
  await reconcileResetLedger({
    manifest,
    manifestPath: options.manifestPath ?? DEFAULT_REPAIR_MANIFEST_PATH,
    transport: options.transport,
    writeManifest: options.writeManifest ?? true,
  });
  const prepared = await prepareWorkflowReset({
    ...options,
    manifest,
    writeManifest: false,
  });
  return applyWorkflowReset({
    ...options,
    manifest,
    prepared,
    confirm: options.confirm,
  });
}
function escapeFormula(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export function createAirtableRepairTransport({
  accessToken,
  baseId,
  apiOrigin = DEFAULT_AIRTABLE_API_ORIGIN,
  fetchImplementation = DEFAULT_FETCH,
} = {}) {
  const token = text(accessToken, "AIRTABLE_ACCESS_TOKEN");
  const base = text(baseId, "AIRTABLE_BASE_ID");
  let origin;
  try {
    const parsed = new URL(text(apiOrigin, "AIRTABLE_API_ORIGIN"));
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      fail("CONFIGURATION_ERROR", "AIRTABLE_API_ORIGIN must be an HTTPS origin.");
    }
    origin = parsed.origin;
  } catch (error) {
    if (error instanceof DevflowRepairError) throw error;
    fail("CONFIGURATION_ERROR", "AIRTABLE_API_ORIGIN must be an HTTPS origin.");
  }
  if (typeof fetchImplementation !== "function")
    fail("CONFIGURATION_ERROR", "A fetch implementation is required.");
  async function request(operation, suffix = "", init = {}) {
    let response;
    try {
      response = await fetchImplementation(
        `${origin}/v0/${encodeURIComponent(base)}/${encodeURIComponent(operation.table)}${suffix}`,
        {
          ...init,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...(init.headers ?? {}),
          },
        },
      );
    } catch {
      fail("AIRTABLE_REQUEST_FAILED", `Airtable request failed for ${operation.table}.`);
    }
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    if (!response.ok)
      fail("AIRTABLE_REQUEST_FAILED", `Airtable request failed for ${operation.table}.`);
    return payload;
  }
  return {
    async lookup(operation) {
      const query = new URLSearchParams({
        maxRecords: "2",
        filterByFormula: `{${APPLICATION_ID_FIELD}}="${escapeFormula(operation.applicationId ?? operation.id)}"`,
      });
      const payload = await request(operation, `?${query.toString()}`);
      if (!Array.isArray(payload.records))
        fail(
          "AIRTABLE_RESPONSE_INVALID",
          `Airtable lookup returned no records for ${operation.key}.`,
        );
      return payload.records;
    },
    async write(input) {
      const existing = input.existing;
      const fields = existing === undefined ? input.fields : input.fields;
      const recordId = existing?.id;
      const suffix = recordId === undefined ? "" : `/${encodeURIComponent(recordId)}`;
      const method = recordId === undefined ? "POST" : "PATCH";
      return request(input, suffix, {
        method,
        body: JSON.stringify({ fields, typecast: true }),
      });
    },
    async delete(input) {
      if (
        input?.organizationId !== CANONICAL_ORGANIZATION_ID ||
        input?.eventId !== CANONICAL_EVENT_ID
      ) {
        fail("SCOPE_MISMATCH", "The reset delete scope is immutable.");
      }
      const records = await this.lookup({ ...input, phase: RESET_WORKFLOW_PHASE });
      if (records.length > 1)
        fail("DUPLICATE_OBJECT", "Multiple reset records match the exact key.");
      const current = records[0];
      if (current === undefined) return { missing: true, recordId: input.recordId };
      if (current.id !== input.recordId)
        fail("RESET_IDENTITY_CONFLICT", "The reset record identity changed before deletion.");
      const proof = resetWorkflowScope(current);
      if (input?.scopeProof?.organizationId === true) proof.organizationId = true;
      if (input?.scopeProof?.eventId === true) proof.eventId = true;
      if (input?.scopeProof?.foreignOrganization === true) proof.foreignOrganization = true;
      if (input?.scopeProof?.foreignEvent === true) proof.foreignEvent = true;
      if (!proof.organizationId && proof.eventId && resetTenantCanBeDerivedFromEvent(input.table)) {
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
      if (
        typeof input.recordDigest === "string" &&
        digest(recordFields(current)) !== input.recordDigest
      ) {
        fail("RESET_VERSION_CONFLICT", "The reset record changed before deletion.");
      }
      return request(input, `/${encodeURIComponent(input.recordId)}`, { method: "DELETE" });
    },
  };
}

export function createRepairTransport({ airtable, commandAdapter } = {}) {
  if (airtable === undefined && commandAdapter === undefined) return undefined;
  return {
    async read(operation) {
      if (operation.store === "airtable") {
        return airtable === undefined ? [] : airtable.lookup(operation);
      }
      if (commandAdapter === undefined) return [];
      if (typeof commandAdapter.read === "function") return commandAdapter.read(operation);
      if (typeof commandAdapter.lookup === "function") return commandAdapter.lookup(operation);
      if (operation.kind === "identity" && typeof commandAdapter.resolveUserId === "function") {
        const result = await commandAdapter.resolveUserId({
          identityKey: operation.payload.identityKey,
          email: operation.payload.email,
          organizationId: CANONICAL_ORGANIZATION_ID,
          eventId: CANONICAL_EVENT_ID,
        });
        return result === undefined
          ? []
          : [isObject(result) ? result : { userId: result, email: operation.payload.email }];
      }
      return [];
    },
    async lookup(operation) {
      return this.read(operation);
    },
    async write(input) {
      if (input.store === "airtable") {
        if (airtable === undefined)
          fail("TRANSPORT_REQUIRED", "An Airtable repair transport is required.");
        return airtable.write(input);
      }
      if (commandAdapter === undefined)
        fail("TRANSPORT_REQUIRED", "A D1 repair command adapter is required.");
      if (typeof commandAdapter.execute === "function")
        return commandAdapter.execute(input.command ?? input.payload ?? input);
      if (typeof commandAdapter.write === "function") return commandAdapter.write(input);
      fail("TRANSPORT_WRITE_UNSUPPORTED", "The D1 repair adapter cannot execute a command.");
    },
    async execute(command) {
      if (commandAdapter === undefined)
        fail("TRANSPORT_REQUIRED", "A D1 repair command adapter is required.");
      if (typeof commandAdapter.execute === "function") return commandAdapter.execute(command);
      if (typeof commandAdapter.write === "function") return commandAdapter.write(command);
      fail("TRANSPORT_WRITE_UNSUPPORTED", "The D1 repair adapter cannot execute a command.");
    },
    async discoverWorkflowRecords(scope = {}) {
      const records = [];
      const discover =
        commandAdapter?.discoverWorkflowRecords ?? commandAdapter?.listWorkflowRecords;
      if (typeof discover === "function") {
        records.push(...normalizeReadResult(await discover(scope)));
      } else if (typeof airtable?.discoverWorkflowRecords === "function") {
        records.push(...normalizeReadResult(await airtable.discoverWorkflowRecords(scope)));
      }
      return records;
    },
    async listWorkflowRecords(scope = {}) {
      return this.discoverWorkflowRecords(scope);
    },
    async listEventRecords(scope = {}) {
      return this.discoverWorkflowRecords(scope);
    },
    async listScopedRecords(scope = {}) {
      return this.discoverWorkflowRecords(scope);
    },
    async delete(input) {
      if (input.store === "airtable") {
        if (typeof airtable?.delete === "function") return airtable.delete(input);
        if (typeof airtable?.remove === "function") return airtable.remove(input);
      }
      const remove =
        commandAdapter?.deleteWorkflowRecord ??
        commandAdapter?.deleteRecord ??
        commandAdapter?.delete ??
        commandAdapter?.removeRecord ??
        commandAdapter?.remove;
      if (typeof remove === "function") return remove(input);
      fail("TRANSPORT_DELETE_UNSUPPORTED", "The repair transport cannot delete workflow records.");
    },
    async verifyIdentity(input) {
      if (commandAdapter === undefined) return false;
      if (typeof commandAdapter.verifyIdentity === "function")
        return commandAdapter.verifyIdentity(input);
      if (typeof commandAdapter.ensureVerified === "function")
        return commandAdapter.ensureVerified(input);
      return true;
    },
    async recordLedger(entry) {
      if (commandAdapter === undefined)
        fail("LEDGER_UNAVAILABLE", "A D1 command adapter is required for the durable ledger.");
      if (typeof commandAdapter.recordLedger === "function")
        return commandAdapter.recordLedger(entry);
      if (typeof commandAdapter.execute === "function")
        return commandAdapter.execute({
          type: "repair-ledger",
          operation: "record",
          idempotencyKey: entry.key,
          ...entry,
        });
      fail("LEDGER_UNAVAILABLE", "The D1 command adapter cannot record the durable ledger.");
    },
  };
}

function errorCode(error) {
  return isObject(error) && typeof error.code === "string" ? error.code : "UNKNOWN";
}

function preserveRetryableLedgerState(manifest, phase, entry, causeCode) {
  if (!isObject(manifest)) return null;
  const ledger = phase === "reset-workflow" ? manifest.resetLedger : manifest.runLedger;
  if (!isObject(ledger) || !isObject(ledger[entry.key])) return null;
  const recoveryState = entry.state === "complete" ? "started" : entry.state;
  ledger[entry.key] = {
    ...ledger[entry.key],
    state: recoveryState,
    durableLedgerFailure: {
      attemptedState: entry.state,
      causeCode,
      failedAt: entry.updatedAt,
    },
  };
  return recoveryState;
}

async function notifyLedger(transport, entry, checkpointContext = undefined) {
  try {
    if (
      transport === undefined ||
      transport === null ||
      typeof transport.recordLedger !== "function"
    ) {
      fail("LEDGER_UNAVAILABLE", "A durable repair ledger transport is required.");
    }
    await transport.recordLedger(clone(entry));
  } catch (error) {
    const causeCode = errorCode(error);
    const recoveryState = preserveRetryableLedgerState(
      checkpointContext?.manifest,
      checkpointContext?.phase,
      entry,
      causeCode,
    );
    const checkpoint = {
      attempted: false,
      persisted: false,
      path: checkpointContext?.manifestPath ?? null,
      recoveryState,
    };
    if (
      checkpointContext?.manifest !== undefined &&
      checkpointContext?.manifestPath !== undefined &&
      checkpointContext.writeManifest !== false
    ) {
      checkpoint.attempted = true;
      try {
        checkpoint.path = writeRepairManifest(
          checkpointContext.manifestPath,
          checkpointContext.manifest,
        );
        checkpoint.persisted = true;
      } catch (checkpointError) {
        checkpoint.errorCode = errorCode(checkpointError);
      }
    }
    fail(
      "LEDGER_WRITE_FAILED",
      `The durable repair ledger could not be recorded for ${entry.key} (${entry.state}); inspect the checkpoint before resuming.`,
      {
        phase: checkpointContext?.phase ?? "repair",
        ledgerKey: entry.key,
        state: entry.state,
        causeCode,
        checkpoint,
      },
    );
  }
}

async function writeOperation(transport, operation, existing) {
  if (transport === undefined || transport === null)
    fail("TRANSPORT_REQUIRED", "An apply transport is required.");
  if (operation.store === "airtable") {
    const fields =
      existing === undefined
        ? clone(operation.fields)
        : {
            ...clone(operation.ownedFields),
            ...(operation.versionField === undefined
              ? {}
              : { [operation.versionField]: existingVersion(existing) + 1 }),
          };
    const input = {
      ...operation,
      fields,
      existing: existing === undefined ? undefined : clone(existing),
    };
    try {
      if (typeof transport.write === "function") return await transport.write(input);
      if (typeof transport.upsert === "function") return await transport.upsert(input);
      if (typeof transport.execute === "function") return await transport.execute(input);
    } catch (error) {
      if (isObject(error) && typeof error.code === "string")
        fail(
          error.code,
          typeof error.message === "string"
            ? error.message
            : `Repair write failed for ${operation.key}.`,
        );
      fail("TRANSPORT_WRITE_FAILED", `Repair write failed for ${operation.key}.`);
    }
  } else {
    try {
      const command = clone(operation.payload);
      if (typeof transport.execute === "function") return await transport.execute(command);
      if (typeof transport.write === "function")
        return await transport.write({ ...operation, command });
      if (typeof transport.upsert === "function")
        return await transport.upsert({ ...operation, command });
    } catch (error) {
      if (isObject(error) && typeof error.code === "string")
        fail(
          error.code,
          typeof error.message === "string"
            ? error.message
            : `Repair command failed for ${operation.key}.`,
        );
      fail("TRANSPORT_WRITE_FAILED", `Repair command failed for ${operation.key}.`);
    }
  }
  fail("TRANSPORT_WRITE_UNSUPPORTED", `The repair transport cannot write ${operation.key}.`);
}

function profileBindingDrift(operation, record) {
  if (operation.table !== "Speaker Profiles") return undefined;
  let expected;
  let actual;
  try {
    expected = JSON.parse(operation.fields.Biography);
    actual = JSON.parse(recordValue(record, "Biography") ?? "{}");
  } catch {
    return "Biography";
  }
  if (expected.id !== operation.id || actual.id !== operation.id) return "id";
  if (expected.participantId !== actual.participantId) return "participantId";
  if (
    expected.userId !== undefined &&
    actual.userId !== undefined &&
    expected.userId !== actual.userId
  )
    return "userId";
  if (
    expected.email !== undefined &&
    actual.email !== undefined &&
    normalizeEmail(expected.email, "profile email") !==
      normalizeEmail(actual.email, "profile email")
  )
    return "email";
  return undefined;
}
function planStatusFor(existing, operation) {
  if (existing === undefined) return "create";
  if (
    operation.kind === "speaker-grant" &&
    recordValue(existing, "Revoked At", "revokedAt", "revoked_at") !== undefined &&
    recordValue(existing, "Revoked At", "revokedAt", "revoked_at") !== null
  ) {
    return "patch";
  }
  const drift = scopeDrift(operation, existing);
  if (drift !== undefined)
    fail("SCOPE_DRIFT", `Existing ${operation.key} has foreign ${drift} scope.`);
  const profileDrift = profileBindingDrift(operation, existing);
  if (profileDrift !== undefined)
    fail("IDENTITY_DRIFT", `Existing ${operation.key} differs at profile binding ${profileDrift}.`);
  const immutable = immutableDrift(operation, existing);
  if (immutable !== undefined)
    fail("COLLISION_DRIFT", `Existing ${operation.key} differs at immutable field ${immutable}.`);
  return existingMatchesOwned(operation, existing) ? "skip" : "patch";
}

function updateIdentityFromRecord(manifest, operation, record) {
  if (operation.kind !== "identity" || record === undefined) return;
  const identityKey = operation.payload.identityKey;
  const identity = identityByKey(manifest, identityKey);
  const email = existingIdentityEmail(record);
  if (email !== undefined && email !== identity.email)
    fail("IDENTITY_DRIFT", `Identity ${identityKey} email differs from the exact ledger email.`);
  const userId = optionalText(recordValue(record, "User ID", "userId", "id"));
  if (userId === undefined) return;
  if (identity.userId !== undefined && identity.userId !== userId)
    fail("IDENTITY_DRIFT", `Identity ${identityKey} user ID changed.`);
  identity.userId = userId;
  const duplicate = manifest.identityLedger.find(
    (candidate) => candidate.identityKey !== identityKey && candidate.userId === userId,
  );
  if (duplicate !== undefined)
    fail(
      "DUPLICATE_IDENTITY",
      `Identity ${identityKey} resolves to ${duplicate.identityKey}'s user ID.`,
    );
  const verified = recordValue(record, "Verified", "emailVerified", "verified");
  if (verified === true || verified === "true") identity.verified = true;
}

function refreshPayloads(manifest) {
  const keyMap = new Map();
  const sessionActorId = userIdOrRef(manifest, "organizer-fixture");
  for (const session of manifest.graph?.sessions ?? []) {
    session.createdBy = sessionActorId;
    session.updatedBy = sessionActorId;
  }
  for (const operation of manifest.operations) {
    if (operation.kind === "identity") {
      const identity = identityByKey(manifest, operation.payload.identityKey);
      operation.payload.userId = identity.userId;
      operation.payload.verified = identity.verified;
    }
    if (operation.kind === "membership" || operation.kind === "speaker-grant") {
      const identity = identityByKey(manifest, operation.payload.identityKey);
      operation.payload.userId = userIdOrRef(manifest, identity.identityKey);
      const oldKey = operation.key;
      const oldId = operation.id;
      if (operation.kind === "membership") {
        operation.id = `${CANONICAL_ORGANIZATION_ID}:${operation.payload.userId}:${operation.payload.role}`;
        operation.key = ledgerKey("membership", operation.id);
        operation.payload.idempotencyKey = operation.key;
      } else {
        operation.id = `${CANONICAL_ORGANIZATION_ID}:${CANONICAL_EVENT_ID}:${operation.payload.speakerProfileId}:${operation.payload.userId}`;
        operation.key = ledgerKey("speaker-grant", operation.id);
        operation.payload.idempotencyKey = operation.key;
      }
      keyMap.set(oldKey, operation.key);
      if (oldId !== operation.id) operation.inputDigest = digest(operation.payload);
    }
    if (operation.table === "Submissions" && !operation.id.startsWith("speaker-submission:")) {
      operation.fields["Submitter Account ID"] = userIdOrRef(manifest, "submitter");
      operation.ownedFields["Submitter Account ID"] = operation.fields["Submitter Account ID"];
      const submission = JSON.parse(operation.fields["Answers JSON"]);
      submission.ownerAccountId = operation.fields["Submitter Account ID"];
      operation.fields["Answers JSON"] = json(submission);
      operation.ownedFields["Answers JSON"] = operation.fields["Answers JSON"];
    }
    if (operation.table === "Participants") {
      const rawUserId = operation.fields["User ID"];
      const identity = manifest.identityLedger.find(
        (candidate) =>
          rawUserId === candidate.userId ||
          rawUserId === `identity:${candidate.identityKey}` ||
          operation.fields.Email === candidate.email,
      );
      if (identity !== undefined) {
        operation.fields["User ID"] = userIdOrRef(manifest, identity.identityKey);
        operation.ownedFields["User ID"] = operation.fields["User ID"];
      }
    }
    if (operation.table === "Sessions") {
      const metadata = JSON.parse(operation.fields["Metadata JSON"]);
      metadata.createdBy = sessionActorId;
      metadata.updatedBy = sessionActorId;
      operation.fields["Metadata JSON"] = json(metadata);
      operation.fields["Created By User ID"] = sessionActorId;
      operation.fields["Updated By User ID"] = sessionActorId;
      const audit = JSON.parse(operation.fields["Audit JSON"]);
      audit.actorId = sessionActorId;
      operation.fields["Audit JSON"] = json(audit);
      const provenance = JSON.parse(operation.fields["Provenance JSON"]);
      provenance.actorId = sessionActorId;
      operation.fields["Provenance JSON"] = json(provenance);
      for (const field of [
        "Metadata JSON",
        "Created By User ID",
        "Updated By User ID",
        "Audit JSON",
        "Provenance JSON",
      ]) {
        operation.ownedFields[field] = operation.fields[field];
      }
      operation.inputDigest = digest(metadata);
    }
    if (operation.table === "Speaker Profiles") {
      const profileValue = JSON.parse(operation.fields.Biography);
      const identityKey = profileValue.userId?.startsWith("identity:")
        ? profileValue.userId.slice("identity:".length)
        : undefined;
      if (identityKey !== undefined && IDENTITY_KEYS.includes(identityKey)) {
        profileValue.userId = userIdOrRef(manifest, identityKey);
        operation.fields.Biography = json(profileValue);
        operation.ownedFields.Biography = operation.fields.Biography;
      }
    }
    if (operation.kind === "reviewer-pool") {
      const oldKey = operation.key;
      const reviewerId = userIdOrRef(manifest, "reviewer-sam");
      operation.id = `${REVIEW_ROUND_ID}:${reviewerId}`;
      operation.key = ledgerKey("reviewer-pool", operation.id);
      operation.payload.reviewerId = reviewerId;
      operation.payload.idempotencyKey = operation.key;
      keyMap.set(oldKey, operation.key);
    }
    if (operation.table === "Review Plans") {
      const reviewPlan = JSON.parse(operation.fields["Rounds JSON"]);
      const reviewerId = userIdOrRef(manifest, "reviewer-sam");
      for (const round of reviewPlan.rounds ?? []) {
        if (round.id !== REVIEW_ROUND_ID) continue;
        round.reviewerPool = { ...(round.reviewerPool ?? {}), reviewerIds: [reviewerId] };
      }
      operation.fields["Rounds JSON"] = json(reviewPlan);
      operation.ownedFields["Rounds JSON"] = operation.fields["Rounds JSON"];
    }
    if (operation.table === "Evaluations") {
      const proposalId = operation.fields.Submission;
      const reviewerId = userIdOrRef(manifest, "reviewer-sam");
      const oldKey = operation.key;
      operation.fields["Reviewer ID"] = reviewerId;
      operation.ownedFields["Reviewer ID"] = reviewerId;
      operation.id = `${CANONICAL_EVENT_ID}:review-assignment:${REVIEW_ROUND_ID}:${reviewerId}:${proposalId}`;
      operation.applicationId = operation.id;
      operation.key = ledgerKey(
        "review-assignment",
        `${REVIEW_ROUND_ID}:${reviewerId}:${proposalId}`,
      );
      operation.ownedFields[APPLICATION_ID_FIELD] = operation.id;
      operation.fields[APPLICATION_ID_FIELD] = operation.id;
      const assignment = JSON.parse(operation.fields["Scores JSON"]);
      assignment.id = operation.id;
      assignment.reviewerId = reviewerId;
      operation.fields["Scores JSON"] = json(assignment);
      operation.ownedFields["Scores JSON"] = operation.fields["Scores JSON"];
      keyMap.set(oldKey, operation.key);
    }
    if (operation.table === "Decisions") {
      const organizerId = userIdOrRef(manifest, "organizer-agenda");
      operation.fields["Decided By User ID"] = organizerId;
      operation.ownedFields["Decided By User ID"] = organizerId;
      const decision = JSON.parse(operation.fields["Metadata JSON"]);
      for (const transition of decision.history ?? []) transition.decidedBy = organizerId;
      operation.fields["Metadata JSON"] = json(decision);
      operation.ownedFields["Metadata JSON"] = operation.fields["Metadata JSON"];
    }
    if (operation.kind === "crm-activity") {
      const profileIds = {
        "speaker-priya": SPEAKER_PROFILE_IDS["speaker-priya"],
        "speaker-marcus": SPEAKER_PROFILE_IDS["speaker-marcus"],
      };
      const identityKey = Object.entries(profileIds).find(([, profileId]) =>
        operation.id.includes(profileId),
      )?.[0];
      if (identityKey !== undefined)
        operation.payload.contactUserId = userIdOrRef(manifest, identityKey);
      if (operation.payload.contact !== undefined)
        operation.payload.contact.userId = operation.payload.contactUserId;
    }
  }
  for (const operation of manifest.operations) {
    operation.dependsOn = (operation.dependsOn ?? []).map(
      (dependency) => keyMap.get(dependency) ?? dependency,
    );
  }
}

export async function prepareRepair({
  manifest: suppliedManifest,
  manifestPath = DEFAULT_REPAIR_MANIFEST_PATH,
  transport,
  now = new Date().toISOString(),
  writeManifest = true,
} = {}) {
  const manifest =
    suppliedManifest === undefined ? readRepairManifest(manifestPath) : suppliedManifest;
  ensureManifestShape(manifest);
  const nowIso = dateIso(now, "repair execution time");
  if (
    new Date(nowIso).getTime() < new Date(manifest.reviewWindow.opensAt).getTime() ||
    new Date(nowIso).getTime() > new Date(manifest.reviewWindow.closesAt).getTime()
  ) {
    fail(
      "REVIEW_WINDOW_CLOSED",
      "The configured reviewer window is not open at repair execution time.",
    );
  }
  const identityOperations = manifest.operations.filter(
    (operation) => operation.kind === "identity",
  );
  for (const operation of identityOperations) {
    const records = await readOperation(transport, operation);
    if (records.length > 1)
      fail("DUPLICATE_OBJECT", `Multiple records match ${operation.key}; refusing to choose one.`);
    updateIdentityFromRecord(manifest, operation, records[0]);
  }
  refreshPayloads(manifest);
  const plan = [];
  const existingByKey = new Map();
  for (const operation of manifest.operations) {
    const records = await readOperation(transport, operation);
    if (records.length > 1)
      fail("DUPLICATE_OBJECT", `Multiple records match ${operation.key}; refusing to choose one.`);
    const existing = records[0];
    if (existing !== undefined) existingByKey.set(operation.key, existing);
    const action = planStatusFor(existing, operation);
    const expectedVersion = existing === undefined ? null : existingVersion(existing);
    plan.push({
      key: operation.key,
      id: operation.id,
      table: operation.table,
      kind: operation.kind,
      action,
      expectedVersion,
    });
  }
  manifest.digest = computeManifestDigest(manifest);
  ensureManifestShape(manifest);
  const identityFailures = manifest.identityLedger.filter(
    (identity) => identity.userId === undefined || identity.verified !== true,
  );
  const status = identityFailures.length > 0 ? "needs-identity-resolution" : "ready";
  const prepared = {
    version: REPAIR_VERSION,
    phase: "prepare",
    dryRun: true,
    status,
    preparedAt: nowIso,
    manifestDigest: manifest.digest,
    plan,
    identityFailures: identityFailures.map((identity) => identity.identityKey),
    writes: 0,
    readCount: identityOperations.length + manifest.operations.length,
  };
  manifest.preflight = { preparedAt: nowIso, status, plan: clone(plan) };
  if (writeManifest) writeRepairManifest(manifestPath, manifest);
  return { prepared, manifest, existingByKey };
}

function ledgerEntry(manifest, operation, state, extra = {}) {
  const entry = {
    key: operation.key,
    state,
    expectedObjectId: operation.id,
    inputDigest: operation.inputDigest,
    updatedAt: new Date().toISOString(),
    ...extra,
  };
  manifest.runLedger[operation.key] = entry;
  return entry;
}

async function resolveIdentityForApply({ manifest, operation, transport, credentials, options }) {
  const identityKey = operation.payload.identityKey;
  const identity = identityByKey(manifest, identityKey);
  const account = credentials?.[identityKey];
  const credentialBacked =
    isObject(account) && typeof account.password === "string" && account.password.length > 0;
  if (identity.userId === undefined && transport !== undefined) {
    const records = await readOperation(transport, { ...operation, store: "auth" });
    if (records.length > 1)
      fail("DUPLICATE_IDENTITY", `Multiple Better Auth users match ${identityKey}.`);
    const resolved = records[0];
    identity.userId = optionalText(recordValue(resolved, "User ID", "userId", "id"));
    updateIdentityFromRecord(manifest, operation, resolved);
  }
  if (identity.userId === undefined) {
    if (!credentialBacked) {
      fail(
        "IDENTITY_UNRESOLVED",
        `Credentials for ${identityKey} are required to resolve its Better Auth user ID.`,
      );
    }
    const created = await createBetterAuthAccount({
      apiOrigin: options.apiOrigin,
      webOrigin: options.webOrigin,
      persona: identityKey,
      account: { ...account, name: account.name ?? identity.displayName, email: identity.email },
      fetchImplementation: options.fetchImplementation ?? DEFAULT_FETCH,
    });
    identity.userId = optionalText(created.userId);
  }
  if (identity.userId === undefined)
    fail("IDENTITY_UNRESOLVED", `Better Auth did not return a user ID for ${identityKey}.`);
  if (identity.verified !== true && !credentialBacked) {
    fail(
      "IDENTITY_VERIFICATION_REQUIRED",
      `Credential-backed apply is required to verify ${identityKey}.`,
    );
  }
  if (transport !== undefined && typeof transport.verifyIdentity === "function") {
    try {
      const verified = await transport.verifyIdentity({
        identityKey,
        email: identity.email,
        userId: identity.userId,
        credentialBacked,
      });
      if (verified === false)
        fail("IDENTITY_VERIFICATION_FAILED", `Identity verification failed for ${identityKey}.`);
    } catch (error) {
      if (error instanceof DevflowRepairError) throw error;
      if (isObject(error) && typeof error.code === "string")
        fail(
          error.code,
          typeof error.message === "string" ? error.message : "Identity verification failed.",
        );
      fail("IDENTITY_VERIFICATION_FAILED", `Identity verification failed for ${identityKey}.`);
    }
    identity.verified = true;
  } else if (identity.verified !== true) {
    fail("IDENTITY_VERIFICATION_REQUIRED", `Identity ${identityKey} is not marked verified.`);
  }
  operation.payload.userId = identity.userId;
  operation.payload.verified = true;
  operation.payload.credentialBacked = credentialBacked;
}

function reconcilePostWriteCheckpoint(operation, existing, ledger, label) {
  if (ledger?.state !== "started" || ledger.durableLedgerFailure?.attemptedState !== "complete") {
    return false;
  }
  if (
    operation.store !== "airtable" ||
    existing === undefined ||
    !existingMatchesOwned(operation, existing)
  ) {
    fail(
      "LEDGER_RECONCILIATION_CONFLICT",
      `${label} ${operation.key} does not match the planned post-write state; inspect the authoritative record before resuming.`,
      {
        ledgerKey: ledger.key ?? operation.key,
        table: operation.table ?? null,
        objectId: operation.id,
      },
    );
  }
  return true;
}
async function verifyCompletedIdentityOperation(manifest, transport, operation) {
  const records = await readOperation(transport, operation);
  if (records.length !== 1) {
    fail("LEDGER_DRIFT", `Ledger identity ${operation.key} is missing or duplicated.`);
  }
  const identity = identityByKey(manifest, operation.payload.identityKey);
  const record = records[0];
  const email = existingIdentityEmail(record);
  const userId = optionalText(recordValue(record, "User ID", "userId", "id"));
  const verified = recordValue(record, "Verified", "emailVerified", "verified");
  if (
    email !== identity.email ||
    userId !== identity.userId ||
    (verified !== true && verified !== "true" && verified !== 1)
  ) {
    fail("LEDGER_DRIFT", `Ledger identity ${operation.key} no longer matches its account.`);
  }
}

export async function applyRepair({
  prepared,
  manifest: suppliedManifest,
  manifestPath = DEFAULT_REPAIR_MANIFEST_PATH,
  transport,
  credentials,
  options = {},
  confirm,
  now = new Date().toISOString(),
  failureAfter,
  writeManifest = true,
} = {}) {
  const manifest = suppliedManifest ?? prepared?.manifest ?? readRepairManifest(manifestPath);
  ensureManifestShape(manifest);
  const resolvedCredentials = credentials ?? manifest.credentials;
  if (confirm !== REPAIR_CONFIRMATION && options.environment === "production") {
    fail(
      "PRODUCTION_CONFIRMATION_REQUIRED",
      `Apply requires --confirm ${CANONICAL_ORGANIZATION_ID}.`,
    );
  }
  const preflight =
    prepared?.prepared === undefined
      ? await prepareRepair({ manifest, manifestPath, transport, now, writeManifest: false })
      : prepared;
  if (
    preflight.prepared?.manifestDigest !== undefined &&
    preflight.prepared.manifestDigest !== manifest.digest
  ) {
    fail("MANIFEST_DRIFT", "The prepared manifest digest no longer matches the apply manifest.");
  }
  let writes = 0;
  let completed = 0;
  const ordered = [...manifest.operations];
  for (const operation of ordered) {
    for (const dependency of operation.dependsOn ?? []) {
      const entry = manifest.runLedger[dependency];
      if (entry?.state !== "complete")
        fail("DEPENDENCY_INCOMPLETE", `Repair dependency ${dependency} is incomplete.`);
    }
    const operationLedger = manifest.runLedger[operation.key];
    if (operationLedger?.state === "complete" && operation.kind === "identity") {
      await verifyCompletedIdentityOperation(manifest, transport, operation);
      completed += 1;
      continue;
    }
    if (
      operation.kind === "identity" &&
      operationLedger?.state === "started" &&
      operationLedger.durableLedgerFailure?.attemptedState === "complete"
    ) {
      reconcilePostWriteCheckpoint(operation, undefined, operationLedger, "Identity repair");
    }
    if (operation.kind === "identity") {
      await resolveIdentityForApply({
        manifest,
        operation,
        transport,
        credentials: resolvedCredentials,
        options,
      });
      manifest.digest = computeManifestDigest(manifest);
      const started = ledgerEntry(manifest, operation, "started", {
        userId: identityByKey(manifest, operation.payload.identityKey).userId,
      });
      await notifyLedger(transport, started, {
        manifest,
        manifestPath,
        writeManifest,
        phase: "repair",
      });
      await writeOperation(transport, operation, undefined);
      writes += 1;
      const identityEntry = ledgerEntry(manifest, operation, "complete", {
        userId: identityByKey(manifest, operation.payload.identityKey).userId,
      });
      await notifyLedger(transport, identityEntry, {
        manifest,
        manifestPath,
        writeManifest,
        phase: "repair",
      });
      completed += 1;
      continue;
    }
    refreshPayloads(manifest);
    manifest.digest = computeManifestDigest(manifest);
    const records = await readOperation(transport, operation);
    if (records.length > 1)
      fail("DUPLICATE_OBJECT", `Multiple records match ${operation.key}; refusing to choose one.`);
    const existing = records[0];
    const ledger = manifest.runLedger[operation.key];
    if (ledger?.state === "complete") {
      if (existing === undefined)
        fail("LEDGER_DRIFT", `Ledger marked ${operation.key} complete but the object is missing.`);
      if (
        immutableDrift(operation, existing) !== undefined ||
        profileBindingDrift(operation, existing) !== undefined ||
        !existingMatchesOwned(operation, existing)
      ) {
        fail(
          "LEDGER_DRIFT",
          `Ledger object ${operation.key} no longer matches its recorded digest.`,
        );
      }
      completed += 1;
      continue;
    }
    if (existing !== undefined && scopeDrift(operation, existing) !== undefined)
      fail("SCOPE_DRIFT", `Existing ${operation.key} has foreign scope.`);
    if (reconcilePostWriteCheckpoint(operation, existing, ledger, "Repair operation")) {
      const completeEntry = ledgerEntry(manifest, operation, "complete", {
        recovered: true,
        version: existingVersion(existing),
      });
      await notifyLedger(transport, completeEntry, {
        manifest,
        manifestPath,
        writeManifest,
        phase: "repair",
      });
      completed += 1;
      continue;
    }
    if (
      existing !== undefined &&
      ledger?.state === "started" &&
      existingMatchesOwned(operation, existing)
    ) {
      const completeEntry = ledgerEntry(manifest, operation, "complete", {
        recovered: true,
        version: existingVersion(existing),
      });
      await notifyLedger(transport, completeEntry, {
        manifest,
        manifestPath,
        writeManifest,
        phase: "repair",
      });
      completed += 1;
      continue;
    }
    const preparedAction = preflight.prepared?.plan?.find((item) => item.key === operation.key);
    if (
      preparedAction?.expectedVersion !== null &&
      existing !== undefined &&
      existingVersion(existing) !== preparedAction.expectedVersion
    ) {
      fail("VERSION_CONFLICT", `Optimistic version changed for ${operation.key}.`);
    }
    if (
      preparedAction?.action === "skip" &&
      existing !== undefined &&
      immutableDrift(operation, existing) === undefined &&
      profileBindingDrift(operation, existing) === undefined &&
      existingMatchesOwned(operation, existing)
    ) {
      const completeEntry = ledgerEntry(manifest, operation, "complete", {
        skipped: true,
        version: existingVersion(existing),
      });
      await notifyLedger(transport, completeEntry, {
        manifest,
        manifestPath,
        writeManifest,
        phase: "repair",
      });
      completed += 1;
      if (writeManifest) writeRepairManifest(manifestPath, manifest);
      continue;
    }
    const started = ledgerEntry(manifest, operation, "started", {
      expectedVersion: existing === undefined ? null : existingVersion(existing),
    });
    await notifyLedger(transport, started, {
      manifest,
      manifestPath,
      writeManifest,
      phase: "repair",
    });
    await writeOperation(transport, operation, existing);
    writes += 1;
    const after = await readOperation(transport, operation);
    if (after.length > 1)
      fail("DUPLICATE_OBJECT", `Multiple records match ${operation.key} after write.`);
    if (
      operation.store === "airtable" &&
      (after[0] === undefined || !existingMatchesOwned(operation, after[0]))
    ) {
      fail("WRITE_NOT_VERIFIED", `Repair write ${operation.key} could not be verified.`);
    }
    const completeEntry = ledgerEntry(manifest, operation, "complete", {
      version: after[0] === undefined ? undefined : existingVersion(after[0]),
    });
    await notifyLedger(transport, completeEntry, {
      manifest,
      manifestPath,
      writeManifest,
      phase: "repair",
    });
    completed += 1;
    if (failureAfter !== undefined && writes >= failureAfter)
      fail("PARTIAL_REPAIR", "Injected repair failure after the requested write count.");
    if (writeManifest) writeRepairManifest(manifestPath, manifest);
  }
  manifest.appliedAt = dateIso(now, "repair apply time");
  manifest.status = "applied";
  if (writeManifest) writeRepairManifest(manifestPath, manifest);
  return {
    phase: "apply",
    dryRun: false,
    status: "applied",
    writes,
    completed,
    operationCount: ordered.length,
    manifestDigest: manifest.digest,
  };
}

export async function resumeRepair(options = {}) {
  const manifest =
    options.manifest ?? readRepairManifest(options.manifestPath ?? DEFAULT_REPAIR_MANIFEST_PATH);
  const prepared = await prepareRepair({
    ...options,
    manifest,
    writeManifest: false,
  });
  const result = await applyRepair({
    ...options,
    manifest,
    prepared,
    confirm: options.confirm ?? REPAIR_CONFIRMATION,
  });
  return { ...result, phase: "resume" };
}

export async function readRepairInvariantReport({
  manifest: suppliedManifest,
  manifestPath = DEFAULT_REPAIR_MANIFEST_PATH,
  transport,
} = {}) {
  const manifest = suppliedManifest ?? readRepairManifest(manifestPath);
  ensureManifestShape(manifest);
  const failures = [];
  const checks = {};
  const identityKeys = new Set();
  const identityEmails = new Set();
  const identityUsers = new Set();
  for (const identity of manifest.identityLedger) {
    if (
      identityKeys.has(identity.identityKey) ||
      identityEmails.has(identity.emailDigest) ||
      (identity.userId !== undefined && identityUsers.has(identity.userId))
    )
      failures.push("identity ledger is not one-to-one");
    identityKeys.add(identity.identityKey);
    identityEmails.add(identity.emailDigest);
    if (identity.userId !== undefined) identityUsers.add(identity.userId);
    if (identity.userId === undefined || identity.verified !== true)
      failures.push(`identity ${identity.identityKey} is unresolved or unverified`);
  }
  checks.identityLedger = failures.length === 0;
  checks.access =
    manifest.operations.filter((operation) => operation.kind === "membership").length === 3 &&
    manifest.operations.filter((operation) => operation.kind === "speaker-grant").length === 2 &&
    manifest.operations.filter((operation) => operation.table === "Speaker Profiles").length === 2;
  checks.foundation = [
    "Events",
    "CFP Forms",
    "Tracks",
    "Formats",
    "Rooms",
    "Session Settings",
  ].every((table) => manifest.operations.some((operation) => operation.table === table));
  const graph = manifest.graph;
  const proposals = graph?.proposals ?? [];
  const sessions = graph?.sessions ?? [];
  const publishedSessions = sessions
    .filter((session) => session.roomId !== null)
    .map((session) => session.id);
  const unscheduledSessions = sessions
    .filter((session) => session.roomId === null)
    .map((session) => session.id);
  checks.proposals =
    proposals.length === 3 && proposals.every((proposal) => proposal.status === "accepted");
  checks.sessions =
    sessions.length === 4 &&
    sessions.every((session) => session.status === "confirmed") &&
    publishedSessions.length === 3 &&
    unscheduledSessions.length === 1 &&
    sessions
      .filter((session) => session.roomId !== null)
      .every((session) => session.publicationStatus === "published") &&
    sessions
      .filter((session) => session.roomId === null)
      .every((session) => session.publicationStatus === "unpublished");
  const reviewPlanOperations = manifest.operations.filter(
    (operation) => operation.table === "Review Plans",
  );
  let reviewPlan;
  try {
    reviewPlan =
      reviewPlanOperations.length === 1
        ? JSON.parse(reviewPlanOperations[0].fields?.["Rounds JSON"] ?? "")
        : undefined;
  } catch {
    reviewPlan = undefined;
  }
  const reviewRounds = Array.isArray(reviewPlan?.rounds) ? reviewPlan.rounds : [];
  const initialReviewRound = reviewRounds.find((round) => round?.id === REVIEW_ROUND_ID);
  const finalReviewRound = reviewRounds.find((round) => round?.id === REVIEW_FINAL_ROUND_ID);
  const reviewerId =
    manifest.identityLedger.find((identity) => identity.identityKey === "reviewer-sam")?.userId ??
    "identity:reviewer-sam";
  const initialCriteria = initialReviewRound?.rubric?.criteria;
  const finalCriteria = finalReviewRound?.rubric?.criteria;
  const initialRubricValid =
    initialReviewRound?.rubric?.id === `${REVIEW_PLAN_ID}-rubric-initial` &&
    Array.isArray(initialCriteria) &&
    initialCriteria.some(
      (criterion) =>
        criterion?.id === "originality" &&
        criterion.weight === 2 &&
        (criterion.inputType ?? "numeric") === "numeric",
    ) &&
    initialCriteria.some(
      (criterion) =>
        criterion?.id === "relevance" &&
        criterion.weight === 1 &&
        (criterion.inputType ?? "numeric") === "numeric",
    ) &&
    initialCriteria.some(
      (criterion) => criterion?.id === "recommendation" && criterion.inputType === "dropdown",
    ) &&
    initialCriteria.some(
      (criterion) => criterion?.id === "comments" && criterion.inputType === "free_text",
    );
  const finalRubricValid =
    finalReviewRound?.rubric?.id === `${REVIEW_PLAN_ID}-rubric-final` &&
    finalReviewRound.rubric.id !== initialReviewRound?.rubric?.id &&
    Array.isArray(finalCriteria) &&
    finalCriteria.some(
      (criterion) => criterion?.id === "final-recommendation" && criterion.inputType === "dropdown",
    ) &&
    finalCriteria.some(
      (criterion) => criterion?.id === "program-notes" && criterion.inputType === "free_text",
    );
  checks.reviewRounds =
    reviewPlan?.status === "open" &&
    reviewRounds.length === 2 &&
    initialReviewRound?.name === "Initial Review" &&
    initialReviewRound.sequence === 1 &&
    initialReviewRound.opensAt === "2026-08-01T00:00:00.000Z" &&
    initialReviewRound.closesAt === REVIEW_ROUND_DATES.initialClosesAt &&
    initialReviewRound.blindReview === true &&
    initialReviewRound.anonymization === "double" &&
    initialReviewRound.reviewerPool?.reviewerIds?.length === 1 &&
    initialReviewRound.reviewerPool.reviewerIds[0] === reviewerId &&
    finalReviewRound?.name === "Final Review" &&
    finalReviewRound.sequence === 2 &&
    finalReviewRound.opensAt === REVIEW_ROUND_DATES.finalOpensAt &&
    finalReviewRound.closesAt === REVIEW_ROUND_DATES.finalClosesAt &&
    finalReviewRound.reviewerPool?.reviewerIds?.length === 0 &&
    typeof reviewPlan?.closesAt === "string" &&
    Date.parse(reviewPlan.closesAt) >= Date.parse(finalReviewRound.closesAt) &&
    initialRubricValid &&
    finalRubricValid;
  const assignmentOperations = manifest.operations.filter(
    (operation) => operation.table === "Evaluations",
  );
  const assignmentsPointToInitial =
    assignmentOperations.length === 3 &&
    assignmentOperations.every((operation) => {
      if (operation.fields?.["Round ID"] !== REVIEW_ROUND_ID) return false;
      try {
        return JSON.parse(operation.fields?.["Scores JSON"] ?? "").roundId === REVIEW_ROUND_ID;
      } catch {
        return false;
      }
    });
  const reviewerPoolOperations = manifest.operations.filter(
    (operation) => operation.kind === "reviewer-pool",
  );
  checks.reviewAssignments =
    assignmentsPointToInitial &&
    reviewPlanOperations.length === 1 &&
    reviewerPoolOperations.length === 1 &&
    reviewerPoolOperations[0].payload?.roundId === REVIEW_ROUND_ID &&
    reviewerPoolOperations[0].payload?.reviewerId === reviewerId &&
    assignmentOperations.every((operation) => operation.fields.Status === "assigned") &&
    checks.reviewRounds;
  checks.tasks =
    (graph?.tasks?.length ?? 0) === 10 &&
    graph.tasks.every((task) => task.status === "not_started" && task.completedAt === null);
  checks.crm =
    (graph?.communication?.activities?.length ?? 0) === 3 &&
    graph.communication.activities.every(
      (activity) => activity.status === "draft" && activity.sentAt === null,
    );
  if (!checks.access) failures.push("identity access or speaker profile bindings are incomplete");
  if (!checks.foundation) failures.push("foundation catalog is incomplete");
  const projectionSpeakers = graph?.projection?.speakers ?? [];
  const agendaSessionIds = new Set(graph?.agenda?.entries?.map((entry) => entry.sessionId) ?? []);
  const projectionIds = new Set(projectionSpeakers.flatMap((speaker) => speaker.sessionIds));
  checks.publicGraph =
    graph?.agenda?.entries?.length === 3 &&
    agendaSessionIds.size === 3 &&
    publishedSessions.every((sessionId) => agendaSessionIds.has(sessionId)) &&
    projectionSpeakers.length === 2 &&
    projectionIds.size === 3 &&
    projectionSpeakers.every((speaker) =>
      speaker.sessionIds.every((id) => publishedSessions.includes(id)),
    ) &&
    !projectionSpeakers.some((speaker) => speaker.sessionIds.includes(unscheduledSessions[0]));
  checks.scope =
    manifest.organizationId === CANONICAL_ORGANIZATION_ID &&
    manifest.eventId === CANONICAL_EVENT_ID;
  if (!checks.proposals) failures.push("canonical accepted proposal graph is incomplete");
  if (!checks.sessions)
    failures.push("session graph does not contain three placed and one unplaced confirmed session");
  if (!checks.reviewAssignments) failures.push("review plan or assignments are incomplete");
  if (!checks.tasks) failures.push("speaker task graph is incomplete");
  if (!checks.crm) failures.push("CRM acceptance activities are not drafts");
  if (!checks.publicGraph)
    failures.push("published agenda or speaker projection graph is incorrect");
  if (!checks.scope) failures.push("repair scope drifted");
  if (transport !== undefined) {
    for (const operation of manifest.operations) {
      const rows = await readOperation(transport, operation);
      if (rows.length !== 1) failures.push(`${operation.key} is missing or duplicated`);
      if (rows.length === 1 && immutableDrift(operation, rows[0]) !== undefined)
        failures.push(`${operation.key} has immutable drift`);
    }
  }
  return {
    version: REPAIR_VERSION,
    organizationId: manifest.organizationId,
    eventId: manifest.eventId,
    ok: failures.length === 0,
    checks,
    failures,
    counts: {
      identities: manifest.identityLedger.length,
      proposals: proposals.length,
      sessions: sessions.length,
      publishedSessions: publishedSessions.length,
      unscheduledSessions: unscheduledSessions.length,
      tasks: graph?.tasks?.length ?? 0,
      acceptanceActivities: graph?.communication?.activities?.length ?? 0,
    },
  };
}

export function assertRepairInvariants(report) {
  if (!report?.ok)
    fail("INVARIANT_FAILED", "The DevFlow repair invariant report is not sealed.", {
      failures: report?.failures ?? [],
    });
  return report;
}

export async function runRepair(options = {}) {
  const phase = options.phase ?? (options.resume ? "resume" : options.apply ? "apply" : "prepare");
  if (!REPAIR_PHASES.includes(phase)) fail("CONFIGURATION_ERROR", `Unknown repair phase ${phase}.`);
  if (phase === "invariants") return readRepairInvariantReport(options);
  if (phase === RESET_WORKFLOW_PHASE || phase === "reset") {
    const manifest = options.manifest ?? buildWorkflowResetManifest(options);
    if (options.resume === true) {
      return resumeWorkflowReset({ ...options, manifest });
    }
    const resetApply =
      options.dryRun === false ||
      options.apply === true ||
      (options.dryRun === undefined &&
        options.confirm === RESET_WORKFLOW_CONFIRMATION &&
        options.resume !== true);
    if (!resetApply) {
      return prepareWorkflowReset({ ...options, manifest });
    }
    const prepared = await prepareWorkflowReset({
      ...options,
      manifest,
      writeManifest: false,
    });
    return applyWorkflowReset({ ...options, manifest, prepared });
  }
  let manifest = options.manifest;
  let credentials = options.credentials;
  if (manifest === undefined) {
    const built = buildRepairManifest(options);
    manifest = built;
    credentials = credentials ?? built.credentials;
  }
  if (phase === "prepare") return prepareRepair({ ...options, manifest });
  const executionOptions = {
    ...options.options,
    ...(options.environment === undefined ? {} : { environment: options.environment }),
    ...(options.apiOrigin === undefined ? {} : { apiOrigin: options.apiOrigin }),
    ...(options.webOrigin === undefined ? {} : { webOrigin: options.webOrigin }),
    ...(options.fetchImplementation === undefined
      ? {}
      : { fetchImplementation: options.fetchImplementation }),
  };
  if (phase === "resume") {
    return resumeRepair({
      ...options,
      options: executionOptions,
      manifest,
      credentials,
      confirm: options.confirm,
    });
  }
  const prepared = await prepareRepair({ ...options, manifest, writeManifest: false });
  return applyRepair({
    ...options,
    options: executionOptions,
    manifest,
    prepared,
    credentials,
    confirm: options.confirm,
  });
}

function parseEnvironment(environment = process.env) {
  const name = String(environment.EVAL_ENVIRONMENT ?? environment.APP_ENV ?? "staging")
    .trim()
    .toLowerCase();
  if (!ENVIRONMENTS.has(name))
    fail("CONFIGURATION_ERROR", "EVAL_ENVIRONMENT must be local, staging, or production.");
  return name;
}

export function parseArguments(argv = []) {
  let phase = "prepare";
  let help = false;
  let confirm;
  let resetDryRunExplicit = false;
  let resetApplyExplicit = false;
  const result = {
    phase,
    dryRun: true,
    help,
    manifestPath: DEFAULT_REPAIR_MANIFEST_PATH,
    configPath: DEFAULT_REPAIR_CONFIG_PATH,
    credentialsPath: undefined,
    sourcePath: undefined,
    apiOrigin: undefined,
    baseId: undefined,
    accessToken: undefined,
    confirm,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--reset-workflow") {
      if (phase !== "prepare" && phase !== RESET_WORKFLOW_PHASE)
        fail("CONFIGURATION_ERROR", "Choose one repair phase.");
      phase = RESET_WORKFLOW_PHASE;
      result.dryRun = true;
    } else if (argument === "--dry-run" || argument === "--prepare") {
      if (phase === "apply" || phase === "resume")
        fail("CONFIGURATION_ERROR", "Choose one repair phase.");
      if (phase === RESET_WORKFLOW_PHASE) {
        if (resetApplyExplicit) fail("CONFIGURATION_ERROR", "Choose one repair phase.");
        resetDryRunExplicit = true;
      }
      phase = phase === RESET_WORKFLOW_PHASE ? RESET_WORKFLOW_PHASE : "prepare";
      result.dryRun = true;
    } else if (argument === "--apply") {
      if (phase === "resume") fail("CONFIGURATION_ERROR", "Choose one repair phase.");
      phase = phase === RESET_WORKFLOW_PHASE ? RESET_WORKFLOW_PHASE : "apply";
      if (phase === RESET_WORKFLOW_PHASE && resetDryRunExplicit)
        fail("CONFIGURATION_ERROR", "Choose one repair phase.");
      if (phase === RESET_WORKFLOW_PHASE) resetApplyExplicit = true;
      result.dryRun = false;
    } else if (argument === "--resume") {
      if (phase === "apply") fail("CONFIGURATION_ERROR", "Choose one repair phase.");
      phase = phase === RESET_WORKFLOW_PHASE ? RESET_WORKFLOW_PHASE : "resume";
      result.dryRun = false;
      result.resume = true;
    } else if (argument === "--invariants" || argument === "--report") {
      phase = "invariants";
      result.dryRun = true;
    } else if (argument === "--confirm") {
      const value = argv[index + 1];
      if (value === undefined) fail("CONFIGURATION_ERROR", "--confirm requires ai-engineer.");
      confirm = value;
      index += 1;
    } else if (
      argument === "--manifest" ||
      argument === "--config" ||
      argument === "--credentials" ||
      argument === "--source" ||
      argument === "--api-origin" ||
      argument === "--base-id" ||
      argument === "--access-token"
    ) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--"))
        fail("CONFIGURATION_ERROR", `${argument} requires a value.`);
      index += 1;
      if (argument === "--manifest") result.manifestPath = value;
      if (argument === "--config") result.configPath = value;
      if (argument === "--credentials") result.credentialsPath = value;
      if (argument === "--source") result.sourcePath = value;
      if (argument === "--api-origin") result.apiOrigin = value;
      if (argument === "--base-id") result.baseId = value;
      if (argument === "--access-token") result.accessToken = value;
    } else if (argument === "--help" || argument === "-h") {
      help = true;
    } else {
      fail("CONFIGURATION_ERROR", `Unknown argument ${argument}.`);
    }
  }
  const token = result.accessToken;
  delete result.accessToken;
  Object.defineProperty(result, "accessToken", {
    value: token,
    enumerable: false,
    configurable: true,
  });
  result.phase = phase;
  result.help = help;
  result.confirm = confirm;
  if (phase === RESET_WORKFLOW_PHASE) {
    if (confirm !== undefined && confirm !== RESET_WORKFLOW_CONFIRMATION) {
      fail(
        "RESET_CONFIRMATION_REQUIRED",
        `Workflow reset requires --confirm ${CANONICAL_ORGANIZATION_ID}.`,
      );
    }
    if (confirm === RESET_WORKFLOW_CONFIRMATION && !resetDryRunExplicit && !result.resume) {
      result.dryRun = false;
    }
    if (!result.dryRun && confirm !== RESET_WORKFLOW_CONFIRMATION) {
      fail(
        "RESET_CONFIRMATION_REQUIRED",
        `Workflow reset requires --confirm ${CANONICAL_ORGANIZATION_ID}.`,
      );
    }
  } else if ((phase === "apply" || phase === "resume") && confirm !== REPAIR_CONFIRMATION) {
    fail(
      "PRODUCTION_CONFIRMATION_REQUIRED",
      `Apply requires --confirm ${CANONICAL_ORGANIZATION_ID}.`,
    );
  }
  return result;
}

export const CLI_USAGE =
  "Usage: node scripts/eval/repair-devflow-production.mjs [--dry-run|--apply|--resume|--invariants|--reset-workflow] " +
  "[--confirm ai-engineer] [--manifest path] [--config path] [--credentials path]\n" +
  "  --dry-run, --prepare  Read and plan only (default).\n" +
  "  --apply               Apply the prepared manifest; requires --confirm ai-engineer.\n" +
  "  --resume              Re-read the manifest ledger and resume missing operations.\n" +
  "  --reset-workflow      Plan a destructive event workflow reset; apply with --confirm ai-engineer.\n" +
  "  --invariants          Produce a read-only invariant report.\n" +
  "  --credentials path    Read credential pairs without printing them.\n";

function readOptionalJson(pathValue) {
  if (pathValue === undefined) return {};
  try {
    return JSON.parse(readFileSync(isAbsolute(pathValue) ? pathValue : resolve(pathValue), "utf8"));
  } catch {
    fail("CONFIGURATION_ERROR", "An explicit repair configuration file could not be read.");
  }
}

export async function loadRepairCommandAdapter(environment = process.env, options = {}) {
  const spec = environment.EVAL_D1_COMMAND_ADAPTER ?? environment.EVAL_COMMAND_ADAPTER_MODULE;
  if (typeof spec === "string" && spec.trim().length > 0) {
    try {
      const moduleUrl = spec.startsWith("file:")
        ? spec
        : pathToFileURL(isAbsolute(spec) ? spec : resolve(spec)).href;
      const module = await import(moduleUrl);
      const adapter =
        module.default ?? module.commandAdapter ?? (await module.createCommandAdapter?.());
      if (adapter === undefined || adapter === null)
        fail("D1_ADAPTER_LOAD_FAILED", "The repair D1 command adapter could not be loaded.");
      return adapter;
    } catch (error) {
      if (error instanceof DevflowRepairError) throw error;
      fail("D1_ADAPTER_LOAD_FAILED", "The repair D1 command adapter could not be loaded.");
    }
  }
  const environmentName = String(environment.EVAL_ENVIRONMENT ?? environment.APP_ENV ?? "staging")
    .trim()
    .toLowerCase();
  if (environmentName !== "production") return undefined;
  const providerKeys = [
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_API_TOKEN",
    "D1_DATABASE_ID",
    "AIRTABLE_BASE_ID",
    "AIRTABLE_ACCESS_TOKEN",
  ];
  const configured = providerKeys.filter(
    (key) => typeof environment[key] === "string" && environment[key].trim().length > 0,
  );
  if (configured.length === 0) return undefined;
  if (configured.length !== providerKeys.length) {
    fail(
      "PRODUCTION_ADAPTER_CONFIGURATION",
      "Production repair requires the complete Cloudflare D1 and Airtable configuration.",
    );
  }
  return createProductionRepairAdapter({
    accountId: environment.CLOUDFLARE_ACCOUNT_ID,
    apiToken: environment.CLOUDFLARE_API_TOKEN,
    databaseId: environment.D1_DATABASE_ID,
    baseId: environment.AIRTABLE_BASE_ID,
    accessToken: environment.AIRTABLE_ACCESS_TOKEN,
    airtableApiOrigin: environment.AIRTABLE_API_ORIGIN,
    fetchImplementation: options.fetchImplementation,
  });
}
async function main() {
  const argumentsValue = parseArguments(process.argv.slice(2));
  if (argumentsValue.help) {
    console.log(CLI_USAGE);
    return;
  }
  const configInput =
    argumentsValue.configPath !== undefined && existsSync(argumentsValue.configPath)
      ? readOptionalJson(argumentsValue.configPath)
      : {};
  const credentialsInput =
    argumentsValue.credentialsPath !== undefined && existsSync(argumentsValue.credentialsPath)
      ? readOptionalJson(argumentsValue.credentialsPath)
      : {};
  const persistedManifest =
    argumentsValue.phase === "prepare" ||
    (argumentsValue.phase === RESET_WORKFLOW_PHASE && argumentsValue.dryRun)
      ? undefined
      : existsSync(argumentsValue.manifestPath)
        ? readOptionalJson(argumentsValue.manifestPath)
        : argumentsValue.phase === "apply" ||
            (argumentsValue.phase === RESET_WORKFLOW_PHASE && !argumentsValue.resume)
          ? undefined
          : fail("MANIFEST_NOT_FOUND", "The prepared repair manifest could not be read.");
  const environment = parseEnvironment(process.env);
  const commandAdapter = await loadRepairCommandAdapter(process.env);
  const applicationApiOrigin =
    argumentsValue.apiOrigin ?? process.env.EVAL_API_ORIGIN ?? process.env.API_ORIGIN;
  const applicationWebOrigin = process.env.EVAL_WEB_ORIGIN ?? process.env.WEB_ORIGIN;
  const configuredAirtableOrigin = process.env.AIRTABLE_API_ORIGIN ?? DEFAULT_AIRTABLE_API_ORIGIN;
  const configuredBaseId = argumentsValue.baseId ?? process.env.AIRTABLE_BASE_ID;
  const configuredAccessToken = argumentsValue.accessToken ?? process.env.AIRTABLE_ACCESS_TOKEN;
  const airtable =
    commandAdapter?.airtable ??
    (configuredBaseId !== undefined && configuredAccessToken !== undefined
      ? createAirtableRepairTransport({
          apiOrigin: configuredAirtableOrigin,
          baseId: configuredBaseId,
          accessToken: configuredAccessToken,
        })
      : undefined);
  const transport = createRepairTransport({ airtable, commandAdapter });
  const result = await runRepair({
    dryRun: argumentsValue.dryRun,
    ...(argumentsValue.phase === "apply" ? { apply: true } : {}),
    ...(argumentsValue.resume ? { resume: true } : {}),
    phase: argumentsValue.phase,
    manifestPath: argumentsValue.manifestPath,
    ...(persistedManifest === undefined ? {} : { manifest: persistedManifest }),
    sourcePath: argumentsValue.sourcePath,
    seedConfigPath: process.env.EVAL_SEED_CONFIG_PATH,
    identities: configInput.identities,
    credentials: credentialsInput.credentials ?? credentialsInput,
    transport,
    environment,
    apiOrigin: applicationApiOrigin,
    webOrigin: applicationWebOrigin,
    confirm: argumentsValue.confirm,
  });
  console.log(JSON.stringify(result, null, 2));
}

const entryPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
const modulePath = fileURLToPath(import.meta.url);
if (entryPath !== undefined && entryPath === modulePath) {
  main().catch((error) => {
    if (error instanceof DevflowRepairError) console.error(error.message);
    else console.error("DevFlow production repair failed.");
    process.exitCode = 1;
  });
}
