import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey().notNull(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull(),
    contentStatus: text("content_status", { enum: ["Approved", "Needs changes"] }),
    durationMinutes: integer("duration_minutes").notNull(),
    capacityRequired: integer("capacity_required").notNull(),
    roomId: text("room_id"),
    formatId: text("format_id"),
    levelId: text("level_id"),
    version: integer("version").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    unique("sessions_organization_id_id_unique").on(table.organizationId, table.id),
    unique("sessions_event_id_unique").on(table.organizationId, table.eventId, table.id),
    index("sessions_event_status_idx").on(
      table.organizationId,
      table.eventId,
      table.status,
      table.deletedAt,
      table.updatedAt,
    ),
    index("sessions_room_idx").on(
      table.organizationId,
      table.eventId,
      table.roomId,
      table.deletedAt,
    ),
    index("sessions_format_idx").on(
      table.organizationId,
      table.eventId,
      table.formatId,
      table.deletedAt,
    ),
    index("sessions_level_idx").on(
      table.organizationId,
      table.eventId,
      table.levelId,
      table.deletedAt,
    ),
    index("sessions_title_idx").on(
      table.organizationId,
      table.eventId,
      table.title,
      table.deletedAt,
    ),
    check(
      "sessions_values_check",
      sql`${table.durationMinutes} > 0 AND ${table.capacityRequired} >= 0 AND ${table.version} > 0`,
    ),
  ],
);

function sessionJoinColumns() {
  return {
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    sessionId: text("session_id").notNull(),
    ordinal: integer("ordinal").notNull(),
  };
}

export const sessionTracks = sqliteTable(
  "session_tracks",
  { ...sessionJoinColumns(), trackId: text("track_id").notNull() },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.eventId, table.sessionId, table.trackId] }),
    foreignKey({
      columns: [table.organizationId, table.eventId, table.sessionId],
      foreignColumns: [sessions.organizationId, sessions.eventId, sessions.id],
    }).onDelete("cascade"),
    unique("session_tracks_ordinal_unique").on(
      table.organizationId,
      table.eventId,
      table.sessionId,
      table.ordinal,
    ),
    index("session_tracks_track_idx").on(
      table.organizationId,
      table.eventId,
      table.trackId,
      table.sessionId,
    ),
    check("session_tracks_ordinal_check", sql`${table.ordinal} >= 0`),
  ],
);

export const sessionTags = sqliteTable(
  "session_tags",
  { ...sessionJoinColumns(), tagId: text("tag_id").notNull() },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.eventId, table.sessionId, table.tagId] }),
    foreignKey({
      columns: [table.organizationId, table.eventId, table.sessionId],
      foreignColumns: [sessions.organizationId, sessions.eventId, sessions.id],
    }).onDelete("cascade"),
    unique("session_tags_ordinal_unique").on(
      table.organizationId,
      table.eventId,
      table.sessionId,
      table.ordinal,
    ),
    index("session_tags_tag_idx").on(
      table.organizationId,
      table.eventId,
      table.tagId,
      table.sessionId,
    ),
    check("session_tags_ordinal_check", sql`${table.ordinal} >= 0`),
  ],
);

export const sessionSpeakers = sqliteTable(
  "session_speakers",
  {
    ...sessionJoinColumns(),
    speakerId: text("speaker_id").notNull(),
    displayName: text("display_name"),
    role: text("role"),
  },
  (table) => [
    primaryKey({
      columns: [table.organizationId, table.eventId, table.sessionId, table.speakerId],
    }),
    foreignKey({
      columns: [table.organizationId, table.eventId, table.sessionId],
      foreignColumns: [sessions.organizationId, sessions.eventId, sessions.id],
    }).onDelete("cascade"),
    unique("session_speakers_ordinal_unique").on(
      table.organizationId,
      table.eventId,
      table.sessionId,
      table.ordinal,
    ),
    index("session_speakers_speaker_idx").on(
      table.organizationId,
      table.eventId,
      table.speakerId,
      table.sessionId,
    ),
    check("session_speakers_ordinal_check", sql`${table.ordinal} >= 0`),
  ],
);

