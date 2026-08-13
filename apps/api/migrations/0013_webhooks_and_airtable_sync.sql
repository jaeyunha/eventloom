PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
  event_id TEXT,
  endpoint_url TEXT NOT NULL,
  events_json TEXT NOT NULL CHECK (
    json_valid(events_json) AND json_type(events_json) = 'array'
  ),
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  signing_secret_ciphertext TEXT NOT NULL,
  signing_secret_last_four TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id, event_id)
    REFERENCES events(organization_id, id) ON DELETE CASCADE,
  UNIQUE (organization_id, id)
) STRICT;

CREATE INDEX IF NOT EXISTS webhook_subscriptions_scope_idx
  ON webhook_subscriptions(organization_id, event_id, active);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  event_data_json TEXT NOT NULL CHECK (json_valid(event_data_json)),
  resource_type TEXT,
  resource_id TEXT,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'delivering', 'retrying', 'succeeded', 'failed', 'dead_letter')
  ),
  attempt_count INTEGER NOT NULL CHECK (attempt_count >= 0),
  next_attempt_at TEXT,
  last_response_status INTEGER,
  last_error TEXT,
  last_response_body TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  lease_owner TEXT,
  lease_token TEXT,
  lease_expires_at TEXT,
  FOREIGN KEY (organization_id, subscription_id)
    REFERENCES webhook_subscriptions(organization_id, id) ON DELETE CASCADE,
  UNIQUE (subscription_id, event_id),
  CHECK (
    (resource_type IS NULL AND resource_id IS NULL)
    OR (resource_type IS NOT NULL AND resource_id IS NOT NULL)
  ),
  CHECK (
    (
      status = 'delivering'
      AND lease_owner IS NOT NULL
      AND lease_token IS NOT NULL
      AND lease_expires_at IS NOT NULL
    )
    OR (
      status <> 'delivering'
      AND lease_owner IS NULL
      AND lease_token IS NULL
      AND lease_expires_at IS NULL
    )
  )
) STRICT;

