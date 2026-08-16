import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const reportDefinitions = sqliteTable(
  "report_definitions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    relationshipsJson: text("relationships_json").notNull(),
    fieldsJson: text("fields_json").notNull(),
    orderJson: text("order_json").notNull(),
    filtersJson: text("filters_json").notNull(),
    sortJson: text("sort_json").notNull(),
    version: integer("version").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (t) => [
    uniqueIndex("report_definitions_scope_uidx").on(t.organizationId, t.id),
    uniqueIndex("report_definitions_event_scope_uidx").on(t.organizationId, t.eventId, t.id),
    check("report_definitions_version_check", sql`${t.version} > 0`),
    ...[t.relationshipsJson, t.fieldsJson, t.orderJson, t.filtersJson, t.sortJson].map((c, i) =>
      check(
        `report_definitions_json_${i}_check`,
        sql`json_valid(${c}) AND json_type(${c}) = 'array'`,
      ),
    ),
    index("report_definitions_list_idx").on(t.organizationId, t.eventId, t.deletedAt, t.name),
    index("report_definitions_find_idx").on(t.organizationId, t.id, t.deletedAt),
  ],
);

export const reportDefinitionVersions = sqliteTable(
  "report_definition_versions",
  {
    definitionId: text("definition_id").notNull(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    version: integer("version").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.definitionId, t.version] }),
    uniqueIndex("report_definition_versions_scope_uidx").on(
      t.organizationId,
      t.eventId,
      t.definitionId,
      t.version,
    ),
    foreignKey({
      columns: [t.organizationId, t.eventId, t.definitionId],
      foreignColumns: [
        reportDefinitions.organizationId,
        reportDefinitions.eventId,
        reportDefinitions.id,
      ],
    }).onDelete("restrict"),
    check("report_definition_versions_version_check", sql`${t.version} > 0`),
    check(
      "report_definition_versions_json_check",
      sql`json_valid(${t.snapshotJson}) AND json_type(${t.snapshotJson}) = 'object'`,
    ),
    index("report_definition_versions_latest_idx").on(t.definitionId, t.version),
  ],
);

export const reportRuns = sqliteTable(
  "report_runs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    definitionId: text("definition_id").notNull(),
    definitionVersion: integer("definition_version").notNull(),
    requesterId: text("requester_id").notNull(),
    format: text("format").notNull(),
    parametersJson: text("parameters_json").notNull(),
    requestedAt: text("requested_at").notNull(),
    completedAt: text("completed_at").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    body: text("body").notNull(),
    columnsJson: text("columns_json").notNull(),
    rowCount: integer("row_count").notNull(),
    outputDigest: text("output_digest").notNull(),
    auditJson: text("audit_json").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.definitionId, t.definitionVersion],
      foreignColumns: [reportDefinitionVersions.definitionId, reportDefinitionVersions.version],
    }).onDelete("restrict"),
    check("report_runs_format_check", sql`${t.format} IN ('csv','xlsx')`),
    check("report_runs_version_check", sql`${t.definitionVersion} > 0`),
    check("report_runs_row_count_check", sql`${t.rowCount} >= 0`),
    check(
      "report_runs_parameters_json_check",
      sql`json_valid(${t.parametersJson}) AND json_type(${t.parametersJson}) = 'object'`,
    ),
    check(
      "report_runs_columns_json_check",
      sql`json_valid(${t.columnsJson}) AND json_type(${t.columnsJson}) = 'array'`,
    ),
    check(
      "report_runs_audit_json_check",
      sql`json_valid(${t.auditJson}) AND json_type(${t.auditJson}) = 'object'`,
    ),
    index("report_runs_definition_idx").on(
      t.organizationId,
      t.eventId,
      t.definitionId,
      t.completedAt,
    ),
    index("report_runs_event_idx").on(t.organizationId, t.eventId, t.completedAt),
    index("report_runs_requester_idx").on(t.organizationId, t.requesterId, t.completedAt),
  ],
);