export const sessionResources = sqliteTable(
  "session_resources",
  { ...sessionJoinColumns(), resourceId: text("resource_id").notNull() },
  (table) => [
    primaryKey({
      columns: [table.organizationId, table.eventId, table.sessionId, table.resourceId],
    }),
    foreignKey({
      columns: [table.organizationId, table.eventId, table.sessionId],
      foreignColumns: [sessions.organizationId, sessions.eventId, sessions.id],
    }).onDelete("cascade"),
    unique("session_resources_ordinal_unique").on(
      table.organizationId,
      table.eventId,
      table.sessionId,
      table.ordinal,
    ),
    index("session_resources_resource_idx").on(
      table.organizationId,
      table.eventId,
      table.resourceId,
      table.sessionId,
    ),
    check("session_resources_ordinal_check", sql`${table.ordinal} >= 0`),
  ],
);

export const sessionHistory = sqliteTable(
  "session_history",
  {
    id: text("id").primaryKey().notNull(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    entityType: text("entity_type", {
      enum: ["session", "room", "track", "format", "level", "tag", "settings"],
    }).notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action", {
      enum: [
        "created",
        "updated",
        "deleted",
        "restored",
        "approved",
        "needs_changes",
        "settings.updated",
      ],
    }).notNull(),
    version: integer("version").notNull(),
    actorId: text("actor_id").notNull(),
    actorLabel: text("actor_label"),
    occurredAt: text("occurred_at").notNull(),
    priorStatus: text("prior_status"),
    newStatus: text("new_status"),
    priorContentStatus: text("prior_content_status", { enum: ["Approved", "Needs changes"] }),
    newContentStatus: text("new_content_status", { enum: ["Approved", "Needs changes"] }),
    snapshotJson: text("snapshot_json"),
  },
  (table) => [
    unique("session_history_version_action_unique").on(
      table.organizationId,
      table.eventId,
      table.entityType,
      table.entityId,
      table.version,
      table.action,
      table.id,
    ),
    index("session_history_entity_idx").on(
      table.organizationId,
      table.eventId,
      table.entityType,
      table.entityId,
      table.version,
      table.occurredAt,
    ),
    index("session_history_event_idx").on(table.organizationId, table.eventId, table.occurredAt),
    check("session_history_version_check", sql`${table.version} > 0`),
    check(
      "session_history_snapshot_check",
      sql`${table.snapshotJson} IS NULL OR (json_valid(${table.snapshotJson}) AND json_type(${table.snapshotJson}) = 'object')`,
    ),
  ],
);

export const agendaStates = sqliteTable(
  "agenda_states",
  {
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    stateVersion: integer("state_version").notNull(),
    timeZone: text("time_zone").notNull(),
    minimumTravelMinutes: integer("minimum_travel_minutes").notNull(),
    validatedDraftVersion: integer("validated_draft_version"),
    validatedAt: text("validated_at"),
    currentPublishedRevisionId: text("current_published_revision_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.eventId] }),
    check(
      "agenda_states_versions_check",
      sql`${table.stateVersion} > 0 AND ${table.minimumTravelMinutes} >= 0`,
    ),
  ],
);

export const agendaDrafts = sqliteTable(
  "agenda_drafts",
  {
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    version: integer("version").notNull(),
    timeZone: text("time_zone").notNull(),
    updatedAt: text("updated_at").notNull(),
    updatedBy: text("updated_by").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.eventId] }),
    foreignKey({
      columns: [table.organizationId, table.eventId],
      foreignColumns: [agendaStates.organizationId, agendaStates.eventId],
    }).onDelete("cascade"),
    unique("agenda_drafts_version_unique").on(table.organizationId, table.eventId, table.version),
    check("agenda_drafts_version_check", sql`${table.version} > 0`),
  ],
);

