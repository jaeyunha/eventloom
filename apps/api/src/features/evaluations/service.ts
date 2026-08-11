import { closed, conflict, forbidden, invalidInput, notFound } from "./errors";
import type {
  EvaluationRepository,
  OrganizerWorkspaceRecords,
  SubmissionReviewSource,
} from "./repository";
import type {
  EvaluationActor,
  EvaluationAggregate,
  EvaluationAiSuggestionProvider,
  EvaluationAssignment,
  EvaluationConflictDeclaration,
  EvaluationDecision,
  EvaluationDecisionCommunicationProjection,
  EvaluationDecisionCommunicationTemplatePurpose,
  EvaluationDecisionProjectionData,
  EvaluationDecisionStatus,
  EvaluationDecisionTransition,
  EvaluationParticipantOutcomeProjection,
  EvaluationPlan,
  EvaluationProgress,
  EvaluationReview,
  EvaluationReviewerProjection,
  EvaluationSuggestion,
  EvaluationSuggestionAuditEntry,
  EvaluationSuggestionCandidate,
  EvaluationSuggestionProducer,
  EvaluationSuggestionProvenance,
  EvaluationSuggestionProviderInput,
  EvaluationSuggestionProviderResult,
  EvaluationSuggestionResolution,
  ResolveEvaluationSuggestionInput,
  ReviewContext,
  ReviewRound,
  Rubric,
  RubricCriterion,
  RubricScore,
  RubricTotal,
  SubmissionReviewMaterial,
} from "./types";

const MAX_SUBMISSION_ID_LENGTH = 128;

export interface CreateEvaluationPlanInput {
  id: string;
  eventId: string;
  name: string;
  blindReview: boolean;
  closesAt: string | null;
  assignmentRule: {
    reviewsPerSubmission: number;
    maxAssignmentsPerReviewer: number;
    readonly trackFilter?: string | null | undefined;
    readonly autoDistribute?: boolean | undefined;
  };
  rounds: readonly ReviewRound[];
  reviewerProjection?: EvaluationReviewerProjection | undefined;
  evaluatorProjection?: EvaluationReviewerProjection | undefined;
  projection?: EvaluationReviewerProjection | undefined;
}

export interface UpdateEvaluationPlanInput {
  readonly expectedVersion: number;
  readonly name?: string | undefined;
  readonly blindReview?: boolean | undefined;
  readonly closesAt?: string | null | undefined;
  readonly assignmentRule?:
    | {
        readonly reviewsPerSubmission: number;
        readonly maxAssignmentsPerReviewer: number;
        readonly trackFilter?: string | null | undefined;
        readonly autoDistribute?: boolean | undefined;
      }
    | undefined;
  readonly rounds?: readonly ReviewRound[] | undefined;
  readonly reviewerProjection?: EvaluationReviewerProjection | undefined;
  readonly evaluatorProjection?: EvaluationReviewerProjection | undefined;
  readonly projection?: EvaluationReviewerProjection | undefined;
}

export interface GenerateEvaluationSuggestionsInput {
  readonly assignmentId: string;
}

export interface EvaluationAcceptanceHandoffInput {
  readonly tenantId: string;
  readonly eventId: string;
  readonly planId: string;
  readonly submissionId: string;
  readonly decisionId: string;
  readonly decidedBy: string;
  readonly decidedAt: string;
  readonly reason: string;
  readonly idempotencyKey: string;
}
export interface EvaluationDecisionProjectionInput extends EvaluationDecisionProjectionData {
  readonly tenantId: string;
  readonly eventId: string;
  readonly planId: string;
  readonly submissionId: string;
  readonly decisionId: string;
  readonly decisionVersion: number;
  readonly status: EvaluationDecisionStatus;
  readonly priorStatus: EvaluationDecisionStatus | null;
  readonly reason: string;
  readonly decidedByUserId: string;
  readonly decidedAt: string;
  readonly idempotencyKey: string;
  readonly participantProjection: EvaluationParticipantOutcomeProjection;
  readonly communication: EvaluationDecisionCommunicationProjection;
}

export interface EvaluationDecisionProjection {
  projectDecision(input: EvaluationDecisionProjectionInput): Promise<void>;
}

export interface EvaluationAcceptanceHandoff {
  accept(input: EvaluationAcceptanceHandoffInput): Promise<void>;
}

export interface EvaluationSubmissionRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly eventId: string;
  readonly title: string;
  readonly abstract: string;
  readonly answers: Readonly<Record<string, unknown>>;
  readonly participants: readonly {
    readonly id: string;
    readonly displayName: string;
    readonly email: string;
    readonly biography: string;
  }[];
  readonly status: string;
  readonly version?: number;
  readonly revision?: number;
  readonly submittedAt: string | null;
  readonly updatedAt: string;
  readonly reopenedAt: string | null;
}

export interface EvaluationSubmissionSource {
  listSubmissionsForOrganizer?(
    tenantId: string,
    eventId: string,
  ): Promise<readonly EvaluationSubmissionRecord[]>;
  reopenSubmission?(
    tenantId: string,
    eventId: string,
    submissionId: string,
    input: {
      readonly organizerId: string;
      readonly expectedVersion: number;
      readonly reason: string;
      readonly idempotencyKey: string;
    },
  ): Promise<EvaluationSubmissionRecord>;
}
export interface EvaluationReviewerWorkspacePlan {
  readonly id: string;
  readonly eventId: string;
  readonly name: string;
  readonly status: EvaluationPlan["status"];
  readonly blindReview: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface EvaluationReviewerWorkspaceAssignment extends ReviewContext {
  readonly plan: EvaluationReviewerWorkspacePlan;
}

export interface EvaluationReviewerWorkspace {
  readonly assignments: readonly EvaluationReviewerWorkspaceAssignment[];
}
export interface EvaluationOrganizerWorkspaceDiagnostic {
  readonly code: "decisions_unavailable";
  readonly message: string;
}
export interface EvaluationOrganizerWorkspace {
  readonly plan: EvaluationPlan;
  readonly submissions: readonly EvaluationSubmissionRecord[];
  readonly assignments: readonly EvaluationAssignment[];
  readonly progress: EvaluationProgress;
  readonly aggregates: readonly EvaluationAggregate[];
  readonly decisions: Readonly<Record<string, EvaluationDecision>>;
  readonly diagnostics?: readonly EvaluationOrganizerWorkspaceDiagnostic[];
}

export interface AssignReviewersInput {
  planId: string;
  roundId: string;
  submissionId: string;
  reviewerIds: readonly string[];
  expectedVersion?: number | undefined;
}

export interface SaveScoreInput {
  criterionId: string;
  value: number | string;
  origin: "human" | "ai";
  evidence?: readonly string[] | undefined;
}

export interface SaveReviewInput {
  scores: readonly SaveScoreInput[];
  comment?: string | undefined;
  expectedVersion?: number | undefined;
}

export interface RecordDecisionInput {
  planId: string;
  submissionId: string;
  status: EvaluationDecisionStatus;
  reason: string;
  idempotencyKey: string;
  expectedVersion?: number | undefined;
}

export interface EvaluationServiceOptions {
  clock?: (() => Date) | undefined;
  acceptanceHandoff?: EvaluationAcceptanceHandoff | undefined;
  decisionProjection?: EvaluationDecisionProjection | undefined;
  aiSuggestionProvider?: EvaluationAiSuggestionProvider | EvaluationSuggestionProducer | undefined;
  suggestionProvider?: EvaluationAiSuggestionProvider | EvaluationSuggestionProducer | undefined;
  aiSuggestionProducer?: EvaluationSuggestionProducer | undefined;
}

function requireText(value: string, field: string, maximumLength: number): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximumLength) {
    throw invalidInput(`${field} must contain between 1 and ${maximumLength} characters.`);
  }
  return normalized;
}
function requireAcceptableSubmission(
  material: Readonly<{
    title: string;
    abstract: string;
    participants: readonly Readonly<{ id: string; email: string }>[];
  }>,
): void {
  if (
    material.title.trim().length === 0 ||
    material.abstract.trim().length === 0 ||
    material.participants.length === 0 ||
    material.participants.some(
      (participant) => participant.id.trim().length === 0 || participant.email.trim().length === 0,
    )
  ) {
    throw invalidInput(
      "An accepted submission must include a title, abstract, and at least one identified speaker.",
    );
  }
}

function requirePositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw invalidInput(`${field} must be a positive integer.`);
  }
}

function requireInstant(value: string | null | undefined, field: string): void {
  if (value !== null && value !== undefined && !Number.isFinite(Date.parse(value))) {
    throw invalidInput(`${field} must be an ISO-8601 instant or null.`);
  }
}

function hasRole(actor: EvaluationActor, eventId: string, role: "organizer" | "reviewer"): boolean {
  return actor.grants.some((grant) => grant.eventId === eventId && grant.role === role);
}

function requireHumanOrganizer(actor: EvaluationActor, eventId: string): void {
  if (actor.kind !== "human" || !hasRole(actor, eventId, "organizer")) {
    throw forbidden("A human event organizer must perform this evaluation action.");
  }
}

function requireHumanReviewer(actor: EvaluationActor, assignment: EvaluationAssignment): void {
  if (
    actor.kind !== "human" ||
    actor.userId !== assignment.reviewerId ||
    !hasRole(actor, assignment.eventId, "reviewer")
  ) {
    throw forbidden();
  }
}

function findRound(plan: EvaluationPlan, roundId: string): ReviewRound {
  const round = plan.rounds.find((candidate) => candidate.id === roundId);
  if (round === undefined) {
    throw notFound("The evaluation round was not found.");
  }
  return round;
}

function validateCriterion(criterion: RubricCriterion): void {
  requireText(criterion.id, "Criterion id", 100);
  requireText(criterion.label, "Criterion label", 200);
  if (criterion.description.length > 2_000) {
    throw invalidInput("Criterion descriptions cannot exceed 2000 characters.");
  }
  if (
    !Number.isFinite(criterion.minimum) ||
    !Number.isFinite(criterion.maximum) ||
    criterion.minimum >= criterion.maximum
  ) {
    throw invalidInput("Each criterion must have a finite minimum below its maximum.");
  }
  if (!Number.isFinite(criterion.weight) || criterion.weight <= 0) {
    throw invalidInput("Criterion weights must be finite positive numbers.");
  }
  const inputType = criterion.inputType ?? "numeric";
  const options = criterion.options ?? [];
  if (inputType === "dropdown") {
    if (options.length < 1) {
      throw invalidInput("Dropdown criteria must provide at least one option.");
    }
    const optionValues = new Set<string>();
    const optionIds = new Set<string>();
    for (const option of options) {
      requireText(option.label, "Criterion option label", 200);
      requireText(option.value, "Criterion option value", 200);
      if (option.id !== undefined) {
        const optionId = requireText(option.id, "Criterion option id", 100);
        if (optionIds.has(optionId)) {
          throw invalidInput("Dropdown option ids must be unique within a criterion.");
        }
        optionIds.add(optionId);
      }
      if (optionValues.has(option.value)) {
        throw invalidInput("Dropdown option values must be unique within a criterion.");
      }
      optionValues.add(option.value);
    }
    if (options.length > criterion.maximum - criterion.minimum + 1) {
      throw invalidInput("Dropdown options cannot exceed the configured criterion range.");
    }
  } else if (options.length > 0) {
    throw invalidInput("Only dropdown criteria may define options.");
  }
}

