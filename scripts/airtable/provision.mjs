import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const DEFAULT_API_ORIGIN = "https://api.airtable.com";
const METADATA_READ_SCOPE = "schema.bases:read";
const METADATA_WRITE_SCOPE = "schema.bases:write";
const APPLICATION_ID_FIELD = "Application ID";

/**
 * Airtable field definitions for the Open Sessionboard business-data model.
 *
 * `linkTable` is an internal reference used while provisioning. Airtable needs
 * the linked table's generated `tbl...` identifier in the API payload, so link
 * fields are added after every desired table has an identifier.
 */
const text = (name, description) => ({ name, type: "singleLineText", description });
const longText = (name, description) => ({ name, type: "multilineText", description });
const json = (name, description) => ({
  name,
  type: "multilineText",
  description: `${description} Store valid JSON text.`,
});
const email = (name, description) => ({ name, type: "email", description });
const url = (name, description) => ({ name, type: "url", description });
const number = (name, description, precision = 0) => ({
  name,
  type: "number",
  description,
  options: { precision },
});
const dateTime = (name, description) => ({
  name,
  type: "dateTime",
  description,
  options: {
    dateFormat: { name: "iso" },
    timeFormat: { name: "24hour" },
    timeZone: "utc",
  },
});
const select = (name, choices, description) => ({
  name,
  type: "singleSelect",
  description,
  options: { choices: choices.map((choice) => ({ name: choice })) },
});
const link = (name, linkTable, description) => ({
  name,
  type: "multipleRecordLinks",
  description,
  linkTable,
});
const applicationId = () =>
  text(
    APPLICATION_ID_FIELD,
    "Unique stable Open Sessionboard application ID; never use an Airtable record ID.",
  );

/**
 * The display names are intentionally stable. Existing tables and fields are
 * matched by these names and are never deleted or renamed by this script.
 */
