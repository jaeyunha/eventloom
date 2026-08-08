export type EvaluationPlanStatus = "draft" | "open" | "closed";
export type AssignmentStatus = "assigned" | "in_progress" | "submitted" | "abstained";
export type EvaluationDecisionStatus = "accepted" | "waitlisted" | "rejected";
export type EvaluationRole = "organizer" | "reviewer";

export interface EvaluationGrant {
  eventId: string;
  role: EvaluationRole;
}

export interface EvaluationActor {
  tenantId: string;
  userId: string;
  kind: "human" | "automation";
  grants: readonly EvaluationGrant[];
}

export interface RubricCriterion {
  id: string;
  label: string;
  description: string;
  minimum: number;
  maximum: number;
  weight: number;
  required: boolean;
}

export interface Rubric {
  id: string;
  name: string;
  criteria: readonly RubricCriterion[];
}

export interface ReviewRound {
  id: string;
  name: string;
  sequence: number;
  closesAt: string | null;
  rubric: Rubric;
}

export interface EvaluationAssignmentRule {
  reviewsPerSubmission: number;
  maxAssignmentsPerReviewer: number;
}

export interface EvaluationPlan {
  id: string;
  tenantId: string;
  eventId: string;
  name: string;
  status: EvaluationPlanStatus;
  blindReview: boolean;
  closesAt: string | null;
  assignmentRule: EvaluationAssignmentRule;
  rounds: readonly ReviewRound[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface EvaluationAssignment {
  id: string;
  tenantId: string;
  eventId: string;
  planId: string;
  roundId: string;
  submissionId: string;
  reviewerId: string;
  status: AssignmentStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RubricScore {
  criterionId: string;
  value: number;
  origin: "human" | "ai";
  evidence: readonly string[];
  humanConfirmedBy: string | null;
  updatedAt: string;
}

export interface EvaluationReview {
  id: string;
  tenantId: string;
  eventId: string;
  planId: string;
  roundId: string;
  assignmentId: string;
  submissionId: string;
  reviewerId: string;
  scores: Readonly<Record<string, RubricScore>>;
  comment: string;
  submittedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface EvaluationConflictDeclaration {
  id: string;
  tenantId: string;
  eventId: string;
  planId: string;
  assignmentId: string;
  submissionId: string;
  reviewerId: string;
  reason: string;
  declaredAt: string;
}

export interface EvaluationDecisionTransition {
  from: EvaluationDecisionStatus | null;
  to: EvaluationDecisionStatus;
  reason: string;
  decidedBy: string;
  decidedAt: string;
  idempotencyKey: string;
}

export interface EvaluationDecision {
  id: string;
  tenantId: string;
  eventId: string;
  planId: string;
  submissionId: string;
  status: EvaluationDecisionStatus;
  version: number;
  history: readonly EvaluationDecisionTransition[];
  updatedAt: string;
}

export interface SubmissionParticipantForReview {
  id: string;
  displayName: string;
  email: string;
  biography: string;
}

export interface SubmissionReviewMaterial {
  id: string;
  tenantId: string;
  eventId: string;
  title: string;
  abstract: string;
  answers: Readonly<Record<string, unknown>>;
  identityFieldIds: readonly string[];
  participants: readonly SubmissionParticipantForReview[];
}

export interface VisibleSubmissionReviewMaterial {
  id: string;
  title: string;
  abstract: string;
  answers: Readonly<Record<string, unknown>>;
  participants: readonly SubmissionParticipantForReview[];
  identityRedacted: boolean;
}

export interface ReviewContext {
  assignment: EvaluationAssignment;
  round: ReviewRound;
  submission: VisibleSubmissionReviewMaterial;
  review: EvaluationReview | null;
}

export interface RubricTotal {
  weightedTotal: number;
  possibleWeightedTotal: number;
  countedCriteria: number;
}

export interface CriterionAggregate {
  criterionId: string;
  average: number | null;
  count: number;
  weight: number;
}

export interface EvaluationAggregate {
  planId: string;
  roundId: string;
  submissionId: string;
  submittedReviewCount: number;
  expectedReviewCount: number;
  averageWeightedTotal: number | null;
  possibleWeightedTotal: number;
  criteria: readonly CriterionAggregate[];
}

export interface EvaluationProgress {
  planId: string;
  total: number;
  assigned: number;
  inProgress: number;
  submitted: number;
  abstained: number;
  completionPercent: number;
}