function validateRubric(rubric: Rubric): void {
  requireText(rubric.id, "Rubric id", 100);
  requireText(rubric.name, "Rubric name", 200);
  if (rubric.criteria.length === 0) {
    throw invalidInput("Every rubric must contain at least one criterion.");
  }
  const criterionIds = new Set<string>();
  for (const criterion of rubric.criteria) {
    validateCriterion(criterion);
    if (criterionIds.has(criterion.id)) {
      throw invalidInput("Criterion ids must be unique within a rubric.");
    }
    criterionIds.add(criterion.id);
  }
}

function validateRounds(rounds: readonly ReviewRound[]): void {
  if (rounds.length === 0) {
    throw invalidInput("An evaluation plan must contain at least one round.");
  }
  const ids = new Set<string>();
  const sequences = new Set<number>();
  for (const round of rounds) {
    requireText(round.id, "Round id", 100);
    requireText(round.name, "Round name", 200);
    requirePositiveInteger(round.sequence, "Round sequence");
    requireInstant(round.opensAt, "Round open date");
    requireInstant(round.closesAt, "Round close date");
    if (
      round.opensAt !== null &&
      round.opensAt !== undefined &&
      round.closesAt !== null &&
      round.closesAt !== undefined &&
      Date.parse(round.closesAt) <= Date.parse(round.opensAt)
    ) {
      throw invalidInput("Each round close date must be after its open date.");
    }
    const reviewerIds = round.reviewerPool?.reviewerIds ?? [];
    if (round.reviewerPool?.name !== undefined) {
      requireText(round.reviewerPool.name, "Reviewer pool name", 200);
    }
    if (new Set(reviewerIds).size !== reviewerIds.length) {
      throw invalidInput("Reviewer ids must be unique within each round pool.");
    }
    for (const reviewerId of reviewerIds) {
      requireText(reviewerId, "Reviewer id", 100);
    }
    validateRubric(round.rubric);
    if (ids.has(round.id) || sequences.has(round.sequence)) {
      throw invalidInput("Evaluation round ids and sequences must be unique.");
    }
    ids.add(round.id);
    sequences.add(round.sequence);
  }
}
function roundsRequireBlind(rounds: readonly ReviewRound[]): boolean {
  return rounds.some(
    (round) =>
      round.blindReview === true ||
      (round.anonymization !== undefined && round.anonymization !== "none"),
  );
}

function assertPlanIsWritable(plan: EvaluationPlan, round: ReviewRound, now: Date): void {
  if (plan.status !== "open") {
    throw closed("The evaluation plan is not open for reviews.");
  }
  const timestamp = now.getTime();
  if (
    (round.opensAt !== null &&
      round.opensAt !== undefined &&
      Number.isFinite(Date.parse(round.opensAt)) &&
      Date.parse(round.opensAt) > timestamp) ||
    (plan.closesAt !== null && Date.parse(plan.closesAt) <= timestamp) ||
    (round.closesAt !== null && Date.parse(round.closesAt) <= timestamp)
  ) {
    throw closed(
      round.opensAt !== null && round.opensAt !== undefined && Date.parse(round.opensAt) > timestamp
        ? "The review round has not opened yet."
        : "The review close date has passed.",
    );
  }
}

function isNumericCriterion(criterion: RubricCriterion): boolean {
  return (criterion.inputType ?? "numeric") !== "free_text";
}

function normalizeDropdownValue(criterion: RubricCriterion, value: number | string): number {
  const options = criterion.options ?? [];
  if (typeof value === "string") {
    const optionIndex = options.findIndex((option) => option.value === value);
    if (optionIndex < 0) {
      throw invalidInput(`Score ${criterion.id} must use one of the configured dropdown options.`);
    }
    return criterion.minimum + optionIndex;
  }
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw invalidInput(`Score ${criterion.id} must be a whole-number dropdown option.`);
  }
  const optionIndex = value - criterion.minimum;
  if (optionIndex < 0 || optionIndex >= options.length) {
    throw invalidInput(`Score ${criterion.id} must use one of the configured dropdown options.`);
  }
  return value;
}

function possibleWeightedTotal(rubric: Rubric): number {
  return rubric.criteria.reduce(
    (total, criterion) =>
      isNumericCriterion(criterion) ? total + criterion.maximum * criterion.weight : total,
    0,
  );
}

export function calculateRubricTotal(
  rubric: Rubric,
  scores: Readonly<Record<string, RubricScore>>,
): RubricTotal {
  let weightedTotal = 0;
  let countedCriteria = 0;
  for (const criterion of rubric.criteria) {
    const score = scores[criterion.id];
    if (
      !isNumericCriterion(criterion) ||
      score === undefined ||
      score.origin !== "human" ||
      score.humanConfirmedBy === null ||
      score.suggestionStatus === "pending" ||
      score.suggestionStatus === "rejected" ||
      score.suggestionStatus === "stale" ||
      typeof score.value !== "number"
    ) {
      continue;
    }
    weightedTotal += score.value * criterion.weight;
    countedCriteria += 1;
  }
  return {
    weightedTotal,
    possibleWeightedTotal: possibleWeightedTotal(rubric),
    countedCriteria,
  };
}

function aggregateForSubmission(
  plan: EvaluationPlan,
  round: ReviewRound,
  submissionId: string,
  assignments: readonly EvaluationAssignment[],
  reviews: readonly EvaluationReview[],
): EvaluationAggregate {
  const submissionAssignments = assignments.filter(
    (assignment) =>
      assignment.eventId === plan.eventId &&
      assignment.roundId === round.id &&
      assignment.submissionId === submissionId &&
      assignment.status !== "abstained",
  );
  const reviewByAssignment = new Map(reviews.map((review) => [review.assignmentId, review]));
  const submittedReviews = submissionAssignments
    .map((assignment) => reviewByAssignment.get(assignment.id))
    .filter(
      (review): review is EvaluationReview => review !== undefined && review.submittedAt !== null,
    );
  const totals = submittedReviews.map((review) =>
    calculateRubricTotal(round.rubric, review.scores),
  );
  const averageWeightedTotal =
    totals.length === 0
      ? null
      : totals.reduce((total, score) => total + score.weightedTotal, 0) / totals.length;
  const criteria = round.rubric.criteria.map((criterion) => {
    const values = submittedReviews
      .map((review) => review.scores[criterion.id])
      .filter(
        (score): score is RubricScore =>
          isNumericCriterion(criterion) &&
          score?.humanConfirmedBy !== null &&
          score?.origin === "human" &&
          score?.suggestionStatus !== "pending" &&
          score?.suggestionStatus !== "rejected" &&
          score?.suggestionStatus !== "stale" &&
          typeof score.value === "number",
      )
      .map((score) => score.value)
      .filter((value): value is number => typeof value === "number");
    return {
      criterionId: criterion.id,
      average:
        values.length === 0
          ? null
          : values.reduce((total, value) => total + value, 0) / values.length,
      count: values.length,
      weight: criterion.weight,
    };
  });
  return {
    planId: plan.id,
    roundId: round.id,
    submissionId,
    submittedReviewCount: submittedReviews.length,
    expectedReviewCount: plan.assignmentRule.reviewsPerSubmission,
    averageWeightedTotal,
    possibleWeightedTotal: possibleWeightedTotal(round.rubric),
    criteria,
  };
}
function effectiveAssignmentsForPlan(
  plan: EvaluationPlan,
  assignments: readonly EvaluationAssignment[],
  reviews: readonly EvaluationReview[],
): readonly EvaluationAssignment[] {
  const submittedReviewIds = new Set(
    reviews
      .filter(
        (review) =>
          review.tenantId === plan.tenantId &&
          review.eventId === plan.eventId &&
          review.planId === plan.id &&
          review.submittedAt !== null,
      )
      .map((review) => review.assignmentId),
  );
  return assignments
    .filter(
      (assignment) =>
        assignment.tenantId === plan.tenantId &&
        assignment.eventId === plan.eventId &&
        assignment.planId === plan.id,
    )
    .map((assignment) => {
      if (assignment.status === "abstained") return assignment;
      if (submittedReviewIds.has(assignment.id)) {
        return { ...assignment, status: "submitted" as const };
      }
      if (assignment.status === "submitted") {
        return { ...assignment, status: "assigned" as const };
      }
      return assignment;
    });
}

function progressForAssignments(
  plan: EvaluationPlan,
  assignments: readonly EvaluationAssignment[],
): EvaluationProgress {
  const relevantAssignments = assignments.filter(
    (assignment) =>
      assignment.tenantId === plan.tenantId &&
      assignment.eventId === plan.eventId &&
      assignment.planId === plan.id,
  );
  const count = (status: EvaluationAssignment["status"]) =>
    relevantAssignments.filter((assignment) => assignment.status === status).length;
  const submitted = count("submitted");
  const abstained = count("abstained");
  const actionable = relevantAssignments.length - abstained;
  const reviewerProgress = new Map<
    string,
    {
      reviewerId: string;
      roundId: string;
      assigned: number;
      inProgress: number;
      submitted: number;
      abstained: number;
      completionPercent: number;
      outstanding: number;
    }
  >();
  for (const assignment of relevantAssignments) {
    const status = assignment.status;
    const key = `${assignment.reviewerId}\u0000${assignment.roundId}`;
    const current = reviewerProgress.get(key) ?? {
      reviewerId: assignment.reviewerId,
      roundId: assignment.roundId,
      assigned: 0,
      inProgress: 0,
      submitted: 0,
      abstained: 0,
      completionPercent: 0,
      outstanding: 0,
    };
    if (status === "abstained") {
      current.abstained += 1;
    } else {
      current.assigned += 1;
      if (status === "in_progress") current.inProgress += 1;
      if (status === "submitted") current.submitted += 1;
    }
    current.outstanding = Math.max(0, current.assigned - current.submitted);
    current.completionPercent =
      current.assigned === 0 ? 0 : (current.submitted / current.assigned) * 100;
    reviewerProgress.set(key, current);
  }
  return {
    planId: plan.id,
    total: relevantAssignments.length,
    assigned: count("assigned"),
    inProgress: count("in_progress"),
    submitted,
    abstained,
    completionPercent: actionable === 0 ? 0 : (submitted / actionable) * 100,
    reviewers: [...reviewerProgress.values()].sort(
      (left, right) =>
        left.reviewerId.localeCompare(right.reviewerId) ||
        left.roundId.localeCompare(right.roundId),
    ),
  };
}
function organizerRound(plan: EvaluationPlan, now: Date): ReviewRound | undefined {
  const openRound = [...plan.rounds]
    .sort((left, right) => right.sequence - left.sequence || right.id.localeCompare(left.id))
    .find(
      (round) =>
        plan.status === "open" &&
        (round.opensAt === null ||
          round.opensAt === undefined ||
          Date.parse(round.opensAt) <= now.getTime()) &&
        (round.closesAt === null || Date.parse(round.closesAt) > now.getTime()),
    );
  return (
    openRound ??
    [...plan.rounds].sort(
      (left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id),
    )[0]
  );
}

function suggestionStorageKey(tenantId: string, suggestionId: string): string {
  return `${tenantId}\u0000${suggestionId}`;
}

function normalizeProjection(
  projection: EvaluationReviewerProjection | undefined,
): EvaluationReviewerProjection {
  const fieldIds = (projection?.fieldIds ?? projection?.visibleFieldIds ?? []).map((fieldId) =>
    requireText(fieldId, "Projection field id", 100),
  );
  const fileIds = (projection?.fileIds ?? projection?.visibleFileIds ?? []).map((fileId) =>
    requireText(fileId, "Projection file id", 100),
  );
  if (new Set(fieldIds).size !== fieldIds.length || new Set(fileIds).size !== fileIds.length) {
    throw invalidInput("Reviewer projection ids must be unique.");
  }
  return { fieldIds, fileIds };
}

