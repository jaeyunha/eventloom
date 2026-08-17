ALTER TABLE review_plans ADD COLUMN predecessor_plan_id TEXT;
ALTER TABLE review_rounds ADD COLUMN predecessor_round_id TEXT;

CREATE INDEX IF NOT EXISTS idx_review_plans_predecessor
  ON review_plans (organization_id, event_id, predecessor_plan_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_review_plans_predecessor
  ON review_plans (organization_id, event_id, predecessor_plan_id)
  WHERE predecessor_plan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_review_rounds_predecessor
  ON review_rounds (organization_id, event_id, plan_id, predecessor_round_id);
