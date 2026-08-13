import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";

import { conflict } from "../../../features/evaluations/errors";
import type {
  EvaluationRepository,
  OrganizerWorkspaceRecords,
  ReviewerWorkspaceRecords,
} from "../../../features/evaluations/repository";
import type {
  EvaluationAssignment,
  EvaluationAssignmentDistributionInput,
  EvaluationAssignmentDistributionResult,
  EvaluationAssignmentReplacementInput,
  EvaluationAssignmentReplacementResult,
  EvaluationAssignmentScope,
  EvaluationConflictDeclaration,
  EvaluationDecision,
  EvaluationDecisionTransition,
  EvaluationPlan,
  EvaluationReview,
  EvaluationReviewHistory,
  EvaluationSuggestion,
  EvaluationSuggestionAuditEntry,
  EvaluationSuggestionCandidate,
  EvaluationSuggestionResolution,
  ReviewRound,
  RubricCriterion,
  RubricScore,
} from "../../../features/evaluations/types";
import {
  batch,
  booleanValue,
  type D1Value,
  guard,
  insertGuard,
  json,
  parseJson,
  rows,
  stableSort,
  statement,
  updateGuard,
} from "./shared";

interface Row extends Record<string, unknown> {}

const text = (value: unknown): string => String(value);
const nullableText = (value: unknown): string | null => (value == null ? null : String(value));
const numberValue = (value: unknown): number => Number(value);
const optionalNumber = (value: unknown): number | undefined =>
  value == null ? undefined : Number(value);
const bool = (value: unknown): boolean => booleanValue(value as number | boolean);

function assignmentMatchesScope(
  assignment: EvaluationAssignment,
  scope: EvaluationAssignmentScope,
): boolean {
  return (
    assignment.tenantId === scope.tenantId &&
    assignment.eventId === scope.eventId &&
    assignment.planId === scope.planId &&
    assignment.roundId === scope.roundId &&
    (scope.submissionId === undefined || assignment.submissionId === scope.submissionId) &&
    (scope.planVersion === undefined || assignment.planVersion === scope.planVersion)
  );
}

function writeConflict(message: string): never {
  throw conflict(message);
}

async function atomic(
  database: D1Database,
  statements: readonly D1PreparedStatement[],
  message: string,
): Promise<void> {
  try {
    await batch(database, statements);
  } catch {
    writeConflict(message);
  }
}

