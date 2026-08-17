PRAGMA foreign_keys = ON;

CREATE TABLE organization_entitlements (
  organization_id TEXT PRIMARY KEY NOT NULL,
  schema_version INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active', 'restricted')),
  capabilities_json TEXT NOT NULL CHECK (json_valid(capabilities_json)),
  active_event_limit INTEGER CHECK (active_event_limit IS NULL OR active_event_limit >= 0),
  not_before TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(organization_id) ON DELETE CASCADE
);

CREATE INDEX idx_organization_entitlements_state
  ON organization_entitlements (state, expires_at);
