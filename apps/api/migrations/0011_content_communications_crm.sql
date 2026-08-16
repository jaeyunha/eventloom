-- Content, communications, and CRM authoritative D1 schema.
PRAGMA foreign_keys = ON;

CREATE TABLE `communication_deliveries` (
	`send_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`status` text NOT NULL,
	`provider_message_id` text,
	`failure_reason` text,
	`attempts` integer NOT NULL,
	PRIMARY KEY(`send_id`, `recipient_id`),
	FOREIGN KEY (`send_id`,`recipient_id`) REFERENCES `communication_send_recipients`(`send_id`,`recipient_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "communication_deliveries_status_check" CHECK("communication_deliveries"."status" IN ('queued','delivered','failed','bounced','complained')),
	CONSTRAINT "communication_deliveries_attempts_check" CHECK("communication_deliveries"."attempts" >= 0)
) STRICT;

CREATE UNIQUE INDEX `communication_deliveries_provider_uidx` ON `communication_deliveries` (`provider_message_id`) WHERE "communication_deliveries"."provider_message_id" IS NOT NULL;CREATE TABLE `communication_delivery_history` (
	`send_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`id` text NOT NULL,
	`status` text NOT NULL,
	`occurred_at` text NOT NULL,
	`provider_message_id` text,
	`reason` text,
	`actor_id` text NOT NULL,
	PRIMARY KEY(`send_id`, `recipient_id`, `ordinal`),
	FOREIGN KEY (`send_id`,`recipient_id`) REFERENCES `communication_deliveries`(`send_id`,`recipient_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "communication_delivery_history_status_check" CHECK("communication_delivery_history"."status" IN ('queued','delivered','failed','bounced','complained')),
	CONSTRAINT "communication_delivery_history_ordinal_check" CHECK("communication_delivery_history"."ordinal" >= 0)
) STRICT;

CREATE UNIQUE INDEX `communication_delivery_history_id_uidx` ON `communication_delivery_history` (`id`);CREATE TABLE `communication_preview_recipients` (
	`preview_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`participant_id` text NOT NULL,
	`email` text COLLATE NOCASE NOT NULL,
	`display_name` text NOT NULL,
	`audiences_json` text NOT NULL,
	`data_json` text NOT NULL,
	`subject` text NOT NULL,
	`html` text NOT NULL,
	`text` text NOT NULL,
	PRIMARY KEY(`preview_id`, `recipient_id`),
	FOREIGN KEY (`preview_id`) REFERENCES `communication_previews`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "communication_preview_recipients_ordinal_check" CHECK("communication_preview_recipients"."ordinal" >= 0),
	CONSTRAINT "communication_preview_recipients_audiences_json_check" CHECK(json_valid("communication_preview_recipients"."audiences_json") AND json_type("communication_preview_recipients"."audiences_json") = 'array'),
	CONSTRAINT "communication_preview_recipients_data_json_check" CHECK(json_valid("communication_preview_recipients"."data_json") AND json_type("communication_preview_recipients"."data_json") = 'object')
) STRICT;

CREATE UNIQUE INDEX `communication_preview_recipients_ordinal_uidx` ON `communication_preview_recipients` (`preview_id`,`ordinal`);CREATE TABLE `communication_previews` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`purpose` text NOT NULL,
	`template_id` text NOT NULL,
	`template_version` integer NOT NULL,
	`audience` text NOT NULL,
	`render_data_json` text NOT NULL,
	`recipient_count` integer NOT NULL,
	`subject` text NOT NULL,
	`html` text NOT NULL,
	`text` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`template_id`,`template_version`) REFERENCES `communication_templates`(`id`,`version`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "communication_previews_purpose_check" CHECK(purpose IN ('verification','receipt','reminder','decision','task','schedule_publish','schedule_update','schedule_cancel','organizer_group_email')),
	CONSTRAINT "communication_previews_audience_check" CHECK(audience IN ('all_participants','accepted_participants','waitlisted_participants','rejected_participants','task_assignees','scheduled_participants')),
	CONSTRAINT "communication_previews_count_check" CHECK("communication_previews"."recipient_count" >= 0),
	CONSTRAINT "communication_previews_data_json_check" CHECK(json_valid("communication_previews"."render_data_json") AND json_type("communication_previews"."render_data_json") = 'object')
) STRICT;

CREATE UNIQUE INDEX `communication_previews_scope_uidx` ON `communication_previews` (`organization_id`,`event_id`,`id`);CREATE INDEX `communication_previews_expiry_idx` ON `communication_previews` (`expires_at`);CREATE TABLE `communication_recipient_audiences` (
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`audience` text NOT NULL,
	PRIMARY KEY(`organization_id`, `event_id`, `recipient_id`, `audience`),
	FOREIGN KEY (`organization_id`,`event_id`,`recipient_id`) REFERENCES `communication_recipients`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "communication_recipient_audiences_audience_check" CHECK(audience IN ('all_participants','accepted_participants','waitlisted_participants','rejected_participants','task_assignees','scheduled_participants'))
) STRICT;

CREATE INDEX `communication_recipient_audiences_reverse_idx` ON `communication_recipient_audiences` (`organization_id`,`event_id`,`audience`,`recipient_id`);CREATE TABLE `communication_recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`participant_id` text,
	`email` text COLLATE NOCASE NOT NULL,
	`display_name` text NOT NULL,
	`data_json` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "communication_recipients_data_json_check" CHECK(json_valid("communication_recipients"."data_json") AND json_type("communication_recipients"."data_json") = 'object')
) STRICT;