function assignmentFromRow(row: Row): EvaluationAssignment {
  const predecessorAssignmentId = nullableText(row.predecessor_assignment_id);
  const successorAssignmentId = nullableText(row.successor_assignment_id);
  const supersededReason = nullableText(row.superseded_reason);
  const supersededAt = nullableText(row.superseded_at);
  return {
    id: text(row.id),
    tenantId: text(row.organization_id),
    eventId: text(row.event_id),
    planId: text(row.plan_id),
    roundId: text(row.round_id),
    submissionId: text(row.submission_id),
    reviewerId: text(row.reviewer_id),
    status: row.status as EvaluationAssignment["status"],
    predecessorAssignmentId,
    successorAssignmentId,
    supersededReason,
    ...(supersededReason === null
      ? {}
      : {
          lineage: {
            predecessorAssignmentId,
            successorAssignmentId,
            reason: supersededReason,
            ...(supersededAt === null ? {} : { supersededAt }),
          },
        }),
    planVersion: numberValue(row.plan_version),
    rubricRevision: numberValue(row.rubric_revision),
    roundRevision: numberValue(row.round_revision),
    submissionRevision: numberValue(row.submission_revision),
    version: numberValue(row.version),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function assignmentValues(assignment: EvaluationAssignment): readonly D1Value[] {
  return [
    assignment.id,
    assignment.tenantId,
    assignment.eventId,
    assignment.planId,
    assignment.roundId,
    assignment.roundRevision ?? assignment.rubricRevision ?? 1,
    assignment.submissionId,
    assignment.reviewerId,
    assignment.status,
    assignment.predecessorAssignmentId ?? null,
    assignment.successorAssignmentId ?? null,
    assignment.supersededReason ?? null,
    assignment.lineage?.supersededAt ?? null,
    assignment.planVersion ?? 1,
    assignment.rubricRevision ?? 1,
    assignment.submissionRevision ?? 1,
    assignment.version,
    assignment.createdAt,
    assignment.updatedAt,
  ];
}

function insertAssignment(database: D1Database, assignment: EvaluationAssignment) {
  return statement(
    database,
    `INSERT INTO review_assignments
       (id, organization_id, event_id, plan_id, round_id, round_revision,
        submission_id, reviewer_id, status, predecessor_assignment_id,
        successor_assignment_id, superseded_reason, superseded_at, plan_version,
        rubric_revision, submission_revision, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    assignmentValues(assignment),
  );
}

function updateAssignment(database: D1Database, assignment: EvaluationAssignment) {
  return statement(
    database,
    `UPDATE review_assignments
        SET status = ?, predecessor_assignment_id = ?, successor_assignment_id = ?,
            superseded_reason = ?, superseded_at = ?, plan_version = ?,
            rubric_revision = ?, round_revision = ?, submission_revision = ?,
            version = ?, updated_at = ?
      WHERE organization_id = ? AND event_id = ? AND id = ?`,
    [
      assignment.status,
      assignment.predecessorAssignmentId ?? null,
      assignment.successorAssignmentId ?? null,
      assignment.supersededReason ?? null,
      assignment.lineage?.supersededAt ?? null,
      assignment.planVersion ?? 1,
      assignment.rubricRevision ?? 1,
      assignment.roundRevision ?? assignment.rubricRevision ?? 1,
      assignment.submissionRevision ?? 1,
      assignment.version,
      assignment.updatedAt,
      assignment.tenantId,
      assignment.eventId,
      assignment.id,
    ],
  );
}

export class D1EvaluationRepository implements EvaluationRepository {
  constructor(private readonly database: D1Database) {}

  async getPlan(tenantId: string, planId: string): Promise<EvaluationPlan | null> {
    const row = await statement(
      this.database,
      "SELECT * FROM review_plans WHERE organization_id = ? AND id = ?",
      [tenantId, planId],
    ).first<Row>();
    return row === null ? null : this.hydratePlan(row);
  }

  async listPlans(tenantId: string, eventId?: string): Promise<readonly EvaluationPlan[]> {
    const result = await statement(
      this.database,
      `SELECT * FROM review_plans
        WHERE organization_id = ?${eventId === undefined ? "" : " AND event_id = ?"}
        ORDER BY event_id, id`,
      eventId === undefined ? [tenantId] : [tenantId, eventId],
    ).all<Row>();
    return Promise.all(rows(result).map((row) => this.hydratePlan(row)));
  }

  async putPlan(plan: EvaluationPlan, expectedVersion: number | null): Promise<void> {
    const projection = plan.reviewerProjection ?? plan.evaluatorProjection ?? plan.projection;
    const commands: D1PreparedStatement[] = [
      expectedVersion === null
        ? insertGuard(this.database, "review_plans", "organization_id = ? AND id = ?", [
            plan.tenantId,
            plan.id,
          ])
        : updateGuard(
            this.database,
            "review_plans",
            "organization_id = ? AND event_id = ? AND id = ? AND version = ?",
            [plan.tenantId, plan.eventId, plan.id, expectedVersion],
          ),
    ];
    if (expectedVersion === null) {
      commands.push(
        statement(
          this.database,
          `INSERT INTO review_plans
             (id, organization_id, event_id, name, status, blind_review, closes_at,
              reviews_per_submission, max_assignments_per_reviewer, track_filter,
              auto_distribute, reviewer_projection_field_ids_json,
              reviewer_projection_file_ids_json, grading_revision, grading_locked_at,
              version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            plan.id,
            plan.tenantId,
            plan.eventId,
            plan.name,
            plan.status,
            plan.blindReview ? 1 : 0,
            plan.closesAt,
            plan.assignmentRule.reviewsPerSubmission,
            plan.assignmentRule.maxAssignmentsPerReviewer,
            plan.assignmentRule.trackFilter ?? null,
            plan.assignmentRule.autoDistribute === true ? 1 : 0,
            json(projection?.fieldIds ?? projection?.visibleFieldIds ?? []),
            json(projection?.fileIds ?? projection?.visibleFileIds ?? []),
            plan.gradingRevision ?? null,
            plan.gradingLockedAt ?? null,
            plan.version,
            plan.createdAt,
            plan.updatedAt,
          ],
        ),
      );
    } else {
      commands.push(
        statement(
          this.database,
          `UPDATE review_plans
              SET name = ?, status = ?, blind_review = ?, closes_at = ?,
                  reviews_per_submission = ?, max_assignments_per_reviewer = ?,
                  track_filter = ?, auto_distribute = ?,
                  reviewer_projection_field_ids_json = ?, reviewer_projection_file_ids_json = ?,
                  grading_revision = ?, grading_locked_at = ?, version = ?, updated_at = ?
            WHERE organization_id = ? AND event_id = ? AND id = ? AND version = ?`,
          [
            plan.name,
            plan.status,
            plan.blindReview ? 1 : 0,
            plan.closesAt,
            plan.assignmentRule.reviewsPerSubmission,
            plan.assignmentRule.maxAssignmentsPerReviewer,
            plan.assignmentRule.trackFilter ?? null,
            plan.assignmentRule.autoDistribute === true ? 1 : 0,
            json(projection?.fieldIds ?? projection?.visibleFieldIds ?? []),
            json(projection?.fileIds ?? projection?.visibleFileIds ?? []),
            plan.gradingRevision ?? null,
            plan.gradingLockedAt ?? null,
            plan.version,
            plan.updatedAt,
            plan.tenantId,
            plan.eventId,
            plan.id,
            expectedVersion,
          ],
        ),
        statement(
          this.database,
          "DELETE FROM review_rounds WHERE organization_id = ? AND event_id = ? AND plan_id = ?",
          [plan.tenantId, plan.eventId, plan.id],
        ),
        statement(
          this.database,
          "DELETE FROM review_rubrics WHERE organization_id = ? AND event_id = ? AND plan_id = ?",
          [plan.tenantId, plan.eventId, plan.id],
        ),
      );
    }
    for (const round of plan.rounds) this.addRoundStatements(commands, plan, round);
    await atomic(this.database, commands, "Evaluation plan changed since it was loaded.");
  }

  async getAssignment(tenantId: string, assignmentId: string) {
    const row = await statement(
      this.database,
      "SELECT * FROM review_assignments WHERE organization_id = ? AND id = ?",
      [tenantId, assignmentId],
    ).first<Row>();
    return row === null ? null : assignmentFromRow(row);
  }

  async listAssignments(tenantId: string, planId: string) {
    return this.assignmentQuery("organization_id = ? AND plan_id = ? ORDER BY id", [
      tenantId,
      planId,
    ]);
  }

  async replaceAssignment(
    scope: EvaluationAssignmentScope,
    input: EvaluationAssignmentReplacementInput,
  ): Promise<EvaluationAssignmentReplacementResult> {
    const current = await this.getAssignment(scope.tenantId, input.oldAssignmentId);
    if (
      current === null ||
      !assignmentMatchesScope(current, scope) ||
      current.status === "superseded" ||
      current.version !== input.expectedAssignmentVersion ||
      input.reason.trim().length === 0
    ) {
      writeConflict("Reviewer assignment changed since it was loaded.");
    }
    const successor = input.successorAssignment;
    if (
      successor.id === current.id ||
      successor.reviewerId !== input.replacementReviewerId ||
      successor.status === "abstained" ||
      successor.status === "superseded" ||
      !assignmentMatchesScope(successor, scope)
    ) {
      writeConflict("Reviewer assignment replacement is outside its target scope.");
    }
    const supersededAt = successor.updatedAt;
    const replaced: EvaluationAssignment = {
      ...current,
      status: "superseded",
      successorAssignmentId: successor.id,
      supersededReason: input.reason,
      lineage: {
        predecessorAssignmentId: current.predecessorAssignmentId ?? null,
        successorAssignmentId: successor.id,
        reason: input.reason,
        supersededAt,
      },
      version: current.version + 1,
      updatedAt: supersededAt,
    };
    const next: EvaluationAssignment = {
      ...successor,
      predecessorAssignmentId: current.id,
      successorAssignmentId: null,
      supersededReason: null,
      lineage: {
        predecessorAssignmentId: current.id,
        successorAssignmentId: null,
        reason: input.reason,
        supersededAt,
      },
    };
    await atomic(
      this.database,
      [
        guard(
          this.database,
          `EXISTS (SELECT 1 FROM review_assignments
                    WHERE organization_id = ? AND event_id = ? AND plan_id = ? AND round_id = ?
                      AND submission_id = ? AND id = ? AND version = ? AND status <> 'superseded')
           AND NOT EXISTS (SELECT 1 FROM review_assignments WHERE organization_id = ? AND id = ?)`,
          [
            scope.tenantId,
            scope.eventId,
            scope.planId,
            scope.roundId,
            current.submissionId,
            current.id,
            input.expectedAssignmentVersion,
            scope.tenantId,
            next.id,
          ],
        ),
        insertAssignment(this.database, next),
        updateAssignment(this.database, replaced),
      ],
      "Reviewer assignment changed since it was loaded.",
    );
    const resultScope = { ...scope, submissionId: scope.submissionId ?? current.submissionId };
    const [activeAssignments, history] = await Promise.all([
      this.activeAssignments(resultScope),
      this.reviewHistory([replaced]),
    ]);
    return {
      scope: resultScope,
      replacedAssignment: replaced,
      successorAssignment: next,
      activeAssignments,
      history,
    };
  }

  async applyAssignmentDistribution(
    scope: EvaluationAssignmentScope,
    input: EvaluationAssignmentDistributionInput,
  ): Promise<EvaluationAssignmentDistributionResult> {
    if (input.reason.trim().length === 0) writeConflict("A distribution reason is required.");
    const expected = new Map<string, number>();
    for (const item of input.expectedActiveVersions) {
      if (expected.has(item.assignmentId))
        writeConflict("Expected reviewer assignment versions must be unique.");
      expected.set(item.assignmentId, item.version);
    }
    const desiredIds = new Set<string>();
    for (const assignment of input.assignments) {
      if (
        desiredIds.has(assignment.id) ||
        !assignmentMatchesScope(assignment, scope) ||
        assignment.status === "abstained" ||
        assignment.status === "superseded"
      ) {
        writeConflict("Reviewer assignment distribution is outside its target scope.");
      }
      desiredIds.add(assignment.id);
    }
    const allScoped = await this.assignmentQuery(
      `organization_id = ? AND event_id = ? AND plan_id = ? AND round_id = ?${
        scope.planVersion === undefined ? "" : " AND plan_version = ?"
      } ORDER BY id`,
      scope.planVersion === undefined
        ? [scope.tenantId, scope.eventId, scope.planId, scope.roundId]
        : [scope.tenantId, scope.eventId, scope.planId, scope.roundId, scope.planVersion],
    );
    const targetSubmissionIds = new Set(input.assignments.map((item) => item.submissionId));
    for (const id of expected.keys()) {
      const found = allScoped.find((item) => item.id === id);
      if (found !== undefined) targetSubmissionIds.add(found.submissionId);
    }
    const active = allScoped.filter(
      (item) =>
        targetSubmissionIds.has(item.submissionId) &&
        item.status !== "superseded" &&
        item.status !== "abstained",
    );
    if (
      active.length !== expected.size ||
      active.some((item) => expected.get(item.id) !== item.version)
    ) {
      writeConflict("Reviewer assignments changed since the distribution was previewed.");
    }
    const existingById = new Map(allScoped.map((item) => [item.id, item]));
    for (const desired of input.assignments) {
      const existing = await this.getAssignment(scope.tenantId, desired.id);
      if (
        existing !== null &&
        (!assignmentMatchesScope(existing, scope) ||
          existing.status === "abstained" ||
          existing.status === "superseded" ||
          existing.reviewerId !== desired.reviewerId ||
          existing.version !== desired.version)
      ) {
        writeConflict("A reviewer assignment changed since the distribution was previewed.");
      }
      if (existing !== null) existingById.set(existing.id, existing);
    }
    const supersededAt = input.assignments[0]?.updatedAt ?? active[0]?.updatedAt ?? "";
    const supersededAssignments = active
      .filter((item) => !desiredIds.has(item.id))
      .map(
        (item): EvaluationAssignment => ({
          ...item,
          status: "superseded",
          successorAssignmentId: null,
          supersededReason: input.reason,
          lineage: {
            predecessorAssignmentId: item.predecessorAssignmentId ?? null,
            successorAssignmentId: null,
            reason: input.reason,
            supersededAt,
          },
          version: item.version + 1,
          updatedAt: supersededAt,
        }),
      );
    const nextAssignments = input.assignments.map((item) => ({
      ...existingById.get(item.id),
      ...item,
      predecessorAssignmentId:
        item.predecessorAssignmentId ?? existingById.get(item.id)?.predecessorAssignmentId ?? null,
      successorAssignmentId:
        item.successorAssignmentId ?? existingById.get(item.id)?.successorAssignmentId ?? null,
      supersededReason:
        item.supersededReason ?? existingById.get(item.id)?.supersededReason ?? null,
      lineage: item.lineage ?? existingById.get(item.id)?.lineage,
    }));
    const expectedPredicate =
      input.expectedActiveVersions.length === 0
        ? "0"
        : input.expectedActiveVersions.map(() => "(id = ? AND version = ?)").join(" OR ");
    const targetPredicate =
      targetSubmissionIds.size === 0 ? "0" : [...targetSubmissionIds].map(() => "?").join(", ");
    const commands: D1PreparedStatement[] = [
      guard(
        this.database,
        `(SELECT COUNT(*) FROM review_assignments
           WHERE organization_id = ? AND event_id = ? AND plan_id = ? AND round_id = ?
             ${scope.planVersion === undefined ? "" : "AND plan_version = ?"}
             AND submission_id IN (${targetPredicate})
             AND status NOT IN ('superseded', 'abstained')) = ?
         AND (SELECT COUNT(*) FROM review_assignments
           WHERE organization_id = ? AND event_id = ? AND plan_id = ? AND round_id = ?
             AND (${expectedPredicate}) AND status NOT IN ('superseded', 'abstained')) = ?`,
        [
          scope.tenantId,
          scope.eventId,
          scope.planId,
          scope.roundId,
          ...(scope.planVersion === undefined ? [] : [scope.planVersion]),
          ...targetSubmissionIds,
          expected.size,
          scope.tenantId,
          scope.eventId,
          scope.planId,
          scope.roundId,
          ...input.expectedActiveVersions.flatMap((item) => [item.assignmentId, item.version]),
          expected.size,
        ],
      ),
    ];
    for (const item of supersededAssignments) commands.push(updateAssignment(this.database, item));
    for (const item of nextAssignments) {
      commands.push(
        existingById.has(item.id)
          ? updateAssignment(this.database, item)
          : insertAssignment(this.database, item),
      );
    }
    await atomic(
      this.database,
      commands,
      "Reviewer assignments changed since the distribution was previewed.",
    );
    const activeAssignments = (await this.activeAssignments(scope)).filter((item) =>
      targetSubmissionIds.has(item.submissionId),
    );
    return {
      scope,
      activeAssignments,
      supersededAssignments,
      history: await this.reviewHistory(supersededAssignments),
    };
  }

  async getReview(tenantId: string, assignmentId: string) {
    const row = await statement(
      this.database,
      "SELECT * FROM evaluation_reviews WHERE organization_id = ? AND assignment_id = ?",
      [tenantId, assignmentId],
    ).first<Row>();
    return row === null ? null : this.hydrateReview(row);
  }

  async listReviews(tenantId: string, planId: string) {
    return this.reviewQuery("organization_id = ? AND plan_id = ? ORDER BY id", [tenantId, planId]);
  }

  async getSuggestion(tenantId: string, suggestionId: string) {
    const row = await statement(
      this.database,
      "SELECT * FROM evaluation_suggestions WHERE organization_id = ? AND id = ?",
      [tenantId, suggestionId],
    ).first<Row>();
    return row === null ? null : this.hydrateSuggestion(row);
  }

  async listSuggestions(tenantId: string, planId: string) {
    const result = await statement(
      this.database,
      "SELECT * FROM evaluation_suggestions WHERE organization_id = ? AND plan_id = ? ORDER BY id",
      [tenantId, planId],
    ).all<Row>();
    return Promise.all(rows(result).map((row) => this.hydrateSuggestion(row)));
  }

  async putSuggestion(suggestion: EvaluationSuggestion, expectedVersion: number | null) {
    await atomic(
      this.database,
      this.suggestionStatements(suggestion, expectedVersion),
      "Suggestion changed since it was loaded.",
    );
  }

  async resolveSuggestion(
    suggestion: EvaluationSuggestion,
    expectedSuggestionVersion: number,
    assignment: EvaluationAssignment | null,
    expectedAssignmentVersion: number | null,
    review: EvaluationReview | null,
    expectedReviewVersion: number | null,
  ): Promise<EvaluationSuggestionResolution> {
    if (
      (assignment !== null &&
        (assignment.tenantId !== suggestion.tenantId ||
          assignment.id !== suggestion.assignmentId)) ||
      (review !== null &&
        (review.tenantId !== suggestion.tenantId ||
          review.assignmentId !== suggestion.assignmentId))
    ) {
      writeConflict("Suggestion resolution targeted another assignment.");
    }
    const commands = [...this.suggestionStatements(suggestion, expectedSuggestionVersion)];
    if (assignment !== null) {
      commands.push(
        expectedAssignmentVersion === null
          ? insertGuard(this.database, "review_assignments", "organization_id = ? AND id = ?", [
              assignment.tenantId,
              assignment.id,
            ])
          : updateGuard(
              this.database,
              "review_assignments",
              "organization_id = ? AND id = ? AND version = ?",
              [assignment.tenantId, assignment.id, expectedAssignmentVersion],
            ),
        expectedAssignmentVersion === null
          ? insertAssignment(this.database, assignment)
          : updateAssignment(this.database, assignment),
      );
    }
    if (review !== null) commands.push(...this.reviewStatements(review, expectedReviewVersion));
    await atomic(this.database, commands, "Suggestion resolution changed since it was loaded.");
    return { suggestion, review };
  }

  async listReviewerWorkspaceRecords(
    tenantId: string,
    reviewerId: string,
    eventIds: readonly string[],
  ): Promise<ReviewerWorkspaceRecords> {
    if (eventIds.length === 0) return { assignments: [], reviews: [] };
    const placeholders = eventIds.map(() => "?").join(", ");
    const assignments = await this.assignmentQuery(
      `organization_id = ? AND reviewer_id = ? AND event_id IN (${placeholders}) AND status <> 'superseded' ORDER BY id`,
      [tenantId, reviewerId, ...eventIds],
    );
    if (assignments.length === 0) return { assignments, reviews: [] };
    const ids = assignments.map((item) => item.id);
    const reviews = await this.reviewQuery(
      `organization_id = ? AND reviewer_id = ? AND event_id IN (${placeholders}) AND assignment_id IN (${ids.map(() => "?").join(", ")}) ORDER BY id`,
      [tenantId, reviewerId, ...eventIds, ...ids],
    );
    return { assignments, reviews };
  }

  async listOrganizerWorkspaceRecords(
    tenantId: string,
    eventId: string,
  ): Promise<OrganizerWorkspaceRecords> {
    const [assignments, reviews, decisions] = await Promise.all([
      this.assignmentQuery(
        "organization_id = ? AND event_id = ? AND status <> 'superseded' ORDER BY id",
        [tenantId, eventId],
      ),
      this.reviewQuery("organization_id = ? AND event_id = ? ORDER BY id", [tenantId, eventId]),
      this.decisionQuery("organization_id = ? AND event_id = ? ORDER BY id", [tenantId, eventId]),
    ]);
    return { assignments, reviews, decisions };
  }

  async putReview(review: EvaluationReview, expectedVersion: number | null) {
    await atomic(
      this.database,
      this.reviewStatements(review, expectedVersion),
      "Review changed since it was loaded.",
    );
  }

  async saveReviewDraft(
    assignment: EvaluationAssignment,
    expectedAssignmentVersion: number,
    review: EvaluationReview,
    expectedReviewVersion: number | null,
  ) {
    this.assertReviewAssignment(assignment, review);
    await atomic(
      this.database,
      [
        updateGuard(
          this.database,
          "review_assignments",
          "organization_id = ? AND event_id = ? AND id = ? AND version = ?",
          [assignment.tenantId, assignment.eventId, assignment.id, expectedAssignmentVersion],
        ),
        ...this.reviewStatements(review, expectedReviewVersion),
        updateAssignment(this.database, assignment),
      ],
      "Assignment or review changed since it was loaded.",
    );
  }

  async getConflict(tenantId: string, assignmentId: string) {
    const row = await statement(
      this.database,
      "SELECT * FROM evaluation_conflicts WHERE organization_id = ? AND assignment_id = ?",
      [tenantId, assignmentId],
    ).first<Row>();
    return row === null ? null : this.conflictFromRow(row);
  }

  async abstainAssignment(
    assignment: EvaluationAssignment,
    expectedAssignmentVersion: number,
    declaration: EvaluationConflictDeclaration,
  ) {
    if (
      declaration.tenantId !== assignment.tenantId ||
      declaration.eventId !== assignment.eventId ||
      declaration.assignmentId !== assignment.id ||
      declaration.planId !== assignment.planId ||
      declaration.submissionId !== assignment.submissionId ||
      declaration.reviewerId !== assignment.reviewerId
    )
      writeConflict("Conflict declaration targeted another assignment.");
    await atomic(
      this.database,
      [
        guard(
          this.database,
          `EXISTS (SELECT 1 FROM review_assignments WHERE organization_id = ? AND event_id = ? AND id = ? AND version = ?)
          AND NOT EXISTS (SELECT 1 FROM evaluation_conflicts WHERE organization_id = ? AND event_id = ? AND assignment_id = ?)`,
          [
            assignment.tenantId,
            assignment.eventId,
            assignment.id,
            expectedAssignmentVersion,
            declaration.tenantId,
            declaration.eventId,
            declaration.assignmentId,
          ],
        ),
        updateAssignment(this.database, assignment),
        statement(
          this.database,
          `INSERT INTO evaluation_conflicts
          (id, organization_id, event_id, plan_id, assignment_id, submission_id, reviewer_id, reason, declared_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            declaration.id,
            declaration.tenantId,
            declaration.eventId,
            declaration.planId,
            declaration.assignmentId,
            declaration.submissionId,
            declaration.reviewerId,
            declaration.reason,
            declaration.declaredAt,
          ],
        ),
      ],
      "Assignment changed or a conflict was already declared.",
    );
  }

  async submitReview(
    assignment: EvaluationAssignment,
    expectedAssignmentVersion: number,
    review: EvaluationReview,
    expectedReviewVersion: number,
  ) {
    this.assertReviewAssignment(assignment, review);
    await atomic(
      this.database,
      [
        updateGuard(
          this.database,
          "review_assignments",
          "organization_id = ? AND event_id = ? AND id = ? AND version = ?",
          [assignment.tenantId, assignment.eventId, assignment.id, expectedAssignmentVersion],
        ),
        ...this.reviewStatements(review, expectedReviewVersion),
        updateAssignment(this.database, assignment),
      ],
      "Assignment or review changed since it was loaded.",
    );
  }

  async getDecision(tenantId: string, planId: string, submissionId: string) {
    const decisions = await this.decisionQuery(
      "organization_id = ? AND plan_id = ? AND submission_id = ?",
      [tenantId, planId, submissionId],
    );
    return decisions[0] ?? null;
  }

  async putDecision(decision: EvaluationDecision, expectedVersion: number | null) {
    const commands: D1PreparedStatement[] = [
      expectedVersion === null
        ? insertGuard(
            this.database,
            "evaluation_decisions",
            "organization_id = ? AND plan_id = ? AND submission_id = ?",
            [decision.tenantId, decision.planId, decision.submissionId],
          )
        : updateGuard(
            this.database,
            "evaluation_decisions",
            "organization_id = ? AND event_id = ? AND plan_id = ? AND submission_id = ? AND version = ?",
            [
              decision.tenantId,
              decision.eventId,
              decision.planId,
              decision.submissionId,
              expectedVersion,
            ],
          ),
    ];
    if (expectedVersion === null) {
      commands.push(
        statement(
          this.database,
          `INSERT INTO evaluation_decisions
        (id, organization_id, event_id, plan_id, submission_id, status, version, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            decision.id,
            decision.tenantId,
            decision.eventId,
            decision.planId,
            decision.submissionId,
            decision.status,
            decision.version,
            decision.updatedAt,
          ],
        ),
      );
    } else {
      commands.push(
        statement(
          this.database,
          `UPDATE evaluation_decisions SET status = ?, version = ?, updated_at = ?
        WHERE organization_id = ? AND event_id = ? AND plan_id = ? AND submission_id = ? AND version = ?`,
          [
            decision.status,
            decision.version,
            decision.updatedAt,
            decision.tenantId,
            decision.eventId,
            decision.planId,
            decision.submissionId,
            expectedVersion,
          ],
        ),
      );
    }
    commands.push(
      statement(
        this.database,
        "DELETE FROM evaluation_decision_transitions WHERE organization_id = ? AND event_id = ? AND decision_id = ?",
        [decision.tenantId, decision.eventId, decision.id],
      ),
    );
    decision.history.forEach((item, index) => {
      commands.push(
        statement(
          this.database,
          `INSERT INTO evaluation_decision_transitions
          (organization_id, event_id, decision_id, ordinal, from_status, to_status, reason, decided_by, decided_at, idempotency_key)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            decision.tenantId,
            decision.eventId,
            decision.id,
            index,
            item.from,
            item.to,
            item.reason,
            item.decidedBy,
            item.decidedAt,
            item.idempotencyKey,
          ],
        ),
      );
    });
    await atomic(this.database, commands, "Decision changed since it was loaded.");
  }

  private async hydratePlan(row: Row): Promise<EvaluationPlan> {
    const tenantId = text(row.organization_id);
    const eventId = text(row.event_id);
    const planId = text(row.id);
    const roundResult = await statement(
      this.database,
      `SELECT * FROM review_rounds
      WHERE organization_id = ? AND event_id = ? AND plan_id = ? ORDER BY sequence, revision`,
      [tenantId, eventId, planId],
    ).all<Row>();
    const latest = new Map<string, Row>();
    for (const round of rows(roundResult)) latest.set(text(round.id), round);
    const rounds = await Promise.all([...latest.values()].map((round) => this.hydrateRound(round)));
    const fieldIds = parseJson<string[]>(text(row.reviewer_projection_field_ids_json), []);
    const fileIds = parseJson<string[]>(text(row.reviewer_projection_file_ids_json), []);
    return {
      id: planId,
      tenantId,
      eventId,
      name: text(row.name),
      status: row.status as EvaluationPlan["status"],
      blindReview: bool(row.blind_review),
      closesAt: nullableText(row.closes_at),
      assignmentRule: {
        reviewsPerSubmission: numberValue(row.reviews_per_submission),
        maxAssignmentsPerReviewer: numberValue(row.max_assignments_per_reviewer),
        ...(row.track_filter == null ? {} : { trackFilter: text(row.track_filter) }),
        autoDistribute: bool(row.auto_distribute),
      },
      rounds: rounds.sort((left, right) => left.sequence - right.sequence),
      reviewerProjection: { fieldIds, fileIds },
      gradingRevision: optionalNumber(row.grading_revision),
      gradingLockedAt: nullableText(row.grading_locked_at),
      version: numberValue(row.version),
      createdAt: text(row.created_at),
      updatedAt: text(row.updated_at),
    };
  }

  private async hydrateRound(row: Row): Promise<ReviewRound> {
    const keys = [
      text(row.organization_id),
      text(row.event_id),
      text(row.plan_id),
      text(row.rubric_id),
      numberValue(row.rubric_revision),
    ] as const;
    const [rubricRow, criteriaResult, poolRow] = await Promise.all([
      statement(
        this.database,
        `SELECT * FROM review_rubrics WHERE organization_id = ? AND event_id = ? AND plan_id = ? AND id = ? AND revision = ?`,
        keys,
      ).first<Row>(),
      statement(
        this.database,
        `SELECT * FROM review_criteria WHERE organization_id = ? AND event_id = ? AND plan_id = ? AND rubric_id = ? AND rubric_revision = ? ORDER BY sort_order`,
        keys,
      ).all<Row>(),
      statement(
        this.database,
        `SELECT * FROM reviewer_pools WHERE organization_id = ? AND event_id = ? AND round_id = ? AND round_revision = ?`,
        [text(row.organization_id), text(row.event_id), text(row.id), numberValue(row.revision)],
      ).first<Row>(),
    ]);
    const criteria = await Promise.all(
      rows(criteriaResult).map((criterion) => this.hydrateCriterion(criterion)),
    );
    let reviewerPool: ReviewRound["reviewerPool"];
    if (poolRow !== null) {
      const members = await statement(
        this.database,
        `SELECT reviewer_id FROM reviewer_pool_members WHERE organization_id = ? AND event_id = ? AND pool_id = ? ORDER BY reviewer_id`,
        [text(poolRow.organization_id), text(poolRow.event_id), text(poolRow.id)],
      ).all<Row>();
      reviewerPool = {
        reviewerIds: rows(members).map((member) => text(member.reviewer_id)),
        ...(poolRow.name == null ? {} : { name: text(poolRow.name) }),
      };
    }
    return {
      id: text(row.id),
      name: text(row.name),
      sequence: numberValue(row.sequence),
      revision: numberValue(row.revision),
      rubricRevision: numberValue(row.rubric_revision),
      opensAt: nullableText(row.opens_at),
      closesAt: nullableText(row.closes_at),
      blindReview: bool(row.blind_review),
      anonymization: row.anonymization as ReviewRound["anonymization"],
      ...(row.track_filter == null ? {} : { trackFilter: text(row.track_filter) }),
      ...(reviewerPool === undefined ? {} : { reviewerPool }),
      rubric: {
        id: text(row.rubric_id),
        name: rubricRow === null ? text(row.rubric_id) : text(rubricRow.name),
        criteria,
      },
    };
  }

  private async hydrateCriterion(row: Row): Promise<RubricCriterion> {
    const options = await statement(
      this.database,
      `SELECT * FROM review_criterion_options
      WHERE organization_id = ? AND event_id = ? AND plan_id = ? AND rubric_id = ? AND rubric_revision = ? AND criterion_id = ? ORDER BY sort_order`,
      [
        text(row.organization_id),
        text(row.event_id),
        text(row.plan_id),
        text(row.rubric_id),
        numberValue(row.rubric_revision),
        text(row.id),
      ],
    ).all<Row>();
    return {
      id: text(row.id),
      label: text(row.label),
      description: text(row.description),
      minimum: numberValue(row.minimum),
      maximum: numberValue(row.maximum),
      weight: numberValue(row.weight),
      required: bool(row.required),
      inputType: row.input_type as RubricCriterion["inputType"],
      options: rows(options).map((option) => ({
        id: text(option.id),
        label: text(option.label),
        value: text(option.value),
      })),
    };
  }

  private addRoundStatements(
    commands: D1PreparedStatement[],
    plan: EvaluationPlan,
    round: ReviewRound,
  ) {
    const roundRevision = round.revision ?? 1;
    const rubricRevision = round.rubricRevision ?? roundRevision;
    commands.push(
      statement(
        this.database,
        `INSERT INTO review_rubrics (id, organization_id, event_id, plan_id, revision, name) VALUES (?, ?, ?, ?, ?, ?)`,
        [round.rubric.id, plan.tenantId, plan.eventId, plan.id, rubricRevision, round.rubric.name],
      ),
      statement(
        this.database,
        `INSERT INTO review_rounds
        (id, organization_id, event_id, plan_id, name, sequence, revision, rubric_id, rubric_revision, opens_at, closes_at, blind_review, anonymization, track_filter)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          round.id,
          plan.tenantId,
          plan.eventId,
          plan.id,
          round.name,
          round.sequence,
          roundRevision,
          round.rubric.id,
          rubricRevision,
          round.opensAt ?? null,
          round.closesAt,
          (round.blindReview ?? plan.blindReview) ? 1 : 0,
          round.anonymization ?? ((round.blindReview ?? plan.blindReview) ? "single" : "none"),
          round.trackFilter ?? null,
        ],
      ),
    );
    round.rubric.criteria.forEach((criterion, criterionIndex) => {
      commands.push(
        statement(
          this.database,
          `INSERT INTO review_criteria
        (organization_id, event_id, plan_id, rubric_id, rubric_revision, id, label, description, minimum, maximum, weight, required, input_type, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            plan.tenantId,
            plan.eventId,
            plan.id,
            round.rubric.id,
            rubricRevision,
            criterion.id,
            criterion.label,
            criterion.description,
            criterion.minimum,
            criterion.maximum,
            criterion.weight,
            criterion.required ? 1 : 0,
            criterion.inputType ?? "numeric",
            criterionIndex,
          ],
        ),
      );
      criterion.options?.forEach((option, optionIndex) => {
        commands.push(
          statement(
            this.database,
            `INSERT INTO review_criterion_options
        (organization_id, event_id, plan_id, rubric_id, rubric_revision, criterion_id, id, label, value, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              plan.tenantId,
              plan.eventId,
              plan.id,
              round.rubric.id,
              rubricRevision,
              criterion.id,
              option.id ?? `${criterion.id}-option-${optionIndex + 1}`,
              option.label,
              option.value,
              optionIndex,
            ],
          ),
        );
      });
    });
    if (round.reviewerPool !== undefined) {
      const poolId = `${plan.id}:${round.id}:r${roundRevision}`;
      commands.push(
        statement(
          this.database,
          `INSERT INTO reviewer_pools
        (id, organization_id, event_id, round_id, round_revision, name, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          [
            poolId,
            plan.tenantId,
            plan.eventId,
            round.id,
            roundRevision,
            round.reviewerPool.name ?? null,
            plan.updatedAt,
            plan.updatedAt,
          ],
        ),
      );
      for (const reviewerId of stableSort(round.reviewerPool.reviewerIds, (value) => value))
        commands.push(
          statement(
            this.database,
            `INSERT INTO reviewer_pool_members (organization_id, event_id, pool_id, reviewer_id) VALUES (?, ?, ?, ?)`,
            [plan.tenantId, plan.eventId, poolId, reviewerId],
          ),
        );
    }
  }

  private async assignmentQuery(where: string, values: readonly D1Value[]) {
    const result = await statement(
      this.database,
      `SELECT * FROM review_assignments WHERE ${where}`,
      values,
    ).all<Row>();
    return rows(result).map(assignmentFromRow);
  }

  private async activeAssignments(scope: EvaluationAssignmentScope) {
    return this.assignmentQuery(
      `organization_id = ? AND event_id = ? AND plan_id = ? AND round_id = ?${scope.submissionId === undefined ? "" : " AND submission_id = ?"}${scope.planVersion === undefined ? "" : " AND plan_version = ?"} AND status <> 'superseded' ORDER BY id`,
      [
        scope.tenantId,
        scope.eventId,
        scope.planId,
        scope.roundId,
        ...(scope.submissionId === undefined ? [] : [scope.submissionId]),
        ...(scope.planVersion === undefined ? [] : [scope.planVersion]),
      ],
    );
  }

  private reviewStatements(
    review: EvaluationReview,
    expectedVersion: number | null,
  ): D1PreparedStatement[] {
    const commands: D1PreparedStatement[] = [
      expectedVersion === null
        ? insertGuard(
            this.database,
            "evaluation_reviews",
            "organization_id = ? AND assignment_id = ?",
            [review.tenantId, review.assignmentId],
          )
        : updateGuard(
            this.database,
            "evaluation_reviews",
            "organization_id = ? AND event_id = ? AND assignment_id = ? AND version = ?",
            [review.tenantId, review.eventId, review.assignmentId, expectedVersion],
          ),
    ];
    const revisions = [
      review.planRevision ?? review.planVersion ?? 1,
      review.roundRevision ?? review.rubricRevision ?? review.rubricVersion ?? 1,
      review.rubricRevision ?? review.rubricVersion ?? 1,
      review.submissionRevision ?? review.submissionVersion ?? 1,
    ];
    if (expectedVersion === null)
      commands.push(
        statement(
          this.database,
          `INSERT INTO evaluation_reviews
      (id, organization_id, event_id, plan_id, round_id, assignment_id, submission_id, reviewer_id, comment, submitted_at, plan_revision, round_revision, rubric_revision, submission_revision, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            review.id,
            review.tenantId,
            review.eventId,
            review.planId,
            review.roundId,
            review.assignmentId,
            review.submissionId,
            review.reviewerId,
            review.comment,
            review.submittedAt,
            ...revisions,
            review.version,
            review.createdAt,
            review.updatedAt,
          ],
        ),
      );
    else
      commands.push(
        statement(
          this.database,
          `UPDATE evaluation_reviews SET comment = ?, submitted_at = ?, plan_revision = ?, round_revision = ?, rubric_revision = ?, submission_revision = ?, version = ?, updated_at = ?
      WHERE organization_id = ? AND event_id = ? AND assignment_id = ? AND version = ?`,
          [
            review.comment,
            review.submittedAt,
            ...revisions,
            review.version,
            review.updatedAt,
            review.tenantId,
            review.eventId,
            review.assignmentId,
            expectedVersion,
          ],
        ),
      );
    commands.push(
      statement(
        this.database,
        "DELETE FROM evaluation_scores WHERE organization_id = ? AND event_id = ? AND review_id = ?",
        [review.tenantId, review.eventId, review.id],
      ),
    );
    for (const [criterionId, score] of Object.entries(review.scores).sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      commands.push(
        statement(
          this.database,
          `INSERT INTO evaluation_scores
        (organization_id, event_id, review_id, criterion_id, value_number, value_text, origin, human_confirmed_by, suggestion_id, suggestion_status, rubric_revision, submission_revision, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            review.tenantId,
            review.eventId,
            review.id,
            criterionId,
            typeof score.value === "number" ? score.value : null,
            typeof score.value === "string" ? score.value : null,
            score.origin,
            score.humanConfirmedBy,
            score.suggestionId ?? null,
            score.suggestionStatus ?? null,
            score.rubricRevision ?? score.rubricVersion ?? revisions[2] ?? 1,
            score.submissionRevision ?? score.submissionVersion ?? revisions[3] ?? 1,
            score.updatedAt,
          ],
        ),
      );
      score.evidence.forEach((evidence, index) => {
        commands.push(
          statement(
            this.database,
            `INSERT INTO evaluation_score_evidence (organization_id, event_id, review_id, criterion_id, ordinal, evidence) VALUES (?, ?, ?, ?, ?, ?)`,
            [review.tenantId, review.eventId, review.id, criterionId, index, evidence],
          ),
        );
      });
    }
    return commands;
  }

  private async hydrateReview(row: Row): Promise<EvaluationReview> {
    const scoreResult = await statement(
      this.database,
      `SELECT * FROM evaluation_scores WHERE organization_id = ? AND event_id = ? AND review_id = ? ORDER BY criterion_id`,
      [text(row.organization_id), text(row.event_id), text(row.id)],
    ).all<Row>();
    const scores: Record<string, RubricScore> = {};
    for (const score of rows(scoreResult)) {
      const evidenceResult = await statement(
        this.database,
        `SELECT evidence FROM evaluation_score_evidence WHERE organization_id = ? AND event_id = ? AND review_id = ? AND criterion_id = ? ORDER BY ordinal`,
        [text(row.organization_id), text(row.event_id), text(row.id), text(score.criterion_id)],
      ).all<Row>();
      scores[text(score.criterion_id)] = {
        criterionId: text(score.criterion_id),
        value:
          score.value_number == null ? text(score.value_text) : numberValue(score.value_number),
        origin: score.origin as RubricScore["origin"],
        evidence: rows(evidenceResult).map((item) => text(item.evidence)),
        humanConfirmedBy: nullableText(score.human_confirmed_by),
        ...(score.suggestion_id == null ? {} : { suggestionId: text(score.suggestion_id) }),
        ...(score.suggestion_status == null
          ? {}
          : {
              suggestionStatus: score.suggestion_status as NonNullable<
                RubricScore["suggestionStatus"]
              >,
            }),
        rubricRevision: numberValue(score.rubric_revision),
        submissionRevision: numberValue(score.submission_revision),
        updatedAt: text(score.updated_at),
      };
    }
    return {
      id: text(row.id),
      tenantId: text(row.organization_id),
      eventId: text(row.event_id),
      planId: text(row.plan_id),
      roundId: text(row.round_id),
      assignmentId: text(row.assignment_id),
      submissionId: text(row.submission_id),
      reviewerId: text(row.reviewer_id),
      scores,
      comment: text(row.comment),
      submittedAt: nullableText(row.submitted_at),
      version: numberValue(row.version),
      planRevision: numberValue(row.plan_revision),
      roundRevision: numberValue(row.round_revision),
      rubricRevision: numberValue(row.rubric_revision),
      submissionRevision: numberValue(row.submission_revision),
      createdAt: text(row.created_at),
      updatedAt: text(row.updated_at),
    };
  }

  private async reviewQuery(where: string, values: readonly D1Value[]) {
    const result = await statement(
      this.database,
      `SELECT * FROM evaluation_reviews WHERE ${where}`,
      values,
    ).all<Row>();
    return Promise.all(rows(result).map((row) => this.hydrateReview(row)));
  }

  private suggestionStatements(
    suggestion: EvaluationSuggestion,
    expectedVersion: number | null,
  ): D1PreparedStatement[] {
    const commands: D1PreparedStatement[] = [
      expectedVersion === null
        ? insertGuard(this.database, "evaluation_suggestions", "organization_id = ? AND id = ?", [
            suggestion.tenantId,
            suggestion.id,
          ])
        : updateGuard(
            this.database,
            "evaluation_suggestions",
            "organization_id = ? AND event_id = ? AND id = ? AND version = ?",
            [suggestion.tenantId, suggestion.eventId, suggestion.id, expectedVersion],
          ),
    ];
    const provenanceJson = json(suggestion.provenance);
    if (expectedVersion === null)
      commands.push(
        statement(
          this.database,
          `INSERT INTO evaluation_suggestions
      (id, organization_id, event_id, plan_id, round_id, assignment_id, submission_id, reviewer_id, plan_revision, rubric_revision, submission_revision, rubric_id, provider, model, prompt_version, generated_at, source_references_json, provenance_json, status, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            suggestion.id,
            suggestion.tenantId,
            suggestion.eventId,
            suggestion.planId,
            suggestion.roundId,
            suggestion.assignmentId,
            suggestion.submissionId,
            suggestion.reviewerId,
            suggestion.planRevision ?? suggestion.rubricRevision,
            suggestion.rubricRevision,
            suggestion.submissionRevision,
            suggestion.rubricId ?? null,
            suggestion.provenance.provider,
            suggestion.provenance.model,
            suggestion.provenance.promptVersion ?? "unknown",
            suggestion.provenance.generatedAt,
            json(suggestion.provenance.sourceReferences),
            provenanceJson,
            suggestion.status,
            suggestion.version,
            suggestion.createdAt,
            suggestion.updatedAt,
          ],
        ),
      );
    else
      commands.push(
        statement(
          this.database,
          `UPDATE evaluation_suggestions SET status = ?, version = ?, provenance_json = ?, updated_at = ? WHERE organization_id = ? AND event_id = ? AND id = ? AND version = ?`,
          [
            suggestion.status,
            suggestion.version,
            provenanceJson,
            suggestion.updatedAt,
            suggestion.tenantId,
            suggestion.eventId,
            suggestion.id,
            expectedVersion,
          ],
        ),
      );
    commands.push(
      statement(
        this.database,
        "DELETE FROM evaluation_suggestion_candidates WHERE organization_id = ? AND event_id = ? AND suggestion_id = ?",
        [suggestion.tenantId, suggestion.eventId, suggestion.id],
      ),
      statement(
        this.database,
        "DELETE FROM evaluation_suggestion_history WHERE organization_id = ? AND event_id = ? AND suggestion_id = ?",
        [suggestion.tenantId, suggestion.eventId, suggestion.id],
      ),
    );
    suggestion.criterionCandidates.forEach((candidate, index) => {
      commands.push(
        statement(
          this.database,
          `INSERT INTO evaluation_suggestion_candidates
          (organization_id, event_id, suggestion_id, id, criterion_id, value, evidence_json, provenance_json, ordinal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            suggestion.tenantId,
            suggestion.eventId,
            suggestion.id,
            candidate.id,
            candidate.criterionId,
            candidate.value,
            json(candidate.evidence),
            json(candidate.provenance),
            index,
          ],
        ),
      );
    });
    suggestion.history.forEach((item, index) => {
      commands.push(
        statement(
          this.database,
          `INSERT INTO evaluation_suggestion_history
          (organization_id, event_id, suggestion_id, ordinal, action, actor_id, at, reason, values_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            suggestion.tenantId,
            suggestion.eventId,
            suggestion.id,
            index,
            item.action,
            item.actorId,
            item.at,
            item.reason ?? null,
            item.valueByCriterion === undefined ? null : json(item.valueByCriterion),
          ],
        ),
      );
    });
    return commands;
  }

  private async hydrateSuggestion(row: Row): Promise<EvaluationSuggestion> {
    const [candidateResult, historyResult] = await Promise.all([
      statement(
        this.database,
        `SELECT * FROM evaluation_suggestion_candidates WHERE organization_id = ? AND event_id = ? AND suggestion_id = ? ORDER BY ordinal`,
        [text(row.organization_id), text(row.event_id), text(row.id)],
      ).all<Row>(),
      statement(
        this.database,
        `SELECT * FROM evaluation_suggestion_history WHERE organization_id = ? AND event_id = ? AND suggestion_id = ? ORDER BY ordinal`,
        [text(row.organization_id), text(row.event_id), text(row.id)],
      ).all<Row>(),
    ]);
    const candidates: EvaluationSuggestionCandidate[] = rows(candidateResult).map((item) => ({
      id: text(item.id),
      criterionId: text(item.criterion_id),
      value: numberValue(item.value),
      evidence: parseJson<string[]>(text(item.evidence_json), []),
      provenance: parseJson(text(item.provenance_json), {
        provider: text(row.provider),
        model: text(row.model),
        generatedAt: text(row.generated_at),
        sourceReferences: [],
      }),
    }));
    const history: EvaluationSuggestionAuditEntry[] = rows(historyResult).map((item) => ({
      action: item.action as EvaluationSuggestionAuditEntry["action"],
      actorId: nullableText(item.actor_id),
      at: text(item.at),
      ...(item.reason == null ? {} : { reason: text(item.reason) }),
      ...(item.values_json == null
        ? {}
        : { valueByCriterion: parseJson(text(item.values_json), {}) }),
    }));
    const byCriterion: Record<string, EvaluationSuggestionCandidate[]> = {};
    for (const candidate of candidates) {
      const existing = byCriterion[candidate.criterionId];
      if (existing === undefined) {
        byCriterion[candidate.criterionId] = [candidate];
      } else {
        existing.push(candidate);
      }
    }
    const provenance = parseJson(row.provenance_json == null ? "" : text(row.provenance_json), {
      provider: text(row.provider),
      model: text(row.model),
      generatedAt: text(row.generated_at),
      sourceReferences: parseJson<string[]>(text(row.source_references_json), []),
    });
    return {
      id: text(row.id),
      tenantId: text(row.organization_id),
      eventId: text(row.event_id),
      planId: text(row.plan_id),
      roundId: text(row.round_id),
      assignmentId: text(row.assignment_id),
      submissionId: text(row.submission_id),
      reviewerId: text(row.reviewer_id),
      planRevision: numberValue(row.plan_revision),
      rubricRevision: numberValue(row.rubric_revision),
      submissionRevision: numberValue(row.submission_revision),
      ...(row.rubric_id == null ? {} : { rubricId: text(row.rubric_id) }),
      candidates: byCriterion,
      criterionCandidates: candidates,
      provenance,
      status: row.status as EvaluationSuggestion["status"],
      version: numberValue(row.version),
      history,
      audit: history,
      createdAt: text(row.created_at),
      updatedAt: text(row.updated_at),
    };
  }

  private conflictFromRow(row: Row): EvaluationConflictDeclaration {
    return {
      id: text(row.id),
      tenantId: text(row.organization_id),
      eventId: text(row.event_id),
      planId: text(row.plan_id),
      assignmentId: text(row.assignment_id),
      submissionId: text(row.submission_id),
      reviewerId: text(row.reviewer_id),
      reason: text(row.reason),
      declaredAt: text(row.declared_at),
    };
  }

  private async reviewHistory(
    assignments: readonly EvaluationAssignment[],
  ): Promise<readonly EvaluationReviewHistory[]> {
    const history: EvaluationReviewHistory[] = [];
    for (const assignment of assignments) {
      const review = await this.getReview(assignment.tenantId, assignment.id);
      if (review !== null) history.push({ assignment, review });
    }
    return history;
  }

  private assertReviewAssignment(assignment: EvaluationAssignment, review: EvaluationReview) {
    if (
      assignment.tenantId !== review.tenantId ||
      assignment.eventId !== review.eventId ||
      assignment.planId !== review.planId ||
      assignment.roundId !== review.roundId ||
      assignment.id !== review.assignmentId ||
      assignment.submissionId !== review.submissionId ||
      assignment.reviewerId !== review.reviewerId
    )
      writeConflict("Review targeted another assignment.");
  }

  private async decisionQuery(
    where: string,
    values: readonly D1Value[],
  ): Promise<readonly EvaluationDecision[]> {
    const result = await statement(
      this.database,
      `SELECT * FROM evaluation_decisions WHERE ${where}`,
      values,
    ).all<Row>();
    return Promise.all(
      rows(result).map(async (row) => {
        const transitions = await statement(
          this.database,
          `SELECT * FROM evaluation_decision_transitions WHERE organization_id = ? AND event_id = ? AND decision_id = ? ORDER BY ordinal`,
          [text(row.organization_id), text(row.event_id), text(row.id)],
        ).all<Row>();
        const history: EvaluationDecisionTransition[] = rows(transitions).map((item) => ({
          from:
            item.from_status == null
              ? null
              : (item.from_status as EvaluationDecisionTransition["from"]),
          to: item.to_status as EvaluationDecisionTransition["to"],
          reason: text(item.reason),
          decidedBy: text(item.decided_by),
          decidedAt: text(item.decided_at),
          idempotencyKey: text(item.idempotency_key),
        }));
        return {
          id: text(row.id),
          tenantId: text(row.organization_id),
          eventId: text(row.event_id),
          planId: text(row.plan_id),
          submissionId: text(row.submission_id),
          status: row.status as EvaluationDecision["status"],
          version: numberValue(row.version),
          history,
          updatedAt: text(row.updated_at),
        };
      }),
    );
  }
}

export { D1EvaluationRepository as CloudflareEvaluationRepository };
