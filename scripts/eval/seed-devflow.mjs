import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_SOURCE_PATH = "/tmp/killmysaas-evals/fixtures/sample-data.json";
export const DEFAULT_SEED_CONFIG_PATH = fileURLToPath(
  new URL("./devflow-fixture.json", import.meta.url),
);
export const DEFAULT_AIRTABLE_API_ORIGIN = "https://api.airtable.com";
export const CANONICAL_ORGANIZATION_ID = "ai-engineer";
export const PRODUCTION_CONFIRMATION = "I_UNDERSTAND_PRODUCTION_DEVFLOW_SEEDING";
export const PRODUCTION_CONFIRMATION_TOKEN = PRODUCTION_CONFIRMATION;
export const FULL_CHAIN_MODE = "full-chain";
export const SUBSET_FALLBACK_MODE = "subset-fallback";
export const CHAIN_CONTEXT_VERSION = "chain-context:v1";
export const CHAIN_CONTEXT_KEYS = Object.freeze([
  "submissionId",
  "participantIds",
  "reviewPlanId",
  "assignmentIds",
  "sessionIds",
  "taskIds",
  "assetFamilyIds",
  "embedConfigurationId",
  "crmContactIds",
]);
export const FOUNDATION_TABLES = Object.freeze([
  "Events",
  "CFP Forms",
  "Tracks",
  "Formats",
  "Rooms",
  "Session Settings",
  "Email Templates",
]);
export const SCENARIO_OWNED_TABLES = Object.freeze([
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
const CHAIN_CONTEXT_ARRAY_KEYS = new Set([
  "participantIds",
  "assignmentIds",
  "sessionIds",
  "taskIds",
  "assetFamilyIds",
  "crmContactIds",
]);
const APPLICATION_ID_PATTERN = /^rec[a-zA-Z0-9]{10,}$/u;

function applicationId(value, label) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    APPLICATION_ID_PATTERN.test(value.trim())
  ) {
    throw new DevflowSeedError(
      "CHAIN_CONTEXT_INVALID",
      `${label} must be a non-provider application ID.`,
    );
  }
  return value.trim();
}

export function emptyChainContext() {
  return {
    submissionId: null,
    participantIds: [],
    reviewPlanId: null,
    assignmentIds: [],
    sessionIds: [],
    taskIds: [],
    assetFamilyIds: [],
    embedConfigurationId: null,
    crmContactIds: [],
  };
}

export function validateChainContext(value, options = {}) {
  if (!isObject(value)) {
    throw new DevflowSeedError("CHAIN_CONTEXT_INVALID", "Chain context must be an object.");
  }
  const keys = Object.keys(value);
  if (
    keys.length !== CHAIN_CONTEXT_KEYS.length ||
    keys.some((key) => !CHAIN_CONTEXT_KEYS.includes(key))
  ) {
    throw new DevflowSeedError(
      "CHAIN_CONTEXT_INVALID",
      `Chain context keys must be exactly ${CHAIN_CONTEXT_KEYS.join(", ")}.`,
    );
  }
  const context = {};
  for (const key of CHAIN_CONTEXT_KEYS) {
    const current = value[key];
    if (CHAIN_CONTEXT_ARRAY_KEYS.has(key)) {
      if (!Array.isArray(current)) {
        throw new DevflowSeedError("CHAIN_CONTEXT_INVALID", `${key} must be an array.`);
      }
      const ids = current.map((entry) => applicationId(entry, key));
      if (new Set(ids).size !== ids.length) {
        throw new DevflowSeedError("CHAIN_CONTEXT_INVALID", `${key} must not contain duplicates.`);
      }
      context[key] = ids;
      continue;
    }
    if (current !== null) context[key] = applicationId(current, key);
    else context[key] = null;
  }
  if (options.allowEmpty !== true && context.submissionId === null) {
    throw new DevflowSeedError("CHAIN_CONTEXT_INVALID", "submissionId is required.");
  }
  return context;
}

export function mergeChainContext(base, patch) {
  const current = validateChainContext(base ?? emptyChainContext(), { allowEmpty: true });
  const update = isObject(patch) ? patch : {};
  const merged = { ...current };
  for (const key of CHAIN_CONTEXT_KEYS) {
    if (Object.hasOwn(update, key)) merged[key] = clone(update[key]);
  }
  return validateChainContext(merged, { allowEmpty: true });
}

const ENVIRONMENTS = new Set(["local", "staging", "production"]);
export const APPLICATION_ID_FIELD = "Application ID";
const DEFAULT_FETCH = globalThis.fetch;

export class DevflowSeedError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DevflowSeedError";
    this.code = code;
  }
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DevflowSeedError("CONFIGURATION_ERROR", `${label} is required.`);
  }
  return value.trim();
}

function clone(value) {
  return structuredClone(value);
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

export function stableId(eventId, kind, value) {
  return `${eventId}-${kind}-${slug(value)}`;
}

function validDate(value, label) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new DevflowSeedError("CONFIGURATION_ERROR", `${label} must be a valid date.`);
  }
  return date;
}

function isoDate(value, label) {
  return validDate(value, label).toISOString();
}

export function parseDuration(format) {
  const match = /\((\d+)\s*min\)/iu.exec(String(format));
  return match === null ? 30 : Number(match[1]);
}

function firstSubmission(fixture, titlePrefix) {
  const match = fixture.submissions.find((submission) => submission.title.startsWith(titlePrefix));
  if (match !== undefined) return match;
  const fallback = fixture.submissions[0];
  if (fallback === undefined) {
    throw new DevflowSeedError("FIXTURE_INVALID", "The official fixture contains no submissions.");
  }
  return fallback;
}

export function sourceIdentity(fixture, key) {
  const identity = fixture.identities?.[key];
  if (!isObject(identity)) {
    throw new DevflowSeedError(
      "FIXTURE_INVALID",
      `The official fixture is missing the ${key} identity.`,
    );
  }
  return identity;
}

export function validateOfficialFixture(fixture) {
  if (!isObject(fixture) || !isObject(fixture.event)) {
    throw new DevflowSeedError("FIXTURE_INVALID", "The official fixture has no event object.");
  }
  if (!Array.isArray(fixture.event.tracks) || !Array.isArray(fixture.event.session_formats)) {
    throw new DevflowSeedError(
      "FIXTURE_INVALID",
      "The official fixture has no track and format lists.",
    );
  }
  if (!Array.isArray(fixture.event.rooms) || !Array.isArray(fixture.submissions)) {
    throw new DevflowSeedError(
      "FIXTURE_INVALID",
      "The official fixture has no room and submission lists.",
    );
  }
  sourceIdentity(fixture, "speaker");
  sourceIdentity(fixture, "speaker2");
  return fixture;
}