CREATE INDEX IF NOT EXISTS webhook_deliveries_due_idx
  ON webhook_deliveries(status, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS webhook_deliveries_organization_time_idx
  ON webhook_deliveries(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS webhook_delivery_failures (
  delivery_id TEXT NOT NULL REFERENCES webhook_deliveries(id) ON DELETE CASCADE,
  attempt INTEGER NOT NULL CHECK (attempt > 0),
  attempted_at TEXT NOT NULL,
  response_status INTEGER,
  error TEXT NOT NULL,
  response_body TEXT,
  retryable INTEGER NOT NULL CHECK (retryable IN (0, 1)),
  PRIMARY KEY (delivery_id, attempt)
) STRICT;

CREATE INDEX IF NOT EXISTS webhook_delivery_failures_order_idx
  ON webhook_delivery_failures(delivery_id, attempt DESC);

CREATE TABLE IF NOT EXISTS airtable_connections (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (
    status IN (
      'disconnected',
      'authorizing',
      'connected',
      'refreshing',
      'paused',
      'reauthorization_required',
      'disconnecting'
    )
  ),
  auth_mode TEXT NOT NULL CHECK (auth_mode IN ('oauth', 'pat')),
  credential_reference TEXT,
  airtable_user_id TEXT,
  airtable_account_id TEXT,
  base_id TEXT,
  base_name TEXT,
  granted_scopes_json TEXT NOT NULL CHECK (
    json_valid(granted_scopes_json) AND json_type(granted_scopes_json) = 'array'
  ),
  access_token_expires_at TEXT,
  refresh_token_expires_at TEXT,
  connection_version INTEGER NOT NULL CHECK (connection_version > 0),
  refresh_owner TEXT,
  refresh_token TEXT,
  refresh_lease_expires_at TEXT,
  last_schema_check_at TEXT,
  last_success_at TEXT,
  last_error_code TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  disconnected_at TEXT,
  UNIQUE (organization_id, id),
  CHECK (
    (
      refresh_owner IS NULL
      AND refresh_token IS NULL
      AND refresh_lease_expires_at IS NULL
    )
    OR (
      refresh_owner IS NOT NULL
      AND refresh_token IS NOT NULL
      AND refresh_lease_expires_at IS NOT NULL
    )
  )
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS airtable_connections_active_organization_unique
  ON airtable_connections(organization_id)
  WHERE status <> 'disconnected';
CREATE INDEX IF NOT EXISTS airtable_connections_organization_status_idx
  ON airtable_connections(organization_id, status);
CREATE INDEX IF NOT EXISTS airtable_connections_refresh_lease_idx
  ON airtable_connections(status, refresh_lease_expires_at);

CREATE TABLE IF NOT EXISTS airtable_oauth_attempts (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
  initiating_user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL,
  state_hash TEXT NOT NULL UNIQUE,
  pkce_verifier_ciphertext TEXT NOT NULL,
  return_path TEXT NOT NULL,
  callback_code_hash TEXT,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'exchanging', 'consumed', 'failed', 'expired')
  ),
  exchange_owner TEXT,
  exchange_token TEXT,
  exchange_lease_expires_at TEXT,
  attempt_version INTEGER NOT NULL CHECK (attempt_version > 0),
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  result_redirect TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id, connection_id)
    REFERENCES airtable_connections(organization_id, id) ON DELETE CASCADE,
  CHECK (
    (
      status = 'exchanging'
      AND exchange_owner IS NOT NULL
      AND exchange_token IS NOT NULL
      AND exchange_lease_expires_at IS NOT NULL
    )
    OR (
      status <> 'exchanging'
      AND exchange_owner IS NULL
      AND exchange_token IS NULL
      AND exchange_lease_expires_at IS NULL
    )
  ),
  CHECK (
    (
      status = 'consumed'
      AND consumed_at IS NOT NULL
      AND result_redirect IS NOT NULL
    )
    OR (
      status <> 'consumed'
      AND consumed_at IS NULL
      AND result_redirect IS NULL
    )
  )
) STRICT;

CREATE INDEX IF NOT EXISTS airtable_oauth_attempts_status_expiry_idx
  ON airtable_oauth_attempts(status, expires_at);
CREATE INDEX IF NOT EXISTS airtable_oauth_attempts_connection_idx
  ON airtable_oauth_attempts(connection_id, created_at DESC);

