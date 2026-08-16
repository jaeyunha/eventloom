PRAGMA foreign_keys = ON;
ALTER TABLE api_keys ADD COLUMN event_id TEXT;

CREATE INDEX IF NOT EXISTS api_keys_organization_event_idx
  ON api_keys(organization_id, event_id);

CREATE TABLE IF NOT EXISTS integration_credentials (
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('opensend')),
  encrypted_secret TEXT NOT NULL,
  credential_last_four TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, event_id, provider)
) STRICT;

CREATE TABLE IF NOT EXISTS integration_delivery_status (
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, event_id)
) STRICT;
