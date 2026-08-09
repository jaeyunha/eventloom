import { closed, conflict, forbidden, invalidInput, notFound } from "./errors";
import type { EvaluationRepository, SubmissionReviewSource } from "./repository";
import type {
  EvaluationActor,
  EvaluationAggregate,
  EvaluationAssignment,
  EvaluationConflictDeclaration,
  EvaluationDecision,
  EvaluationDecisionStatus,
  EvaluationDecisionTransition,
  EvaluationPlan,
  EvaluationProgress,
  EvaluationReview,
  ReviewContext,
  ReviewRound,
  Rubric,
  RubricCriterion,
  RubricScore,
  RubricTotal,
} from "./types";

export interface CreateEvaluationPlanInput {
  id: string;
  eventId: string;
  name: string;
  blindReview: boolean;
  closesAt: string | null;
  assignmentRule: {
    reviewsPerSubmission: number;
    maxAssignmentsPerReviewer: number;
  };
  rounds: readonly ReviewRound[];
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
  readonly version: number;
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

export interface AssignReviewersInput {
  planId: string;
  roundId: string;
  submissionId: string;
  reviewerIds: readonly string[];
}

export interface SaveScoreInput {
  criterionId: string;
  value: number;
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
  clock?: () => Date;
  acceptanceHandoff?: EvaluationAcceptanceHandoff;
}

function requireText(value: string, field: string, maximumLength: number): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximumLength) {
    throw invalidInput(`${field} must contain between 1 and ${maximumLength} characters.`);
  }
  return normalized;
}

function requirePositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw invalidInput(`${field} must be a positive integer.`);
  }
}

function requireInstant(value: string | null, field: string): void {
  if (value !== null && !Number.isFinite(Date.parse(value))) {
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
    requireInstant(round.closesAt, "Round close date");
    validateRubric(round.rubric);
    if (ids.has(round.id) || sequences.has(round.sequence)) {
      throw invalidInput("Evaluation round ids and sequences must be unique.");
    }
    ids.add(round.id);
    sequences.add(round.sequence);
  }
}

function assertPlanIsWritable(plan: EvaluationPlan, round: ReviewRound, now: Date): void {
  if (plan.status !== "open") {
    throw closed("The evaluation plan is not open for reviews.");
  }
  const timestamp = now.getTime();
  if (
    (plan.closesAt !== null && Date.parse(plan.closesAt) <= timestamp) ||
    (round.closesAt !== null && Date.parse(round.closesAt) <= timestamp)
  ) {
    throw closed("The review close date has passed.");
  }
}