CREATE UNIQUE INDEX `communication_recipients_scope_uidx` ON `communication_recipients` (`organization_id`,`event_id`,`id`);CREATE INDEX `communication_recipients_email_idx` ON `communication_recipients` (`organization_id`,`event_id`,`email`);CREATE INDEX `communication_recipients_participant_idx` ON `communication_recipients` (`organization_id`,`event_id`,`participant_id`);CREATE TABLE `communication_send_recipients` (
	`send_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`email` text COLLATE NOCASE NOT NULL,
	`display_name` text NOT NULL,
	`audiences_json` text NOT NULL,
	`data_json` text NOT NULL,
	PRIMARY KEY(`send_id`, `recipient_id`),
	FOREIGN KEY (`send_id`) REFERENCES `communication_sends`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "communication_send_recipients_audiences_json_check" CHECK(json_valid("communication_send_recipients"."audiences_json") AND json_type("communication_send_recipients"."audiences_json") = 'array'),
	CONSTRAINT "communication_send_recipients_data_json_check" CHECK(json_valid("communication_send_recipients"."data_json") AND json_type("communication_send_recipients"."data_json") = 'object')
) STRICT;

CREATE INDEX `communication_send_recipients_email_idx` ON `communication_send_recipients` (`send_id`,`email`);CREATE TABLE `communication_sends` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`purpose` text NOT NULL,
	`audience` text,
	`template_id` text NOT NULL,
	`template_version` integer NOT NULL,
	`idempotency_key` text NOT NULL,
	`preview_id` text,
	`data_json` text NOT NULL,
	`status` text NOT NULL,
	`recipient_count` integer NOT NULL,
	`queued_count` integer NOT NULL,
	`delivered_count` integer NOT NULL,
	`failed_count` integer NOT NULL,
	`terminal` integer NOT NULL,
	`template_name` text NOT NULL,
	`template_purpose` text NOT NULL,
	`template_sender` text NOT NULL,
	`template_subject` text NOT NULL,
	`template_html` text NOT NULL,
	`template_text` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`template_id`,`template_version`) REFERENCES `communication_templates`(`id`,`version`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`preview_id`) REFERENCES `communication_previews`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "communication_sends_purpose_check" CHECK(purpose IN ('verification','receipt','reminder','decision','task','schedule_publish','schedule_update','schedule_cancel','organizer_group_email')),
	CONSTRAINT "communication_sends_audience_check" CHECK("communication_sends"."audience" IS NULL OR "communication_sends"."audience" IN ('all_participants','accepted_participants','waitlisted_participants','rejected_participants','task_assignees','scheduled_participants')),
	CONSTRAINT "communication_sends_status_check" CHECK("communication_sends"."status" IN ('queued','delivered','partial','failed')),
	CONSTRAINT "communication_sends_terminal_check" CHECK("communication_sends"."terminal" IN (0,1)),
	CONSTRAINT "communication_sends_counts_check" CHECK("communication_sends"."recipient_count" >= 0 AND "communication_sends"."queued_count" >= 0 AND "communication_sends"."delivered_count" >= 0 AND "communication_sends"."failed_count" >= 0 AND "communication_sends"."queued_count" + "communication_sends"."delivered_count" + "communication_sends"."failed_count" = "communication_sends"."recipient_count"),
	CONSTRAINT "communication_sends_data_json_check" CHECK(json_valid("communication_sends"."data_json") AND json_type("communication_sends"."data_json") = 'object')
) STRICT;

CREATE UNIQUE INDEX `communication_sends_idempotency_uidx` ON `communication_sends` (`organization_id`,`event_id`,`idempotency_key`);CREATE INDEX `communication_sends_status_idx` ON `communication_sends` (`organization_id`,`event_id`,`status`,`created_at`);CREATE TABLE `communication_templates` (
	`id` text NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`version` integer NOT NULL,
	`name` text NOT NULL,
	`purpose` text NOT NULL,
	`status` text NOT NULL,
	`sender` text NOT NULL,
	`subject` text NOT NULL,
	`html` text NOT NULL,
	`text` text NOT NULL,
	`variables_json` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`approved_by` text,
	`approved_at` text,
	PRIMARY KEY(`id`, `version`),
	CONSTRAINT "communication_templates_version_check" CHECK("communication_templates"."version" > 0),
	CONSTRAINT "communication_templates_purpose_check" CHECK(purpose IN ('verification','receipt','reminder','decision','task','schedule_publish','schedule_update','schedule_cancel','organizer_group_email')),
	CONSTRAINT "communication_templates_status_check" CHECK("communication_templates"."status" IN ('draft','approved','archived')),
	CONSTRAINT "communication_templates_sender_check" CHECK("communication_templates"."sender" IN ('auth@sessionboard.namuh.co','speakers@sessionboard.namuh.co','calendar@sessionboard.namuh.co')),
	CONSTRAINT "communication_templates_variables_json_check" CHECK(json_valid("communication_templates"."variables_json") AND json_type("communication_templates"."variables_json") = 'array'),
	CONSTRAINT "communication_templates_approval_check" CHECK(("communication_templates"."status" = 'approved') = ("communication_templates"."approved_by" IS NOT NULL AND "communication_templates"."approved_at" IS NOT NULL))
) STRICT;

CREATE UNIQUE INDEX `communication_templates_scope_uidx` ON `communication_templates` (`organization_id`,`event_id`,`id`,`version`);CREATE INDEX `communication_templates_lookup_idx` ON `communication_templates` (`organization_id`,`event_id`,`purpose`,`status`,`version`);CREATE TABLE `crm_command_results` (
	`organization_id` text NOT NULL,
	`command` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text,
	PRIMARY KEY(`organization_id`, `command`, `idempotency_key`),
	CONSTRAINT "crm_command_results_json_check" CHECK(json_valid("crm_command_results"."result_json"))
) STRICT;

CREATE INDEX `crm_command_results_expiry_idx` ON `crm_command_results` (`expires_at`);CREATE TABLE `crm_contact_tags` (
	`organization_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`organization_id`, `contact_id`, `tag`),
	FOREIGN KEY (`organization_id`,`contact_id`) REFERENCES `crm_contacts`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade
) STRICT;