export const TABLE_DEFINITIONS = [
  {
    name: "Organizations",
    description: "Tenant organizations that own Open Sessionboard events.",
    fields: [
      applicationId(),
      text("Name", "Organization display name."),
      text("Slug", "Stable organization slug."),
      select("Status", ["active", "archived"], "Organization lifecycle state."),
      text("Owner User ID", "D1 identity ID of the organization owner."),
      json("Settings JSON", "Organization-level settings and feature flags."),
      link("Memberships", "Memberships", "Members belonging to this organization."),
      dateTime("Created At", "Creation timestamp in ISO 8601 format."),
      dateTime("Updated At", "Last update timestamp in ISO 8601 format."),
    ],
  },
  {
    name: "Memberships",
    description: "Organization membership and role assignments.",
    fields: [
      applicationId(),
      link("Organization", "Organizations", "Organization that owns this membership."),
      text("User ID", "D1 identity user ID."),
      select(
        "Role",
        ["owner", "organizer", "reviewer", "submitter", "participant"],
        "Organization role.",
      ),
      select("Status", ["active", "invited", "suspended", "removed"], "Membership state."),
      json("Metadata JSON", "Invitation and membership metadata."),
      dateTime("Created At", "Creation timestamp in ISO 8601 format."),
      dateTime("Updated At", "Last update timestamp in ISO 8601 format."),
    ],
  },
  {
    name: "Events",
    description: "Events and their CFP, review, and agenda configuration.",
    fields: [
      applicationId(),
      link("Organization", "Organizations", "Organization that owns this event."),
      text("Name", "Event display name."),
      text("Slug", "Public event slug."),
      select("Status", ["draft", "open", "closed", "archived"], "Event lifecycle state."),
      longText("Description", "Event description."),
      json("Settings JSON", "Event configuration and integration settings."),
      dateTime("Starts At", "Event start timestamp in ISO 8601 format."),
      dateTime("Ends At", "Event end timestamp in ISO 8601 format."),
      text("Time Zone", "IANA event time zone."),
      number("Version", "Optimistic-concurrency version.", 0),
      dateTime("Created At", "Creation timestamp in ISO 8601 format."),
      dateTime("Updated At", "Last update timestamp in ISO 8601 format."),
    ],
  },
  {
    name: "CFP Forms",
    description: "Call-for-participation forms and their field definitions.",
    fields: [
      applicationId(),
      link("Event", "Events", "Event that owns this CFP form."),
      text("Name", "Form display name."),
      select("Status", ["draft", "published", "closed", "archived"], "Form lifecycle state."),
      longText("Description", "Instructions shown to submitters."),
      json("Fields JSON", "Ordered CFP field definitions and validation rules."),
      dateTime("Opens At", "Submission opening timestamp in ISO 8601 format."),
      dateTime("Closes At", "Submission closing timestamp in ISO 8601 format."),
      number("Version", "Optimistic-concurrency version.", 0),
      dateTime("Created At", "Creation timestamp in ISO 8601 format."),
      dateTime("Updated At", "Last update timestamp in ISO 8601 format."),
    ],
  },
  {
    name: "Submissions",
    description: "CFP submissions and their current lifecycle state.",
    fields: [
      applicationId(),
      link("Event", "Events", "Event receiving this submission."),
      link("CFP Form", "CFP Forms", "Form used for this submission."),
      text("Submitter Account ID", "D1 account ID of the submitter."),
      select(
        "Status",
        ["draft", "submitted", "under_review", "accepted", "waitlisted", "declined", "withdrawn"],
        "Submission lifecycle state.",
      ),
      text("Title", "Submission title."),
      longText("Abstract", "Submission abstract."),
      json("Answers JSON", "Answers keyed by CFP form field ID."),
      json("Participant IDs JSON", "Ordered participant application IDs."),
      json("Secondary Contact IDs JSON", "Secondary contact application IDs."),
      number("Current Version", "Current submission version.", 0),
      dateTime("Submitted At", "Submission timestamp in ISO 8601 format."),
      dateTime("Withdrawn At", "Withdrawal timestamp in ISO 8601 format."),
      dateTime("Reopened At", "Reopen timestamp in ISO 8601 format."),
      dateTime("Created At", "Creation timestamp in ISO 8601 format."),
      dateTime("Updated At", "Last update timestamp in ISO 8601 format."),
    ],
  },
  {
    name: "Participants",
    description: "People participating in an event submission.",
    fields: [
      applicationId(),
      link("Event", "Events", "Event in which this participant appears."),
      link("Submission", "Submissions", "Submission containing this participant."),
      link("Speaker Profile", "Speaker Profiles", "Optional public speaker profile."),
      select("Role", ["primary_speaker", "co_speaker"], "Participant role."),
      text("First Name", "Participant first name."),
      text("Last Name", "Participant last name."),
      email("Email", "Participant email address."),
      text("User ID", "Optional D1 identity user ID."),
      dateTime("Created At", "Creation timestamp in ISO 8601 format."),
      dateTime("Updated At", "Last update timestamp in ISO 8601 format."),
    ],
  },
  {
    name: "Speaker Profiles",
    description: "Speaker-facing profile and public biography data.",
    fields: [
      applicationId(),
      link("Event", "Events", "Event in which this profile is used."),
      link("Participant", "Participants", "Participant represented by this profile."),
      longText("Biography", "Public speaker biography."),
      text("Company", "Speaker company."),
      text("Job Title", "Speaker job title."),
      text("Location", "Speaker location."),
      url("Website URL", "Speaker website URL."),
      url("Social URL", "Speaker social profile URL."),
      text("Headshot Asset ID", "R2 asset application ID for the headshot."),
      number("Version", "Optimistic-concurrency version.", 0),
      dateTime("Created At", "Creation timestamp in ISO 8601 format."),
      dateTime("Updated At", "Last update timestamp in ISO 8601 format."),
    ],
  },
  {
    name: "Review Plans",
    description: "Review plans, rounds, and rubric configuration.",
    fields: [
      applicationId(),
      link("Event", "Events", "Event reviewed by this plan."),
      text("Name", "Review plan display name."),
      select("Status", ["draft", "active", "closed"], "Review plan lifecycle state."),
      json("Rounds JSON", "Ordered review rounds and rubric criteria."),
      number("Version", "Optimistic-concurrency version.", 0),
      dateTime("Created At", "Creation timestamp in ISO 8601 format."),
      dateTime("Updated At", "Last update timestamp in ISO 8601 format."),
    ],
  },
  {
    name: "Evaluations",
    description: "Reviewer assignments, evaluations, scores, and comments.",
    fields: [
      applicationId(),
      link("Event", "Events", "Event being evaluated."),
      link("Review Plan", "Review Plans", "Plan and round governing this evaluation."),
      link("Submission", "Submissions", "Submission being evaluated."),
      text("Round ID", "Review round application ID."),
      text("Reviewer ID", "D1 identity user ID of the reviewer."),
      select("Status", ["assigned", "in_progress", "submitted", "abstained"], "Evaluation state."),
      json("Scores JSON", "Criterion scores and human-confirmation metadata."),
      longText("Overall Comment", "Reviewer overall comment."),
      number("Version", "Optimistic-concurrency version.", 0),
      dateTime("Assigned At", "Assignment timestamp in ISO 8601 format."),
      dateTime("Saved At", "Last saved timestamp in ISO 8601 format."),
      dateTime("Submitted At", "Submission timestamp in ISO 8601 format."),
    ],
  },
  {
    name: "Decisions",
    description: "Organizer decisions for CFP submissions.",
    fields: [
      applicationId(),
      link("Event", "Events", "Event containing the decided submission."),
      link("Submission", "Submissions", "Submission receiving the decision."),
      select("Decision", ["accepted", "waitlisted", "declined"], "Decision outcome."),
      longText("Reason", "Decision rationale visible to authorized users."),
      text("Decided By User ID", "D1 identity user ID of the decision maker."),
      dateTime("Decided At", "Decision timestamp in ISO 8601 format."),
      number("Version", "Optimistic-concurrency version.", 0),
      json("Metadata JSON", "Decision notification and transition metadata."),
    ],
  },
  {
    name: "Speaker Tasks",
    description: "Actionable tasks assigned to speakers and organizers.",
    fields: [
      applicationId(),
      link("Event", "Events", "Event containing this task."),
      link("Participant", "Participants", "Participant responsible for the task."),
      text("Title", "Task title."),
      longText("Description", "Task instructions."),
      select("Type", ["form", "upload", "action"], "Task type."),
      select(
        "Status",
        [
          "not_started",
          "in_progress",
          "submitted",
          "needs_changes",
          "completed",
          "waived",
          "overdue",
          "reopened",
        ],
        "Task state.",
      ),
      json("Owner JSON", "Task owner discriminator and identity."),
      dateTime("Due At", "Task due timestamp in ISO 8601 format."),
      json("Dependency IDs JSON", "Task application IDs that must complete first."),
      json("Reminders JSON", "Reminder schedule and delivery state."),
      json("Completion Payload JSON", "Validated completion payload."),
      number("Version", "Optimistic-concurrency version.", 0),
      dateTime("Created At", "Creation timestamp in ISO 8601 format."),
      dateTime("Updated At", "Last update timestamp in ISO 8601 format."),
    ],
  },
  {
    name: "Sessions",
    description: "Event sessions that can be scheduled into an agenda.",
    fields: [
      applicationId(),
      link("Event", "Events", "Event containing this session."),
      text("Title", "Session title."),
      longText("Description", "Session description."),
      select("Status", ["draft", "confirmed", "cancelled"], "Session lifecycle state."),
      select("Format", ["talk", "panel", "workshop", "break", "other"], "Session format."),
      number("Duration Minutes", "Planned session duration in minutes.", 0),
      json("Participant IDs JSON", "Ordered participant application IDs."),
      link("Room", "Rooms", "Room assigned in the agenda."),
      link("Track", "Tracks", "Track assigned in the agenda."),
      dateTime("Starts At", "Scheduled start timestamp in ISO 8601 format."),
      dateTime("Ends At", "Scheduled end timestamp in ISO 8601 format."),
      text("Time Zone", "IANA schedule time zone."),
      number("Capacity", "Optional attendance capacity.", 0),
      json("Metadata JSON", "Session and publication metadata."),
      dateTime("Created At", "Creation timestamp in ISO 8601 format."),
      dateTime("Updated At", "Last update timestamp in ISO 8601 format."),
    ],
  },
  {
    name: "Rooms",
    description: "Physical or virtual rooms available for scheduling.",
    fields: [
      applicationId(),
      link("Event", "Events", "Event owning this room."),
      text("Name", "Room display name."),
      longText("Description", "Room details and access notes."),
      number("Capacity", "Room capacity.", 0),
      text("Location", "Room location or virtual meeting label."),
      json("Metadata JSON", "Room equipment and integration metadata."),
      dateTime("Created At", "Creation timestamp in ISO 8601 format."),
      dateTime("Updated At", "Last update timestamp in ISO 8601 format."),
    ],
  },
  {
    name: "Tracks",
    description: "Agenda tracks used to group event sessions.",
    fields: [
      applicationId(),
      link("Event", "Events", "Event owning this track."),
      text("Name", "Track display name."),
      longText("Description", "Track description."),
      text("Color", "Presentation color token."),
      json("Metadata JSON", "Track and publication metadata."),
      dateTime("Created At", "Creation timestamp in ISO 8601 format."),
      dateTime("Updated At", "Last update timestamp in ISO 8601 format."),
    ],
  },
  {
    name: "Agenda Versions",
    description: "Immutable and draft revisions of an event agenda.",
    fields: [
      applicationId(),
      link("Event", "Events", "Event whose agenda is revised."),
      text("Agenda ID", "Stable agenda application ID."),
      number("Number", "Monotonic agenda revision number.", 0),
      select(
        "Status",
        ["draft", "validating", "ready", "published", "superseded", "rolled_back"],
        "Revision state.",
      ),
      link("Based On Version", "Agenda Versions", "Optional preceding agenda revision."),
      text("Created By User ID", "D1 identity user ID of the author."),
      json("Conflicts JSON", "Hard conflicts, soft warnings, and approved overrides."),
      dateTime("Created At", "Creation timestamp in ISO 8601 format."),
      dateTime("Published At", "Publication timestamp in ISO 8601 format."),
    ],
  },
  {
    name: "Agenda Entries",
    description: "Scheduled session entries within an agenda revision.",
    fields: [
      applicationId(),
      link("Agenda Version", "Agenda Versions", "Agenda revision containing this entry."),
      link("Session", "Sessions", "Session scheduled by this entry."),
      link("Room", "Rooms", "Room used by this entry."),
      link("Track", "Tracks", "Track used by this entry."),
      json("Participant IDs JSON", "Ordered participant application IDs."),
      dateTime("Starts At", "Scheduled start timestamp in ISO 8601 format."),
      dateTime("Ends At", "Scheduled end timestamp in ISO 8601 format."),
      text("Time Zone", "IANA schedule time zone."),
      number("Capacity", "Optional entry capacity.", 0),
      number("Sort Order", "Stable display ordering.", 0),
      json("Metadata JSON", "Schedule and publication metadata."),
    ],
  },
  {
    name: "Publication Outbox",
    description: "Durable provider publication intents and reconciliation state.",
    fields: [
      applicationId(),
      link("Event", "Events", "Event being published."),
      link("Agenda Version", "Agenda Versions", "Immutable agenda revision being published."),
      text("Provider", "Outbound provider name."),
      select(
        "Status",
        ["preview", "queued", "publishing", "succeeded", "partially_failed", "failed"],
        "Publication state.",
      ),
      text("Idempotency Key", "Provider publication idempotency key."),
      text("Snapshot Hash", "SHA-256 hash of the immutable publication snapshot."),
      json("Payload JSON", "Sanitized provider request payload."),
      number("Attempt", "Number of provider attempts.", 0),
      text("Error Code", "Sanitized provider error code."),
      longText("Error Message", "Sanitized provider error message."),
      dateTime("Created At", "Creation timestamp in ISO 8601 format."),
      dateTime("Updated At", "Last reconciliation timestamp in ISO 8601 format."),
    ],
  },
  {
    name: "Audit Records",
    description: "Append-only business audit records for authorized operators.",
    fields: [
      applicationId(),
      link("Organization", "Organizations", "Organization in the audit scope."),
      link("Event", "Events", "Optional event in the audit scope."),
      text("Actor Type", "user, api_key, or system."),
      text("Actor ID", "Stable actor application or identity ID."),
      text("Action", "Audited action name."),
      text("Entity Type", "Audited entity type."),
      text("Entity Application ID", "Stable ID of the audited entity."),
      json("Changes JSON", "Before/after or patch representation."),
      json("Metadata JSON", "Trace and request metadata."),
      dateTime("Occurred At", "Audit occurrence timestamp in ISO 8601 format."),
      text("Trace ID", "Request trace ID."),
      text("Request ID", "Request or idempotency identifier."),
    ],
  },
];

