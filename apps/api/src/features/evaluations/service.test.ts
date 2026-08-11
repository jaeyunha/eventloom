import { describe, expect, it } from "vitest";
import type { EvaluationError } from "./errors";
import {
  InMemoryEvaluationRepository,
  InMemorySubmissionReviewSource,
  type OrganizerWorkspaceRecords,
  type ReviewerWorkspaceRecords,
  type SubmissionReviewLookup,
} from "./repository";
import {
  type EvaluationDecisionProjectionInput,
  EvaluationService,
  type EvaluationServiceOptions,
} from "./service";
import type {
  EvaluationActor,
  EvaluationAssignment,
  EvaluationReviewerProjection,
  ReviewRound,
  SubmissionReviewMaterial,
} from "./types";

const tenantId = "tenant-1";
const eventId = "event-1";
const nowIso = "2026-08-08T12:00:00.000Z";

const organizer: EvaluationActor = {
  tenantId,
  userId: "organizer-1",
  kind: "human",
  grants: [{ eventId, role: "organizer" }],
};

function reviewer(userId: string, tenant = tenantId): EvaluationActor {
  return {
    tenantId: tenant,
    userId,
    kind: "human",
    grants: [{ eventId, role: "reviewer" }],
  };
}
class StaleAssignmentRepository extends InMemoryEvaluationRepository {
  override async getAssignment(
    tenantId: string,
    assignmentId: string,
  ): Promise<EvaluationAssignment | null> {
    const assignment = await super.getAssignment(tenantId, assignmentId);
    return assignment === null ? null : { ...assignment, status: "assigned" };
  }
}
class WorkspaceBatchRepository extends InMemoryEvaluationRepository {
  planListCalls = 0;
  organizerWorkspaceCalls = 0;
  decisionCalls = 0;
  workspaceCalls = 0;
  assignmentListCalls = 0;
  reviewListCalls = 0;
  batchGate: Promise<void> | null = null;
  organizerWorkspaceFailure: Error | null = null;

  override async listPlans(tenantId: string, requestedEventId?: string) {
    this.planListCalls += 1;
    return super.listPlans(tenantId, requestedEventId);
  }

  override async listReviewerWorkspaceRecords(
    requestedTenantId: string,
    reviewerId: string,
    eventIds: readonly string[],
  ): Promise<ReviewerWorkspaceRecords> {
    this.workspaceCalls += 1;
    const gate = this.batchGate;
    if (gate !== null) await gate;
    return super.listReviewerWorkspaceRecords(requestedTenantId, reviewerId, eventIds);
  }
  override async listOrganizerWorkspaceRecords(
    requestedTenantId: string,
    requestedEventId: string,
  ): Promise<OrganizerWorkspaceRecords> {
    this.organizerWorkspaceCalls += 1;
    const gate = this.batchGate;
    if (gate !== null) await gate;
    if (this.organizerWorkspaceFailure !== null) throw this.organizerWorkspaceFailure;
    return super.listOrganizerWorkspaceRecords(requestedTenantId, requestedEventId);
  }
  override async getDecision(requestedTenantId: string, planId: string, submissionId: string) {
    this.decisionCalls += 1;
    return super.getDecision(requestedTenantId, planId, submissionId);
  }

  override async listAssignments(requestedTenantId: string, planId: string) {
    this.assignmentListCalls += 1;
    return super.listAssignments(requestedTenantId, planId);
  }

  override async listReviews(requestedTenantId: string, planId: string) {
    this.reviewListCalls += 1;
    return super.listReviews(requestedTenantId, planId);
  }

  resetCounts(): void {
    this.planListCalls = 0;
    this.workspaceCalls = 0;
    this.assignmentListCalls = 0;
    this.reviewListCalls = 0;
    this.organizerWorkspaceCalls = 0;
    this.decisionCalls = 0;
  }
}

class WorkspaceBatchSource extends InMemorySubmissionReviewSource {
  singleCalls = 0;
  batchCalls = 0;
  lastLookups: readonly SubmissionReviewLookup[] = [];
  omitMaterials = false;
  failure: Error | null = null;
  organizerListCalls = 0;
  organizerBatchGate: Promise<void> | null = null;

  override async getSubmissionForReview(
    requestedTenantId: string,
    requestedEventId: string,
    submissionId: string,
  ) {
    this.singleCalls += 1;
    return super.getSubmissionForReview(requestedTenantId, requestedEventId, submissionId);
  }

  override async getSubmissionsForReview(
    requestedTenantId: string,
    lookups: readonly SubmissionReviewLookup[],
  ) {
    this.batchCalls += 1;
    this.lastLookups = structuredClone(lookups);
    if (this.failure !== null) throw this.failure;
    if (this.omitMaterials) return [];
    return [...(await super.getSubmissionsForReview(requestedTenantId, lookups))].reverse();
  }
  override async listSubmissionsForOrganizer(requestedTenantId: string, requestedEventId: string) {
    this.organizerListCalls += 1;
    const gate = this.organizerBatchGate;
    if (gate !== null) await gate;
    return super.listSubmissionsForOrganizer(requestedTenantId, requestedEventId);
  }

  resetCounts(): void {
    this.singleCalls = 0;
    this.batchCalls = 0;
    this.lastLookups = [];
    this.organizerListCalls = 0;
    this.organizerBatchGate = null;
  }
}

const round: ReviewRound = {
  id: "round-1",
  name: "Committee review",
  sequence: 1,
  closesAt: "2026-08-10T12:00:00.000Z",
  rubric: {
    id: "rubric-1",
    name: "Program rubric",
    criteria: [
      {
        id: "quality",
        label: "Quality",
        description: "How strong is the proposal?",
        minimum: 1,
        maximum: 5,
        weight: 2,
        required: true,
      },
      {
        id: "relevance",
        label: "Relevance",
        description: "How relevant is the proposal?",
        minimum: 0,
        maximum: 10,
        weight: 1,
        required: true,
      },
    ],
  },
};