CREATE INDEX `crm_contact_tags_reverse_idx` ON `crm_contact_tags` (`organization_id`,`tag`,`contact_id`);CREATE TABLE `crm_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`first_name` text,
	`last_name` text,
	`display_name` text NOT NULL,
	`email` text COLLATE NOCASE,
	`phone` text,
	`company` text,
	`title` text,
	`website` text,
	`linkedin_url` text,
	`notes` text,
	`custom_fields_json` text NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`merged_into_id` text,
	`merge_audit_id` text,
	`merged_at` text,
	`merge_source_ids_json` text NOT NULL,
	`pipeline_stage` text NOT NULL,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`,`merged_into_id`) REFERENCES `crm_contacts`(`organization_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "crm_contacts_source_check" CHECK("crm_contacts"."source" IN ('manual','csv','speaker','import')),
	CONSTRAINT "crm_contacts_status_check" CHECK("crm_contacts"."status" IN ('active','merged')),
	CONSTRAINT "crm_contacts_pipeline_check" CHECK(pipeline_stage IN ('new','contacted','qualified','invited','registered','accepted','declined','won','lost')),
	CONSTRAINT "crm_contacts_version_check" CHECK("crm_contacts"."version" > 0),
	CONSTRAINT "crm_contacts_custom_fields_json_check" CHECK(json_valid("crm_contacts"."custom_fields_json") AND json_type("crm_contacts"."custom_fields_json") = 'object'),
	CONSTRAINT "crm_contacts_merge_sources_json_check" CHECK(json_valid("crm_contacts"."merge_source_ids_json") AND json_type("crm_contacts"."merge_source_ids_json") = 'array'),
	CONSTRAINT "crm_contacts_merge_check" CHECK(("crm_contacts"."status" = 'merged') = ("crm_contacts"."merged_into_id" IS NOT NULL AND "crm_contacts"."merged_at" IS NOT NULL))
) STRICT;

CREATE UNIQUE INDEX `crm_contacts_scope_uidx` ON `crm_contacts` (`organization_id`,`id`);CREATE UNIQUE INDEX `crm_contacts_active_email_uidx` ON `crm_contacts` (`organization_id`,`email`) WHERE "crm_contacts"."email" IS NOT NULL AND "crm_contacts"."status" = 'active';CREATE INDEX `crm_contacts_pipeline_idx` ON `crm_contacts` (`organization_id`,`status`,`pipeline_stage`,`updated_at`);CREATE INDEX `crm_contacts_company_idx` ON `crm_contacts` (`organization_id`,`company`,`status`);CREATE INDEX `crm_contacts_email_idx` ON `crm_contacts` (`organization_id`,`email`);CREATE INDEX `crm_contacts_merged_into_idx` ON `crm_contacts` (`organization_id`,`merged_into_id`);CREATE TABLE `crm_history` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`kind` text NOT NULL,
	`event_id` text,
	`session_id` text,
	`title` text NOT NULL,
	`detail` text,
	`occurred_at` text NOT NULL,
	`metadata_json` text NOT NULL,
	FOREIGN KEY (`organization_id`,`contact_id`) REFERENCES `crm_contacts`(`organization_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "crm_history_kind_check" CHECK("crm_history"."kind" IN ('event','session','submission','attendance','note','pipeline','communication')),
	CONSTRAINT "crm_history_metadata_json_check" CHECK(json_valid("crm_history"."metadata_json") AND json_type("crm_history"."metadata_json") = 'object')
) STRICT;