export { APPLICATION_ID_FIELD };

export class AirtableProvisionError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AirtableProvisionError";
    this.code = code;
    if (options.status !== undefined) this.status = options.status;
  }
}

/**
 * Read and validate the two environment variables required by the CLI. Values
 * are returned to the caller but are never included in errors or summaries.
 */
export function readAirtableConfiguration(environment = process.env) {
  const accessToken = nonEmpty(environment.AIRTABLE_ACCESS_TOKEN);
  const baseId = nonEmpty(environment.AIRTABLE_BASE_ID);
  const missing = [];
  if (accessToken === undefined) missing.push("AIRTABLE_ACCESS_TOKEN");
  if (baseId === undefined) missing.push("AIRTABLE_BASE_ID");
  if (missing.length > 0) {
    throw new AirtableProvisionError(
      "CONFIGURATION_ERROR",
      `Missing required Airtable configuration: ${missing.join(", ")}.`,
    );
  }
  return { accessToken, baseId };
}

/**
 * Provision or reconcile the approved schema. Dry-run performs one metadata
 * read and returns the planned mutations. Apply performs only additive field,
 * table, and description/option updates; it never deletes anything.
 */
export async function provisionAirtableSchema(options = {}) {
  const accessToken = nonEmpty(options.accessToken);
  const baseId = nonEmpty(options.baseId);
  if (accessToken === undefined || baseId === undefined) {
    throw new AirtableProvisionError(
      "CONFIGURATION_ERROR",
      "Airtable accessToken and baseId are required.",
    );
  }

  const mode = options.mode ?? "dry-run";
  if (mode !== "dry-run" && mode !== "apply") {
    throw new AirtableProvisionError(
      "CONFIGURATION_ERROR",
      "Unsupported Airtable provisioning mode. Use dry-run or apply.",
    );
  }

  const fetchImplementation = options.fetchImplementation ?? options.fetch ?? globalThis.fetch;
  if (typeof fetchImplementation !== "function") {
    throw new AirtableProvisionError("CONFIGURATION_ERROR", "A fetch implementation is required.");
  }
  const apiOrigin = (options.apiOrigin ?? DEFAULT_API_ORIGIN).replace(/\/$/, "");
  const client = new MetadataClient({
    accessToken,
    baseId,
    apiOrigin,
    fetchImplementation,
    scopeHint: mode === "apply" ? METADATA_WRITE_SCOPE : METADATA_READ_SCOPE,
  });
  const initialTables = await client.listTables();
  const plan = buildPlan(initialTables);
  if (plan.incompatible.length > 0) {
    throw new AirtableProvisionError("SCHEMA_INCOMPATIBLE", plan.incompatible.join(" "));
  }

  if (mode === "dry-run") {
    return summarizePlan(plan, mode);
  }

  const tableIds = new Map(
    plan.tables.map(({ definition, existing }) => [definition.name, existing?.id]),
  );
  const createdTables = [];
  const addedFields = [];
  const updatedFields = [];
  const updatedTables = [];

  // Create all tables first, with scalar/JSON fields. This gives every link
  // target a stable Airtable table ID before any link field is created.
  for (const tablePlan of plan.tables) {
    if (tablePlan.existing !== undefined) continue;
    const response = await client.createTable(tablePlan.definition, tableIds);
    const created = parseCreatedTable(response, tablePlan.definition.name);
    tableIds.set(tablePlan.definition.name, created.id);
    createdTables.push(tablePlan.definition.name);
  }

  // Re-fetch so field IDs and server-normalized options are authoritative after
  // table creation. This also makes a retry after a partially completed apply safe.
  const tablesAfterCreate = await client.listTables();
  const applyPlan = buildPlan(tablesAfterCreate);
  if (applyPlan.incompatible.length > 0) {
    throw new AirtableProvisionError("SCHEMA_INCOMPATIBLE", applyPlan.incompatible.join(" "));
  }
  for (const tablePlan of applyPlan.tables) {
    const tableId = tablePlan.existing?.id ?? tableIds.get(tablePlan.definition.name);
    if (tableId === undefined) {
      throw new AirtableProvisionError(
        "INVALID_RESPONSE",
        `Airtable did not return an identifier for the ${tablePlan.definition.name} table.`,
      );
    }
    tableIds.set(tablePlan.definition.name, tableId);

    if (
      tablePlan.existing !== undefined &&
      tablePlan.definition.description !== undefined &&
      tablePlan.existing.description !== tablePlan.definition.description
    ) {
      await client.updateTable(tableId, { description: tablePlan.definition.description });
      updatedTables.push(tablePlan.definition.name);
    }

    for (const fieldPlan of tablePlan.fields) {
      const payload = fieldPayload(fieldPlan.field, tableIds);
      if (fieldPlan.existing === undefined) {
        await client.createField(tableId, payload);
        addedFields.push(`${tablePlan.definition.name}.${fieldPlan.field.name}`);
      } else {
        const patch = reconcileFieldPatch(fieldPlan.existing, fieldPlan.field, tableIds);
        if (Object.keys(patch).length > 0) {
          await client.updateField(tableId, fieldPlan.existing.id, patch);
          updatedFields.push(`${tablePlan.definition.name}.${fieldPlan.field.name}`);
        }
      }
    }
  }

  return {
    ...summarizePlan(applyPlan, mode),
    createdTables,
    addedFields,
    updatedTables,
    updatedFields,
  };
}

