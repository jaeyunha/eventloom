import { closed, conflict } from "./errors";
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

export interface EvaluationReviewWriteAuthority {
  readonly tenantId: string;
  readonly eventId: string;
  readonly planId: string;
  readonly roundId: string;
  readonly assignmentId: string;
  readonly submissionId: string;
  readonly reviewerId: string;
  readonly expectedAssignmentVersion: number;
  readonly expectedPlanVersion?: number | undefined;
}

export interface WriteEvaluationReview {
  readonly authority: EvaluationReviewWriteAuthority;
  readonly review: EvaluationReview;
  readonly expectedReviewVersion: number | null;
  readonly assignmentUpdate?: EvaluationAssignment | undefined;
}

export interface SubmissionReviewLookup {
  readonly eventId: string;
  readonly submissionId: string;
}

export interface EvaluationRoundScheduleState {
  readonly id: string;
  readonly predecessorRoundId?: string | null | undefined;
  readonly revision?: number | undefined;
  readonly opensAt?: string | null | undefined;
  readonly closesAt?: string | null | undefined;
}

export interface EvaluationPlanScheduleState {
  readonly id: string;
  readonly tenantId: string;
  readonly eventId: string;
  readonly predecessorPlanId?: string | null | undefined;
  readonly status: EvaluationPlan["status"];
  readonly closesAt?: string | null | undefined;
  readonly version: number;
  readonly updatedAt: string;
  readonly rounds: readonly EvaluationRoundScheduleState[];
}

export interface EvaluationPlanScheduleSync {
  readonly plan: EvaluationPlanScheduleState;
  readonly expectedVersion: number;
}

export interface EvaluationPlanRevisionPrecondition {
  readonly predecessorPlanId: string;
  readonly expectedVersion: number;
  readonly lineageVersions: readonly {
    readonly planId: string;
    readonly expectedVersion: number;
  }[];
}

export interface EvaluationReviewWriteAdmission {
  readonly assignment: EvaluationAssignment;
  readonly expectedAssignmentVersion: number;
  readonly authorizedAt: string;
  readonly expectedPlanVersion?: number | undefined;
  readonly expectedSubmissionRevision?: number | undefined;
}

export interface EvaluationProjectionReader {
  getPlan(tenantId: string, planId: string): Promise<EvaluationPlan | null>;
  getPlanScheduleState(
    tenantId: string,
    planId: string,
  ): Promise<EvaluationPlanScheduleState | null>;
  getPlanSuccessor(
    tenantId: string,
    eventId: string,
    predecessorPlanId: string,
  ): Promise<EvaluationPlan | null>;
  listPlans(tenantId: string, eventId?: string): Promise<readonly EvaluationPlan[]>;
  getAssignment(tenantId: string, assignmentId: string): Promise<EvaluationAssignment | null>;
  listAssignments(tenantId: string, planId: string): Promise<readonly EvaluationAssignment[]>;
  getReview(tenantId: string, assignmentId: string): Promise<EvaluationReview | null>;
  getSuggestionAssignmentId(tenantId: string, suggestionId: string): Promise<string | null>;
  listReviews(tenantId: string, planId: string): Promise<readonly EvaluationReview[]>;
  getSuggestion(tenantId: string, suggestionId: string): Promise<EvaluationSuggestion | null>;
  listSuggestions(tenantId: string, planId: string): Promise<readonly EvaluationSuggestion[]>;
  listReviewerWorkspaceRecords(
    tenantId: string,
    reviewerId: string,
    eventIds: readonly string[],
  ): Promise<ReviewerWorkspaceRecords>;
  listOrganizerWorkspaceRecords(
    tenantId: string,
    eventId: string,
  ): Promise<OrganizerWorkspaceRecords>;
  getConflict(
    tenantId: string,
    assignmentId: string,
  ): Promise<EvaluationConflictDeclaration | null>;
  getDecision(
    tenantId: string,
    planId: string,
    submissionId: string,
  ): Promise<EvaluationDecision | null>;
}

export type EvaluationReminderPlanSource = Pick<
  EvaluationProjectionReader,
  "getPlan" | "listAssignments"
>;