CREATE INDEX `crm_history_contact_idx` ON `crm_history` (`organization_id`,`contact_id`,`occurred_at`);CREATE INDEX `crm_history_event_idx` ON `crm_history` (`organization_id`,`event_id`,`occurred_at`);CREATE INDEX `crm_history_session_idx` ON `crm_history` (`organization_id`,`session_id`,`occurred_at`);CREATE TABLE `crm_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`created_count` integer NOT NULL,
	`updated_count` integer NOT NULL,
	`skipped_count` integer NOT NULL,
	`error_count` integer NOT NULL,
	`mapping_json` text NOT NULL,
	`rows_json` text NOT NULL,
	`contact_ids_json` text NOT NULL,
	`idempotent` integer NOT NULL,
	`idempotency_key` text,
	`plan_fingerprint` text,
	`preview` integer NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "crm_imports_counts_check" CHECK("crm_imports"."created_count" >= 0 AND "crm_imports"."updated_count" >= 0 AND "crm_imports"."skipped_count" >= 0 AND "crm_imports"."error_count" >= 0),
	CONSTRAINT "crm_imports_booleans_check" CHECK("crm_imports"."idempotent" IN (0,1) AND "crm_imports"."preview" IN (0,1)),
	CONSTRAINT "crm_imports_mapping_json_check" CHECK(json_valid("crm_imports"."mapping_json") AND json_type("crm_imports"."mapping_json") = 'array'),
	CONSTRAINT "crm_imports_rows_json_check" CHECK(json_valid("crm_imports"."rows_json") AND json_type("crm_imports"."rows_json") = 'array'),
	CONSTRAINT "crm_imports_contacts_json_check" CHECK(json_valid("crm_imports"."contact_ids_json") AND json_type("crm_imports"."contact_ids_json") = 'array')
) STRICT;

CREATE UNIQUE INDEX `crm_imports_committed_idempotency_uidx` ON `crm_imports` (`organization_id`,`idempotency_key`) WHERE "crm_imports"."idempotency_key" IS NOT NULL AND "crm_imports"."preview" = 0;CREATE INDEX `crm_imports_created_idx` ON `crm_imports` (`organization_id`,`created_at`);CREATE TABLE `crm_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`source_crm_contact_id` text NOT NULL,
	`merge_audit_id` text,
	`body` text NOT NULL,
	`author_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`organization_id`,`contact_id`) REFERENCES `crm_contacts`(`organization_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`,`source_crm_contact_id`) REFERENCES `crm_contacts`(`organization_id`,`id`) ON UPDATE no action ON DELETE restrict
) STRICT;

CREATE INDEX `crm_notes_contact_idx` ON `crm_notes` (`organization_id`,`contact_id`,`created_at`);CREATE INDEX `crm_notes_source_idx` ON `crm_notes` (`organization_id`,`source_crm_contact_id`,`created_at`);CREATE TABLE `crm_outreach` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`event_id` text,
	`recipient_email` text COLLATE NOCASE NOT NULL,
	`template_subject` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`rendered_body` text NOT NULL,
	`status` text NOT NULL,
	`queued_count` integer NOT NULL,
	`sent_count` integer NOT NULL,
	`failed_count` integer NOT NULL,
	`terminal` integer NOT NULL,
	`failure_reason` text,
	`provider_message_id` text,
	`completed_at` text,
	`idempotency_key` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`organization_id`,`contact_id`) REFERENCES `crm_contacts`(`organization_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "crm_outreach_status_check" CHECK("crm_outreach"."status" IN ('queued','sent','delivered','failed','bounced','complained')),
	CONSTRAINT "crm_outreach_counts_check" CHECK("crm_outreach"."queued_count" >= 0 AND "crm_outreach"."sent_count" >= 0 AND "crm_outreach"."failed_count" >= 0),
	CONSTRAINT "crm_outreach_terminal_check" CHECK("crm_outreach"."terminal" IN (0,1)),
	CONSTRAINT "crm_outreach_completion_check" CHECK("crm_outreach"."terminal" = 0 OR "crm_outreach"."completed_at" IS NOT NULL)
) STRICT;

