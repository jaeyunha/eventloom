PRAGMA foreign_keys = ON;

CREATE TRIGGER IF NOT EXISTS trg_review_plan_lineage_repair_candidate
AFTER INSERT ON review_plans
WHEN NEW.predecessor_plan_id IS NULL
  AND length(NEW.id) > length(rtrim(NEW.id, '0123456789'))
  AND substr(rtrim(NEW.id, '0123456789'), -10) = '-revision-'
  AND EXISTS (
    SELECT 1
    FROM review_plans AS possible_ancestor
    WHERE possible_ancestor.organization_id = NEW.organization_id
      AND possible_ancestor.event_id = NEW.event_id
      AND possible_ancestor.id <> NEW.id
      AND substr(
        possible_ancestor.id,
        1,
        length(rtrim(NEW.id, '0123456789')) - 10
      ) = substr(
        NEW.id,
        1,
        length(rtrim(NEW.id, '0123456789')) - 10
      )
      AND (
        length(possible_ancestor.id) = length(rtrim(NEW.id, '0123456789')) - 10
        OR (
          length(NEW.id) = 100
          AND length(possible_ancestor.id) > length(rtrim(NEW.id, '0123456789')) - 10
        )
      )
  )
BEGIN
  INSERT OR IGNORE INTO review_plan_lineage_repairs_required (
    organization_id, event_id, plan_id, round_id, reason
  )
  VALUES (
    NEW.organization_id,
    NEW.event_id,
    NEW.id,
    '',
    'missing_predecessor_plan'
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_review_round_lineage_repair_candidate
AFTER INSERT ON review_rounds
WHEN NEW.predecessor_round_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM review_plans AS child_plan
    WHERE child_plan.organization_id = NEW.organization_id
      AND child_plan.event_id = NEW.event_id
      AND child_plan.id = NEW.plan_id
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
  )
BEGIN
  INSERT OR IGNORE INTO review_plan_lineage_repairs_required (
    organization_id, event_id, plan_id, round_id, reason
  )
  VALUES (
    NEW.organization_id,
    NEW.event_id,
    NEW.plan_id,
    NEW.id,
    'missing_predecessor_round'
  );
END;
