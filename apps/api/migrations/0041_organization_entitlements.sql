PRAGMA foreign_keys = ON;

CREATE TABLE organization_entitlements (
  organization_id TEXT PRIMARY KEY NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  revision INTEGER NOT NULL CHECK (revision > 0),
  state TEXT NOT NULL CHECK (state IN ('active', 'restricted')),
  capabilities_json TEXT NOT NULL CHECK (
    json_valid(capabilities_json) AND json_type(capabilities_json) = 'array'
  ),
  active_event_limit INTEGER CHECK (active_event_limit IS NULL OR active_event_limit >= 0),
  organizer_seat_limit INTEGER CHECK (organizer_seat_limit IS NULL OR organizer_seat_limit >= 0),
  not_before TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(organization_id) ON DELETE CASCADE
);

CREATE INDEX idx_organization_entitlements_state
  ON organization_entitlements (state, expires_at);

INSERT INTO organization_entitlements (
  organization_id, schema_version, revision, state, capabilities_json,
  active_event_limit, organizer_seat_limit, not_before, expires_at,
  created_at, updated_at
)
SELECT
  organization_id, 1, 1, 'active', '["events.create"]',
  NULL, NULL, created_at, NULL, created_at, updated_at
FROM organizations
WHERE NOT EXISTS (
  SELECT 1
  FROM organization_entitlements existing
  WHERE existing.organization_id = organizations.organization_id
);