/** Alias retained as the obvious script-facing function name for callers. */
export const provision = provisionAirtableSchema;

function buildPlan(existingTables) {
  const byName = new Map();
  for (const table of existingTables) {
    if (byName.has(table.name)) {
      throw new AirtableProvisionError(
        "SCHEMA_INCOMPATIBLE",
        `Airtable contains duplicate tables named ${table.name}.`,
      );
    }
    byName.set(table.name, table);
  }

  const incompatible = [];
  const tables = TABLE_DEFINITIONS.map((definition) => {
    const existing = byName.get(definition.name);
    const existingFields = new Map();
    if (existing !== undefined) {
      for (const field of existing.fields) {
        if (existingFields.has(field.name)) {
          incompatible.push(
            `The ${definition.name} table contains duplicate fields named ${field.name}.`,
          );
        } else {
          existingFields.set(field.name, field);
        }
      }
    }
    const fields = definition.fields.map((field) => {
      const matching = existingFields.get(field.name);
      if (matching !== undefined && matching.type !== field.type) {
        incompatible.push(
          `${definition.name}.${field.name} has Airtable type ${matching.type}; expected ${field.type}.`,
        );
      }
      return { field, existing: matching };
    });
    return { definition, existing, fields };
  });
  return { tables, incompatible };
}

