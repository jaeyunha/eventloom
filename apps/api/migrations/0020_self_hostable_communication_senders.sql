-- Replace the deployment-specific sender allowlist with application-compatible
-- email sender checks. D1 keeps foreign-key enforcement enabled while applying
-- migrations, so snapshot and rebuild the complete dependent communication graph
-- rather than relying on PRAGMA foreign_keys = OFF.

CREATE TABLE `_0020_communication_templates` AS SELECT * FROM `communication_templates`;
CREATE TABLE `_0020_communication_previews` AS SELECT * FROM `communication_previews`;
CREATE TABLE `_0020_communication_preview_recipients` AS SELECT * FROM `communication_preview_recipients`;
CREATE TABLE `_0020_communication_sends` AS SELECT * FROM `communication_sends`;
CREATE TABLE `_0020_communication_send_recipients` AS SELECT * FROM `communication_send_recipients`;
CREATE TABLE `_0020_communication_deliveries` AS SELECT * FROM `communication_deliveries`;
CREATE TABLE `_0020_communication_delivery_history` AS SELECT * FROM `communication_delivery_history`;

DROP TABLE `communication_delivery_history`;
DROP TABLE `communication_deliveries`;
DROP TABLE `communication_send_recipients`;
DROP TABLE `communication_preview_recipients`;
DROP TABLE `communication_sends`;
DROP TABLE `communication_previews`;
DROP TABLE `communication_templates`;

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
  CONSTRAINT "communication_templates_version_check" CHECK(`version` > 0),
  CONSTRAINT "communication_templates_purpose_check" CHECK(`purpose` IN ('verification','receipt','reminder','decision','task','schedule_publish','schedule_update','schedule_cancel','organizer_group_email')),
  CONSTRAINT "communication_templates_status_check" CHECK(`status` IN ('draft','approved','archived')),
  CONSTRAINT "communication_templates_sender_check" CHECK(
    `sender` = trim(`sender`)
    AND length(`sender`) BETWEEN 3 AND 320
    AND `sender` NOT LIKE '%@%@%'
    AND instr(`sender`, '@') > 1
    AND substr(`sender`, 1, 1) <> '.'
    AND substr(`sender`, instr(`sender`, '@') - 1, 1) GLOB '[A-Za-z0-9_+-]'
    AND substr(`sender`, 1, instr(`sender`, '@') - 1) NOT GLOB '*[^A-Za-z0-9_+.''-]*'
    AND `sender` NOT LIKE '%..%'
    AND substr(`sender`, instr(`sender`, '@') + 1) LIKE '%.%'
    AND substr(`sender`, instr(`sender`, '@') + 1) NOT GLOB '*[^A-Za-z0-9.-]*'
    AND substr(`sender`, instr(`sender`, '@') + 1, 1) GLOB '[A-Za-z0-9]'
    AND substr(`sender`, -1, 1) GLOB '[A-Za-z]'
    AND substr(`sender`, -2, 1) GLOB '[A-Za-z]'
    AND substr(rtrim(substr(`sender`, instr(`sender`, '@') + 1), 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'), -1, 1) = '.'
    AND substr(`sender`, instr(`sender`, '@') + 1) NOT LIKE '.%'
    AND substr(`sender`, instr(`sender`, '@') + 1) NOT LIKE '%.'
    AND substr(`sender`, instr(`sender`, '@') + 1) NOT LIKE '-%'
    AND substr(`sender`, instr(`sender`, '@') + 1) NOT LIKE '%-'
    AND substr(`sender`, instr(`sender`, '@') + 1) NOT LIKE '%.-%'
    AND substr(`sender`, instr(`sender`, '@') + 1) NOT LIKE '%-.%'
  ),
  CONSTRAINT "communication_templates_variables_json_check" CHECK(json_valid(`variables_json`) AND json_type(`variables_json`) = 'array'),
  CONSTRAINT "communication_templates_approval_check" CHECK((`status` = 'approved') = (`approved_by` IS NOT NULL AND `approved_at` IS NOT NULL))
) STRICT;

CREATE UNIQUE INDEX `communication_templates_scope_uidx`
  ON `communication_templates` (`organization_id`, `event_id`, `id`, `version`);
CREATE INDEX `communication_templates_lookup_idx`
  ON `communication_templates` (`organization_id`, `event_id`, `purpose`, `status`, `version`);

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
  FOREIGN KEY (`template_id`, `template_version`) REFERENCES `communication_templates`(`id`, `version`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT "communication_previews_purpose_check" CHECK(`purpose` IN ('verification','receipt','reminder','decision','task','schedule_publish','schedule_update','schedule_cancel','organizer_group_email')),
  CONSTRAINT "communication_previews_audience_check" CHECK(`audience` IN ('all_participants','accepted_participants','waitlisted_participants','rejected_participants','task_assignees','scheduled_participants')),
  CONSTRAINT "communication_previews_count_check" CHECK(`recipient_count` >= 0),
  CONSTRAINT "communication_previews_data_json_check" CHECK(json_valid(`render_data_json`) AND json_type(`render_data_json`) = 'object')
) STRICT;

CREATE UNIQUE INDEX `communication_previews_scope_uidx`
  ON `communication_previews` (`organization_id`, `event_id`, `id`);
CREATE INDEX `communication_previews_expiry_idx` ON `communication_previews` (`expires_at`);

CREATE TABLE `communication_preview_recipients` (
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
  CONSTRAINT "communication_preview_recipients_ordinal_check" CHECK(`ordinal` >= 0),
  CONSTRAINT "communication_preview_recipients_audiences_json_check" CHECK(json_valid(`audiences_json`) AND json_type(`audiences_json`) = 'array'),
  CONSTRAINT "communication_preview_recipients_data_json_check" CHECK(json_valid(`data_json`) AND json_type(`data_json`) = 'object')
) STRICT;

CREATE UNIQUE INDEX `communication_preview_recipients_ordinal_uidx`
  ON `communication_preview_recipients` (`preview_id`, `ordinal`);

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
  FOREIGN KEY (`template_id`, `template_version`) REFERENCES `communication_templates`(`id`, `version`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`preview_id`) REFERENCES `communication_previews`(`id`) ON UPDATE no action ON DELETE set null,
  CONSTRAINT "communication_sends_purpose_check" CHECK(`purpose` IN ('verification','receipt','reminder','decision','task','schedule_publish','schedule_update','schedule_cancel','organizer_group_email')),
  CONSTRAINT "communication_sends_audience_check" CHECK(`audience` IS NULL OR `audience` IN ('all_participants','accepted_participants','waitlisted_participants','rejected_participants','task_assignees','scheduled_participants')),
  CONSTRAINT "communication_sends_status_check" CHECK(`status` IN ('queued','delivered','partial','failed')),
  CONSTRAINT "communication_sends_terminal_check" CHECK(`terminal` IN (0,1)),
  CONSTRAINT "communication_sends_counts_check" CHECK(`recipient_count` >= 0 AND `queued_count` >= 0 AND `delivered_count` >= 0 AND `failed_count` >= 0 AND `queued_count` + `delivered_count` + `failed_count` = `recipient_count`),
  CONSTRAINT "communication_sends_data_json_check" CHECK(json_valid(`data_json`) AND json_type(`data_json`) = 'object'),
  CONSTRAINT "communication_sends_template_sender_check" CHECK(
    `template_sender` = trim(`template_sender`)
    AND length(`template_sender`) BETWEEN 3 AND 320
    AND `template_sender` NOT LIKE '%@%@%'
    AND instr(`template_sender`, '@') > 1
    AND substr(`template_sender`, 1, 1) <> '.'
    AND substr(`template_sender`, instr(`template_sender`, '@') - 1, 1) GLOB '[A-Za-z0-9_+-]'
    AND substr(`template_sender`, 1, instr(`template_sender`, '@') - 1) NOT GLOB '*[^A-Za-z0-9_+.''-]*'
    AND `template_sender` NOT LIKE '%..%'
    AND substr(`template_sender`, instr(`template_sender`, '@') + 1) LIKE '%.%'
    AND substr(`template_sender`, instr(`template_sender`, '@') + 1) NOT GLOB '*[^A-Za-z0-9.-]*'
    AND substr(`template_sender`, instr(`template_sender`, '@') + 1, 1) GLOB '[A-Za-z0-9]'
    AND substr(`template_sender`, -1, 1) GLOB '[A-Za-z]'
    AND substr(`template_sender`, -2, 1) GLOB '[A-Za-z]'
    AND substr(rtrim(substr(`template_sender`, instr(`template_sender`, '@') + 1), 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'), -1, 1) = '.'
    AND substr(`template_sender`, instr(`template_sender`, '@') + 1) NOT LIKE '.%'
    AND substr(`template_sender`, instr(`template_sender`, '@') + 1) NOT LIKE '%.'
    AND substr(`template_sender`, instr(`template_sender`, '@') + 1) NOT LIKE '-%'
    AND substr(`template_sender`, instr(`template_sender`, '@') + 1) NOT LIKE '%-'
    AND substr(`template_sender`, instr(`template_sender`, '@') + 1) NOT LIKE '%.-%'
    AND substr(`template_sender`, instr(`template_sender`, '@') + 1) NOT LIKE '%-.%'
  )
) STRICT;

CREATE UNIQUE INDEX `communication_sends_idempotency_uidx`
  ON `communication_sends` (`organization_id`, `event_id`, `idempotency_key`);
CREATE INDEX `communication_sends_status_idx`
  ON `communication_sends` (`organization_id`, `event_id`, `status`, `created_at`);

CREATE TABLE `communication_send_recipients` (
  `send_id` text NOT NULL,
  `recipient_id` text NOT NULL,
  `participant_id` text NOT NULL,
  `email` text COLLATE NOCASE NOT NULL,
  `display_name` text NOT NULL,
  `audiences_json` text NOT NULL,
  `data_json` text NOT NULL,
  PRIMARY KEY(`send_id`, `recipient_id`),
  FOREIGN KEY (`send_id`) REFERENCES `communication_sends`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT "communication_send_recipients_audiences_json_check" CHECK(json_valid(`audiences_json`) AND json_type(`audiences_json`) = 'array'),
  CONSTRAINT "communication_send_recipients_data_json_check" CHECK(json_valid(`data_json`) AND json_type(`data_json`) = 'object')
) STRICT;

CREATE INDEX `communication_send_recipients_email_idx`
  ON `communication_send_recipients` (`send_id`, `email`);

CREATE TABLE `communication_deliveries` (
  `send_id` text NOT NULL,
  `recipient_id` text NOT NULL,
  `status` text NOT NULL,
  `provider_message_id` text,
  `failure_reason` text,
  `attempts` integer NOT NULL,
  PRIMARY KEY(`send_id`, `recipient_id`),
  FOREIGN KEY (`send_id`, `recipient_id`) REFERENCES `communication_send_recipients`(`send_id`, `recipient_id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT "communication_deliveries_status_check" CHECK(`status` IN ('queued','delivered','failed','bounced','complained')),
  CONSTRAINT "communication_deliveries_attempts_check" CHECK(`attempts` >= 0)
) STRICT;

CREATE UNIQUE INDEX `communication_deliveries_provider_uidx`
  ON `communication_deliveries` (`provider_message_id`) WHERE `provider_message_id` IS NOT NULL;

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
  FOREIGN KEY (`send_id`, `recipient_id`) REFERENCES `communication_deliveries`(`send_id`, `recipient_id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT "communication_delivery_history_status_check" CHECK(`status` IN ('queued','delivered','failed','bounced','complained')),
  CONSTRAINT "communication_delivery_history_ordinal_check" CHECK(`ordinal` >= 0)
) STRICT;

CREATE UNIQUE INDEX `communication_delivery_history_id_uidx`
  ON `communication_delivery_history` (`id`);

INSERT INTO `communication_templates` SELECT * FROM `_0020_communication_templates`;
INSERT INTO `communication_previews` SELECT * FROM `_0020_communication_previews`;
INSERT INTO `communication_preview_recipients` SELECT * FROM `_0020_communication_preview_recipients`;
INSERT INTO `communication_sends` SELECT * FROM `_0020_communication_sends`;
INSERT INTO `communication_send_recipients` SELECT * FROM `_0020_communication_send_recipients`;
INSERT INTO `communication_deliveries` SELECT * FROM `_0020_communication_deliveries`;
INSERT INTO `communication_delivery_history` SELECT * FROM `_0020_communication_delivery_history`;

DROP TABLE `_0020_communication_delivery_history`;
DROP TABLE `_0020_communication_deliveries`;
DROP TABLE `_0020_communication_send_recipients`;
DROP TABLE `_0020_communication_sends`;
DROP TABLE `_0020_communication_preview_recipients`;
DROP TABLE `_0020_communication_previews`;
DROP TABLE `_0020_communication_templates`;