export const agendaEntries = sqliteTable(
  "agenda_entries",
  {
    id: text("id").notNull(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    containerType: text("container_type", {
      enum: ["draft", "revision", "suggestion_base", "suggestion_proposed"],
    }).notNull(),
    containerId: text("container_id").notNull(),
    sessionId: text("session_id").notNull(),
    roomId: text("room_id").notNull(),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at").notNull(),
    startsAtLocal: text("starts_at_local").notNull(),
    endsAtLocal: text("ends_at_local").notNull(),
    timeZone: text("time_zone").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    format: text("format").notNull(),
    speakerNamesJson: text("speaker_names_json").notNull(),
    roomName: text("room_name").notNull(),
    trackNamesJson: text("track_names_json").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.organizationId,
        table.eventId,
        table.containerType,
        table.containerId,
        table.id,
      ],
    }),
    index("agenda_entries_container_idx").on(
      table.organizationId,
      table.eventId,
      table.containerType,
      table.containerId,
      table.startsAt,
      table.id,
    ),
    index("agenda_entries_session_idx").on(
      table.organizationId,
      table.eventId,
      table.sessionId,
      table.startsAt,
    ),
    index("agenda_entries_room_idx").on(
      table.organizationId,
      table.eventId,
      table.roomId,
      table.startsAt,
    ),
    check(
      "agenda_entries_time_check",
      sql`${table.endsAt} > ${table.startsAt} AND ${table.endsAtLocal} > ${table.startsAtLocal}`,
    ),
    check(
      "agenda_entries_metadata_check",
      sql`json_valid(${table.speakerNamesJson}) AND json_type(${table.speakerNamesJson}) = 'array' AND json_valid(${table.trackNamesJson}) AND json_type(${table.trackNamesJson}) = 'array'`,
    ),
    check(
      "agenda_entries_draft_container_check",
      sql`(${table.containerType} = 'draft' AND ${table.containerId} = ${table.eventId}) OR ${table.containerType} <> 'draft'`,
    ),
  ],
);

export const agendaEntryTracks = sqliteTable(
  "agenda_entry_tracks",
  {
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    containerType: text("container_type").notNull(),
    containerId: text("container_id").notNull(),
    entryId: text("entry_id").notNull(),
    trackId: text("track_id").notNull(),
    ordinal: integer("ordinal").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.organizationId,
        table.eventId,
        table.containerType,
        table.containerId,
        table.entryId,
        table.trackId,
      ],
    }),
    foreignKey({
      columns: [
        table.organizationId,
        table.eventId,
        table.containerType,
        table.containerId,
        table.entryId,
      ],
      foreignColumns: [
        agendaEntries.organizationId,
        agendaEntries.eventId,
        agendaEntries.containerType,
        agendaEntries.containerId,
        agendaEntries.id,
      ],
    }).onDelete("cascade"),
    unique("agenda_entry_tracks_ordinal_unique").on(
      table.organizationId,
      table.eventId,
      table.containerType,
      table.containerId,
      table.entryId,
      table.ordinal,
    ),
    index("agenda_entry_tracks_track_idx").on(
      table.organizationId,
      table.eventId,
      table.trackId,
      table.containerType,
      table.containerId,
    ),
    check("agenda_entry_tracks_ordinal_check", sql`${table.ordinal} >= 0`),
  ],
);

export const agendaWarningOverrides = sqliteTable(
  "agenda_warning_overrides",
  {
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    draftVersion: integer("draft_version").notNull(),
    warningId: text("warning_id").notNull(),
    reason: text("reason").notNull(),
    actorId: text("actor_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.organizationId, table.eventId, table.draftVersion, table.warningId],
    }),
    foreignKey({
      columns: [table.organizationId, table.eventId, table.draftVersion],
      foreignColumns: [agendaDrafts.organizationId, agendaDrafts.eventId, agendaDrafts.version],
    }).onDelete("cascade"),
    index("agenda_warning_overrides_draft_idx").on(
      table.organizationId,
      table.eventId,
      table.draftVersion,
      table.createdAt,
    ),
    check("agenda_warning_overrides_version_check", sql`${table.draftVersion} > 0`),
  ],
);

