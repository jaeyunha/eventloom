-- Durable per-version evaluation decision work through the shared outbox.
-- D1 keeps foreign-key enforcement enabled during migrations, so preserve and rebuild
-- every table that references outbox_jobs before widening its topic CHECK constraint.

CREATE TABLE `_0041_outbox_jobs` AS SELECT * FROM `outbox_jobs`;
CREATE TABLE `_0041_delivery_attempts` AS SELECT * FROM `delivery_attempts`;
CREATE TABLE `_0041_reminder_dispatches` AS SELECT * FROM `reminder_dispatches`;
CREATE TABLE `_0041_publication_rebuild_receipts` AS SELECT * FROM `publication_rebuild_receipts`;

DROP TABLE `delivery_attempts`;
DROP TABLE `reminder_dispatches`;
DROP TABLE `publication_rebuild_receipts`;
DROP TABLE `outbox_jobs`;

CREATE TABLE `outbox_jobs` (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  topic TEXT NOT NULL CHECK (
    topic IN (
      'communications',
      'webhooks',
      'calendar',
      'accelevents',
      'file-scan',
      'cache-invalidation',
      'reports',
      'evaluation-decisions'
    )
  ),
  deduplication_key TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (
    state IN ('pending', 'queued', 'processing', 'delivered', 'failed', 'dead-letter')
  ),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at TEXT NOT NULL,
  lease_owner TEXT,
  lease_expires_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (tenant_id, topic, deduplication_key)
) STRICT;

CREATE TABLE `delivery_attempts` (
  id TEXT PRIMARY KEY NOT NULL,
  outbox_job_id TEXT NOT NULL REFERENCES outbox_jobs(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('processing', 'delivered', 'retryable', 'failed')),
  provider_status INTEGER,
  error_code TEXT,
  retry_at TEXT,
  UNIQUE (outbox_job_id, attempt_number)
) STRICT;

