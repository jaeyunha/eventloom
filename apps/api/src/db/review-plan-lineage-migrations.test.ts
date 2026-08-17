import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SqliteD1 } from "../test-support/sqlite-d1";

function migration(name: string): string {
  return readFileSync(resolve(process.cwd(), "apps/api/migrations", name), "utf8");
}

describe("review plan lineage migrations", () => {
  it("records legacy revisions for explicit repair without blocking the upgrade", async () => {
    const database = new SqliteD1(
      "eventloom-review-lineage-migration-",
      migration("0009_evaluations.sql"),
    );
    try {
      database.executeScript(`
        INSERT INTO review_plans (
          organization_id, event_id, id, name, status, blind_review, closes_at,
          reviews_per_submission, max_assignments_per_reviewer, track_filter,
          auto_distribute, reviewer_projection_field_ids_json,
          reviewer_projection_file_ids_json, grading_revision, grading_locked_at,
          version, created_at, updated_at
        ) VALUES
          (
            'org-1', 'event-1', 'plan-1', 'Main review', 'open', 0, NULL,
            1, 5, NULL, 0, '[]', '[]', 2, '2026-08-01T00:00:00.000Z',
            2, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'
          ),
          (
            'org-1', 'event-1', 'plan-1-revision-2',
            substr(replace(hex(zeroblob(100)), '00', 'x'), 1, 200),
            'open', 0, NULL,
            1, 5, NULL, 0, '[]', '[]', 2, '2026-08-02T00:00:00.000Z',
            2, '2026-08-02T00:00:00.000Z', '2026-08-02T00:00:00.000Z'
          );
        INSERT INTO review_rounds (
          id, organization_id, event_id, plan_id, name, sequence, revision,
          rubric_id, rubric_revision, opens_at, closes_at, blind_review,
          anonymization, track_filter
        ) VALUES (
          'round-1-revision-2', 'org-1', 'event-1', 'plan-1-revision-2',
          'Committee review', 1, 2, 'rubric-1-revision-2', 2, NULL, NULL, 0,
          'none', NULL
        );
      `);

      database.executeScript(migration("0035_review_plan_revision_lineage.sql"));
      database.executeScript(migration("0036_review_plan_lineage_repairs.sql"));
      database.executeScript(migration("0037_review_plan_lineage_repair_triggers.sql"));
      database.executeScript(migration("0038_review_plan_revision_sync_lock.sql"));
      database.executeScript(migration("0039_review_plan_revision_sync_token.sql"));
      database.executeScript(migration("0040_refine_review_plan_lineage_repair_candidates.sql"));
      database.executeScript(migration("0041_truncated_review_plan_lineage_repair_candidates.sql"));
      database.executeScript(`
        INSERT INTO review_plans (
          organization_id, event_id, id, name, status, blind_review, closes_at,
          reviews_per_submission, max_assignments_per_reviewer, track_filter,
          auto_distribute, reviewer_projection_field_ids_json,
          reviewer_projection_file_ids_json, grading_revision, grading_locked_at,
          version, created_at, updated_at
        ) VALUES (
          'org-1', 'event-1', 'plan-1-revision-3', 'Late legacy revision', 'open', 0, NULL,
          1, 5, NULL, 0, '[]', '[]', 3, '2026-08-03T00:00:00.000Z',
          3, '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z'
        );
        INSERT INTO review_rounds (
          id, organization_id, event_id, plan_id, name, sequence, revision,
          rubric_id, rubric_revision, opens_at, closes_at, blind_review,
          anonymization, track_filter
        ) VALUES (
          'round-1-revision-3', 'org-1', 'event-1', 'plan-1-revision-3',
          'Committee review', 1, 3, 'rubric-1-revision-3', 3, NULL, NULL, 0,
          'none', NULL
        );
      `);

      const revisions = await database
        .prepare(
          `SELECT id, predecessor_plan_id
             FROM review_plans
            WHERE id = 'plan-1-revision-2'`,
        )
        .all<{ id: string; predecessor_plan_id: string | null }>();
      expect(revisions.results).toEqual([{ id: "plan-1-revision-2", predecessor_plan_id: null }]);
      const repairs = await database
        .prepare(
          `SELECT plan_id, round_id, reason
             FROM review_plan_lineage_repairs_required
            ORDER BY plan_id, round_id`,
        )
        .all<{ plan_id: string; round_id: string; reason: string }>();
      expect(repairs.results).toEqual([
        {
          plan_id: "plan-1-revision-2",
          round_id: "",
          reason: "missing_predecessor_plan",
        },
        {
          plan_id: "plan-1-revision-2",
          round_id: "round-1-revision-2",
          reason: "missing_predecessor_round",
        },
        {
          plan_id: "plan-1-revision-3",
          round_id: "",
          reason: "missing_predecessor_plan",
        },
        {
          plan_id: "plan-1-revision-3",
          round_id: "round-1-revision-3",
          reason: "missing_predecessor_round",
        },
      ]);
    } finally {
      database.dispose();
    }
  });

  it("does not classify an independent root containing the revision word as damaged", async () => {
    const database = new SqliteD1(
      "eventloom-review-lineage-root-",
      migration("0009_evaluations.sql"),
    );
    try {
      database.executeScript(`
        INSERT INTO review_plans (
          organization_id, event_id, id, name, status, blind_review, closes_at,
          reviews_per_submission, max_assignments_per_reviewer, track_filter,
          auto_distribute, reviewer_projection_field_ids_json,
          reviewer_projection_file_ids_json, grading_revision, grading_locked_at,
          version, created_at, updated_at
        ) VALUES (
          'org-1', 'event-1', 'plan-summit-revision-planning',
          'Revision planning', 'open', 0, NULL, 1, 5, NULL, 0, '[]', '[]',
          2, '2026-08-01T00:00:00.000Z', 2,
          '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'
        );
        INSERT INTO review_rounds (
          id, organization_id, event_id, plan_id, name, sequence, revision,
          rubric_id, rubric_revision, opens_at, closes_at, blind_review,
          anonymization, track_filter
        ) VALUES (
          'round-revision-planning', 'org-1', 'event-1',
          'plan-summit-revision-planning', 'Planning', 1, 2,
          'rubric-1', 2, '2026-08-01T00:00:00.000Z',
          '2026-08-31T00:00:00.000Z', 0, 'none', NULL
        );
      `);
      database.executeScript(migration("0035_review_plan_revision_lineage.sql"));
      database.executeScript(migration("0036_review_plan_lineage_repairs.sql"));
      database.executeScript(migration("0037_review_plan_lineage_repair_triggers.sql"));
      database.executeScript(migration("0038_review_plan_revision_sync_lock.sql"));
      database.executeScript(migration("0039_review_plan_revision_sync_token.sql"));
      database.executeScript(`
        INSERT INTO review_plan_lineage_repairs_required (
          organization_id, event_id, plan_id, round_id, reason
        ) VALUES
          ('org-1', 'event-1', 'plan-summit-revision-planning', '', 'missing_predecessor_plan'),
          (
            'org-1', 'event-1', 'plan-summit-revision-planning',
            'round-revision-planning', 'missing_predecessor_round'
          );
      `);
      database.executeScript(migration("0040_refine_review_plan_lineage_repair_candidates.sql"));

      const remainingTriggers = await database
        .prepare(
          `SELECT name
             FROM sqlite_master
            WHERE type = 'trigger'
              AND name IN (
                'trg_review_plan_lineage_repair_insert',
                'trg_review_round_lineage_repair_insert'
              )
            ORDER BY name`,
        )
        .all<{ name: string }>();
      expect(remainingTriggers.results).toEqual([]);

      const repairs = await database
        .prepare(
          `SELECT plan_id, round_id
             FROM review_plan_lineage_repairs_required
            ORDER BY plan_id, round_id`,
        )
        .all<{ plan_id: string; round_id: string }>();
      expect(repairs.results).toEqual([]);
    } finally {
      database.dispose();
    }
  });

  it("records max-length truncated legacy revisions for explicit repair", async () => {
    const database = new SqliteD1(
      "eventloom-review-lineage-truncated-",
      migration("0009_evaluations.sql"),
    );
    const ancestorPlanId = `plan-${"a".repeat(95)}`;
    const childPlanId = `${ancestorPlanId.slice(0, 89)}-revision-7`;
    const ancestorRoundId = `round-${"b".repeat(94)}`;
    const childRoundId = `${ancestorRoundId.slice(0, 89)}-revision-7`;
    try {
      database.executeScript(`
        INSERT INTO review_plans (
          organization_id, event_id, id, name, status, blind_review, closes_at,
          reviews_per_submission, max_assignments_per_reviewer, track_filter,
          auto_distribute, reviewer_projection_field_ids_json,
          reviewer_projection_file_ids_json, grading_revision, grading_locked_at,
          version, created_at, updated_at
        ) VALUES
          (
            'org-1', 'event-1', '${ancestorPlanId}', 'Ancestor', 'open', 0, NULL,
            1, 5, NULL, 0, '[]', '[]', 7, '2026-08-01T00:00:00.000Z',
            7, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'
          ),
          (
            'org-1', 'event-1', '${childPlanId}', 'Truncated child', 'open', 0, NULL,
            1, 5, NULL, 0, '[]', '[]', 1, '2026-08-02T00:00:00.000Z',
            1, '2026-08-02T00:00:00.000Z', '2026-08-02T00:00:00.000Z'
          );
        INSERT INTO review_rounds (
          id, organization_id, event_id, plan_id, name, sequence, revision,
          rubric_id, rubric_revision, opens_at, closes_at, blind_review,
          anonymization, track_filter
        ) VALUES
          (
            '${ancestorRoundId}', 'org-1', 'event-1', '${ancestorPlanId}',
            'Ancestor round', 1, 7, 'rubric-ancestor', 7, NULL, NULL, 0, 'none', NULL
          ),
          (
            '${childRoundId}', 'org-1', 'event-1', '${childPlanId}',
            'Truncated child round', 1, 1, 'rubric-child', 1, NULL, NULL, 0, 'none', NULL
          );
      `);

      database.executeScript(migration("0035_review_plan_revision_lineage.sql"));
      database.executeScript(migration("0036_review_plan_lineage_repairs.sql"));
      database.executeScript(migration("0037_review_plan_lineage_repair_triggers.sql"));
      database.executeScript(migration("0038_review_plan_revision_sync_lock.sql"));
      database.executeScript(migration("0039_review_plan_revision_sync_token.sql"));
      database.executeScript(migration("0040_refine_review_plan_lineage_repair_candidates.sql"));
      database.executeScript(migration("0041_truncated_review_plan_lineage_repair_candidates.sql"));

      const repairs = await database
        .prepare(
          `SELECT plan_id, round_id, reason
             FROM review_plan_lineage_repairs_required
            ORDER BY plan_id, round_id`,
        )
        .all<{ plan_id: string; round_id: string; reason: string }>();
      expect(repairs.results).toEqual([
        {
          plan_id: childPlanId,
          round_id: "",
          reason: "missing_predecessor_plan",
        },
        {
          plan_id: childPlanId,
          round_id: childRoundId,
          reason: "missing_predecessor_round",
        },
      ]);
    } finally {
      database.dispose();
    }
  });
});