export const remixCandidates = sqliteTable(
  "remix_candidates",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    sourceRevision: integer("source_revision").notNull(),
    fieldsJson: text("fields_json").notNull(),
    tone: text("tone").notNull(),
    guidance: text("guidance").notNull(),
    originalJson: text("original_json").notNull(),
    candidateJson: text("candidate_json").notNull(),
    changedFieldsJson: text("changed_fields_json").notNull(),
    changeSummary: text("change_summary").notNull(),
    provenanceJson: text("provenance_json").notNull(),
    status: text("status").notNull(),
    version: integer("version").notNull(),
    generation: integer("generation").notNull(),
    parentCandidateId: text("parent_candidate_id"),
    createdAt: text("created_at").notNull(),
    createdBy: text("created_by").notNull(),
    appliedAt: text("applied_at"),
    appliedBy: text("applied_by"),
    appliedRevisionId: text("applied_revision_id"),
    rejectedAt: text("rejected_at"),
    rejectedBy: text("rejected_by"),
    rejectionReason: text("rejection_reason"),
    staleAt: text("stale_at"),
    staleReason: text("stale_reason"),
  },
  (t) => [
    uniqueIndex("remix_candidates_scope_uidx").on(t.organizationId, t.id),
    uniqueIndex("remix_candidates_event_scope_uidx").on(t.organizationId, t.eventId, t.id),
    foreignKey({
      columns: [t.organizationId, t.eventId, t.parentCandidateId],
      foreignColumns: [t.organizationId, t.eventId, t.id],
    }).onDelete("restrict"),
    check("remix_candidates_source_check", sql`${t.sourceType} IN ('session','speaker')`),
    check(
      "remix_candidates_status_check",
      sql`${t.status} IN ('pending','applied','rejected','stale')`,
    ),
    check(
      "remix_candidates_numbers_check",
      sql`${t.sourceRevision} > 0 AND ${t.version} > 0 AND ${t.generation} > 0`,
    ),
    check(
      "remix_candidates_fields_json_check",
      sql`json_valid(${t.fieldsJson}) AND json_type(${t.fieldsJson}) = 'array'`,
    ),
    check(
      "remix_candidates_original_json_check",
      sql`json_valid(${t.originalJson}) AND json_type(${t.originalJson}) = 'object'`,
    ),
    check(
      "remix_candidates_candidate_json_check",
      sql`json_valid(${t.candidateJson}) AND json_type(${t.candidateJson}) = 'object'`,
    ),
    check(
      "remix_candidates_changed_fields_json_check",
      sql`json_valid(${t.changedFieldsJson}) AND json_type(${t.changedFieldsJson}) = 'array'`,
    ),
    check(
      "remix_candidates_provenance_json_check",
      sql`json_valid(${t.provenanceJson}) AND json_type(${t.provenanceJson}) = 'object'`,
    ),
    check(
      "remix_candidates_lifecycle_check",
      sql`(${t.status} <> 'applied' OR (${t.appliedAt} IS NOT NULL AND ${t.appliedBy} IS NOT NULL AND ${t.appliedRevisionId} IS NOT NULL)) AND (${t.status} <> 'rejected' OR (${t.rejectedAt} IS NOT NULL AND ${t.rejectedBy} IS NOT NULL)) AND (${t.status} <> 'stale' OR ${t.staleAt} IS NOT NULL)`,
    ),
    index("remix_candidates_status_idx").on(t.organizationId, t.eventId, t.status, t.createdAt),
    index("remix_candidates_source_idx").on(
      t.organizationId,
      t.eventId,
      t.sourceType,
      t.sourceId,
      t.createdAt,
    ),
    index("remix_candidates_parent_idx").on(t.parentCandidateId),
  ],
);

export const contentRevisions = sqliteTable(
  "content_revisions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    sourceRevision: integer("source_revision").notNull(),
    fieldsJson: text("fields_json").notNull(),
    contentJson: text("content_json").notNull(),
    candidateId: text("candidate_id").notNull(),
    appliedBy: text("applied_by").notNull(),
    appliedAt: text("applied_at").notNull(),
  },
  (t) => [
    uniqueIndex("content_revisions_source_uidx").on(
      t.organizationId,
      t.eventId,
      t.sourceType,
      t.sourceId,
      t.sourceRevision,
    ),
    uniqueIndex("content_revisions_candidate_uidx").on(t.candidateId),
    foreignKey({
      columns: [t.organizationId, t.eventId, t.candidateId],
      foreignColumns: [remixCandidates.organizationId, remixCandidates.eventId, remixCandidates.id],
    }).onDelete("restrict"),
    check("content_revisions_source_check", sql`${t.sourceType} IN ('session','speaker')`),
    check("content_revisions_revision_check", sql`${t.sourceRevision} > 0`),
    check(
      "content_revisions_fields_json_check",
      sql`json_valid(${t.fieldsJson}) AND json_type(${t.fieldsJson})='array'`,
    ),
    check(
      "content_revisions_content_json_check",
      sql`json_valid(${t.contentJson}) AND json_type(${t.contentJson})='object'`,
    ),
  ],
);