export interface EvaluationRepository extends EvaluationProjectionReader {
  readonly supportsAtomicPlanRevisionSync: boolean;
  readonly authority: "transactional";
  hasPendingPlanLineageRepair(tenantId?: string, eventId?: string): Promise<boolean>;
  putPlan(
    plan: EvaluationPlan,
    expectedVersion: number | null,
    revisionPrecondition?: EvaluationPlanRevisionPrecondition,
  ): Promise<void>;
  putPlanState(
    plan: EvaluationPlan,
    expectedVersion: number,
    scheduleSyncs: readonly EvaluationPlanScheduleSync[],
    revisionSyncPending?: boolean,
    revisionSyncToken?: string,
  ): Promise<void>;
  putPlanSchedule(
    plan: EvaluationPlan,
    expectedVersion: number,
    scheduleSyncs: readonly EvaluationPlanScheduleSync[],
    revisionSyncPending?: boolean,
    revisionSyncToken?: string,
  ): Promise<void>;
  reconcilePlanRevisionFamily(
    tip: EvaluationPlan,
    expectedVersion: number,
    scheduleSyncs: readonly EvaluationPlanScheduleSync[],
    revisionSyncToken: string,
  ): Promise<void>;
  beginPlanRevisionSync(
    tip: EvaluationPlan,
    expectedVersion: number,
    revisionSyncToken: string,
  ): Promise<void>;
  resumePlanRevisionSync(
    tip: EvaluationPlan,
    expectedVersion: number,
    revisionSyncToken: string,
  ): Promise<void>;
  completePlanRevisionSync(
    tip: EvaluationPlan,
    expectedVersion: number,
    revisionSyncToken: string,
  ): Promise<void>;
  replaceAssignment(
    scope: EvaluationAssignmentScope,
    input: EvaluationAssignmentReplacementInput,
  ): Promise<EvaluationAssignmentReplacementResult>;
  applyAssignmentDistribution(
    scope: EvaluationAssignmentScope,
    input: EvaluationAssignmentDistributionInput,
  ): Promise<EvaluationAssignmentDistributionResult>;
  putSuggestion(
    suggestion: EvaluationSuggestion,
    expectedVersion: number | null,
    admission?: EvaluationReviewWriteAdmission | number,
  ): Promise<void>;
  resolveSuggestion(
    suggestion: EvaluationSuggestion,
    expectedSuggestionVersion: number,
    assignment: EvaluationAssignment | null,
    expectedAssignmentVersion: number | null,
    review: EvaluationReview | null,
    expectedReviewVersion: number | null,
    admission?: EvaluationReviewWriteAdmission,
  ): Promise<EvaluationSuggestionResolution>;
  writeReview(input: WriteEvaluationReview): Promise<void>;
  listOrganizerExportRecords(
    tenantId: string,
    eventId: string,
    planId: string,
  ): Promise<OrganizerWorkspaceRecords>;
  putReview(
    review: EvaluationReview,
    expectedVersion: number | null,
    admission: EvaluationReviewWriteAdmission,
  ): Promise<void>;
  saveReviewDraft(
    assignment: EvaluationAssignment,
    expectedAssignmentVersion: number,
    review: EvaluationReview,
    expectedReviewVersion: number | null,
    authorizedAt: string,
  ): Promise<void>;
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
    authorizedAt: string,
  ): Promise<void>;
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

function planScheduleState(plan: EvaluationPlan): EvaluationPlanScheduleState {
  return {
    id: plan.id,
    tenantId: plan.tenantId,
    eventId: plan.eventId,
    predecessorPlanId: plan.predecessorPlanId,
    status: plan.status,
    closesAt: plan.closesAt,
    version: plan.version,
    updatedAt: plan.updatedAt,
    rounds: plan.rounds.map((round) => ({
      id: round.id,
      predecessorRoundId: round.predecessorRoundId,
      revision: round.revision ?? 1,
      opensAt: round.opensAt,
      closesAt: round.closesAt,
    })),
  };
}

