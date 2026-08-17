CREATE TRIGGER IF NOT EXISTS trg_review_plan_lineage_repair_insert
AFTER INSERT ON review_plans
WHEN NEW.predecessor_plan_id IS NULL
 AND EXISTS (
   SELECT 1
   FROM review_plans AS possible_ancestor
   WHERE possible_ancestor.organization_id = NEW.organization_id
     AND possible_ancestor.event_id = NEW.event_id
     AND possible_ancestor.id <> NEW.id
     AND substr(NEW.id, 1, length(possible_ancestor.id) + 10)
       = possible_ancestor.id || '-revision-'
 )
BEGIN
  INSERT OR IGNORE INTO review_plan_lineage_repairs_required
    (organization_id, event_id, plan_id, round_id, reason)
  VALUES (
    NEW.organization_id,
    NEW.event_id,
    NEW.id,
    '',
    'missing_predecessor_plan'
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_review_round_lineage_repair_insert
AFTER INSERT ON review_rounds
WHEN NEW.predecessor_round_id IS NULL
 AND (
   EXISTS (
     SELECT 1
     FROM review_plan_lineage_repairs_required AS plan_repair
     WHERE plan_repair.organization_id = NEW.organization_id
       AND plan_repair.event_id = NEW.event_id
       AND plan_repair.plan_id = NEW.plan_id
       AND plan_repair.round_id = ''
   )
   OR EXISTS (
     SELECT 1
     FROM review_plans AS child_plan
     WHERE child_plan.organization_id = NEW.organization_id
       AND child_plan.event_id = NEW.event_id
       AND child_plan.id = NEW.plan_id
       AND child_plan.predecessor_plan_id IS NOT NULL
   )
 )
BEGIN
  INSERT OR IGNORE INTO review_plan_lineage_repairs_required
    (organization_id, event_id, plan_id, round_id, reason)
  VALUES (
    NEW.organization_id,
    NEW.event_id,
    NEW.plan_id,
    NEW.id,
    'missing_predecessor_round'
  );
END;

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