const submission: SubmissionReviewMaterial = {
  id: "submission-1",
  tenantId,
  eventId,
  title: "A useful session",
  abstract: "Practical material for the audience.",
  answers: {
    experience: "Advanced",
    speakerEmail: "speaker@example.com",
  },
  identityFieldIds: ["speakerEmail"],
  participants: [
    {
      id: "participant-1",
      displayName: "Speaker Name",
      email: "speaker@example.com",
      biography: "Identifying biography",
    },
  ],
};

async function fixture(
  options: Pick<EvaluationServiceOptions, "acceptanceHandoff" | "decisionProjection"> & {
    blindReview?: boolean;
    reviewsPerSubmission?: number;
    maxAssignmentsPerReviewer?: number;
    submissionMaterial?: SubmissionReviewMaterial;
    reviewerProjection?: EvaluationReviewerProjection;
    repository?: InMemoryEvaluationRepository;
    submissions?: InMemorySubmissionReviewSource;
  } = {},
) {
  let currentTime = new Date(nowIso);
  const repository = options.repository ?? new InMemoryEvaluationRepository();
  const submissions =
    options.submissions ??
    new InMemorySubmissionReviewSource([
      options.submissionMaterial ?? submission,
      { ...submission, id: "submission-2", title: "Another session" },
    ]);
  const service = new EvaluationService(repository, submissions, {
    clock: () => new Date(currentTime),
    ...(options.acceptanceHandoff === undefined
      ? {}
      : { acceptanceHandoff: options.acceptanceHandoff }),
    ...(options.decisionProjection === undefined
      ? {}
      : { decisionProjection: options.decisionProjection }),
  });
  const draft = await service.createPlan(organizer, {
    id: "plan-1",
    eventId,
    name: "Main review",
    blindReview: options.blindReview ?? true,
    closesAt: "2026-08-12T12:00:00.000Z",
    assignmentRule: {
      reviewsPerSubmission: options.reviewsPerSubmission ?? 2,
      maxAssignmentsPerReviewer: options.maxAssignmentsPerReviewer ?? 1,
    },
    rounds: [round],
    ...(options.reviewerProjection === undefined
      ? {}
      : { reviewerProjection: options.reviewerProjection }),
  });
  const plan = await service.openPlan(organizer, draft.id, draft.version);
  return {
    repository,
    service,
    plan,
    setTime(value: string) {
      currentTime = new Date(value);
    },
  };
}

async function assignOne(service: EvaluationService, userId = "reviewer-1") {
  const assignments = await service.assignReviewers(organizer, {
    planId: "plan-1",
    roundId: round.id,
    submissionId: submission.id,
    reviewerIds: [userId],
  });
  const assignment = assignments[0];
  if (assignment === undefined) {
    throw new Error("Expected an assignment fixture.");
  }
  return assignment;
}

async function expectEvaluationError(
  promise: Promise<unknown>,
  code: EvaluationError["code"],
): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