export const agendaRevisions = sqliteTable(
  "agenda_revisions",
  {
    id: text("id").primaryKey().notNull(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    revisionNumber: integer("revision_number").notNull(),
    sourceDraftVersion: integer("source_draft_version").notNull(),
    timeZone: text("time_zone").notNull(),
    publishedAt: text("published_at").notNull(),
    publishedBy: text("published_by").notNull(),
    rollbackOfRevisionId: text("rollback_of_revision_id"),
    sourceHash: text("source_hash").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.eventId, table.rollbackOfRevisionId],
      foreignColumns: [table.organizationId, table.eventId, table.id],
    }).onDelete("restrict"),
    unique("agenda_revisions_organization_id_id_unique").on(table.organizationId, table.id),
    unique("agenda_revisions_event_id_unique").on(table.organizationId, table.eventId, table.id),
    unique("agenda_revisions_number_unique").on(
      table.organizationId,
      table.eventId,
      table.revisionNumber,
    ),
    index("agenda_revisions_event_idx").on(
      table.organizationId,
      table.eventId,
      table.revisionNumber,
    ),
    index("agenda_revisions_source_draft_idx").on(
      table.organizationId,
      table.eventId,
      table.sourceDraftVersion,
    ),
    check(
      "agenda_revisions_versions_check",
      sql`${table.revisionNumber} > 0 AND ${table.sourceDraftVersion} > 0`,
    ),
    check(
      "agenda_revisions_rollback_check",
      sql`${table.rollbackOfRevisionId} IS NULL OR ${table.rollbackOfRevisionId} <> ${table.id}`,
    ),
  ],
);

export const agendaSuggestionRuns = sqliteTable(
  "agenda_suggestion_runs",
  {
    id: text("id").primaryKey().notNull(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    version: integer("version").notNull(),
    status: text("status", {
      enum: ["pending", "rejected", "superseded", "stale", "applied"],
    }).notNull(),
    baseDraftVersion: integer("base_draft_version").notNull(),
    baseDraftRevision: integer("base_draft_revision").notNull(),
    criteriaJson: text("criteria_json").notNull(),
    diffJson: text("diff_json").notNull(),
    diagnosticsJson: text("diagnostics_json").notNull(),
    generatedAt: text("generated_at").notNull(),
    generatedBy: text("generated_by").notNull(),
    regenerationOfRunId: text("regeneration_of_run_id"),
    acceptedChangeIdsJson: text("accepted_change_ids_json").notNull(),
    appliedChangeIdsJson: text("applied_change_ids_json").notNull(),
    rejectedAt: text("rejected_at"),
    rejectedBy: text("rejected_by"),
    supersededAt: text("superseded_at"),
    appliedAt: text("applied_at"),
    appliedBy: text("applied_by"),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.eventId, table.regenerationOfRunId],
      foreignColumns: [table.organizationId, table.eventId, table.id],
    }).onDelete("restrict"),
    unique("agenda_suggestion_runs_organization_id_id_unique").on(table.organizationId, table.id),
    unique("agenda_suggestion_runs_event_id_unique").on(
      table.organizationId,
      table.eventId,
      table.id,
    ),
    index("agenda_suggestion_runs_status_idx").on(
      table.organizationId,
      table.eventId,
      table.status,
      table.generatedAt,
    ),
    index("agenda_suggestion_runs_base_version_idx").on(
      table.organizationId,
      table.eventId,
      table.baseDraftVersion,
      table.status,
    ),
    check(
      "agenda_suggestion_runs_versions_check",
      sql`${table.version} > 0 AND ${table.baseDraftVersion} > 0 AND ${table.baseDraftRevision} = ${table.baseDraftVersion}`,
    ),
    check(
      "agenda_suggestion_runs_json_check",
      sql`json_valid(${table.criteriaJson}) AND json_type(${table.criteriaJson}) = 'object' AND json_valid(${table.diffJson}) AND json_type(${table.diffJson}) = 'object' AND json_valid(${table.diagnosticsJson}) AND json_type(${table.diagnosticsJson}) = 'object' AND json_valid(${table.acceptedChangeIdsJson}) AND json_type(${table.acceptedChangeIdsJson}) = 'array' AND json_valid(${table.appliedChangeIdsJson}) AND json_type(${table.appliedChangeIdsJson}) = 'array'`,
    ),
    check(
      "agenda_suggestion_runs_terminal_check",
      sql`((${table.status} = 'rejected') = (${table.rejectedAt} IS NOT NULL AND ${table.rejectedBy} IS NOT NULL)) AND ((${table.status} = 'applied') = (${table.appliedAt} IS NOT NULL AND ${table.appliedBy} IS NOT NULL)) AND (${table.status} <> 'superseded' OR ${table.supersededAt} IS NOT NULL)`,
    ),
    check(
      "agenda_suggestion_runs_regeneration_check",
      sql`${table.regenerationOfRunId} IS NULL OR ${table.regenerationOfRunId} <> ${table.id}`,
    ),
  ],
);

