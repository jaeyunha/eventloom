-- Durable sidecar state for retries, idempotency, integration receipts, uploads, and audit.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS idempotency_records (
  tenant_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('processing', 'completed', 'failed')),
  response_status INTEGER,
  response_json TEXT CHECK (response_json IS NULL OR json_valid(response_json)),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, scope, idempotency_key)
) STRICT;

CREATE INDEX IF NOT EXISTS idempotency_records_expires_at_idx
  ON idempotency_records(expires_at);

CREATE TABLE IF NOT EXISTS outbox_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  topic TEXT NOT NULL CHECK (
    topic IN (
      'communications',
      'webhooks',
      'calendar',
      'accelevents',
      'file-scan',
      'cache-invalidation'
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

CREATE INDEX IF NOT EXISTS outbox_jobs_ready_idx
  ON outbox_jobs(state, available_at);
CREATE INDEX IF NOT EXISTS outbox_jobs_tenant_idx
  ON outbox_jobs(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS delivery_attempts (
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

CREATE INDEX IF NOT EXISTS delivery_attempts_job_idx
  ON delivery_attempts(outbox_job_id, attempt_number DESC);

CREATE TABLE IF NOT EXISTS integration_publish_receipts (
  tenant_id TEXT NOT NULL,
  integration TEXT NOT NULL,
  operation_key TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  external_id TEXT,
  result_digest TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('published', 'failed')),
  failure_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, integration, operation_key)
) STRICT;

CREATE INDEX IF NOT EXISTS integration_publish_receipts_revision_idx
  ON integration_publish_receipts(tenant_id, integration, source_revision);

CREATE TABLE IF NOT EXISTS private_uploads (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  checksum_sha256 TEXT NOT NULL,
  state TEXT NOT NULL CHECK (
    state IN ('pending', 'uploaded', 'scanning', 'clean', 'quarantined', 'deleted')
  ),
  scan_result_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS private_uploads_tenant_idx
  ON private_uploads(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'api-key', 'system')),
  actor_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  trace_id TEXT,
  details_json TEXT CHECK (details_json IS NULL OR json_valid(details_json)),
  occurred_at TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS audit_events_tenant_time_idx
  ON audit_events(tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_resource_idx
  ON audit_events(tenant_id, resource_type, resource_id, occurred_at DESC);
