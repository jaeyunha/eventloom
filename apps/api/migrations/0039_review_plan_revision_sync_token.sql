PRAGMA foreign_keys = ON;

ALTER TABLE review_plans
  ADD COLUMN revision_sync_token TEXT;