export const agendaSuggestionChanges = sqliteTable(
  "agenda_suggestion_changes",
  {
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    runId: text("run_id").notNull(),
    id: text("id").notNull(),
    kind: text("kind", { enum: ["add", "move", "change", "remove"] }).notNull(),
    entryId: text("entry_id").notNull(),
    sessionId: text("session_id").notNull(),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    summary: text("summary").notNull(),
    rationale: text("rationale"),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.eventId, table.runId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.eventId, table.runId],
      foreignColumns: [
        agendaSuggestionRuns.organizationId,
        agendaSuggestionRuns.eventId,
        agendaSuggestionRuns.id,
      ],
    }).onDelete("cascade"),
    index("agenda_suggestion_changes_run_idx").on(
      table.organizationId,
      table.eventId,
      table.runId,
      table.id,
    ),
    index("agenda_suggestion_changes_session_idx").on(
      table.organizationId,
      table.eventId,
      table.sessionId,
      table.runId,
    ),
    check(
      "agenda_suggestion_changes_shape_check",
      sql`(${table.kind} = 'add' AND ${table.beforeJson} IS NULL AND ${table.afterJson} IS NOT NULL) OR (${table.kind} = 'remove' AND ${table.beforeJson} IS NOT NULL AND ${table.afterJson} IS NULL) OR (${table.kind} IN ('move', 'change') AND ${table.beforeJson} IS NOT NULL AND ${table.afterJson} IS NOT NULL)`,
    ),
    check(
      "agenda_suggestion_changes_json_check",
      sql`(${table.beforeJson} IS NULL OR (json_valid(${table.beforeJson}) AND json_type(${table.beforeJson}) = 'object')) AND (${table.afterJson} IS NULL OR (json_valid(${table.afterJson}) AND json_type(${table.afterJson}) = 'object'))`,
    ),
  ],
);

export const agendaOutboxEvents = sqliteTable(
  "agenda_outbox_events",
  {
    id: text("id").primaryKey().notNull(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    revisionId: text("revision_id").notNull(),
    type: text("type", {
      enum: ["calendar.agenda-updated", "embed-cache.invalidate", "public-agenda.updated"],
    }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.eventId, table.revisionId],
      foreignColumns: [agendaRevisions.organizationId, agendaRevisions.eventId, agendaRevisions.id],
    }).onDelete("restrict"),
    unique("agenda_outbox_events_organization_id_id_unique").on(table.organizationId, table.id),
    unique("agenda_outbox_events_event_id_unique").on(
      table.organizationId,
      table.eventId,
      table.id,
    ),
    unique("agenda_outbox_events_idempotency_unique").on(
      table.organizationId,
      table.eventId,
      table.idempotencyKey,
    ),
    index("agenda_outbox_events_event_idx").on(
      table.organizationId,
      table.eventId,
      table.createdAt,
    ),
  ],
);
