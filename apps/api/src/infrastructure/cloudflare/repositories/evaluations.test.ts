import type { D1Database } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";

import type {
  EvaluationAssignment,
  EvaluationReview,
  EvaluationSuggestion,
} from "../../../features/evaluations/types";
import {
  createSpeakerLifecycleFixture,
  speakerLifecycleIds,
} from "../../../test-support/speaker-lifecycle";
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
    return statements.map(() => ({
      results: this.allRows.shift() ?? [],
      meta: { changes: 1 },
    }));
  }
}

const timestamp = "2026-08-13T12:00:00.000Z";

function workspaceDatabase(reviewCount: number, scoresPerReview: number): RecordingD1 {
  const database = new RecordingD1();
  const assignmentRows = Array.from({ length: reviewCount }, (_, reviewIndex) => ({
    id: `assignment-${reviewIndex + 1}`,
    organization_id: "org-1",
    event_id: "event-1",
    plan_id: "plan-1",
    round_id: "round-1",
    submission_id: `submission-${reviewIndex + 1}`,
    reviewer_id: `reviewer-${reviewIndex + 1}`,
    status: reviewIndex === 0 ? "in_progress" : "submitted",
    predecessor_assignment_id: null,
    successor_assignment_id: null,
    superseded_reason: null,
    superseded_at: null,
    plan_version: 2,
    round_revision: 3,
    rubric_revision: 4,
    submission_revision: 5,
    version: reviewIndex + 1,
    created_at: timestamp,
    updated_at: timestamp,
  }));
  const reviewRows = Array.from({ length: reviewCount }, (_, reviewIndex) => ({
    id: `review-${reviewIndex + 1}`,
    organization_id: "org-1",
    event_id: "event-1",
    plan_id: "plan-1",
    round_id: "round-1",
    assignment_id: `assignment-${reviewIndex + 1}`,
    submission_id: `submission-${reviewIndex + 1}`,
    reviewer_id: `reviewer-${reviewIndex + 1}`,
    comment: reviewIndex === 0 ? "Draft" : "Submitted",
    submitted_at: reviewIndex === 0 ? null : timestamp,
    plan_revision: 2,
    round_revision: 3,
    rubric_revision: 4,
    submission_revision: 5,
    version: reviewIndex + 1,
    created_at: timestamp,
    updated_at: timestamp,
  }));
  const scoreRows = reviewRows.flatMap((reviewRow, reviewIndex) =>
    Array.from({ length: scoresPerReview }, (_, scoreIndex) => ({
      organization_id: "org-1",
      event_id: "event-1",
      review_id: reviewRow.id,
      criterion_id: `criterion-${scoreIndex + 1}`,
      value_number: scoreIndex === 0 ? null : scoreIndex + 3,
      value_text: scoreIndex === 0 ? "strong" : null,
      origin: scoreIndex === 0 ? "ai" : "human",
      human_confirmed_by: scoreIndex === 0 ? `reviewer-${reviewIndex + 1}` : null,
      suggestion_id: scoreIndex === 0 ? `suggestion-${reviewIndex + 1}` : null,
      suggestion_status: scoreIndex === 0 ? "edited" : null,
      rubric_revision: 4,
      submission_revision: 5,
      updated_at: timestamp,
    })),
  );
  const evidenceRows = scoreRows.flatMap((scoreRow) => [
    { ...scoreRow, ordinal: 0, evidence: `${scoreRow.review_id}:${scoreRow.criterion_id}:first` },
    { ...scoreRow, ordinal: 1, evidence: `${scoreRow.review_id}:${scoreRow.criterion_id}:second` },
  ]);

  database.allRows.push(assignmentRows, reviewRows, [], scoreRows, evidenceRows);
  return database;
}

