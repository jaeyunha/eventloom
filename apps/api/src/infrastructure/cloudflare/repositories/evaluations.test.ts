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

function batchSql(db: RecordingD1): string {
  return db.batches[0]?.map((item) => item.sql).join("\n") ?? "";
}

describe("D1EvaluationRepository compound CAS", () => {
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
    expect(batchSql(db)).toContain("NOT EXISTS (SELECT 1 FROM evaluation_conflicts");
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

    await new D1EvaluationRepository(db as unknown as D1Database).resolveSuggestion(
      suggestion,
      1,
      assignment,
      1,
      review,
      null,
    );

    expect(db.batches).toHaveLength(1);
    expect(batchSql(db)).toContain("evaluation_suggestions");
    expect(batchSql(db)).toContain("review_assignments");
    expect(batchSql(db)).toContain("evaluation_reviews");
    expect(db.batches[0]?.filter((item) => item.sql.includes("D1_CAS_CONFLICT"))).toHaveLength(3);
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