function providerFunction(
  provider: EvaluationAiSuggestionProvider | EvaluationSuggestionProducer | undefined,
  direct: EvaluationSuggestionProducer | undefined,
): EvaluationSuggestionProducer | undefined {
  if (typeof provider === "function") return provider;
  return (
    direct ??
    provider?.generate ??
    provider?.suggest ??
    provider?.produce ??
    provider?.generateSuggestions
  );
}
function decisionProjectionIdempotencyKey(submissionId: string, decisionVersion: number): string {
  return `evaluation-decision:${submissionId}:v${decisionVersion}`;
}

function decisionTemplatePurpose(
  status: EvaluationDecisionStatus,
): EvaluationDecisionCommunicationTemplatePurpose {
  if (status === "accepted") return "decision_accepted";
  if (status === "waitlisted") return "decision_waitlisted";
  return "decision_rejected";
}

export class EvaluationService {
  readonly #acceptanceHandoff: EvaluationAcceptanceHandoff | undefined;
  readonly #decisionProjection: EvaluationDecisionProjection | undefined;
  readonly #projectedDecisionKeys = new Set<string>();
  readonly #acceptedHandoffKeys = new Set<string>();
  readonly #decisionProjectionInFlight = new Map<string, Promise<void>>();
  readonly #acceptanceHandoffInFlight = new Map<string, Promise<void>>();
  readonly #repository: EvaluationRepository;
  readonly #submissions: SubmissionReviewSource;
  readonly #clock: () => Date;
  readonly #aiSuggestionProvider:
    | EvaluationAiSuggestionProvider
    | EvaluationSuggestionProducer
    | undefined;
  readonly #aiSuggestionProducer: EvaluationSuggestionProducer | undefined;
  readonly #suggestions = new Map<string, EvaluationSuggestion>();