function possibleWeightedTotal(rubric: Rubric): number {
  return rubric.criteria.reduce(
    (total, criterion) => total + criterion.maximum * criterion.weight,
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
    if (score === undefined || score.humanConfirmedBy === null) {
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

export class EvaluationService {
  readonly #acceptanceHandoff: EvaluationAcceptanceHandoff | undefined;
  readonly #repository: EvaluationRepository;
  readonly #submissions: SubmissionReviewSource;
  readonly #clock: () => Date;

  constructor(
    repository: EvaluationRepository,
    submissions: SubmissionReviewSource,
    options: EvaluationServiceOptions = {},
  ) {
    this.#repository = repository;
    this.#submissions = submissions;
    this.#clock = options.clock ?? (() => new Date());
    this.#acceptanceHandoff = options.acceptanceHandoff;
  }
  async listPlans(actor: EvaluationActor, eventId?: string): Promise<readonly EvaluationPlan[]> {
    if (actor.kind !== "human") throw forbidden();
    const repository = this.#repository as EvaluationRepository & {
      listPlans?: (tenantId: string, eventId?: string) => Promise<readonly EvaluationPlan[]>;
    };
    const plans = (await repository.listPlans?.(actor.tenantId, eventId)) ?? [];
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
      requireText(submissionId, "Submission id", 100),
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
      requireText(submissionId, "Submission id", 100),
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
      blindReview: input.blindReview,
      closesAt: input.closesAt,
      assignmentRule: { ...input.assignmentRule },
      rounds: structuredClone(input.rounds),
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await this.#repository.putPlan(plan, null);
    return plan;
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
    if (plan.closesAt !== null && Date.parse(plan.closesAt) <= now.getTime()) {
      throw closed("The evaluation plan close date has passed.");
    }
    const updated: EvaluationPlan = {
      ...plan,
      status: "open",
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
    findRound(plan, input.roundId);
    if (plan.status === "closed") {
      throw closed("A closed evaluation plan cannot receive assignments.");
    }
    const submissionId = requireText(input.submissionId, "Submission id", 100);
    if (
      (await this.#submissions.getSubmissionForReview(
        actor.tenantId,
        plan.eventId,
        submissionId,
      )) === null
    ) {
      throw notFound("The submission to assign was not found.");
    }
    if (input.reviewerIds.length === 0) {
      throw invalidInput("At least one reviewer must be assigned.");
    }
    const reviewerIds = input.reviewerIds.map((reviewerId) =>
      requireText(reviewerId, "Reviewer id", 100),
    );
    if (new Set(reviewerIds).size !== reviewerIds.length) {
      throw invalidInput("Reviewer ids must be unique.");
    }

    const allAssignments = await this.#repository.listAssignments(actor.tenantId, plan.id);
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
        (assignment) =>
          assignment.roundId === input.roundId &&
          assignment.reviewerId === reviewerId &&
          assignment.status !== "abstained",
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
        (assignment) => assignment.reviewerId === actor.userId && assignment.status !== "abstained",
      )
      .sort(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
      );
  }
  async listOrganizerAssignments(
    actor: EvaluationActor,
    planId: string,
  ): Promise<readonly EvaluationAssignment[]> {
    const plan = await this.#getPlan(actor.tenantId, planId);
    requireHumanOrganizer(actor, plan.eventId);
    return [...(await this.#repository.listAssignments(actor.tenantId, plan.id))].sort(
      (left: EvaluationAssignment, right: EvaluationAssignment) =>
        left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
    );
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
    if (!plan.blindReview) {
      return {
        assignment,
        round,
        submission: {
          id: material.id,
          title: material.title,
          abstract: material.abstract,
          answers: material.answers,
          participants: material.participants,
          identityRedacted: false,
        },
        review,
      };
    }

    const identityFields = new Set(material.identityFieldIds);
    const answers = Object.fromEntries(
      Object.entries(material.answers).filter(([fieldId]) => !identityFields.has(fieldId)),
    );
    return {
      assignment,
      round,
      submission: {
        id: material.id,
        title: material.title,
        abstract: material.abstract,
        answers,
        participants: [],
        identityRedacted: true,
      },
      review,
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
      if (
        !Number.isFinite(inputScore.value) ||
        inputScore.value < criterion.minimum ||
        inputScore.value > criterion.maximum
      ) {
        throw invalidInput(
          `Score ${criterion.id} must be between ${criterion.minimum} and ${criterion.maximum}.`,
        );
      }
      const evidence = (inputScore.evidence ?? []).map((citation) =>
        requireText(citation, "Score evidence", 2_000),
      );
      if (inputScore.origin === "ai" && evidence.length === 0) {
        throw invalidInput("AI score suggestions must cite rubric evidence.");
      }
      scores[criterion.id] = {
        criterionId: criterion.id,
        value: inputScore.value,
        origin: inputScore.origin,
        evidence,
        humanConfirmedBy: inputScore.origin === "human" ? actor.userId : null,
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
      if (score === undefined || score.origin !== "ai") {
        throw invalidInput("Only existing AI score suggestions can be confirmed.");
      }
      scores[criterionId] = { ...score, humanConfirmedBy: actor.userId, updatedAt: now };
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
    if (assignment.status === "submitted" && current !== null && current.submittedAt !== null) {
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
      if (criterion.required && (score === undefined || score.humanConfirmedBy === null)) {
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
    const submittedAssignmentIds = new Set(
      assignments
        .filter(
          (assignment) =>
            assignment.roundId === roundId &&
            assignment.submissionId === submissionId &&
            assignment.status === "submitted",
        )
        .map((assignment) => assignment.id),
    );
    return (await this.#repository.listReviews(actor.tenantId, plan.id)).filter(
      (review) => submittedAssignmentIds.has(review.assignmentId) && review.submittedAt !== null,
    );
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
    const assignments = (await this.#repository.listAssignments(actor.tenantId, plan.id)).filter(
      (assignment) =>
        assignment.roundId === round.id &&
        assignment.submissionId === submissionId &&
        assignment.status === "submitted",
    );
    const reviews = await this.#repository.listReviews(actor.tenantId, plan.id);
    const reviewByAssignment = new Map(reviews.map((review) => [review.assignmentId, review]));
    const submittedReviews = assignments
      .map((assignment) => reviewByAssignment.get(assignment.id))
      .filter((review): review is EvaluationReview => review?.submittedAt !== null);
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
        .filter((score): score is RubricScore => score?.humanConfirmedBy !== null)
        .map((score) => score.value);
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

  async getProgress(actor: EvaluationActor, planId: string): Promise<EvaluationProgress> {
    const plan = await this.#getPlan(actor.tenantId, planId);
    requireHumanOrganizer(actor, plan.eventId);
    const assignments = await this.#repository.listAssignments(actor.tenantId, plan.id);
    const count = (status: EvaluationAssignment["status"]) =>
      assignments.filter((assignment) => assignment.status === status).length;
    const submitted = count("submitted");
    const actionable = assignments.length - count("abstained");
    return {
      planId: plan.id,
      total: assignments.length,
      assigned: count("assigned"),
      inProgress: count("in_progress"),
      submitted,
      abstained: count("abstained"),
      completionPercent: actionable === 0 ? 0 : (submitted / actionable) * 100,
    };
  }

  async recordDecision(
    actor: EvaluationActor,
    input: RecordDecisionInput,
  ): Promise<EvaluationDecision> {
    const plan = await this.#getPlan(actor.tenantId, input.planId);
    requireHumanOrganizer(actor, plan.eventId);
    const reason = requireText(input.reason, "Decision reason", 5_000);
    const idempotencyKey = requireText(input.idempotencyKey, "Idempotency key", 200);
    const submissionId = requireText(input.submissionId, "Submission id", 100);
    if (
      (await this.#submissions.getSubmissionForReview(
        actor.tenantId,
        plan.eventId,
        submissionId,
      )) === null
    ) {
      throw notFound("The submission to decide was not found.");
    }
    const current = await this.#repository.getDecision(actor.tenantId, plan.id, submissionId);
    const repeatedTransition = current?.history.find(
      (transition) => transition.idempotencyKey === idempotencyKey,
    );
    if (current !== null && repeatedTransition !== undefined) {
      if (current.status === "accepted") {
        await this.#runAcceptanceHandoff({
          decision: current,
          transition: repeatedTransition,
          idempotencyKey,
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
    if (decision.status === "accepted") {
      await this.#runAcceptanceHandoff({
        decision,
        transition,
        idempotencyKey,
      });
    }
    return decision;
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

  async #runAcceptanceHandoff(input: {
    readonly decision: EvaluationDecision;
    readonly transition: EvaluationDecisionTransition;
    readonly idempotencyKey: string;
  }): Promise<void> {
    if (this.#acceptanceHandoff === undefined) return;
    await this.#acceptanceHandoff.accept({
      tenantId: input.decision.tenantId,
      eventId: input.decision.eventId,
      planId: input.decision.planId,
      submissionId: input.decision.submissionId,
      decisionId: input.decision.id,
      decidedBy: input.transition.decidedBy,
      decidedAt: input.transition.decidedAt,
      reason: input.transition.reason,
      idempotencyKey: input.idempotencyKey,
    });
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