CREATE UNIQUE INDEX `crm_outreach_idempotency_uidx` ON `crm_outreach` (`organization_id`,`idempotency_key`);CREATE INDEX `crm_outreach_status_idx` ON `crm_outreach` (`organization_id`,`status`,`created_at`);CREATE INDEX `crm_outreach_contact_idx` ON `crm_outreach` (`organization_id`,`contact_id`,`created_at`);CREATE INDEX `crm_outreach_provider_idx` ON `crm_outreach` (`provider_message_id`);CREATE TABLE `crm_participant_links` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`crm_contact_id` text NOT NULL,
	`source_crm_contact_id` text,
	`merge_audit_id` text,
	`session_id` text,
	`role` text NOT NULL,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`,`crm_contact_id`) REFERENCES `crm_contacts`(`organization_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`,`source_crm_contact_id`) REFERENCES `crm_contacts`(`organization_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "crm_participant_links_role_check" CHECK("crm_participant_links"."role" IN ('speaker','prospect','attendee','sponsor'))
) STRICT;

CREATE UNIQUE INDEX `crm_participant_links_participant_uidx` ON `crm_participant_links` (`organization_id`,`event_id`,`participant_id`);CREATE INDEX `crm_participant_links_contact_idx` ON `crm_participant_links` (`organization_id`,`crm_contact_id`,`event_id`);CREATE INDEX `crm_participant_links_session_idx` ON `crm_participant_links` (`organization_id`,`event_id`,`session_id`);CREATE TABLE `crm_pipeline_history` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`source_crm_contact_id` text NOT NULL,
	`merge_audit_id` text,
	`from_stage` text,
	`to_stage` text NOT NULL,
	`note` text,
	`actor_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`organization_id`,`contact_id`) REFERENCES `crm_contacts`(`organization_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`,`source_crm_contact_id`) REFERENCES `crm_contacts`(`organization_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "crm_pipeline_history_from_check" CHECK("crm_pipeline_history"."from_stage" IS NULL OR "crm_pipeline_history"."from_stage" IN ('new','contacted','qualified','invited','registered','accepted','declined','won','lost')),
	CONSTRAINT "crm_pipeline_history_to_check" CHECK("crm_pipeline_history"."to_stage" IN ('new','contacted','qualified','invited','registered','accepted','declined','won','lost'))
) STRICT;

CREATE INDEX `crm_pipeline_history_contact_idx` ON `crm_pipeline_history` (`organization_id`,`contact_id`,`created_at`);CREATE INDEX `crm_pipeline_history_source_idx` ON `crm_pipeline_history` (`organization_id`,`source_crm_contact_id`,`created_at`);CREATE TABLE `crm_segments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`rules_json` text NOT NULL,
	`merge_audit_ids_json` text NOT NULL,
	`created_by` text NOT NULL,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "crm_segments_version_check" CHECK("crm_segments"."version" > 0),
	CONSTRAINT "crm_segments_rules_json_check" CHECK(json_valid("crm_segments"."rules_json") AND json_type("crm_segments"."rules_json") = 'array'),
	CONSTRAINT "crm_segments_merge_audits_json_check" CHECK(json_valid("crm_segments"."merge_audit_ids_json") AND json_type("crm_segments"."merge_audit_ids_json") = 'array')
) STRICT;

CREATE UNIQUE INDEX `crm_segments_name_uidx` ON `crm_segments` (`organization_id`,`name`);CREATE INDEX `crm_segments_name_idx` ON `crm_segments` (`organization_id`,`name`);