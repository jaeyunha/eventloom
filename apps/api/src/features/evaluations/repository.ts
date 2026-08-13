import { conflict } from "./errors";
import type {
  EvaluationAssignment,
  EvaluationAssignmentDistributionInput,
  EvaluationAssignmentDistributionResult,
  EvaluationAssignmentReplacementInput,
  EvaluationAssignmentReplacementResult,
  EvaluationAssignmentScope,
  EvaluationConflictDeclaration,
  EvaluationDecision,
  EvaluationPlan,
  EvaluationReview,
  EvaluationReviewHistory,
  EvaluationSuggestion,
  EvaluationSuggestionResolution,
  SubmissionReviewMaterial,
} from "./types";

export interface ReviewerWorkspaceRecords {
  readonly assignments: readonly EvaluationAssignment[];
  readonly reviews: readonly EvaluationReview[];
}
export interface OrganizerWorkspaceRecords {
  readonly assignments: readonly EvaluationAssignment[];
  readonly reviews: readonly EvaluationReview[];
  readonly decisions: readonly EvaluationDecision[];
}

export interface SubmissionReviewLookup {
  readonly eventId: string;
  readonly submissionId: string;
}

export interface EvaluationRepository {
  getPlan(tenantId: string, planId: string): Promise<EvaluationPlan | null>;
  listPlans(tenantId: string, eventId?: string): Promise<readonly EvaluationPlan[]>;
  putPlan(plan: EvaluationPlan, expectedVersion: number | null): Promise<void>;
  getAssignment(tenantId: string, assignmentId: string): Promise<EvaluationAssignment | null>;
  listAssignments(tenantId: string, planId: string): Promise<readonly EvaluationAssignment[]>;
  replaceAssignment(
    scope: EvaluationAssignmentScope,
    input: EvaluationAssignmentReplacementInput,
  ): Promise<EvaluationAssignmentReplacementResult>;
  applyAssignmentDistribution(
    scope: EvaluationAssignmentScope,
    input: EvaluationAssignmentDistributionInput,
  ): Promise<EvaluationAssignmentDistributionResult>;
  getReview(tenantId: string, assignmentId: string): Promise<EvaluationReview | null>;
  listReviews(tenantId: string, planId: string): Promise<readonly EvaluationReview[]>;
  getSuggestion(tenantId: string, suggestionId: string): Promise<EvaluationSuggestion | null>;
  listSuggestions(tenantId: string, planId: string): Promise<readonly EvaluationSuggestion[]>;
  putSuggestion(suggestion: EvaluationSuggestion, expectedVersion: number | null): Promise<void>;
  resolveSuggestion(
    suggestion: EvaluationSuggestion,
    expectedSuggestionVersion: number,
    assignment: EvaluationAssignment | null,
    expectedAssignmentVersion: number | null,
    review: EvaluationReview | null,
    expectedReviewVersion: number | null,
  ): Promise<EvaluationSuggestionResolution>;
  listReviewerWorkspaceRecords(
    tenantId: string,
    reviewerId: string,
    eventIds: readonly string[],
  ): Promise<ReviewerWorkspaceRecords>;
  listOrganizerWorkspaceRecords(
    tenantId: string,
    eventId: string,
  ): Promise<OrganizerWorkspaceRecords>;
  putReview(review: EvaluationReview, expectedVersion: number | null): Promise<void>;
  saveReviewDraft(
    assignment: EvaluationAssignment,
    expectedAssignmentVersion: number,
    review: EvaluationReview,
    expectedReviewVersion: number | null,
  ): Promise<void>;
  getConflict(
    tenantId: string,
    assignmentId: string,
  ): Promise<EvaluationConflictDeclaration | null>;
  abstainAssignment(
    assignment: EvaluationAssignment,
    expectedAssignmentVersion: number,
    declaration: EvaluationConflictDeclaration,
  ): Promise<void>;
  submitReview(
    assignment: EvaluationAssignment,
    expectedAssignmentVersion: number,
    review: EvaluationReview,
    expectedReviewVersion: number,
  ): Promise<void>;
  getDecision(
    tenantId: string,
    planId: string,
    submissionId: string,
  ): Promise<EvaluationDecision | null>;
  putDecision(decision: EvaluationDecision, expectedVersion: number | null): Promise<void>;
}

export interface SubmissionReviewSource {
  getSubmissionForReview(
    tenantId: string,
    eventId: string,
    submissionId: string,
  ): Promise<SubmissionReviewMaterial | null>;
  getSubmissionsForReview(
    tenantId: string,
    lookups: readonly SubmissionReviewLookup[],
  ): Promise<readonly SubmissionReviewMaterial[]>;
}