function summarizePlan(plan, mode) {
  const actions = [];
  const createdTables = [];
  const addedFields = [];
  const updatedFields = [];
  const updatedTables = [];
  const unchangedTables = [];
  const tableIds = new Map(
    plan.tables
      .filter(({ existing }) => existing !== undefined)
      .map(({ definition, existing }) => [definition.name, existing.id]),
  );

  for (const tablePlan of plan.tables) {
    if (tablePlan.existing === undefined) {
      createdTables.push(tablePlan.definition.name);
      actions.push({
        action: "create-table",
        table: tablePlan.definition.name,
        fields: tablePlan.definition.fields.map((field) => field.name),
      });
      continue;
    }
    let changed = false;
    if (
      tablePlan.definition.description !== undefined &&
      tablePlan.existing.description !== tablePlan.definition.description
    ) {
      changed = true;
      updatedTables.push(tablePlan.definition.name);
      actions.push({ action: "update-table-description", table: tablePlan.definition.name });
    }
    for (const fieldPlan of tablePlan.fields) {
      if (fieldPlan.existing === undefined) {
        changed = true;
        addedFields.push(`${tablePlan.definition.name}.${fieldPlan.field.name}`);
        actions.push({
          action: "create-field",
          table: tablePlan.definition.name,
          field: fieldPlan.field.name,
        });
        continue;
      }
      const patch = reconcileFieldPatch(fieldPlan.existing, fieldPlan.field, tableIds);
      if (Object.keys(patch).length > 0) {
        changed = true;
        updatedFields.push(`${tablePlan.definition.name}.${fieldPlan.field.name}`);
        actions.push({
          action: "update-field",
          table: tablePlan.definition.name,
          field: fieldPlan.field.name,
          properties: Object.keys(patch),
        });
      }
    }
    if (!changed) unchangedTables.push(tablePlan.definition.name);
  }

  return {
    mode,
    tableCount: TABLE_DEFINITIONS.length,
    actions,
    createdTables,
    addedFields,
    updatedTables,
    updatedFields,
    unchangedTables,
  };
}

