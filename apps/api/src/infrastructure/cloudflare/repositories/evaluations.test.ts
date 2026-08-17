import type { D1Database } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";

import type {
  EvaluationAssignment,
  EvaluationReview,
  EvaluationSuggestion,
} from "../../../features/evaluations/types";
import { D1EvaluationRepository } from "./evaluations";

interface RecordedStatement {
  readonly sql: string;
  values: unknown[];
  bind(...values: unknown[]): RecordedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
}

class RecordingD1 {
  readonly statements: RecordedStatement[] = [];
  readonly batches: readonly RecordedStatement[][] = [];
  readonly firstRows: unknown[] = [];
  readonly allRows: unknown[][] = [];
  readonly sessionConstraints: string[] = [];

  withSession(constraint?: string) {
    this.sessionConstraints.push(constraint ?? "");
    return this;
  }

  prepare(sql: string): RecordedStatement {
    const database = this;
    const prepared: RecordedStatement = {
      sql,
      values: [],
      bind(...values: unknown[]) {
        this.values = values;
        return this;
      },
      async first<T>() {
        return (database.firstRows.shift() ?? null) as T | null;
      },
      async all<T>() {
        return { results: (database.allRows.shift() ?? []) as T[] };
      },
    };
    this.statements.push(prepared);
    return prepared;
  }

  async batch(statements: RecordedStatement[]) {
    (this.batches as RecordedStatement[][]).push(statements);
    return statements.map(() => ({ results: [], meta: { changes: 1 } }));
  }
}

const timestamp = "2026-08-13T12:00:00.000Z";

