PRAGMA foreign_keys = ON;

ALTER TABLE speaker_tasks
  ADD COLUMN replacement_baseline_asset_id TEXT;

CREATE INDEX speaker_tasks_replacement_baseline_idx
  ON speaker_tasks (
    organization_id,
    event_id,
    replacement_baseline_asset_id
  )
  WHERE replacement_baseline_asset_id IS NOT NULL;