function reconcileFieldPatch(existing, desired, tableIds) {
  const patch = {};
  if (desired.description !== undefined && existing.description !== desired.description) {
    patch.description = desired.description;
  }
  if (desired.options !== undefined || desired.linkTable !== undefined) {
    const linkedTableKnown = desired.linkTable === undefined || tableIds.has(desired.linkTable);
    if (linkedTableKnown) {
      const desiredOptions = fieldOptions(desired, tableIds);
      if (desiredOptions !== undefined && !optionsContain(existing.options, desiredOptions)) {
        patch.options = desiredOptions;
      }
    }
  }
  return patch;
}

function fieldPayload(field, tableIds) {
  const payload = {
    name: field.name,
    type: field.type,
    ...(field.description === undefined ? {} : { description: field.description }),
  };
  const options = fieldOptions(field, tableIds);
  if (options !== undefined) payload.options = options;
  return payload;
}

function fieldOptions(field, tableIds) {
  if (field.linkTable !== undefined) {
    const linkedTableId = tableIds.get(field.linkTable);
    if (linkedTableId === undefined) {
      throw new AirtableProvisionError(
        "INVALID_RESPONSE",
        `Cannot create ${field.name}; the linked ${field.linkTable} table has no Airtable identifier.`,
      );
    }
    return { ...(field.options ?? {}), linkedTableId };
  }
  return field.options;
}

