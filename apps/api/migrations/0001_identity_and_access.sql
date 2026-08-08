-- D1 stores identity, authorization, and token state only. Program business records remain in Airtable.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS auth_users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  name TEXT,
  image_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token_digest TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS auth_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  access_token_ciphertext TEXT,
  refresh_token_ciphertext TEXT,
  access_token_expires_at TEXT,
  refresh_token_expires_at TEXT,
  scope TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (provider_id, provider_account_id)
) STRICT;

CREATE INDEX IF NOT EXISTS auth_accounts_user_id_idx ON auth_accounts(user_id);

CREATE TABLE IF NOT EXISTS auth_verifications (
  id TEXT PRIMARY KEY NOT NULL,
  identifier TEXT NOT NULL COLLATE NOCASE,
  token_digest TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS auth_verifications_identifier_idx ON auth_verifications(identifier);
CREATE INDEX IF NOT EXISTS auth_verifications_expires_at_idx ON auth_verifications(expires_at);

CREATE TABLE IF NOT EXISTS organization_memberships (
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'reviewer')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, user_id)
) STRICT;

CREATE INDEX IF NOT EXISTS organization_memberships_user_id_idx
  ON organization_memberships(user_id);

CREATE TABLE IF NOT EXISTS speaker_grants (
  organization_id TEXT NOT NULL,
  speaker_profile_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY (organization_id, speaker_profile_id, user_id)
) STRICT;

CREATE INDEX IF NOT EXISTS speaker_grants_user_id_idx ON speaker_grants(user_id);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  label TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_digest TEXT NOT NULL UNIQUE,
  scopes_json TEXT NOT NULL CHECK (json_valid(scopes_json)),
  expires_at TEXT,
  revoked_at TEXT,
  last_used_at TEXT,
  created_by_user_id TEXT REFERENCES auth_users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS api_keys_organization_id_idx ON api_keys(organization_id);
CREATE INDEX IF NOT EXISTS api_keys_key_prefix_idx ON api_keys(key_prefix);