function storageKey(tenantId: string, id: string): string {
  return `${tenantId}\u0000${id}`;
}

function decisionKey(tenantId: string, planId: string, submissionId: string): string {
  return `${tenantId}\u0000${planId}\u0000${submissionId}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function assertVersion(
  currentVersion: number | null,
  expectedVersion: number | null,
  entityName: string,
): void {
  if (currentVersion !== expectedVersion) {
    throw conflict(`${entityName} changed since it was loaded.`);
  }
}
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

function activeAssignmentsForScope(
  assignments: ReadonlyMap<string, EvaluationAssignment>,
  scope: EvaluationAssignmentScope,
): readonly EvaluationAssignment[] {
  return [...assignments.values()]
    .filter(
      (assignment) =>
        assignmentMatchesScope(assignment, scope) && assignment.status !== "superseded",
    )
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(clone);
}

function reviewHistoryFor(
  reviews: ReadonlyMap<string, EvaluationReview>,
  assignment: EvaluationAssignment,
): readonly EvaluationReviewHistory[] {
  const review = reviews.get(storageKey(assignment.tenantId, assignment.id));
  return review === undefined ? [] : [{ assignment: clone(assignment), review: clone(review) }];
}

export class InMemoryEvaluationRepository implements EvaluationRepository {
  readonly #plans = new Map<string, EvaluationPlan>();
  readonly #assignments = new Map<string, EvaluationAssignment>();
  readonly #reviews = new Map<string, EvaluationReview>();
  readonly #suggestions = new Map<string, EvaluationSuggestion>();
  readonly #conflicts = new Map<string, EvaluationConflictDeclaration>();
  readonly #decisions = new Map<string, EvaluationDecision>();

  async getPlan(tenantId: string, planId: string): Promise<EvaluationPlan | null> {
    const plan = this.#plans.get(storageKey(tenantId, planId));
    return plan === undefined ? null : clone(plan);
  }
  async listPlans(tenantId: string, eventId?: string): Promise<readonly EvaluationPlan[]> {
    return [...this.#plans.values()]
      .filter(
        (plan) => plan.tenantId === tenantId && (eventId === undefined || plan.eventId === eventId),
      )
      .map(clone);
  }

  async putPlan(plan: EvaluationPlan, expectedVersion: number | null): Promise<void> {
    const key = storageKey(plan.tenantId, plan.id);
    assertVersion(this.#plans.get(key)?.version ?? null, expectedVersion, "Evaluation plan");
    this.#plans.set(key, clone(plan));
  }

  async getAssignment(
    tenantId: string,
    assignmentId: string,
  ): Promise<EvaluationAssignment | null> {
    const assignment = this.#assignments.get(storageKey(tenantId, assignmentId));
    return assignment === undefined ? null : clone(assignment);
  }

  async listAssignments(
    tenantId: string,
    planId: string,
  ): Promise<readonly EvaluationAssignment[]> {
    return [...this.#assignments.values()]
      .filter((assignment) => assignment.tenantId === tenantId && assignment.planId === planId)
      .map(clone);
  }

  async putAssignmentsForTesting(assignments: readonly EvaluationAssignment[]): Promise<void> {
    const keys = assignments.map((assignment) => storageKey(assignment.tenantId, assignment.id));
    if (new Set(keys).size !== keys.length || keys.some((key) => this.#assignments.has(key))) {
      throw conflict("One or more reviewer assignments already exist.");
    }
    for (const assignment of assignments) {
      this.#assignments.set(storageKey(assignment.tenantId, assignment.id), clone(assignment));
    }
  }
  async replaceAssignment(
    scope: EvaluationAssignmentScope,
    input: EvaluationAssignmentReplacementInput,
  ): Promise<EvaluationAssignmentReplacementResult> {
    const oldKey = storageKey(scope.tenantId, input.oldAssignmentId);
    const oldAssignment = this.#assignments.get(oldKey);
    if (oldAssignment === undefined) {
      throw conflict("The reviewer assignment to replace was not found.");
    }
    if (!assignmentMatchesScope(oldAssignment, scope)) {
      throw conflict("Reviewer assignment replacement is outside its target scope.");
    }
    if (oldAssignment.status === "superseded") {
      throw conflict("The reviewer assignment has already been superseded.");
    }
    assertVersion(oldAssignment.version, input.expectedAssignmentVersion, "Reviewer assignment");

    const successor = input.successorAssignment;
    if (
      successor.id === oldAssignment.id ||
      successor.status === "abstained" ||
      successor.status === "superseded" ||
      successor.reviewerId !== input.replacementReviewerId ||
      !assignmentMatchesScope(successor, scope)
    ) {
      throw conflict("Reviewer assignment replacement is outside its target scope.");
    }
    if (input.reason.trim().length === 0) {
      throw conflict("A replacement reason is required.");
    }
    const successorKey = storageKey(scope.tenantId, successor.id);
    if (this.#assignments.has(successorKey)) {
      throw conflict("The successor reviewer assignment already exists.");
    }

    const supersededAt = successor.updatedAt;
    const supersededAssignment: EvaluationAssignment = {
      ...clone(oldAssignment),
      status: "superseded",
      successorAssignmentId: successor.id,
      supersededReason: input.reason,
      lineage: {
        predecessorAssignmentId: oldAssignment.predecessorAssignmentId ?? null,
        successorAssignmentId: successor.id,
        reason: input.reason,
        supersededAt,
      },
      version: oldAssignment.version + 1,
      updatedAt: supersededAt,
    };
    const successorAssignment: EvaluationAssignment = {
      ...clone(successor),
      predecessorAssignmentId: oldAssignment.id,
      successorAssignmentId: null,
      supersededReason: null,
      lineage: {
        predecessorAssignmentId: oldAssignment.id,
        successorAssignmentId: null,
        reason: input.reason,
        supersededAt,
      },
    };

    const resultScope: EvaluationAssignmentScope = {
      ...scope,
      submissionId: scope.submissionId ?? oldAssignment.submissionId,
    };
    const history = reviewHistoryFor(this.#reviews, supersededAssignment);
    this.#assignments.set(oldKey, clone(supersededAssignment));
    this.#assignments.set(successorKey, clone(successorAssignment));

    return {
      scope: resultScope,
      replacedAssignment: clone(supersededAssignment),
      successorAssignment: clone(successorAssignment),
      activeAssignments: activeAssignmentsForScope(this.#assignments, resultScope),
      history,
    };
  }

  async applyAssignmentDistribution(
    scope: EvaluationAssignmentScope,
    input: EvaluationAssignmentDistributionInput,
  ): Promise<EvaluationAssignmentDistributionResult> {
    if (input.reason.trim().length === 0) {
      throw conflict("A distribution reason is required.");
    }

    const scopedAssignments = [...this.#assignments.values()].filter((assignment) =>
      assignmentMatchesScope(assignment, scope),
    );
    const expected = new Map<string, number>();
    for (const expectedVersion of input.expectedActiveVersions) {
      if (expected.has(expectedVersion.assignmentId)) {
        throw conflict("Expected reviewer assignment versions must be unique.");
      }
      expected.set(expectedVersion.assignmentId, expectedVersion.version);
    }
    const desired = [...input.assignments];
    const targetSubmissionIds = new Set(desired.map((assignment) => assignment.submissionId));
    for (const assignmentId of expected.keys()) {
      const assignment = scopedAssignments.find((candidate) => candidate.id === assignmentId);
      if (assignment !== undefined) targetSubmissionIds.add(assignment.submissionId);
    }
    const target = scopedAssignments.filter((assignment) =>
      targetSubmissionIds.has(assignment.submissionId),
    );
    const active = target.filter(
      (assignment) => assignment.status !== "superseded" && assignment.status !== "abstained",
    );
    if (
      expected.size !== active.length ||
      active.some(
        (assignment) =>
          expected.get(assignment.id) === undefined ||
          expected.get(assignment.id) !== assignment.version,
      ) ||
      [...expected.keys()].some(
        (assignmentId) => !active.some((assignment) => assignment.id === assignmentId),
      )
    ) {
      throw conflict("Reviewer assignments changed since the distribution was previewed.");
    }

    const desiredIds = new Set<string>();
    for (const assignment of desired) {
      if (
        assignment.status === "abstained" ||
        assignment.status === "superseded" ||
        !assignmentMatchesScope(assignment, scope)
      ) {
        throw conflict("Reviewer assignment distribution is outside its target scope.");
      }
      if (desiredIds.has(assignment.id)) {
        throw conflict("Reviewer assignment distribution contains duplicates.");
      }
      desiredIds.add(assignment.id);
      const existing = this.#assignments.get(storageKey(scope.tenantId, assignment.id));
      if (existing !== undefined) {
        if (!assignmentMatchesScope(existing, scope)) {
          throw conflict("A reviewer assignment already exists outside the distribution scope.");
        }
        if (existing.status === "abstained") {
          throw conflict("A reviewer who declared a conflict cannot be reassigned.");
        }
        if (existing.status === "superseded") {
          throw conflict("A superseded reviewer assignment cannot be reused.");
        }
        if (
          existing.reviewerId !== assignment.reviewerId ||
          existing.version !== assignment.version
        ) {
          throw conflict("A reviewer assignment changed since the distribution was previewed.");
        }
      }
    }

    const desiredById = new Map(desired.map((assignment) => [assignment.id, assignment]));
    const supersededAssignments = active.filter((assignment) => !desiredById.has(assignment.id));
    const supersededAt = desired[0]?.updatedAt ?? active[0]?.updatedAt ?? "";
    const nextSuperseded = supersededAssignments.map(
      (assignment): EvaluationAssignment => ({
        ...clone(assignment),
        status: "superseded",
        successorAssignmentId: null,
        supersededReason: input.reason,
        lineage: {
          predecessorAssignmentId: assignment.predecessorAssignmentId ?? null,
          successorAssignmentId: null,
          reason: input.reason,
          supersededAt,
        },
        version: assignment.version + 1,
        updatedAt: supersededAt,
      }),
    );
    const nextAssignments = desired.map((assignment) => {
      const existing = this.#assignments.get(storageKey(scope.tenantId, assignment.id));
      if (existing === undefined) return clone(assignment);
      return {
        ...clone(existing),
        ...clone(assignment),
        predecessorAssignmentId:
          assignment.predecessorAssignmentId ?? existing.predecessorAssignmentId,
        successorAssignmentId: assignment.successorAssignmentId ?? existing.successorAssignmentId,
        supersededReason: assignment.supersededReason ?? existing.supersededReason,
        lineage: assignment.lineage ?? existing.lineage,
      };
    });

    // Every validation above runs before this mutation block, so the command is all-or-nothing.
    for (const assignment of nextSuperseded) {
      this.#assignments.set(storageKey(scope.tenantId, assignment.id), clone(assignment));
    }
    for (const assignment of nextAssignments) {
      this.#assignments.set(storageKey(scope.tenantId, assignment.id), clone(assignment));
    }

    const activeAssignments = activeAssignmentsForScope(this.#assignments, scope).filter(
      (assignment) => targetSubmissionIds.has(assignment.submissionId),
    );
    return {
      scope: clone(scope),
      activeAssignments,
      supersededAssignments: nextSuperseded.map(clone),
      history: nextSuperseded.flatMap((assignment) => reviewHistoryFor(this.#reviews, assignment)),
    };
  }

  async getReview(tenantId: string, assignmentId: string): Promise<EvaluationReview | null> {
    const review = this.#reviews.get(storageKey(tenantId, assignmentId));
    return review === undefined ? null : clone(review);
  }

  async listReviews(tenantId: string, planId: string): Promise<readonly EvaluationReview[]> {
    return [...this.#reviews.values()]
      .filter((review) => review.tenantId === tenantId && review.planId === planId)
      .map(clone);
  }
  async getSuggestion(
    tenantId: string,
    suggestionId: string,
  ): Promise<EvaluationSuggestion | null> {
    const suggestion = this.#suggestions.get(storageKey(tenantId, suggestionId));
    return suggestion === undefined ? null : clone(suggestion);
  }

  async listSuggestions(
    tenantId: string,
    planId: string,
  ): Promise<readonly EvaluationSuggestion[]> {
    return [...this.#suggestions.values()]
      .filter((suggestion) => suggestion.tenantId === tenantId && suggestion.planId === planId)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(clone);
  }

  async putSuggestion(
    suggestion: EvaluationSuggestion,
    expectedVersion: number | null,
  ): Promise<void> {
    const key = storageKey(suggestion.tenantId, suggestion.id);
    assertVersion(this.#suggestions.get(key)?.version ?? null, expectedVersion, "Suggestion");
    this.#suggestions.set(key, clone(suggestion));
  }

  async resolveSuggestion(
    suggestion: EvaluationSuggestion,
    expectedSuggestionVersion: number,
    assignment: EvaluationAssignment | null,
    expectedAssignmentVersion: number | null,
    review: EvaluationReview | null,
    expectedReviewVersion: number | null,
  ): Promise<EvaluationSuggestionResolution> {
    const suggestionKey = storageKey(suggestion.tenantId, suggestion.id);
    assertVersion(
      this.#suggestions.get(suggestionKey)?.version ?? null,
      expectedSuggestionVersion,
      "Suggestion",
    );

    const assignmentKey =
      assignment === null ? null : storageKey(assignment.tenantId, assignment.id);
    if (assignment !== null) {
      if (
        assignment.tenantId !== suggestion.tenantId ||
        assignment.id !== suggestion.assignmentId
      ) {
        throw conflict("Suggestion resolution targeted another assignment.");
      }
      assertVersion(
        this.#assignments.get(assignmentKey ?? "")?.version ?? null,
        expectedAssignmentVersion,
        "Assignment",
      );
    }

    const reviewKey = review === null ? null : storageKey(review.tenantId, review.assignmentId);
    if (review !== null) {
      if (
        review.tenantId !== suggestion.tenantId ||
        review.assignmentId !== suggestion.assignmentId
      ) {
        throw conflict("Suggestion resolution targeted another review.");
      }
      assertVersion(
        this.#reviews.get(reviewKey ?? "")?.version ?? null,
        expectedReviewVersion,
        "Review",
      );
    }

    // Validate every CAS before mutating any entity.
    this.#suggestions.set(suggestionKey, clone(suggestion));
    if (assignment !== null && assignmentKey !== null) {
      this.#assignments.set(assignmentKey, clone(assignment));
    }
    if (review !== null && reviewKey !== null) {
      this.#reviews.set(reviewKey, clone(review));
    }
    return {
      suggestion: clone(suggestion),
      review: review === null ? null : clone(review),
    };
  }
  async listReviewerWorkspaceRecords(
    tenantId: string,
    reviewerId: string,
    eventIds: readonly string[],
  ): Promise<ReviewerWorkspaceRecords> {
    const allowedEventIds = new Set(eventIds);
    const activeAssignmentIds = new Set(
      [...this.#assignments.values()]
        .filter(
          (assignment) =>
            assignment.tenantId === tenantId &&
            assignment.reviewerId === reviewerId &&
            allowedEventIds.has(assignment.eventId) &&
            assignment.status !== "superseded",
        )
        .map((assignment) => assignment.id),
    );
    return {
      assignments: [...this.#assignments.values()]
        .filter(
          (assignment) =>
            assignment.tenantId === tenantId &&
            assignment.reviewerId === reviewerId &&
            allowedEventIds.has(assignment.eventId) &&
            assignment.status !== "superseded",
        )
        .map(clone),
      reviews: [...this.#reviews.values()]
        .filter(
          (review) =>
            review.tenantId === tenantId &&
            review.reviewerId === reviewerId &&
            allowedEventIds.has(review.eventId) &&
            activeAssignmentIds.has(review.assignmentId),
        )
        .map(clone),
    };
  }
  async listOrganizerWorkspaceRecords(
    tenantId: string,
    eventId: string,
  ): Promise<OrganizerWorkspaceRecords> {
    return {
      assignments: [...this.#assignments.values()]
        .filter(
          (assignment) =>
            assignment.tenantId === tenantId &&
            assignment.eventId === eventId &&
            assignment.status !== "superseded",
        )
        .map(clone),
      reviews: [...this.#reviews.values()]
        .filter((review) => review.tenantId === tenantId && review.eventId === eventId)
        .map(clone),
      decisions: [...this.#decisions.values()]
        .filter((decision) => decision.tenantId === tenantId && decision.eventId === eventId)
        .map(clone),
    };
  }

  async putReview(review: EvaluationReview, expectedVersion: number | null): Promise<void> {
    const key = storageKey(review.tenantId, review.assignmentId);
    assertVersion(this.#reviews.get(key)?.version ?? null, expectedVersion, "Review");
    this.#reviews.set(key, clone(review));
  }
  async saveReviewDraft(
    assignment: EvaluationAssignment,
    expectedAssignmentVersion: number,
    review: EvaluationReview,
    expectedReviewVersion: number | null,
  ): Promise<void> {
    const assignmentStorageKey = storageKey(assignment.tenantId, assignment.id);
    const reviewStorageKey = storageKey(review.tenantId, review.assignmentId);
    assertVersion(
      this.#assignments.get(assignmentStorageKey)?.version ?? null,
      expectedAssignmentVersion,
      "Assignment",
    );
    assertVersion(
      this.#reviews.get(reviewStorageKey)?.version ?? null,
      expectedReviewVersion,
      "Review",
    );
    this.#assignments.set(assignmentStorageKey, clone(assignment));
    this.#reviews.set(reviewStorageKey, clone(review));
  }

  async getConflict(
    tenantId: string,
    assignmentId: string,
  ): Promise<EvaluationConflictDeclaration | null> {
    const declaration = this.#conflicts.get(storageKey(tenantId, assignmentId));
    return declaration === undefined ? null : clone(declaration);
  }

  async abstainAssignment(
    assignment: EvaluationAssignment,
    expectedAssignmentVersion: number,
    declaration: EvaluationConflictDeclaration,
  ): Promise<void> {
    const assignmentStorageKey = storageKey(assignment.tenantId, assignment.id);
    const conflictStorageKey = storageKey(declaration.tenantId, declaration.assignmentId);
    assertVersion(
      this.#assignments.get(assignmentStorageKey)?.version ?? null,
      expectedAssignmentVersion,
      "Assignment",
    );
    if (this.#conflicts.has(conflictStorageKey)) {
      throw conflict("A conflict has already been declared for this assignment.");
    }
    this.#assignments.set(assignmentStorageKey, clone(assignment));
    this.#conflicts.set(conflictStorageKey, clone(declaration));
  }

  async submitReview(
    assignment: EvaluationAssignment,
    expectedAssignmentVersion: number,
    review: EvaluationReview,
    expectedReviewVersion: number,
  ): Promise<void> {
    const assignmentStorageKey = storageKey(assignment.tenantId, assignment.id);
    const reviewStorageKey = storageKey(review.tenantId, review.assignmentId);
    assertVersion(
      this.#assignments.get(assignmentStorageKey)?.version ?? null,
      expectedAssignmentVersion,
      "Assignment",
    );
    assertVersion(
      this.#reviews.get(reviewStorageKey)?.version ?? null,
      expectedReviewVersion,
      "Review",
    );
    this.#assignments.set(assignmentStorageKey, clone(assignment));
    this.#reviews.set(reviewStorageKey, clone(review));
  }

  async getDecision(
    tenantId: string,
    planId: string,
    submissionId: string,
  ): Promise<EvaluationDecision | null> {
    const decision = this.#decisions.get(decisionKey(tenantId, planId, submissionId));
    return decision === undefined ? null : clone(decision);
  }

  async putDecision(decision: EvaluationDecision, expectedVersion: number | null): Promise<void> {
    const key = decisionKey(decision.tenantId, decision.planId, decision.submissionId);
    assertVersion(this.#decisions.get(key)?.version ?? null, expectedVersion, "Decision");
    this.#decisions.set(key, clone(decision));
  }
}

export class InMemorySubmissionReviewSource implements SubmissionReviewSource {
  readonly #submissions = new Map<string, SubmissionReviewMaterial>();

  constructor(submissions: readonly SubmissionReviewMaterial[] = []) {
    for (const submission of submissions) {
      this.#submissions.set(storageKey(submission.tenantId, submission.id), clone(submission));
    }
  }
  async listSubmissionsForOrganizer(tenantId: string, eventId: string) {
    return [...this.#submissions.values()]
      .filter((submission) => submission.tenantId === tenantId && submission.eventId === eventId)
      .map((submission) => ({
        ...clone(submission),
        status: "submitted",
        version: 1,
        submittedAt: "2026-08-08T12:00:00.000Z",
        updatedAt: "2026-08-08T12:00:00.000Z",
        reopenedAt: null,
      }));
  }

  async getSubmissionForReview(
    tenantId: string,
    eventId: string,
    submissionId: string,
  ): Promise<SubmissionReviewMaterial | null> {
    const submission = this.#submissions.get(storageKey(tenantId, submissionId));
    if (submission === undefined || submission.eventId !== eventId) {
      return null;
    }
    return clone(submission);
  }
  async getSubmissionsForReview(
    tenantId: string,
    lookups: readonly SubmissionReviewLookup[],
  ): Promise<readonly SubmissionReviewMaterial[]> {
    const materials: SubmissionReviewMaterial[] = [];
    for (const lookup of lookups) {
      const submission = this.#submissions.get(storageKey(tenantId, lookup.submissionId));
      if (submission !== undefined && submission.eventId === lookup.eventId) {
        materials.push(clone(submission));
      }
    }
    return materials;
  }

  set(submission: SubmissionReviewMaterial): void {
    this.#submissions.set(storageKey(submission.tenantId, submission.id), clone(submission));
  }
}