export const remixAudit = sqliteTable(
  "remix_audit",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    candidateId: text("candidate_id").notNull(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    createdAt: text("created_at").notNull(),
    detailsJson: text("details_json").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.eventId, t.candidateId],
      foreignColumns: [remixCandidates.organizationId, remixCandidates.eventId, remixCandidates.id],
    }).onDelete("restrict"),
    check(
      "remix_audit_action_check",
      sql`${t.action} IN ('candidate.generated','candidate.regenerated','candidate.stale','candidate.rejected','candidate.applied')`,
    ),
    check(
      "remix_audit_details_json_check",
      sql`json_valid(${t.detailsJson}) AND json_type(${t.detailsJson})='object'`,
    ),
    index("remix_audit_candidate_idx").on(t.candidateId, t.createdAt),
    index("remix_audit_event_idx").on(t.organizationId, t.eventId, t.createdAt),
  ],
);

export const programPublicationStates = sqliteTable(
  "program_publication_states",
  {
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    version: integer("version").notNull(),
    servedRevision: integer("served_revision"),
    pendingRevision: integer("pending_revision"),
    pendingReleaseId: text("pending_release_id"),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.eventId] }),
    check("program_publication_states_version_check", sql`${t.version}>0`),
    check(
      "program_publication_states_revisions_check",
      sql`(${t.servedRevision} IS NULL OR ${t.servedRevision}>0) AND (${t.pendingRevision} IS NULL OR ${t.pendingRevision}>0)`,
    ),
    check(
      "program_publication_states_pending_check",
      sql`(${t.pendingRevision} IS NULL)=(${t.pendingReleaseId} IS NULL)`,
    ),
    index("program_publication_states_pending_idx").on(t.organizationId, t.pendingReleaseId),
  ],
);

export const programAgendaProjections = sqliteTable(
  "program_agenda_projections",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    revisionNumber: integer("revision_number").notNull(),
    sourceHash: text("source_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("program_agenda_projections_revision_uidx").on(
      t.organizationId,
      t.eventId,
      t.revisionNumber,
    ),
    uniqueIndex("program_agenda_projections_hash_uidx").on(
      t.organizationId,
      t.eventId,
      t.sourceHash,
    ),
    check("program_agenda_projections_revision_check", sql`${t.revisionNumber}>0`),
    index("program_agenda_projections_event_idx").on(t.organizationId, t.eventId, t.revisionNumber),
  ],
);
export const programAgendaProjectionEntries = sqliteTable(
  "program_agenda_projection_entries",
  {
    projectionId: text("projection_id").notNull(),
    id: text("id").notNull(),
    sessionId: text("session_id").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    format: text("format"),
    startsAt: text("starts_at"),
    endsAt: text("ends_at"),
    startsAtLocal: text("starts_at_local"),
    endsAtLocal: text("ends_at_local"),
    timeZone: text("time_zone"),
    roomName: text("room_name"),
    trackNamesJson: text("track_names_json").notNull(),
    speakerNamesJson: text("speaker_names_json").notNull(),
    trackIdsJson: text("track_ids_json").notNull(),
    status: text("status").notNull(),
    ordinal: integer("ordinal").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.projectionId, t.id] }),
    uniqueIndex("program_agenda_projection_entries_ordinal_uidx").on(t.projectionId, t.ordinal),
    foreignKey({
      columns: [t.projectionId],
      foreignColumns: [programAgendaProjections.id],
    }).onDelete("cascade"),
    check("program_agenda_projection_entries_ordinal_check", sql`${t.ordinal}>=0`),
    ...[t.trackNamesJson, t.speakerNamesJson, t.trackIdsJson].map((c, i) =>
      check(
        `program_agenda_projection_entries_json_${i}_check`,
        sql`json_valid(${c}) AND json_type(${c})='array'`,
      ),
    ),
  ],
);

