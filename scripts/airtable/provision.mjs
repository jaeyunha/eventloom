import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
const organizationScopeFields = () => [
  text("Organization ID", "Owning organization application ID."),
  link("Organization", "Organizations", "Organization owning this business record."),
];
const eventScopeFields = () => [
  text("Event ID", "Owning event application ID."),
  link("Event", "Events", "Event owning this business record."),
];
const versionedAuditFields = () => [
  number("Version", "Optimistic-concurrency version.", 0),
  text("Created By User ID", "D1 identity user ID that created the record."),
  text("Updated By User ID", "D1 identity user ID that last updated the record."),
  dateTime("Created At", "Creation timestamp in ISO 8601 format."),
  dateTime("Updated At", "Last update timestamp in ISO 8601 format."),
  json("Audit JSON", "Append-only mutation and transition audit metadata."),
  json("Provenance JSON", "Source, actor, request, and provenance metadata."),
];

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
      text("Organization ID", "Owning organization application ID."),
      text("Event ID", "Owning event application ID."),
      link("Organization", "Organizations", "Organization owning this session."),
      link("Event", "Events", "Event containing this session."),
      text("Title", "Session title."),
      longText("Description", "Session description."),
      select("Status", ["draft", "confirmed", "cancelled"], "Session lifecycle state."),
      select("Format", ["talk", "panel", "workshop", "break", "other"], "Session format."),
      number("Duration Minutes", "Planned session duration in minutes.", 0),
      json("Participant IDs JSON", "Ordered participant application IDs."),
      json("Speaker IDs JSON", "Ordered speaker or participant application IDs."),
      json("Speaker Roster JSON", "Participant roster snapshots for this session."),
      json("Track IDs JSON", "Ordered track application IDs."),
      text("Format ID", "Format application ID."),
      link("Format Reference", "Formats", "Format taxonomy record assigned to this session."),
      text("Level ID", "Level application ID."),
      link("Level Reference", "Levels", "Level taxonomy record assigned to this session."),
      json("Tag IDs JSON", "Tag application IDs assigned to this session."),
      json("Resource IDs JSON", "Resource application IDs assigned to this session."),
      link("Room", "Rooms", "Room assigned in the agenda."),
      link("Track", "Tracks", "Track assigned in the agenda."),
      dateTime("Starts At", "Scheduled start timestamp in ISO 8601 format."),
      dateTime("Ends At", "Scheduled end timestamp in ISO 8601 format."),
      text("Time Zone", "IANA schedule time zone."),
      number("Capacity", "Optional attendance capacity.", 0),
      json("Metadata JSON", "Session and publication metadata."),
      number("Capacity Required", "Required session capacity.", 0),
      json("Settings JSON", "Session settings and publication metadata."),
      json("History JSON", "Immutable session mutation history."),
      json("Audit JSON", "Session mutation audit metadata."),
      json("Provenance JSON", "Session source and actor provenance metadata."),
      text("Created By User ID", "D1 identity user ID that created the session."),
      text("Updated By User ID", "D1 identity user ID that last updated the session."),
      number("Version", "Optimistic-concurrency version.", 0),
      dateTime("Created At", "Creation timestamp in ISO 8601 format."),
      dateTime("Updated At", "Last update timestamp in ISO 8601 format."),
    ],
  },
  {
    name: "Rooms",
    description: "Physical or virtual rooms available for scheduling.",
    fields: [
      applicationId(),
      text("Organization ID", "Owning organization application ID."),
      text("Event ID", "Owning event application ID."),
      link("Organization", "Organizations", "Organization owning this room."),
      link("Event", "Events", "Event owning this room."),
      text("Name", "Room display name."),
      longText("Description", "Room details and access notes."),
      number("Capacity", "Room capacity.", 0),
      text("Location", "Room location or virtual meeting label."),
      json("Metadata JSON", "Room equipment and integration metadata."),
      json("Resources JSON", "Room resources and equipment."),
      json("Resource IDs JSON", "Resource application IDs assigned to this room."),
      select("Status", ["active", "archived"], "Room lifecycle state."),
      json("Settings JSON", "Room scheduling and access settings."),
      json("History JSON", "Immutable room mutation history."),
      json("Audit JSON", "Room mutation audit metadata."),
      json("Provenance JSON", "Room source and actor provenance metadata."),
      text("Created By User ID", "D1 identity user ID that created the room."),
      text("Updated By User ID", "D1 identity user ID that last updated the room."),
      number("Version", "Optimistic-concurrency version.", 0),
      dateTime("Created At", "Creation timestamp in ISO 8601 format."),
      dateTime("Updated At", "Last update timestamp in ISO 8601 format."),
    ],
  },
  {
    name: "Tracks",
    description: "Agenda tracks used to group event sessions.",
    fields: [
      applicationId(),
      text("Organization ID", "Owning organization application ID."),
      text("Event ID", "Owning event application ID."),
      link("Organization", "Organizations", "Organization owning this track."),
      link("Event", "Events", "Event owning this track."),
      text("Name", "Track display name."),
      longText("Description", "Track description."),
      text("Color", "Presentation color token."),
      json("Metadata JSON", "Track and publication metadata."),
      select("Status", ["active", "archived"], "Track lifecycle state."),
      json("Settings JSON", "Track scheduling and presentation settings."),
      json("History JSON", "Immutable track mutation history."),
      json("Audit JSON", "Track mutation audit metadata."),
      json("Provenance JSON", "Track source and actor provenance metadata."),
      text("Created By User ID", "D1 identity user ID that created the track."),
      text("Updated By User ID", "D1 identity user ID that last updated the track."),
      number("Version", "Optimistic-concurrency version.", 0),
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
    name: "Published Speaker Projections",
    description:
      "Immutable public speaker galleries. Each row is a materialized published revision; never store drafts or private fields.",
    fields: [
      applicationId(),
      text("Organization ID", "Owning organization application ID."),
      text("Event Slug", "Globally unique public event slug."),
      text("Revision ID", "Immutable published speaker projection revision ID."),
      number("Revision Number", "Monotonic published projection revision number.", 0),
      dateTime("Published At", "Publication timestamp in ISO 8601 format."),
      json("Projection JSON", "Sanitized public projection payload only."),
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
  {
    name: "Session Statuses",
    description: "Event-scoped lifecycle status definitions for sessions and agenda eligibility.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      ...eventScopeFields(),
      link("Sessions", "Sessions", "Sessions using this status definition."),
      link("Session Settings", "Session Settings", "Settings using this status definition."),
      text("Name", "Display label for the status."),
      text("Value", "Stable status value used by session APIs."),
      text("Description", "Status guidance shown to organizers."),
      select("Status", ["active", "archived"], "Status definition lifecycle state."),
      text("Color", "Presentation color token."),
      number("Sort Order", "Stable display order for status options.", 0),
      json("Settings JSON", "Status behavior, eligibility, and presentation settings."),
      ...versionedAuditFields(),
    ],
  },
  {
    name: "Formats",
    description: "Event-scoped session format taxonomy.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      ...eventScopeFields(),
      link("Sessions", "Sessions", "Sessions using this format."),
      text("Name", "Format display name."),
      text("Description", "Format guidance."),
      select("Status", ["active", "archived"], "Format lifecycle state."),
      json("Settings JSON", "Format behavior and presentation settings."),
      ...versionedAuditFields(),
    ],
  },
  {
    name: "Levels",
    description: "Event-scoped session level taxonomy.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      ...eventScopeFields(),
      link("Sessions", "Sessions", "Sessions using this level."),
      text("Name", "Level display name."),
      text("Description", "Level guidance."),
      select("Status", ["active", "archived"], "Level lifecycle state."),
      json("Settings JSON", "Level behavior and presentation settings."),
      ...versionedAuditFields(),
    ],
  },
  {
    name: "Tags",
    description: "Event-scoped session and agenda tags.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      ...eventScopeFields(),
      link("Sessions", "Sessions", "Sessions using this tag."),
      text("Name", "Tag display name."),
      text("Description", "Tag guidance."),
      select("Status", ["active", "archived"], "Tag lifecycle state."),
      text("Color", "Presentation color token."),
      json("Settings JSON", "Tag behavior and presentation settings."),
      ...versionedAuditFields(),
    ],
  },
  {
    name: "Session Settings",
    description: "Versioned event-scoped session and agenda configuration.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      ...eventScopeFields(),
      link("Session Statuses", "Session Statuses", "Status definitions configured for this event."),
      select("Status", ["draft", "active", "archived"], "Session settings lifecycle state."),
      json("Statuses JSON", "Ordered event-specific session status values."),
      json("Agenda Eligible Statuses JSON", "Statuses eligible for agenda scheduling."),
      json("Settings JSON", "Session defaults, validation, and agenda settings."),
      ...versionedAuditFields(),
    ],
  },
  {
    name: "Portal Contexts",
    description: "Scoped participant portal contexts and capability projections.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      ...eventScopeFields(),
      text("Name", "Portal context display name."),
      text("Slug", "Stable portal context slug."),
      text("Status", "Portal context lifecycle state."),
      json("Capabilities JSON", "Server-authorized capability allow-list."),
      json("Submission IDs JSON", "Submission application IDs visible in this context."),
      json("Participant IDs JSON", "Participant application IDs visible in this context."),
      text("Primary Participant ID", "Primary participant application ID."),
      link("Submissions", "Submissions", "Submissions visible in this portal context."),
      link("Participants", "Participants", "Participants visible in this portal context."),
      json("Settings JSON", "Portal context settings and presentation metadata."),
      link("Session Roster", "Session Roster", "Roster members for this portal context."),
      ...versionedAuditFields(),
    ],
  },
  {
    name: "Session Roster",
    description: "Participant roster membership and capability state for a session portal.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      ...eventScopeFields(),
      link("Submission", "Submissions", "Submission whose roster is represented."),
      link("Participant", "Participants", "Participant represented by this roster row."),
      text("Submission ID", "Submission application ID."),
      text("Participant ID", "Participant application ID."),
      text("Display Name", "Snapshot display name shown in the roster."),
      email("Email", "Snapshot participant email address."),
      select("Role", ["primary", "co_speaker"], "Roster role."),
      select("Status", ["pending", "active", "revoked"], "Roster membership state."),
      json("Capabilities JSON", "Edit/remove capability decisions."),
      json("Members JSON", "Immutable roster member snapshots."),
      json("Settings JSON", "Roster invitation and presentation settings."),
      ...versionedAuditFields(),
    ],
  },
  {
    name: "Task Forms",
    description: "Versioned form definitions attached to participant tasks.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      ...eventScopeFields(),
      link("Task", "Speaker Tasks", "Task that owns this form definition."),
      text("Task ID", "Owning task application ID."),
      text("Title", "Task form title."),
      longText("Description", "Task form instructions."),
      json("Fields JSON", "Ordered task form field definitions and validation rules."),
      json("Definition JSON", "Versioned task form definition snapshot."),
      select("Status", ["draft", "published", "archived"], "Task form lifecycle state."),
      json("Settings JSON", "Task form behavior and presentation settings."),
      ...versionedAuditFields(),
    ],
  },
  {
    name: "Task Responses",
    description: "Immutable-versioned participant task form responses and feedback.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      ...eventScopeFields(),
      link("Task", "Speaker Tasks", "Task receiving this response."),
      link("Task Form", "Task Forms", "Form definition used for this response."),
      link("Participant", "Participants", "Participant submitting this response."),
      text("Task ID", "Owning task application ID."),
      text("Participant ID", "Submitting participant application ID."),
      number("Definition Version", "Task form definition version used.", 0),
      json("Answers JSON", "Validated task form answers."),
      text("Status", "Response submission state."),
      longText("Feedback", "Organizer feedback for this response."),
      json("History JSON", "Prior response versions and transitions."),
      json("Settings JSON", "Response workflow settings."),
      ...versionedAuditFields(),
    ],
  },
  {
    name: "Portal Resources",
    description: "Event-scoped participant portal resources and downloadable guidance.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      ...eventScopeFields(),
      text("Title", "Resource display title."),
      longText("Summary", "Short resource summary."),
      longText("HTML", "Sanitized resource HTML content."),
      url("URL", "External resource URL."),
      number("Sort Order", "Stable portal display order.", 0),
      select("Status", ["draft", "published", "archived"], "Resource lifecycle state."),
      text("Type", "Resource type discriminator."),
      json("Settings JSON", "Resource visibility and presentation settings."),
      ...versionedAuditFields(),
    ],
  },
  {
    name: "Wiki Pages",
    description: "Event-scoped participant wiki pages.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      ...eventScopeFields(),
      text("Title", "Wiki page title."),
      text("Slug", "Stable wiki page slug."),
      longText("Summary", "Short wiki page summary."),
      longText("HTML", "Sanitized wiki page HTML content."),
      url("URL", "Optional canonical page URL."),
      number("Sort Order", "Stable wiki display order.", 0),
      select("Status", ["draft", "published", "archived"], "Wiki page lifecycle state."),
      json("Settings JSON", "Wiki visibility and presentation settings."),
      ...versionedAuditFields(),
    ],
  },
  {
    name: "File Assets",
    description: "Private event file metadata and R2 object ownership.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      ...eventScopeFields(),
      link("Submission", "Submissions", "Submission owning the file."),
      link("Participant", "Participants", "Participant owning the file."),
      link("Task", "Speaker Tasks", "Task requesting the file."),
      text("Submission ID", "Submission application ID."),
      text("Participant ID", "Participant application ID."),
      text("Task ID", "Task application ID."),
      select("Kind", ["headshot", "slides", "supporting_file"], "File asset kind."),
      text("Object Key", "Opaque private R2 object key; never expose publicly."),
      text("File Name", "Original file name shown to authorized users."),
      text("Content Type", "Validated MIME type."),
      number("Size Bytes", "Immutable byte size.", 0),
      select("State", ["pending_upload", "ready", "rejected"], "Private file state."),
      select("Status", ["pending", "ready", "rejected"], "File asset lifecycle state."),
      text("Version Family ID", "Stable file version lineage ID."),
      text("Supersedes Asset ID", "Previous file asset application ID."),
      text("Comment Thread ID", "File comment thread application ID."),
      longText("Rejection Reason", "Sanitized rejection reason."),
      dateTime("Finalized At", "File finalization timestamp in ISO 8601 format."),
      json("Settings JSON", "Private asset scanning and access metadata."),
      ...versionedAuditFields(),
    ],
  },
  {
    name: "File Versions",
    description: "Immutable version lineage for private participant files.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      ...eventScopeFields(),
      link("File Asset", "File Assets", "File asset represented by this version."),
      link("Submission", "Submissions", "Submission owning the file version."),
      link("Participant", "Participants", "Participant owning the file version."),
      text("File Asset ID", "File asset application ID."),
      text("Version Family ID", "Stable version lineage ID."),
      number("Version Number", "Monotonic file version number.", 0),
      text("Version Label", "Human-readable file version label."),
      text("Supersedes Version ID", "Previous file version application ID."),
      text("Object Key", "Opaque private R2 object key."),
      text("File Name", "Original file name."),
      text("Content Type", "Validated MIME type."),
      number("Size Bytes", "Immutable byte size.", 0),
      select("State", ["pending_upload", "ready", "rejected", "superseded"], "File version state."),
      select(
        "Status",
        ["pending", "ready", "rejected", "superseded"],
        "File version lifecycle state.",
      ),
      text("Checksum SHA256", "Immutable object checksum."),
      ...versionedAuditFields(),
      json("Settings JSON", "File version access, scan, and presentation settings."),
    ],
  },
  {
    name: "File Comments",
    description: "Authorized comments and review history on private file assets.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      ...eventScopeFields(),
      link("File Asset", "File Assets", "File asset receiving this comment."),
      link("File Version", "File Versions", "Optional file version receiving this comment."),
      text("File Asset ID", "File asset application ID."),
      text("File Version ID", "Optional file version application ID."),
      text("Author User ID", "D1 identity user ID of the comment author."),
      text("Author Label", "Sanitized display label for the comment author."),
      longText("Body", "Comment body."),
      select("Status", ["open", "resolved", "deleted"], "Comment lifecycle state."),
      json("Settings JSON", "Comment visibility and thread metadata."),
      ...versionedAuditFields(),
    ],
  },
  {
    name: "Email Templates",
    description: "Versioned event-scoped transactional and organizer email templates.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      ...eventScopeFields(),
      text("Name", "Template display name."),
      select(
        "Purpose",
        [
          "verification",
          "receipt",
          "reminder",
          "decision",
          "task",
          "schedule_publish",
          "schedule_update",
          "schedule_cancel",
          "organizer_group_email",
        ],
        "Approved communication template purpose.",
      ),
      select("Status", ["draft", "approved", "archived"], "Template lifecycle state."),
      select(
        "Sender",
        [
          "auth@sessionboard.namuh.co",
          "speakers@sessionboard.namuh.co",
          "calendar@sessionboard.namuh.co",
        ],
        "Approved sender identity.",
      ),
      text("Subject", "Rendered email subject template."),
      longText("HTML", "Sanitized HTML email template."),
      longText("Text", "Plain-text email template."),
      json("Variables JSON", "Template variable allow-list."),
      text("Approved By User ID", "D1 identity user ID that approved the template."),
      dateTime("Approved At", "Template approval timestamp in ISO 8601 format."),
      json("Settings JSON", "Template rendering and delivery settings."),
      ...versionedAuditFields(),
    ],
  },
  {
    name: "Email Send Snapshots",
    description: "Immutable recipient and template snapshots for email sends and delivery audit.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      ...eventScopeFields(),
      link("Email Template", "Email Templates", "Template snapshot used for this send."),
      text("Template ID", "Template application ID."),
      number("Template Version", "Template version captured by this send.", 0),
      text("Purpose", "Communication purpose."),
      text("Audience", "Recipient audience discriminator."),
      select(
        "Sender",
        [
          "auth@sessionboard.namuh.co",
          "speakers@sessionboard.namuh.co",
          "calendar@sessionboard.namuh.co",
        ],
        "Sender identity captured by this send.",
      ),
      text("Idempotency Key", "Stable communication idempotency key."),
      text("Preview ID", "Optional preview application ID."),
      json("Data JSON", "Render data captured for this send."),
      select("Status", ["queued", "delivered", "partial", "failed"], "Send lifecycle state."),
      number("Recipient Count", "Number of immutable recipient snapshots.", 0),
      json("Recipients JSON", "Immutable recipient snapshots."),
      json("Deliveries JSON", "Delivery status and provider message snapshots."),
      json("History JSON", "Send and delivery audit history."),
      json("Settings JSON", "Delivery and retry settings."),
      ...versionedAuditFields(),
    ],
  },
  {
    name: "Report Definitions",
    description: "Versioned tenant and event-scoped report definitions.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      ...eventScopeFields(),
      text("Name", "Report definition display name."),
      longText("Description", "Report definition description."),
      json("Relationships JSON", "Allow-listed report relationships."),
      json("Fields JSON", "Allow-listed report field selectors."),
      json("Order JSON", "Output column order."),
      json("Filters JSON", "Persisted report filters."),
      json("Sort JSON", "Persisted report sort rules."),
      select("Status", ["draft", "active", "archived"], "Report definition lifecycle state."),
      json("Settings JSON", "Report visibility and export settings."),
      ...versionedAuditFields(),
    ],
  },
  {
    name: "Report Runs",
    description: "Immutable report exports, parameters, and audit snapshots.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      ...eventScopeFields(),
      link("Report Definition", "Report Definitions", "Definition used for this run."),
      text("Definition ID", "Report definition application ID."),
      number("Definition Version", "Definition version captured by this run.", 0),
      text("Requester ID", "D1 identity user ID requesting the run."),
      select("Format", ["csv", "xlsx"], "Export format."),
      json("Parameters JSON", "Requested filters, sort, and run parameters."),
      dateTime("Requested At", "Run request timestamp in ISO 8601 format."),
      dateTime("Completed At", "Run completion timestamp in ISO 8601 format."),
      select("Status", ["queued", "running", "completed", "failed"], "Report run lifecycle state."),
      text("File Name", "Generated export file name."),
      text("Content Type", "Generated export MIME type."),
      text("Output Digest", "Deterministic output digest."),
      number("Row Count", "Number of exported rows.", 0),
      json("Output JSON", "Export columns, artifact metadata, and audit snapshot."),
      json("Settings JSON", "Export retention and delivery settings."),
      ...versionedAuditFields(),
    ],
  },
  {
    name: "Remix Candidates",
    description: "Human-reviewed AI content remix candidates with immutable provenance.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      ...eventScopeFields(),
      text("Source Type", "Remix source discriminator."),
      text("Source ID", "Source session or speaker application ID."),
      number("Source Revision", "Source content revision used.", 0),
      json("Fields JSON", "Requested remix fields."),
      text("Tone", "Requested remix tone."),
      longText("Guidance", "Organizer guidance supplied to the provider."),
      json("Original JSON", "Original source content snapshot."),
      json("Candidate JSON", "Generated candidate content."),
      json("Changed Fields JSON", "Fields changed by the candidate."),
      longText("Change Summary", "Human-readable change summary."),
      select("Status", ["pending", "applied", "rejected", "stale"], "Candidate lifecycle state."),
      number("Generation", "Candidate generation number.", 0),
      text("Parent Candidate ID", "Candidate application ID being regenerated."),
      text("Applied By User ID", "D1 identity user ID that applied the candidate."),
      text("Applied Revision ID", "Applied content revision application ID."),
      longText("Rejection Reason", "Organizer rejection reason."),
      longText("Stale Reason", "Reason the candidate became stale."),
      dateTime("Applied At", "Candidate application timestamp in ISO 8601 format."),
      dateTime("Rejected At", "Candidate rejection timestamp in ISO 8601 format."),
      dateTime("Stale At", "Candidate stale timestamp in ISO 8601 format."),
      json("Settings JSON", "Remix review and provider settings."),
      ...versionedAuditFields(),
    ],
  },
  {
    name: "Remix Audit",
    description: "Append-only audit trail for generated, reviewed, and applied remix candidates.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      ...eventScopeFields(),
      link("Remix Candidate", "Remix Candidates", "Candidate associated with this audit entry."),
      text("Candidate ID", "Remix candidate application ID."),
      text("Actor ID", "D1 identity user ID performing the action."),
      select(
        "Action",
        [
          "candidate.generated",
          "candidate.regenerated",
          "candidate.stale",
          "candidate.rejected",
          "candidate.applied",
        ],
        "Remix audit action.",
      ),
      dateTime("Occurred At", "Audit occurrence timestamp in ISO 8601 format."),
      select("Status", ["recorded"], "Remix audit record lifecycle state."),
      json("Details JSON", "Action details and provenance metadata."),
      json("Settings JSON", "Remix audit visibility and retention settings."),
      ...versionedAuditFields(),
    ],
  },
  {
    name: "CRM Contacts",
    description: "Organization-scoped CRM contacts; Airtable is the business-data authority.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      text("Display Name", "Contact display name."),
      text("First Name", "Contact first name."),
      text("Last Name", "Contact last name."),
      email("Email", "Current contact email address."),
      text("Phone", "Contact phone number."),
      text("Company", "Contact company."),
      text("Title", "Contact job title."),
      url("Website", "Contact website URL."),
      url("LinkedIn URL", "Contact LinkedIn URL."),
      longText("Notes", "Contact notes."),
      json("Tags JSON", "Normalized contact tags."),
      json("Custom Fields JSON", "Validated custom contact fields."),
      select("Source", ["manual", "csv", "speaker", "import"], "Contact source."),
      select("Status", ["active", "merged"], "Contact lifecycle state."),
      text("Merged Into ID", "Primary contact application ID after a merge."),
      select(
        "Pipeline Stage",
        [
          "new",
          "contacted",
          "qualified",
          "invited",
          "registered",
          "accepted",
          "declined",
          "won",
          "lost",
        ],
        "Current contact pipeline stage.",
      ),
      number("Version", "Optimistic-concurrency version.", 0),
      dateTime("Created At", "Creation timestamp in ISO 8601 format."),
      dateTime("Updated At", "Last update timestamp in ISO 8601 format."),
      json("Contact JSON", "Canonical CRM contact payload."),
      json("Settings JSON", "CRM contact settings and presentation metadata."),
      json("Audit JSON", "Append-only contact mutation audit metadata."),
      json("Provenance JSON", "Contact source and actor provenance metadata."),
    ],
  },
  {
    name: "CRM Segments",
    description: "Organization-scoped CRM segments and their matching rules.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      text("Name", "Segment display name."),
      longText("Description", "Segment description."),
      json("Rules JSON", "Validated segment matching rules."),
      select("Status", ["active", "archived"], "Segment lifecycle state."),
      number("Version", "Optimistic-concurrency version.", 0),
      text("Created By User ID", "D1 identity user ID that created the segment."),
      dateTime("Created At", "Creation timestamp in ISO 8601 format."),
      dateTime("Updated At", "Last update timestamp in ISO 8601 format."),
      json("Segment JSON", "Canonical CRM segment payload."),
      json("Settings JSON", "CRM segment settings."),
      json("Audit JSON", "Append-only segment mutation audit metadata."),
      json("Provenance JSON", "Segment actor and provenance metadata."),
    ],
  },
  {
    name: "CRM History",
    description: "Append-only organization-scoped CRM contact history.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      text("Contact ID", "Contact application ID in this history entry."),
      text("Event ID", "Optional event application ID."),
      text("Session ID", "Optional session application ID."),
      select(
        "Kind",
        ["event", "session", "submission", "attendance", "note", "pipeline"],
        "History entry kind.",
      ),
      text("Title", "History entry title."),
      longText("Detail", "History entry detail."),
      dateTime("Occurred At", "History occurrence timestamp in ISO 8601 format."),
      json("Metadata JSON", "History metadata snapshot."),
      json("History JSON", "Canonical CRM history payload."),
      json("Settings JSON", "CRM history visibility and retention settings."),
      json("Audit JSON", "Append-only history audit metadata."),
      json("Provenance JSON", "History source and provenance metadata."),
    ],
  },
  {
    name: "CRM Pipeline",
    description: "Append-only organization-scoped CRM pipeline transitions.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      text("Contact ID", "Contact application ID in this transition."),
      text("From Stage", "Previous pipeline stage."),
      text("To Stage", "New pipeline stage."),
      longText("Note", "Transition note."),
      text("Actor ID", "D1 identity user ID that changed the stage."),
      dateTime("Created At", "Transition timestamp in ISO 8601 format."),
      json("Pipeline JSON", "Canonical CRM pipeline transition payload."),
      json("Settings JSON", "CRM pipeline settings."),
      json("Audit JSON", "Append-only pipeline audit metadata."),
      json("Provenance JSON", "Pipeline actor and provenance metadata."),
    ],
  },
  {
    name: "CRM Notes",
    description: "Organization-scoped CRM notes and contact follow-up details.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      text("Contact ID", "Contact application ID receiving this note."),
      text("Author User ID", "D1 identity user ID that authored the note."),
      longText("Body", "CRM note body."),
      dateTime("Created At", "Creation timestamp in ISO 8601 format."),
      json("Note JSON", "Canonical CRM note payload."),
      json("Settings JSON", "CRM note visibility settings."),
      json("Audit JSON", "Append-only note audit metadata."),
      json("Provenance JSON", "Note actor and provenance metadata."),
    ],
  },
  {
    name: "CRM Event Projections",
    description: "Idempotent organization and event projections for CRM contacts.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      ...eventScopeFields(),
      text("Contact ID", "CRM contact application ID projected to the event."),
      select(
        "Role",
        ["speaker", "prospect", "attendee", "sponsor"],
        "Role of the CRM contact in the event.",
      ),
      text("Session ID", "Optional canonical session application ID."),
      longText("Note", "Event projection note."),
      text("Created By User ID", "D1 identity user ID that created the projection."),
      dateTime("Created At", "Creation timestamp in ISO 8601 format."),
      dateTime("Updated At", "Last projection update timestamp."),
      json("Projection JSON", "Canonical CRM event projection payload."),
      json("Settings JSON", "Event projection settings."),
      json("Audit JSON", "Append-only projection audit metadata."),
      json("Provenance JSON", "Projection actor and provenance metadata."),
    ],
  },
  {
    name: "CRM Outreach",
    description: "Organization-scoped personalized CRM outreach commands and delivery state.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      text("Contact ID", "Contact application ID receiving the outreach."),
      text("Event ID", "Optional event application ID."),
      text("Subject", "Outreach subject."),
      select("Status", ["queued", "sent", "failed"], "Outreach delivery state."),
      text("Idempotency Key", "Stable outreach idempotency key."),
      dateTime("Created At", "Creation timestamp in ISO 8601 format."),
      json("Outreach JSON", "Canonical CRM outreach command payload."),
      json("Settings JSON", "Outreach delivery settings."),
      json("Audit JSON", "Append-only outreach delivery audit metadata."),
      json("Provenance JSON", "Outreach actor and provenance metadata."),
    ],
  },
  {
    name: "CRM Imports",
    description: "Organization-scoped CRM import results and idempotency receipts.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      text("Idempotency Key", "Stable import idempotency key."),
      number("Created Count", "Number of contacts created.", 0),
      number("Updated Count", "Number of contacts updated.", 0),
      number("Skipped Count", "Number of contacts skipped.", 0),
      dateTime("Created At", "Import completion timestamp."),
      json("Import JSON", "Canonical CRM import result payload."),
      json("Settings JSON", "Import mode and settings."),
      json("Audit JSON", "Append-only import audit metadata."),
      json("Provenance JSON", "Import actor and provenance metadata."),
    ],
  },
  {
    name: "CRM Commands",
    description: "Organization-scoped CRM command receipts for idempotent mutations.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      text("Command", "CRM command discriminator."),
      text("Idempotency Key", "Stable command idempotency key."),
      dateTime("Created At", "Command receipt timestamp."),
      json("Result JSON", "Canonical command result payload."),
      json("Settings JSON", "Command replay settings."),
      json("Audit JSON", "Append-only command audit metadata."),
      json("Provenance JSON", "Command actor and provenance metadata."),
    ],
  },
  {
    name: "Reusable Fields",
    description: "Immutable tenant-owned reusable CFP field definitions.",
    fields: [
      applicationId(),
      ...organizationScopeFields(),
      text("Event ID", "Optional event application scope for reusable field usage."),
      text("Field ID", "Stable reusable field application ID."),
      number("Field Version", "Immutable reusable field version.", 0),
      select("Status", ["active", "archived"], "Reusable field lifecycle state."),
      json("Field JSON", "Validated reusable CFP form field definition."),
      json("Settings JSON", "Reusable field validation and publication settings."),
      ...versionedAuditFields(),
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