function applyScheduleState(
  plan: EvaluationPlan,
  state: EvaluationPlanScheduleState,
): EvaluationPlan {
  const rounds = new Map(state.rounds.map((round) => [round.id, round]));
  return {
    ...plan,
    status: state.status,
    closesAt: state.closesAt ?? null,
    version: state.version,
    updatedAt: state.updatedAt,
    rounds: plan.rounds.map((round) => {
      const schedule = rounds.get(round.id);
      return schedule === undefined
        ? round
        : {
            ...round,
            opensAt: schedule.opensAt,
            closesAt: schedule.closesAt ?? null,
          };
    }),
  };
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
  readonly authority = "transactional" as const;
  readonly supportsAtomicPlanRevisionSync: boolean = true;
  readonly #plans = new Map<string, EvaluationPlan>();
  readonly #assignments = new Map<string, EvaluationAssignment>();
  readonly #reviews = new Map<string, EvaluationReview>();
  readonly #suggestions = new Map<string, EvaluationSuggestion>();
  readonly #conflicts = new Map<string, EvaluationConflictDeclaration>();
  readonly #decisions = new Map<string, EvaluationDecision>();
  readonly #revisionSyncTokens = new Map<string, string>();
  readonly #completedRevisionSyncTokens = new Map<string, string>();

  constructor(
    private readonly submissionSource?: Pick<SubmissionReviewSource, "getSubmissionForReview">,
  ) {}

  async getPlan(tenantId: string, planId: string): Promise<EvaluationPlan | null> {
    const plan = this.#plans.get(storageKey(tenantId, planId));
    return plan === undefined ? null : clone(plan);
  }

  async getPlanScheduleState(
    tenantId: string,
    planId: string,
  ): Promise<EvaluationPlanScheduleState | null> {
    const plan = this.#plans.get(storageKey(tenantId, planId));
    return plan === undefined ? null : planScheduleState(plan);
  }

  async getPlanSuccessor(
    tenantId: string,
    eventId: string,
    predecessorPlanId: string,
  ): Promise<EvaluationPlan | null> {
    const successor = [...this.#plans.values()].find(
      (plan) =>
        plan.tenantId === tenantId &&
        plan.eventId === eventId &&
        plan.predecessorPlanId === predecessorPlanId,
    );
    return successor === undefined ? null : clone(successor);
  }
  async listPlans(tenantId: string, eventId?: string): Promise<readonly EvaluationPlan[]> {
    return [...this.#plans.values()]
      .filter(
        (plan) => plan.tenantId === tenantId && (eventId === undefined || plan.eventId === eventId),
      )
      .map(clone);
  }

  async hasPendingPlanLineageRepair(): Promise<boolean> {
    return false;
  }

  async putPlan(
    plan: EvaluationPlan,
    expectedVersion: number | null,
    revisionPrecondition?: EvaluationPlanRevisionPrecondition,
  ): Promise<void> {
    const key = storageKey(plan.tenantId, plan.id);
    assertVersion(this.#plans.get(key)?.version ?? null, expectedVersion, "Evaluation plan");
    if (revisionPrecondition !== undefined) {
      const predecessor = this.#plans.get(
        storageKey(plan.tenantId, revisionPrecondition.predecessorPlanId),
      );
      if (
        expectedVersion !== null ||
        plan.predecessorPlanId !== revisionPrecondition.predecessorPlanId ||
        predecessor === undefined ||
        predecessor.eventId !== plan.eventId ||
        predecessor.version !== revisionPrecondition.expectedVersion ||
        predecessor.status === "draft" ||
        predecessor.gradingLockedAt === null ||
        this.#revisionSyncTokens.has(
          storageKey(plan.tenantId, revisionPrecondition.predecessorPlanId),
        ) ||
        [...this.#plans.values()].some(
          (candidate) =>
            candidate.tenantId === plan.tenantId &&
            candidate.eventId === plan.eventId &&
            candidate.predecessorPlanId === revisionPrecondition.predecessorPlanId,
        )
      ) {
        throw conflict("The evaluation plan changed since it was loaded.");
      }
      for (const lineageVersion of revisionPrecondition.lineageVersions) {
        const lineagePlan = this.#plans.get(storageKey(plan.tenantId, lineageVersion.planId));
        if (
          lineagePlan === undefined ||
          lineagePlan.eventId !== plan.eventId ||
          lineagePlan.version !== lineageVersion.expectedVersion
        ) {
          throw conflict("The evaluation plan changed since it was loaded.");
        }
      }
    }
    if (
      plan.predecessorPlanId !== undefined &&
      plan.predecessorPlanId !== null &&
      [...this.#plans.values()].some(
        (candidate) =>
          candidate.id !== plan.id &&
          candidate.tenantId === plan.tenantId &&
          candidate.eventId === plan.eventId &&
          candidate.predecessorPlanId === plan.predecessorPlanId,
      )
    ) {
      throw conflict("The evaluation plan already has a successor revision.");
    }
    this.#plans.set(key, clone(plan));
  }

  async putPlanState(
    plan: EvaluationPlan,
    expectedVersion: number,
    scheduleSyncs: readonly EvaluationPlanScheduleSync[] = [],
    revisionSyncPending = false,
    revisionSyncToken?: string,
  ): Promise<void> {
    const tipKey = storageKey(plan.tenantId, plan.id);
    if (revisionSyncPending && revisionSyncToken === undefined) {
      throw conflict("Evaluation plan revision synchronization token is required.");
    }
    if (this.#revisionSyncTokens.has(tipKey)) {
      throw conflict("Evaluation plan revision synchronization is already in progress.");
    }
    if (
      [...this.#plans.values()].some(
        (candidate) =>
          candidate.tenantId === plan.tenantId &&
          candidate.eventId === plan.eventId &&
          candidate.predecessorPlanId === plan.id,
      )
    ) {
      throw conflict("Only the latest review plan revision can change lifecycle or schedule.");
    }
    const updates = [{ plan, expectedVersion }, ...scheduleSyncs];
    const keys = updates.map((update) => storageKey(update.plan.tenantId, update.plan.id));
    if (new Set(keys).size !== keys.length) {
      throw conflict("Evaluation plan schedule synchronization contains duplicates.");
    }
    for (const update of updates) {
      const key = storageKey(update.plan.tenantId, update.plan.id);
      assertVersion(
        this.#plans.get(key)?.version ?? null,
        update.expectedVersion,
        "Evaluation plan",
      );
    }
    this.#plans.set(tipKey, clone(plan));
    for (const update of scheduleSyncs) {
      const key = storageKey(update.plan.tenantId, update.plan.id);
      const current = this.#plans.get(key);
      if (current === undefined) throw conflict("Evaluation plan changed since it was loaded.");
      this.#plans.set(key, clone(applyScheduleState(current, update.plan)));
    }
    if (revisionSyncPending) {
      this.#revisionSyncTokens.set(tipKey, revisionSyncToken as string);
      this.#completedRevisionSyncTokens.delete(tipKey);
    } else {
      this.#revisionSyncTokens.delete(tipKey);
      if (revisionSyncToken === undefined) {
        this.#completedRevisionSyncTokens.delete(tipKey);
      } else {
        this.#completedRevisionSyncTokens.set(tipKey, revisionSyncToken);
      }
    }
  }

  async putPlanSchedule(
    plan: EvaluationPlan,
    expectedVersion: number,
    scheduleSyncs: readonly EvaluationPlanScheduleSync[] = [],
    revisionSyncPending = false,
    revisionSyncToken?: string,
  ): Promise<void> {
    const current = this.#plans.get(storageKey(plan.tenantId, plan.id));
    if (current === undefined) throw conflict("Evaluation plan changed since it was loaded.");
    await this.putPlanState(
      applyScheduleState(current, planScheduleState(plan)),
      expectedVersion,
      scheduleSyncs,
      revisionSyncPending,
      revisionSyncToken,
    );
  }

  async reconcilePlanRevisionFamily(
    tip: EvaluationPlan,
    expectedVersion: number,
    scheduleSyncs: readonly EvaluationPlanScheduleSync[],
    revisionSyncToken: string,
  ): Promise<void> {
    if (this.#revisionSyncTokens.get(storageKey(tip.tenantId, tip.id)) !== revisionSyncToken) {
      throw conflict("Evaluation plan revision synchronization ownership changed.");
    }
    assertVersion(
      this.#plans.get(storageKey(tip.tenantId, tip.id))?.version ?? null,
      expectedVersion,
      "Evaluation plan",
    );
    if (
      [...this.#plans.values()].some(
        (candidate) =>
          candidate.tenantId === tip.tenantId &&
          candidate.eventId === tip.eventId &&
          candidate.predecessorPlanId === tip.id,
      )
    ) {
      throw conflict("Only the latest review plan revision can be reconciled.");
    }
    const keys = scheduleSyncs.map((sync) => storageKey(sync.plan.tenantId, sync.plan.id));
    if (new Set(keys).size !== keys.length || keys.includes(storageKey(tip.tenantId, tip.id))) {
      throw conflict("Evaluation plan schedule synchronization contains duplicates.");
    }
    for (const sync of scheduleSyncs) {
      assertVersion(
        this.#plans.get(storageKey(sync.plan.tenantId, sync.plan.id))?.version ?? null,
        sync.expectedVersion,
        "Evaluation plan",
      );
    }
    for (const sync of scheduleSyncs) {
      const key = storageKey(sync.plan.tenantId, sync.plan.id);
      const current = this.#plans.get(key);
      if (current === undefined) throw conflict("Evaluation plan changed since it was loaded.");
      this.#plans.set(key, clone(applyScheduleState(current, sync.plan)));
    }
  }

  async completePlanRevisionSync(
    tip: EvaluationPlan,
    expectedVersion: number,
    revisionSyncToken: string,
  ): Promise<void> {
    assertVersion(
      this.#plans.get(storageKey(tip.tenantId, tip.id))?.version ?? null,
      expectedVersion,
      "Evaluation plan",
    );
    if (
      [...this.#plans.values()].some(
        (candidate) =>
          candidate.tenantId === tip.tenantId &&
          candidate.eventId === tip.eventId &&
          candidate.predecessorPlanId === tip.id,
      )
    ) {
      throw conflict("Only the latest review plan revision can be reconciled.");
    }
    const tipKey = storageKey(tip.tenantId, tip.id);
    if (
      this.#revisionSyncTokens.get(tipKey) !== revisionSyncToken &&
      this.#completedRevisionSyncTokens.get(tipKey) !== revisionSyncToken
    ) {
      throw conflict("Evaluation plan revision synchronization ownership changed.");
    }
    this.#revisionSyncTokens.delete(tipKey);
    this.#completedRevisionSyncTokens.set(tipKey, revisionSyncToken);
  }

  async beginPlanRevisionSync(
    tip: EvaluationPlan,
    expectedVersion: number,
    revisionSyncToken: string,
  ): Promise<void> {
    assertVersion(
      this.#plans.get(storageKey(tip.tenantId, tip.id))?.version ?? null,
      expectedVersion,
      "Evaluation plan",
    );
    if (
      (this.#revisionSyncTokens.has(storageKey(tip.tenantId, tip.id)) &&
        this.#revisionSyncTokens.get(storageKey(tip.tenantId, tip.id)) !== revisionSyncToken) ||
      [...this.#plans.values()].some(
        (candidate) =>
          candidate.tenantId === tip.tenantId &&
          candidate.eventId === tip.eventId &&
          candidate.predecessorPlanId === tip.id,
      )
    ) {
      throw conflict("Only the latest review plan revision can be reconciled.");
    }
    const tipKey = storageKey(tip.tenantId, tip.id);
    this.#revisionSyncTokens.set(tipKey, revisionSyncToken);
    this.#completedRevisionSyncTokens.delete(tipKey);
  }

  async resumePlanRevisionSync(
    tip: EvaluationPlan,
    expectedVersion: number,
    revisionSyncToken: string,
  ): Promise<void> {
    assertVersion(
      this.#plans.get(storageKey(tip.tenantId, tip.id))?.version ?? null,
      expectedVersion,
      "Evaluation plan",
    );
    const tipKey = storageKey(tip.tenantId, tip.id);
    if (
      (this.#revisionSyncTokens.get(tipKey) !== revisionSyncToken &&
        this.#completedRevisionSyncTokens.get(tipKey) !== revisionSyncToken) ||
      [...this.#plans.values()].some(
        (candidate) =>
          candidate.tenantId === tip.tenantId &&
          candidate.eventId === tip.eventId &&
          candidate.predecessorPlanId === tip.id,
      )
    ) {
      throw conflict("Evaluation plan revision synchronization ownership changed.");
    }
  }

  #assertAuthoritativePlanWritable(
    scope: Pick<EvaluationAssignment, "tenantId" | "eventId" | "planId">,
    allowClosed = false,
  ): void {
    let plan = this.#plans.get(storageKey(scope.tenantId, scope.planId));
    const visited = new Set<string>();
    for (let depth = 0; depth <= 16; depth += 1) {
      if (plan === undefined || plan.eventId !== scope.eventId || visited.has(plan.id)) {
        throw conflict("Evaluation plan revision lineage is unavailable.");
      }
      visited.add(plan.id);
      const successor = [...this.#plans.values()].find(
        (candidate) =>
          candidate.tenantId === scope.tenantId &&
          candidate.eventId === scope.eventId &&
          candidate.predecessorPlanId === plan?.id,
      );
      if (successor === undefined || successor.status === "draft") {
        if (
          (!allowClosed && plan.status !== "open") ||
          this.#revisionSyncTokens.has(storageKey(plan.tenantId, plan.id))
        ) {
          throw closed("The evaluation plan is closed.");
        }
        return;
      }
      plan = successor;
    }
    throw conflict("Review plan revision depth exceeds the synchronization limit.");
  }

  #assertAssignmentWriteAdmission(
    scope: EvaluationAssignmentScope,
    authorizedAt: string,
    requireRoundOpen: boolean,
    allowClosed = false,
  ): void {
    this.#assertAuthoritativePlanWritable(scope, allowClosed);
    if (allowClosed) return;
    const plan = this.#plans.get(storageKey(scope.tenantId, scope.planId));
    const round = plan?.rounds.find((candidate) => candidate.id === scope.roundId);
    const timestamp = Date.parse(authorizedAt);
    if (
      plan === undefined ||
      round === undefined ||
      plan.eventId !== scope.eventId ||
      !Number.isFinite(timestamp) ||
      plan.status !== "open" ||
      (plan.closesAt !== null && Date.parse(plan.closesAt) <= timestamp) ||
      (requireRoundOpen && round.opensAt != null && Date.parse(round.opensAt) > timestamp) ||
      (round.closesAt != null && Date.parse(round.closesAt) <= timestamp)
    ) {
      throw closed("The evaluation plan is closed.");
    }
  }

  #assertReviewWriteAdmission(admission: EvaluationReviewWriteAdmission): void {
    const current = this.#assignments.get(
      storageKey(admission.assignment.tenantId, admission.assignment.id),
    );
    if (
      current === undefined ||
      current.version !== admission.expectedAssignmentVersion ||
      current.eventId !== admission.assignment.eventId ||
      current.planId !== admission.assignment.planId ||
      current.roundId !== admission.assignment.roundId ||
      current.submissionId !== admission.assignment.submissionId ||
      current.reviewerId !== admission.assignment.reviewerId ||
      current.planVersion !== admission.assignment.planVersion ||
      current.rubricRevision !== admission.assignment.rubricRevision ||
      current.roundRevision !== admission.assignment.roundRevision ||
      current.submissionRevision !== admission.assignment.submissionRevision ||
      (current.status !== "assigned" && current.status !== "in_progress")
    ) {
      throw conflict("Assignment changed since it was loaded.");
    }
    this.#assertAuthoritativePlanWritable(current);
    const plan = this.#plans.get(storageKey(current.tenantId, current.planId));
    const round = plan?.rounds.find((candidate) => candidate.id === current.roundId);
    const authorizedAt = Date.parse(admission.authorizedAt);
    if (
      plan === undefined ||
      round === undefined ||
      (admission.expectedPlanVersion !== undefined &&
        plan.version !== admission.expectedPlanVersion) ||
      plan.status !== "open" ||
      (plan.closesAt != null && Date.parse(plan.closesAt) <= authorizedAt) ||
      (round.opensAt != null && Date.parse(round.opensAt) > authorizedAt) ||
      (round.closesAt != null && Date.parse(round.closesAt) <= authorizedAt)
    ) {
      throw closed("The evaluation plan is closed.");
    }
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
    this.#assertAssignmentWriteAdmission(scope, input.authorizedAt, true);
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
    this.#assertAssignmentWriteAdmission(
      scope,
      input.authorizedAt,
      false,
      input.allowClosedCleanup === true,
    );
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
  async getSuggestionAssignmentId(tenantId: string, suggestionId: string): Promise<string | null> {
    return this.#suggestions.get(storageKey(tenantId, suggestionId))?.assignmentId ?? null;
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
    admission?: EvaluationReviewWriteAdmission | number,
  ): Promise<void> {
    if (typeof admission === "object") this.#assertReviewWriteAdmission(admission);
    const expectedAssignmentVersion =
      typeof admission === "number"
        ? admission
        : (admission?.expectedAssignmentVersion ??
          this.#assignments.get(storageKey(suggestion.tenantId, suggestion.assignmentId))
            ?.version ??
          0);
    await this.#assertSuggestionAssignmentWritable(
      suggestion,
      expectedAssignmentVersion,
      typeof admission === "object"
        ? (admission.expectedSubmissionRevision ?? suggestion.submissionRevision)
        : suggestion.submissionRevision,
    );
    const key = storageKey(suggestion.tenantId, suggestion.id);
    assertVersion(this.#suggestions.get(key)?.version ?? null, expectedVersion, "Suggestion");
    this.#suggestions.set(key, clone(suggestion));
  }

  async resolveSuggestion(
    suggestion: EvaluationSuggestion,
    expectedSuggestionVersion: number,
    assignment: EvaluationAssignment | null,
    expectedAssignmentVersion: number,
    review: EvaluationReview | null,
    expectedReviewVersion: number | null,
    admission: EvaluationReviewWriteAdmission,
  ): Promise<EvaluationSuggestionResolution> {
    this.#assertReviewWriteAdmission(admission);
    const writableScope = review ?? assignment;
    if (writableScope !== null) this.#assertAuthoritativePlanWritable(writableScope);
    await this.#assertSuggestionAssignmentWritable(
      suggestion,
      expectedAssignmentVersion ?? assignment?.version ?? 0,
      admission.expectedSubmissionRevision ?? suggestion.submissionRevision,
    );
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

  async #assertSuggestionAssignmentWritable(
    suggestion: EvaluationSuggestion,
    expectedAssignmentVersion: number,
    expectedSubmissionRevision: number,
  ): Promise<void> {
    const assignmentKey = storageKey(suggestion.tenantId, suggestion.assignmentId);
    const assignment = this.#assignments.get(assignmentKey);
    assertVersion(assignment?.version ?? null, expectedAssignmentVersion, "Assignment");
    if (
      assignment === undefined ||
      assignment.eventId !== suggestion.eventId ||
      assignment.planId !== suggestion.planId ||
      assignment.roundId !== suggestion.roundId ||
      assignment.submissionId !== suggestion.submissionId ||
      assignment.reviewerId !== suggestion.reviewerId ||
      (assignment.status !== "assigned" && assignment.status !== "in_progress") ||
      this.#conflicts.has(storageKey(suggestion.tenantId, suggestion.assignmentId))
    ) {
      throw conflict("A conflict declaration removes access to this submission.");
    }
    if (
      this.#decisions.has(
        decisionKey(suggestion.tenantId, suggestion.planId, suggestion.submissionId),
      )
    ) {
      throw conflict("A decision already exists for this submission.");
    }
    if (this.submissionSource !== undefined) {
      const submission = await this.submissionSource.getSubmissionForReview(
        suggestion.tenantId,
        suggestion.eventId,
        suggestion.submissionId,
      );
      if (submission?.status !== "submitted") {
        throw conflict("This submission is no longer available for review.");
      }
      const submissionRevision = submission.version ?? submission.revision;
      if (submissionRevision !== undefined && submissionRevision !== expectedSubmissionRevision) {
        throw conflict("The AI evaluation suggestion is stale.");
      }
    }
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

  async listOrganizerExportRecords(
    tenantId: string,
    eventId: string,
    planId: string,
  ): Promise<OrganizerWorkspaceRecords> {
    const records = await this.listOrganizerWorkspaceRecords(tenantId, eventId);
    return {
      assignments: records.assignments.filter((assignment) => assignment.planId === planId),
      reviews: records.reviews.filter((review) => review.planId === planId),
      decisions: records.decisions.filter((decision) => decision.planId === planId),
    };
  }

  async putReview(
    review: EvaluationReview,
    expectedVersion: number | null,
    admission: EvaluationReviewWriteAdmission,
  ): Promise<void> {
    this.#assertReviewWriteAdmission(admission);
    const key = storageKey(review.tenantId, review.assignmentId);
    assertVersion(this.#reviews.get(key)?.version ?? null, expectedVersion, "Review");
    this.#reviews.set(key, clone(review));
  }

  async writeReview(input: WriteEvaluationReview): Promise<void> {
    const { authority, review, assignmentUpdate } = input;
    if (
      review.tenantId !== authority.tenantId ||
      review.eventId !== authority.eventId ||
      review.planId !== authority.planId ||
      review.roundId !== authority.roundId ||
      review.assignmentId !== authority.assignmentId ||
      review.submissionId !== authority.submissionId ||
      review.reviewerId !== authority.reviewerId
    ) {
      throw conflict("Review write targeted another assignment.");
    }
    const assignmentKey = storageKey(authority.tenantId, authority.assignmentId);
    const currentAssignment = this.#assignments.get(assignmentKey);
    if (
      currentAssignment === undefined ||
      currentAssignment.eventId !== authority.eventId ||
      currentAssignment.planId !== authority.planId ||
      currentAssignment.roundId !== authority.roundId ||
      currentAssignment.submissionId !== authority.submissionId ||
      currentAssignment.reviewerId !== authority.reviewerId ||
      currentAssignment.version !== authority.expectedAssignmentVersion ||
      !["assigned", "in_progress"].includes(currentAssignment.status)
    ) {
      throw conflict("Assignment changed since it was loaded.");
    }
    if (this.#conflicts.has(assignmentKey)) {
      throw conflict("A conflict has already been declared for this assignment.");
    }
    if (
      this.#decisions.has(decisionKey(authority.tenantId, authority.planId, authority.submissionId))
    ) {
      throw conflict("A decision already exists for this submission.");
    }
    if (this.submissionSource !== undefined) {
      const submission = await this.submissionSource.getSubmissionForReview(
        authority.tenantId,
        authority.eventId,
        authority.submissionId,
      );
      if (submission?.status !== "submitted") {
        throw conflict("This submission is no longer available for review.");
      }
    }
    this.#assertReviewWriteAdmission({
      assignment: {
        ...currentAssignment,
        planVersion:
          review.planVersion ?? review.planRevision ?? currentAssignment.planVersion ?? 1,
        roundRevision:
          review.roundRevision ?? review.rubricRevision ?? currentAssignment.roundRevision ?? 1,
        rubricRevision: review.rubricRevision ?? currentAssignment.rubricRevision ?? 1,
        submissionRevision:
          review.submissionRevision ??
          review.submissionVersion ??
          currentAssignment.submissionRevision ??
          1,
      },
      expectedAssignmentVersion: authority.expectedAssignmentVersion,
      authorizedAt: review.updatedAt,
      expectedPlanVersion: authority.expectedPlanVersion,
    });
    assertVersion(
      this.#reviews.get(storageKey(review.tenantId, review.assignmentId))?.version ?? null,
      input.expectedReviewVersion,
      "Review",
    );
    if (assignmentUpdate !== undefined) {
      if (
        assignmentUpdate.id !== authority.assignmentId ||
        assignmentUpdate.tenantId !== authority.tenantId ||
        assignmentUpdate.eventId !== authority.eventId ||
        assignmentUpdate.planId !== authority.planId ||
        assignmentUpdate.roundId !== authority.roundId ||
        assignmentUpdate.submissionId !== authority.submissionId ||
        assignmentUpdate.reviewerId !== authority.reviewerId ||
        assignmentUpdate.version !== authority.expectedAssignmentVersion + 1
      ) {
        throw conflict("Assignment transition targeted another revision.");
      }
    }
    if (assignmentUpdate !== undefined)
      this.#assignments.set(assignmentKey, clone(assignmentUpdate));

    this.#reviews.set(storageKey(review.tenantId, review.assignmentId), clone(review));
  }

  async putReviewForTesting(review: EvaluationReview): Promise<void> {
    this.#reviews.set(storageKey(review.tenantId, review.assignmentId), clone(review));
  }
  async saveReviewDraft(
    assignment: EvaluationAssignment,
    expectedAssignmentVersion: number,
    review: EvaluationReview,
    expectedReviewVersion: number | null,
    authorizedAt: string,
  ): Promise<void> {
    this.#assertReviewWriteAdmission({
      assignment,
      expectedAssignmentVersion,
      authorizedAt,
    });
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
    if (this.submissionSource !== undefined) {
      const submission = await this.submissionSource.getSubmissionForReview(
        assignment.tenantId,
        assignment.eventId,
        assignment.submissionId,
      );
      if (submission?.status !== "submitted") {
        throw conflict("This submission is no longer available for review.");
      }
    }
    if (
      this.#decisions.has(
        decisionKey(assignment.tenantId, assignment.planId, assignment.submissionId),
      )
    ) {
      throw conflict("A decision already exists for this submission.");
    }
    this.#assignments.set(assignmentStorageKey, clone(assignment));
    this.#conflicts.set(conflictStorageKey, clone(declaration));
  }

  async submitReview(
    assignment: EvaluationAssignment,
    expectedAssignmentVersion: number,
    review: EvaluationReview,
    expectedReviewVersion: number,
    authorizedAt: string,
  ): Promise<void> {
    this.#assertReviewWriteAdmission({
      assignment,
      expectedAssignmentVersion,
      authorizedAt,
    });
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
    if (this.submissionSource !== undefined) {
      const submission = await this.submissionSource.getSubmissionForReview(
        decision.tenantId,
        decision.eventId,
        decision.submissionId,
      );
      if (submission?.status !== "submitted") {
        throw conflict("This submission is no longer available for review.");
      }
    }
    const key = decisionKey(decision.tenantId, decision.planId, decision.submissionId);
    assertVersion(this.#decisions.get(key)?.version ?? null, expectedVersion, "Decision");
    this.#decisions.set(key, clone(decision));
  }

  async putDecisionForTesting(decision: EvaluationDecision): Promise<void> {
    this.#decisions.set(
      decisionKey(decision.tenantId, decision.planId, decision.submissionId),
      clone(decision),
    );
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
        status: submission.status ?? "submitted",
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

  delete(tenantId: string, submissionId: string): void {
    this.#submissions.delete(storageKey(tenantId, submissionId));
  }
}
