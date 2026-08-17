PRAGMA foreign_keys = ON;

ALTER TABLE private_download_capabilities ADD COLUMN event_id TEXT;
ALTER TABLE private_download_capabilities ADD COLUMN participant_id TEXT;
ALTER TABLE private_download_capabilities ADD COLUMN requester_account_id TEXT;
ALTER TABLE private_download_capabilities ADD COLUMN requester_kind TEXT
  CHECK (requester_kind IS NULL OR requester_kind IN ('speaker', 'organizer'));
ALTER TABLE private_download_capabilities ADD COLUMN asset_version INTEGER
  CHECK (asset_version IS NULL OR asset_version > 0);
ALTER TABLE private_download_capabilities ADD COLUMN capability_id TEXT;
ALTER TABLE private_download_capabilities ADD COLUMN consumption_claim_id TEXT;

CREATE UNIQUE INDEX private_download_capabilities_claim_uidx
  ON private_download_capabilities (consumption_claim_id)
  WHERE consumption_claim_id IS NOT NULL;