export const programSpeakerProjections = sqliteTable(
  "program_speaker_projections",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    revisionNumber: integer("revision_number").notNull(),
    sourceHash: text("source_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("program_speaker_projections_revision_uidx").on(
      t.organizationId,
      t.eventId,
      t.revisionNumber,
    ),
    uniqueIndex("program_speaker_projections_hash_uidx").on(
      t.organizationId,
      t.eventId,
      t.sourceHash,
    ),
    check("program_speaker_projections_revision_check", sql`${t.revisionNumber}>0`),
    index("program_speaker_projections_event_idx").on(
      t.organizationId,
      t.eventId,
      t.revisionNumber,
    ),
  ],
);
export const programSpeakerProjectionEntries = sqliteTable(
  "program_speaker_projection_entries",
  {
    projectionId: text("projection_id").notNull(),
    id: text("id").notNull(),
    participantId: text("participant_id").notNull(),
    sessionIdsJson: text("session_ids_json").notNull(),
    displayName: text("display_name").notNull(),
    title: text("title"),
    company: text("company"),
    bio: text("bio"),
    avatarUrl: text("avatar_url"),
    ordinal: integer("ordinal").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.projectionId, t.id] }),
    uniqueIndex("program_speaker_projection_entries_ordinal_uidx").on(t.projectionId, t.ordinal),
    foreignKey({
      columns: [t.projectionId],
      foreignColumns: [programSpeakerProjections.id],
    }).onDelete("cascade"),
    check("program_speaker_projection_entries_ordinal_check", sql`${t.ordinal}>=0`),
    check(
      "program_speaker_projection_entries_sessions_json_check",
      sql`json_valid(${t.sessionIdsJson}) AND json_type(${t.sessionIdsJson})='array'`,
    ),
    index("program_speaker_projection_entries_participant_idx").on(t.participantId),
  ],
);

export const programReleases = sqliteTable(
  "program_releases",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    revision: integer("revision").notNull(),
    lifecycle: text("lifecycle").notNull(),
    agendaProjectionId: text("agenda_projection_id").notNull(),
    agendaRevisionNumber: integer("agenda_revision_number").notNull(),
    agendaSourceHash: text("agenda_source_hash").notNull(),
    speakerProjectionId: text("speaker_projection_id").notNull(),
    speakerRevisionNumber: integer("speaker_revision_number").notNull(),
    speakerSourceHash: text("speaker_source_hash").notNull(),
    approvedContentRevision: integer("approved_content_revision").notNull(),
    approvedProfileRevision: integer("approved_profile_revision").notNull(),
    releasedAssetRevision: integer("released_asset_revision").notNull(),
    actorId: text("actor_id").notNull(),
    publishedAt: text("published_at").notNull(),
    parentServedRevision: integer("parent_served_revision"),
    rollbackTargetRevision: integer("rollback_target_revision"),
    cacheRevision: integer("cache_revision").notNull(),
    sourceTrigger: text("source_trigger").notNull(),
    failureReason: text("failure_reason"),
  },
  (t) => [
    uniqueIndex("program_releases_revision_uidx").on(t.organizationId, t.eventId, t.revision),
    uniqueIndex("program_releases_scope_uidx").on(t.organizationId, t.eventId, t.id),
    foreignKey({
      columns: [t.agendaProjectionId],
      foreignColumns: [programAgendaProjections.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.speakerProjectionId],
      foreignColumns: [programSpeakerProjections.id],
    }).onDelete("restrict"),
    check("program_releases_lifecycle_check", sql`${t.lifecycle} IN ('pending','served','failed')`),
    check(
      "program_releases_trigger_check",
      sql`${t.sourceTrigger} IN ('initial-publication','approved-content-change','confirmed-profile-change','released-asset-change','released-schedule-change')`,
    ),
    check(
      "program_releases_numbers_check",
      sql`${t.revision}>0 AND ${t.agendaRevisionNumber}>0 AND ${t.speakerRevisionNumber}>0 AND ${t.approvedContentRevision}>=0 AND ${t.approvedProfileRevision}>=0 AND ${t.releasedAssetRevision}>=0 AND ${t.cacheRevision}>0`,
    ),
    check(
      "program_releases_failure_check",
      sql`(${t.lifecycle}='failed')=(${t.failureReason} IS NOT NULL)`,
    ),
    index("program_releases_lifecycle_idx").on(
      t.organizationId,
      t.eventId,
      t.lifecycle,
      t.revision,
    ),
    index("program_releases_parent_idx").on(t.organizationId, t.eventId, t.parentServedRevision),
    index("program_releases_rollback_idx").on(
      t.organizationId,
      t.eventId,
      t.rollbackTargetRevision,
    ),
  ],
);
