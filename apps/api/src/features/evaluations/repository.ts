import { conflict } from "./errors";
import type {
  EvaluationAssignment,
  EvaluationConflictDeclaration,
  EvaluationDecision,
  EvaluationPlan,
  EvaluationReview,
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
  putAssignments(assignments: readonly EvaluationAssignment[]): Promise<void>;
  deleteAssignment(
    tenantId: string,
    assignmentId: string,
    expectedAssignmentVersion: number,
  ): Promise<void>;
  getReview(tenantId: string, assignmentId: string): Promise<EvaluationReview | null>;
  listReviews(tenantId: string, planId: string): Promise<readonly EvaluationReview[]>;
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

export class InMemoryEvaluationRepository implements EvaluationRepository {
  readonly #plans = new Map<string, EvaluationPlan>();
  readonly #assignments = new Map<string, EvaluationAssignment>();
  readonly #reviews = new Map<string, EvaluationReview>();
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

  async putAssignments(assignments: readonly EvaluationAssignment[]): Promise<void> {
    const keys = assignments.map((assignment) => storageKey(assignment.tenantId, assignment.id));
    if (new Set(keys).size !== keys.length || keys.some((key) => this.#assignments.has(key))) {
      throw conflict("One or more reviewer assignments already exist.");
    }
    for (const assignment of assignments) {
      this.#assignments.set(storageKey(assignment.tenantId, assignment.id), clone(assignment));
    }
  }

  async deleteAssignment(
    tenantId: string,
    assignmentId: string,
    expectedAssignmentVersion: number,
  ): Promise<void> {
    const assignmentStorageKey = storageKey(tenantId, assignmentId);
    assertVersion(
      this.#assignments.get(assignmentStorageKey)?.version ?? null,
      expectedAssignmentVersion,
      "Assignment",
    );
    const reviewStorageKey = storageKey(tenantId, assignmentId);
    const review = this.#reviews.get(reviewStorageKey);
    if (review !== undefined && review.submittedAt !== null) {
      throw conflict("A submitted review cannot be unassigned.");
    }
    this.#assignments.delete(assignmentStorageKey);
    this.#reviews.delete(reviewStorageKey);
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
  async listReviewerWorkspaceRecords(
    tenantId: string,
    reviewerId: string,
    eventIds: readonly string[],
  ): Promise<ReviewerWorkspaceRecords> {
    const allowedEventIds = new Set(eventIds);
    return {
      assignments: [...this.#assignments.values()]
        .filter(
          (assignment) =>
            assignment.tenantId === tenantId &&
            assignment.reviewerId === reviewerId &&
            allowedEventIds.has(assignment.eventId),
        )
        .map(clone),
      reviews: [...this.#reviews.values()]
        .filter(
          (review) =>
            review.tenantId === tenantId &&
            review.reviewerId === reviewerId &&
            allowedEventIds.has(review.eventId),
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
        .filter((assignment) => assignment.tenantId === tenantId && assignment.eventId === eventId)
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