describe("evaluation plans and assignments", () => {
  it("enforces assignment coverage and per-reviewer load rules", async () => {
    const { service } = await fixture();
    const initial = await service.assignReviewers(organizer, {
      planId: "plan-1",
      roundId: round.id,
      submissionId: submission.id,
      reviewerIds: ["reviewer-1", "reviewer-2"],
    });

    expect(initial).toHaveLength(2);
    await expectEvaluationError(
      service.assignReviewers(organizer, {
        planId: "plan-1",
        roundId: round.id,
        submissionId: submission.id,
        reviewerIds: ["reviewer-3"],
      }),
      "EVALUATION_CONFLICT",
    );
    await expectEvaluationError(
      service.assignReviewers(organizer, {
        planId: "plan-1",
        roundId: round.id,
        submissionId: "submission-2",
        reviewerIds: ["reviewer-1"],
      }),
      "EVALUATION_CONFLICT",
    );
  });

  it("denies unassigned and cross-tenant reviewers", async () => {
    const { service } = await fixture();
    const assignment = await assignOne(service);

    await expectEvaluationError(
      service.getReviewContext(reviewer("reviewer-2"), assignment.id),
      "EVALUATION_FORBIDDEN",
    );
    await expectEvaluationError(
      service.getReviewContext(reviewer("reviewer-1", "tenant-2"), assignment.id),
      "EVALUATION_NOT_FOUND",
    );
  });

  it("redacts identity fields and participants in blind rounds", async () => {
    const { plan, service } = await fixture({ blindReview: true });
    expect(plan.reviewerProjection).toEqual({ fieldIds: [], fileIds: [] });
    const assignment = await assignOne(service);

    const context = await service.getReviewContext(reviewer("reviewer-1"), assignment.id);

    expect(context.submission).toEqual({
      id: submission.id,
      title: submission.title,
      abstract: submission.abstract,
      answers: {},
      participants: [],
      files: [],
      identityRedacted: true,
    });
    expect(JSON.stringify(context)).not.toContain("speaker@example.com");
    expect(JSON.stringify(context)).not.toContain("Speaker Name");
  });

  it("exposes identity only when blind review is disabled", async () => {
    const { service } = await fixture({ blindReview: false });
    const assignment = await assignOne(service);

    const context = await service.getReviewContext(reviewer("reviewer-1"), assignment.id);

    expect(context.submission.identityRedacted).toBe(false);
    expect(context.submission.participants[0]?.email).toBe("speaker@example.com");
    expect(context.submission.answers).toEqual({});
    expect(context.submission.files).toEqual([]);
  });

  it("exposes only explicitly allowlisted answers and files", async () => {
    const { service } = await fixture({
      blindReview: false,
      reviewerProjection: { fieldIds: ["experience"], fileIds: ["file-1"] },
      submissionMaterial: {
        ...submission,
        files: [
          {
            id: "file-1",
            name: "allowed.pdf",
            mimeType: "application/pdf",
            sizeBytes: 12,
          },
          {
            id: "file-2",
            name: "private.pdf",
            mimeType: "application/pdf",
            sizeBytes: 24,
          },
        ],
      },
    });
    const assignment = await assignOne(service);

    const context = await service.getReviewContext(reviewer("reviewer-1"), assignment.id);

    expect(context.submission.answers).toEqual({ experience: "Advanced" });
    expect(context.submission.files).toEqual([
      {
        id: "file-1",
        name: "allowed.pdf",
        mimeType: "application/pdf",
        sizeBytes: 12,
      },
    ]);
    expect(context.submission.answers).not.toHaveProperty("speakerEmail");
    expect(JSON.stringify(context.submission)).not.toContain("private.pdf");
  });
  it("batches reviewer workspace reads concurrently with stable ordering and safe errors", async () => {
    const repository = new WorkspaceBatchRepository();
    const submissions = new WorkspaceBatchSource([
      { ...submission, version: 3 },
      { ...submission, id: "submission-2", title: "Another session", version: 4 },
    ]);
    const { service } = await fixture({
      repository,
      submissions,
      reviewsPerSubmission: 1,
      maxAssignmentsPerReviewer: 2,
    });
    await assignOne(service);
    await service.assignReviewers(organizer, {
      planId: "plan-1",
      roundId: round.id,
      submissionId: "submission-2",
      reviewerIds: ["reviewer-1"],
    });
    repository.resetCounts();
    submissions.resetCounts();

    let releaseBatchReads = () => {};
    repository.batchGate = new Promise<void>((resolve) => {
      releaseBatchReads = resolve;
    });
    const pending = service.listReviewerWorkspace(reviewer("reviewer-1"), eventId);

    expect(repository.planListCalls).toBe(1);
    expect(repository.workspaceCalls).toBe(1);
    releaseBatchReads();
    const workspace = await pending;

    expect(repository.assignmentListCalls).toBe(0);
    expect(repository.reviewListCalls).toBe(0);
    expect(submissions.singleCalls).toBe(0);
    expect(submissions.batchCalls).toBe(1);
    expect(submissions.lastLookups).toEqual([
      { eventId, submissionId: "submission-1" },
      { eventId, submissionId: "submission-2" },
    ]);
    expect(workspace.assignments.map((entry) => entry.submission.title)).toEqual([
      "A useful session",
      "Another session",
    ]);
    expect(
      workspace.assignments.every(
        (entry) =>
          entry.assignment.tenantId === tenantId &&
          entry.submission.participants.length === 0 &&
          !JSON.stringify(entry.submission).includes("speaker@example.com"),
      ),
    ).toBe(true);

    repository.batchGate = null;
    submissions.omitMaterials = true;
    await expectEvaluationError(
      service.listReviewerWorkspace(reviewer("reviewer-1"), eventId),
      "EVALUATION_NOT_FOUND",
    );

    submissions.omitMaterials = false;
    const failure = new Error("workspace source unavailable");
    submissions.failure = failure;
    await expect(service.listReviewerWorkspace(reviewer("reviewer-1"), eventId)).rejects.toBe(
      failure,
    );
  });
  it("batches organizer workspace reads with authoritative review progress", async () => {
    const repository = new WorkspaceBatchRepository();
    const submissions = new WorkspaceBatchSource([
      submission,
      { ...submission, id: "submission-2", title: "Another session" },
    ]);
    const { service } = await fixture({
      repository,
      submissions,
      reviewsPerSubmission: 1,
      maxAssignmentsPerReviewer: 2,
    });
    const assignment = await assignOne(service);
    const draft = await service.saveReview(reviewer("reviewer-1"), assignment.id, {
      scores: [
        { criterionId: "quality", value: 4, origin: "human" },
        { criterionId: "relevance", value: 8, origin: "human" },
      ],
    });
    await service.submitReview(reviewer("reviewer-1"), assignment.id, draft.version);
    await repository.putDecision(
      {
        id: "decision-1",
        tenantId,
        eventId,
        planId: "plan-1",
        submissionId: submission.id,
        status: "accepted",
        version: 1,
        history: [],
        updatedAt: nowIso,
      },
      null,
    );
    await repository.putAssignments([
      { ...assignment, id: "assignment-other-event", eventId: "event-2" },
      { ...assignment, id: "assignment-other-tenant", tenantId: "tenant-2" },
    ]);
    repository.resetCounts();
    submissions.resetCounts();

    let releaseBatchReads = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseBatchReads = resolve;
    });
    repository.batchGate = gate;
    submissions.organizerBatchGate = gate;
    const pending = service.getOrganizerWorkspace(organizer, eventId);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(repository.planListCalls).toBe(1);
    expect(repository.organizerWorkspaceCalls).toBe(1);
    expect(submissions.organizerListCalls).toBe(1);
    releaseBatchReads();
    const workspace = await pending;

    expect(repository.assignmentListCalls).toBe(0);
    expect(repository.reviewListCalls).toBe(0);
    expect(repository.decisionCalls).toBe(0);
    expect(workspace.plan.id).toBe("plan-1");
    expect(workspace.submissions.map((entry) => entry.id)).toEqual([
      "submission-1",
      "submission-2",
    ]);
    expect(workspace.assignments).toHaveLength(1);
    expect(workspace.assignments[0]).toMatchObject({
      id: assignment.id,
      status: "submitted",
      tenantId,
      eventId,
      planId: "plan-1",
    });
    expect(workspace.progress).toMatchObject({
      total: 1,
      assigned: 0,
      submitted: 1,
      completionPercent: 100,
    });
    expect(workspace.aggregates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          submissionId: submission.id,
          roundId: round.id,
          submittedReviewCount: 1,
        }),
      ]),
    );
    expect(workspace.decisions[submission.id]).toMatchObject({
      status: "accepted",
      submissionId: submission.id,
    });
    expect(workspace.diagnostics).toBeUndefined();
  });
  it("returns core organizer data with diagnostics when decision hydration fails", async () => {
    const repository = new WorkspaceBatchRepository();
    const submissions = new WorkspaceBatchSource([submission]);
    const { service } = await fixture({ repository, submissions, reviewsPerSubmission: 1 });
    const assignment = await assignOne(service);
    repository.resetCounts();
    submissions.resetCounts();
    repository.organizerWorkspaceFailure = new Error("Decision row could not be decoded.");

    const workspace = await service.getOrganizerWorkspace(organizer, eventId);

    expect(repository.planListCalls).toBe(1);
    expect(repository.organizerWorkspaceCalls).toBe(1);
    expect(repository.assignmentListCalls).toBe(1);
    expect(repository.reviewListCalls).toBe(1);
    expect(workspace).toMatchObject({
      plan: { id: "plan-1" },
      submissions: [{ id: submission.id }],
      assignments: [{ id: assignment.id }],
      progress: { planId: "plan-1", total: 1 },
      aggregates: [{ submissionId: submission.id, roundId: round.id }],
      decisions: {},
      diagnostics: [
        {
          code: "decisions_unavailable",
          message: "Decision data is temporarily unavailable.",
        },
      ],
    });
  });

  it("returns missing-plan before attempting organizer hydration", async () => {
    const repository = new WorkspaceBatchRepository();
    repository.organizerWorkspaceFailure = new Error("Decision row could not be decoded.");
    const submissions = new WorkspaceBatchSource([submission]);
    const service = new EvaluationService(repository, submissions);

    await expectEvaluationError(
      service.getOrganizerWorkspace(organizer, eventId),
      "EVALUATION_NOT_FOUND",
    );

    expect(repository.planListCalls).toBe(1);
    expect(repository.organizerWorkspaceCalls).toBe(0);
    expect(repository.assignmentListCalls).toBe(0);
    expect(repository.reviewListCalls).toBe(0);
    expect(submissions.organizerListCalls).toBe(0);
  });
  it("hard-deletes outstanding assignments with no or draft reviews", async () => {
    const { service, repository } = await fixture({ reviewsPerSubmission: 2 });
    const assigned = await assignOne(service);

    await service.unassignAssignment(organizer, "plan-1", assigned.id);
    await expect(repository.getAssignment(tenantId, assigned.id)).resolves.toBeNull();

    const inProgress = await assignOne(service, "reviewer-2");
    const draft = await service.saveReview(reviewer("reviewer-2"), inProgress.id, {
      scores: [{ criterionId: "quality", value: 4, origin: "human" }],
    });
    expect(draft.submittedAt).toBeNull();
    await expect(repository.getAssignment(tenantId, inProgress.id)).resolves.toMatchObject({
      status: "in_progress",
    });

    await service.unassignAssignment(organizer, "plan-1", inProgress.id);
    await expect(repository.getAssignment(tenantId, inProgress.id)).resolves.toBeNull();
    await expect(repository.getReview(tenantId, inProgress.id)).resolves.toBeNull();
    const reassigned = await assignOne(service, "reviewer-2");
    expect(reassigned).toMatchObject({ id: inProgress.id, status: "assigned", version: 1 });
    await expect(repository.getReview(tenantId, reassigned.id)).resolves.toBeNull();
  });

  it("requires organizer authorization and isolates plan, event, and tenant assignment scope", async () => {
    const { service, repository } = await fixture({ reviewsPerSubmission: 2 });
    const assignment = await assignOne(service);

    await expectEvaluationError(
      service.unassignAssignment(reviewer("reviewer-1"), "plan-1", assignment.id),
      "EVALUATION_FORBIDDEN",
    );
    await expectEvaluationError(
      service.unassignAssignment(organizer, "missing-plan", assignment.id),
      "EVALUATION_NOT_FOUND",
    );

    await repository.putAssignments([
      { ...assignment, id: "assignment-other-plan", planId: "plan-2" },
      { ...assignment, id: "assignment-other-event", eventId: "event-2" },
    ]);
    await expectEvaluationError(
      service.unassignAssignment(organizer, "plan-1", "assignment-other-plan"),
      "EVALUATION_NOT_FOUND",
    );
    await expectEvaluationError(
      service.unassignAssignment(organizer, "plan-1", "assignment-other-event"),
      "EVALUATION_NOT_FOUND",
    );
    await expectEvaluationError(
      service.unassignAssignment({ ...organizer, tenantId: "tenant-2" }, "plan-1", assignment.id),
      "EVALUATION_NOT_FOUND",
    );
  });

  it("rejects submitted reviews, including stale assignment status, and other non-outstanding statuses", async () => {
    const { service, repository } = await fixture({ reviewsPerSubmission: 2 });
    const assignment = await assignOne(service);
    const draft = await service.saveReview(reviewer("reviewer-1"), assignment.id, {
      scores: [
        { criterionId: "quality", value: 4, origin: "human" },
        { criterionId: "relevance", value: 8, origin: "human" },
      ],
    });
    const submitted = await service.submitReview(
      reviewer("reviewer-1"),
      assignment.id,
      draft.version,
    );
    expect(submitted.submittedAt).not.toBeNull();

    await expectEvaluationError(
      service.unassignAssignment(organizer, "plan-1", assignment.id),
      "EVALUATION_CONFLICT",
    );
    await expect(repository.getAssignment(tenantId, assignment.id)).resolves.toMatchObject({
      status: "submitted",
    });

    const abstained = await assignOne(service, "reviewer-2");
    await repository.putAssignments([
      { ...abstained, id: "assignment-abstained", status: "abstained" },
    ]);
    await expectEvaluationError(
      service.unassignAssignment(organizer, "plan-1", "assignment-abstained"),
      "EVALUATION_CONFLICT",
    );

    const staleRepository = new StaleAssignmentRepository();
    const { service: staleService } = await fixture({
      repository: staleRepository,
      reviewsPerSubmission: 1,
    });
    const staleAssignment = await assignOne(staleService);
    const staleDraft = await staleService.saveReview(reviewer("reviewer-1"), staleAssignment.id, {
      scores: [
        { criterionId: "quality", value: 4, origin: "human" },
        { criterionId: "relevance", value: 8, origin: "human" },
      ],
    });
    await staleService.submitReview(reviewer("reviewer-1"), staleAssignment.id, staleDraft.version);
    await expectEvaluationError(
      staleService.unassignAssignment(organizer, "plan-1", staleAssignment.id),
      "EVALUATION_CONFLICT",
    );
  });
});