CREATE TABLE `reminder_dispatches` (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL REFERENCES reminder_runs(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  recipient TEXT NOT NULL CHECK (length(trim(recipient)) > 0),
  task_id TEXT,
  review_assignment_id TEXT,
  eligibility_reason TEXT NOT NULL,
  cadence_window TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  provider_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (
    status IN (
      'candidate', 'eligible', 'skipped', 'queued', 'provider_accepted', 'delivered',
      'failed', 'bounced'
    )
  ),
  skip_metadata_json TEXT CHECK (
    skip_metadata_json IS NULL OR (
      json_valid(skip_metadata_json) AND json_type(skip_metadata_json) = 'object'
    )
  ),
  failure_metadata_json TEXT CHECK (
    failure_metadata_json IS NULL OR (
      json_valid(failure_metadata_json) AND json_type(failure_metadata_json) = 'object'
    )
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  eligible_at TEXT,
  skipped_at TEXT,
  queued_at TEXT,
  provider_accepted_at TEXT,
  delivered_at TEXT,
  failed_at TEXT,
  bounced_at TEXT,
  completed_at TEXT,
  outbox_job_id TEXT REFERENCES outbox_jobs(id) ON DELETE SET NULL,
  CHECK (
    (task_id IS NOT NULL AND review_assignment_id IS NULL)
    OR (task_id IS NULL AND review_assignment_id IS NOT NULL)
  ),
  UNIQUE (organization_id, event_id, idempotency_key)
) STRICT;

CREATE TABLE `publication_rebuild_receipts` (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (
    trigger_type IN (
      'initial_publication', 'confirmed_profile', 'approved_session_content',
      'released_asset_pointer', 'released_schedule', 'manual', 'rollback'
    )
  ),
  source_revision TEXT NOT NULL CHECK (length(trim(source_revision)) > 0),
  source_hashes_json TEXT NOT NULL CHECK (
    json_valid(source_hashes_json) AND json_type(source_hashes_json) = 'object'
  ),
  idempotency_key TEXT NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  outbox_job_id TEXT REFERENCES outbox_jobs(id) ON DELETE SET NULL,
  program_release_id TEXT,
  parent_release_id TEXT,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'served', 'failed')),
  failure_reason TEXT,
  failure_metadata_json TEXT CHECK (
    failure_metadata_json IS NULL OR (
      json_valid(failure_metadata_json) AND json_type(failure_metadata_json) = 'object'
    )
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  served_at TEXT,
  failed_at TEXT,
  CHECK (state <> 'served' OR served_at IS NOT NULL),
  CHECK (
    state <> 'failed'
    OR (failure_reason IS NOT NULL AND length(trim(failure_reason)) > 0 AND failed_at IS NOT NULL)
  ),
  UNIQUE (organization_id, event_id, idempotency_key)
) STRICT;

INSERT INTO `outbox_jobs` SELECT * FROM `_0041_outbox_jobs`;
INSERT INTO `delivery_attempts` SELECT * FROM `_0041_delivery_attempts`;
INSERT INTO `reminder_dispatches` SELECT * FROM `_0041_reminder_dispatches`;
INSERT INTO `publication_rebuild_receipts` SELECT * FROM `_0041_publication_rebuild_receipts`;

DROP TABLE `_0041_delivery_attempts`;
DROP TABLE `_0041_reminder_dispatches`;
DROP TABLE `_0041_publication_rebuild_receipts`;
DROP TABLE `_0041_outbox_jobs`;

CREATE INDEX `outbox_jobs_ready_idx` ON `outbox_jobs` (`state`, `available_at`);
CREATE INDEX `outbox_jobs_tenant_idx` ON `outbox_jobs` (`tenant_id`, `created_at` DESC);
CREATE INDEX `delivery_attempts_job_idx`
  ON `delivery_attempts` (`outbox_job_id`, `attempt_number` DESC);
CREATE INDEX `reminder_dispatches_run_idx` ON `reminder_dispatches` (`run_id`, `created_at` DESC);
CREATE INDEX `reminder_dispatches_scope_status_idx`
  ON `reminder_dispatches` (`organization_id`, `event_id`, `status`, `updated_at` DESC);
CREATE INDEX `reminder_dispatches_recipient_idx`
  ON `reminder_dispatches` (`organization_id`, `event_id`, `recipient`, `created_at` DESC);
CREATE INDEX `reminder_dispatches_task_idx`
  ON `reminder_dispatches` (`organization_id`, `event_id`, `task_id`, `cadence_window`);
CREATE INDEX `reminder_dispatches_review_assignment_idx`
  ON `reminder_dispatches` (`organization_id`, `event_id`, `review_assignment_id`, `cadence_window`);
CREATE INDEX `reminder_dispatches_outbox_job_idx` ON `reminder_dispatches` (`outbox_job_id`);
CREATE INDEX `publication_rebuild_receipts_scope_idx`
  ON `publication_rebuild_receipts` (`organization_id`, `event_id`, `created_at` DESC);
CREATE INDEX `publication_rebuild_receipts_state_idx`
  ON `publication_rebuild_receipts` (`organization_id`, `event_id`, `state`, `updated_at` DESC);
CREATE INDEX `publication_rebuild_receipts_revision_idx`
  ON `publication_rebuild_receipts` (`organization_id`, `event_id`, `source_revision`);
CREATE INDEX `publication_rebuild_receipts_outbox_job_idx`
  ON `publication_rebuild_receipts` (`outbox_job_id`);
CREATE INDEX `publication_rebuild_receipts_program_release_idx`
  ON `publication_rebuild_receipts` (`organization_id`, `event_id`, `program_release_id`, `created_at` DESC);
CREATE INDEX `publication_rebuild_receipts_parent_release_idx`
  ON `publication_rebuild_receipts` (`parent_release_id`);

PRAGMA foreign_key_check;
