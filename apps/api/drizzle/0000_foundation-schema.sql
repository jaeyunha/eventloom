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
);
--> statement-breakpoint
CREATE UNIQUE INDEX `communication_deliveries_provider_uidx` ON `communication_deliveries` (`provider_message_id`) WHERE "communication_deliveries"."provider_message_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `communication_delivery_history` (
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
);
--> statement-breakpoint
CREATE UNIQUE INDEX `communication_delivery_history_id_uidx` ON `communication_delivery_history` (`id`);--> statement-breakpoint
CREATE TABLE `communication_preview_recipients` (
	`preview_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`participant_id` text NOT NULL,
	`email` text NOT NULL,
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
);
--> statement-breakpoint
CREATE UNIQUE INDEX `communication_preview_recipients_ordinal_uidx` ON `communication_preview_recipients` (`preview_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `communication_previews` (
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
);
--> statement-breakpoint
CREATE UNIQUE INDEX `communication_previews_scope_uidx` ON `communication_previews` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE INDEX `communication_previews_expiry_idx` ON `communication_previews` (`expires_at`);--> statement-breakpoint
CREATE TABLE `communication_recipient_audiences` (
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`audience` text NOT NULL,
	PRIMARY KEY(`organization_id`, `event_id`, `recipient_id`, `audience`),
	FOREIGN KEY (`organization_id`,`event_id`,`recipient_id`) REFERENCES `communication_recipients`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "communication_recipient_audiences_audience_check" CHECK(audience IN ('all_participants','accepted_participants','waitlisted_participants','rejected_participants','task_assignees','scheduled_participants'))
);
--> statement-breakpoint
CREATE INDEX `communication_recipient_audiences_reverse_idx` ON `communication_recipient_audiences` (`organization_id`,`event_id`,`audience`,`recipient_id`);--> statement-breakpoint
CREATE TABLE `communication_recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`participant_id` text,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`data_json` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "communication_recipients_data_json_check" CHECK(json_valid("communication_recipients"."data_json") AND json_type("communication_recipients"."data_json") = 'object')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `communication_recipients_scope_uidx` ON `communication_recipients` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE INDEX `communication_recipients_email_idx` ON `communication_recipients` (`organization_id`,`event_id`,`email`);--> statement-breakpoint
CREATE INDEX `communication_recipients_participant_idx` ON `communication_recipients` (`organization_id`,`event_id`,`participant_id`);--> statement-breakpoint
CREATE TABLE `communication_send_recipients` (
	`send_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`audiences_json` text NOT NULL,
	`data_json` text NOT NULL,
	PRIMARY KEY(`send_id`, `recipient_id`),
	FOREIGN KEY (`send_id`) REFERENCES `communication_sends`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "communication_send_recipients_audiences_json_check" CHECK(json_valid("communication_send_recipients"."audiences_json") AND json_type("communication_send_recipients"."audiences_json") = 'array'),
	CONSTRAINT "communication_send_recipients_data_json_check" CHECK(json_valid("communication_send_recipients"."data_json") AND json_type("communication_send_recipients"."data_json") = 'object')
);
--> statement-breakpoint
CREATE INDEX `communication_send_recipients_email_idx` ON `communication_send_recipients` (`send_id`,`email`);--> statement-breakpoint
CREATE TABLE `communication_sends` (
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
);
--> statement-breakpoint
CREATE UNIQUE INDEX `communication_sends_idempotency_uidx` ON `communication_sends` (`organization_id`,`event_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `communication_sends_status_idx` ON `communication_sends` (`organization_id`,`event_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `communication_templates` (
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
);
--> statement-breakpoint
CREATE UNIQUE INDEX `communication_templates_scope_uidx` ON `communication_templates` (`organization_id`,`event_id`,`id`,`version`);--> statement-breakpoint
CREATE INDEX `communication_templates_lookup_idx` ON `communication_templates` (`organization_id`,`event_id`,`purpose`,`status`,`version`);--> statement-breakpoint
CREATE TABLE `crm_command_results` (
	`organization_id` text NOT NULL,
	`command` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text,
	PRIMARY KEY(`organization_id`, `command`, `idempotency_key`),
	CONSTRAINT "crm_command_results_json_check" CHECK(json_valid("crm_command_results"."result_json"))
);
--> statement-breakpoint
CREATE INDEX `crm_command_results_expiry_idx` ON `crm_command_results` (`expires_at`);--> statement-breakpoint
CREATE TABLE `crm_contact_tags` (
	`organization_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`organization_id`, `contact_id`, `tag`),
	FOREIGN KEY (`organization_id`,`contact_id`) REFERENCES `crm_contacts`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `crm_contact_tags_reverse_idx` ON `crm_contact_tags` (`organization_id`,`tag`,`contact_id`);--> statement-breakpoint
CREATE TABLE `crm_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`first_name` text,
	`last_name` text,
	`display_name` text NOT NULL,
	`email` text,
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
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_contacts_scope_uidx` ON `crm_contacts` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `crm_contacts_active_email_uidx` ON `crm_contacts` (`organization_id`,`email`) WHERE "crm_contacts"."email" IS NOT NULL AND "crm_contacts"."status" = 'active';--> statement-breakpoint
CREATE INDEX `crm_contacts_pipeline_idx` ON `crm_contacts` (`organization_id`,`status`,`pipeline_stage`,`updated_at`);--> statement-breakpoint
CREATE INDEX `crm_contacts_company_idx` ON `crm_contacts` (`organization_id`,`company`,`status`);--> statement-breakpoint
CREATE INDEX `crm_contacts_email_idx` ON `crm_contacts` (`organization_id`,`email`);--> statement-breakpoint
CREATE INDEX `crm_contacts_merged_into_idx` ON `crm_contacts` (`organization_id`,`merged_into_id`);--> statement-breakpoint
CREATE TABLE `crm_history` (
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
);
--> statement-breakpoint
CREATE INDEX `crm_history_contact_idx` ON `crm_history` (`organization_id`,`contact_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `crm_history_event_idx` ON `crm_history` (`organization_id`,`event_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `crm_history_session_idx` ON `crm_history` (`organization_id`,`session_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `crm_imports` (
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
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_imports_committed_idempotency_uidx` ON `crm_imports` (`organization_id`,`idempotency_key`) WHERE "crm_imports"."idempotency_key" IS NOT NULL AND "crm_imports"."preview" = 0;--> statement-breakpoint
CREATE INDEX `crm_imports_created_idx` ON `crm_imports` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `crm_notes` (
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
);
--> statement-breakpoint
CREATE INDEX `crm_notes_contact_idx` ON `crm_notes` (`organization_id`,`contact_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `crm_notes_source_idx` ON `crm_notes` (`organization_id`,`source_crm_contact_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `crm_outreach` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`event_id` text,
	`recipient_email` text NOT NULL,
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
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_outreach_idempotency_uidx` ON `crm_outreach` (`organization_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `crm_outreach_status_idx` ON `crm_outreach` (`organization_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `crm_outreach_contact_idx` ON `crm_outreach` (`organization_id`,`contact_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `crm_outreach_provider_idx` ON `crm_outreach` (`provider_message_id`);--> statement-breakpoint
CREATE TABLE `crm_participant_links` (
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
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_participant_links_participant_uidx` ON `crm_participant_links` (`organization_id`,`event_id`,`participant_id`);--> statement-breakpoint
CREATE INDEX `crm_participant_links_contact_idx` ON `crm_participant_links` (`organization_id`,`crm_contact_id`,`event_id`);--> statement-breakpoint
CREATE INDEX `crm_participant_links_session_idx` ON `crm_participant_links` (`organization_id`,`event_id`,`session_id`);--> statement-breakpoint
CREATE TABLE `crm_pipeline_history` (
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
);
--> statement-breakpoint
CREATE INDEX `crm_pipeline_history_contact_idx` ON `crm_pipeline_history` (`organization_id`,`contact_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `crm_pipeline_history_source_idx` ON `crm_pipeline_history` (`organization_id`,`source_crm_contact_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `crm_segments` (
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
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_segments_name_uidx` ON `crm_segments` (`organization_id`,`name`);--> statement-breakpoint
CREATE INDEX `crm_segments_name_idx` ON `crm_segments` (`organization_id`,`name`);--> statement-breakpoint
CREATE TABLE `auth_users` (
	`id` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_organizations_slug` ON `organizations` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_organizations_status` ON `organizations` (`status`);--> statement-breakpoint
CREATE TABLE `airtable_connection_secrets` (
	`connection_id` text PRIMARY KEY NOT NULL,
	`access_token_ciphertext` text NOT NULL,
	`refresh_token_ciphertext` text,
	`key_version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `airtable_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `airtable_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`state` text DEFAULT 'disconnected' NOT NULL,
	`auth_mode` text DEFAULT 'oauth' NOT NULL,
	`connection_version` integer DEFAULT 1 NOT NULL,
	`airtable_user_id` text,
	`base_id` text,
	`base_name` text,
	`granted_scopes_json` text DEFAULT '[]' NOT NULL,
	`access_token_expires_at` text,
	`refresh_token_expires_at` text,
	`refresh_lease_owner` text,
	`refresh_lease_token` text,
	`refresh_lease_expires_at` text,
	`last_schema_check_at` text,
	`last_success_at` text,
	`last_error` text,
	`paused_at` text,
	`disconnected_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`organization_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "airtable_connections_scopes_json_ck" CHECK(json_valid("airtable_connections"."granted_scopes_json") AND json_type("airtable_connections"."granted_scopes_json") = 'array')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `airtable_connections_org_uq` ON `airtable_connections` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_airtable_connections_state` ON `airtable_connections` (`state`,`updated_at`);--> statement-breakpoint
CREATE TABLE `airtable_inbound_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`registration_id` text NOT NULL,
	`base_transaction_number` integer NOT NULL,
	`table_id` text NOT NULL,
	`record_id` text NOT NULL,
	`field_id` text NOT NULL,
	`entity_type` text,
	`application_id` text,
	`state` text DEFAULT 'pending' NOT NULL,
	`payload_json` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` text NOT NULL,
	`claim_owner` text,
	`claim_token` text,
	`lease_expires_at` text,
	`last_error` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `airtable_connections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`registration_id`) REFERENCES `airtable_webhook_registrations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `airtable_inbound_changes_source_uq` ON `airtable_inbound_changes` (`registration_id`,`base_transaction_number`,`table_id`,`record_id`,`field_id`);--> statement-breakpoint
CREATE INDEX `idx_airtable_inbound_changes_due` ON `airtable_inbound_changes` (`state`,`available_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `airtable_initial_sync_checkpoints` (
	`connection_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`last_application_id` text,
	`last_source_version` integer DEFAULT 0 NOT NULL,
	`completed_at` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`connection_id`, `entity_type`),
	FOREIGN KEY (`connection_id`) REFERENCES `airtable_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `airtable_oauth_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`initiating_user_id` text NOT NULL,
	`state_hash` text NOT NULL,
	`encrypted_pkce_verifier` text NOT NULL,
	`return_path` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`claim_owner` text,
	`claim_token` text,
	`lease_expires_at` text,
	`attempt_version` integer DEFAULT 1 NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`callback_result_json` text,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`organization_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `airtable_oauth_attempts_state_uq` ON `airtable_oauth_attempts` (`state_hash`);--> statement-breakpoint
CREATE INDEX `idx_airtable_oauth_attempts_expiry` ON `airtable_oauth_attempts` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `airtable_projection_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`table_id` text NOT NULL,
	`table_name` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`field_mapping_json` text NOT NULL,
	`inbound_field_allowlist_json` text DEFAULT '[]' NOT NULL,
	`delete_policy` text DEFAULT 'archive' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `airtable_connections`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "airtable_projection_configs_enabled_ck" CHECK("airtable_projection_configs"."enabled" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `airtable_projection_configs_entity_uq` ON `airtable_projection_configs` (`connection_id`,`entity_type`);--> statement-breakpoint
CREATE TABLE `airtable_record_mappings` (
	`connection_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`application_id` text NOT NULL,
	`table_id` text NOT NULL,
	`record_id` text NOT NULL,
	`last_exported_version` integer DEFAULT 0 NOT NULL,
	`last_exported_hash` text,
	`last_observed_hash` text,
	`last_exported_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`connection_id`, `entity_type`, `application_id`),
	FOREIGN KEY (`connection_id`) REFERENCES `airtable_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `airtable_record_mappings_record_uq` ON `airtable_record_mappings` (`connection_id`,`table_id`,`record_id`);--> statement-breakpoint
CREATE TABLE `airtable_sync_conflicts` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`application_id` text NOT NULL,
	`field_id` text NOT NULL,
	`source_transaction_number` integer NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	`d1_version` integer NOT NULL,
	`d1_value_json` text NOT NULL,
	`airtable_value_json` text NOT NULL,
	`resolution` text,
	`resolution_command_id` text,
	`resolved_by` text,
	`resolved_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `airtable_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `airtable_sync_conflicts_source_uq` ON `airtable_sync_conflicts` (`connection_id`,`entity_type`,`application_id`,`field_id`,`source_transaction_number`);--> statement-breakpoint
CREATE INDEX `idx_airtable_sync_conflicts_open` ON `airtable_sync_conflicts` (`connection_id`,`state`,`created_at`);--> statement-breakpoint
CREATE TABLE `airtable_sync_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`connection_version` integer NOT NULL,
	`entity_type` text NOT NULL,
	`application_id` text NOT NULL,
	`source_version` integer NOT NULL,
	`operation` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`deduplication_key` text NOT NULL,
	`payload_json` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` text NOT NULL,
	`claim_owner` text,
	`claim_token` text,
	`lease_expires_at` text,
	`last_error` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `airtable_connections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`organization_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `airtable_sync_jobs_dedupe_uq` ON `airtable_sync_jobs` (`deduplication_key`);--> statement-breakpoint
CREATE INDEX `idx_airtable_sync_jobs_due` ON `airtable_sync_jobs` (`state`,`available_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `airtable_webhook_cursors` (
	`registration_id` text PRIMARY KEY NOT NULL,
	`next_cursor` integer DEFAULT 1 NOT NULL,
	`row_version` integer DEFAULT 1 NOT NULL,
	`claim_owner` text,
	`claim_token` text,
	`lease_expires_at` text,
	`last_fetched_at` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`registration_id`) REFERENCES `airtable_webhook_registrations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `airtable_webhook_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`registration_id` text NOT NULL,
	`notification_digest` text NOT NULL,
	`raw_body` text NOT NULL,
	`state` text DEFAULT 'received' NOT NULL,
	`received_at` text NOT NULL,
	`processed_at` text,
	FOREIGN KEY (`registration_id`) REFERENCES `airtable_webhook_registrations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `airtable_webhook_notifications_digest_uq` ON `airtable_webhook_notifications` (`registration_id`,`notification_digest`);--> statement-breakpoint
CREATE TABLE `airtable_webhook_registrations` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`registration_version` integer DEFAULT 1 NOT NULL,
	`webhook_id` text,
	`status` text NOT NULL,
	`encrypted_mac_secret` text,
	`specification_hash` text NOT NULL,
	`expiration_time` text,
	`refresh_lease_owner` text,
	`refresh_lease_token` text,
	`refresh_lease_expires_at` text,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `airtable_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `airtable_webhook_registrations_version_uq` ON `airtable_webhook_registrations` (`connection_id`,`registration_version`);--> statement-breakpoint
CREATE TABLE `customer_webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`event_external_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload_json` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` text NOT NULL,
	`claim_owner` text,
	`claim_token` text,
	`lease_expires_at` text,
	`response_status` integer,
	`last_error` text,
	`delivered_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`organization_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subscription_id`) REFERENCES `customer_webhook_subscriptions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "customer_webhook_deliveries_payload_json_ck" CHECK(json_valid("customer_webhook_deliveries"."payload_json") AND json_type("customer_webhook_deliveries"."payload_json") = 'object')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_webhook_deliveries_event_uq` ON `customer_webhook_deliveries` (`organization_id`,`subscription_id`,`event_external_id`);--> statement-breakpoint
CREATE INDEX `idx_customer_webhook_deliveries_due` ON `customer_webhook_deliveries` (`state`,`available_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `customer_webhook_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`encrypted_signing_secret` text NOT NULL,
	`signing_secret_last_four` text NOT NULL,
	`event_filter_json` text DEFAULT '[]' NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`organization_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "customer_webhook_subscriptions_active_ck" CHECK("customer_webhook_subscriptions"."is_active" IN (0, 1)),
	CONSTRAINT "customer_webhook_subscriptions_filter_json_ck" CHECK(json_valid("customer_webhook_subscriptions"."event_filter_json") AND json_type("customer_webhook_subscriptions"."event_filter_json") = 'array')
);
--> statement-breakpoint
CREATE INDEX `idx_customer_webhook_subscriptions_org_active` ON `customer_webhook_subscriptions` (`organization_id`,`is_active`);--> statement-breakpoint
CREATE TABLE `event_embed_configurations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`widget_id` text NOT NULL,
	`name` text NOT NULL,
	`theme` text NOT NULL,
	`output_format` text NOT NULL,
	`layout` text NOT NULL,
	`display_fields_json` text NOT NULL,
	`track_ids_json` text NOT NULL,
	`enabled` integer NOT NULL,
	`revision` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`,`event_id`) REFERENCES `events`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "event_embed_widget_check" CHECK("event_embed_configurations"."widget_id" in ('sessions','speakers','agenda','itinerary','gallery')),
	CONSTRAINT "event_embed_theme_check" CHECK("event_embed_configurations"."theme" in ('auto','light','dark')),
	CONSTRAINT "event_embed_output_check" CHECK("event_embed_configurations"."output_format" in ('styled-html','basic-html','json','xml','ical')),
	CONSTRAINT "event_embed_layout_check" CHECK("event_embed_configurations"."layout" in ('comfortable','compact','list','grid','timeline')),
	CONSTRAINT "event_embed_display_json_check" CHECK(json_valid("event_embed_configurations"."display_fields_json") and json_type("event_embed_configurations"."display_fields_json")='array'),
	CONSTRAINT "event_embed_tracks_json_check" CHECK(json_valid("event_embed_configurations"."track_ids_json") and json_type("event_embed_configurations"."track_ids_json")='array'),
	CONSTRAINT "event_embed_enabled_check" CHECK("event_embed_configurations"."enabled" in (0,1)),
	CONSTRAINT "event_embed_revision_check" CHECK("event_embed_configurations"."revision">0)
);
--> statement-breakpoint
CREATE INDEX `event_embed_configurations_enabled_idx` ON `event_embed_configurations` (`organization_id`,`event_id`,`enabled`,`widget_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_embed_configurations_organization_id_event_id_id_unique` ON `event_embed_configurations` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_embed_configurations_organization_id_event_id_widget_id_unique` ON `event_embed_configurations` (`organization_id`,`event_id`,`widget_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`time_zone` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`venue` text,
	`cfp_enabled` integer NOT NULL,
	`cfp_opens_at` text,
	`cfp_closes_at` text,
	`default_duration_minutes` integer NOT NULL,
	`default_calendar_time_zone` text NOT NULL,
	`default_calendar_location` text,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`organization_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "events_status_check" CHECK("events"."status" in ('draft','active','archived')),
	CONSTRAINT "events_duration_check" CHECK("events"."default_duration_minutes">0),
	CONSTRAINT "events_version_check" CHECK("events"."version">0),
	CONSTRAINT "events_times_check" CHECK("events"."ends_at">"events"."starts_at"),
	CONSTRAINT "events_cfp_times_check" CHECK((("events"."cfp_opens_at" is null and "events"."cfp_closes_at" is null) or ("events"."cfp_opens_at" is not null and "events"."cfp_closes_at" is not null and "events"."cfp_closes_at">"events"."cfp_opens_at")))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_organization_slug_unique` ON `events` (`organization_id`,`slug`);--> statement-breakpoint
CREATE INDEX `events_organization_status_updated_idx` ON `events` (`organization_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `events_organization_slug_idx` ON `events` (`organization_id`,`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `events_organization_id_unique` ON `events` (`organization_id`,`id`);--> statement-breakpoint
CREATE TABLE `formats` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`organization_id`,`event_id`) REFERENCES `events`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "formats_version_check" CHECK("formats"."version">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `formats_event_name_unique` ON `formats` (`organization_id`,`event_id`,`name`);--> statement-breakpoint
CREATE INDEX `formats_event_name_idx` ON `formats` (`organization_id`,`event_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `formats_organization_id_id_unique` ON `formats` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `formats_organization_id_event_id_id_unique` ON `formats` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE TABLE `levels` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`organization_id`,`event_id`) REFERENCES `events`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "levels_version_check" CHECK("levels"."version">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `levels_event_name_unique` ON `levels` (`organization_id`,`event_id`,`name`);--> statement-breakpoint
CREATE INDEX `levels_event_name_idx` ON `levels` (`organization_id`,`event_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `levels_organization_id_id_unique` ON `levels` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `levels_organization_id_event_id_id_unique` ON `levels` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE TABLE `room_resources` (
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`room_id` text NOT NULL,
	`resource_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	PRIMARY KEY(`organization_id`, `event_id`, `room_id`, `resource_id`),
	FOREIGN KEY (`organization_id`,`event_id`,`room_id`) REFERENCES `rooms`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "room_resources_ordinal_check" CHECK("room_resources"."ordinal">=0)
);
--> statement-breakpoint
CREATE INDEX `room_resources_resource_idx` ON `room_resources` (`organization_id`,`event_id`,`resource_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `room_resources_organization_id_event_id_room_id_ordinal_unique` ON `room_resources` (`organization_id`,`event_id`,`room_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`capacity` integer NOT NULL,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`organization_id`,`event_id`) REFERENCES `events`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "rooms_capacity_check" CHECK("rooms"."capacity">=0),
	CONSTRAINT "rooms_version_check" CHECK("rooms"."version">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_event_name_unique` ON `rooms` (`organization_id`,`event_id`,`name`);--> statement-breakpoint
CREATE INDEX `rooms_event_name_idx` ON `rooms` (`organization_id`,`event_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_organization_id_id_unique` ON `rooms` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_organization_id_event_id_id_unique` ON `rooms` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE TABLE `session_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`organization_id`,`event_id`) REFERENCES `events`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "session_settings_version_check" CHECK("session_settings"."version">0)
);
--> statement-breakpoint
CREATE INDEX `session_settings_event_idx` ON `session_settings` (`organization_id`,`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_settings_organization_id_event_id_unique` ON `session_settings` (`organization_id`,`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_settings_organization_id_event_id_id_unique` ON `session_settings` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE TABLE `session_statuses` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`value` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`agenda_eligible` integer NOT NULL,
	`sort_order` integer NOT NULL,
	`active` integer NOT NULL,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`,`event_id`) REFERENCES `events`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "session_statuses_agenda_check" CHECK("session_statuses"."agenda_eligible" in(0,1)),
	CONSTRAINT "session_statuses_active_check" CHECK("session_statuses"."active" in(0,1)),
	CONSTRAINT "session_statuses_order_check" CHECK("session_statuses"."sort_order">=0),
	CONSTRAINT "session_statuses_version_check" CHECK("session_statuses"."version">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_statuses_value_unique` ON `session_statuses` (`organization_id`,`event_id`,`value`);--> statement-breakpoint
CREATE INDEX `session_statuses_active_order_idx` ON `session_statuses` (`organization_id`,`event_id`,`active`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_statuses_organization_id_event_id_sort_order_unique` ON `session_statuses` (`organization_id`,`event_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`organization_id`,`event_id`) REFERENCES `events`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "tags_version_check" CHECK("tags"."version">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_event_name_unique` ON `tags` (`organization_id`,`event_id`,`name`);--> statement-breakpoint
CREATE INDEX `tags_event_name_idx` ON `tags` (`organization_id`,`event_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `tags_organization_id_id_unique` ON `tags` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tags_organization_id_event_id_id_unique` ON `tags` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`organization_id`,`event_id`) REFERENCES `events`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "tracks_version_check" CHECK("tracks"."version">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracks_event_name_unique` ON `tracks` (`organization_id`,`event_id`,`name`);--> statement-breakpoint
CREATE INDEX `tracks_event_name_idx` ON `tracks` (`organization_id`,`event_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `tracks_organization_id_id_unique` ON `tracks` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tracks_organization_id_event_id_id_unique` ON `tracks` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE TABLE `cfp_form_fields` (
	`organization_id` text NOT NULL,
	`form_id` text NOT NULL,
	`id` text NOT NULL,
	`section_id` text NOT NULL,
	`scope` text NOT NULL,
	`field_key` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`placeholder` text,
	`kind` text NOT NULL,
	`required` integer NOT NULL,
	`options_json` text NOT NULL,
	`file_owner` text,
	`allowed_mime_types_json` text,
	`max_bytes` integer,
	`reusable_field_id` text,
	`reusable_field_version` integer,
	`sort_order` integer NOT NULL,
	PRIMARY KEY(`organization_id`, `form_id`, `id`),
	FOREIGN KEY (`organization_id`,`form_id`) REFERENCES `cfp_forms`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`form_id`,`section_id`) REFERENCES `cfp_form_sections`(`organization_id`,`form_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`reusable_field_id`,`reusable_field_version`) REFERENCES `reusable_fields`(`organization_id`,`id`,`version`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "cfp_form_fields_scope_check" CHECK("cfp_form_fields"."scope" in('submission','participant')),
	CONSTRAINT "cfp_form_fields_kind_check" CHECK("cfp_form_fields"."kind" in('file_request','text','rich_text','email','url','select','multi_select','boolean','number')),
	CONSTRAINT "cfp_form_fields_file_check" CHECK(("cfp_form_fields"."kind"='file_request' and "cfp_form_fields"."file_owner" in('submission','participant') and "cfp_form_fields"."allowed_mime_types_json" is not null and "cfp_form_fields"."max_bytes">0) or ("cfp_form_fields"."kind"<>'file_request' and "cfp_form_fields"."file_owner" is null and "cfp_form_fields"."allowed_mime_types_json" is null and "cfp_form_fields"."max_bytes" is null)),
	CONSTRAINT "cfp_form_fields_reusable_check" CHECK(("cfp_form_fields"."reusable_field_id" is null)=("cfp_form_fields"."reusable_field_version" is null)),
	CONSTRAINT "cfp_form_fields_options_check" CHECK(json_valid("cfp_form_fields"."options_json") and json_type("cfp_form_fields"."options_json")=?)
);
--> statement-breakpoint
CREATE INDEX `cfp_form_fields_order_idx` ON `cfp_form_fields` (`organization_id`,`form_id`,`scope`,`sort_order`);--> statement-breakpoint
CREATE INDEX `cfp_form_fields_reusable_idx` ON `cfp_form_fields` (`organization_id`,`reusable_field_id`,`reusable_field_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `cfp_form_fields_organization_id_form_id_field_key_unique` ON `cfp_form_fields` (`organization_id`,`form_id`,`field_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `cfp_form_fields_organization_id_form_id_scope_sort_order_unique` ON `cfp_form_fields` (`organization_id`,`form_id`,`scope`,`sort_order`);--> statement-breakpoint
CREATE TABLE `cfp_form_rules` (
	`organization_id` text NOT NULL,
	`form_id` text NOT NULL,
	`id` text NOT NULL,
	`priority` integer NOT NULL,
	`condition_json` text NOT NULL,
	`actions_json` text NOT NULL,
	PRIMARY KEY(`organization_id`, `form_id`, `id`),
	FOREIGN KEY (`organization_id`,`form_id`) REFERENCES `cfp_forms`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "cfp_form_rules_priority_check" CHECK("cfp_form_rules"."priority">=0),
	CONSTRAINT "cfp_form_rules_condition_check" CHECK(json_valid("cfp_form_rules"."condition_json") and json_type("cfp_form_rules"."condition_json")=?),
	CONSTRAINT "cfp_form_rules_actions_check" CHECK(json_valid("cfp_form_rules"."actions_json") and json_type("cfp_form_rules"."actions_json")=?)
);
--> statement-breakpoint
CREATE INDEX `cfp_form_rules_priority_idx` ON `cfp_form_rules` (`organization_id`,`form_id`,`priority`);--> statement-breakpoint
CREATE UNIQUE INDEX `cfp_form_rules_organization_id_form_id_priority_unique` ON `cfp_form_rules` (`organization_id`,`form_id`,`priority`);--> statement-breakpoint
CREATE TABLE `cfp_form_sections` (
	`organization_id` text NOT NULL,
	`form_id` text NOT NULL,
	`id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`sort_order` integer NOT NULL,
	PRIMARY KEY(`organization_id`, `form_id`, `id`),
	FOREIGN KEY (`organization_id`,`form_id`) REFERENCES `cfp_forms`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "cfp_form_sections_order_check" CHECK("cfp_form_sections"."sort_order">=0)
);
--> statement-breakpoint
CREATE INDEX `cfp_form_sections_order_idx` ON `cfp_form_sections` (`organization_id`,`form_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `cfp_form_sections_organization_id_form_id_sort_order_unique` ON `cfp_form_sections` (`organization_id`,`form_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `cfp_forms` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`welcome_content` text NOT NULL,
	`speaker_limit` integer NOT NULL,
	`max_submissions_per_account` integer NOT NULL,
	`reminders_enabled` integer NOT NULL,
	`admin_notifications_enabled` integer NOT NULL,
	`confirmation_message` text NOT NULL,
	`success_content` text NOT NULL,
	`redirect_url` text,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`,`event_id`) REFERENCES `events`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "cfp_forms_status_check" CHECK("cfp_forms"."status" in('draft','published','closed')),
	CONSTRAINT "cfp_forms_limits_check" CHECK("cfp_forms"."speaker_limit">0 and "cfp_forms"."max_submissions_per_account">0 and "cfp_forms"."version">0),
	CONSTRAINT "cfp_forms_booleans_check" CHECK("cfp_forms"."reminders_enabled" in(0,1) and "cfp_forms"."admin_notifications_enabled" in(0,1))
);
--> statement-breakpoint
CREATE INDEX `cfp_forms_event_status_name_idx` ON `cfp_forms` (`organization_id`,`event_id`,`status`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `cfp_forms_organization_id_id_unique` ON `cfp_forms` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cfp_forms_organization_id_event_id_id_unique` ON `cfp_forms` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE TABLE `participants` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`display_name` text NOT NULL,
	`email` text NOT NULL,
	`normalized_email` text NOT NULL,
	`identity_state` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text,
	`claimed_user_id` text,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`claimed_user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`,`event_id`) REFERENCES `events`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "participants_identity_check" CHECK("participants"."identity_state" in('resolved','ambiguous')),
	CONSTRAINT "participants_source_check" CHECK("participants"."source_type" in('cfp','manual','csv','crm')),
	CONSTRAINT "participants_version_check" CHECK("participants"."version">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `participants_resolved_email_uidx` ON `participants` (`organization_id`,`event_id`,`normalized_email`) WHERE "participants"."normalized_email"<>'' and "participants"."identity_state"='resolved';--> statement-breakpoint
CREATE INDEX `participants_email_idx` ON `participants` (`organization_id`,`event_id`,`normalized_email`);--> statement-breakpoint
CREATE INDEX `participants_source_idx` ON `participants` (`organization_id`,`event_id`,`source_type`,`source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `participants_organization_id_id_unique` ON `participants` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `participants_organization_id_event_id_id_unique` ON `participants` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE TABLE `portal_context_participants` (
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`context_id` text NOT NULL,
	`participant_id` text NOT NULL,
	PRIMARY KEY(`organization_id`, `event_id`, `context_id`, `participant_id`),
	FOREIGN KEY (`organization_id`,`event_id`,`context_id`) REFERENCES `portal_contexts`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`event_id`,`participant_id`) REFERENCES `participants`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `portal_context_participants_participant_idx` ON `portal_context_participants` (`organization_id`,`event_id`,`participant_id`);--> statement-breakpoint
CREATE TABLE `portal_context_submissions` (
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`context_id` text NOT NULL,
	`submission_id` text NOT NULL,
	PRIMARY KEY(`organization_id`, `event_id`, `context_id`, `submission_id`),
	FOREIGN KEY (`organization_id`,`event_id`,`context_id`) REFERENCES `portal_contexts`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`event_id`,`submission_id`) REFERENCES `submissions`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `portal_context_submissions_submission_idx` ON `portal_context_submissions` (`organization_id`,`event_id`,`submission_id`);--> statement-breakpoint
CREATE TABLE `portal_contexts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`status` text NOT NULL,
	`primary_participant_id` text NOT NULL,
	`capabilities_json` text NOT NULL,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`,`event_id`) REFERENCES `events`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`event_id`,`primary_participant_id`) REFERENCES `participants`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "portal_contexts_version_check" CHECK("portal_contexts"."version">0),
	CONSTRAINT "portal_contexts_capabilities_check" CHECK(json_valid("portal_contexts"."capabilities_json") and json_type("portal_contexts"."capabilities_json")=?)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_contexts_slug_unique` ON `portal_contexts` (`organization_id`,`event_id`,`slug`);--> statement-breakpoint
CREATE INDEX `portal_contexts_account_idx` ON `portal_contexts` (`organization_id`,`event_id`,`account_id`);--> statement-breakpoint
CREATE INDEX `portal_contexts_event_idx` ON `portal_contexts` (`organization_id`,`event_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `portal_contexts_organization_id_id_unique` ON `portal_contexts` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `portal_contexts_organization_id_event_id_id_unique` ON `portal_contexts` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `portal_contexts_organization_id_event_id_account_id_id_unique` ON `portal_contexts` (`organization_id`,`event_id`,`account_id`,`id`);--> statement-breakpoint
CREATE TABLE `reusable_fields` (
	`organization_id` text NOT NULL,
	`id` text NOT NULL,
	`version` integer NOT NULL,
	`definition_json` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`organization_id`, `id`, `version`),
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`organization_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reusable_fields_version_check" CHECK("reusable_fields"."version">0),
	CONSTRAINT "reusable_fields_json_check" CHECK(json_valid("reusable_fields"."definition_json") and json_type("reusable_fields"."definition_json")=?)
);
--> statement-breakpoint
CREATE INDEX `reusable_fields_versions_idx` ON `reusable_fields` (`organization_id`,`id`,`version`);--> statement-breakpoint
CREATE TABLE `speaker_asset_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`version_id` text NOT NULL,
	`body` text NOT NULL,
	`author_label` text NOT NULL,
	`author_account_id` text,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `speaker_assets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "speaker_asset_comments_version_check" CHECK("speaker_asset_comments"."version">0)
);
--> statement-breakpoint
CREATE INDEX `speaker_asset_comments_version_idx` ON `speaker_asset_comments` (`organization_id`,`event_id`,`asset_id`,`version_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `speaker_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`submission_id` text,
	`participant_id` text NOT NULL,
	`task_id` text,
	`kind` text NOT NULL,
	`object_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`state` text NOT NULL,
	`version` integer NOT NULL,
	`version_family_id` text NOT NULL,
	`supersedes_asset_id` text,
	`comment_thread_id` text NOT NULL,
	`review_state` text,
	`review_note` text,
	`reviewed_at` text,
	`reviewed_by` text,
	`review_version` integer DEFAULT 0 NOT NULL,
	`latest_version_id` text,
	`current_version_id` text,
	`approved_version_id` text,
	`released_version_id` text,
	`rejection_reason` text,
	`created_at` text NOT NULL,
	`finalized_at` text,
	FOREIGN KEY (`organization_id`,`event_id`) REFERENCES `events`(`organization_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`,`event_id`,`participant_id`) REFERENCES `participants`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`,`event_id`,`submission_id`) REFERENCES `submissions`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`,`event_id`,`task_id`) REFERENCES `speaker_tasks`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`supersedes_asset_id`) REFERENCES `speaker_assets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "speaker_assets_kind_check" CHECK("speaker_assets"."kind" in('headshot','slides','supporting_file')),
	CONSTRAINT "speaker_assets_state_check" CHECK("speaker_assets"."state" in('pending_upload','ready','rejected')),
	CONSTRAINT "speaker_assets_review_check" CHECK("speaker_assets"."review_state" is null or "speaker_assets"."review_state" in('approved','needs_changes')),
	CONSTRAINT "speaker_assets_numbers_check" CHECK("speaker_assets"."size_bytes">=0 and "speaker_assets"."version">0 and "speaker_assets"."review_version">=0)
);
--> statement-breakpoint
CREATE INDEX `speaker_assets_participant_idx` ON `speaker_assets` (`organization_id`,`event_id`,`participant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `speaker_assets_task_idx` ON `speaker_assets` (`organization_id`,`event_id`,`task_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `speaker_assets_family_idx` ON `speaker_assets` (`organization_id`,`event_id`,`version_family_id`,`version`);--> statement-breakpoint
CREATE INDEX `speaker_assets_state_idx` ON `speaker_assets` (`organization_id`,`event_id`,`state`,`created_at`);--> statement-breakpoint
CREATE INDEX `speaker_assets_released_idx` ON `speaker_assets` (`released_version_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `speaker_assets_object_key_unique` ON `speaker_assets` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `speaker_assets_organization_id_id_unique` ON `speaker_assets` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `speaker_assets_organization_id_event_id_id_unique` ON `speaker_assets` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `speaker_assets_organization_id_event_id_version_family_id_version_unique` ON `speaker_assets` (`organization_id`,`event_id`,`version_family_id`,`version`);--> statement-breakpoint
CREATE TABLE `speaker_content` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`title` text,
	`description` text,
	`abstract` text,
	`biography` text,
	`social_links_json` text,
	`headshot_asset_id` text,
	`status` text,
	`version` integer NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`organization_id`,`event_id`) REFERENCES `events`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`headshot_asset_id`) REFERENCES `speaker_assets`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "speaker_content_entity_check" CHECK("speaker_content"."entity_type" in('session','speaker')),
	CONSTRAINT "speaker_content_version_check" CHECK("speaker_content"."version">0)
);
--> statement-breakpoint
CREATE INDEX `speaker_content_source_idx` ON `speaker_content` (`organization_id`,`event_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `speaker_content_organization_id_id_unique` ON `speaker_content` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `speaker_content_organization_id_event_id_id_unique` ON `speaker_content` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `speaker_content_organization_id_event_id_entity_type_entity_id_unique` ON `speaker_content` (`organization_id`,`event_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `speaker_content_history` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`version` integer NOT NULL,
	`actor_account_id` text NOT NULL,
	`actor_label` text,
	`occurred_at` text NOT NULL,
	`snapshot_json` text NOT NULL,
	FOREIGN KEY (`organization_id`,`event_id`) REFERENCES `events`(`organization_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "speaker_content_history_entity_check" CHECK("speaker_content_history"."entity_type" in('session','speaker')),
	CONSTRAINT "speaker_content_history_action_check" CHECK("speaker_content_history"."action" in('created','updated','restored','approved','needs_changes')),
	CONSTRAINT "speaker_content_history_version_check" CHECK("speaker_content_history"."version">0),
	CONSTRAINT "speaker_content_history_snapshot_check" CHECK(json_valid("speaker_content_history"."snapshot_json") and json_type("speaker_content_history"."snapshot_json")=?)
);
--> statement-breakpoint
CREATE INDEX `speaker_content_history_source_idx` ON `speaker_content_history` (`organization_id`,`event_id`,`entity_type`,`entity_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `speaker_content_history_organization_id_event_id_entity_type_entity_id_version_unique` ON `speaker_content_history` (`organization_id`,`event_id`,`entity_type`,`entity_id`,`version`);--> statement-breakpoint
CREATE TABLE `speaker_event_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`html` text,
	`url` text,
	`sort_order` integer NOT NULL,
	`status` text NOT NULL,
	`version` integer NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`,`event_id`) REFERENCES `events`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "speaker_event_resources_status_check" CHECK("speaker_event_resources"."status" in('draft','published','archived')),
	CONSTRAINT "speaker_event_resources_numbers_check" CHECK("speaker_event_resources"."sort_order">=0 and "speaker_event_resources"."version">0)
);
--> statement-breakpoint
CREATE INDEX `speaker_event_resources_order_idx` ON `speaker_event_resources` (`organization_id`,`event_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `speaker_event_resources_organization_id_id_unique` ON `speaker_event_resources` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `speaker_event_resources_organization_id_event_id_id_unique` ON `speaker_event_resources` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `speaker_event_resources_organization_id_event_id_sort_order_unique` ON `speaker_event_resources` (`organization_id`,`event_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `speaker_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`display_name` text NOT NULL,
	`email` text,
	`job_title` text DEFAULT '' NOT NULL,
	`company` text DEFAULT '' NOT NULL,
	`status` text DEFAULT '' NOT NULL,
	`biography` text NOT NULL,
	`social_links_json` text NOT NULL,
	`travel_required` integer NOT NULL,
	`arrival_at` text,
	`departure_at` text,
	`accommodation` text DEFAULT '' NOT NULL,
	`dietary_requirements` text DEFAULT '' NOT NULL,
	`accessibility_needs` text DEFAULT '' NOT NULL,
	`travel_notes` text DEFAULT '' NOT NULL,
	`headshot_asset_id` text,
	`source_type` text,
	`source_id` text,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`,`event_id`,`participant_id`) REFERENCES `participants`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`headshot_asset_id`) REFERENCES `speaker_assets`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "speaker_profiles_source_check" CHECK("speaker_profiles"."source_type" is null or "speaker_profiles"."source_type" in('cfp','manual','csv','crm')),
	CONSTRAINT "speaker_profiles_version_check" CHECK("speaker_profiles"."version">0),
	CONSTRAINT "speaker_profiles_social_check" CHECK(json_valid("speaker_profiles"."social_links_json") and json_type("speaker_profiles"."social_links_json")=?)
);
--> statement-breakpoint
CREATE INDEX `speaker_profiles_participant_idx` ON `speaker_profiles` (`organization_id`,`event_id`,`participant_id`);--> statement-breakpoint
CREATE INDEX `speaker_profiles_status_idx` ON `speaker_profiles` (`organization_id`,`event_id`,`status`);--> statement-breakpoint
CREATE INDEX `speaker_profiles_source_idx` ON `speaker_profiles` (`organization_id`,`event_id`,`source_type`,`source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `speaker_profiles_organization_id_id_unique` ON `speaker_profiles` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `speaker_profiles_organization_id_event_id_id_unique` ON `speaker_profiles` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `speaker_profiles_organization_id_event_id_participant_id_unique` ON `speaker_profiles` (`organization_id`,`event_id`,`participant_id`);--> statement-breakpoint
CREATE TABLE `speaker_reminder_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`task_ids_json` text NOT NULL,
	`recipient_ids_json` text NOT NULL,
	`receipts_json` text NOT NULL,
	`actor_account_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`organization_id`,`event_id`) REFERENCES `events`(`organization_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "speaker_reminder_tasks_check" CHECK(json_valid("speaker_reminder_receipts"."task_ids_json") and json_type("speaker_reminder_receipts"."task_ids_json")=?),
	CONSTRAINT "speaker_reminder_recipients_check" CHECK(json_valid("speaker_reminder_receipts"."recipient_ids_json") and json_type("speaker_reminder_receipts"."recipient_ids_json")=?),
	CONSTRAINT "speaker_reminder_receipts_check" CHECK(json_valid("speaker_reminder_receipts"."receipts_json") and json_type("speaker_reminder_receipts"."receipts_json")=?)
);
--> statement-breakpoint
CREATE INDEX `speaker_reminder_receipts_time_idx` ON `speaker_reminder_receipts` (`organization_id`,`event_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `speaker_reminder_receipts_organization_id_event_id_idempotency_key_unique` ON `speaker_reminder_receipts` (`organization_id`,`event_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `speaker_roster` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`workflow_status` text,
	`organizer_status` text,
	`display_name` text NOT NULL,
	`email` text,
	`job_title` text NOT NULL,
	`company` text NOT NULL,
	`biography` text NOT NULL,
	`social_links_json` text NOT NULL,
	`travel_logistics_json` text NOT NULL,
	`headshot_asset_id` text,
	`source_type` text,
	`source_id` text,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`author_account_id` text,
	FOREIGN KEY (`organization_id`,`event_id`,`submission_id`) REFERENCES `submissions`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`,`event_id`,`participant_id`) REFERENCES `participants`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`headshot_asset_id`) REFERENCES `speaker_assets`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "speaker_roster_role_check" CHECK("speaker_roster"."role" in('primary','co_speaker')),
	CONSTRAINT "speaker_roster_status_check" CHECK("speaker_roster"."status" in('pending','active','revoked')),
	CONSTRAINT "speaker_roster_source_check" CHECK("speaker_roster"."source_type" is null or "speaker_roster"."source_type" in('cfp','manual','csv','crm')),
	CONSTRAINT "speaker_roster_version_check" CHECK("speaker_roster"."version">0),
	CONSTRAINT "speaker_roster_social_check" CHECK(json_valid("speaker_roster"."social_links_json") and json_type("speaker_roster"."social_links_json")=?),
	CONSTRAINT "speaker_roster_travel_check" CHECK(json_valid("speaker_roster"."travel_logistics_json") and json_type("speaker_roster"."travel_logistics_json")=?)
);
--> statement-breakpoint
CREATE INDEX `speaker_roster_submission_idx` ON `speaker_roster` (`organization_id`,`event_id`,`submission_id`,`status`);--> statement-breakpoint
CREATE INDEX `speaker_roster_participant_idx` ON `speaker_roster` (`organization_id`,`event_id`,`participant_id`,`status`);--> statement-breakpoint
CREATE INDEX `speaker_roster_status_idx` ON `speaker_roster` (`organization_id`,`event_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `speaker_roster_organization_id_id_unique` ON `speaker_roster` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `speaker_roster_organization_id_event_id_id_unique` ON `speaker_roster` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `speaker_roster_organization_id_event_id_submission_id_participant_id_unique` ON `speaker_roster` (`organization_id`,`event_id`,`submission_id`,`participant_id`);--> statement-breakpoint
CREATE TABLE `speaker_task_dependencies` (
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`task_id` text NOT NULL,
	`dependency_task_id` text NOT NULL,
	PRIMARY KEY(`organization_id`, `event_id`, `task_id`, `dependency_task_id`),
	FOREIGN KEY (`organization_id`,`event_id`,`task_id`) REFERENCES `speaker_tasks`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`event_id`,`dependency_task_id`) REFERENCES `speaker_tasks`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "speaker_task_dependencies_self_check" CHECK("speaker_task_dependencies"."task_id"<>"speaker_task_dependencies"."dependency_task_id")
);
--> statement-breakpoint
CREATE INDEX `speaker_task_dependencies_reverse_idx` ON `speaker_task_dependencies` (`organization_id`,`event_id`,`dependency_task_id`);--> statement-breakpoint
CREATE TABLE `speaker_task_forms` (
	`id` text NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`task_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`fields_json` text NOT NULL,
	`version` integer NOT NULL,
	`published` integer NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`id`, `version`),
	FOREIGN KEY (`organization_id`,`event_id`,`task_id`) REFERENCES `speaker_tasks`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "speaker_task_forms_version_check" CHECK("speaker_task_forms"."version">0),
	CONSTRAINT "speaker_task_forms_fields_check" CHECK(json_valid("speaker_task_forms"."fields_json") and json_type("speaker_task_forms"."fields_json")=?)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `speaker_task_forms_published_uidx` ON `speaker_task_forms` (`organization_id`,`event_id`,`task_id`) WHERE "speaker_task_forms"."published"=1;--> statement-breakpoint
CREATE INDEX `speaker_task_forms_versions_idx` ON `speaker_task_forms` (`organization_id`,`event_id`,`task_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `speaker_task_forms_organization_id_event_id_task_id_version_unique` ON `speaker_task_forms` (`organization_id`,`event_id`,`task_id`,`version`);--> statement-breakpoint
CREATE TABLE `speaker_task_reminder_offsets` (
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`task_id` text NOT NULL,
	`offset_minutes` integer NOT NULL,
	PRIMARY KEY(`organization_id`, `event_id`, `task_id`, `offset_minutes`),
	FOREIGN KEY (`organization_id`,`event_id`,`task_id`) REFERENCES `speaker_tasks`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "speaker_task_offsets_check" CHECK("speaker_task_reminder_offsets"."offset_minutes">=0)
);
--> statement-breakpoint
CREATE TABLE `speaker_task_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`task_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`definition_version` integer NOT NULL,
	`answers_json` text NOT NULL,
	`status` text NOT NULL,
	`version` integer NOT NULL,
	`feedback` text,
	`submitted_at` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`,`event_id`,`task_id`) REFERENCES `speaker_tasks`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`,`event_id`,`participant_id`) REFERENCES `participants`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`,`definition_version`) REFERENCES `speaker_task_forms`(`id`,`version`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "speaker_task_responses_status_check" CHECK("speaker_task_responses"."status" in('draft','submitted','needs_changes','reopened')),
	CONSTRAINT "speaker_task_responses_versions_check" CHECK("speaker_task_responses"."definition_version">0 and "speaker_task_responses"."version">0),
	CONSTRAINT "speaker_task_responses_answers_check" CHECK(json_valid("speaker_task_responses"."answers_json") and json_type("speaker_task_responses"."answers_json")=?)
);
--> statement-breakpoint
CREATE INDEX `speaker_task_responses_latest_idx` ON `speaker_task_responses` (`organization_id`,`event_id`,`task_id`,`participant_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `speaker_task_responses_organization_id_id_unique` ON `speaker_task_responses` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `speaker_task_responses_organization_id_event_id_task_id_participant_id_version_unique` ON `speaker_task_responses` (`organization_id`,`event_id`,`task_id`,`participant_id`,`version`);--> statement-breakpoint
CREATE TABLE `speaker_task_transitions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`task_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`actor_account_id` text NOT NULL,
	`from_status` text NOT NULL,
	`to_status` text NOT NULL,
	`note` text,
	`occurred_at` text NOT NULL,
	FOREIGN KEY (`organization_id`,`event_id`,`task_id`) REFERENCES `speaker_tasks`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "speaker_task_transitions_from_check" CHECK("speaker_task_transitions"."from_status" in('not_started','in_progress','submitted','needs_changes','completed','waived','overdue','reopened')),
	CONSTRAINT "speaker_task_transitions_to_check" CHECK("speaker_task_transitions"."to_status" in('not_started','in_progress','submitted','needs_changes','completed','waived','overdue','reopened'))
);
--> statement-breakpoint
CREATE INDEX `speaker_task_transitions_time_idx` ON `speaker_task_transitions` (`organization_id`,`event_id`,`task_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `speaker_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`submission_id` text,
	`participant_id` text NOT NULL,
	`type` text NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`due_at` text,
	`allowed_mime_types_json` text NOT NULL,
	`max_bytes` integer,
	`accepted_asset_kinds_json` text NOT NULL,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`,`event_id`) REFERENCES `events`(`organization_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`,`event_id`,`participant_id`) REFERENCES `participants`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`,`event_id`,`submission_id`) REFERENCES `submissions`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "speaker_tasks_type_check" CHECK("speaker_tasks"."type" in('form','upload','action')),
	CONSTRAINT "speaker_tasks_owner_check" CHECK("speaker_tasks"."owner" in('speaker','organizer')),
	CONSTRAINT "speaker_tasks_status_check" CHECK("speaker_tasks"."status" in('not_started','in_progress','submitted','needs_changes','completed','waived','overdue','reopened')),
	CONSTRAINT "speaker_tasks_numbers_check" CHECK("speaker_tasks"."version">0 and ("speaker_tasks"."max_bytes" is null or "speaker_tasks"."max_bytes">0)),
	CONSTRAINT "speaker_tasks_mime_check" CHECK(json_valid("speaker_tasks"."allowed_mime_types_json") and json_type("speaker_tasks"."allowed_mime_types_json")=?),
	CONSTRAINT "speaker_tasks_kinds_check" CHECK(json_valid("speaker_tasks"."accepted_asset_kinds_json") and json_type("speaker_tasks"."accepted_asset_kinds_json")=?)
);
--> statement-breakpoint
CREATE INDEX `speaker_tasks_participant_status_idx` ON `speaker_tasks` (`organization_id`,`event_id`,`participant_id`,`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `speaker_tasks_submission_idx` ON `speaker_tasks` (`organization_id`,`event_id`,`submission_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `speaker_tasks_organization_id_id_unique` ON `speaker_tasks` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `speaker_tasks_organization_id_event_id_id_unique` ON `speaker_tasks` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE TABLE `speaker_wiki_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`summary` text,
	`html` text,
	`url` text,
	`sort_order` integer NOT NULL,
	`status` text NOT NULL,
	`version` integer NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`,`event_id`) REFERENCES `events`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "speaker_wiki_pages_status_check" CHECK("speaker_wiki_pages"."status" in('draft','published','archived')),
	CONSTRAINT "speaker_wiki_pages_numbers_check" CHECK("speaker_wiki_pages"."sort_order">=0 and "speaker_wiki_pages"."version">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `speaker_wiki_pages_slug_unique` ON `speaker_wiki_pages` (`organization_id`,`event_id`,`slug`);--> statement-breakpoint
CREATE INDEX `speaker_wiki_pages_order_idx` ON `speaker_wiki_pages` (`organization_id`,`event_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `speaker_wiki_pages_organization_id_id_unique` ON `speaker_wiki_pages` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `speaker_wiki_pages_organization_id_event_id_id_unique` ON `speaker_wiki_pages` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `speaker_wiki_pages_organization_id_event_id_sort_order_unique` ON `speaker_wiki_pages` (`organization_id`,`event_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `submission_answers` (
	`organization_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`field_key` text NOT NULL,
	`value_json` text NOT NULL,
	`asset_id` text,
	PRIMARY KEY(`organization_id`, `submission_id`, `field_key`),
	FOREIGN KEY (`organization_id`,`submission_id`) REFERENCES `submissions`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `speaker_assets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "submission_answers_json_check" CHECK(json_valid("submission_answers"."value_json"))
);
--> statement-breakpoint
CREATE INDEX `submission_answers_submission_idx` ON `submission_answers` (`organization_id`,`submission_id`);--> statement-breakpoint
CREATE INDEX `submission_answers_asset_idx` ON `submission_answers` (`asset_id`);--> statement-breakpoint
CREATE TABLE `submission_participants` (
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`role` text NOT NULL,
	`biography` text NOT NULL,
	`answers_json` text NOT NULL,
	`ordinal` integer NOT NULL,
	PRIMARY KEY(`organization_id`, `submission_id`, `participant_id`),
	FOREIGN KEY (`organization_id`,`event_id`,`submission_id`) REFERENCES `submissions`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`,`event_id`,`participant_id`) REFERENCES `participants`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "submission_participants_role_check" CHECK("submission_participants"."role" in('primary','co_speaker')),
	CONSTRAINT "submission_participants_order_check" CHECK("submission_participants"."ordinal">=0),
	CONSTRAINT "submission_participants_answers_check" CHECK(json_valid("submission_participants"."answers_json") and json_type("submission_participants"."answers_json")=?)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submission_participants_primary_uidx` ON `submission_participants` (`organization_id`,`submission_id`) WHERE "submission_participants"."role"='primary';--> statement-breakpoint
CREATE INDEX `submission_participants_participant_idx` ON `submission_participants` (`organization_id`,`event_id`,`participant_id`,`submission_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `submission_participants_organization_id_submission_id_ordinal_unique` ON `submission_participants` (`organization_id`,`submission_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `submission_secondary_contacts` (
	`organization_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`ordinal` integer NOT NULL,
	PRIMARY KEY(`organization_id`, `submission_id`, `id`),
	FOREIGN KEY (`organization_id`,`submission_id`) REFERENCES `submissions`(`organization_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "submission_secondary_contacts_order_check" CHECK("submission_secondary_contacts"."ordinal">=0)
);
--> statement-breakpoint
CREATE INDEX `submission_secondary_contacts_order_idx` ON `submission_secondary_contacts` (`organization_id`,`submission_id`,`ordinal`);--> statement-breakpoint
CREATE UNIQUE INDEX `submission_secondary_contacts_organization_id_submission_id_ordinal_unique` ON `submission_secondary_contacts` (`organization_id`,`submission_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `submission_versions` (
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`version` integer NOT NULL,
	`reason` text NOT NULL,
	`actor_id` text NOT NULL,
	`idempotency_key` text,
	`snapshot_json` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`organization_id`, `submission_id`, `version`),
	FOREIGN KEY (`organization_id`,`event_id`,`submission_id`) REFERENCES `submissions`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "submission_versions_reason_check" CHECK("submission_versions"."reason" in('draft_created','draft_saved','submitted','reopened','withdrawn')),
	CONSTRAINT "submission_versions_version_check" CHECK("submission_versions"."version">0),
	CONSTRAINT "submission_versions_snapshot_check" CHECK(json_valid("submission_versions"."snapshot_json") and json_type("submission_versions"."snapshot_json")=?)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submission_versions_idempotency_uidx` ON `submission_versions` (`organization_id`,`submission_id`,`idempotency_key`) WHERE "submission_versions"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX `submission_versions_event_time_idx` ON `submission_versions` (`organization_id`,`event_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`form_id` text NOT NULL,
	`owner_account_id` text NOT NULL,
	`form_version` integer NOT NULL,
	`status` text NOT NULL,
	`completed_steps_json` text NOT NULL,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`submitted_at` text,
	`reopened_at` text,
	`withdrawn_at` text,
	`final_decision_at` text,
	FOREIGN KEY (`organization_id`,`event_id`) REFERENCES `events`(`organization_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`,`event_id`,`form_id`) REFERENCES `cfp_forms`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "submissions_status_check" CHECK("submissions"."status" in('draft','submitted','reopened','withdrawn')),
	CONSTRAINT "submissions_versions_check" CHECK("submissions"."form_version">0 and "submissions"."version">0),
	CONSTRAINT "submissions_steps_check" CHECK(json_valid("submissions"."completed_steps_json") and json_type("submissions"."completed_steps_json")=?)
);
--> statement-breakpoint
CREATE INDEX `submissions_event_updated_idx` ON `submissions` (`organization_id`,`event_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `submissions_owner_form_idx` ON `submissions` (`organization_id`,`event_id`,`form_id`,`owner_account_id`);--> statement-breakpoint
CREATE INDEX `submissions_status_idx` ON `submissions` (`organization_id`,`event_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_organization_id_id_unique` ON `submissions` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_organization_id_event_id_id_unique` ON `submissions` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE TABLE `evaluation_conflicts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`reason` text NOT NULL,
	`declared_at` text NOT NULL,
	FOREIGN KEY (`organization_id`,`event_id`,`assignment_id`) REFERENCES `review_assignments`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `evaluation_conflicts_plan_idx` ON `evaluation_conflicts` (`organization_id`,`event_id`,`plan_id`,`declared_at`);--> statement-breakpoint
CREATE INDEX `evaluation_conflicts_reviewer_idx` ON `evaluation_conflicts` (`organization_id`,`event_id`,`reviewer_id`,`declared_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `evaluation_conflicts_organization_id_id_unique` ON `evaluation_conflicts` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `evaluation_conflicts_assignment_unique` ON `evaluation_conflicts` (`organization_id`,`event_id`,`assignment_id`);--> statement-breakpoint
CREATE TABLE `evaluation_decision_transitions` (
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`decision_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`reason` text NOT NULL,
	`decided_by` text NOT NULL,
	`decided_at` text NOT NULL,
	`idempotency_key` text NOT NULL,
	PRIMARY KEY(`organization_id`, `decision_id`, `ordinal`),
	FOREIGN KEY (`organization_id`,`event_id`,`decision_id`) REFERENCES `evaluation_decisions`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "evaluation_decision_transitions_ordinal_check" CHECK("evaluation_decision_transitions"."ordinal" >= 0)
);
--> statement-breakpoint
CREATE INDEX `evaluation_decision_transitions_order_idx` ON `evaluation_decision_transitions` (`organization_id`,`event_id`,`decision_id`,`ordinal`);--> statement-breakpoint
CREATE UNIQUE INDEX `evaluation_decision_transitions_idempotency_unique` ON `evaluation_decision_transitions` (`organization_id`,`decision_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `evaluation_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`status` text NOT NULL,
	`version` integer NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`,`event_id`,`plan_id`) REFERENCES `review_plans`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "evaluation_decisions_version_check" CHECK("evaluation_decisions"."version" > 0)
);
--> statement-breakpoint
CREATE INDEX `evaluation_decisions_event_idx` ON `evaluation_decisions` (`organization_id`,`event_id`,`plan_id`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `evaluation_decisions_organization_id_id_unique` ON `evaluation_decisions` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `evaluation_decisions_event_id_unique` ON `evaluation_decisions` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `evaluation_decisions_plan_submission_unique` ON `evaluation_decisions` (`organization_id`,`plan_id`,`submission_id`);--> statement-breakpoint
CREATE TABLE `evaluation_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`round_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`comment` text NOT NULL,
	`submitted_at` text,
	`plan_revision` integer NOT NULL,
	`round_revision` integer NOT NULL,
	`rubric_revision` integer NOT NULL,
	`submission_revision` integer NOT NULL,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`,`event_id`,`assignment_id`) REFERENCES `review_assignments`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "evaluation_reviews_revisions_check" CHECK("evaluation_reviews"."plan_revision" > 0 AND "evaluation_reviews"."round_revision" > 0 AND "evaluation_reviews"."rubric_revision" > 0 AND "evaluation_reviews"."submission_revision" > 0 AND "evaluation_reviews"."version" > 0)
);
--> statement-breakpoint
CREATE INDEX `evaluation_reviews_plan_idx` ON `evaluation_reviews` (`organization_id`,`event_id`,`plan_id`,`round_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `evaluation_reviews_submission_idx` ON `evaluation_reviews` (`organization_id`,`event_id`,`submission_id`,`round_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `evaluation_reviews_organization_id_id_unique` ON `evaluation_reviews` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `evaluation_reviews_event_id_unique` ON `evaluation_reviews` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `evaluation_reviews_assignment_unique` ON `evaluation_reviews` (`organization_id`,`event_id`,`assignment_id`);--> statement-breakpoint
CREATE TABLE `evaluation_score_evidence` (
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`review_id` text NOT NULL,
	`criterion_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`evidence` text NOT NULL,
	PRIMARY KEY(`organization_id`, `review_id`, `criterion_id`, `ordinal`),
	FOREIGN KEY (`organization_id`,`review_id`,`criterion_id`) REFERENCES `evaluation_scores`(`organization_id`,`review_id`,`criterion_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "evaluation_score_evidence_ordinal_check" CHECK("evaluation_score_evidence"."ordinal" >= 0)
);
--> statement-breakpoint
CREATE INDEX `evaluation_score_evidence_order_idx` ON `evaluation_score_evidence` (`organization_id`,`event_id`,`review_id`,`criterion_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `evaluation_scores` (
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`review_id` text NOT NULL,
	`criterion_id` text NOT NULL,
	`value_number` real,
	`value_text` text,
	`origin` text NOT NULL,
	`human_confirmed_by` text,
	`suggestion_id` text,
	`suggestion_status` text,
	`rubric_revision` integer NOT NULL,
	`submission_revision` integer NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`organization_id`, `review_id`, `criterion_id`),
	FOREIGN KEY (`organization_id`,`event_id`,`review_id`) REFERENCES `evaluation_reviews`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "evaluation_scores_one_value_check" CHECK(("evaluation_scores"."value_number" IS NOT NULL) <> ("evaluation_scores"."value_text" IS NOT NULL)),
	CONSTRAINT "evaluation_scores_origin_check" CHECK(("evaluation_scores"."origin" = 'human' AND "evaluation_scores"."suggestion_id" IS NULL AND "evaluation_scores"."suggestion_status" IS NULL) OR ("evaluation_scores"."origin" = 'ai' AND "evaluation_scores"."suggestion_id" IS NOT NULL AND "evaluation_scores"."suggestion_status" IS NOT NULL)),
	CONSTRAINT "evaluation_scores_confirmation_check" CHECK("evaluation_scores"."human_confirmed_by" IS NULL OR ("evaluation_scores"."origin" = 'ai' AND "evaluation_scores"."suggestion_status" IN ('accepted', 'edited'))),
	CONSTRAINT "evaluation_scores_revision_check" CHECK("evaluation_scores"."rubric_revision" > 0 AND "evaluation_scores"."submission_revision" > 0)
);
--> statement-breakpoint
CREATE INDEX `evaluation_scores_review_idx` ON `evaluation_scores` (`organization_id`,`event_id`,`review_id`);--> statement-breakpoint
CREATE INDEX `evaluation_scores_suggestion_idx` ON `evaluation_scores` (`organization_id`,`event_id`,`suggestion_id`);--> statement-breakpoint
CREATE TABLE `evaluation_suggestion_candidates` (
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`suggestion_id` text NOT NULL,
	`id` text NOT NULL,
	`criterion_id` text NOT NULL,
	`value` real NOT NULL,
	`evidence_json` text NOT NULL,
	`provenance_json` text NOT NULL,
	`ordinal` integer NOT NULL,
	PRIMARY KEY(`organization_id`, `suggestion_id`, `id`),
	FOREIGN KEY (`organization_id`,`event_id`,`suggestion_id`) REFERENCES `evaluation_suggestions`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "evaluation_suggestion_candidates_json_check" CHECK("evaluation_suggestion_candidates"."ordinal" >= 0 AND json_valid("evaluation_suggestion_candidates"."evidence_json") AND json_type("evaluation_suggestion_candidates"."evidence_json") = 'array' AND json_valid("evaluation_suggestion_candidates"."provenance_json") AND json_type("evaluation_suggestion_candidates"."provenance_json") = 'object')
);
--> statement-breakpoint
CREATE INDEX `evaluation_suggestion_candidates_order_idx` ON `evaluation_suggestion_candidates` (`organization_id`,`event_id`,`suggestion_id`,`criterion_id`,`ordinal`);--> statement-breakpoint
CREATE UNIQUE INDEX `evaluation_suggestion_candidates_criterion_order_unique` ON `evaluation_suggestion_candidates` (`organization_id`,`suggestion_id`,`criterion_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `evaluation_suggestion_history` (
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`suggestion_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`action` text NOT NULL,
	`actor_id` text,
	`at` text NOT NULL,
	`reason` text,
	`values_json` text,
	PRIMARY KEY(`organization_id`, `suggestion_id`, `ordinal`),
	FOREIGN KEY (`organization_id`,`event_id`,`suggestion_id`) REFERENCES `evaluation_suggestions`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "evaluation_suggestion_history_values_check" CHECK("evaluation_suggestion_history"."ordinal" >= 0 AND ("evaluation_suggestion_history"."values_json" IS NULL OR (json_valid("evaluation_suggestion_history"."values_json") AND json_type("evaluation_suggestion_history"."values_json") = 'object')))
);
--> statement-breakpoint
CREATE INDEX `evaluation_suggestion_history_order_idx` ON `evaluation_suggestion_history` (`organization_id`,`event_id`,`suggestion_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `evaluation_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`round_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`plan_revision` integer NOT NULL,
	`rubric_revision` integer NOT NULL,
	`submission_revision` integer NOT NULL,
	`rubric_id` text,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`generated_at` text NOT NULL,
	`source_references_json` text NOT NULL,
	`provenance_json` text NOT NULL,
	`status` text NOT NULL,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`,`event_id`,`plan_id`) REFERENCES `review_plans`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`,`event_id`,`assignment_id`) REFERENCES `review_assignments`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "evaluation_suggestions_revision_check" CHECK("evaluation_suggestions"."plan_revision" > 0 AND "evaluation_suggestions"."rubric_revision" > 0 AND "evaluation_suggestions"."submission_revision" > 0 AND "evaluation_suggestions"."version" > 0),
	CONSTRAINT "evaluation_suggestions_source_json_check" CHECK(json_valid("evaluation_suggestions"."source_references_json") AND json_type("evaluation_suggestions"."source_references_json") = 'array'),
	CONSTRAINT "evaluation_suggestions_provenance_json_check" CHECK(json_valid("evaluation_suggestions"."provenance_json") AND json_type("evaluation_suggestions"."provenance_json") = 'object')
);
--> statement-breakpoint
CREATE INDEX `evaluation_suggestions_plan_idx` ON `evaluation_suggestions` (`organization_id`,`event_id`,`plan_id`,`round_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `evaluation_suggestions_assignment_idx` ON `evaluation_suggestions` (`organization_id`,`event_id`,`assignment_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `evaluation_suggestions_status_idx` ON `evaluation_suggestions` (`organization_id`,`event_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `evaluation_suggestions_organization_id_id_unique` ON `evaluation_suggestions` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `evaluation_suggestions_event_id_unique` ON `evaluation_suggestions` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE TABLE `review_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`round_id` text NOT NULL,
	`round_revision` integer NOT NULL,
	`submission_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`status` text NOT NULL,
	`predecessor_assignment_id` text,
	`successor_assignment_id` text,
	`superseded_reason` text,
	`superseded_at` text,
	`plan_version` integer NOT NULL,
	`rubric_revision` integer NOT NULL,
	`submission_revision` integer NOT NULL,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`,`event_id`,`plan_id`) REFERENCES `review_plans`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`,`event_id`,`round_id`,`round_revision`) REFERENCES `review_rounds`(`organization_id`,`event_id`,`id`,`revision`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`,`event_id`,`predecessor_assignment_id`) REFERENCES `review_assignments`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`,`event_id`,`successor_assignment_id`) REFERENCES `review_assignments`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "review_assignments_revisions_check" CHECK("review_assignments"."round_revision" > 0 AND "review_assignments"."plan_version" > 0 AND "review_assignments"."rubric_revision" > 0 AND "review_assignments"."submission_revision" > 0 AND "review_assignments"."version" > 0),
	CONSTRAINT "review_assignments_lineage_check" CHECK(("review_assignments"."predecessor_assignment_id" IS NULL OR "review_assignments"."predecessor_assignment_id" <> "review_assignments"."id") AND ("review_assignments"."successor_assignment_id" IS NULL OR "review_assignments"."successor_assignment_id" <> "review_assignments"."id")),
	CONSTRAINT "review_assignments_superseded_check" CHECK(("review_assignments"."status" = 'superseded') = ("review_assignments"."superseded_reason" IS NOT NULL AND "review_assignments"."superseded_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_assignments_active_unique_idx` ON `review_assignments` (`organization_id`,`event_id`,`plan_id`,`round_id`,`submission_id`,`reviewer_id`) WHERE "review_assignments"."status" <> 'superseded';--> statement-breakpoint
CREATE INDEX `review_assignments_plan_status_idx` ON `review_assignments` (`organization_id`,`event_id`,`plan_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `review_assignments_reviewer_idx` ON `review_assignments` (`organization_id`,`event_id`,`reviewer_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `review_assignments_submission_round_idx` ON `review_assignments` (`organization_id`,`event_id`,`submission_id`,`round_id`,`round_revision`);--> statement-breakpoint
CREATE INDEX `review_assignments_predecessor_idx` ON `review_assignments` (`organization_id`,`event_id`,`predecessor_assignment_id`);--> statement-breakpoint
CREATE INDEX `review_assignments_successor_idx` ON `review_assignments` (`organization_id`,`event_id`,`successor_assignment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_assignments_organization_id_id_unique` ON `review_assignments` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_assignments_event_id_unique` ON `review_assignments` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE TABLE `review_criteria` (
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`rubric_id` text NOT NULL,
	`rubric_revision` integer NOT NULL,
	`id` text NOT NULL,
	`label` text NOT NULL,
	`description` text NOT NULL,
	`minimum` real NOT NULL,
	`maximum` real NOT NULL,
	`weight` real NOT NULL,
	`required` integer NOT NULL,
	`input_type` text NOT NULL,
	`sort_order` integer NOT NULL,
	PRIMARY KEY(`organization_id`, `plan_id`, `rubric_id`, `rubric_revision`, `id`),
	FOREIGN KEY (`organization_id`,`event_id`,`plan_id`,`rubric_id`,`rubric_revision`) REFERENCES `review_rubrics`(`organization_id`,`event_id`,`plan_id`,`id`,`revision`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "review_criteria_range_check" CHECK("review_criteria"."maximum" >= "review_criteria"."minimum"),
	CONSTRAINT "review_criteria_weight_order_check" CHECK("review_criteria"."weight" > 0 AND "review_criteria"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE INDEX `review_criteria_order_idx` ON `review_criteria` (`organization_id`,`event_id`,`plan_id`,`rubric_id`,`rubric_revision`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_criteria_sort_unique` ON `review_criteria` (`organization_id`,`plan_id`,`rubric_id`,`rubric_revision`,`sort_order`);--> statement-breakpoint
CREATE TABLE `review_criterion_options` (
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`rubric_id` text NOT NULL,
	`rubric_revision` integer NOT NULL,
	`criterion_id` text NOT NULL,
	`id` text NOT NULL,
	`label` text NOT NULL,
	`value` text NOT NULL,
	`sort_order` integer NOT NULL,
	PRIMARY KEY(`organization_id`, `plan_id`, `rubric_id`, `rubric_revision`, `criterion_id`, `id`),
	FOREIGN KEY (`organization_id`,`plan_id`,`rubric_id`,`rubric_revision`,`criterion_id`) REFERENCES `review_criteria`(`organization_id`,`plan_id`,`rubric_id`,`rubric_revision`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "review_criterion_options_order_check" CHECK("review_criterion_options"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE INDEX `review_criterion_options_order_idx` ON `review_criterion_options` (`organization_id`,`event_id`,`plan_id`,`rubric_id`,`rubric_revision`,`criterion_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_criterion_options_value_unique` ON `review_criterion_options` (`organization_id`,`plan_id`,`rubric_id`,`rubric_revision`,`criterion_id`,`value`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_criterion_options_sort_unique` ON `review_criterion_options` (`organization_id`,`plan_id`,`rubric_id`,`rubric_revision`,`criterion_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `review_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`blind_review` integer NOT NULL,
	`closes_at` text,
	`reviews_per_submission` integer NOT NULL,
	`max_assignments_per_reviewer` integer NOT NULL,
	`track_filter` text,
	`auto_distribute` integer NOT NULL,
	`reviewer_projection_field_ids_json` text NOT NULL,
	`reviewer_projection_file_ids_json` text NOT NULL,
	`grading_revision` integer,
	`grading_locked_at` text,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "review_plans_counts_check" CHECK("review_plans"."reviews_per_submission" > 0 AND "review_plans"."max_assignments_per_reviewer" > 0),
	CONSTRAINT "review_plans_version_check" CHECK("review_plans"."version" > 0),
	CONSTRAINT "review_plans_grading_check" CHECK("review_plans"."grading_revision" IS NULL OR "review_plans"."grading_revision" > 0),
	CONSTRAINT "review_plans_grading_lock_check" CHECK("review_plans"."grading_locked_at" IS NULL OR "review_plans"."grading_revision" IS NOT NULL),
	CONSTRAINT "review_plans_fields_json_check" CHECK(json_valid("review_plans"."reviewer_projection_field_ids_json") AND json_type("review_plans"."reviewer_projection_field_ids_json") = 'array'),
	CONSTRAINT "review_plans_files_json_check" CHECK(json_valid("review_plans"."reviewer_projection_file_ids_json") AND json_type("review_plans"."reviewer_projection_file_ids_json") = 'array')
);
--> statement-breakpoint
CREATE INDEX `review_plans_event_status_idx` ON `review_plans` (`organization_id`,`event_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_plans_organization_id_id_unique` ON `review_plans` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_plans_organization_id_event_id_id_unique` ON `review_plans` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE TABLE `review_rounds` (
	`id` text NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`name` text NOT NULL,
	`sequence` integer NOT NULL,
	`revision` integer NOT NULL,
	`rubric_id` text NOT NULL,
	`rubric_revision` integer NOT NULL,
	`opens_at` text,
	`closes_at` text,
	`blind_review` integer NOT NULL,
	`anonymization` text NOT NULL,
	`track_filter` text,
	PRIMARY KEY(`organization_id`, `plan_id`, `id`, `revision`),
	FOREIGN KEY (`organization_id`,`event_id`,`plan_id`) REFERENCES `review_plans`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "review_rounds_revision_check" CHECK("review_rounds"."sequence" >= 0 AND "review_rounds"."revision" > 0 AND "review_rounds"."rubric_revision" > 0),
	CONSTRAINT "review_rounds_time_check" CHECK("review_rounds"."closes_at" IS NULL OR "review_rounds"."opens_at" IS NULL OR "review_rounds"."closes_at" > "review_rounds"."opens_at")
);
--> statement-breakpoint
CREATE INDEX `review_rounds_current_idx` ON `review_rounds` (`organization_id`,`event_id`,`plan_id`,`sequence`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_rounds_event_key_unique` ON `review_rounds` (`organization_id`,`event_id`,`plan_id`,`id`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_rounds_event_revision_unique` ON `review_rounds` (`organization_id`,`event_id`,`id`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_rounds_sequence_revision_unique` ON `review_rounds` (`organization_id`,`plan_id`,`sequence`,`revision`);--> statement-breakpoint
CREATE TABLE `review_rubrics` (
	`id` text NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`revision` integer NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`organization_id`, `plan_id`, `id`, `revision`),
	FOREIGN KEY (`organization_id`,`event_id`,`plan_id`) REFERENCES `review_plans`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "review_rubrics_revision_check" CHECK("review_rubrics"."revision" > 0)
);
--> statement-breakpoint
CREATE INDEX `review_rubrics_plan_idx` ON `review_rubrics` (`organization_id`,`event_id`,`plan_id`,`id`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_rubrics_event_key_unique` ON `review_rubrics` (`organization_id`,`event_id`,`plan_id`,`id`,`revision`);--> statement-breakpoint
CREATE TABLE `reviewer_pool_members` (
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`pool_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	PRIMARY KEY(`organization_id`, `event_id`, `pool_id`, `reviewer_id`),
	FOREIGN KEY (`organization_id`,`event_id`,`pool_id`) REFERENCES `reviewer_pools`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reviewer_pool_members_reviewer_idx` ON `reviewer_pool_members` (`organization_id`,`event_id`,`reviewer_id`,`pool_id`);--> statement-breakpoint
CREATE TABLE `reviewer_pools` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`round_id` text NOT NULL,
	`round_revision` integer NOT NULL,
	`name` text,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`,`event_id`,`round_id`,`round_revision`) REFERENCES `review_rounds`(`organization_id`,`event_id`,`id`,`revision`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "reviewer_pools_version_check" CHECK("reviewer_pools"."round_revision" > 0 AND "reviewer_pools"."version" > 0)
);
--> statement-breakpoint
CREATE INDEX `reviewer_pools_event_idx` ON `reviewer_pools` (`organization_id`,`event_id`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `reviewer_pools_organization_id_id_unique` ON `reviewer_pools` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `reviewer_pools_event_id_unique` ON `reviewer_pools` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `reviewer_pools_round_unique` ON `reviewer_pools` (`organization_id`,`event_id`,`round_id`,`round_revision`);--> statement-breakpoint
CREATE TABLE `agenda_drafts` (
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`version` integer NOT NULL,
	`time_zone` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	PRIMARY KEY(`organization_id`, `event_id`),
	FOREIGN KEY (`organization_id`,`event_id`) REFERENCES `agenda_states`(`organization_id`,`event_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agenda_drafts_version_check" CHECK("agenda_drafts"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agenda_drafts_version_unique` ON `agenda_drafts` (`organization_id`,`event_id`,`version`);--> statement-breakpoint
CREATE TABLE `agenda_entries` (
	`id` text NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`container_type` text NOT NULL,
	`container_id` text NOT NULL,
	`session_id` text NOT NULL,
	`room_id` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`starts_at_local` text NOT NULL,
	`ends_at_local` text NOT NULL,
	`time_zone` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`format` text NOT NULL,
	`speaker_names_json` text NOT NULL,
	`room_name` text NOT NULL,
	`track_names_json` text NOT NULL,
	PRIMARY KEY(`organization_id`, `event_id`, `container_type`, `container_id`, `id`),
	CONSTRAINT "agenda_entries_time_check" CHECK("agenda_entries"."ends_at" > "agenda_entries"."starts_at" AND "agenda_entries"."ends_at_local" > "agenda_entries"."starts_at_local"),
	CONSTRAINT "agenda_entries_metadata_check" CHECK(json_valid("agenda_entries"."speaker_names_json") AND json_type("agenda_entries"."speaker_names_json") = 'array' AND json_valid("agenda_entries"."track_names_json") AND json_type("agenda_entries"."track_names_json") = 'array'),
	CONSTRAINT "agenda_entries_draft_container_check" CHECK(("agenda_entries"."container_type" = 'draft' AND "agenda_entries"."container_id" = "agenda_entries"."event_id") OR "agenda_entries"."container_type" <> 'draft')
);
--> statement-breakpoint
CREATE INDEX `agenda_entries_container_idx` ON `agenda_entries` (`organization_id`,`event_id`,`container_type`,`container_id`,`starts_at`,`id`);--> statement-breakpoint
CREATE INDEX `agenda_entries_session_idx` ON `agenda_entries` (`organization_id`,`event_id`,`session_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `agenda_entries_room_idx` ON `agenda_entries` (`organization_id`,`event_id`,`room_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `agenda_entry_tracks` (
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`container_type` text NOT NULL,
	`container_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`track_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	PRIMARY KEY(`organization_id`, `event_id`, `container_type`, `container_id`, `entry_id`, `track_id`),
	FOREIGN KEY (`organization_id`,`event_id`,`container_type`,`container_id`,`entry_id`) REFERENCES `agenda_entries`(`organization_id`,`event_id`,`container_type`,`container_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agenda_entry_tracks_ordinal_check" CHECK("agenda_entry_tracks"."ordinal" >= 0)
);
--> statement-breakpoint
CREATE INDEX `agenda_entry_tracks_track_idx` ON `agenda_entry_tracks` (`organization_id`,`event_id`,`track_id`,`container_type`,`container_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agenda_entry_tracks_ordinal_unique` ON `agenda_entry_tracks` (`organization_id`,`event_id`,`container_type`,`container_id`,`entry_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `agenda_outbox_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`revision_id` text NOT NULL,
	`type` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`organization_id`,`event_id`,`revision_id`) REFERENCES `agenda_revisions`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `agenda_outbox_events_event_idx` ON `agenda_outbox_events` (`organization_id`,`event_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `agenda_outbox_events_organization_id_id_unique` ON `agenda_outbox_events` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agenda_outbox_events_event_id_unique` ON `agenda_outbox_events` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agenda_outbox_events_idempotency_unique` ON `agenda_outbox_events` (`organization_id`,`event_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `agenda_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`revision_number` integer NOT NULL,
	`source_draft_version` integer NOT NULL,
	`time_zone` text NOT NULL,
	`published_at` text NOT NULL,
	`published_by` text NOT NULL,
	`rollback_of_revision_id` text,
	`source_hash` text NOT NULL,
	FOREIGN KEY (`organization_id`,`event_id`,`rollback_of_revision_id`) REFERENCES `agenda_revisions`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "agenda_revisions_versions_check" CHECK("agenda_revisions"."revision_number" > 0 AND "agenda_revisions"."source_draft_version" > 0),
	CONSTRAINT "agenda_revisions_rollback_check" CHECK("agenda_revisions"."rollback_of_revision_id" IS NULL OR "agenda_revisions"."rollback_of_revision_id" <> "agenda_revisions"."id")
);
--> statement-breakpoint
CREATE INDEX `agenda_revisions_event_idx` ON `agenda_revisions` (`organization_id`,`event_id`,`revision_number`);--> statement-breakpoint
CREATE INDEX `agenda_revisions_source_draft_idx` ON `agenda_revisions` (`organization_id`,`event_id`,`source_draft_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `agenda_revisions_organization_id_id_unique` ON `agenda_revisions` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agenda_revisions_event_id_unique` ON `agenda_revisions` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agenda_revisions_number_unique` ON `agenda_revisions` (`organization_id`,`event_id`,`revision_number`);--> statement-breakpoint
CREATE TABLE `agenda_states` (
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`state_version` integer NOT NULL,
	`time_zone` text NOT NULL,
	`minimum_travel_minutes` integer NOT NULL,
	`current_published_revision_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`organization_id`, `event_id`),
	CONSTRAINT "agenda_states_versions_check" CHECK("agenda_states"."state_version" > 0 AND "agenda_states"."minimum_travel_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE `agenda_suggestion_changes` (
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`run_id` text NOT NULL,
	`id` text NOT NULL,
	`kind` text NOT NULL,
	`entry_id` text NOT NULL,
	`session_id` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`summary` text NOT NULL,
	`rationale` text,
	PRIMARY KEY(`organization_id`, `event_id`, `run_id`, `id`),
	FOREIGN KEY (`organization_id`,`event_id`,`run_id`) REFERENCES `agenda_suggestion_runs`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agenda_suggestion_changes_shape_check" CHECK(("agenda_suggestion_changes"."kind" = 'add' AND "agenda_suggestion_changes"."before_json" IS NULL AND "agenda_suggestion_changes"."after_json" IS NOT NULL) OR ("agenda_suggestion_changes"."kind" = 'remove' AND "agenda_suggestion_changes"."before_json" IS NOT NULL AND "agenda_suggestion_changes"."after_json" IS NULL) OR ("agenda_suggestion_changes"."kind" IN ('move', 'change') AND "agenda_suggestion_changes"."before_json" IS NOT NULL AND "agenda_suggestion_changes"."after_json" IS NOT NULL)),
	CONSTRAINT "agenda_suggestion_changes_json_check" CHECK(("agenda_suggestion_changes"."before_json" IS NULL OR (json_valid("agenda_suggestion_changes"."before_json") AND json_type("agenda_suggestion_changes"."before_json") = 'object')) AND ("agenda_suggestion_changes"."after_json" IS NULL OR (json_valid("agenda_suggestion_changes"."after_json") AND json_type("agenda_suggestion_changes"."after_json") = 'object')))
);
--> statement-breakpoint
CREATE INDEX `agenda_suggestion_changes_run_idx` ON `agenda_suggestion_changes` (`organization_id`,`event_id`,`run_id`,`id`);--> statement-breakpoint
CREATE INDEX `agenda_suggestion_changes_session_idx` ON `agenda_suggestion_changes` (`organization_id`,`event_id`,`session_id`,`run_id`);--> statement-breakpoint
CREATE TABLE `agenda_suggestion_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`base_draft_version` integer NOT NULL,
	`base_draft_revision` integer NOT NULL,
	`criteria_json` text NOT NULL,
	`diff_json` text NOT NULL,
	`diagnostics_json` text NOT NULL,
	`generated_at` text NOT NULL,
	`generated_by` text NOT NULL,
	`regeneration_of_run_id` text,
	`accepted_change_ids_json` text NOT NULL,
	`applied_change_ids_json` text NOT NULL,
	`rejected_at` text,
	`rejected_by` text,
	`superseded_at` text,
	`applied_at` text,
	`applied_by` text,
	FOREIGN KEY (`organization_id`,`event_id`,`regeneration_of_run_id`) REFERENCES `agenda_suggestion_runs`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "agenda_suggestion_runs_versions_check" CHECK("agenda_suggestion_runs"."version" > 0 AND "agenda_suggestion_runs"."base_draft_version" > 0 AND "agenda_suggestion_runs"."base_draft_revision" = "agenda_suggestion_runs"."base_draft_version"),
	CONSTRAINT "agenda_suggestion_runs_json_check" CHECK(json_valid("agenda_suggestion_runs"."criteria_json") AND json_type("agenda_suggestion_runs"."criteria_json") = 'object' AND json_valid("agenda_suggestion_runs"."diff_json") AND json_type("agenda_suggestion_runs"."diff_json") = 'object' AND json_valid("agenda_suggestion_runs"."diagnostics_json") AND json_type("agenda_suggestion_runs"."diagnostics_json") = 'object' AND json_valid("agenda_suggestion_runs"."accepted_change_ids_json") AND json_type("agenda_suggestion_runs"."accepted_change_ids_json") = 'array' AND json_valid("agenda_suggestion_runs"."applied_change_ids_json") AND json_type("agenda_suggestion_runs"."applied_change_ids_json") = 'array'),
	CONSTRAINT "agenda_suggestion_runs_terminal_check" CHECK((("agenda_suggestion_runs"."status" = 'rejected') = ("agenda_suggestion_runs"."rejected_at" IS NOT NULL AND "agenda_suggestion_runs"."rejected_by" IS NOT NULL)) AND (("agenda_suggestion_runs"."status" = 'applied') = ("agenda_suggestion_runs"."applied_at" IS NOT NULL AND "agenda_suggestion_runs"."applied_by" IS NOT NULL)) AND ("agenda_suggestion_runs"."status" <> 'superseded' OR "agenda_suggestion_runs"."superseded_at" IS NOT NULL)),
	CONSTRAINT "agenda_suggestion_runs_regeneration_check" CHECK("agenda_suggestion_runs"."regeneration_of_run_id" IS NULL OR "agenda_suggestion_runs"."regeneration_of_run_id" <> "agenda_suggestion_runs"."id")
);
--> statement-breakpoint
CREATE INDEX `agenda_suggestion_runs_status_idx` ON `agenda_suggestion_runs` (`organization_id`,`event_id`,`status`,`generated_at`);--> statement-breakpoint
CREATE INDEX `agenda_suggestion_runs_base_version_idx` ON `agenda_suggestion_runs` (`organization_id`,`event_id`,`base_draft_version`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `agenda_suggestion_runs_organization_id_id_unique` ON `agenda_suggestion_runs` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agenda_suggestion_runs_event_id_unique` ON `agenda_suggestion_runs` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE TABLE `agenda_warning_overrides` (
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`draft_version` integer NOT NULL,
	`warning_id` text NOT NULL,
	`reason` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`organization_id`, `event_id`, `draft_version`, `warning_id`),
	FOREIGN KEY (`organization_id`,`event_id`,`draft_version`) REFERENCES `agenda_drafts`(`organization_id`,`event_id`,`version`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agenda_warning_overrides_version_check" CHECK("agenda_warning_overrides"."draft_version" > 0)
);
--> statement-breakpoint
CREATE INDEX `agenda_warning_overrides_draft_idx` ON `agenda_warning_overrides` (`organization_id`,`event_id`,`draft_version`,`created_at`);--> statement-breakpoint
CREATE TABLE `session_history` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`version` integer NOT NULL,
	`actor_id` text NOT NULL,
	`actor_label` text,
	`occurred_at` text NOT NULL,
	`prior_status` text,
	`new_status` text,
	`prior_content_status` text,
	`new_content_status` text,
	`snapshot_json` text,
	CONSTRAINT "session_history_version_check" CHECK("session_history"."version" > 0),
	CONSTRAINT "session_history_snapshot_check" CHECK("session_history"."snapshot_json" IS NULL OR (json_valid("session_history"."snapshot_json") AND json_type("session_history"."snapshot_json") = 'object'))
);
--> statement-breakpoint
CREATE INDEX `session_history_entity_idx` ON `session_history` (`organization_id`,`event_id`,`entity_type`,`entity_id`,`version`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `session_history_event_idx` ON `session_history` (`organization_id`,`event_id`,`occurred_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_history_version_action_unique` ON `session_history` (`organization_id`,`event_id`,`entity_type`,`entity_id`,`version`,`action`,`id`);--> statement-breakpoint
CREATE TABLE `session_resources` (
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`session_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`resource_id` text NOT NULL,
	PRIMARY KEY(`organization_id`, `event_id`, `session_id`, `resource_id`),
	FOREIGN KEY (`organization_id`,`event_id`,`session_id`) REFERENCES `sessions`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "session_resources_ordinal_check" CHECK("session_resources"."ordinal" >= 0)
);
--> statement-breakpoint
CREATE INDEX `session_resources_resource_idx` ON `session_resources` (`organization_id`,`event_id`,`resource_id`,`session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_resources_ordinal_unique` ON `session_resources` (`organization_id`,`event_id`,`session_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `session_speakers` (
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`session_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`speaker_id` text NOT NULL,
	`display_name` text,
	`role` text,
	PRIMARY KEY(`organization_id`, `event_id`, `session_id`, `speaker_id`),
	FOREIGN KEY (`organization_id`,`event_id`,`session_id`) REFERENCES `sessions`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "session_speakers_ordinal_check" CHECK("session_speakers"."ordinal" >= 0)
);
--> statement-breakpoint
CREATE INDEX `session_speakers_speaker_idx` ON `session_speakers` (`organization_id`,`event_id`,`speaker_id`,`session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_speakers_ordinal_unique` ON `session_speakers` (`organization_id`,`event_id`,`session_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `session_tags` (
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`session_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`organization_id`, `event_id`, `session_id`, `tag_id`),
	FOREIGN KEY (`organization_id`,`event_id`,`session_id`) REFERENCES `sessions`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "session_tags_ordinal_check" CHECK("session_tags"."ordinal" >= 0)
);
--> statement-breakpoint
CREATE INDEX `session_tags_tag_idx` ON `session_tags` (`organization_id`,`event_id`,`tag_id`,`session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_tags_ordinal_unique` ON `session_tags` (`organization_id`,`event_id`,`session_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `session_tracks` (
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`session_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`track_id` text NOT NULL,
	PRIMARY KEY(`organization_id`, `event_id`, `session_id`, `track_id`),
	FOREIGN KEY (`organization_id`,`event_id`,`session_id`) REFERENCES `sessions`(`organization_id`,`event_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "session_tracks_ordinal_check" CHECK("session_tracks"."ordinal" >= 0)
);
--> statement-breakpoint
CREATE INDEX `session_tracks_track_idx` ON `session_tracks` (`organization_id`,`event_id`,`track_id`,`session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_tracks_ordinal_unique` ON `session_tracks` (`organization_id`,`event_id`,`session_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`status` text NOT NULL,
	`content_status` text,
	`duration_minutes` integer NOT NULL,
	`capacity_required` integer NOT NULL,
	`room_id` text,
	`format_id` text,
	`level_id` text,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`deleted_at` text,
	CONSTRAINT "sessions_values_check" CHECK("sessions"."duration_minutes" > 0 AND "sessions"."capacity_required" >= 0 AND "sessions"."version" > 0)
);
--> statement-breakpoint
CREATE INDEX `sessions_event_status_idx` ON `sessions` (`organization_id`,`event_id`,`status`,`deleted_at`,`updated_at`);--> statement-breakpoint
CREATE INDEX `sessions_room_idx` ON `sessions` (`organization_id`,`event_id`,`room_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `sessions_format_idx` ON `sessions` (`organization_id`,`event_id`,`format_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `sessions_level_idx` ON `sessions` (`organization_id`,`event_id`,`level_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `sessions_title_idx` ON `sessions` (`organization_id`,`event_id`,`title`,`deleted_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_organization_id_id_unique` ON `sessions` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_event_id_unique` ON `sessions` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
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
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_revisions_source_uidx` ON `content_revisions` (`organization_id`,`event_id`,`source_type`,`source_id`,`source_revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `content_revisions_candidate_uidx` ON `content_revisions` (`candidate_id`);--> statement-breakpoint
CREATE TABLE `program_agenda_projection_entries` (
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
);
--> statement-breakpoint
CREATE UNIQUE INDEX `program_agenda_projection_entries_ordinal_uidx` ON `program_agenda_projection_entries` (`projection_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `program_agenda_projections` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`revision_number` integer NOT NULL,
	`source_hash` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "program_agenda_projections_revision_check" CHECK("program_agenda_projections"."revision_number">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `program_agenda_projections_revision_uidx` ON `program_agenda_projections` (`organization_id`,`event_id`,`revision_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `program_agenda_projections_hash_uidx` ON `program_agenda_projections` (`organization_id`,`event_id`,`source_hash`);--> statement-breakpoint
CREATE INDEX `program_agenda_projections_event_idx` ON `program_agenda_projections` (`organization_id`,`event_id`,`revision_number`);--> statement-breakpoint
CREATE TABLE `program_publication_states` (
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
);
--> statement-breakpoint
CREATE INDEX `program_publication_states_pending_idx` ON `program_publication_states` (`organization_id`,`pending_release_id`);--> statement-breakpoint
CREATE TABLE `program_releases` (
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
);
--> statement-breakpoint
CREATE UNIQUE INDEX `program_releases_revision_uidx` ON `program_releases` (`organization_id`,`event_id`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `program_releases_scope_uidx` ON `program_releases` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE INDEX `program_releases_lifecycle_idx` ON `program_releases` (`organization_id`,`event_id`,`lifecycle`,`revision`);--> statement-breakpoint
CREATE INDEX `program_releases_parent_idx` ON `program_releases` (`organization_id`,`event_id`,`parent_served_revision`);--> statement-breakpoint
CREATE INDEX `program_releases_rollback_idx` ON `program_releases` (`organization_id`,`event_id`,`rollback_target_revision`);--> statement-breakpoint
CREATE TABLE `program_speaker_projection_entries` (
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
);
--> statement-breakpoint
CREATE UNIQUE INDEX `program_speaker_projection_entries_ordinal_uidx` ON `program_speaker_projection_entries` (`projection_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `program_speaker_projection_entries_participant_idx` ON `program_speaker_projection_entries` (`participant_id`);--> statement-breakpoint
CREATE TABLE `program_speaker_projections` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_id` text NOT NULL,
	`revision_number` integer NOT NULL,
	`source_hash` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "program_speaker_projections_revision_check" CHECK("program_speaker_projections"."revision_number">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `program_speaker_projections_revision_uidx` ON `program_speaker_projections` (`organization_id`,`event_id`,`revision_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `program_speaker_projections_hash_uidx` ON `program_speaker_projections` (`organization_id`,`event_id`,`source_hash`);--> statement-breakpoint
CREATE INDEX `program_speaker_projections_event_idx` ON `program_speaker_projections` (`organization_id`,`event_id`,`revision_number`);--> statement-breakpoint
CREATE TABLE `remix_audit` (
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
);
--> statement-breakpoint
CREATE INDEX `remix_audit_candidate_idx` ON `remix_audit` (`candidate_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `remix_audit_event_idx` ON `remix_audit` (`organization_id`,`event_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `remix_candidates` (
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
);
--> statement-breakpoint
CREATE UNIQUE INDEX `remix_candidates_scope_uidx` ON `remix_candidates` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `remix_candidates_event_scope_uidx` ON `remix_candidates` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE INDEX `remix_candidates_status_idx` ON `remix_candidates` (`organization_id`,`event_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `remix_candidates_source_idx` ON `remix_candidates` (`organization_id`,`event_id`,`source_type`,`source_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `remix_candidates_parent_idx` ON `remix_candidates` (`parent_candidate_id`);--> statement-breakpoint
CREATE TABLE `report_definition_versions` (
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
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_definition_versions_scope_uidx` ON `report_definition_versions` (`organization_id`,`event_id`,`definition_id`,`version`);--> statement-breakpoint
CREATE INDEX `report_definition_versions_latest_idx` ON `report_definition_versions` (`definition_id`,`version`);--> statement-breakpoint
CREATE TABLE `report_definitions` (
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
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_definitions_scope_uidx` ON `report_definitions` (`organization_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `report_definitions_event_scope_uidx` ON `report_definitions` (`organization_id`,`event_id`,`id`);--> statement-breakpoint
CREATE INDEX `report_definitions_list_idx` ON `report_definitions` (`organization_id`,`event_id`,`deleted_at`,`name`);--> statement-breakpoint
CREATE INDEX `report_definitions_find_idx` ON `report_definitions` (`organization_id`,`id`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `report_runs` (
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
);
--> statement-breakpoint
CREATE INDEX `report_runs_definition_idx` ON `report_runs` (`organization_id`,`event_id`,`definition_id`,`completed_at`);--> statement-breakpoint
CREATE INDEX `report_runs_event_idx` ON `report_runs` (`organization_id`,`event_id`,`completed_at`);--> statement-breakpoint
CREATE INDEX `report_runs_requester_idx` ON `report_runs` (`organization_id`,`requester_id`,`completed_at`);
