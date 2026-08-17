PRAGMA foreign_keys = ON;

ALTER TABLE speaker_assets ADD COLUMN creation_idempotency_key TEXT;
ALTER TABLE speaker_assets ADD COLUMN creation_request_digest TEXT;

CREATE UNIQUE INDEX speaker_assets_creation_idempotency_uidx
  ON speaker_assets (organization_id, event_id, creation_idempotency_key)
  WHERE creation_idempotency_key IS NOT NULL;