/** Read the evaluator's official fixture. No fixture data is printed by this module. */
export function loadFixture(sourcePath = DEFAULT_SOURCE_PATH) {
  let text;
  try {
    text = readFileSync(sourcePath, "utf8");
  } catch {
    throw new DevflowSeedError(
      "FIXTURE_READ_FAILED",
      "The official evaluator fixture could not be read.",
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DevflowSeedError(
      "FIXTURE_INVALID",
      "The official evaluator fixture is not valid JSON.",
    );
  }
  return validateOfficialFixture(parsed);
}

export function loadSeedConfig(configPath = DEFAULT_SEED_CONFIG_PATH) {
  let text;
  try {
    text = readFileSync(configPath, "utf8");
  } catch {
    throw new DevflowSeedError(
      "CONFIGURATION_ERROR",
      "The DevFlow seed configuration could not be read.",
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DevflowSeedError(
      "CONFIGURATION_ERROR",
      "The DevFlow seed configuration is not valid JSON.",
    );
  }
  if (!isObject(parsed)) {
    throw new DevflowSeedError(
      "CONFIGURATION_ERROR",
      "The DevFlow seed configuration must be an object.",
    );
  }
  return validateSeedConfig(parsed);
}
export function validateSeedConfig(config) {
  if (!isObject(config)) {
    throw new DevflowSeedError(
      "CONFIGURATION_ERROR",
      "The DevFlow seed configuration must be an object.",
    );
  }
  if (
    config.organizationId !== CANONICAL_ORGANIZATION_ID ||
    config.eventId !== "devflow-conf-2027"
  ) {
    throw new DevflowSeedError("SCOPE_MISMATCH", "The DevFlow fixture scope is immutable.");
  }
  const foundation = config.foundation;
  if (
    !isObject(foundation) ||
    JSON.stringify(foundation.tables) !== JSON.stringify([...FOUNDATION_TABLES]) ||
    JSON.stringify(foundation.scenarioOwnedTables) !== JSON.stringify([...SCENARIO_OWNED_TABLES])
  ) {
    throw new DevflowSeedError(
      "CONFIGURATION_ERROR",
      "The DevFlow fixture foundation and scenario-owned table manifest is invalid.",
    );
  }
  const chainKeys = config.chainContext?.keys;
  if (
    config.chainContext?.version !== CHAIN_CONTEXT_VERSION ||
    JSON.stringify(chainKeys) !== JSON.stringify(CHAIN_CONTEXT_KEYS)
  ) {
    throw new DevflowSeedError(
      "CONFIGURATION_ERROR",
      "The DevFlow fixture chain context manifest is invalid.",
    );
  }
  const agendaFoundation = config.subsetFallback?.agendaFoundation;
  if (
    !isObject(agendaFoundation) ||
    !Array.isArray(agendaFoundation.personas) ||
    !Array.isArray(agendaFoundation.sessions) ||
    agendaFoundation.personas.length === 0 ||
    agendaFoundation.sessions.length === 0
  ) {
    throw new DevflowSeedError(
      "CONFIGURATION_ERROR",
      "The agenda fallback must declare dedicated personas and sessions.",
    );
  }
  const personaIds = new Set();
  for (const persona of agendaFoundation.personas) {
    if (
      !isObject(persona) ||
      typeof persona.id !== "string" ||
      typeof persona.name !== "string" ||
      typeof persona.email !== "string"
    ) {
      throw new DevflowSeedError(
        "CONFIGURATION_ERROR",
        "Agenda fallback personas must have dedicated IDs, names, and emails.",
      );
    }
    if (personaIds.has(persona.id)) {
      throw new DevflowSeedError(
        "CONFIGURATION_ERROR",
        "Agenda fallback persona IDs must be unique.",
      );
    }
    personaIds.add(persona.id);
  }
  const titles = new Set();
  for (const session of agendaFoundation.sessions) {
    if (
      !isObject(session) ||
      typeof session.title !== "string" ||
      typeof session.personaId !== "string" ||
      !personaIds.has(session.personaId)
    ) {
      throw new DevflowSeedError(
        "CONFIGURATION_ERROR",
        "Agenda fallback sessions must reference dedicated personas.",
      );
    }
    if (titles.has(session.title)) {
      throw new DevflowSeedError(
        "CONFIGURATION_ERROR",
        "Agenda fallback session titles must be unique.",
      );
    }
    titles.add(session.title);
  }
  return config;
}

function environmentObject(options = {}) {
  if (isObject(options.env)) return options.env;
  if (isObject(options.environment)) return options.environment;
  return process.env;
}

/**
 * Require an explicit evaluation environment and the two Airtable credentials.
 * Organization and event IDs are fixed by the evaluator contract; optional env
 * copies are checked rather than used as overrides.
 */
export function parseSeedEnvironment(environment = process.env, overrides = {}) {
  const envName = String(
    overrides.environment ??
      environment.EVAL_ENVIRONMENT ??
      environment.TARGET_ENVIRONMENT ??
      environment.APP_ENV ??
      "",
  )
    .trim()
    .toLowerCase();
  if (!ENVIRONMENTS.has(envName)) {
    throw new DevflowSeedError(
      "CONFIGURATION_ERROR",
      "EVAL_ENVIRONMENT must be local, staging, or production.",
    );
  }
  const accessToken = nonEmpty(
    overrides.accessToken ?? environment.AIRTABLE_ACCESS_TOKEN,
    "AIRTABLE_ACCESS_TOKEN",
  );
  const baseId = nonEmpty(overrides.baseId ?? environment.AIRTABLE_BASE_ID, "AIRTABLE_BASE_ID");
  const confirmation =
    overrides.productionConfirmation ??
    environment.EVAL_PRODUCTION_CONFIRMATION ??
    environment.EVAL_CONFIRM_PRODUCTION ??
    environment.EVAL_PRODUCTION_CONFIRMATION_TOKEN;
  if (envName === "production" && confirmation !== PRODUCTION_CONFIRMATION) {
    throw new DevflowSeedError(
      "PRODUCTION_CONFIRMATION_REQUIRED",
      `Production seeding requires EVAL_PRODUCTION_CONFIRMATION=${PRODUCTION_CONFIRMATION}.`,
    );
  }
  const organizationId =
    typeof environment.EVAL_ORGANIZATION_ID === "string"
      ? environment.EVAL_ORGANIZATION_ID.trim()
      : undefined;
  if (organizationId !== undefined && organizationId !== CANONICAL_ORGANIZATION_ID) {
    throw new DevflowSeedError(
      "SCOPE_MISMATCH",
      `EVAL_ORGANIZATION_ID must be ${CANONICAL_ORGANIZATION_ID}.`,
    );
  }
  const eventId =
    typeof environment.EVAL_EVENT_ID === "string" ? environment.EVAL_EVENT_ID.trim() : undefined;
  if (eventId !== undefined && eventId !== "devflow-conf-2027") {
    throw new DevflowSeedError("SCOPE_MISMATCH", "EVAL_EVENT_ID must be devflow-conf-2027.");
  }
  return {
    environment: envName,
    accessToken,
    baseId,
    productionConfirmation: confirmation,
    apiOrigin:
      overrides.apiOrigin ?? environment.AIRTABLE_API_ORIGIN ?? DEFAULT_AIRTABLE_API_ORIGIN,
  };
}

function normalizeMode(mode) {
  const normalized = String(mode ?? FULL_CHAIN_MODE)
    .trim()
    .toLowerCase();
  if (normalized === FULL_CHAIN_MODE || normalized === "full" || normalized === "ordered") {
    return FULL_CHAIN_MODE;
  }
  if (normalized === SUBSET_FALLBACK_MODE || normalized === "subset" || normalized === "fallback") {
    return SUBSET_FALLBACK_MODE;
  }
  throw new DevflowSeedError(
    "CONFIGURATION_ERROR",
    "Seed mode must be full-chain or subset-fallback.",
  );
}

function normalizeOrigin(value) {
  let parsed;
  try {
    parsed = new URL(nonEmpty(value, "AIRTABLE_API_ORIGIN"));
  } catch {
    throw new DevflowSeedError(
      "CONFIGURATION_ERROR",
      "AIRTABLE_API_ORIGIN must be an absolute URL.",
    );
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new DevflowSeedError(
      "CONFIGURATION_ERROR",
      "AIRTABLE_API_ORIGIN must contain only an origin.",
    );
  }
  if (parsed.protocol !== "https:") {
    throw new DevflowSeedError("CONFIGURATION_ERROR", "AIRTABLE_API_ORIGIN must use HTTPS.");
  }
  return parsed.origin;
}

export function target(table, applicationId, fields) {
  if (typeof table !== "string" || typeof applicationId !== "string" || !isObject(fields)) {
    throw new DevflowSeedError("SEED_INVALID", "A seed record has an invalid target shape.");
  }
  if (fields[APPLICATION_ID_FIELD] !== applicationId) {
    throw new DevflowSeedError(
      "SEED_INVALID",
      `The ${table} seed record has an unstable Application ID.`,
    );
  }
  return Object.freeze({ table, id: applicationId, applicationId, fields: clone(fields) });
}

function eventPayload(fixture, config, eventId, organizationId, opensAt, closesAt) {
  const sourceEvent = fixture.event;
  const event = {
    id: eventId,
    tenantId: organizationId,
    organizationId,
    version: 1,
    slug: eventId,
    name: sourceEvent.name,
    tagline: sourceEvent.tagline,
    dates: sourceEvent.dates,
    location: sourceEvent.location,
    venue: sourceEvent.location,
    description: sourceEvent.description,
    tracks: [...sourceEvent.tracks],
    sessionFormats: [...sourceEvent.session_formats],
    rooms: [...sourceEvent.rooms],
    timezone: config.timezone,
    timeZone: config.timezone,
    startsAt: config.event.startsAt,
    endsAt: config.event.endsAt,
    opensAt,
    closesAt,
    cfpSettings: { enabled: true, opensAt, closesAt },
    embedConfigurations: [],
    defaultCalendarSettings: {
      durationMinutes: 30,
      timeZone: config.timezone,
      location: sourceEvent.location,
    },
  };
  return event;
}

function formPayload(fixture, config, eventId, organizationId, opensAt, closesAt) {
  const sourceEvent = fixture.event;
  const tracks = [...sourceEvent.tracks];
  const formats = [...sourceEvent.session_formats];
  const formId = config.cfp.formId;
  const sections = [
    { id: "session", title: "Session", description: "Tell us about your session.", order: 0 },
    {
      id: "participants",
      title: "Participants",
      description: "Add every person presenting.",
      order: 1,
    },
  ];
  const field = (input) => ({ options: [], ...input });
  const submissionFields = [
    field({
      id: "field-title",
      sectionId: "session",
      key: "title",
      label: "Session title",
      kind: "text",
      required: true,
    }),
    field({
      id: "field-abstract",
      sectionId: "session",
      key: "abstract",
      label: "Abstract",
      kind: "rich_text",
      required: true,
    }),
    field({
      id: "field-track",
      sectionId: "session",
      key: "track",
      label: "Track",
      kind: "select",
      required: true,
      options: tracks,
    }),
    field({
      id: "field-format",
      sectionId: "session",
      key: "format",
      label: "Format",
      kind: "select",
      required: true,
      options: formats,
    }),
    field({
      id: "field-speaker-bio",
      sectionId: "session",
      key: "speaker_bio",
      label: "Speaker bio",
      kind: "rich_text",
      required: false,
    }),
    field({
      id: config.cfp.keyTakeawayFieldId,
      sectionId: "session",
      key: "key_takeaway",
      label: "Key takeaway",
      kind: "text",
      required: true,
    }),
    field({
      id: config.cfp.audienceLevelFieldId,
      sectionId: "session",
      key: "audience_level",
      label: "Audience level",
      kind: "select",
      required: false,
      options: ["Beginner", "Intermediate", "Advanced"],
    }),
    field({
      id: config.cfp.workshopPrerequisitesFieldId,
      sectionId: "session",
      key: "workshop_prerequisites",
      label: "Workshop prerequisites",
      kind: "rich_text",
      required: false,
    }),
  ];
  const participantFields = [
    field({
      id: "participant-first-name",
      sectionId: "participants",
      key: "firstName",
      label: "First name",
      kind: "text",
      required: true,
    }),
    field({
      id: "participant-last-name",
      sectionId: "participants",
      key: "lastName",
      label: "Last name",
      kind: "text",
      required: true,
    }),
    field({
      id: "participant-email",
      sectionId: "participants",
      key: "email",
      label: "Email",
      kind: "email",
      required: true,
    }),
    field({
      id: "participant-biography",
      sectionId: "participants",
      key: "biography",
      label: "Biography",
      kind: "rich_text",
      required: false,
    }),
  ];
  const workshopFormat = formats.find((format) => format.startsWith("Workshop"));
  if (workshopFormat === undefined) {
    throw new DevflowSeedError("FIXTURE_INVALID", "The official fixture has no workshop format.");
  }
  const form = {
    id: formId,
    tenantId: organizationId,
    eventId,
    name: `${sourceEvent.name} Call for Papers`,
    version: 1,
    status: "published",
    welcomeContent: `Submit a proposal for ${sourceEvent.name}.`,
    settings: {
      speakerLimit: 3,
      maxSubmissionsPerAccount: config.cfp.maxSubmissionsPerAccount ?? 3,
      remindersEnabled: true,
      adminNotificationsEnabled: true,
      confirmationMessage: "Your proposal has been received.",
      successContent:
        "Thank you for submitting. Continue to your speaker portal to track status and complete tasks.",
    },
    sections,
    submissionFields,
    participantFields,
    rules: [
      {
        id: config.cfp.workshopRuleId,
        priority: 10,
        when: {
          type: "group",
          operator: "all",
          conditions: [
            {
              type: "predicate",
              fieldKey: "format",
              operator: "equals",
              value: workshopFormat,
            },
          ],
        },
        actions: [{ type: "show_field", fieldKey: "workshop_prerequisites" }],
      },
    ],
    submissionWindow: { opensAt, closesAt, closeDate: config.cfp.closeDate },
  };
  return form;
}

function buildTrackTarget(eventId, organizationId, name) {
  const id = stableId(eventId, "track", name);
  const value = {
    id,
    tenantId: organizationId,
    organizationId,
    eventId,
    name,
    description: "",
    version: 1,
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    createdBy: "evaluator-seed",
    updatedBy: "evaluator-seed",
    history: [],
  };
  return target("Tracks", id, {
    [APPLICATION_ID_FIELD]: id,
    "Organization ID": organizationId,
    "Event ID": eventId,
    Name: name,
    Description: "",
    Status: "active",
    "Metadata JSON": json(value),
    "Settings JSON": json({ id, tenantId: organizationId, eventId, name, status: "active" }),
    Version: 1,
  });
}

function buildFormatTarget(eventId, organizationId, name) {
  const id = stableId(eventId, "format", name);
  const value = {
    id,
    tenantId: organizationId,
    organizationId,
    eventId,
    name,
    description: "",
    version: 1,
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    createdBy: "evaluator-seed",
    updatedBy: "evaluator-seed",
    history: [],
  };
  return target("Formats", id, {
    [APPLICATION_ID_FIELD]: id,
    "Organization ID": organizationId,
    "Event ID": eventId,
    Name: name,
    Description: "",
    Status: "active",
    "Settings JSON": json({ ...value, status: "active" }),
    Version: 1,
  });
}

function buildRoomTarget(fixture, config, eventId, organizationId, name) {
  const id = stableId(eventId, "room", name);
  const value = {
    id,
    tenantId: organizationId,
    organizationId,
    eventId,
    name,
    capacity: 500,
    resources: [],
    resourceIds: [],
    version: 1,
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    createdBy: "evaluator-seed",
    updatedBy: "evaluator-seed",
    history: [],
  };
  return target("Rooms", id, {
    [APPLICATION_ID_FIELD]: id,
    "Organization ID": organizationId,
    "Event ID": eventId,
    Name: name,
    Description: "",
    Capacity: 500,
    Location: fixture.event.location,
    "Metadata JSON": json({ id, eventId, name }),
    "Resources JSON": json([]),
    "Resource IDs JSON": json([]),
    Status: "active",
    "Settings JSON": json({ ...value, timeZone: config.timezone }),
    Version: 1,
  });
}

function buildSessionSettingsTarget(config, eventId, organizationId) {
  const id = config.settings.id;
  const value = {
    id,
    tenantId: organizationId,
    organizationId,
    eventId,
    statuses: [...config.settings.statuses],
    agendaEligibleStatuses: [...config.settings.agendaEligibleStatuses],
    version: 1,
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    createdBy: "evaluator-seed",
    updatedBy: "evaluator-seed",
    history: [],
  };
  return target("Session Settings", id, {
    [APPLICATION_ID_FIELD]: id,
    "Organization ID": organizationId,
    "Event ID": eventId,
    Status: "active",
    "Statuses JSON": json(value.statuses),
    "Agenda Eligible Statuses JSON": json(value.agendaEligibleStatuses),
    "Settings JSON": json(value),
    Version: 1,
  });
}
function buildEmailTemplateTarget(fixture, config, eventId, organizationId) {
  const communication = fixture.communications ?? {};
  const id = config.repair?.communication?.templateId ?? `${eventId}:communication:acceptance`;
  const subject =
    communication.acceptance_subject ?? `Your session has been accepted to ${fixture.event.name}`;
  const body =
    communication.acceptance_body ??
    "Hi {speaker_name}, congratulations! Your session '{talk_title}' has been accepted.";
  const value = {
    id,
    tenantId: organizationId,
    organizationId,
    eventId,
    name: `${fixture.event.name} acceptance`,
    purpose: "decision",
    version: 1,
    status: "draft",
    sender: "speakers@sessionboard.namuh.co",
    subject,
    html: body,
    text: body,
    variables: ["speaker_name", "talk_title"],
    createdBy: "evaluator-seed",
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    approvedBy: null,
    approvedAt: null,
  };
  return target("Email Templates", id, {
    [APPLICATION_ID_FIELD]: id,
    "Organization ID": organizationId,
    "Event ID": eventId,
    Name: value.name,
    Purpose: value.purpose,
    Status: value.status,
    Sender: value.sender,
    Subject: value.subject,
    HTML: value.html,
    Text: value.text,
    "Variables JSON": json(value.variables),
    "Settings JSON": json(value),
    Version: value.version,
  });
}

function reviewPlanPayload(config, eventId, organizationId) {
  const initialRoundId = `${config.subsetFallback.reviewPlanId}-round-initial`;
  return {
    id: config.subsetFallback.reviewPlanId,
    tenantId: organizationId,
    eventId,
    name: "Initial Review",
    status: "active",
    blindReview: true,
    closesAt: "2026-10-15T23:59:59.000Z",
    assignmentRule: {
      reviewsPerSubmission: 1,
      maxAssignmentsPerReviewer: 5,
      autoDistribute: false,
    },
    rounds: [
      {
        id: initialRoundId,
        name: "Initial Review",
        sequence: 1,
        opensAt: "2026-08-01T00:00:00.000Z",
        closesAt: "2026-10-15T23:59:59.000Z",
        blindReview: true,
        anonymization: "double",
        reviewerPool: { name: "Initial Review pool", reviewerIds: [] },
        rubric: {
          id: `${config.subsetFallback.reviewPlanId}-rubric-initial`,
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
    ],
    reviewerProjection: { visibleFieldIds: [], visibleFileIds: [] },
    version: 1,
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
  };
}

function buildReviewPlanTarget(config, eventId, organizationId) {
  const plan = reviewPlanPayload(config, eventId, organizationId);
  return target("Review Plans", plan.id, {
    [APPLICATION_ID_FIELD]: plan.id,
    Name: plan.name,
    Status: "active",
    "Rounds JSON": json(plan),
    Version: 1,
  });
}

function localSessionTarget({
  eventId,
  organizationId,
  session,
  roomId,
  trackId,
  formatId,
  startsAt,
  endsAt,
}) {
  const value = {
    ...session,
    tenantId: organizationId,
    organizationId,
    eventId,
    roomId,
    trackId,
    trackIds: [trackId],
    formatId,
    tagIds: [],
    resourceIds: [],
    speakerIds: [...session.speakerIds],
    speakerRoster: [...session.speakerRoster],
    startsAt,
    endsAt,
    timeZone: "America/Los_Angeles",
    version: 1,
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    createdBy: "evaluator-subset-fallback",
    updatedBy: "evaluator-subset-fallback",
    history: [],
  };
  return target("Sessions", value.id, {
    [APPLICATION_ID_FIELD]: value.id,
    "Organization ID": organizationId,
    "Event ID": eventId,
    Title: value.title,
    Description: value.description,
    Status: "confirmed",
    Format: value.format,
    "Duration Minutes": value.durationMinutes,
    "Participant IDs JSON": json(value.speakerIds),
    "Speaker IDs JSON": json(value.speakerIds),
    "Speaker Roster JSON": json(value.speakerRoster),
    "Track IDs JSON": json(value.trackIds),
    "Format ID": formatId,
    "Starts At": startsAt,
    "Ends At": endsAt,
    "Time Zone": value.timeZone,
    "Capacity Required": value.capacityRequired,
    "Metadata JSON": json(value),
    "Settings JSON": json({ roomId, trackId, formatId, publicationStatus: "published" }),
    "History JSON": json([]),
    Version: 1,
  });
}

function publicEventProjection(fixture, config, eventId) {
  const dates = /(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/u.exec(fixture.event.dates);
  if (dates === null) {
    throw new DevflowSeedError(
      "FIXTURE_INVALID",
      "The official fixture has no parseable event date range.",
    );
  }
  return {
    slug: eventId,
    name: fixture.event.name,
    timeZone: config.timezone,
    startsOn: dates[1],
    endsOn: dates[2],
    venueName: fixture.event.location,
  };
}

function buildSubsetTargets(
  fixture,
  config,
  eventId,
  organizationId,
  formatsByName,
  tracksByName,
  roomsByName,
) {
  const agendaFoundation = config.subsetFallback?.agendaFoundation;
  if (
    !isObject(agendaFoundation) ||
    !Array.isArray(agendaFoundation.personas) ||
    !Array.isArray(agendaFoundation.sessions)
  ) {
    throw new DevflowSeedError(
      "CONFIGURATION_ERROR",
      "The agenda fallback must declare dedicated personas and sessions.",
    );
  }
  const personasById = new Map(agendaFoundation.personas.map((persona) => [persona.id, persona]));
  const resolveRoom = (hint, fallbackIndex) => {
    const roomName =
      fixture.event.rooms.find((room) => (hint ? room.includes(hint) : false)) ??
      fixture.event.rooms[fallbackIndex] ??
      fixture.event.rooms[0];
    return { name: roomName, id: roomsByName.get(roomName) };
  };
  const sessions = agendaFoundation.sessions.map((entry, index) => {
    const persona = personasById.get(entry.personaId);
    const trackName =
      entry.track ?? fixture.event.tracks[index % Math.max(fixture.event.tracks.length, 1)];
    const formatName =
      entry.format ??
      fixture.event.session_formats[index % Math.max(fixture.event.session_formats.length, 1)];
    const room = resolveRoom(entry.roomHint, index);
    const trackId = tracksByName.get(trackName);
    const formatId = formatsByName.get(formatName);
    if (
      persona === undefined ||
      room.id === undefined ||
      trackId === undefined ||
      formatId === undefined
    ) {
      throw new DevflowSeedError(
        "FIXTURE_INVALID",
        `The agenda fallback could not resolve its dedicated session ${entry.title}.`,
      );
    }
    const participantId = stableId(eventId, "agenda-participant", persona.id);
    const sessionId = stableId(eventId, "agenda-session", entry.title);
    const formatKind = formatName.startsWith("Lightning") ? "other" : "talk";
    return localSessionTarget({
      eventId,
      organizationId,
      roomId: room.id,
      trackId,
      formatId,
      startsAt: entry.startsAt,
      endsAt: entry.endsAt,
      session: {
        id: sessionId,
        title: entry.title,
        description: `Dedicated agenda foundation session presented by ${persona.name}.`,
        status: "confirmed",
        format: formatKind,
        durationMinutes: parseDuration(formatName),
        capacityRequired: 1,
        speakerIds: [participantId],
        speakerRoster: [{ id: participantId, role: "speaker" }],
      },
    });
  });
  const entries = sessions.map((sessionTarget, index) => {
    const session = JSON.parse(sessionTarget.fields["Metadata JSON"]);
    const configured = agendaFoundation.sessions[index];
    const persona = personasById.get(configured.personaId);
    const trackName =
      configured.track ?? fixture.event.tracks[index % Math.max(fixture.event.tracks.length, 1)];
    const formatName =
      configured.format ??
      fixture.event.session_formats[index % Math.max(fixture.event.session_formats.length, 1)];
    const room = resolveRoom(configured.roomHint, index);
    return {
      id: `${eventId}:agenda-foundation:entry:${session.id}`,
      eventId,
      entry: {
        id: `${eventId}:agenda-foundation:entry:${session.id}`,
        sessionId: session.id,
        roomId: session.roomId,
        trackIds: [session.trackId],
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        startsAtLocal: session.startsAt
          .replace("Z", "")
          .replace("T16:", "T09:")
          .replace("T18:", "T11:"),
        endsAtLocal: session.endsAt
          .replace("Z", "")
          .replace("T16:", "T09:")
          .replace("T18:", "T11:"),
        timeZone: config.timezone,
        metadata: {
          title: session.title,
          summary: session.description,
          format: formatName,
          speakerNames: [persona.name],
          roomName: room.name,
          trackNames: [trackName],
        },
      },
    };
  });
  const publicEvent = publicEventProjection(fixture, config, eventId);
  const publishedAt = config.subsetFallback.publishedAt;
  const revision = {
    id: config.subsetFallback.agendaRevisionId,
    eventId,
    revisionNumber: 1,
    sourceDraftVersion: 1,
    timeZone: config.timezone,
    entries: entries.map((entry) => entry.entry),
    warningOverrides: [],
    publishedAt,
    publishedBy: "evaluator agenda foundation",
    rollbackOfRevisionId: null,
    event: publicEvent,
  };
  const state = {
    eventId,
    stateVersion: 1,
    timeZone: config.timezone,
    minimumTravelMinutes: 10,
    sessions: sessions.map((sessionTarget) => {
      const session = JSON.parse(sessionTarget.fields["Metadata JSON"]);
      return {
        id: session.id,
        title: session.title,
        status: session.status,
        participantIds: [...session.speakerIds],
        resourceIds: [],
        capacityRequired: session.capacityRequired,
        durationMinutes: session.durationMinutes,
      };
    }),
    rooms: [...roomsByName.entries()].map(([name, id]) => ({ id, name, capacity: 500 })),
    tracks: [...tracksByName.entries()].map(([name, id]) => ({ id, name })),
    draft: {
      eventId,
      version: 1,
      timeZone: config.timezone,
      entries: entries.map((entry) => entry.entry),
      warningOverrides: [],
      updatedAt: publishedAt,
      updatedBy: "evaluator agenda foundation",
    },
    revisions: [revision],
    currentPublishedRevisionId: revision.id,
    outbox: [],
    audit: [],
  };
  const speakers = [...personasById.values()].map((persona) => {
    const participantId = stableId(eventId, "agenda-participant", persona.id);
    const personaSessions = sessions
      .map((sessionTarget) => JSON.parse(sessionTarget.fields["Metadata JSON"]))
      .filter((session) => session.speakerIds.includes(participantId));
    return {
      id: participantId,
      displayName: persona.name,
      pronouns: null,
      jobTitle: persona.title ?? null,
      organization: persona.company ?? null,
      biography: persona.bio ?? "",
      photoUrl: null,
      sessionIds: personaSessions.map((session) => session.id),
      sessionTitles: personaSessions.map((session) => session.title),
      trackNames: personaSessions.map((session) => {
        const configured = agendaFoundation.sessions.find((entry) => entry.title === session.title);
        return configured?.track ?? "";
      }),
    };
  });
  const projection = {
    event: publicEvent,
    revision: {
      id: config.subsetFallback.speakerProjectionRevisionId,
      number: 1,
      publishedAt,
    },
    speakers,
  };
  const agendaTargets = [
    target("Agenda Versions", `agenda-foundation:${eventId}`, {
      [APPLICATION_ID_FIELD]: `agenda-foundation:${eventId}`,
      "Agenda ID": `agenda-foundation:${eventId}`,
      Number: 1,
      Status: "published",
      "Conflicts JSON": json(state),
      "Published At": publishedAt,
    }),
    ...entries.map((entry) =>
      target("Agenda Entries", entry.id, {
        [APPLICATION_ID_FIELD]: entry.id,
        "Metadata JSON": json(entry),
        "Starts At": entry.entry.startsAt,
        "Ends At": entry.entry.endsAt,
        "Time Zone": config.timezone,
        "Sort Order": entries.indexOf(entry),
      }),
    ),
    target("Published Speaker Projections", config.subsetFallback.speakerProjectionRevisionId, {
      [APPLICATION_ID_FIELD]: config.subsetFallback.speakerProjectionRevisionId,
      "Organization ID": organizationId,
      "Event Slug": eventId,
      "Revision ID": projection.revision.id,
      "Revision Number": projection.revision.number,
      "Published At": publishedAt,
      "Projection JSON": json(projection),
    }),
  ];
  return [...sessions, ...agendaTargets];
}

/**
 * Build only deterministic, additive targets. In full-chain mode this stops at
 * event/CFP/catalog setup so ordered UI scenarios create submissions, reviews,
 * sessions, and public publications themselves.
 */
export function buildSeedRecords(options = {}, fixtureOptions = {}) {
  const normalizedOptions =
    isObject(options) && isObject(options.event) && isObject(options.identities)
      ? { ...(isObject(fixtureOptions) ? fixtureOptions : {}), fixture: options }
      : isObject(options)
        ? options
        : {};
  const config =
    normalizedOptions.seedConfig ??
    loadSeedConfig(normalizedOptions.seedConfigPath ?? DEFAULT_SEED_CONFIG_PATH);
  validateSeedConfig(config);
  const fixture =
    normalizedOptions.fixture ??
    loadFixture(normalizedOptions.sourcePath ?? config.source ?? DEFAULT_SOURCE_PATH);
  validateOfficialFixture(fixture);
  const organizationId = config.organizationId;
  const eventId = config.eventId;
  if (organizationId !== CANONICAL_ORGANIZATION_ID || eventId !== "devflow-conf-2027") {
    throw new DevflowSeedError("SCOPE_MISMATCH", "The DevFlow fixture scope is immutable.");
  }
  const mode = normalizeMode(
    normalizedOptions.subsetFallback === true ? SUBSET_FALLBACK_MODE : normalizedOptions.mode,
  );
  const opensAt = isoDate(
    normalizedOptions.now ?? normalizedOptions.opensAt ?? config.cfp.opensAt ?? new Date(),
    "CFP opening time",
  );
  const closesAt = isoDate(config.cfp.closeAt, "CFP close time");
  const event = eventPayload(fixture, config, eventId, organizationId, opensAt, closesAt);
  const form = formPayload(fixture, config, eventId, organizationId, opensAt, closesAt);
  const targets = [
    target("Events", eventId, {
      [APPLICATION_ID_FIELD]: eventId,
      Name: event.name,
      Slug: event.slug,
      Status: "open",
      Description: event.description,
      "Settings JSON": json(event),
      "Starts At": event.startsAt,
      "Ends At": event.endsAt,
      "Time Zone": event.timeZone,
      Version: event.version,
    }),
    target("CFP Forms", form.id, {
      [APPLICATION_ID_FIELD]: form.id,
      Name: form.name,
      Status: form.status,
      Description: form.welcomeContent,
      "Fields JSON": json(form),
      "Opens At": opensAt,
      "Closes At": closesAt,
      Version: form.version,
    }),
  ];
  const trackTargets = fixture.event.tracks.map((name) =>
    buildTrackTarget(eventId, organizationId, name),
  );
  const formatTargets = fixture.event.session_formats.map((name) =>
    buildFormatTarget(eventId, organizationId, name),
  );
  const roomTargets = fixture.event.rooms.map((name) =>
    buildRoomTarget(fixture, config, eventId, organizationId, name),
  );
  targets.push(
    ...trackTargets,
    ...formatTargets,
    ...roomTargets,
    buildSessionSettingsTarget(config, eventId, organizationId),
    buildEmailTemplateTarget(fixture, config, eventId, organizationId),
  );
  if (mode === SUBSET_FALLBACK_MODE) {
    const tracksByName = new Map(
      trackTargets.map((record) => [record.fields.Name, record.applicationId]),
    );
    const formatsByName = new Map(
      formatTargets.map((record) => [record.fields.Name, record.applicationId]),
    );
    const roomsByName = new Map(
      roomTargets.map((record) => [record.fields.Name, record.applicationId]),
    );
    targets.push(buildReviewPlanTarget(config, eventId, organizationId));
    targets.push(
      ...buildSubsetTargets(
        fixture,
        config,
        eventId,
        organizationId,
        formatsByName,
        tracksByName,
        roomsByName,
      ),
    );
  }
  Object.defineProperty(targets, "provisioned", {
    value: [...targets],
    enumerable: false,
    configurable: true,
  });
  return targets;
}

function existingRecordsFor(existingByTable, table) {
  if (existingByTable instanceof Map) {
    const value = existingByTable.get(table);
    if (Array.isArray(value)) return value;
    if (isObject(value) && Array.isArray(value.records)) return value.records;
    return [];
  }
  const value = existingByTable?.[table];
  if (Array.isArray(value)) return value;
  if (isObject(value) && Array.isArray(value.records)) return value.records;
  return [];
}

function existingApplicationId(record) {
  if (!isObject(record)) return undefined;
  const fields = isObject(record.fields) ? record.fields : record;
  const value = fields[APPLICATION_ID_FIELD] ?? fields.applicationId;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/** Plan create/update actions while rejecting duplicate stable IDs. */
export function planUpserts(records, existingByTable = new Map()) {
  if (!Array.isArray(records)) {
    throw new DevflowSeedError("SEED_INVALID", "Seed records must be an array.");
  }
  const seen = new Set();
  const plan = [];
  for (const record of records) {
    const applicationId =
      isObject(record) && typeof record.applicationId === "string"
        ? record.applicationId
        : isObject(record) && typeof record.id === "string"
          ? record.id
          : undefined;
    if (!isObject(record) || typeof record.table !== "string" || applicationId === undefined) {
      throw new DevflowSeedError(
        "SEED_INVALID",
        "Seed records must declare table and Application ID.",
      );
    }
    const key = `${record.table}\u0000${applicationId}`;
    if (seen.has(key)) {
      throw new DevflowSeedError(
        "DUPLICATE_APPLICATION_ID",
        `Duplicate Application ID ${applicationId} in ${record.table}.`,
      );
    }
    seen.add(key);
    const existing = existingRecordsFor(existingByTable, record.table).filter(
      (candidate) => existingApplicationId(candidate) === applicationId,
    );
    if (existing.length > 1) {
      throw new DevflowSeedError(
        "DUPLICATE_APPLICATION_ID",
        `Duplicate Application ID ${applicationId} in ${record.table}.`,
      );
    }
    plan.push({
      table: record.table,
      applicationId,
      action: existing.length === 1 ? "update" : "create",
    });
  }
  return plan;
}

function escapeFormulaString(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function responseJson(response) {
  return response.json().catch(() => ({}));
}

function createAirtableClient({ accessToken, baseId, apiOrigin, fetchImplementation }) {
  const fetcher = fetchImplementation ?? DEFAULT_FETCH;
  if (typeof fetcher !== "function") {
    throw new DevflowSeedError("CONFIGURATION_ERROR", "A fetch implementation is required.");
  }
  const origin = normalizeOrigin(apiOrigin);
  async function request(table, suffix, init, operation) {
    let response;
    try {
      response = await fetcher(
        `${origin}/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}${suffix}`,
        {
          ...init,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            ...(init?.headers ?? {}),
          },
        },
      );
    } catch {
      throw new DevflowSeedError(
        "AIRTABLE_REQUEST_FAILED",
        `Airtable ${operation} failed for ${table}.`,
      );
    }
    const payload = await responseJson(response);
    if (!response.ok) {
      throw new DevflowSeedError(
        "AIRTABLE_REQUEST_FAILED",
        `Airtable ${operation} failed for ${table} (HTTP ${response.status}).`,
      );
    }
    return payload;
  }
  return {
    async list(targetRecord) {
      const query = new URLSearchParams({
        maxRecords: "2",
        filterByFormula: `{${APPLICATION_ID_FIELD}}="${escapeFormulaString(targetRecord.applicationId)}"`,
      });
      const payload = await request(
        targetRecord.table,
        `?${query.toString()}`,
        undefined,
        "lookup",
      );
      if (!isObject(payload) || !Array.isArray(payload.records)) {
        throw new DevflowSeedError(
          "AIRTABLE_RESPONSE_INVALID",
          `Airtable lookup returned an invalid response for ${targetRecord.table}.`,
        );
      }
      return payload.records;
    },
    async write(targetRecord, existingRecord) {
      const isUpdate = existingRecord !== undefined;
      const recordId =
        isUpdate && typeof existingRecord.id === "string" ? existingRecord.id : undefined;
      if (isUpdate && recordId === undefined) {
        throw new DevflowSeedError(
          "AIRTABLE_RESPONSE_INVALID",
          `Airtable returned an existing ${targetRecord.table} record without an identifier.`,
        );
      }
      const suffix = isUpdate ? `/${encodeURIComponent(recordId)}` : "";
      await request(
        targetRecord.table,
        suffix,
        {
          method: isUpdate ? "PATCH" : "POST",
          body: json({ fields: targetRecord.fields, typecast: true }),
        },
        isUpdate ? "update" : "create",
      );
      return isUpdate ? "update" : "create";
    },
  };
}

function actionKey(table, applicationId) {
  return `${table}\u0000${applicationId}`;
}

/**
 * Reconcile the seed against Airtable. Lookups are completed before writes so a
 * duplicate Application ID aborts without a partial mutation. Dry-run performs
 * those lookups but never issues POST, PATCH, PUT, or DELETE.
 */
export async function runSeed(options = {}) {
  const env = environmentObject(options);
  const parsedEnvironment = parseSeedEnvironment(env, {
    environment: typeof options.environment === "string" ? options.environment : undefined,
    accessToken: options.accessToken,
    baseId: options.baseId,
    apiOrigin: options.apiOrigin,
    productionConfirmation: options.productionConfirmation,
  });
  const chainContext = validateChainContext(options.chainContext ?? emptyChainContext(), {
    allowEmpty: true,
  });
  const mode = normalizeMode(options.subsetFallback === true ? SUBSET_FALLBACK_MODE : options.mode);
  const dryRun = options.dryRun === undefined ? true : Boolean(options.dryRun);
  const records =
    options.records ??
    buildSeedRecords({
      fixture: options.fixture,
      sourcePath: options.sourcePath,
      seedConfig: options.seedConfig,
      seedConfigPath: options.seedConfigPath,
      mode,
      now: options.now,
    });
  const client = createAirtableClient({
    accessToken: parsedEnvironment.accessToken,
    baseId: parsedEnvironment.baseId,
    apiOrigin: parsedEnvironment.apiOrigin,
    fetchImplementation: options.fetchImplementation ?? options.fetch,
  });
  const existingByTable = new Map();
  const existingByKey = new Map();
  for (const record of records) {
    const found = await client.list(record);
    const tableRecords = existingByTable.get(record.table) ?? [];
    tableRecords.push(...found);
    existingByTable.set(record.table, tableRecords);
    if (found.length === 1)
      existingByKey.set(actionKey(record.table, record.applicationId), found[0]);
  }
  const plan = planUpserts(records, existingByTable);
  if (!dryRun) {
    for (const action of plan) {
      const record = records.find(
        (candidate) =>
          candidate.table === action.table && candidate.applicationId === action.applicationId,
      );
      if (record === undefined) {
        throw new DevflowSeedError(
          "SEED_INVALID",
          `The ${action.table} seed record disappeared during planning.`,
        );
      }
      await client.write(record, existingByKey.get(actionKey(action.table, action.applicationId)));
    }
  }
  const counts = plan.reduce(
    (result, action) => {
      result[action.action] = (result[action.action] ?? 0) + 1;
      return result;
    },
    { create: 0, update: 0 },
  );
  const summary = {
    dryRun,
    mode,
    environment: parsedEnvironment.environment,
    organizationId: CANONICAL_ORGANIZATION_ID,
    eventId: "devflow-conf-2027",
    chainContext,
    provisioned: records.map((record) => ({
      table: record.table,
      applicationId: record.applicationId,
    })),
    recordCount: records.length,
    counts,
    actions: plan,
  };
  if (typeof options.logger === "function") options.logger(summary);
  return summary;
}

export function parseArguments(argv = []) {
  let dryRun = true;
  let mode = FULL_CHAIN_MODE;
  let operation = null;
  let help = false;
  for (const argument of argv) {
    if (argument === "--dry-run" || argument === "--apply") {
      const nextOperation = argument === "--dry-run" ? "dry-run" : "apply";
      if (operation !== null && operation !== nextOperation) {
        throw new DevflowSeedError(
          "CONFIGURATION_ERROR",
          "Choose either --apply or --dry-run, not both.",
        );
      }
      operation = nextOperation;
      dryRun = nextOperation === "dry-run";
    } else if (argument === "--subset-fallback" || argument === "--subset") {
      mode = SUBSET_FALLBACK_MODE;
    } else if (argument === "--full-chain") {
      mode = FULL_CHAIN_MODE;
    } else if (argument === "--help" || argument === "-h") {
      help = true;
    } else {
      throw new DevflowSeedError(
        "CONFIGURATION_ERROR",
        "Unknown argument. Use --dry-run, --apply, or --subset-fallback.",
      );
    }
  }
  return { help, dryRun, mode };
}

export const CLI_USAGE =
  "Usage: EVAL_ENVIRONMENT=staging AIRTABLE_ACCESS_TOKEN=... AIRTABLE_BASE_ID=... " +
  "node scripts/eval/seed-devflow.mjs [--dry-run|--apply] [--subset-fallback]\n" +
  "  --dry-run           Read and plan additive upserts without writes (default).\n" +
  "  --apply             Apply only POST/PATCH additive upserts.\n" +
  "  --subset-fallback   Explicitly add review and immutable public fallback projections.\n";

async function main() {
  const argumentsValue = parseArguments(process.argv.slice(2));
  if (argumentsValue.help) {
    console.log(CLI_USAGE);
    return;
  }
  const summary = await runSeed({
    env: process.env,
    dryRun: argumentsValue.dryRun,
    mode: argumentsValue.mode,
  });
  console.log(JSON.stringify(summary, null, 2));
}

const entryPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
const modulePath = fileURLToPath(import.meta.url);
if (entryPath !== undefined && entryPath === modulePath) {
  main().catch((error) => {
    if (error instanceof DevflowSeedError) console.error(error.message);
    else console.error("DevFlow evaluator seeding failed.");
    process.exitCode = 1;
  });
}
