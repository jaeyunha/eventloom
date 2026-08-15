-- Expand/backfill/cut over speaker admission to canonical event-scoped D1 aggregates.
-- Legacy speaker_roster and portal_context tables are intentionally retained for a later
-- contract migration, but new D1 speaker code does not read or write them as authority.
PRAGMA foreign_keys = ON;

ALTER TABLE speaker_profiles ADD COLUMN admitted_by_account_id TEXT;
ALTER TABLE speaker_profiles ADD COLUMN admitted_at TEXT;
ALTER TABLE program_speaker_projection_entries ADD COLUMN avatar_asset_id TEXT;
ALTER TABLE program_speaker_projection_entries ADD COLUMN avatar_object_key TEXT;
ALTER TABLE program_speaker_projection_entries ADD COLUMN avatar_content_type TEXT;
ALTER TABLE program_speaker_projection_entries ADD COLUMN avatar_size_bytes INTEGER;

CREATE TABLE speaker_import_previews (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  source_digest TEXT NOT NULL,
  rows_json TEXT NOT NULL CHECK (json_valid(rows_json) AND json_type(rows_json) = 'array'),
  roster_revision INTEGER NOT NULL CHECK (roster_revision >= 0),
  created_at TEXT NOT NULL,
  committed_at TEXT,
  FOREIGN KEY (organization_id, event_id) REFERENCES events(organization_id, id) ON DELETE CASCADE,
  UNIQUE (organization_id, event_id, id)
) STRICT;
CREATE INDEX speaker_import_previews_scope_idx
  ON speaker_import_previews(organization_id, event_id, created_at DESC);

CREATE TABLE speaker_aggregate_operations (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('create', 'import', 'update', 'revoke')),
  idempotency_key TEXT NOT NULL,
  expected_version INTEGER CHECK (expected_version IS NULL OR expected_version > 0),
  source_digest TEXT NOT NULL,
  preview_id TEXT,
  participant_ids_json TEXT NOT NULL CHECK (
    json_valid(participant_ids_json) AND json_type(participant_ids_json) = 'array'
  ),
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id, event_id) REFERENCES events(organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, event_id, preview_id)
    REFERENCES speaker_import_previews(organization_id, event_id, id) ON DELETE RESTRICT,
  UNIQUE (organization_id, event_id, operation_type, idempotency_key)
) STRICT;
CREATE INDEX speaker_aggregate_operations_scope_idx
  ON speaker_aggregate_operations(organization_id, event_id, created_at DESC);

CREATE TRIGGER speaker_aggregate_operations_update_cas
BEFORE INSERT ON speaker_aggregate_operations
WHEN NEW.operation_type IN ('update', 'revoke')
 AND NOT EXISTS (
   SELECT 1 FROM speaker_profiles sp
    WHERE sp.organization_id = NEW.organization_id
      AND sp.event_id = NEW.event_id
      AND sp.participant_id = json_extract(NEW.participant_ids_json, '$[0]')
      AND sp.version = NEW.expected_version
 )
BEGIN
  SELECT RAISE(ABORT, 'speaker profile version conflict');
END;

-- Preserve admitted legacy speakers without making speaker_roster an ongoing authority.
INSERT OR IGNORE INTO speaker_profiles (
  id, organization_id, event_id, participant_id, display_name, email, job_title, company,
  status, biography, social_links_json, travel_required, arrival_at, departure_at,
  accommodation, dietary_requirements, accessibility_needs, travel_notes, headshot_asset_id,
  source_type, source_id, version, created_at, updated_at, admitted_by_account_id, admitted_at
)
SELECT
  'profile:' || sr.event_id || ':' || sr.participant_id,
  sr.organization_id, sr.event_id, sr.participant_id, sr.display_name, sr.email,
  sr.job_title, sr.company, COALESCE(sr.organizer_status, sr.workflow_status, sr.status),
  sr.biography, sr.social_links_json,
  COALESCE(json_extract(sr.travel_logistics_json, '$.travelRequired'), 0),
  json_extract(sr.travel_logistics_json, '$.arrivalAt'),
  json_extract(sr.travel_logistics_json, '$.departureAt'),
  COALESCE(json_extract(sr.travel_logistics_json, '$.accommodation'), ''),
  COALESCE(json_extract(sr.travel_logistics_json, '$.dietaryRequirements'), ''),
  COALESCE(json_extract(sr.travel_logistics_json, '$.accessibilityNeeds'), ''),
  COALESCE(json_extract(sr.travel_logistics_json, '$.travelNotes'), ''),
  sr.headshot_asset_id, sr.source_type, sr.source_id, sr.version, sr.created_at, sr.updated_at,
  sr.author_account_id, sr.created_at
FROM speaker_roster sr;

