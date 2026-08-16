-- Reports, remix provenance, and program publication authoritative D1 schema.
PRAGMA foreign_keys = ON;

CREATE TABLE `content_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`source_revision` integer NOT NULL,
	`fields_json` text NOT NULL,
	`content_json` text NOT NULL,
	`candidate_id` text NOT NULL,
	`applied_by` text NOT NULL,
	`applied_at` text NOT NULL,
	FOREIGN KEY (`organization_id`,`event_id`,`candidate_id`) REFERENCES `remix_candidates`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "content_revisions_source_check" CHECK("content_revisions"."source_type" IN ('session','speaker')),
	CONSTRAINT "content_revisions_revision_check" CHECK("content_revisions"."source_revision" > 0),
	CONSTRAINT "content_revisions_fields_json_check" CHECK(json_valid("content_revisions"."fields_json") AND json_type("content_revisions"."fields_json")='array'),
	CONSTRAINT "content_revisions_content_json_check" CHECK(json_valid("content_revisions"."content_json") AND json_type("content_revisions"."content_json")='object')
) STRICT;

CREATE UNIQUE INDEX `content_revisions_source_uidx` ON `content_revisions` (`organization_id`,`event_id`,`source_type`,`source_id`,`source_revision`);CREATE UNIQUE INDEX `content_revisions_candidate_uidx` ON `content_revisions` (`candidate_id`);CREATE TABLE `program_agenda_projection_entries` (
	`projection_id` text NOT NULL,
	`id` text NOT NULL,
	`session_id` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`format` text,
	`starts_at` text,
	`ends_at` text,
	`starts_at_local` text,
	`ends_at_local` text,
	`time_zone` text,
	`room_name` text,
	`track_names_json` text NOT NULL,
	`speaker_names_json` text NOT NULL,
	`track_ids_json` text NOT NULL,
	`status` text NOT NULL,
	`ordinal` integer NOT NULL,
	PRIMARY KEY(`projection_id`, `id`),
	FOREIGN KEY (`projection_id`) REFERENCES `program_agenda_projections`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "program_agenda_projection_entries_ordinal_check" CHECK("program_agenda_projection_entries"."ordinal">=0),
	CONSTRAINT "program_agenda_projection_entries_json_0_check" CHECK(json_valid("program_agenda_projection_entries"."track_names_json") AND json_type("program_agenda_projection_entries"."track_names_json")='array'),
	CONSTRAINT "program_agenda_projection_entries_json_1_check" CHECK(json_valid("program_agenda_projection_entries"."speaker_names_json") AND json_type("program_agenda_projection_entries"."speaker_names_json")='array'),
	CONSTRAINT "program_agenda_projection_entries_json_2_check" CHECK(json_valid("program_agenda_projection_entries"."track_ids_json") AND json_type("program_agenda_projection_entries"."track_ids_json")='array')
) STRICT;

CREATE UNIQUE INDEX `program_agenda_projection_entries_ordinal_uidx` ON `program_agenda_projection_entries` (`projection_id`,`ordinal`);CREATE TABLE `program_agenda_projections` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`revision_number` integer NOT NULL,
	`source_hash` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "program_agenda_projections_revision_check" CHECK("program_agenda_projections"."revision_number">0)
) STRICT;

CREATE UNIQUE INDEX `program_agenda_projections_revision_uidx` ON `program_agenda_projections` (`organization_id`,`event_id`,`revision_number`);CREATE UNIQUE INDEX `program_agenda_projections_hash_uidx` ON `program_agenda_projections` (`organization_id`,`event_id`,`source_hash`);CREATE INDEX `program_agenda_projections_event_idx` ON `program_agenda_projections` (`organization_id`,`event_id`,`revision_number`);CREATE TABLE `program_publication_states` (
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`version` integer NOT NULL,
	`served_revision` integer,
	`pending_revision` integer,
	`pending_release_id` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`organization_id`, `event_id`),
	CONSTRAINT "program_publication_states_version_check" CHECK("program_publication_states"."version">0),
	CONSTRAINT "program_publication_states_revisions_check" CHECK(("program_publication_states"."served_revision" IS NULL OR "program_publication_states"."served_revision">0) AND ("program_publication_states"."pending_revision" IS NULL OR "program_publication_states"."pending_revision">0)),
	CONSTRAINT "program_publication_states_pending_check" CHECK(("program_publication_states"."pending_revision" IS NULL)=("program_publication_states"."pending_release_id" IS NULL))
) STRICT;

CREATE INDEX `program_publication_states_pending_idx` ON `program_publication_states` (`organization_id`,`pending_release_id`);CREATE TABLE `program_releases` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`revision` integer NOT NULL,
	`lifecycle` text NOT NULL,
	`agenda_projection_id` text NOT NULL,
	`agenda_revision_number` integer NOT NULL,
	`agenda_source_hash` text NOT NULL,
	`speaker_projection_id` text NOT NULL,
	`speaker_revision_number` integer NOT NULL,
	`speaker_source_hash` text NOT NULL,
	`approved_content_revision` integer NOT NULL,
	`approved_profile_revision` integer NOT NULL,
	`released_asset_revision` integer NOT NULL,
	`actor_id` text NOT NULL,
	`published_at` text NOT NULL,
	`parent_served_revision` integer,
	`rollback_target_revision` integer,
	`cache_revision` integer NOT NULL,
	`source_trigger` text NOT NULL,
	`failure_reason` text,
	FOREIGN KEY (`agenda_projection_id`) REFERENCES `program_agenda_projections`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`speaker_projection_id`) REFERENCES `program_speaker_projections`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "program_releases_lifecycle_check" CHECK("program_releases"."lifecycle" IN ('pending','served','failed')),
	CONSTRAINT "program_releases_trigger_check" CHECK("program_releases"."source_trigger" IN ('initial-publication','approved-content-change','confirmed-profile-change','released-asset-change','released-schedule-change')),
	CONSTRAINT "program_releases_numbers_check" CHECK("program_releases"."revision">0 AND "program_releases"."agenda_revision_number">0 AND "program_releases"."speaker_revision_number">0 AND "program_releases"."approved_content_revision">=0 AND "program_releases"."approved_profile_revision">=0 AND "program_releases"."released_asset_revision">=0 AND "program_releases"."cache_revision">0),
	CONSTRAINT "program_releases_failure_check" CHECK(("program_releases"."lifecycle"='failed')=("program_releases"."failure_reason" IS NOT NULL))
) STRICT;

CREATE UNIQUE INDEX `program_releases_revision_uidx` ON `program_releases` (`organization_id`,`event_id`,`revision`);CREATE UNIQUE INDEX `program_releases_scope_uidx` ON `program_releases` (`organization_id`,`event_id`,`id`);CREATE INDEX `program_releases_lifecycle_idx` ON `program_releases` (`organization_id`,`event_id`,`lifecycle`,`revision`);CREATE INDEX `program_releases_parent_idx` ON `program_releases` (`organization_id`,`event_id`,`parent_served_revision`);CREATE INDEX `program_releases_rollback_idx` ON `program_releases` (`organization_id`,`event_id`,`rollback_target_revision`);CREATE TABLE `program_speaker_projection_entries` (
	`projection_id` text NOT NULL,
	`id` text NOT NULL,
	`participant_id` text NOT NULL,
	`session_ids_json` text NOT NULL,
	`display_name` text NOT NULL,
	`title` text,
	`company` text,
	`bio` text,
	`avatar_url` text,
	`ordinal` integer NOT NULL,
	PRIMARY KEY(`projection_id`, `id`),
	FOREIGN KEY (`projection_id`) REFERENCES `program_speaker_projections`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "program_speaker_projection_entries_ordinal_check" CHECK("program_speaker_projection_entries"."ordinal">=0),
	CONSTRAINT "program_speaker_projection_entries_sessions_json_check" CHECK(json_valid("program_speaker_projection_entries"."session_ids_json") AND json_type("program_speaker_projection_entries"."session_ids_json")='array')
) STRICT;

CREATE UNIQUE INDEX `program_speaker_projection_entries_ordinal_uidx` ON `program_speaker_projection_entries` (`projection_id`,`ordinal`);CREATE INDEX `program_speaker_projection_entries_participant_idx` ON `program_speaker_projection_entries` (`participant_id`);CREATE TABLE `program_speaker_projections` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`revision_number` integer NOT NULL,
	`source_hash` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "program_speaker_projections_revision_check" CHECK("program_speaker_projections"."revision_number">0)
) STRICT;

CREATE UNIQUE INDEX `program_speaker_projections_revision_uidx` ON `program_speaker_projections` (`organization_id`,`event_id`,`revision_number`);CREATE UNIQUE INDEX `program_speaker_projections_hash_uidx` ON `program_speaker_projections` (`organization_id`,`event_id`,`source_hash`);CREATE INDEX `program_speaker_projections_event_idx` ON `program_speaker_projections` (`organization_id`,`event_id`,`revision_number`);CREATE TABLE `remix_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`created_at` text NOT NULL,
	`details_json` text NOT NULL,
	FOREIGN KEY (`organization_id`,`event_id`,`candidate_id`) REFERENCES `remix_candidates`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "remix_audit_action_check" CHECK("remix_audit"."action" IN ('candidate.generated','candidate.regenerated','candidate.stale','candidate.rejected','candidate.applied')),
	CONSTRAINT "remix_audit_details_json_check" CHECK(json_valid("remix_audit"."details_json") AND json_type("remix_audit"."details_json")='object')
) STRICT;

