DROP TRIGGER IF EXISTS trg_review_plan_lineage_repair_insert;
DROP TRIGGER IF EXISTS trg_review_round_lineage_repair_insert;
DROP TRIGGER IF EXISTS trg_review_plan_lineage_repair_candidate;
DROP TRIGGER IF EXISTS trg_review_round_lineage_repair_candidate;

DELETE FROM review_plan_lineage_repairs_required
WHERE round_id = ''
  AND reason = 'missing_predecessor_plan'
  AND NOT EXISTS (
    SELECT 1
    FROM review_plans AS child_plan
    JOIN review_plans AS possible_ancestor
      ON possible_ancestor.organization_id = child_plan.organization_id
     AND possible_ancestor.event_id = child_plan.event_id
     AND possible_ancestor.id <> child_plan.id
     AND substr(child_plan.id, 1, length(possible_ancestor.id) + 10)
       = possible_ancestor.id || '-revision-'
    WHERE child_plan.organization_id = review_plan_lineage_repairs_required.organization_id
      AND child_plan.event_id = review_plan_lineage_repairs_required.event_id
      AND child_plan.id = review_plan_lineage_repairs_required.plan_id
  );

DELETE FROM review_plan_lineage_repairs_required
WHERE round_id <> ''
  AND reason = 'missing_predecessor_round'
  AND NOT EXISTS (
    SELECT 1
    FROM review_plans AS child_plan
    WHERE child_plan.organization_id = review_plan_lineage_repairs_required.organization_id
      AND child_plan.event_id = review_plan_lineage_repairs_required.event_id
      AND child_plan.id = review_plan_lineage_repairs_required.plan_id
      AND (
        child_plan.predecessor_plan_id IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM review_plan_lineage_repairs_required AS plan_repair
          WHERE plan_repair.organization_id = child_plan.organization_id
            AND plan_repair.event_id = child_plan.event_id
            AND plan_repair.plan_id = child_plan.id
            AND plan_repair.round_id = ''
        )
      )
  );

CREATE TRIGGER trg_review_plan_lineage_repair_candidate
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
  INSERT OR IGNORE INTO review_plan_lineage_repairs_required (
    organization_id, event_id, plan_id, round_id, reason
  ) VALUES (
    NEW.organization_id, NEW.event_id, NEW.id, '', 'missing_predecessor_plan'
  );
END;

CREATE TRIGGER trg_review_round_lineage_repair_candidate
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
  INSERT OR IGNORE INTO review_plan_lineage_repairs_required (
    organization_id, event_id, plan_id, round_id, reason
  ) VALUES (
    NEW.organization_id, NEW.event_id, NEW.plan_id, NEW.id, 'missing_predecessor_round'
  );
END;