-- A verified account with the canonical profile email receives the sole participant grant.
-- Triggers keep participant identity and authorization in the same transaction as profile writes.
CREATE TRIGGER speaker_profiles_provision_grant_insert
AFTER INSERT ON speaker_profiles
WHEN NEW.email IS NOT NULL AND length(trim(NEW.email)) > 0
BEGIN
  UPDATE participants
     SET first_name = CASE
           WHEN instr(trim(NEW.display_name), ' ') = 0 THEN trim(NEW.display_name)
           ELSE substr(trim(NEW.display_name), 1, instr(trim(NEW.display_name), ' ') - 1)
         END,
         last_name = CASE
           WHEN instr(trim(NEW.display_name), ' ') = 0 THEN ''
           ELSE ltrim(substr(trim(NEW.display_name), instr(trim(NEW.display_name), ' ') + 1))
         END,
         display_name = NEW.display_name,
         email = NEW.email,
         normalized_email = lower(trim(NEW.email)),
         claimed_user_id = (
           SELECT id FROM auth_users
            WHERE email = NEW.email COLLATE NOCASE AND email_verified = 1 LIMIT 1
         ),
         updated_at = NEW.updated_at
   WHERE organization_id = NEW.organization_id
     AND event_id = NEW.event_id
     AND id = NEW.participant_id;

  INSERT OR IGNORE INTO participant_grants (
    organization_id, event_id, participant_id, user_id, permissions_json,
    created_at, updated_at, revoked_at
  )
  SELECT NEW.organization_id, NEW.event_id, NEW.participant_id, au.id,
         '["edit_own_profile","manage_own_assets","view_own_tasks","update_own_tasks"]',
         NEW.updated_at, NEW.updated_at, NULL
    FROM auth_users au
   WHERE au.email = NEW.email COLLATE NOCASE
     AND au.email_verified = 1
     AND NEW.status <> 'revoked';
END;

CREATE TRIGGER speaker_profiles_provision_grant_update
AFTER UPDATE OF display_name, email, updated_at ON speaker_profiles
BEGIN
  UPDATE participants
     SET first_name = CASE
           WHEN instr(trim(NEW.display_name), ' ') = 0 THEN trim(NEW.display_name)
           ELSE substr(trim(NEW.display_name), 1, instr(trim(NEW.display_name), ' ') - 1)
         END,
         last_name = CASE
           WHEN instr(trim(NEW.display_name), ' ') = 0 THEN ''
           ELSE ltrim(substr(trim(NEW.display_name), instr(trim(NEW.display_name), ' ') + 1))
         END,
         display_name = NEW.display_name,
         email = COALESCE(NEW.email, ''),
         normalized_email = lower(trim(COALESCE(NEW.email, ''))),
         claimed_user_id = (
           SELECT id FROM auth_users
            WHERE email = NEW.email COLLATE NOCASE AND email_verified = 1 LIMIT 1
         ),
         version = version + 1,
         updated_at = NEW.updated_at
   WHERE organization_id = NEW.organization_id
     AND event_id = NEW.event_id
     AND id = NEW.participant_id;

  UPDATE participant_grants
     SET revoked_at = NEW.updated_at, updated_at = NEW.updated_at
   WHERE organization_id = NEW.organization_id
     AND event_id = NEW.event_id
     AND participant_id = NEW.participant_id
     AND revoked_at IS NULL
     AND (NEW.status = 'revoked' OR user_id NOT IN (
       SELECT id FROM auth_users
        WHERE email = NEW.email COLLATE NOCASE AND email_verified = 1
     ));

  INSERT INTO participant_grants (
    organization_id, event_id, participant_id, user_id, permissions_json,
    created_at, updated_at, revoked_at
  )
  SELECT NEW.organization_id, NEW.event_id, NEW.participant_id, au.id,
         '["edit_own_profile","manage_own_assets","view_own_tasks","update_own_tasks"]',
         NEW.updated_at, NEW.updated_at, NULL
    FROM auth_users au
   WHERE NEW.email IS NOT NULL
     AND au.email = NEW.email COLLATE NOCASE
     AND au.email_verified = 1
     AND NEW.status <> 'revoked'
  ON CONFLICT(organization_id, event_id, participant_id, user_id) DO UPDATE SET
    permissions_json = excluded.permissions_json,
    updated_at = excluded.updated_at,
    revoked_at = NULL;
END;