function optionsContain(actual, desired) {
  if (desired === undefined) return true;
  if (actual === null || typeof actual !== "object") return false;
  return Object.entries(desired).every(([key, value]) => valueContains(actual[key], value));
}

function valueContains(actual, desired) {
  if (Object.is(actual, desired)) return true;
  if (actual === null || desired === null || typeof actual !== typeof desired) return false;
  if (Array.isArray(desired)) {
    return (
      Array.isArray(actual) &&
      actual.length >= desired.length &&
      desired.every((value, index) => valueContains(actual[index], value))
    );
  }
  if (typeof desired !== "object") return false;
  if (typeof actual !== "object" || Array.isArray(actual)) return false;
  return Object.entries(desired).every(([key, value]) => valueContains(actual[key], value));
}

function parseCreatedTable(body, name) {
  const candidate = body?.table ?? body;
  if (!candidate || typeof candidate.id !== "string" || candidate.id.length === 0) {
    throw new AirtableProvisionError(
      "INVALID_RESPONSE",
      `Airtable did not return a valid identifier while creating ${name}.`,
    );
  }
  return candidate;
}

class MetadataClient {
  constructor({ accessToken, baseId, apiOrigin, fetchImplementation, scopeHint }) {
    this.accessToken = accessToken;
    this.baseId = baseId;
    this.apiOrigin = apiOrigin;
    this.fetchImplementation = fetchImplementation;
    this.scopeHint = scopeHint;
  }

  async listTables() {
    const body = await this.request(
      "GET",
      tablesPath(this.baseId),
      undefined,
      "reading the base schema",
    );
    if (!Array.isArray(body?.tables)) {
      throw new AirtableProvisionError(
        "INVALID_RESPONSE",
        "Airtable returned an invalid table schema response.",
      );
    }
    return body.tables.map(parseTable);
  }

  createTable(definition, tableIds) {
    const fields = definition.fields
      .filter((field) => field.linkTable === undefined)
      .map((field) => fieldPayload(field, tableIds));
    return this.request(
      "POST",
      tablesPath(this.baseId),
      { name: definition.name, description: definition.description, fields },
      `creating the ${definition.name} table`,
    );
  }

  updateTable(tableId, body) {
    return this.request(
      "PATCH",
      tablePath(this.baseId, tableId),
      body,
      "updating an Airtable table description",
    );
  }

  createField(tableId, body) {
    return this.request(
      "POST",
      fieldsPath(this.baseId, tableId),
      body,
      "creating an Airtable field",
    );
  }

  updateField(tableId, fieldId, body) {
    return this.request(
      "PATCH",
      fieldPath(this.baseId, tableId, fieldId),
      body,
      "updating an Airtable field",
    );
  }