CREATE INDEX `remix_audit_candidate_idx` ON `remix_audit` (`candidate_id`,`created_at`);CREATE INDEX `remix_audit_event_idx` ON `remix_audit` (`organization_id`,`event_id`,`created_at`);CREATE TABLE `remix_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`source_revision` integer NOT NULL,
	`fields_json` text NOT NULL,
	`tone` text NOT NULL,
	`guidance` text NOT NULL,
	`original_json` text NOT NULL,
	`candidate_json` text NOT NULL,
	`changed_fields_json` text NOT NULL,
	`change_summary` text NOT NULL,
	`provenance_json` text NOT NULL,
	`status` text NOT NULL,
	`version` integer NOT NULL,
	`generation` integer NOT NULL,
	`parent_candidate_id` text,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL,
	`applied_at` text,
	`applied_by` text,
	`applied_revision_id` text,
	`rejected_at` text,
	`rejected_by` text,
	`rejection_reason` text,
	`stale_at` text,
	`stale_reason` text,
	FOREIGN KEY (`organization_id`,`event_id`,`parent_candidate_id`) REFERENCES `remix_candidates`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "remix_candidates_source_check" CHECK("remix_candidates"."source_type" IN ('session','speaker')),
	CONSTRAINT "remix_candidates_status_check" CHECK("remix_candidates"."status" IN ('pending','applied','rejected','stale')),
	CONSTRAINT "remix_candidates_numbers_check" CHECK("remix_candidates"."source_revision" > 0 AND "remix_candidates"."version" > 0 AND "remix_candidates"."generation" > 0),
	CONSTRAINT "remix_candidates_fields_json_check" CHECK(json_valid("remix_candidates"."fields_json") AND json_type("remix_candidates"."fields_json") = 'array'),
	CONSTRAINT "remix_candidates_original_json_check" CHECK(json_valid("remix_candidates"."original_json") AND json_type("remix_candidates"."original_json") = 'object'),
	CONSTRAINT "remix_candidates_candidate_json_check" CHECK(json_valid("remix_candidates"."candidate_json") AND json_type("remix_candidates"."candidate_json") = 'object'),
	CONSTRAINT "remix_candidates_changed_fields_json_check" CHECK(json_valid("remix_candidates"."changed_fields_json") AND json_type("remix_candidates"."changed_fields_json") = 'array'),
	CONSTRAINT "remix_candidates_provenance_json_check" CHECK(json_valid("remix_candidates"."provenance_json") AND json_type("remix_candidates"."provenance_json") = 'object'),
	CONSTRAINT "remix_candidates_lifecycle_check" CHECK(("remix_candidates"."status" <> 'applied' OR ("remix_candidates"."applied_at" IS NOT NULL AND "remix_candidates"."applied_by" IS NOT NULL AND "remix_candidates"."applied_revision_id" IS NOT NULL)) AND ("remix_candidates"."status" <> 'rejected' OR ("remix_candidates"."rejected_at" IS NOT NULL AND "remix_candidates"."rejected_by" IS NOT NULL)) AND ("remix_candidates"."status" <> 'stale' OR "remix_candidates"."stale_at" IS NOT NULL))
) STRICT;

CREATE UNIQUE INDEX `remix_candidates_scope_uidx` ON `remix_candidates` (`organization_id`,`id`);CREATE UNIQUE INDEX `remix_candidates_event_scope_uidx` ON `remix_candidates` (`organization_id`,`event_id`,`id`);CREATE INDEX `remix_candidates_status_idx` ON `remix_candidates` (`organization_id`,`event_id`,`status`,`created_at`);CREATE INDEX `remix_candidates_source_idx` ON `remix_candidates` (`organization_id`,`event_id`,`source_type`,`source_id`,`created_at`);CREATE INDEX `remix_candidates_parent_idx` ON `remix_candidates` (`parent_candidate_id`);CREATE TABLE `report_definition_versions` (
	`definition_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`version` integer NOT NULL,
	`snapshot_json` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`definition_id`, `version`),
	FOREIGN KEY (`organization_id`,`event_id`,`definition_id`) REFERENCES `report_definitions`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "report_definition_versions_version_check" CHECK("report_definition_versions"."version" > 0),
	CONSTRAINT "report_definition_versions_json_check" CHECK(json_valid("report_definition_versions"."snapshot_json") AND json_type("report_definition_versions"."snapshot_json") = 'object')
) STRICT;