CREATE TRIGGER auth_users_provision_speaker_grant_insert
AFTER INSERT ON auth_users
WHEN NEW.email_verified = 1
BEGIN
  UPDATE participants
     SET claimed_user_id = NEW.id,
         updated_at = NEW.updated_at
   WHERE normalized_email = lower(trim(NEW.email))
     AND (claimed_user_id IS NULL OR claimed_user_id = NEW.id)
     AND EXISTS (
       SELECT 1
         FROM speaker_profiles sp
        WHERE sp.organization_id = participants.organization_id
          AND sp.event_id = participants.event_id
          AND sp.participant_id = participants.id
          AND lower(trim(COALESCE(sp.email, ''))) = lower(trim(NEW.email))
          AND sp.status <> 'revoked'
     );

  INSERT INTO participant_grants (
    organization_id, event_id, participant_id, user_id, permissions_json,
    created_at, updated_at, revoked_at
  )
  SELECT sp.organization_id, sp.event_id, sp.participant_id, NEW.id,
         '["edit_own_profile","manage_own_assets","view_own_tasks","update_own_tasks"]',
         NEW.updated_at, NEW.updated_at, NULL
    FROM speaker_profiles sp
   WHERE lower(trim(COALESCE(sp.email, ''))) = lower(trim(NEW.email))
     AND sp.status <> 'revoked'
  ON CONFLICT(organization_id, event_id, participant_id, user_id) DO UPDATE SET
    permissions_json = excluded.permissions_json,
    updated_at = excluded.updated_at,
    revoked_at = NULL;
END;

CREATE TRIGGER auth_users_reconcile_speaker_grant_update
AFTER UPDATE OF email, email_verified ON auth_users
BEGIN
  UPDATE participant_grants
     SET revoked_at = NEW.updated_at,
         updated_at = NEW.updated_at
   WHERE user_id = NEW.id
     AND revoked_at IS NULL
     AND (
       NEW.email_verified <> 1
       OR NOT EXISTS (
         SELECT 1
           FROM speaker_profiles sp
          WHERE sp.organization_id = participant_grants.organization_id
            AND sp.event_id = participant_grants.event_id
            AND sp.participant_id = participant_grants.participant_id
            AND lower(trim(COALESCE(sp.email, ''))) = lower(trim(NEW.email))
            AND sp.status <> 'revoked'
       )
     );

  UPDATE participants
     SET claimed_user_id = NULL,
         updated_at = NEW.updated_at
   WHERE claimed_user_id = NEW.id
     AND (
       NEW.email_verified <> 1
       OR normalized_email <> lower(trim(NEW.email))
       OR NOT EXISTS (
         SELECT 1
           FROM speaker_profiles sp
          WHERE sp.organization_id = participants.organization_id
            AND sp.event_id = participants.event_id
            AND sp.participant_id = participants.id
            AND lower(trim(COALESCE(sp.email, ''))) = lower(trim(NEW.email))
            AND sp.status <> 'revoked'
       )
     );

  UPDATE participants
     SET claimed_user_id = NEW.id,
         updated_at = NEW.updated_at
   WHERE NEW.email_verified = 1
     AND normalized_email = lower(trim(NEW.email))
     AND (claimed_user_id IS NULL OR claimed_user_id = NEW.id)
     AND EXISTS (
       SELECT 1
         FROM speaker_profiles sp
        WHERE sp.organization_id = participants.organization_id
          AND sp.event_id = participants.event_id
          AND sp.participant_id = participants.id
          AND lower(trim(COALESCE(sp.email, ''))) = lower(trim(NEW.email))
          AND sp.status <> 'revoked'
     );

  INSERT INTO participant_grants (
    organization_id, event_id, participant_id, user_id, permissions_json,
    created_at, updated_at, revoked_at
  )
  SELECT sp.organization_id, sp.event_id, sp.participant_id, NEW.id,
         '["edit_own_profile","manage_own_assets","view_own_tasks","update_own_tasks"]',
         NEW.updated_at, NEW.updated_at, NULL
    FROM speaker_profiles sp
   WHERE NEW.email_verified = 1
     AND lower(trim(COALESCE(sp.email, ''))) = lower(trim(NEW.email))
     AND sp.status <> 'revoked'
  ON CONFLICT(organization_id, event_id, participant_id, user_id) DO UPDATE SET
    permissions_json = excluded.permissions_json,
    updated_at = excluded.updated_at,
    revoked_at = NULL;
END;

-- Backfill grants only where the canonical profile-to-verified-account relationship is exact.
INSERT OR IGNORE INTO participant_grants (
  organization_id, event_id, participant_id, user_id, permissions_json,
  created_at, updated_at, revoked_at
)
SELECT sp.organization_id, sp.event_id, sp.participant_id, au.id,
       '["edit_own_profile","manage_own_assets","view_own_tasks","update_own_tasks"]',
       sp.updated_at, sp.updated_at, NULL
  FROM speaker_profiles sp
  JOIN auth_users au ON au.email = sp.email COLLATE NOCASE AND au.email_verified = 1
 WHERE sp.email IS NOT NULL
   AND length(trim(sp.email)) > 0
   AND sp.status <> 'revoked';
