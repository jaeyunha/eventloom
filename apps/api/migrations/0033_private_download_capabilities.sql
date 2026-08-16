PRAGMA foreign_keys = ON;

CREATE TABLE private_download_capabilities (
  id TEXT PRIMARY KEY NOT NULL,
  asset_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  file_name TEXT NOT NULL,
  token_digest TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX private_download_capabilities_asset_idx
  ON private_download_capabilities (tenant_id, asset_id, created_at DESC);

CREATE INDEX private_download_capabilities_expiry_idx
  ON private_download_capabilities (expires_at);