describe("review drafts, AI assistance, and aggregates", () => {
  it("returns an empty aggregate when an assignment has no review record", async () => {
    const { service } = await fixture({ reviewsPerSubmission: 1 });
    await assignOne(service);

    await expect(
      service.getAggregate(organizer, "plan-1", round.id, submission.id),
    ).resolves.toMatchObject({
      submittedReviewCount: 0,
      expectedReviewCount: 1,
      averageWeightedTotal: null,
    });
  });
  it("returns all organizer aggregates in one batch", async () => {
    const { service } = await fixture({ reviewsPerSubmission: 1 });
    await assignOne(service);

    const aggregates = await service.listAggregates(organizer, "plan-1", round.id);
    expect(aggregates).toHaveLength(2);
    expect(aggregates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          planId: "plan-1",
          roundId: round.id,
          submissionId: submission.id,
          submittedReviewCount: 0,
          expectedReviewCount: 1,
          averageWeightedTotal: null,
        }),
      ]),
    );
  });
  it("does not count an AI suggestion until the assigned human confirms it", async () => {
    const { service } = await fixture({ reviewsPerSubmission: 1 });
    const assignment = await assignOne(service);
    const actor = reviewer("reviewer-1");
    const draft = await service.saveReview(actor, assignment.id, {
      scores: [
        {
          criterionId: "quality",
          value: 4,
          origin: "ai",
          evidence: ["Abstract describes a concrete audience outcome."],
        },
        { criterionId: "relevance", value: 8, origin: "human" },
      ],
      comment: "Promising proposal.",
    });

    await expectEvaluationError(
      service.submitReview(actor, assignment.id, draft.version),
      "EVALUATION_INVALID_INPUT",
    );
    expect(await service.getAggregate(organizer, "plan-1", round.id, submission.id)).toMatchObject({
      submittedReviewCount: 0,
      averageWeightedTotal: null,
    });

    const confirmed = await service.confirmAiScores(
      actor,
      assignment.id,
      ["quality"],
      draft.version,
    );
    await service.submitReview(actor, assignment.id, confirmed.version);
    const aggregate = await service.getAggregate(organizer, "plan-1", round.id, submission.id);

    expect(aggregate).toMatchObject({
      submittedReviewCount: 1,
      expectedReviewCount: 1,
      averageWeightedTotal: 16,
      possibleWeightedTotal: 20,
    });
    expect(aggregate.criteria).toEqual([
      { criterionId: "quality", average: 4, count: 1, weight: 2 },
      { criterionId: "relevance", average: 8, count: 1, weight: 1 },
    ]);
    const submittedReviews = await service.listSubmittedReviews(
      organizer,
      "plan-1",
      round.id,
      submission.id,
    );
    expect(submittedReviews).toHaveLength(1);
    expect(submittedReviews[0]?.comment).toBe("Promising proposal.");
  });

  it("uses submitted reviews as the authoritative queue and progress state", async () => {
    const { service } = await fixture({ reviewsPerSubmission: 1 });
    const assignment = await assignOne(service);
    const actor = reviewer("reviewer-1");
    const draft = await service.saveReview(actor, assignment.id, {
      scores: [
        { criterionId: "quality", value: 4, origin: "human" },
        { criterionId: "relevance", value: 8, origin: "human" },
      ],
    });

    const submitted = await service.submitReview(actor, assignment.id, draft.version);
    expect(submitted.submittedAt).not.toBeNull();
    await expect(service.getReviewContext(actor, assignment.id)).resolves.toMatchObject({
      assignment: { status: "submitted" },
      review: { submittedAt: submitted.submittedAt },
    });
    await expect(service.getProgress(organizer, "plan-1")).resolves.toMatchObject({
      total: 1,
      submitted: 1,
      completionPercent: 100,
      reviewers: [
        expect.objectContaining({
          reviewerId: actor.userId,
          assigned: 1,
          submitted: 1,
          outstanding: 0,
          completionPercent: 100,
        }),
      ],
    });
    await expect(service.submitReview(actor, assignment.id, draft.version)).resolves.toEqual(
      submitted,
    );
  });
  it("does not expose assignments persisted for another event", async () => {
    const { service, repository } = await fixture({ reviewsPerSubmission: 1 });
    const assignment = await assignOne(service);
    await repository.putAssignments([
      {
        ...assignment,
        id: "foreign-event-assignment",
        eventId: "event-other",
        submissionId: "submission-2",
      },
    ]);

    await expect(
      service.listReviewerAssignments(reviewer("reviewer-1"), "plan-1"),
    ).resolves.toEqual([assignment]);
    await expect(service.getProgress(organizer, "plan-1")).resolves.toMatchObject({
      total: 1,
    });
  });
  it("treats a human edit as authoritative and rejects stale autosaves", async () => {
    const { service } = await fixture({ reviewsPerSubmission: 1 });
    const assignment = await assignOne(service);
    const actor = reviewer("reviewer-1");
    const first = await service.saveReview(actor, assignment.id, {
      scores: [
        {
          criterionId: "quality",
          value: 3,
          origin: "ai",
          evidence: ["The abstract supplies an example."],
        },
      ],
    });
    const edited = await service.saveReview(actor, assignment.id, {
      scores: [{ criterionId: "quality", value: 5, origin: "human" }],
      comment: "Updated after checking the rubric.",
      expectedVersion: first.version,
    });

    expect(edited.scores.quality).toMatchObject({
      value: 5,
      origin: "human",
      humanConfirmedBy: actor.userId,
    });
    await expectEvaluationError(
      service.saveReview(actor, assignment.id, {
        scores: [{ criterionId: "relevance", value: 7, origin: "human" }],
        expectedVersion: first.version,
      }),
      "EVALUATION_CONFLICT",
    );
  });

  it("requires cited evidence for AI suggestions", async () => {
    const { service } = await fixture({ reviewsPerSubmission: 1 });
    const assignment = await assignOne(service);

    await expectEvaluationError(
      service.saveReview(reviewer("reviewer-1"), assignment.id, {
        scores: [{ criterionId: "quality", value: 4, origin: "ai" }],
      }),
      "EVALUATION_INVALID_INPUT",
    );
  });

  it("blocks writes after a round closes", async () => {
    const { service, setTime } = await fixture({ reviewsPerSubmission: 1 });
    const assignment = await assignOne(service);
    setTime("2026-08-10T12:00:00.000Z");

    await expectEvaluationError(
      service.saveReview(reviewer("reviewer-1"), assignment.id, {
        scores: [{ criterionId: "quality", value: 4, origin: "human" }],
      }),
      "EVALUATION_CLOSED",
    );
  });
});

