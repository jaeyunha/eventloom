export type EvaluationPlanStatus = "draft" | "open" | "closed";
export type AssignmentStatus = "assigned" | "in_progress" | "submitted" | "abstained";
export type EvaluationDecisionStatus = "accepted" | "waitlisted" | "rejected";
export type EvaluationRole = "organizer" | "reviewer";
export type EvaluationSuggestionStatus = "pending" | "accepted" | "edited" | "rejected" | "stale";
export type EvaluationSuggestionResolutionAction = "accept" | "edit" | "reject";
export type EvaluationCriterionInputType = "numeric" | "dropdown" | "free_text";
export type EvaluationRoundAnonymization = "none" | "single" | "double";

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

export interface EvaluationCriterionOption {
  readonly id?: string | undefined;
  readonly label: string;
  readonly value: string;
}

export interface RubricCriterion {
  id: string;
  label: string;
  description: string;
  minimum: number;
  maximum: number;
  weight: number;
  required: boolean;
  /** How a reviewer supplies this criterion's response. Defaults to numeric. */
  inputType?: EvaluationCriterionInputType | undefined;
  /** Dropdown choices in display order. */
  options?: readonly EvaluationCriterionOption[] | undefined;
}

export interface Rubric {
  id: string;
  name: string;
  criteria: readonly RubricCriterion[];
}

export interface EvaluationReviewerProjection {
  /** Submission answer field ids visible to reviewers. Empty means deny all. */
  readonly fieldIds?: readonly string[] | undefined;
  /** Uploaded file ids visible to reviewers. Empty means deny all. */
  readonly fileIds?: readonly string[] | undefined;
  readonly visibleFieldIds?: readonly string[] | undefined;
  readonly visibleFileIds?: readonly string[] | undefined;
}

export interface EvaluationReviewerPool {
  /** Reviewer ids eligible for this round only. */
  readonly reviewerIds: readonly string[];
  readonly name?: string | undefined;
}

export interface ReviewRound {
  id: string;
  name: string;
  sequence: number;
  /** Optional per-round opening instant; omitted retains plan-created behavior. */
  opensAt?: string | null | undefined;
  closesAt: string | null;
  /** Round-level anonymization is deny-by-default when enabled. */
  blindReview?: boolean | undefined;
  anonymization?: EvaluationRoundAnonymization | undefined;
  reviewerPool?: EvaluationReviewerPool | undefined;
  trackFilter?: string | null | undefined;
  rubric: Rubric;
}