  async request(method, path, body, operation) {
    let response;
    try {
      response = await this.fetchImplementation(`${this.apiOrigin}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.accessToken}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (cause) {
      throw new AirtableProvisionError(
        "NETWORK_ERROR",
        `Airtable request failed while ${operation}.`,
        { cause },
      );
    }

    const status = Number(response?.status);
    const responseBody = await responseBodyOf(response);
    if (!Number.isInteger(status) || status < 200 || status >= 300) {
      throw metadataError(status, operation, this.scopeHint);
    }
    return responseBody;
  }
}

function parseTable(table) {
  if (
    !table ||
    typeof table !== "object" ||
    typeof table.id !== "string" ||
    typeof table.name !== "string"
  ) {
    throw new AirtableProvisionError(
      "INVALID_RESPONSE",
      "Airtable returned an invalid table definition.",
    );
  }
  const fields = table.fields === undefined ? [] : table.fields;
  if (!Array.isArray(fields)) {
    throw new AirtableProvisionError(
      "INVALID_RESPONSE",
      `Airtable returned invalid fields for ${table.name}.`,
    );
  }
  return {
    id: table.id,
    name: table.name,
    description: typeof table.description === "string" ? table.description : undefined,
    fields: fields.map((field) => {
      if (
        !field ||
        typeof field !== "object" ||
        typeof field.id !== "string" ||
        typeof field.name !== "string"
      ) {
        throw new AirtableProvisionError(
          "INVALID_RESPONSE",
          `Airtable returned an invalid field in ${table.name}.`,
        );
      }
      return {
        id: field.id,
        name: field.name,
        type: field.type,
        description: typeof field.description === "string" ? field.description : undefined,
        options: field.options,
      };
    }),
  };
}

async function responseBodyOf(response) {
  if (response === null || response === undefined) return null;
  if (typeof response.json === "function") {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  return response.body ?? null;
}

function metadataError(status, operation, scopeHint = METADATA_WRITE_SCOPE) {
  if (status === 401) {
    return new AirtableProvisionError(
      "AUTHENTICATION_ERROR",
      `Airtable authentication failed while ${operation}; check AIRTABLE_ACCESS_TOKEN.`,
      { status },
    );
  }
  if (status === 403) {
    return new AirtableProvisionError(
      "INSUFFICIENT_SCOPE",
      `Airtable denied schema access while ${operation}. Grant the ${scopeHint} scope to the token for this base.`,
      { status },
    );
  }
  if (status === 404) {
    return new AirtableProvisionError(
      "BASE_NOT_FOUND",
      `Airtable could not find the configured base while ${operation}; check AIRTABLE_BASE_ID and token access.`,
      { status },
    );
  }
  return new AirtableProvisionError(
    "API_ERROR",
    `Airtable metadata API returned HTTP ${Number.isFinite(status) ? status : "an invalid response"} while ${operation}.`,
    { status: Number.isInteger(status) ? status : undefined },
  );
}

function tablesPath(baseId) {
  return `/v0/meta/bases/${encodeURIComponent(baseId)}/tables`;
}
function tablePath(baseId, tableId) {
  return `${tablesPath(baseId)}/${encodeURIComponent(tableId)}`;
}
function fieldsPath(baseId, tableId) {
  return `${tablePath(baseId, tableId)}/fields`;
}
function fieldPath(baseId, tableId, fieldId) {
  return `${fieldsPath(baseId, tableId)}/${encodeURIComponent(fieldId)}`;
}
function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function parseProvisioningArguments(argv = process.argv.slice(2)) {
  let mode = "dry-run";
  for (const argument of argv) {
    if (argument === "--apply") {
      if (mode === "dry-run-explicit") {
        throw new AirtableProvisionError(
          "CONFIGURATION_ERROR",
          "Choose either --apply or --dry-run, not both.",
        );
      }
      mode = "apply";
    } else if (argument === "--dry-run") {
      if (mode === "apply") {
        throw new AirtableProvisionError(
          "CONFIGURATION_ERROR",
          "Choose either --apply or --dry-run, not both.",
        );
      }
      mode = "dry-run-explicit";
    } else if (argument === "--help" || argument === "-h") {
      return { help: true, mode: "dry-run" };
    } else {
      throw new AirtableProvisionError(
        "CONFIGURATION_ERROR",
        "Unknown argument. Use --dry-run or --apply.",
      );
    }
  }
  return { help: false, mode: mode === "dry-run-explicit" ? "dry-run" : mode };
}

export const CLI_USAGE =
  "Usage: node scripts/airtable/provision.mjs [--dry-run|--apply]\n" +
  "  --dry-run  Read metadata and print additive changes without mutating Airtable (default).\n" +
  "  --apply    Create/reconcile the approved schema; no tables or fields are deleted.\n";

async function main() {
  let argumentsResult;
  try {
    argumentsResult = parseProvisioningArguments();
    if (argumentsResult.help) {
      process.stdout.write(CLI_USAGE);
      return;
    }
    const configuration = readAirtableConfiguration();
    const summary = await provisionAirtableSchema({ ...configuration, mode: argumentsResult.mode });
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } catch (error) {
    const message =
      error instanceof AirtableProvisionError ? error.message : "Airtable provisioning failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