describe("conflicts, progress, and decisions", () => {
  it("makes abstention remove submission access and excludes it from actionable progress", async () => {
    const { service } = await fixture({ reviewsPerSubmission: 1 });
    const assignment = await assignOne(service);
    const actor = reviewer("reviewer-1");
    await service.saveReview(actor, assignment.id, {
      scores: [{ criterionId: "quality", value: 4, origin: "human" }],
    });

    const declaration = await service.declareConflict(
      actor,
      assignment.id,
      "I collaborated with the submitter.",
    );

    expect(declaration.reviewerId).toBe(actor.userId);
    await expectEvaluationError(
      service.getReviewContext(actor, assignment.id),
      "EVALUATION_FORBIDDEN",
    );
    const progress = await service.getProgress(organizer, "plan-1");
    expect(progress).toMatchObject({
      planId: "plan-1",
      total: 1,
      assigned: 0,
      inProgress: 0,
      submitted: 0,
      abstained: 1,
      completionPercent: 0,
    });
    expect(progress.reviewers).toEqual([
      {
        roundId: "round-1",
        reviewerId: "reviewer-1",
        assigned: 0,
        inProgress: 0,
        submitted: 0,
        abstained: 1,
        outstanding: 0,
        completionPercent: 0,
      },
    ]);
  });

  it("rejects incomplete acceptance before persisting a decision", async () => {
    const incomplete = {
      ...submission,
      title: "",
      abstract: "",
      participants: [],
    };
    const { service } = await fixture({ submissionMaterial: incomplete });

    await expectEvaluationError(
      service.recordDecision(organizer, {
        planId: "plan-1",
        submissionId: incomplete.id,
        status: "accepted",
        reason: "Committee consensus",
        idempotencyKey: "decision-incomplete",
      }),
      "EVALUATION_INVALID_INPUT",
    );
    await expect(service.getDecision(organizer, "plan-1", incomplete.id)).resolves.toBeNull();
  });
  it("accepts CFP submission identifiers up to the shared 128-character contract", async () => {
    const longSubmission = { ...submission, id: "s".repeat(101) };
    const { service } = await fixture({ submissionMaterial: longSubmission });

    await expect(
      service.recordDecision(organizer, {
        planId: "plan-1",
        submissionId: longSubmission.id,
        status: "accepted",
        reason: "Committee consensus",
        idempotencyKey: "decision-long-submission-id",
      }),
    ).resolves.toMatchObject({ submissionId: longSubmission.id, status: "accepted" });
    await expect(
      service.getDecision(organizer, "plan-1", longSubmission.id),
    ).resolves.toMatchObject({ submissionId: longSubmission.id });
  });
  it("allows only a human organizer to make idempotent, versioned decisions", async () => {
    const { service } = await fixture();
    const automation: EvaluationActor = {
      ...organizer,
      userId: "ai-agent",
      kind: "automation",
    };
    await expectEvaluationError(
      service.recordDecision(automation, {
        planId: "plan-1",
        submissionId: submission.id,
        status: "accepted",
        reason: "Model recommendation",
        idempotencyKey: "decision-1",
      }),
      "EVALUATION_FORBIDDEN",
    );

    const accepted = await service.recordDecision(organizer, {
      planId: "plan-1",
      submissionId: submission.id,
      status: "accepted",
      reason: "Committee consensus",
      idempotencyKey: "decision-1",
    });
    const replay = await service.recordDecision(organizer, {
      planId: "plan-1",
      submissionId: submission.id,
      status: "accepted",
      reason: "  Committee consensus  ",
      idempotencyKey: "decision-1",
    });
    await expectEvaluationError(
      service.recordDecision(organizer, {
        planId: "plan-1",
        submissionId: submission.id,
        status: "rejected",
        reason: "A different request must not reuse the key",
        idempotencyKey: "decision-1",
      }),
      "EVALUATION_CONFLICT",
    );
    const waitlisted = await service.recordDecision(organizer, {
      planId: "plan-1",
      submissionId: submission.id,
      status: "waitlisted",
      reason: "Capacity changed",
      idempotencyKey: "decision-2",
      expectedVersion: accepted.version,
    });

    expect(replay).toEqual(accepted);
    expect(waitlisted.status).toBe("waitlisted");
    expect(waitlisted.version).toBe(2);
    expect(waitlisted.history).toHaveLength(2);
    expect(waitlisted.history[1]).toMatchObject({
      from: "accepted",
      to: "waitlisted",
      decidedBy: organizer.userId,
    });
  });
});
describe("decision outcome projection", () => {
  it("projects every human outcome, onboards only acceptance, and versions handoffs", async () => {
    const projected: EvaluationDecisionProjectionInput[] = [];
    const onboarded: unknown[] = [];
    const { service } = await fixture({
      decisionProjection: {
        projectDecision: async (input) => {
          projected.push(structuredClone(input));
        },
      },
      acceptanceHandoff: {
        accept: async (input) => {
          onboarded.push(structuredClone(input));
        },
      },
    });

    const accepted = await service.recordDecision(organizer, {
      planId: "plan-1",
      submissionId: submission.id,
      status: "accepted",
      reason: "Committee consensus",
      idempotencyKey: "decision-1",
    });
    const replay = await service.recordDecision(organizer, {
      planId: "plan-1",
      submissionId: submission.id,
      status: "accepted",
      reason: "Committee consensus",
      idempotencyKey: "decision-1",
    });
    const waitlisted = await service.recordDecision(organizer, {
      planId: "plan-1",
      submissionId: submission.id,
      status: "waitlisted",
      reason: "Capacity changed",
      idempotencyKey: "decision-2",
      expectedVersion: accepted.version,
    });
    const rejected = await service.recordDecision(organizer, {
      planId: "plan-1",
      submissionId: submission.id,
      status: "rejected",
      reason: "Program fit changed",
      idempotencyKey: "decision-3",
      expectedVersion: waitlisted.version,
    });

    expect(replay).toEqual(accepted);
    expect(rejected.version).toBe(3);
    expect(projected.map((input) => input.status)).toEqual(["accepted", "waitlisted", "rejected"]);
    expect(projected.map((input) => input.decisionVersion)).toEqual([1, 2, 3]);
    expect(projected.map((input) => input.priorStatus)).toEqual([null, "accepted", "waitlisted"]);
    expect(projected.map((input) => input.idempotencyKey)).toEqual([
      "evaluation-decision:submission-1:v1",
      "evaluation-decision:submission-1:v2",
      "evaluation-decision:submission-1:v3",
    ]);
    expect(projected.map((input) => input.communication.templatePurpose)).toEqual([
      "decision_accepted",
      "decision_waitlisted",
      "decision_rejected",
    ]);
    expect(projected[0]?.participantProjection).toEqual({
      status: "accepted",
      reason: "Committee consensus",
      decisionVersion: 1,
      decidedAt: nowIso,
    });
    expect(onboarded).toHaveLength(1);
  });

  it("surfaces projection failures and retries the persisted decision without duplicate success", async () => {
    let shouldFail = true;
    let attempts = 0;
    const { service } = await fixture({
      decisionProjection: {
        projectDecision: async () => {
          attempts += 1;
          if (shouldFail) throw new Error("projection unavailable");
        },
      },
    });

    const input = {
      planId: "plan-1",
      submissionId: submission.id,
      status: "waitlisted" as const,
      reason: "Capacity changed",
      idempotencyKey: "decision-retry",
    };
    await expect(service.recordDecision(organizer, input)).rejects.toThrow(
      "projection unavailable",
    );
    expect(await service.getDecision(organizer, input.planId, input.submissionId)).toMatchObject({
      status: "waitlisted",
      version: 1,
    });

    shouldFail = false;
    await expect(service.recordDecision(organizer, input)).resolves.toMatchObject({
      status: "waitlisted",
      version: 1,
    });
    expect(attempts).toBe(2);
  });
});
describe("evaluation authoring and advisory suggestion lifecycle", () => {
  it("versions authoring, locks grading on open, and applies deny-by-default projections", async () => {
    const repository = new InMemoryEvaluationRepository();
    const source = new InMemorySubmissionReviewSource([
      {
        ...submission,
        version: 4,
        files: [
          {
            id: "file-1",
            name: "notes.pdf",
            mimeType: "application/pdf",
            sizeBytes: 12,
          },
        ],
      },
    ]);
    const service = new EvaluationService(repository, source, {
      clock: () => new Date(nowIso),
    });
    const draft = await service.createPlan(organizer, {
      id: "authoring-plan",
      eventId,
      name: "Authoring plan",
      blindReview: true,
      closesAt: "2026-08-12T12:00:00.000Z",
      assignmentRule: { reviewsPerSubmission: 1, maxAssignmentsPerReviewer: 2 },
      rounds: [round],
      reviewerProjection: { fieldIds: [], fileIds: [] },
    });
    const edited = await service.updatePlan(organizer, draft.id, {
      expectedVersion: draft.version,
      name: "Edited authoring plan",
      rounds: [
        {
          ...round,
          name: "Edited committee review",
          rubric: { ...round.rubric, name: "Edited rubric" },
        },
      ],
    });
    expect(edited.version).toBe(2);
    const opened = await service.openPlan(organizer, edited.id, edited.version);
    expect(opened.gradingLockedAt).toBe(nowIso);
    await expectEvaluationError(
      service.updatePlan(organizer, edited.id, {
        expectedVersion: opened.version,
        name: "Must remain locked",
      }),
      "EVALUATION_CONFLICT",
    );
    const assignments = await service.assignReviewers(organizer, {
      planId: edited.id,
      roundId: round.id,
      submissionId: submission.id,
      reviewerIds: ["reviewer-1"],
    });
    const assignment = assignments[0];
    if (assignment === undefined) {
      throw new Error("Expected an assignment fixture.");
    }
    const context = await service.getReviewContext(reviewer("reviewer-1"), assignment.id);
    expect(context.submission.answers).toEqual({});
    expect(context.submission.files).toEqual([]);
    await expectEvaluationError(
      service.generateAiSuggestions(reviewer("reviewer-1"), {
        assignmentId: assignment.id,
      }),
      "EVALUATION_FORBIDDEN",
    );
  });

  it("requires an injected provider, snapshots revisions, and audits human resolutions", async () => {
    const repository = new InMemoryEvaluationRepository();
    const source = new InMemorySubmissionReviewSource([{ ...submission, version: 7 }]);
    const provider = {
      generate: async () => ({
        candidates: [
          {
            criterionId: "quality",
            value: 4,
            evidence: ["The abstract names a concrete audience outcome."],
            provenance: {
              provider: "test-provider",
              model: "test-model",
              generatedAt: nowIso,
              sourceReferences: ["abstract"],
            },
          },
          {
            criterionId: "relevance",
            value: 8,
            evidence: ["The proposal directly addresses the event topic."],
            provenance: {
              provider: "test-provider",
              model: "test-model",
              generatedAt: nowIso,
              sourceReferences: ["answers.topic"],
            },
          },
        ],
        provenance: {
          provider: "test-provider",
          model: "test-model",
          generatedAt: nowIso,
          sourceReferences: ["abstract", "answers.topic"],
        },
      }),
    };
    const service = new EvaluationService(repository, source, {
      clock: () => new Date(nowIso),
      aiSuggestionProvider: provider,
    });
    const draft = await service.createPlan(organizer, {
      id: "suggestion-plan",
      eventId,
      name: "Suggestion plan",
      blindReview: true,
      closesAt: "2026-08-12T12:00:00.000Z",
      assignmentRule: { reviewsPerSubmission: 1, maxAssignmentsPerReviewer: 2 },
      rounds: [round],
    });
    const plan = await service.openPlan(organizer, draft.id, draft.version);
    const assignments = await service.assignReviewers(organizer, {
      planId: plan.id,
      roundId: round.id,
      submissionId: submission.id,
      reviewerIds: ["reviewer-1"],
    });
    const assignment = assignments[0];
    if (assignment === undefined) {
      throw new Error("Expected an assignment fixture.");
    }
    const suggestion = await service.generateAiSuggestions(reviewer("reviewer-1"), {
      assignmentId: assignment.id,
    });
    expect(suggestion).toMatchObject({
      status: "pending",
      rubricRevision: plan.version,
      submissionRevision: 7,
      provenance: { provider: "test-provider", model: "test-model" },
    });
    expect(suggestion.candidates.quality?.[0]).toMatchObject({
      value: 4,
      evidence: ["The abstract names a concrete audience outcome."],
    });
    const rejectedSuggestion = await service.generateAiSuggestions(reviewer("reviewer-1"), {
      assignmentId: assignment.id,
    });
    const rejected = await service.resolveAiSuggestion(
      reviewer("reviewer-1"),
      rejectedSuggestion.id,
      {
        action: "reject",
        reason: "Evidence was not sufficient.",
        expectedVersion: rejectedSuggestion.version,
      },
    );
    expect(rejected.suggestion.status).toBe("rejected");
    expect(rejected.suggestion.history.at(-1)).toMatchObject({
      action: "reject",
      actorId: "reviewer-1",
      reason: "Evidence was not sufficient.",
    });
    const editedSuggestion = await service.generateAiSuggestions(reviewer("reviewer-1"), {
      assignmentId: assignment.id,
    });
    const edited = await service.resolveAiSuggestion(reviewer("reviewer-1"), editedSuggestion.id, {
      action: "edit",
      scores: { quality: 5 },
      reason: "Human evaluator adjusted the bounded score.",
      expectedVersion: editedSuggestion.version,
    });
    expect(edited.suggestion).toMatchObject({ status: "edited" });
    expect(edited.suggestion.history.at(-1)).toMatchObject({
      action: "edit",
      actorId: "reviewer-1",
      valueByCriterion: { quality: 5 },
    });
    expect(edited.review?.scores.quality).toMatchObject({
      value: 5,
      origin: "human",
      humanConfirmedBy: "reviewer-1",
      suggestionStatus: "edited",
    });
    const resolved = await service.resolveAiSuggestion(reviewer("reviewer-1"), suggestion.id, {
      action: "accept",
      expectedVersion: suggestion.version,
    });
    expect(resolved.suggestion.status).toBe("accepted");
    expect(resolved.suggestion.history.at(-1)).toMatchObject({
      action: "accept",
      actorId: "reviewer-1",
    });
    expect(resolved.review?.scores.quality).toMatchObject({
      origin: "human",
      humanConfirmedBy: "reviewer-1",
      suggestionStatus: "accepted",
    });
    const resolvedReview = resolved.review;
    if (resolvedReview === null) {
      throw new Error("Expected a resolved review.");
    }
    const submitted = await service.submitReview(
      reviewer("reviewer-1"),
      assignment.id,
      resolvedReview.version,
    );
    expect(submitted.submittedAt).not.toBeNull();
    expect(
      (await service.getAggregate(organizer, plan.id, round.id, submission.id))
        .submittedReviewCount,
    ).toBe(1);
  });

  it("marks suggestions stale when the submission revision changes", async () => {
    const repository = new InMemoryEvaluationRepository();
    const source = new InMemorySubmissionReviewSource([{ ...submission, version: 1 }]);
    const service = new EvaluationService(repository, source, {
      clock: () => new Date(nowIso),
      aiSuggestionProducer: async () => ({
        candidates: [
          {
            criterionId: "quality",
            value: 3,
            evidence: ["The abstract contains a claim."],
            provenance: {
              provider: "test",
              model: "test",
              generatedAt: nowIso,
              sourceReferences: ["abstract"],
            },
          },
        ],
      }),
    });
    const draft = await service.createPlan(organizer, {
      id: "stale-plan",
      eventId,
      name: "Stale plan",
      blindReview: true,
      closesAt: "2026-08-12T12:00:00.000Z",
      assignmentRule: { reviewsPerSubmission: 1, maxAssignmentsPerReviewer: 2 },
      rounds: [round],
    });
    const plan = await service.openPlan(organizer, draft.id, draft.version);
    const assignments = await service.assignReviewers(organizer, {
      planId: plan.id,
      roundId: round.id,
      submissionId: submission.id,
      reviewerIds: ["reviewer-1"],
    });
    const assignment = assignments[0];
    if (assignment === undefined) {
      throw new Error("Expected an assignment fixture.");
    }
    const suggestion = await service.generateAiSuggestions(reviewer("reviewer-1"), {
      assignmentId: assignment.id,
    });
    source.set({ ...submission, version: 2 });
    const listed = await service.listAiSuggestions(reviewer("reviewer-1"), assignment.id);
    expect(listed[0]).toMatchObject({ id: suggestion.id, status: "stale" });
    await expectEvaluationError(
      service.resolveAiSuggestion(reviewer("reviewer-1"), suggestion.id, {
        action: "accept",
        expectedVersion: suggestion.version,
      }),
      "EVALUATION_CONFLICT",
    );
  });
});
