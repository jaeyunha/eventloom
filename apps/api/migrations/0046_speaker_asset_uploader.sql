PRAGMA foreign_keys = ON;

ALTER TABLE speaker_assets ADD COLUMN uploader_account_id TEXT
  REFERENCES auth_users(id) ON DELETE SET NULL;
ALTER TABLE speaker_assets ADD COLUMN uploader_label TEXT;

CREATE INDEX IF NOT EXISTS speaker_assets_uploader_idx
  ON speaker_assets (organization_id, event_id, uploader_account_id, created_at);