CREATE UNIQUE INDEX `report_definition_versions_scope_uidx` ON `report_definition_versions` (`organization_id`,`event_id`,`definition_id`,`version`);CREATE INDEX `report_definition_versions_latest_idx` ON `report_definition_versions` (`definition_id`,`version`);CREATE TABLE `report_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`relationships_json` text NOT NULL,
	`fields_json` text NOT NULL,
	`order_json` text NOT NULL,
	`filters_json` text NOT NULL,
	`sort_json` text NOT NULL,
	`version` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	CONSTRAINT "report_definitions_version_check" CHECK("report_definitions"."version" > 0),
	CONSTRAINT "report_definitions_json_0_check" CHECK(json_valid("report_definitions"."relationships_json") AND json_type("report_definitions"."relationships_json") = 'array'),
	CONSTRAINT "report_definitions_json_1_check" CHECK(json_valid("report_definitions"."fields_json") AND json_type("report_definitions"."fields_json") = 'array'),
	CONSTRAINT "report_definitions_json_2_check" CHECK(json_valid("report_definitions"."order_json") AND json_type("report_definitions"."order_json") = 'array'),
	CONSTRAINT "report_definitions_json_3_check" CHECK(json_valid("report_definitions"."filters_json") AND json_type("report_definitions"."filters_json") = 'array'),
	CONSTRAINT "report_definitions_json_4_check" CHECK(json_valid("report_definitions"."sort_json") AND json_type("report_definitions"."sort_json") = 'array')
) STRICT;

CREATE UNIQUE INDEX `report_definitions_scope_uidx` ON `report_definitions` (`organization_id`,`id`);CREATE UNIQUE INDEX `report_definitions_event_scope_uidx` ON `report_definitions` (`organization_id`,`event_id`,`id`);CREATE INDEX `report_definitions_list_idx` ON `report_definitions` (`organization_id`,`event_id`,`deleted_at`,`name`);CREATE INDEX `report_definitions_find_idx` ON `report_definitions` (`organization_id`,`id`,`deleted_at`);CREATE TABLE `report_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`definition_id` text NOT NULL,
	`definition_version` integer NOT NULL,
	`requester_id` text NOT NULL,
	`format` text NOT NULL,
	`parameters_json` text NOT NULL,
	`requested_at` text NOT NULL,
	`completed_at` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`body` text NOT NULL,
	`columns_json` text NOT NULL,
	`row_count` integer NOT NULL,
	`output_digest` text NOT NULL,
	`audit_json` text NOT NULL,
	FOREIGN KEY (`definition_id`,`definition_version`) REFERENCES `report_definition_versions`(`definition_id`,`version`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "report_runs_format_check" CHECK("report_runs"."format" IN ('csv','xlsx')),
	CONSTRAINT "report_runs_version_check" CHECK("report_runs"."definition_version" > 0),
	CONSTRAINT "report_runs_row_count_check" CHECK("report_runs"."row_count" >= 0),
	CONSTRAINT "report_runs_parameters_json_check" CHECK(json_valid("report_runs"."parameters_json") AND json_type("report_runs"."parameters_json") = 'object'),
	CONSTRAINT "report_runs_columns_json_check" CHECK(json_valid("report_runs"."columns_json") AND json_type("report_runs"."columns_json") = 'array'),
	CONSTRAINT "report_runs_audit_json_check" CHECK(json_valid("report_runs"."audit_json") AND json_type("report_runs"."audit_json") = 'object')
) STRICT;

CREATE INDEX `report_runs_definition_idx` ON `report_runs` (`organization_id`,`event_id`,`definition_id`,`completed_at`);CREATE INDEX `report_runs_event_idx` ON `report_runs` (`organization_id`,`event_id`,`completed_at`);CREATE INDEX `report_runs_requester_idx` ON `report_runs` (`organization_id`,`requester_id`,`completed_at`);