CREATE TABLE IF NOT EXISTS airtable_projection_configs (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  table_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  preset TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  field_mapping_json TEXT NOT NULL CHECK (
    json_valid(field_mapping_json) AND json_type(field_mapping_json) = 'object'
  ),
  inbound_fields_json TEXT NOT NULL CHECK (
    json_valid(inbound_fields_json) AND json_type(inbound_fields_json) = 'array'
  ),
  conflict_policy TEXT NOT NULL CHECK (
    conflict_policy IN ('manual', 'd1_wins', 'airtable_wins')
  ),
  projection_version INTEGER NOT NULL CHECK (projection_version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id, connection_id)
    REFERENCES airtable_connections(organization_id, id) ON DELETE CASCADE,
  UNIQUE (organization_id, id),
  UNIQUE (connection_id, entity_type)
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS airtable_projection_configs_enabled_table_unique
  ON airtable_projection_configs(connection_id, table_id)
  WHERE enabled = 1;
CREATE INDEX IF NOT EXISTS airtable_projection_configs_enabled_entities_idx
  ON airtable_projection_configs(connection_id, enabled, entity_type);

CREATE TABLE IF NOT EXISTS airtable_record_mappings (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  application_id TEXT NOT NULL,
  table_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  last_exported_version INTEGER CHECK (
    last_exported_version IS NULL OR last_exported_version > 0
  ),
  last_exported_hash TEXT,
  last_observed_hash TEXT,
  last_exported_at TEXT,
  mapping_version INTEGER NOT NULL CHECK (mapping_version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id, connection_id)
    REFERENCES airtable_connections(organization_id, id) ON DELETE CASCADE,
  UNIQUE (organization_id, id),
  UNIQUE (connection_id, entity_type, application_id),
  UNIQUE (connection_id, table_id, record_id)
) STRICT;

CREATE INDEX IF NOT EXISTS airtable_record_mappings_application_idx
  ON airtable_record_mappings(connection_id, entity_type, application_id);
CREATE INDEX IF NOT EXISTS airtable_record_mappings_record_idx
  ON airtable_record_mappings(connection_id, table_id, record_id);

CREATE TABLE IF NOT EXISTS airtable_sync_jobs (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  connection_version INTEGER NOT NULL CHECK (connection_version > 0),
  entity_type TEXT NOT NULL,
  application_id TEXT NOT NULL,
  source_version INTEGER NOT NULL CHECK (source_version > 0),
  operation TEXT NOT NULL CHECK (
    operation IN ('upsert', 'archive', 'delete', 'reconcile')
  ),
  state TEXT NOT NULL CHECK (
    state IN ('pending', 'claimed', 'succeeded', 'retry', 'dead', 'cancelled')
  ),
  deduplication_key TEXT NOT NULL UNIQUE,
  attempt_count INTEGER NOT NULL CHECK (attempt_count >= 0),
  available_at TEXT NOT NULL,
  claim_owner TEXT,
  claim_token TEXT,
  lease_expires_at TEXT,
  payload_json TEXT NOT NULL CHECK (
    json_valid(payload_json) AND json_type(payload_json) = 'object'
  ),
  payload_hash TEXT NOT NULL,
  last_error_code TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (organization_id, connection_id)
    REFERENCES airtable_connections(organization_id, id) ON DELETE CASCADE,
  CHECK (
    (
      state = 'claimed'
      AND claim_owner IS NOT NULL
      AND claim_token IS NOT NULL
      AND lease_expires_at IS NOT NULL
    )
    OR (
      state <> 'claimed'
      AND claim_owner IS NULL
      AND claim_token IS NULL
      AND lease_expires_at IS NULL
    )
  )
) STRICT;

CREATE INDEX IF NOT EXISTS airtable_sync_jobs_claim_idx
  ON airtable_sync_jobs(state, available_at, connection_id);
CREATE INDEX IF NOT EXISTS airtable_sync_jobs_expired_lease_idx
  ON airtable_sync_jobs(state, lease_expires_at);
CREATE INDEX IF NOT EXISTS airtable_sync_jobs_entity_source_idx
  ON airtable_sync_jobs(connection_id, entity_type, application_id, source_version DESC);
CREATE INDEX IF NOT EXISTS airtable_sync_jobs_connection_state_idx
  ON airtable_sync_jobs(connection_id, state, available_at);

CREATE TABLE IF NOT EXISTS airtable_initial_export_checkpoints (
  connection_id TEXT NOT NULL REFERENCES airtable_connections(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  cursor_application_id TEXT,
  state TEXT NOT NULL CHECK (state IN ('pending', 'running', 'completed', 'failed')),
  scanned_count INTEGER NOT NULL CHECK (scanned_count >= 0),
  enqueued_count INTEGER NOT NULL CHECK (enqueued_count >= 0),
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (connection_id, entity_type)
) STRICT;

CREATE TABLE IF NOT EXISTS airtable_webhook_registrations (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  provider_webhook_id TEXT,
  mac_secret_ciphertext TEXT,
  expires_at TEXT,
  specification_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('creating', 'active', 'refreshing', 'expired', 'invalid', 'deleting', 'deleted')
  ),
  refresh_owner TEXT,
  refresh_token TEXT,
  refresh_lease_expires_at TEXT,
  registration_version INTEGER NOT NULL CHECK (registration_version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id, connection_id)
    REFERENCES airtable_connections(organization_id, id) ON DELETE CASCADE,
  UNIQUE (organization_id, connection_id, id),
  CHECK (
    (
      status = 'refreshing'
      AND refresh_owner IS NOT NULL
      AND refresh_token IS NOT NULL
      AND refresh_lease_expires_at IS NOT NULL
    )
    OR (
      status <> 'refreshing'
      AND refresh_owner IS NULL
      AND refresh_token IS NULL
      AND refresh_lease_expires_at IS NULL
    )
  )
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS airtable_webhook_registrations_provider_unique
  ON airtable_webhook_registrations(connection_id, provider_webhook_id)
  WHERE provider_webhook_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS airtable_webhook_registrations_expiry_status_idx
  ON airtable_webhook_registrations(status, expires_at);

CREATE TABLE IF NOT EXISTS airtable_webhook_notifications (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  registration_id TEXT NOT NULL,
  provider_notification_id TEXT,
  raw_body_hash TEXT NOT NULL,
  time_bucket TEXT NOT NULL,
  raw_body TEXT NOT NULL,
  content_mac TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('received', 'processed', 'rejected')),
  received_at TEXT NOT NULL,
  processed_at TEXT,
  FOREIGN KEY (organization_id, connection_id, registration_id)
    REFERENCES airtable_webhook_registrations(organization_id, connection_id, id)
    ON DELETE CASCADE
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS airtable_webhook_notifications_provider_unique
  ON airtable_webhook_notifications(registration_id, provider_notification_id)
  WHERE provider_notification_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS airtable_webhook_notifications_fallback_unique
  ON airtable_webhook_notifications(registration_id, raw_body_hash, time_bucket)
  WHERE provider_notification_id IS NULL;
CREATE INDEX IF NOT EXISTS airtable_webhook_notifications_connection_status_idx
  ON airtable_webhook_notifications(connection_id, status, received_at);

CREATE TABLE IF NOT EXISTS airtable_webhook_cursors (
  registration_id TEXT NOT NULL PRIMARY KEY
    REFERENCES airtable_webhook_registrations(id) ON DELETE CASCADE,
  next_cursor TEXT NOT NULL,
  row_version INTEGER NOT NULL CHECK (row_version > 0),
  claim_owner TEXT,
  claim_token TEXT,
  lease_expires_at TEXT,
  last_fetched_at TEXT,
  reconciliation_required INTEGER NOT NULL CHECK (reconciliation_required IN (0, 1)),
  CHECK (
    (
      claim_owner IS NULL
      AND claim_token IS NULL
      AND lease_expires_at IS NULL
    )
    OR (
      claim_owner IS NOT NULL
      AND claim_token IS NOT NULL
      AND lease_expires_at IS NOT NULL
    )
  )
) STRICT;

CREATE INDEX IF NOT EXISTS airtable_webhook_cursors_lease_idx
  ON airtable_webhook_cursors(lease_expires_at);

CREATE TABLE IF NOT EXISTS airtable_inbound_changes (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  registration_id TEXT NOT NULL,
  base_transaction_number INTEGER NOT NULL CHECK (base_transaction_number >= 0),
  table_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  field_id TEXT NOT NULL,
  entity_type TEXT,
  application_id TEXT,
  source_value_json TEXT NOT NULL CHECK (json_valid(source_value_json)),
  source_hash TEXT NOT NULL,
  state TEXT NOT NULL CHECK (
    state IN ('pending', 'claimed', 'applied', 'noop', 'conflict', 'retry', 'dead', 'cancelled')
  ),
  attempt_count INTEGER NOT NULL CHECK (attempt_count >= 0),
  available_at TEXT NOT NULL,
  claim_owner TEXT,
  claim_token TEXT,
  lease_expires_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (organization_id, connection_id, registration_id)
    REFERENCES airtable_webhook_registrations(organization_id, connection_id, id)
    ON DELETE CASCADE,
  UNIQUE (
    registration_id,
    base_transaction_number,
    table_id,
    record_id,
    field_id
  ),
  CHECK (
    (entity_type IS NULL AND application_id IS NULL)
    OR (entity_type IS NOT NULL AND application_id IS NOT NULL)
  ),
  CHECK (
    (
      state = 'claimed'
      AND claim_owner IS NOT NULL
      AND claim_token IS NOT NULL
      AND lease_expires_at IS NOT NULL
    )
    OR (
      state <> 'claimed'
      AND claim_owner IS NULL
      AND claim_token IS NULL
      AND lease_expires_at IS NULL
    )
  )
) STRICT;

CREATE INDEX IF NOT EXISTS airtable_inbound_changes_due_idx
  ON airtable_inbound_changes(state, available_at, connection_id);
CREATE INDEX IF NOT EXISTS airtable_inbound_changes_expired_lease_idx
  ON airtable_inbound_changes(state, lease_expires_at);
CREATE INDEX IF NOT EXISTS airtable_inbound_changes_record_idx
  ON airtable_inbound_changes(
    connection_id,
    table_id,
    record_id,
    base_transaction_number
  );
CREATE INDEX IF NOT EXISTS airtable_inbound_changes_entity_idx
  ON airtable_inbound_changes(connection_id, entity_type, application_id, state);

CREATE TABLE IF NOT EXISTS airtable_sync_conflicts (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  application_id TEXT NOT NULL,
  field_id TEXT NOT NULL,
  source_transaction INTEGER NOT NULL CHECK (source_transaction >= 0),
  d1_version INTEGER NOT NULL CHECK (d1_version > 0),
  d1_value_json TEXT NOT NULL CHECK (json_valid(d1_value_json)),
  airtable_value_json TEXT NOT NULL CHECK (json_valid(airtable_value_json)),
  status TEXT NOT NULL CHECK (status IN ('open', 'resolving', 'resolved')),
  resolution TEXT CHECK (
    resolution IS NULL OR resolution IN ('use_d1', 'use_airtable', 'manual')
  ),
  resolver_id TEXT,
  detected_at TEXT NOT NULL,
  resolving_at TEXT,
  resolved_at TEXT,
  resolution_command_id TEXT,
  FOREIGN KEY (organization_id, connection_id)
    REFERENCES airtable_connections(organization_id, id) ON DELETE CASCADE,
  CHECK (
    (
      status = 'open'
      AND resolution IS NULL
      AND resolver_id IS NULL
      AND resolving_at IS NULL
      AND resolved_at IS NULL
      AND resolution_command_id IS NULL
    )
    OR (
      status = 'resolving'
      AND resolution IS NOT NULL
      AND resolver_id IS NOT NULL
      AND resolving_at IS NOT NULL
      AND resolved_at IS NULL
      AND resolution_command_id IS NOT NULL
    )
    OR (
      status = 'resolved'
      AND resolution IS NOT NULL
      AND resolver_id IS NOT NULL
      AND resolving_at IS NOT NULL
      AND resolved_at IS NOT NULL
      AND resolution_command_id IS NOT NULL
    )
  )
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS airtable_sync_conflicts_unresolved_unique
  ON airtable_sync_conflicts(connection_id, entity_type, application_id, field_id)
  WHERE status IN ('open', 'resolving');
CREATE UNIQUE INDEX IF NOT EXISTS airtable_sync_conflicts_resolution_command_unique
  ON airtable_sync_conflicts(connection_id, resolution_command_id)
  WHERE resolution_command_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS airtable_sync_conflicts_status_time_idx
  ON airtable_sync_conflicts(connection_id, status, detected_at DESC);
CREATE INDEX IF NOT EXISTS airtable_sync_conflicts_entity_idx
  ON airtable_sync_conflicts(connection_id, entity_type, application_id, status);