export interface EvaluationAssignmentRule {
  reviewsPerSubmission: number;
  maxAssignmentsPerReviewer: number;
  /** Optional track used by bulk/automatic assignment clients. */
  trackFilter?: string | null | undefined;
  /** Assignment orchestration mode; manual remains the default. */
  autoDistribute?: boolean | undefined;
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
  /** Explicit reviewer projection. Omitted retains the legacy safe projection. */
  reviewerProjection?: EvaluationReviewerProjection | undefined;
  evaluatorProjection?: EvaluationReviewerProjection | undefined;
  projection?: EvaluationReviewerProjection | undefined;
  /** Set when grading configuration becomes immutable. */
  gradingLockedAt?: string | null | undefined;
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
  /** Snapshot used to keep assignment/review history reproducible. */
  planVersion?: number;
  rubricRevision?: number;
  submissionRevision?: number | undefined;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RubricScore {
  criterionId: string;
  value: number | string;
  origin: "human" | "ai";
  evidence: readonly string[];
  humanConfirmedBy: string | null;
  /** Pending AI output is never counted by aggregate/decision consumers. */
  suggestionId?: string;
  suggestionStatus?: EvaluationSuggestionStatus;
  rubricRevision?: number;
  submissionRevision?: number;
  rubricVersion?: number | undefined;
  submissionVersion?: number | undefined;
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
  /** Immutable source revisions used to author this review. */
  planRevision?: number;
  rubricRevision?: number;
  submissionRevision?: number;
  planVersion?: number | undefined;
  rubricVersion?: number | undefined;
  submissionVersion?: number | undefined;
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
export type EvaluationDecisionCommunicationTemplatePurpose =
  | "decision_accepted"
  | "decision_waitlisted"
  | "decision_rejected";

export interface EvaluationParticipantOutcomeProjection {
  readonly status: EvaluationDecisionStatus;
  readonly reason: string;
  readonly decisionVersion: number;
  readonly decidedAt: string;
}

export interface EvaluationDecisionCommunicationProjection {
  readonly templatePurpose: EvaluationDecisionCommunicationTemplatePurpose;
}

export interface EvaluationDecisionProjectionData {
  readonly participantProjection: EvaluationParticipantOutcomeProjection;
  readonly communication: EvaluationDecisionCommunicationProjection;
}

export interface SubmissionParticipantForReview {
  id: string;
  displayName: string;
  email: string;
  biography: string;
  /** Role supplied by the submitter, such as author, co-author, presenter, or panelist. */
  role?: string | undefined;
}

export interface SubmissionFileForReview {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly url?: string;
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
  /** Source revision for exact suggestion/review provenance. */
  version?: number | undefined;
  revision?: number | undefined;
  files?: readonly SubmissionFileForReview[] | undefined;
}

export interface VisibleSubmissionReviewMaterial {
  id: string;
  title: string;
  abstract: string;
  answers: Readonly<Record<string, unknown>>;
  participants: readonly SubmissionParticipantForReview[];
  files?: readonly SubmissionFileForReview[] | undefined;
  identityRedacted: boolean;
}

export interface ReviewContext {
  assignment: EvaluationAssignment;
  round: ReviewRound;
  submission: VisibleSubmissionReviewMaterial;
  review: EvaluationReview | null;
  rubricRevision?: number;
  submissionRevision?: number;
  suggestions?: readonly EvaluationSuggestion[];
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
  readonly reviewers?: readonly EvaluationReviewerProgress[] | undefined;
}
export interface EvaluationReviewerProgress {
  readonly reviewerId: string;
  readonly roundId?: string | undefined;
  readonly assigned: number;
  readonly inProgress: number;
  readonly submitted: number;
  readonly abstained: number;
  readonly completionPercent: number;
  readonly outstanding: number;
}

export interface EvaluationSuggestionProvenance {
  readonly provider: string;
  readonly model: string;
  readonly generatedAt: string;
  readonly sourceReferences: readonly string[];
  readonly promptVersion?: string;
  readonly traceId?: string;
}

export interface EvaluationSuggestionCandidate {
  readonly id: string;
  readonly criterionId: string;
  readonly value: number;
  readonly evidence: readonly string[];
  readonly provenance: EvaluationSuggestionProvenance;
}
export interface EvaluationSuggestionProviderCandidate {
  readonly id?: string;
  readonly criterionId?: string;
  readonly value: number;
  readonly evidence: readonly string[];
  readonly provenance?: Partial<EvaluationSuggestionProvenance>;
}

export interface EvaluationSuggestionAuditEntry {
  readonly action: EvaluationSuggestionResolutionAction | "generate" | "stale";
  readonly actorId: string | null;
  readonly at: string;
  readonly reason?: string;
  readonly valueByCriterion?: Readonly<Record<string, number>>;
}

export interface EvaluationSuggestion {
  readonly id: string;
  readonly tenantId: string;
  readonly eventId: string;
  readonly planId: string;
  readonly roundId: string;
  readonly assignmentId: string;
  readonly submissionId: string;
  readonly reviewerId: string;
  /** Exact plan/rubric revision used for generation. */
  readonly rubricRevision: number;
  /** Exact submission revision used for generation. */
  readonly submissionRevision: number;
  readonly planRevision?: number | undefined;
  readonly rubricId?: string | undefined;
  readonly submissionVersion?: number | undefined;
  readonly candidates: Readonly<Record<string, readonly EvaluationSuggestionCandidate[]>>;
  readonly criterionCandidates: readonly EvaluationSuggestionCandidate[];
  readonly provenance: EvaluationSuggestionProvenance;
  readonly status: EvaluationSuggestionStatus;
  readonly version: number;
  readonly history: readonly EvaluationSuggestionAuditEntry[];
  readonly audit: readonly EvaluationSuggestionAuditEntry[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface EvaluationSuggestionProviderInput {
  readonly tenantId: string;
  readonly eventId: string;
  readonly planId: string;
  readonly roundId: string;
  readonly assignmentId: string;
  readonly submissionId: string;
  readonly rubricRevision: number;
  readonly submissionRevision: number;
  readonly round: ReviewRound;
  readonly submission: VisibleSubmissionReviewMaterial;
  readonly planRevision?: number | undefined;
  readonly rubricId?: string | undefined;
  readonly submissionVersion?: number | undefined;
}

export interface EvaluationSuggestionProviderResult {
  readonly candidates:
    | readonly EvaluationSuggestionProviderCandidate[]
    | Readonly<Record<string, readonly EvaluationSuggestionProviderCandidate[]>>;
  readonly provenance?: Partial<EvaluationSuggestionProvenance>;
}

export type EvaluationSuggestionProducer = (
  input: EvaluationSuggestionProviderInput,
) => Promise<EvaluationSuggestionProviderResult>;

export interface EvaluationAiSuggestionProvider {
  readonly generate?: EvaluationSuggestionProducer;
  readonly suggest?: EvaluationSuggestionProducer;
  readonly produce?: EvaluationSuggestionProducer;
  readonly generateSuggestions?: EvaluationSuggestionProducer;
}

export interface ResolveEvaluationSuggestionInput {
  readonly action: EvaluationSuggestionResolutionAction;
  readonly expectedVersion?: number | undefined;
  readonly reason?: string | undefined;
  /** Human edits keyed by criterion id. */
  readonly scores?: Readonly<Record<string, number>> | undefined;
  readonly criterionScores?: Readonly<Record<string, number>> | undefined;
}

export interface EvaluationSuggestionResolution {
  readonly suggestion: EvaluationSuggestion;
  readonly review: EvaluationReview | null;
}

/** Compatibility aliases for integrations that use the shorter AI names. */
export type EvaluationAiSuggestion = EvaluationSuggestion;
export type EvaluationSuggestionProvider = EvaluationAiSuggestionProvider;
export type EvaluationSuggestionResolutionInput = ResolveEvaluationSuggestionInput;
