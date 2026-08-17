CREATE TABLE IF NOT EXISTS review_plan_lineage_repairs_required (
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  round_id TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL,
  detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, event_id, plan_id, round_id)
);

INSERT OR IGNORE INTO review_plan_lineage_repairs_required
  (organization_id, event_id, plan_id, round_id, reason)
SELECT organization_id, event_id, id, '', 'missing_predecessor_plan'
FROM review_plans
WHERE predecessor_plan_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM review_plans AS possible_ancestor
    WHERE possible_ancestor.organization_id = review_plans.organization_id
      AND possible_ancestor.event_id = review_plans.event_id
      AND possible_ancestor.id <> review_plans.id
      AND substr(review_plans.id, 1, length(possible_ancestor.id) + 10)
        = possible_ancestor.id || '-revision-'
  );

INSERT OR IGNORE INTO review_plan_lineage_repairs_required
  (organization_id, event_id, plan_id, round_id, reason)
SELECT
  child_round.organization_id,
  child_round.event_id,
  child_round.plan_id,
  child_round.id,
  'missing_predecessor_round'
FROM review_rounds AS child_round
WHERE child_round.predecessor_round_id IS NULL
  AND (
    EXISTS (
      SELECT 1
      FROM review_plan_lineage_repairs_required AS plan_repair
      WHERE plan_repair.organization_id = child_round.organization_id
        AND plan_repair.event_id = child_round.event_id
        AND plan_repair.plan_id = child_round.plan_id
        AND plan_repair.round_id = ''
    )
    OR EXISTS (
      SELECT 1
      FROM review_plans AS child_plan
      WHERE child_plan.organization_id = child_round.organization_id
        AND child_plan.event_id = child_round.event_id
        AND child_plan.id = child_round.plan_id
        AND child_plan.predecessor_plan_id IS NOT NULL
    )
  );
