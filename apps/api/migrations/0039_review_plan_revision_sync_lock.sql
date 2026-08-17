PRAGMA foreign_keys = ON;

ALTER TABLE review_plans
  ADD COLUMN revision_sync_pending INTEGER NOT NULL DEFAULT 0
  CHECK (revision_sync_pending IN (0, 1));
