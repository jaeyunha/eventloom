-- Operational state for canonical participant grants, reminder delivery, and publication rebuilds.
-- Airtable remains authoritative for participant/task/review/publication business records. This
-- migration intentionally does not backfill speaker_grants: exact Airtable participant/profile
-- relationships are required during the cutover.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS participant_grants (
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  permissions_json TEXT NOT NULL DEFAULT '[]' CHECK (
    json_valid(permissions_json) AND json_type(permissions_json) = 'array'
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY (organization_id, event_id, participant_id, user_id)
) STRICT;

CREATE INDEX IF NOT EXISTS participant_grants_scope_idx
  ON participant_grants(organization_id, event_id, participant_id, revoked_at);
CREATE INDEX IF NOT EXISTS participant_grants_user_scope_idx
  ON participant_grants(user_id, organization_id, event_id, revoked_at);

CREATE TABLE IF NOT EXISTS reminder_runs (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('automatic', 'manual')),
  audience_type TEXT NOT NULL CHECK (audience_type IN ('task', 'review', 'combined')),
  audience_revision TEXT NOT NULL,
  candidate_count INTEGER NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  eligible_count INTEGER NOT NULL DEFAULT 0 CHECK (eligible_count >= 0),
  queued_count INTEGER NOT NULL DEFAULT 0 CHECK (queued_count >= 0),
  skipped_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (
    state IN ('pending', 'running', 'completed', 'failed')
  ),
  configuration_failure TEXT,
  actor_id TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS reminder_runs_scope_idx
  ON reminder_runs(organization_id, event_id, started_at DESC);
CREATE INDEX IF NOT EXISTS reminder_runs_state_idx
  ON reminder_runs(organization_id, event_id, state, started_at DESC);
CREATE INDEX IF NOT EXISTS reminder_runs_trigger_idx
  ON reminder_runs(organization_id, event_id, trigger_type, started_at DESC);

CREATE TABLE IF NOT EXISTS reminder_dispatches (
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
      'candidate',
      'eligible',
      'skipped',
      'queued',
      'provider_accepted',
      'delivered',
      'failed',
      'bounced'
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

CREATE INDEX IF NOT EXISTS reminder_dispatches_run_idx
  ON reminder_dispatches(run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reminder_dispatches_scope_status_idx
  ON reminder_dispatches(organization_id, event_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS reminder_dispatches_recipient_idx
  ON reminder_dispatches(organization_id, event_id, recipient, created_at DESC);
CREATE INDEX IF NOT EXISTS reminder_dispatches_task_idx
  ON reminder_dispatches(organization_id, event_id, task_id, cadence_window);
CREATE INDEX IF NOT EXISTS reminder_dispatches_review_assignment_idx
  ON reminder_dispatches(organization_id, event_id, review_assignment_id, cadence_window);
CREATE INDEX IF NOT EXISTS reminder_dispatches_outbox_job_idx
  ON reminder_dispatches(outbox_job_id);

CREATE TABLE IF NOT EXISTS publication_rebuild_receipts (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (
    trigger_type IN (
      'initial_publication',
      'confirmed_profile',
      'approved_session_content',
      'released_asset_pointer',
      'released_schedule',
      'manual',
      'rollback'
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

CREATE INDEX IF NOT EXISTS publication_rebuild_receipts_scope_idx
  ON publication_rebuild_receipts(organization_id, event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS publication_rebuild_receipts_state_idx
  ON publication_rebuild_receipts(organization_id, event_id, state, updated_at DESC);
CREATE INDEX IF NOT EXISTS publication_rebuild_receipts_revision_idx
  ON publication_rebuild_receipts(organization_id, event_id, source_revision);
CREATE INDEX IF NOT EXISTS publication_rebuild_receipts_outbox_job_idx
  ON publication_rebuild_receipts(outbox_job_id);
CREATE INDEX IF NOT EXISTS publication_rebuild_receipts_program_release_idx
  ON publication_rebuild_receipts(organization_id, event_id, program_release_id, created_at DESC);
CREATE INDEX IF NOT EXISTS publication_rebuild_receipts_parent_release_idx
  ON publication_rebuild_receipts(parent_release_id);