describe("D1EvaluationRepository consistency", () => {
  it("reads evaluation plans from the primary for optimistic transitions", async () => {
    const database = new RecordingD1();
    const repository = new D1EvaluationRepository(database as unknown as D1Database);

    await repository.getPlan("org-1", "plan-1");

    expect(database.sessionConstraints).toEqual(["first-primary"]);
  });

  it("reads assignments and reviews from the primary for reviewer writes", async () => {
    const database = new RecordingD1();
    const repository = new D1EvaluationRepository(database as unknown as D1Database);

    await repository.getAssignment("org-1", "assignment-1");
    await repository.getReview("org-1", "assignment-1");

    expect(database.sessionConstraints).toEqual(["first-primary", "first-primary"]);
  });

  it("lists assignments from the primary after distribution writes", async () => {
    const database = new RecordingD1();
    const repository = new D1EvaluationRepository(database as unknown as D1Database);

    await repository.listAssignments("org-1", "plan-1");

    expect(database.sessionConstraints).toEqual(["first-primary"]);
  });

  it("reads decisions from the primary for organizer transitions", async () => {
    const database = new RecordingD1();
    const repository = new D1EvaluationRepository(database as unknown as D1Database);

    await repository.getDecision("org-1", "plan-1", "submission-1");

    expect(database.sessionConstraints).toEqual(["first-primary"]);
  });

  it("updates plan state without rebuilding referenced rounds", async () => {
    const database = new RecordingD1();
    database.firstRows.push({
      id: "plan-1",
      organization_id: "org-1",
      event_id: "event-1",
      name: "Review",
      status: "draft",
      blind_review: 0,
      closes_at: null,
      reviews_per_submission: 1,
      max_assignments_per_reviewer: 5,
      track_filter: null,
      auto_distribute: 0,
      reviewer_projection_field_ids_json: "[]",
      reviewer_projection_file_ids_json: "[]",
      grading_revision: null,
      grading_locked_at: null,
      version: 2,
      created_at: timestamp,
      updated_at: timestamp,
    });
    database.allRows.push([]);
    const repository = new D1EvaluationRepository(database as unknown as D1Database);
    const plan = {
      id: "plan-1",
      tenantId: "org-1",
      eventId: "event-1",
      name: "Review",
      status: "open" as const,
      blindReview: false,
      closesAt: null,
      assignmentRule: {
        reviewsPerSubmission: 1,
        maxAssignmentsPerReviewer: 5,
        autoDistribute: false,
      },
      rounds: [],
      version: 3,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await repository.putPlanState(plan, 2);

    const sql = database.batches[0]?.map((statement) => statement.sql).join("\n") ?? "";
    expect(sql).toContain("UPDATE review_plans");
    expect(sql).not.toContain("DELETE FROM review_rounds");
    expect(sql).not.toContain("DELETE FROM review_rubrics");
    expect(sql).not.toContain("INSERT INTO review_rounds");
  });

  it("deletes reviewer pool children before rebuilding draft rounds", async () => {
    const database = new RecordingD1();
    const repository = new D1EvaluationRepository(database as unknown as D1Database);

    await repository.putPlan(
      {
        id: "plan-1",
        tenantId: "org-1",
        eventId: "event-1",
        name: "Review",
        status: "draft",
        blindReview: false,
        closesAt: null,
        assignmentRule: {
          reviewsPerSubmission: 1,
          maxAssignmentsPerReviewer: 5,
          autoDistribute: false,
        },
        rounds: [],
        version: 2,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      1,
    );

    const sql = database.batches[0]?.map((statement) => statement.sql) ?? [];
    const memberDelete = sql.findIndex((value) =>
      value.includes("DELETE FROM reviewer_pool_members"),
    );
    const poolDelete = sql.findIndex((value) => value.includes("DELETE FROM reviewer_pools"));
    const roundDelete = sql.findIndex((value) => value.includes("DELETE FROM review_rounds"));

    expect(memberDelete).toBeGreaterThan(-1);
    expect(poolDelete).toBeGreaterThan(memberDelete);
    expect(roundDelete).toBeGreaterThan(poolDelete);
  });
});
const assignment: EvaluationAssignment = {
  id: "assignment-1",
  tenantId: "org-1",
  eventId: "event-1",
  planId: "plan-1",
  roundId: "round-1",
  submissionId: "submission-1",
  reviewerId: "reviewer-1",
  status: "in_progress",
  planVersion: 2,
  roundRevision: 3,
  rubricRevision: 4,
  submissionRevision: 5,
  version: 2,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const review: EvaluationReview = {
  id: "review-1",
  tenantId: "org-1",
  eventId: "event-1",
  planId: "plan-1",
  roundId: "round-1",
  assignmentId: "assignment-1",
  submissionId: "submission-1",
  reviewerId: "reviewer-1",
  scores: {
    criterion: {
      criterionId: "criterion",
      value: 4,
      origin: "human",
      evidence: ["Specific evidence"],
      humanConfirmedBy: null,
      rubricRevision: 4,
      submissionRevision: 5,
      updatedAt: timestamp,
    },
  },
  comment: "Draft",
  submittedAt: null,
  planRevision: 2,
  roundRevision: 3,
  rubricRevision: 4,
  submissionRevision: 5,
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};

function database() {
  return new RecordingD1();
}

function batchSql(db: RecordingD1, batchIndex = 0): string {
  return db.batches[batchIndex]?.map((item) => item.sql).join("\n") ?? "";
}

describe("D1EvaluationRepository compound CAS", () => {
  it("updates plan schedule without rebuilding preserved review state", async () => {
    const database = new RecordingD1();
    const repository = new D1EvaluationRepository(database as unknown as D1Database);
    const timestamp = "2026-08-13T00:00:00.000Z";
    await repository.putPlanSchedule?.(
      {
        id: "plan-1",
        tenantId: "org-1",
        eventId: "event-1",
        name: "Review",
        status: "open",
        blindReview: false,
        closesAt: "2026-08-31T20:00:00-04:00",
        assignmentRule: {
          reviewsPerSubmission: 1,
          maxAssignmentsPerReviewer: 5,
          autoDistribute: false,
        },
        rounds: [],
        version: 4,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      3,
    );
    const sql = database.statements.map((entry) => entry.sql).join("\n");
    expect(sql).toContain("UPDATE review_plans");
    expect(sql).toContain("closes_at");
    expect(
      database.statements.find((entry) => entry.sql.includes("SET closes_at"))?.values[0],
    ).toBe("2026-09-01T00:00:00.000Z");
    expect(database.statements.at(-1)?.values).toEqual(["org-1", "event-1", "plan-1"]);
    expect(sql).not.toContain("DELETE FROM review_rounds");
    expect(sql).not.toContain("review_rubrics");
    expect(sql).not.toContain("review_assignments");
  });
  it("batches tenant/event-scoped assignment and review guards before saving a draft", async () => {
    const db = database();
    await new D1EvaluationRepository(db as unknown as D1Database).saveReviewDraft(
      assignment,
      1,
      review,
      null,
    );

    expect(db.batches).toHaveLength(1);
    expect(batchSql(db)).toContain(
      "organization_id = ? AND event_id = ? AND id = ? AND version = ?",
    );
    expect(batchSql(db)).toContain("organization_id = ? AND assignment_id = ?");
    expect(batchSql(db)).toContain("INSERT INTO evaluation_reviews");
    expect(batchSql(db)).toContain("INSERT INTO evaluation_scores");
    expect(batchSql(db)).toContain("INSERT INTO evaluation_score_evidence");
    expect(db.batches[0]?.[0]?.values.slice(0, 4)).toEqual(["org-1", "event-1", "assignment-1", 1]);
  });

  it("uses one tenant-scoped guard for assignment abstention and conflict insertion", async () => {
    const db = database();
    await new D1EvaluationRepository(db as unknown as D1Database).abstainAssignment(
      { ...assignment, status: "abstained" },
      1,
      {
        id: "conflict-1",
        tenantId: "org-1",
        eventId: "event-1",
        planId: "plan-1",
        assignmentId: "assignment-1",
        submissionId: "submission-1",
        reviewerId: "reviewer-1",
        reason: "Prior collaboration",
        declaredAt: timestamp,
      },
    );

    expect(db.batches).toHaveLength(1);
    expect(batchSql(db)).toContain("EXISTS (SELECT 1 FROM review_assignments");
    expect(batchSql(db)).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM evaluation_conflicts/u);
    expect(batchSql(db)).toContain("INSERT INTO evaluation_conflicts");
  });

  it("resolves a suggestion, assignment, and review in one guarded batch", async () => {
    const db = database();
    const suggestion: EvaluationSuggestion = {
      id: "suggestion-1",
      tenantId: "org-1",
      eventId: "event-1",
      planId: "plan-1",
      roundId: "round-1",
      assignmentId: "assignment-1",
      submissionId: "submission-1",
      reviewerId: "reviewer-1",
      rubricRevision: 4,
      submissionRevision: 5,
      criterionCandidates: [],
      candidates: {},
      provenance: {
        provider: "provider",
        model: "model",
        generatedAt: timestamp,
        sourceReferences: [],
      },
      status: "accepted",
      version: 2,
      history: [],
      audit: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const repository = new D1EvaluationRepository(db as unknown as D1Database);
    await repository.putSuggestion(
      { ...suggestion, status: "pending", version: 1 },
      null,
      assignment.version,
    );
    expect(db.batches[0]?.filter((item) => item.sql.includes("D1_CAS_CONFLICT"))).toHaveLength(2);
    expect(batchSql(db)).toContain("status <> 'abstained'");
    expect(batchSql(db)).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM evaluation_conflicts/u);

    await repository.resolveSuggestion(suggestion, 1, assignment, 1, review, null);

    expect(db.batches).toHaveLength(2);
    expect(batchSql(db, 1)).toContain("evaluation_suggestions");
    expect(batchSql(db, 1)).toContain("review_assignments");
    expect(batchSql(db, 1)).toContain("evaluation_reviews");
    expect(db.batches[1]?.filter((item) => item.sql.includes("D1_CAS_CONFLICT"))).toHaveLength(4);
    expect(batchSql(db, 1)).toContain("status <> 'abstained'");
    expect(batchSql(db, 1)).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM evaluation_conflicts/u);
  });

  it("tenant-scopes plan, assignment, review, suggestion, conflict, and decision reads", async () => {
    const db = database();
    const repository = new D1EvaluationRepository(db as unknown as D1Database);
    await repository.getPlan("org-1", "plan-1");
    await repository.getAssignment("org-1", "assignment-1");
    await repository.getReview("org-1", "assignment-1");
    await repository.getSuggestion("org-1", "suggestion-1");
    await repository.getConflict("org-1", "assignment-1");
    await repository.getDecision("org-1", "plan-1", "submission-1");

    for (const prepared of db.statements) {
      expect(prepared.sql).toContain("organization_id = ?");
      expect(prepared.values[0]).toBe("org-1");
    }
  });
});