  constructor(
    repository: EvaluationRepository,
    submissions: SubmissionReviewSource,
    options: EvaluationServiceOptions = {},
  ) {
    this.#repository = repository;
    this.#submissions = submissions;
    this.#clock = options.clock ?? (() => new Date());
    this.#acceptanceHandoff = options.acceptanceHandoff;
    this.#decisionProjection = options.decisionProjection;
    this.#aiSuggestionProvider = options.aiSuggestionProvider ?? options.suggestionProvider;
    this.#aiSuggestionProducer = providerFunction(
      this.#aiSuggestionProvider,
      options.aiSuggestionProducer,
    );
  }
  async listPlans(actor: EvaluationActor, eventId?: string): Promise<readonly EvaluationPlan[]> {
    if (actor.kind !== "human") throw forbidden();
    const plans = await this.#repository.listPlans(actor.tenantId, eventId);
    return plans
      .filter((plan) => eventId === undefined || plan.eventId === eventId)
      .filter(
        (plan) =>
          hasRole(actor, plan.eventId, "organizer") || hasRole(actor, plan.eventId, "reviewer"),
      )
      .sort(
        (left, right) =>
          left.updatedAt.localeCompare(right.updatedAt) || left.id.localeCompare(right.id),
      );
  }

  async getPlan(actor: EvaluationActor, planId: string): Promise<EvaluationPlan> {
    const plan = await this.#getPlan(actor.tenantId, planId);
    if (
      actor.kind !== "human" ||
      (!hasRole(actor, plan.eventId, "organizer") && !hasRole(actor, plan.eventId, "reviewer"))
    ) {
      throw forbidden();
    }
    return plan;
  }

  async getDecision(
    actor: EvaluationActor,
    planId: string,
    submissionId: string,
  ): Promise<EvaluationDecision | null> {
    const plan = await this.#getPlan(actor.tenantId, planId);
    requireHumanOrganizer(actor, plan.eventId);
    return this.#repository.getDecision(
      actor.tenantId,
      plan.id,
      requireText(submissionId, "Submission id", MAX_SUBMISSION_ID_LENGTH),
    );
  }

  async listOrganizerSubmissions(
    actor: EvaluationActor,
    eventId: string,
  ): Promise<readonly EvaluationSubmissionRecord[]> {
    requireHumanOrganizer(actor, requireText(eventId, "Event id", 100));
    const source = this.#submissions as SubmissionReviewSource & EvaluationSubmissionSource;
    if (source.listSubmissionsForOrganizer === undefined) return [];
    return source.listSubmissionsForOrganizer(actor.tenantId, eventId);
  }
  async getOrganizerWorkspace(
    actor: EvaluationActor,
    eventId: string,
    preferredPlanId?: string,
  ): Promise<EvaluationOrganizerWorkspace> {
    const normalizedEventId = requireText(eventId, "Event id", 100);
    requireHumanOrganizer(actor, normalizedEventId);
    const normalizedPreferredPlanId =
      preferredPlanId === undefined ? undefined : requireText(preferredPlanId, "Plan id", 100);
    const listedPlans = await this.#repository.listPlans(actor.tenantId, normalizedEventId);
    const plans = listedPlans.filter(
      (plan) => plan.tenantId === actor.tenantId && plan.eventId === normalizedEventId,
    );
    const preferredPlan =
      normalizedPreferredPlanId === undefined
        ? undefined
        : plans.find((plan) => plan.id === normalizedPreferredPlanId);
    const plan =
      preferredPlan ??
      [...plans].sort(
        (left, right) =>
          (right.status === "open" ? 1 : 0) - (left.status === "open" ? 1 : 0) ||
          right.updatedAt.localeCompare(left.updatedAt) ||
          right.id.localeCompare(left.id),
      )[0];
    if (plan === undefined) {
      throw notFound("No evaluation plan was found for this event.");
    }
    const [listedSubmissions, batchedWorkspaceRecords] = await Promise.all([
      this.listOrganizerSubmissions(actor, normalizedEventId),
      this.#repository
        .listOrganizerWorkspaceRecords(actor.tenantId, normalizedEventId)
        .catch(() => null),
    ]);
    let workspaceRecords: OrganizerWorkspaceRecords;
    if (batchedWorkspaceRecords === null) {
      const [assignments, reviews] = await Promise.all([
        this.#repository.listAssignments(actor.tenantId, plan.id),
        this.#repository.listReviews(actor.tenantId, plan.id),
      ]);
      workspaceRecords = { assignments, reviews, decisions: [] };
    } else {
      workspaceRecords = batchedWorkspaceRecords;
    }
    const diagnostics =
      batchedWorkspaceRecords === null
        ? [
            {
              code: "decisions_unavailable" as const,
              message: "Decision data is temporarily unavailable.",
            },
          ]
        : undefined;
    const submissions = [
      ...new Map(
        listedSubmissions
          .filter(
            (submission) =>
              submission.tenantId === actor.tenantId && submission.eventId === normalizedEventId,
          )
          .map((submission) => [submission.id, submission] as const),
      ).values(),
    ];
    const assignments = workspaceRecords.assignments.filter(
      (assignment) =>
        assignment.tenantId === actor.tenantId &&
        assignment.eventId === normalizedEventId &&
        assignment.planId === plan.id,
    );
    const reviews = workspaceRecords.reviews.filter(
      (review) =>
        review.tenantId === actor.tenantId &&
        review.eventId === normalizedEventId &&
        review.planId === plan.id,
    );
    const effectiveAssignments = effectiveAssignmentsForPlan(plan, assignments, reviews);
    const round = organizerRound(plan, this.#clock());
    const aggregates =
      round === undefined
        ? []
        : [...submissions]
            .sort((left, right) => left.id.localeCompare(right.id))
            .map((submission) =>
              aggregateForSubmission(plan, round, submission.id, assignments, reviews),
            );
    const decisions = Object.fromEntries(
      workspaceRecords.decisions
        .filter(
          (decision) =>
            decision.tenantId === actor.tenantId &&
            decision.eventId === normalizedEventId &&
            decision.planId === plan.id,
        )
        .map((decision) => [decision.submissionId, decision] as const),
    );
    return {
      plan,
      submissions,
      assignments: effectiveAssignments,
      progress: progressForAssignments(plan, effectiveAssignments),
      aggregates,
      decisions,
      ...(diagnostics === undefined ? {} : { diagnostics }),
    };
  }

  async reopenSubmission(
    actor: EvaluationActor,
    eventId: string,
    submissionId: string,
    input: {
      readonly expectedVersion: number;
      readonly reason: string;
      readonly idempotencyKey: string;
    },
  ): Promise<EvaluationSubmissionRecord> {
    const normalizedEventId = requireText(eventId, "Event id", 100);
    requireHumanOrganizer(actor, normalizedEventId);
    const source = this.#submissions as SubmissionReviewSource & EvaluationSubmissionSource;
    if (source.reopenSubmission === undefined) {
      throw notFound("Submission reopen is not configured.");
    }
    return source.reopenSubmission(
      actor.tenantId,
      normalizedEventId,
      requireText(submissionId, "Submission id", MAX_SUBMISSION_ID_LENGTH),
      {
        organizerId: actor.userId,
        expectedVersion: input.expectedVersion,
        reason: input.reason,
        idempotencyKey: requireText(input.idempotencyKey, "Idempotency key", 200),
      },
    );
  }

  async createPlan(
    actor: EvaluationActor,
    input: CreateEvaluationPlanInput,
  ): Promise<EvaluationPlan> {
    requireHumanOrganizer(actor, input.eventId);
    const id = requireText(input.id, "Plan id", 100);
    const eventId = requireText(input.eventId, "Event id", 100);
    const name = requireText(input.name, "Plan name", 200);
    requireInstant(input.closesAt, "Plan close date");
    requirePositiveInteger(input.assignmentRule.reviewsPerSubmission, "Reviews per submission");
    requirePositiveInteger(
      input.assignmentRule.maxAssignmentsPerReviewer,
      "Maximum assignments per reviewer",
    );
    validateRounds(input.rounds);
    const reviewerProjection = normalizeProjection(
      input.reviewerProjection ?? input.evaluatorProjection ?? input.projection,
    );
    if (await this.#repository.getPlan(actor.tenantId, id)) {
      throw conflict("An evaluation plan with this id already exists.");
    }

    const now = this.#clock().toISOString();
    const plan: EvaluationPlan = {
      id,
      tenantId: actor.tenantId,
      eventId,
      name,
      status: "draft",
      blindReview: input.blindReview || roundsRequireBlind(input.rounds),
      closesAt: input.closesAt,
      assignmentRule: { ...input.assignmentRule },
      rounds: structuredClone(input.rounds),
      reviewerProjection,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await this.#repository.putPlan(plan, null);
    return plan;
  }
  async updatePlan(
    actor: EvaluationActor,
    planId: string,
    input: UpdateEvaluationPlanInput,
  ): Promise<EvaluationPlan> {
    const plan = await this.#getPlan(actor.tenantId, planId);
    requireHumanOrganizer(actor, plan.eventId);
    if (
      plan.status !== "draft" ||
      (plan.gradingLockedAt !== undefined && plan.gradingLockedAt !== null)
    ) {
      throw conflict("An evaluation plan is locked after it opens.");
    }
    if (plan.version !== input.expectedVersion) {
      throw conflict("Evaluation plan changed since it was loaded.");
    }
    const name = input.name === undefined ? plan.name : requireText(input.name, "Plan name", 200);
    const closesAt = input.closesAt === undefined ? plan.closesAt : input.closesAt;
    requireInstant(closesAt, "Plan close date");
    const assignmentRule = input.assignmentRule ?? plan.assignmentRule;
    requirePositiveInteger(assignmentRule.reviewsPerSubmission, "Reviews per submission");
    requirePositiveInteger(
      assignmentRule.maxAssignmentsPerReviewer,
      "Maximum assignments per reviewer",
    );
    const rounds = input.rounds === undefined ? plan.rounds : input.rounds;
    validateRounds(rounds);
    const reviewerProjectionInput =
      input.reviewerProjection ?? input.evaluatorProjection ?? input.projection;
    const reviewerProjection = normalizeProjection(
      reviewerProjectionInput ??
        plan.reviewerProjection ??
        plan.evaluatorProjection ??
        plan.projection,
    );
    const now = this.#clock().toISOString();
    const updated: EvaluationPlan = {
      ...plan,
      name,
      blindReview: roundsRequireBlind(rounds) || (input.blindReview ?? plan.blindReview),
      closesAt,
      assignmentRule: { ...assignmentRule },
      rounds: structuredClone(rounds),
      reviewerProjection,
      version: plan.version + 1,
      updatedAt: now,
    };
    await this.#repository.putPlan(updated, plan.version);
    this.#markSuggestionsStaleForPlan(plan.id, now, actor.userId);
    return updated;
  }

  async updateEvaluationPlan(
    actor: EvaluationActor,
    planId: string,
    input: UpdateEvaluationPlanInput,
  ): Promise<EvaluationPlan> {
    return this.updatePlan(actor, planId, input);
  }

  async openPlan(
    actor: EvaluationActor,
    planId: string,
    expectedVersion: number,
  ): Promise<EvaluationPlan> {
    const plan = await this.#getPlan(actor.tenantId, planId);
    requireHumanOrganizer(actor, plan.eventId);
    if (plan.status !== "draft") {
      throw conflict("Only a draft evaluation plan can be opened.");
    }
    if (plan.version !== expectedVersion) {
      throw conflict("Evaluation plan changed since it was loaded.");
    }
    const now = this.#clock();
    const gradingLockedAt = now.toISOString();
    if (plan.closesAt !== null && Date.parse(plan.closesAt) <= now.getTime()) {
      throw closed("The evaluation plan close date has passed.");
    }
    const updated: EvaluationPlan = {
      ...plan,
      status: "open",
      gradingLockedAt,
      version: plan.version + 1,
      updatedAt: now.toISOString(),
    };
    await this.#repository.putPlan(updated, plan.version);
    return updated;
  }

  async closePlan(
    actor: EvaluationActor,
    planId: string,
    expectedVersion: number,
  ): Promise<EvaluationPlan> {
    const plan = await this.#getPlan(actor.tenantId, planId);
    requireHumanOrganizer(actor, plan.eventId);
    if (plan.status !== "open") {
      throw conflict("Only an open evaluation plan can be closed.");
    }
    if (plan.version !== expectedVersion) {
      throw conflict("Evaluation plan changed since it was loaded.");
    }
    const updated: EvaluationPlan = {
      ...plan,
      status: "closed",
      version: plan.version + 1,
      updatedAt: this.#clock().toISOString(),
    };
    await this.#repository.putPlan(updated, plan.version);
    return updated;
  }

  async assignReviewers(
    actor: EvaluationActor,
    input: AssignReviewersInput,
  ): Promise<readonly EvaluationAssignment[]> {
    const plan = await this.#getPlan(actor.tenantId, input.planId);
    requireHumanOrganizer(actor, plan.eventId);
    const round = findRound(plan, input.roundId);
    if (input.expectedVersion !== undefined && plan.version !== input.expectedVersion) {
      throw conflict("Evaluation plan changed since it was loaded.");
    }
    if (plan.status !== "open") {
      throw closed("Assignments require an open evaluation plan.");
    }
    const submissionId = requireText(input.submissionId, "Submission id", MAX_SUBMISSION_ID_LENGTH);
    const assignedSubmission = await this.#submissions.getSubmissionForReview(
      actor.tenantId,
      plan.eventId,
      submissionId,
    );
    if (assignedSubmission === null) {
      throw notFound("The submission to assign was not found.");
    }
    const submissionRevision = await this.#submissionRevision(
      actor.tenantId,
      plan.eventId,
      submissionId,
      assignedSubmission.version ?? assignedSubmission.revision,
    );
    if (input.reviewerIds.length === 0) {
      throw invalidInput("At least one reviewer must be assigned.");
    }
    const reviewerIds = input.reviewerIds.map((reviewerId) =>
      requireText(reviewerId, "Reviewer id", 100),
    );
    if (new Set(reviewerIds).size !== reviewerIds.length) {
      throw invalidInput("Reviewer ids must be unique.");
    }
    const reviewerPool = round.reviewerPool?.reviewerIds;
    if (
      reviewerPool !== undefined &&
      reviewerIds.some((reviewerId) => !reviewerPool.includes(reviewerId))
    ) {
      throw forbidden("Every assigned reviewer must belong to this round's reviewer pool.");
    }

    const allAssignments = (await this.#repository.listAssignments(actor.tenantId, plan.id)).filter(
      (assignment) => assignment.eventId === plan.eventId,
    );
    const targetAssignments = allAssignments.filter(
      (assignment) =>
        assignment.roundId === input.roundId &&
        assignment.submissionId === submissionId &&
        assignment.status !== "abstained",
    );
    const existingByReviewer = new Map(
      targetAssignments.map((assignment) => [assignment.reviewerId, assignment]),
    );
    const abstainedReviewerIds = new Set(
      allAssignments
        .filter(
          (assignment) =>
            assignment.roundId === input.roundId &&
            assignment.submissionId === submissionId &&
            assignment.status === "abstained",
        )
        .map((assignment) => assignment.reviewerId),
    );
    if (reviewerIds.some((reviewerId) => abstainedReviewerIds.has(reviewerId))) {
      throw conflict("A reviewer who declared a conflict cannot be reassigned.");
    }
    const newReviewerIds = reviewerIds.filter((reviewerId) => !existingByReviewer.has(reviewerId));
    if (
      targetAssignments.length + newReviewerIds.length >
      plan.assignmentRule.reviewsPerSubmission
    ) {
      throw conflict("The plan review limit for this submission would be exceeded.");
    }

    const now = this.#clock().toISOString();
    const created: EvaluationAssignment[] = [];
    for (const reviewerId of newReviewerIds) {
      const reviewerLoad = allAssignments.filter(
        (assignment) => assignment.reviewerId === reviewerId && assignment.status !== "abstained",
      ).length;
      if (reviewerLoad >= plan.assignmentRule.maxAssignmentsPerReviewer) {
        throw conflict(`Reviewer ${reviewerId} has reached the plan assignment limit.`);
      }
      const assignment: EvaluationAssignment = {
        id: `${plan.id}:${input.roundId}:${submissionId}:${reviewerId}`,
        tenantId: actor.tenantId,
        eventId: plan.eventId,
        planId: plan.id,
        roundId: input.roundId,
        submissionId,
        reviewerId,
        status: "assigned",
        planVersion: plan.version,
        rubricRevision: plan.version,
        submissionRevision,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      created.push(assignment);
    }
    if (created.length > 0) {
      await this.#repository.putAssignments(created);
    }

    return reviewerIds.map((reviewerId) => {
      const assignment =
        existingByReviewer.get(reviewerId) ??
        created.find((candidate) => candidate.reviewerId === reviewerId);
      if (assignment === undefined) {
        throw conflict("The reviewer assignment could not be created.");
      }
      return assignment;
    });
  }

  async listReviewerAssignments(
    actor: EvaluationActor,
    planId: string,
  ): Promise<readonly EvaluationAssignment[]> {
    const plan = await this.#getPlan(actor.tenantId, planId);
    if (actor.kind !== "human" || !hasRole(actor, plan.eventId, "reviewer")) {
      throw forbidden();
    }
    const assignments = await this.#repository.listAssignments(actor.tenantId, plan.id);
    return assignments
      .filter(
        (assignment) =>
          assignment.planId === plan.id &&
          assignment.eventId === plan.eventId &&
          assignment.reviewerId === actor.userId &&
          assignment.status !== "abstained",
      )
      .sort(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
      );
  }
  async listReviewerWorkspace(
    actor: EvaluationActor,
    eventId?: string,
  ): Promise<EvaluationReviewerWorkspace> {
    if (actor.kind !== "human") throw forbidden();
    const normalizedEventId =
      eventId === undefined ? undefined : requireText(eventId, "Event id", 100);
    if (normalizedEventId !== undefined && !hasRole(actor, normalizedEventId, "reviewer")) {
      throw forbidden();
    }
    const reviewerEventIds = [
      ...new Set(
        actor.grants.filter((grant) => grant.role === "reviewer").map((grant) => grant.eventId),
      ),
    ];
    if (normalizedEventId === undefined && reviewerEventIds.length === 0) {
      throw forbidden();
    }
    const allowedEventIds =
      normalizedEventId === undefined ? reviewerEventIds : [normalizedEventId];
    const [listedPlans, workspaceRecords] = await Promise.all([
      this.#repository.listPlans(actor.tenantId, normalizedEventId),
      this.#repository.listReviewerWorkspaceRecords(actor.tenantId, actor.userId, allowedEventIds),
    ]);
    const reviewerPlans = listedPlans
      .filter(
        (plan) =>
          (normalizedEventId === undefined || plan.eventId === normalizedEventId) &&
          hasRole(actor, plan.eventId, "reviewer"),
      )
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id),
      );
    if (reviewerPlans.length === 0) return { assignments: [] };

    const openPlans = reviewerPlans.filter((plan) => plan.status === "open");
    const plans = openPlans.length > 0 ? openPlans : reviewerPlans;
    const planRecords = plans.map((plan) => {
      const assignments = workspaceRecords.assignments.filter(
        (assignment) =>
          assignment.tenantId === actor.tenantId &&
          assignment.planId === plan.id &&
          assignment.eventId === plan.eventId &&
          assignment.reviewerId === actor.userId &&
          assignment.status !== "abstained",
      );
      const ownAssignmentIds = new Set(assignments.map((assignment) => assignment.id));
      const reviewsByAssignment = new Map(
        workspaceRecords.reviews
          .filter(
            (review) =>
              review.tenantId === actor.tenantId &&
              ownAssignmentIds.has(review.assignmentId) &&
              review.planId === plan.id &&
              review.eventId === plan.eventId &&
              review.reviewerId === actor.userId,
          )
          .map((review) => [review.assignmentId, review] as const),
      );
      return {
        plan,
        assignments: assignments.map((assignment) => {
          const review = reviewsByAssignment.get(assignment.id);
          const authoritativeAssignment =
            review?.submittedAt === null || review === undefined
              ? assignment
              : { ...assignment, status: "submitted" as const };
          return { assignment: authoritativeAssignment, review };
        }),
      };
    });
    const candidates = planRecords.flatMap(({ plan, assignments }) =>
      assignments.map(({ assignment, review }) => ({ plan, assignment, review })),
    );
    if (candidates.length === 0) return { assignments: [] };

    const lookupByKey = new Map<
      string,
      { readonly eventId: string; readonly submissionId: string }
    >();
    for (const { assignment } of candidates) {
      const key = `${assignment.eventId}\u0000${assignment.submissionId}`;
      if (!lookupByKey.has(key)) {
        lookupByKey.set(key, {
          eventId: assignment.eventId,
          submissionId: assignment.submissionId,
        });
      }
    }
    const materials = await this.#submissions.getSubmissionsForReview(actor.tenantId, [
      ...lookupByKey.values(),
    ]);
    const materialByKey = new Map<string, SubmissionReviewMaterial>(
      materials.map((material) => [`${material.eventId}\u0000${material.id}`, material]),
    );

    const contexts = await Promise.all(
      candidates.map(async ({ plan, assignment, review }) => {
        const materialKey = `${assignment.eventId}\u0000${assignment.submissionId}`;
        const material = materialByKey.get(materialKey);
        if (
          material === undefined ||
          material.tenantId !== actor.tenantId ||
          material.eventId !== plan.eventId
        ) {
          throw notFound("The assigned submission was not found.");
        }
        const materialRevision = material.version ?? material.revision;
        const submissionRevision =
          materialRevision !== undefined &&
          Number.isSafeInteger(materialRevision) &&
          materialRevision > 0
            ? materialRevision
            : 1;
        const round = findRound(plan, assignment.roundId);
        const suggestions = await this.#listSuggestionsForAssignment(
          actor,
          assignment,
          plan,
          round,
          submissionRevision,
        );
        return {
          assignment,
          round,
          submission: this.#visibleSubmission(plan, round, material),
          review: review ?? null,
          rubricRevision: plan.version,
          submissionRevision,
          suggestions,
          plan: {
            id: plan.id,
            eventId: plan.eventId,
            name: plan.name,
            status: plan.status,
            blindReview: plan.blindReview,
            createdAt: plan.createdAt,
            updatedAt: plan.updatedAt,
          },
        };
      }),
    );
    return {
      assignments: contexts.sort(
        (left, right) =>
          left.assignment.eventId.localeCompare(right.assignment.eventId) ||
          left.plan.name.localeCompare(right.plan.name) ||
          left.round.name.localeCompare(right.round.name) ||
          left.submission.title.localeCompare(right.submission.title) ||
          left.assignment.id.localeCompare(right.assignment.id),
      ),
    };
  }
  async listOrganizerAssignments(
    actor: EvaluationActor,
    planId: string,
  ): Promise<readonly EvaluationAssignment[]> {
    const plan = await this.#getPlan(actor.tenantId, planId);
    requireHumanOrganizer(actor, plan.eventId);
    return [...(await this.#repository.listAssignments(actor.tenantId, plan.id))]
      .filter((assignment) => assignment.eventId === plan.eventId)
      .sort(
        (left: EvaluationAssignment, right: EvaluationAssignment) =>
          left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
      );
  }
  async unassignAssignment(
    actor: EvaluationActor,
    planId: string,
    assignmentId: string,
  ): Promise<void> {
    const plan = await this.#getPlan(actor.tenantId, planId);
    requireHumanOrganizer(actor, plan.eventId);
    const assignment = await this.#getAssignment(actor.tenantId, assignmentId);
    if (
      assignment.tenantId !== actor.tenantId ||
      assignment.planId !== plan.id ||
      assignment.eventId !== plan.eventId
    ) {
      throw notFound("The evaluation assignment was not found.");
    }
    const review = await this.#repository.getReview(actor.tenantId, assignment.id);
    if (review !== null && review.submittedAt !== null) {
      throw conflict("A submitted review cannot be unassigned.");
    }
    if (assignment.status !== "assigned" && assignment.status !== "in_progress") {
      throw conflict("Only outstanding assignments can be unassigned.");
    }
    await this.#repository.deleteAssignment(actor.tenantId, assignment.id, assignment.version);
  }
  async getReviewContext(actor: EvaluationActor, assignmentId: string): Promise<ReviewContext> {
    const assignment = await this.#getAssignment(actor.tenantId, assignmentId);
    requireHumanReviewer(actor, assignment);
    if (await this.#repository.getConflict(actor.tenantId, assignment.id)) {
      throw forbidden("A conflict declaration removes access to this submission.");
    }
    const plan = await this.#getPlan(actor.tenantId, assignment.planId);
    const round = findRound(plan, assignment.roundId);
    const material = await this.#submissions.getSubmissionForReview(
      actor.tenantId,
      assignment.eventId,
      assignment.submissionId,
    );
    if (material === null) {
      throw notFound("The assigned submission was not found.");
    }
    const review = await this.#repository.getReview(actor.tenantId, assignment.id);
    const submissionRevision = await this.#submissionRevision(
      actor.tenantId,
      assignment.eventId,
      assignment.submissionId,
      material.version ?? material.revision,
    );
    const suggestions = await this.#listSuggestionsForAssignment(
      actor,
      assignment,
      plan,
      round,
      submissionRevision,
    );
    const authoritativeAssignment =
      review?.submittedAt === null || review === null
        ? assignment
        : { ...assignment, status: "submitted" as const };
    return {
      assignment: authoritativeAssignment,
      round,
      submission: this.#visibleSubmission(plan, round, material),
      review,
      rubricRevision: plan.version,
      submissionRevision,
      suggestions,
    };
  }

  async saveReview(
    actor: EvaluationActor,
    assignmentId: string,
    input: SaveReviewInput,
  ): Promise<EvaluationReview> {
    const { assignment, plan, round } = await this.#getWritableAssignment(actor, assignmentId);
    if (assignment.status === "submitted") {
      throw conflict("A submitted review cannot be edited.");
    }
    const current = await this.#repository.getReview(actor.tenantId, assignment.id);
    const submission = await this.#submissions.getSubmissionForReview(
      actor.tenantId,
      assignment.eventId,
      assignment.submissionId,
    );
    const submissionRevision = await this.#submissionRevision(
      actor.tenantId,
      assignment.eventId,
      assignment.submissionId,
      submission?.version ?? submission?.revision,
    );
    this.#assertExpectedReviewVersion(current, input.expectedVersion);
    if (input.scores.length === 0 && input.comment === undefined) {
      throw invalidInput("An autosave must contain a score or comment change.");
    }

    const now = this.#clock().toISOString();
    const scores: Record<string, RubricScore> = { ...(current?.scores ?? {}) };
    const criterionById = new Map(
      round.rubric.criteria.map((criterion) => [criterion.id, criterion]),
    );
    const changedCriterionIds = new Set<string>();
    for (const inputScore of input.scores) {
      if (changedCriterionIds.has(inputScore.criterionId)) {
        throw invalidInput("Each criterion can be changed only once per autosave.");
      }
      changedCriterionIds.add(inputScore.criterionId);
      const criterion = criterionById.get(inputScore.criterionId);
      if (criterion === undefined) {
        throw invalidInput("A score references a criterion outside this review round.");
      }
      const inputType = criterion.inputType ?? "numeric";
      let value: number | string;
      if (inputType === "free_text") {
        if (inputScore.origin !== "human" || typeof inputScore.value !== "string") {
          throw invalidInput("Free-text criteria require a human text response.");
        }
        value = requireText(inputScore.value, `Response ${criterion.id}`, 10_000);
      } else if (inputType === "dropdown") {
        value = normalizeDropdownValue(criterion, inputScore.value);
      } else {
        if (
          typeof inputScore.value !== "number" ||
          !Number.isFinite(inputScore.value) ||
          inputScore.value < criterion.minimum ||
          inputScore.value > criterion.maximum
        ) {
          throw invalidInput(
            `Score ${criterion.id} must be between ${criterion.minimum} and ${criterion.maximum}.`,
          );
        }
        value = inputScore.value;
      }
      const evidence = (inputScore.evidence ?? []).map((citation) =>
        requireText(citation, "Score evidence", 2_000),
      );
      if (inputScore.origin === "ai" && evidence.length === 0) {
        throw invalidInput("AI score suggestions must cite rubric evidence.");
      }
      scores[criterion.id] = {
        criterionId: criterion.id,
        value,
        origin: inputScore.origin,
        evidence,
        humanConfirmedBy: inputScore.origin === "human" ? actor.userId : null,
        ...(inputScore.origin === "ai"
          ? {
              suggestionId: `legacy:${assignment.id}:${criterion.id}`,
              suggestionStatus: "pending" as const,
              rubricRevision: plan.version,
              submissionRevision,
            }
          : {}),
        rubricRevision: plan.version,
        submissionRevision,
        rubricVersion: plan.version,
        submissionVersion: submissionRevision,
        updatedAt: now,
      };
    }

    const comment = input.comment === undefined ? (current?.comment ?? "") : input.comment.trim();
    if (comment.length > 10_000) {
      throw invalidInput("Review comments cannot exceed 10000 characters.");
    }
    const existingVersion = current?.version ?? 0;
    const review: EvaluationReview = {
      id: current?.id ?? `review:${assignment.id}`,
      tenantId: actor.tenantId,
      eventId: assignment.eventId,
      planId: plan.id,
      roundId: round.id,
      assignmentId: assignment.id,
      submissionId: assignment.submissionId,
      reviewerId: actor.userId,
      scores,
      comment,
      submittedAt: null,
      version: existingVersion + 1,
      planRevision: plan.version,
      rubricRevision: plan.version,
      submissionRevision,
      planVersion: plan.version,
      rubricVersion: plan.version,
      submissionVersion: submissionRevision,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };
    if (assignment.status === "assigned") {
      await this.#repository.saveReviewDraft(
        {
          ...assignment,
          status: "in_progress",
          version: assignment.version + 1,
          updatedAt: now,
        },
        assignment.version,
        review,
        current?.version ?? null,
      );
    } else {
      await this.#repository.putReview(review, current?.version ?? null);
    }
    return review;
  }

  async confirmAiScores(
    actor: EvaluationActor,
    assignmentId: string,
    criterionIds: readonly string[],
    expectedVersion: number,
  ): Promise<EvaluationReview> {
    const { assignment } = await this.#getWritableAssignment(actor, assignmentId);
    if (assignment.status === "submitted") {
      throw conflict("A submitted review cannot be edited.");
    }
    if (criterionIds.length === 0 || new Set(criterionIds).size !== criterionIds.length) {
      throw invalidInput("Provide one or more unique criterion ids to confirm.");
    }
    const current = await this.#repository.getReview(actor.tenantId, assignment.id);
    if (current === null) {
      throw notFound("The review draft was not found.");
    }
    if (current.version !== expectedVersion) {
      throw conflict("Review changed since it was loaded.");
    }
    const now = this.#clock().toISOString();
    const scores: Record<string, RubricScore> = { ...current.scores };
    for (const criterionId of criterionIds) {
      const score = scores[criterionId];
      if (
        score === undefined ||
        score.origin !== "ai" ||
        score.suggestionStatus === "stale" ||
        score.suggestionStatus === "rejected"
      ) {
        throw invalidInput("Only existing AI score suggestions can be confirmed.");
      }
      scores[criterionId] = {
        ...score,
        origin: "human",
        suggestionStatus: "accepted",
        humanConfirmedBy: actor.userId,
        updatedAt: now,
      };
    }
    const review: EvaluationReview = {
      ...current,
      scores,
      version: current.version + 1,
      updatedAt: now,
    };
    await this.#repository.putReview(review, current.version);
    return review;
  }
  async generateAiSuggestions(
    actor: EvaluationActor,
    input: GenerateEvaluationSuggestionsInput | string,
  ): Promise<EvaluationSuggestion> {
    const assignmentId = typeof input === "string" ? input : input.assignmentId;
    const assignment = await this.#getAssignment(actor.tenantId, assignmentId);
    requireHumanReviewer(actor, assignment);
    const { plan, round } = await this.#assignmentContext(assignment);
    if (assignment.status === "submitted") {
      throw conflict("A submitted review cannot receive AI suggestions.");
    }
    assertPlanIsWritable(plan, round, this.#clock());
    const material = await this.#submissions.getSubmissionForReview(
      actor.tenantId,
      assignment.eventId,
      assignment.submissionId,
    );
    if (material === null) throw notFound("The assigned submission was not found.");
    const producer = this.#aiSuggestionProducer;
    if (producer === undefined) {
      throw forbidden("AI evaluation suggestions are not configured.");
    }
    const submissionRevision = await this.#submissionRevision(
      actor.tenantId,
      assignment.eventId,
      assignment.submissionId,
      material.version ?? material.revision,
    );
    const providerInput: EvaluationSuggestionProviderInput = {
      tenantId: actor.tenantId,
      eventId: assignment.eventId,
      planId: plan.id,
      roundId: round.id,
      assignmentId: assignment.id,
      submissionId: assignment.submissionId,
      rubricRevision: plan.version,
      submissionRevision,
      planRevision: plan.version,
      rubricId: round.rubric.id,
      submissionVersion: submissionRevision,
      round,
      submission: this.#visibleSubmission(plan, round, material),
    };
    const result = await producer(providerInput);
    const candidates = this.#normalizeProviderCandidates(result, round, providerInput);
    const now = this.#clock().toISOString();
    const provenance: EvaluationSuggestionProvenance = {
      provider: result.provenance?.provider ?? "injected",
      model: result.provenance?.model ?? "unspecified",
      generatedAt: result.provenance?.generatedAt ?? now,
      sourceReferences:
        result.provenance?.sourceReferences ??
        candidates.flatMap((candidate) => candidate.evidence),
      ...(result.provenance?.promptVersion === undefined
        ? {}
        : { promptVersion: result.provenance.promptVersion }),
      ...(result.provenance?.traceId === undefined ? {} : { traceId: result.provenance.traceId }),
    };
    const finalizedCandidates = candidates.map((candidate) => ({
      ...candidate,
      provenance: candidate.provenance ?? provenance,
    }));
    const byCriterion: Record<string, EvaluationSuggestionCandidate[]> = {};
    for (const candidate of finalizedCandidates) {
      const criterionCandidates = byCriterion[candidate.criterionId];
      if (criterionCandidates === undefined) {
        byCriterion[candidate.criterionId] = [candidate];
      } else {
        criterionCandidates.push(candidate);
      }
    }
    const suggestionId = `suggestion:${assignment.id}:${Date.now()}:${this.#suggestions.size + 1}`;
    const auditEntry: EvaluationSuggestionAuditEntry = {
      action: "generate",
      actorId: actor.userId,
      at: now,
    };
    const suggestion: EvaluationSuggestion = {
      id: suggestionId,
      tenantId: actor.tenantId,
      eventId: assignment.eventId,
      planId: plan.id,
      roundId: round.id,
      assignmentId: assignment.id,
      submissionId: assignment.submissionId,
      reviewerId: actor.userId,
      rubricRevision: plan.version,
      submissionRevision,
      planRevision: plan.version,
      rubricId: round.rubric.id,
      submissionVersion: submissionRevision,
      candidates: byCriterion,
      criterionCandidates: finalizedCandidates,
      provenance,
      status: "pending",
      version: 1,
      history: [auditEntry],
      audit: [auditEntry],
      createdAt: now,
      updatedAt: now,
    };
    this.#suggestions.set(suggestionStorageKey(actor.tenantId, suggestion.id), suggestion);
    return structuredClone(suggestion);
  }

  async generateAiSuggestion(
    actor: EvaluationActor,
    assignmentId: string,
  ): Promise<EvaluationSuggestion> {
    return this.generateAiSuggestions(actor, { assignmentId });
  }
  async generateSuggestions(
    actor: EvaluationActor,
    input: GenerateEvaluationSuggestionsInput | string,
  ): Promise<EvaluationSuggestion> {
    return this.generateAiSuggestions(actor, input);
  }

  async listAiSuggestions(
    actor: EvaluationActor,
    assignmentId: string,
  ): Promise<readonly EvaluationSuggestion[]> {
    const assignment = await this.#getAssignment(actor.tenantId, assignmentId);
    requireHumanReviewer(actor, assignment);
    const { plan, round } = await this.#assignmentContext(assignment);
    const material = await this.#submissions.getSubmissionForReview(
      actor.tenantId,
      assignment.eventId,
      assignment.submissionId,
    );
    if (material === null) throw notFound("The assigned submission was not found.");
    const revision = await this.#submissionRevision(
      actor.tenantId,
      assignment.eventId,
      assignment.submissionId,
      material.version ?? material.revision,
    );
    return this.#listSuggestionsForAssignment(actor, assignment, plan, round, revision);
  }

  async listSuggestions(
    actor: EvaluationActor,
    assignmentId: string,
  ): Promise<readonly EvaluationSuggestion[]> {
    return this.listAiSuggestions(actor, assignmentId);
  }

  async resolveAiSuggestion(
    actor: EvaluationActor,
    suggestionIdOrAssignmentId: string,
    inputOrSuggestionId: ResolveEvaluationSuggestionInput | string,
    maybeInput?: ResolveEvaluationSuggestionInput,
  ): Promise<EvaluationSuggestionResolution> {
    const suggestionId =
      maybeInput === undefined ? suggestionIdOrAssignmentId : (inputOrSuggestionId as string);
    const input =
      maybeInput === undefined
        ? (inputOrSuggestionId as ResolveEvaluationSuggestionInput)
        : maybeInput;
    const suggestion = this.#suggestions.get(suggestionStorageKey(actor.tenantId, suggestionId));
    if (suggestion === undefined) throw notFound("The AI evaluation suggestion was not found.");
    const assignment = await this.#getAssignment(actor.tenantId, suggestion.assignmentId);
    requireHumanReviewer(actor, assignment);
    if (suggestion.reviewerId !== actor.userId) throw forbidden();
    const { plan, round } = await this.#assignmentContext(assignment);
    if (assignment.status === "submitted") {
      throw conflict("A submitted review cannot resolve AI suggestions.");
    }
    assertPlanIsWritable(plan, round, this.#clock());
    const material = await this.#submissions.getSubmissionForReview(
      actor.tenantId,
      assignment.eventId,
      assignment.submissionId,
    );
    if (material === null) throw notFound("The assigned submission was not found.");
    const submissionRevision = await this.#submissionRevision(
      actor.tenantId,
      assignment.eventId,
      assignment.submissionId,
      material.version ?? material.revision,
    );
    const stale =
      suggestion.rubricRevision !== plan.version ||
      suggestion.submissionRevision !== submissionRevision;
    if (stale) {
      const updated = this.#markSuggestionStale(
        suggestion,
        actor.userId,
        this.#clock().toISOString(),
      );
      this.#suggestions.set(suggestionStorageKey(actor.tenantId, suggestion.id), updated);
      throw conflict("The AI evaluation suggestion is stale and must be regenerated.");
    }
    if (suggestion.status !== "pending") {
      throw conflict("Only a pending AI evaluation suggestion can be resolved.");
    }
    if (input.expectedVersion !== undefined && input.expectedVersion !== suggestion.version) {
      throw conflict("The AI evaluation suggestion changed since it was loaded.");
    }
    const action = input.action;
    const reason = input.reason?.trim() ?? "";
    if ((action === "reject" || action === "edit") && reason.length === 0) {
      throw invalidInput("A reason is required when rejecting or editing an AI suggestion.");
    }
    let review: EvaluationReview | null = await this.#repository.getReview(
      actor.tenantId,
      assignment.id,
    );
    if (action === "accept" || action === "edit") {
      const values =
        action === "edit"
          ? (input.criterionScores ?? input.scores)
          : Object.fromEntries(
              Object.entries(suggestion.candidates).map(([criterionId, values]) => [
                criterionId,
                values[0]?.value,
              ]),
            );
      if (values === undefined) throw invalidInput("Provide at least one edited rubric score.");
      const scores = Object.entries(values).flatMap(([criterionId, value]) => {
        if (typeof value !== "number" || !Number.isFinite(value)) return [];
        const candidate = suggestion.candidates[criterionId]?.[0];
        return [
          {
            criterionId,
            value,
            origin: "human" as const,
            evidence: action === "accept" ? (candidate?.evidence ?? []) : [],
          },
        ];
      });
      if (scores.length === 0) throw invalidInput("Provide at least one valid rubric score.");
      review = await this.saveReview(actor, assignment.id, {
        scores,
        expectedVersion: review?.version,
      });
      const resolvedStatus = action === "accept" ? "accepted" : "edited";
      const attachedScores: Record<string, RubricScore> = { ...review?.scores };
      for (const score of scores) {
        const existing = attachedScores[score.criterionId];
        if (existing !== undefined) {
          attachedScores[score.criterionId] = {
            ...existing,
            origin: "human",
            suggestionId: suggestion.id,
            suggestionStatus: resolvedStatus,
            humanConfirmedBy: actor.userId,
            updatedAt: this.#clock().toISOString(),
          };
        }
      }
      if (review !== null) {
        const attachedReview: EvaluationReview = {
          ...review,
          scores: attachedScores,
          version: review.version + 1,
          updatedAt: this.#clock().toISOString(),
        };
        await this.#repository.putReview(attachedReview, review.version);
        review = attachedReview;
      }
    } else if (review !== null) {
      const scores: Record<string, RubricScore> = { ...review.scores };
      for (const candidate of suggestion.criterionCandidates) {
        const score = scores[candidate.criterionId];
        if (score?.suggestionId === suggestion.id || score?.suggestionStatus === "pending") {
          scores[candidate.criterionId] = {
            ...score,
            origin: "ai",
            humanConfirmedBy: null,
            suggestionId: suggestion.id,
            suggestionStatus: "rejected",
            updatedAt: this.#clock().toISOString(),
          };
        }
      }
      review = {
        ...review,
        scores,
        version: review.version + 1,
        updatedAt: this.#clock().toISOString(),
      };
      await this.#repository.putReview(review, review.version - 1);
    }
    const now = this.#clock().toISOString();
    const editedValues = input.criterionScores ?? input.scores;
    const auditEntry: EvaluationSuggestionAuditEntry = {
      action,
      actorId: actor.userId,
      at: now,
      ...(reason.length === 0 ? {} : { reason }),
      ...(action === "edit" && editedValues !== undefined
        ? { valueByCriterion: editedValues }
        : {}),
    };
    const updated: EvaluationSuggestion = {
      ...suggestion,
      status: action === "accept" ? "accepted" : action === "edit" ? "edited" : "rejected",
      version: suggestion.version + 1,
      history: [...suggestion.history, auditEntry],
      audit: [...suggestion.audit, auditEntry],
      updatedAt: now,
    };
    this.#suggestions.set(suggestionStorageKey(actor.tenantId, suggestion.id), updated);
    return {
      suggestion: structuredClone(updated),
      review: review === null ? null : structuredClone(review),
    };
  }

  async resolveSuggestion(
    actor: EvaluationActor,
    suggestionId: string,
    input: ResolveEvaluationSuggestionInput,
  ): Promise<EvaluationSuggestionResolution> {
    return this.resolveAiSuggestion(actor, suggestionId, input);
  }
  async generateSuggestion(
    actor: EvaluationActor,
    input: GenerateEvaluationSuggestionsInput,
  ): Promise<EvaluationSuggestion> {
    return this.generateAiSuggestions(actor, input);
  }

  async getSuggestions(
    actor: EvaluationActor,
    assignmentId: string,
  ): Promise<readonly EvaluationSuggestion[]> {
    return this.listAiSuggestions(actor, assignmentId);
  }

  async acceptAiSuggestion(
    actor: EvaluationActor,
    suggestionId: string,
    expectedVersion?: number,
  ): Promise<EvaluationSuggestionResolution> {
    return this.resolveAiSuggestion(actor, suggestionId, {
      action: "accept",
      expectedVersion,
    });
  }

  async editAiSuggestion(
    actor: EvaluationActor,
    suggestionId: string,
    scores: Readonly<Record<string, number>>,
    reason: string,
    expectedVersion?: number,
  ): Promise<EvaluationSuggestionResolution> {
    return this.resolveAiSuggestion(actor, suggestionId, {
      action: "edit",
      scores,
      reason,
      expectedVersion,
    });
  }

  async rejectAiSuggestion(
    actor: EvaluationActor,
    suggestionId: string,
    reason: string,
    expectedVersion?: number,
  ): Promise<EvaluationSuggestionResolution> {
    return this.resolveAiSuggestion(actor, suggestionId, {
      action: "reject",
      reason,
      expectedVersion,
    });
  }

  async submitReview(
    actor: EvaluationActor,
    assignmentId: string,
    expectedReviewVersion: number,
  ): Promise<EvaluationReview> {
    const assignment = await this.#getAssignment(actor.tenantId, assignmentId);
    requireHumanReviewer(actor, assignment);
    if (await this.#repository.getConflict(actor.tenantId, assignment.id)) {
      throw forbidden("A conflict declaration removes access to this submission.");
    }
    const current = await this.#repository.getReview(actor.tenantId, assignment.id);
    if (current !== null && current.submittedAt !== null) {
      return current;
    }
    const plan = await this.#getPlan(actor.tenantId, assignment.planId);
    const round = findRound(plan, assignment.roundId);
    assertPlanIsWritable(plan, round, this.#clock());
    if (current === null) {
      throw invalidInput("Create a review draft before submitting it.");
    }
    if (current.version !== expectedReviewVersion) {
      throw conflict("Review changed since it was loaded.");
    }
    for (const criterion of round.rubric.criteria) {
      const score = current.scores[criterion.id];
      const missingValue =
        score === undefined
          ? true
          : (criterion.inputType ?? "numeric") === "free_text"
            ? typeof score.value !== "string" || score.value.trim().length === 0
            : typeof score.value !== "number";
      if (
        criterion.required &&
        (missingValue ||
          score?.humanConfirmedBy === null ||
          score?.origin !== "human" ||
          score?.suggestionStatus === "pending" ||
          score?.suggestionStatus === "rejected" ||
          score?.suggestionStatus === "stale")
      ) {
        throw invalidInput("Every required rubric score needs human confirmation.");
      }
    }
    const now = this.#clock().toISOString();
    const review: EvaluationReview = {
      ...current,
      submittedAt: now,
      version: current.version + 1,
      updatedAt: now,
    };
    const submittedAssignment: EvaluationAssignment = {
      ...assignment,
      status: "submitted",
      version: assignment.version + 1,
      updatedAt: now,
    };
    await this.#repository.submitReview(
      submittedAssignment,
      assignment.version,
      review,
      current.version,
    );
    return review;
  }

  async declareConflict(
    actor: EvaluationActor,
    assignmentId: string,
    reason: string,
  ): Promise<EvaluationConflictDeclaration> {
    const assignment = await this.#getAssignment(actor.tenantId, assignmentId);
    requireHumanReviewer(actor, assignment);
    const existing = await this.#repository.getConflict(actor.tenantId, assignment.id);
    if (existing !== null) {
      return existing;
    }
    const now = this.#clock().toISOString();
    const declaration: EvaluationConflictDeclaration = {
      id: `conflict:${assignment.id}`,
      tenantId: actor.tenantId,
      eventId: assignment.eventId,
      planId: assignment.planId,
      assignmentId: assignment.id,
      submissionId: assignment.submissionId,
      reviewerId: actor.userId,
      reason: requireText(reason, "Conflict reason", 2_000),
      declaredAt: now,
    };
    await this.#repository.abstainAssignment(
      {
        ...assignment,
        status: "abstained",
        version: assignment.version + 1,
        updatedAt: now,
      },
      assignment.version,
      declaration,
    );
    return declaration;
  }

  async listSubmittedReviews(
    actor: EvaluationActor,
    planId: string,
    roundId: string,
    submissionId: string,
  ): Promise<readonly EvaluationReview[]> {
    const plan = await this.#getPlan(actor.tenantId, planId);
    requireHumanOrganizer(actor, plan.eventId);
    findRound(plan, roundId);
    const assignments = await this.#repository.listAssignments(actor.tenantId, plan.id);
    const assignmentIds = new Set(
      assignments
        .filter(
          (assignment) =>
            assignment.eventId === plan.eventId &&
            assignment.roundId === roundId &&
            assignment.submissionId === submissionId &&
            assignment.status !== "abstained",
        )
        .map((assignment) => assignment.id),
    );
    return (await this.#repository.listReviews(actor.tenantId, plan.id))
      .filter((review) => assignmentIds.has(review.assignmentId) && review.submittedAt !== null)
      .map((review) => ({
        ...review,
        scores: Object.fromEntries(
          Object.entries(review.scores).filter(
            ([, score]) =>
              score.origin === "human" &&
              score.humanConfirmedBy !== null &&
              score.suggestionStatus !== "pending" &&
              score.suggestionStatus !== "rejected" &&
              score.suggestionStatus !== "stale",
          ),
        ),
      }));
  }
  async getAggregate(
    actor: EvaluationActor,
    planId: string,
    roundId: string,
    submissionId: string,
  ): Promise<EvaluationAggregate> {
    const plan = await this.#getPlan(actor.tenantId, planId);
    requireHumanOrganizer(actor, plan.eventId);
    const round = findRound(plan, roundId);
    const [material, assignments, reviews] = await Promise.all([
      this.#submissions.getSubmissionForReview(actor.tenantId, plan.eventId, submissionId),
      this.#repository.listAssignments(actor.tenantId, plan.id),
      this.#repository.listReviews(actor.tenantId, plan.id),
    ]);
    if (material === null) {
      throw notFound("The submission to aggregate was not found.");
    }
    return aggregateForSubmission(plan, round, submissionId, assignments, reviews);
  }

  async listAggregates(
    actor: EvaluationActor,
    planId: string,
    roundId: string,
  ): Promise<readonly EvaluationAggregate[]> {
    const plan = await this.#getPlan(actor.tenantId, planId);
    requireHumanOrganizer(actor, plan.eventId);
    const round = findRound(plan, roundId);
    const source = this.#submissions as SubmissionReviewSource & EvaluationSubmissionSource;
    if (source.listSubmissionsForOrganizer === undefined) return [];
    const [submissions, assignments, reviews] = await Promise.all([
      source.listSubmissionsForOrganizer(actor.tenantId, plan.eventId),
      this.#repository.listAssignments(actor.tenantId, plan.id),
      this.#repository.listReviews(actor.tenantId, plan.id),
    ]);
    return [...submissions]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((submission) =>
        aggregateForSubmission(plan, round, submission.id, assignments, reviews),
      );
  }

  async getProgress(actor: EvaluationActor, planId: string): Promise<EvaluationProgress> {
    const plan = await this.#getPlan(actor.tenantId, planId);
    requireHumanOrganizer(actor, plan.eventId);
    const [allAssignments, reviews] = await Promise.all([
      this.#repository.listAssignments(actor.tenantId, plan.id),
      this.#repository.listReviews(actor.tenantId, plan.id),
    ]);
    return progressForAssignments(plan, effectiveAssignmentsForPlan(plan, allAssignments, reviews));
  }

  async recordDecision(
    actor: EvaluationActor,
    input: RecordDecisionInput,
  ): Promise<EvaluationDecision> {
    const plan = await this.#getPlan(actor.tenantId, input.planId);
    requireHumanOrganizer(actor, plan.eventId);
    const reason = requireText(input.reason, "Decision reason", 5_000);
    const idempotencyKey = requireText(input.idempotencyKey, "Idempotency key", 200);
    const submissionId = requireText(input.submissionId, "Submission id", MAX_SUBMISSION_ID_LENGTH);
    const material = await this.#submissions.getSubmissionForReview(
      actor.tenantId,
      plan.eventId,
      submissionId,
    );
    if (material === null) {
      throw notFound("The submission to decide was not found.");
    }
    if (input.status === "accepted") {
      requireAcceptableSubmission(material);
    }
    const current = await this.#repository.getDecision(actor.tenantId, plan.id, submissionId);
    const repeatedTransition = current?.history.find(
      (transition) => transition.idempotencyKey === idempotencyKey,
    );
    if (current !== null && repeatedTransition !== undefined) {
      if (repeatedTransition.to !== input.status || repeatedTransition.reason !== reason) {
        throw conflict("The decision idempotency key was already used with a different request.");
      }
      const repeatedVersion =
        current.history.findIndex((transition) => transition.idempotencyKey === idempotencyKey) + 1;
      await this.#runDecisionProjection({
        decision: current,
        transition: repeatedTransition,
        decisionVersion: repeatedVersion,
      });
      if (repeatedTransition.to === "accepted") {
        await this.#runAcceptanceHandoff({
          decision: current,
          transition: repeatedTransition,
          decisionVersion: repeatedVersion,
        });
      }
      return current;
    }
    if (current === null && input.expectedVersion !== undefined) {
      throw conflict("The decision does not exist at the expected version.");
    }
    if (current !== null && current.version !== input.expectedVersion) {
      throw conflict("Decision changed since it was loaded.");
    }
    const now = this.#clock().toISOString();
    const transition = {
      from: current?.status ?? null,
      to: input.status,
      reason,
      decidedBy: actor.userId,
      decidedAt: now,
      idempotencyKey,
    };
    const decision: EvaluationDecision = {
      id: current?.id ?? `decision:${plan.id}:${submissionId}`,
      tenantId: actor.tenantId,
      eventId: plan.eventId,
      planId: plan.id,
      submissionId,
      status: input.status,
      version: (current?.version ?? 0) + 1,
      history: [...(current?.history ?? []), transition],
      updatedAt: now,
    };
    await this.#repository.putDecision(decision, current?.version ?? null);
    await this.#runDecisionProjection({
      decision,
      transition,
      decisionVersion: decision.version,
    });
    if (transition.to === "accepted") {
      await this.#runAcceptanceHandoff({
        decision,
        transition,
        decisionVersion: decision.version,
      });
    }
    return decision;
  }
  async #assignmentContext(
    assignment: EvaluationAssignment,
  ): Promise<{ plan: EvaluationPlan; round: ReviewRound }> {
    const plan = await this.#getPlan(assignment.tenantId, assignment.planId);
    return { plan, round: findRound(plan, assignment.roundId) };
  }

  async #submissionRevision(
    tenantId: string,
    eventId: string,
    submissionId: string,
    materialVersion?: number,
  ): Promise<number> {
    if (
      materialVersion !== undefined &&
      Number.isSafeInteger(materialVersion) &&
      materialVersion > 0
    ) {
      return materialVersion;
    }
    const source = this.#submissions as SubmissionReviewSource & EvaluationSubmissionSource;
    if (source.listSubmissionsForOrganizer !== undefined) {
      const submission = (await source.listSubmissionsForOrganizer(tenantId, eventId)).find(
        (candidate) => candidate.id === submissionId,
      );
      if (submission !== undefined) {
        const version = submission.version ?? submission.revision;
        if (version !== undefined && version > 0) return version;
      }
    }
    return 1;
  }

  #visibleSubmission(
    plan: EvaluationPlan,
    round: ReviewRound,
    material: Awaited<ReturnType<SubmissionReviewSource["getSubmissionForReview"]>> extends infer T
      ? NonNullable<T>
      : never,
  ): ReviewContext["submission"] {
    const projection = normalizeProjection(
      plan.reviewerProjection ?? plan.evaluatorProjection ?? plan.projection,
    );
    const blindReview =
      plan.blindReview ||
      round.blindReview === true ||
      (round.anonymization !== undefined && round.anonymization !== "none");
    const identityFields = blindReview ? new Set(material.identityFieldIds) : new Set<string>();
    const selectedFields = projection.fieldIds ?? projection.visibleFieldIds;
    const answers = Object.fromEntries(
      Object.entries(material.answers).filter(
        ([fieldId]) =>
          !identityFields.has(fieldId) &&
          (selectedFields === undefined || selectedFields.includes(fieldId)),
      ),
    );
    const selectedFiles = projection.fileIds ?? projection.visibleFileIds;
    const files = (material.files ?? []).filter((file) => selectedFiles?.includes(file.id));
    return {
      id: material.id,
      title: material.title,
      abstract: material.abstract,
      answers,
      participants: blindReview ? [] : material.participants,
      files,
      identityRedacted: blindReview,
    };
  }

  async #listSuggestionsForAssignment(
    actor: EvaluationActor,
    assignment: EvaluationAssignment,
    plan: EvaluationPlan,
    _round: ReviewRound,
    submissionRevision: number,
  ): Promise<readonly EvaluationSuggestion[]> {
    const suggestions: EvaluationSuggestion[] = [];
    for (const suggestion of this.#suggestions.values()) {
      if (
        suggestion.tenantId !== actor.tenantId ||
        suggestion.assignmentId !== assignment.id ||
        suggestion.reviewerId !== actor.userId
      ) {
        continue;
      }
      let current = suggestion;
      if (
        current.status === "pending" &&
        (current.rubricRevision !== plan.version ||
          current.submissionRevision !== submissionRevision)
      ) {
        current = this.#markSuggestionStale(current, actor.userId, this.#clock().toISOString());
        this.#suggestions.set(suggestionStorageKey(actor.tenantId, current.id), current);
      }
      suggestions.push(structuredClone(current));
    }
    return suggestions.sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
    );
  }

  #markSuggestionStale(
    suggestion: EvaluationSuggestion,
    actorId: string | null,
    at: string,
  ): EvaluationSuggestion {
    if (suggestion.status === "stale") return suggestion;
    const entry: EvaluationSuggestionAuditEntry = {
      action: "stale",
      actorId,
      at,
      reason: "The rubric or submission revision changed.",
    };
    return {
      ...suggestion,
      status: "stale",
      version: suggestion.version + 1,
      history: [...suggestion.history, entry],
      audit: [...suggestion.audit, entry],
      updatedAt: at,
    };
  }

  #markSuggestionsStaleForPlan(planId: string, at: string, actorId: string): void {
    for (const suggestion of this.#suggestions.values()) {
      if (suggestion.planId !== planId || suggestion.status !== "pending") continue;
      const updated = this.#markSuggestionStale(suggestion, actorId, at);
      this.#suggestions.set(suggestionStorageKey(suggestion.tenantId, suggestion.id), updated);
    }
  }

  #normalizeProviderCandidates(
    result: EvaluationSuggestionProviderResult,
    round: ReviewRound,
    input: EvaluationSuggestionProviderInput,
  ): EvaluationSuggestionCandidate[] {
    const rawCandidates: Array<{ raw: unknown; criterionIdHint?: string }> = Array.isArray(
      result.candidates,
    )
      ? result.candidates.map((raw) => ({ raw }))
      : Object.entries(result.candidates).flatMap(([criterionIdHint, values]) =>
          [...values].map((raw) => ({ raw, criterionIdHint })),
        );
    if (rawCandidates.length === 0) {
      throw invalidInput("The AI suggestion provider returned no rubric candidates.");
    }
    const criteria = new Map(round.rubric.criteria.map((criterion) => [criterion.id, criterion]));
    return rawCandidates.map(({ raw, criterionIdHint }, index) => {
      if (typeof raw !== "object" || raw === null) {
        throw invalidInput("The AI suggestion provider returned an invalid candidate.");
      }
      const candidate = raw as {
        criterionId?: unknown;
        value?: unknown;
        evidence?: unknown;
        id?: unknown;
        provenance?: Partial<EvaluationSuggestionProvenance>;
      };
      const criterionId =
        typeof candidate.criterionId === "string" ? candidate.criterionId : (criterionIdHint ?? "");
      const criterion = criteria.get(criterionId);
      if (criterion === undefined) {
        throw invalidInput("The AI suggestion provider referenced an unknown criterion.");
      }
      if ((criterion.inputType ?? "numeric") === "free_text") {
        throw invalidInput("AI suggestions are not supported for free-text criteria.");
      }
      if (
        typeof candidate.value !== "number" ||
        !Number.isFinite(candidate.value) ||
        candidate.value < criterion.minimum ||
        candidate.value > criterion.maximum
      ) {
        throw invalidInput(`AI candidate ${criterion.id} is outside its rubric bounds.`);
      }
      if ((criterion.inputType ?? "numeric") === "dropdown") {
        normalizeDropdownValue(criterion, candidate.value);
      }
      if (!Array.isArray(candidate.evidence) || candidate.evidence.length === 0) {
        throw invalidInput("Every AI candidate must cite evidence.");
      }
      const evidence = candidate.evidence.map((citation) => {
        if (typeof citation !== "string") throw invalidInput("AI evidence citations must be text.");
        return requireText(citation, "AI evidence", 2_000);
      });
      const provenance: EvaluationSuggestionProvenance = {
        provider: candidate.provenance?.provider ?? "injected",
        model: candidate.provenance?.model ?? "unspecified",
        generatedAt: candidate.provenance?.generatedAt ?? this.#clock().toISOString(),
        sourceReferences: candidate.provenance?.sourceReferences ?? evidence,
        ...(candidate.provenance?.promptVersion === undefined
          ? {}
          : { promptVersion: candidate.provenance.promptVersion }),
        ...(candidate.provenance?.traceId === undefined
          ? {}
          : { traceId: candidate.provenance.traceId }),
      };
      return {
        id:
          typeof candidate.id === "string" && candidate.id.trim().length > 0
            ? candidate.id
            : `${input.assignmentId}:${criterionId}:${index + 1}`,
        criterionId,
        value: candidate.value,
        evidence,
        provenance,
      };
    });
  }

  async #getWritableAssignment(
    actor: EvaluationActor,
    assignmentId: string,
  ): Promise<{ assignment: EvaluationAssignment; plan: EvaluationPlan; round: ReviewRound }> {
    const assignment = await this.#getAssignment(actor.tenantId, assignmentId);
    requireHumanReviewer(actor, assignment);
    if (await this.#repository.getConflict(actor.tenantId, assignment.id)) {
      throw forbidden("A conflict declaration removes access to this submission.");
    }
    const plan = await this.#getPlan(actor.tenantId, assignment.planId);
    const round = findRound(plan, assignment.roundId);
    assertPlanIsWritable(plan, round, this.#clock());
    return { assignment, plan, round };
  }

  async #getPlan(tenantId: string, planId: string): Promise<EvaluationPlan> {
    const plan = await this.#repository.getPlan(tenantId, planId);
    if (plan === null) {
      throw notFound("The evaluation plan was not found.");
    }
    return plan;
  }

  async #runDecisionProjection(input: {
    readonly decision: EvaluationDecision;
    readonly transition: EvaluationDecisionTransition;
    readonly decisionVersion: number;
  }): Promise<void> {
    const projection = this.#decisionProjection;
    if (projection === undefined) return;
    const deliveryKey = [
      input.decision.tenantId,
      input.decision.planId,
      input.decision.submissionId,
      input.decisionVersion,
    ].join("\u0000");
    if (this.#projectedDecisionKeys.has(deliveryKey)) return;
    const pending = this.#decisionProjectionInFlight.get(deliveryKey);
    if (pending !== undefined) {
      await pending;
      return;
    }
    const idempotencyKey = decisionProjectionIdempotencyKey(
      input.decision.submissionId,
      input.decisionVersion,
    );
    const handoff = (async () => {
      await projection.projectDecision({
        tenantId: input.decision.tenantId,
        eventId: input.decision.eventId,
        planId: input.decision.planId,
        submissionId: input.decision.submissionId,
        decisionId: input.decision.id,
        decisionVersion: input.decisionVersion,
        status: input.transition.to,
        priorStatus: input.transition.from,
        reason: input.transition.reason,
        decidedByUserId: input.transition.decidedBy,
        decidedAt: input.transition.decidedAt,
        idempotencyKey,
        participantProjection: {
          status: input.transition.to,
          reason: input.transition.reason,
          decisionVersion: input.decisionVersion,
          decidedAt: input.transition.decidedAt,
        },
        communication: {
          templatePurpose: decisionTemplatePurpose(input.transition.to),
        },
      });
      this.#projectedDecisionKeys.add(deliveryKey);
    })();
    this.#decisionProjectionInFlight.set(deliveryKey, handoff);
    try {
      await handoff;
    } finally {
      if (this.#decisionProjectionInFlight.get(deliveryKey) === handoff) {
        this.#decisionProjectionInFlight.delete(deliveryKey);
      }
    }
  }

  async #runAcceptanceHandoff(input: {
    readonly decision: EvaluationDecision;
    readonly transition: EvaluationDecisionTransition;
    readonly decisionVersion: number;
  }): Promise<void> {
    const acceptanceHandoff = this.#acceptanceHandoff;
    if (acceptanceHandoff === undefined) return;
    const deliveryKey = [
      input.decision.tenantId,
      input.decision.planId,
      input.decision.submissionId,
      input.decisionVersion,
    ].join("\u0000");
    if (this.#acceptedHandoffKeys.has(deliveryKey)) return;
    const pending = this.#acceptanceHandoffInFlight.get(deliveryKey);
    if (pending !== undefined) {
      await pending;
      return;
    }
    const handoff = (async () => {
      await acceptanceHandoff.accept({
        tenantId: input.decision.tenantId,
        eventId: input.decision.eventId,
        planId: input.decision.planId,
        submissionId: input.decision.submissionId,
        decisionId: input.decision.id,
        decidedBy: input.transition.decidedBy,
        decidedAt: input.transition.decidedAt,
        reason: input.transition.reason,
        idempotencyKey: input.transition.idempotencyKey,
      });
      this.#acceptedHandoffKeys.add(deliveryKey);
    })();
    this.#acceptanceHandoffInFlight.set(deliveryKey, handoff);
    try {
      await handoff;
    } finally {
      if (this.#acceptanceHandoffInFlight.get(deliveryKey) === handoff) {
        this.#acceptanceHandoffInFlight.delete(deliveryKey);
      }
    }
  }

  async #getAssignment(tenantId: string, assignmentId: string): Promise<EvaluationAssignment> {
    const assignment = await this.#repository.getAssignment(tenantId, assignmentId);
    if (assignment === null) {
      throw notFound("The evaluation assignment was not found.");
    }
    return assignment;
  }

  #assertExpectedReviewVersion(
    current: EvaluationReview | null,
    expectedVersion: number | undefined,
  ): void {
    if (
      (current === null && expectedVersion !== undefined) ||
      (current !== null && current.version !== expectedVersion)
    ) {
      throw conflict("Review changed since it was loaded.");
    }
  }
}