describe("D1EvaluationRepository organizer workspace hydration", () => {
  it("uses one plan-scoped session batch for export records", async () => {
    const database = workspaceDatabase(4, 3);

    const records = await new D1EvaluationRepository(
      database as unknown as D1Database,
    ).listOrganizerExportRecords("org-1", "event-1", "plan-1");

    expect(database.sessionConstraints).toEqual(["first-primary"]);
    expect(database.batches).toHaveLength(1);
    expect(database.batches[0]).toHaveLength(6);
    for (const prepared of database.batches[0] ?? []) {
      expect(prepared.values.slice(0, 3)).toEqual(["org-1", "event-1", "plan-1"]);
    }
    expect(records.assignments).toHaveLength(4);
    expect(records.reviews).toHaveLength(4);
    expect(Object.keys(records.reviews[3]?.scores ?? {})).toEqual([
      "criterion-1",
      "criterion-2",
      "criterion-3",
    ]);
  });

  it("uses a fixed five statements while preserving complete review score hydration", async () => {
    const smallDatabase = workspaceDatabase(1, 1);
    const largeDatabase = workspaceDatabase(4, 3);

    const [small, large] = await Promise.all([
      new D1EvaluationRepository(
        smallDatabase as unknown as D1Database,
      ).listOrganizerWorkspaceRecords("org-1", "event-1"),
      new D1EvaluationRepository(
        largeDatabase as unknown as D1Database,
      ).listOrganizerWorkspaceRecords("org-1", "event-1"),
    ]);

    expect(smallDatabase.statements).toHaveLength(5);
    expect(largeDatabase.statements).toHaveLength(5);
    expect(large.assignments.map((item) => item.submissionId)).toEqual([
      "submission-1",
      "submission-2",
      "submission-3",
      "submission-4",
    ]);
    expect(large.reviews.map((item) => item.id)).toEqual([
      "review-1",
      "review-2",
      "review-3",
      "review-4",
    ]);
    expect(Object.keys(large.reviews[3]?.scores ?? {})).toEqual([
      "criterion-1",
      "criterion-2",
      "criterion-3",
    ]);
    expect(small.reviews[0]).toMatchObject({
      id: "review-1",
      comment: "Draft",
      submittedAt: null,
      scores: {
        "criterion-1": {
          value: "strong",
          origin: "ai",
          evidence: ["review-1:criterion-1:first", "review-1:criterion-1:second"],
          humanConfirmedBy: "reviewer-1",
          suggestionId: "suggestion-1",
          suggestionStatus: "edited",
          rubricRevision: 4,
          submissionRevision: 5,
        },
      },
    });
    expect(large.reviews[1]).toMatchObject({ submittedAt: timestamp });

    for (const prepared of largeDatabase.statements) {
      expect(prepared.sql).toContain("organization_id = ?");
      expect(prepared.sql).toContain("event_id = ?");
      expect(prepared.values.slice(0, 2)).toEqual(["org-1", "event-1"]);
    }
    expect(largeDatabase.statements.map((prepared) => prepared.sql)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/evaluation_reviews[\s\S]*ORDER BY id/),
        expect.stringMatching(/evaluation_scores[\s\S]*ORDER BY review_id, criterion_id/),
        expect.stringMatching(
          /evaluation_score_evidence[\s\S]*ORDER BY review_id, criterion_id, ordinal/,
        ),
      ]),
    );
  });
});

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

  it("batches the compound review authority guard before every review write", async () => {
    const db = database();
    await new D1EvaluationRepository(db as unknown as D1Database).writeReview({
      authority: {
        tenantId: assignment.tenantId,
        eventId: assignment.eventId,
        planId: assignment.planId,
        roundId: assignment.roundId,
        assignmentId: assignment.id,
        submissionId: assignment.submissionId,
        reviewerId: assignment.reviewerId,
        expectedAssignmentVersion: assignment.version,
      },
      review,
      expectedReviewVersion: null,
      assignmentUpdate: {
        ...assignment,
        status: "in_progress",
        version: assignment.version + 1,
      },
    });

    expect(db.batches).toHaveLength(1);
    const guard = db.batches[0]?.[0];
    expect(guard?.sql).toContain("D1_CAS_CONFLICT");
    expect(batchSql(db)).toContain("status IN ('assigned', 'in_progress')");
    expect(batchSql(db)).toContain("FROM evaluation_conflicts");
    expect(batchSql(db)).toContain("FROM submissions");
    expect(batchSql(db)).toContain("status = 'submitted'");
    expect(batchSql(db)).toContain("FROM submission_versions");
    expect(batchSql(db)).toContain("FROM review_plans");
    expect(batchSql(db)).toContain("FROM review_rounds");
    expect(batchSql(db)).toContain("FROM evaluation_decisions");
    expect(batchSql(db)).toContain("INSERT INTO evaluation_reviews");
    expect(batchSql(db)).toContain("UPDATE review_assignments");
    expect(guard?.values).toEqual([
      "org-1",
      "event-1",
      "plan-1",
      "round-1",
      "submission-1",
      "assignment-1",
      "reviewer-1",
      2,
      "org-1",
      "event-1",
      "assignment-1",
      "org-1",
      "event-1",
      "submission-1",
      "org-1",
      "event-1",
      "submission-1",
      "org-1",
      "event-1",
      "submission-1",
      5,
      "org-1",
      "event-1",
      "plan-1",
      2,
      2,
      timestamp,
      "org-1",
      "event-1",
      "plan-1",
      "round-1",
      3,
      4,
      timestamp,
      timestamp,
      "org-1",
      "event-1",
      "plan-1",
      "submission-1",
    ]);
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
    expect(batchSql(db)).toMatch(/EXISTS \(\s*SELECT 1 FROM submissions/u);
    expect(batchSql(db)).toMatch(/FROM submissions\s+WHERE[\s\S]*\bid = \?/u);
    expect(batchSql(db)).toContain("status = 'submitted'");
    expect(batchSql(db)).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM evaluation_decisions/u);

    await repository.resolveSuggestion(suggestion, 1, assignment, 1, review, null);

    expect(db.batches).toHaveLength(2);
    expect(batchSql(db, 1)).toContain("evaluation_suggestions");
    expect(batchSql(db, 1)).toContain("review_assignments");
    expect(batchSql(db, 1)).toContain("evaluation_reviews");
    expect(db.batches[1]?.filter((item) => item.sql.includes("D1_CAS_CONFLICT"))).toHaveLength(4);
    expect(batchSql(db, 1)).toContain("status <> 'abstained'");
    expect(batchSql(db, 1)).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM evaluation_conflicts/u);
    expect(batchSql(db, 1)).toMatch(/EXISTS \(\s*SELECT 1 FROM submissions/u);
    expect(batchSql(db, 1)).toMatch(/FROM submissions\s+WHERE[\s\S]*\bid = \?/u);
    expect(batchSql(db, 1)).toContain("status = 'submitted'");
    expect(batchSql(db, 1)).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM evaluation_decisions/u);
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

const migratedSuggestion: EvaluationSuggestion = {
  id: "suggestion-migrated-1",
  tenantId: speakerLifecycleIds.organizationId,
  eventId: speakerLifecycleIds.eventId,
  planId: "plan-migrated-1",
  roundId: "round-migrated-1",
  assignmentId: "assignment-migrated-1",
  submissionId: speakerLifecycleIds.acceptedSubmissionId,
  reviewerId: "reviewer-migrated-1",
  rubricRevision: 1,
  submissionRevision: 1,
  criterionCandidates: [],
  candidates: {},
  provenance: {
    provider: "provider",
    model: "model",
    generatedAt: timestamp,
    sourceReferences: [],
  },
  status: "pending",
  version: 1,
  history: [],
  audit: [],
  createdAt: timestamp,
  updatedAt: timestamp,
};

const migratedReview: EvaluationReview = {
  ...review,
  id: "review-migrated-1",
  tenantId: speakerLifecycleIds.organizationId,
  eventId: speakerLifecycleIds.eventId,
  planId: "plan-migrated-1",
  roundId: "round-migrated-1",
  assignmentId: "assignment-migrated-1",
  submissionId: speakerLifecycleIds.acceptedSubmissionId,
  reviewerId: "reviewer-migrated-1",
  planRevision: 1,
  roundRevision: 1,
  rubricRevision: 1,
  submissionRevision: 1,
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};

function seedMigratedEvaluationAssignment(
  database: ReturnType<typeof createSpeakerLifecycleFixture>["database"],
): void {
  database.executeScript(`
    INSERT INTO review_plans (
      id, organization_id, event_id, name, status, blind_review,
      reviews_per_submission, max_assignments_per_reviewer, auto_distribute,
      reviewer_projection_field_ids_json, reviewer_projection_file_ids_json,
      version, created_at, updated_at
    ) VALUES (
      '${migratedSuggestion.planId}', '${migratedSuggestion.tenantId}',
      '${migratedSuggestion.eventId}', 'Migrated review', 'open', 0,
      1, 5, 0, '[]', '[]', 1, '${timestamp}', '${timestamp}'
    );
    INSERT INTO review_rounds (
      id, organization_id, event_id, plan_id, name, sequence, revision,
      rubric_id, rubric_revision, blind_review, anonymization
    ) VALUES (
      '${migratedSuggestion.roundId}', '${migratedSuggestion.tenantId}',
      '${migratedSuggestion.eventId}', '${migratedSuggestion.planId}',
      'Migrated round', 0, 1, 'rubric-migrated-1', 1, 0, 'none'
    );
    INSERT INTO review_assignments (
      id, organization_id, event_id, plan_id, round_id, round_revision,
      submission_id, reviewer_id, status, plan_version, rubric_revision,
      submission_revision, version, created_at, updated_at
    ) VALUES (
      '${migratedSuggestion.assignmentId}', '${migratedSuggestion.tenantId}',
      '${migratedSuggestion.eventId}', '${migratedSuggestion.planId}',
      '${migratedSuggestion.roundId}', 1, '${migratedSuggestion.submissionId}',
      '${migratedSuggestion.reviewerId}', 'in_progress', 1, 1, 1, 1,
      '${timestamp}', '${timestamp}'
    );
  `);
}

describe("D1EvaluationRepository migrated lifecycle CAS", () => {
  it("persists a suggestion through the migrated submissions.id guard", async () => {
    const fixture = createSpeakerLifecycleFixture();
    try {
      seedMigratedEvaluationAssignment(fixture.database);
      const repository = new D1EvaluationRepository(fixture.database as unknown as D1Database);

      await repository.putSuggestion(migratedSuggestion, null, 1);

      await expect(
        repository.getSuggestion(migratedSuggestion.tenantId, migratedSuggestion.id),
      ).resolves.toMatchObject({
        id: migratedSuggestion.id,
        status: "pending",
      });
    } finally {
      fixture.dispose();
    }
  });

  it("persists no suggestion when withdrawal commits immediately before the D1 batch", async () => {
    const fixture = createSpeakerLifecycleFixture();
    try {
      seedMigratedEvaluationAssignment(fixture.database);
      const repository = new D1EvaluationRepository(fixture.database as unknown as D1Database);
      fixture.database.beforeNextBatch(() => {
        fixture.database.run(
          `UPDATE submissions
           SET status = 'withdrawn', version = version + 1, updated_at = '${timestamp}'
           WHERE organization_id = '${migratedSuggestion.tenantId}'
             AND event_id = '${migratedSuggestion.eventId}'
             AND id = '${migratedSuggestion.submissionId}'`,
        );
      });

      await expect(repository.putSuggestion(migratedSuggestion, null, 1)).rejects.toThrow();
      await expect(
        repository.getSuggestion(migratedSuggestion.tenantId, migratedSuggestion.id),
      ).resolves.toBeNull();
    } finally {
      fixture.dispose();
    }
  });

  it("persists no review when withdrawal commits immediately before the D1 batch", async () => {
    const fixture = createSpeakerLifecycleFixture();
    try {
      seedMigratedEvaluationAssignment(fixture.database);
      const repository = new D1EvaluationRepository(fixture.database as unknown as D1Database);
      fixture.database.beforeNextBatch(() => {
        fixture.database.run(
          `UPDATE submissions
           SET status = 'withdrawn', version = version + 1, updated_at = '${timestamp}'
           WHERE organization_id = '${migratedReview.tenantId}'
             AND event_id = '${migratedReview.eventId}'
             AND id = '${migratedReview.submissionId}'`,
        );
      });

      await expect(
        repository.writeReview({
          authority: {
            tenantId: migratedReview.tenantId,
            eventId: migratedReview.eventId,
            planId: migratedReview.planId,
            roundId: migratedReview.roundId,
            assignmentId: migratedReview.assignmentId,
            submissionId: migratedReview.submissionId,
            reviewerId: migratedReview.reviewerId,
            expectedAssignmentVersion: 1,
          },
          review: migratedReview,
          expectedReviewVersion: null,
          assignmentUpdate: {
            ...assignment,
            id: migratedReview.assignmentId,
            tenantId: migratedReview.tenantId,
            eventId: migratedReview.eventId,
            planId: migratedReview.planId,
            roundId: migratedReview.roundId,
            submissionId: migratedReview.submissionId,
            reviewerId: migratedReview.reviewerId,
            status: "in_progress",
            version: 2,
          },
        }),
      ).rejects.toThrow();
      await expect(
        repository.getReview(migratedReview.tenantId, migratedReview.assignmentId),
      ).resolves.toBeNull();
    } finally {
      fixture.dispose();
    }
  });
});
