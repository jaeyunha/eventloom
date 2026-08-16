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
  type EvaluationEventMetadataSource,
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

function evaluationEventSource(
  overrides: Partial<{
    startsAt: string;
    endsAt: string;
    timeZone: string;
  }> = {},
): EvaluationEventMetadataSource {
  return {
    async getEventMetadata(requestedTenantId, requestedEventId) {
      if (requestedTenantId !== tenantId || requestedEventId !== eventId) return null;
      return {
        id: eventId,
        name: "Monthly program",
        timeZone: overrides.timeZone ?? "America/Los_Angeles",
        startsAt: overrides.startsAt ?? "2026-08-09T16:00:00.000Z",
        endsAt: overrides.endsAt ?? "2026-09-30T23:59:00.000Z",
      };
    },
  };
}

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
  planGate: Promise<void> | null = null;
  planListStarted: (() => void) | null = null;
  planListCalls = 0;
  organizerWorkspaceCalls = 0;
  organizerWorkspaceStarted: (() => void) | null = null;
  decisionCalls = 0;
  workspaceCalls = 0;
  assignmentListCalls = 0;
  reviewListCalls = 0;
  batchGate: Promise<void> | null = null;
  organizerWorkspaceFailure: Error | null = null;

  override async listPlans(tenantId: string, requestedEventId?: string) {
    this.planListCalls += 1;
    this.planListStarted?.();
    const gate = this.planGate;
    if (gate !== null) await gate;
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
    this.organizerWorkspaceStarted?.();
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
    this.planGate = null;
    this.planListStarted = null;
    this.planListCalls = 0;
    this.workspaceCalls = 0;
    this.assignmentListCalls = 0;
    this.reviewListCalls = 0;
    this.organizerWorkspaceCalls = 0;
    this.organizerWorkspaceStarted = null;
    this.decisionCalls = 0;
  }
}

class MultiTenantWorkspaceRepository extends InMemoryEvaluationRepository {
  readonly workspaceScopes: Array<{
    readonly tenantId: string;
    readonly eventIds: readonly string[];
  }> = [];

  override async listReviewerWorkspaceRecords(
    tenantId: string,
    reviewerId: string,
    eventIds: readonly string[],
  ): Promise<ReviewerWorkspaceRecords> {
    this.workspaceScopes.push({ tenantId, eventIds });
    return super.listReviewerWorkspaceRecords(tenantId, reviewerId, eventIds);
  }
}

class WorkspaceBatchSource extends InMemorySubmissionReviewSource {
  singleCalls = 0;
  batchCalls = 0;
  lastLookups: readonly SubmissionReviewLookup[] = [];
  omitMaterials = false;
  failure: Error | null = null;
  organizerListCalls = 0;
  organizerListStarted: (() => void) | null = null;
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
    this.organizerListStarted?.();
    const gate = this.organizerBatchGate;
    if (gate !== null) await gate;
    return super.listSubmissionsForOrganizer(requestedTenantId, requestedEventId);
  }

  resetCounts(): void {
    this.singleCalls = 0;
    this.batchCalls = 0;
    this.lastLookups = [];
    this.organizerListCalls = 0;
    this.organizerListStarted = null;
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
    reviewRound?: ReviewRound;
    reviewRounds?: readonly ReviewRound[];
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
  const service = new EvaluationService(
    repository,
    submissions,
    {
      ...evaluationEventSource(),
    },
    {
      clock: () => new Date(currentTime),
      ...(options.acceptanceHandoff === undefined
        ? {}
        : { acceptanceHandoff: options.acceptanceHandoff }),
      ...(options.decisionProjection === undefined
        ? {}
        : { decisionProjection: options.decisionProjection }),
    },
  );
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
    rounds: options.reviewRounds ?? [options.reviewRound ?? round],
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
  it("returns submitted organizer comments while withholding reviewer drafts", async () => {
    const { service, repository } = await fixture({
      reviewsPerSubmission: 2,
      maxAssignmentsPerReviewer: 2,
    });
    const assignments = await service.assignReviewers(organizer, {
      planId: "plan-1",
      roundId: round.id,
      submissionId: submission.id,
      reviewerIds: ["reviewer-submitted", "reviewer-draft"],
    });
    const submittedAssignment = assignments.find(
      (assignment) => assignment.reviewerId === "reviewer-submitted",
    );
    const draftAssignment = assignments.find(
      (assignment) => assignment.reviewerId === "reviewer-draft",
    );
    if (submittedAssignment === undefined || draftAssignment === undefined) {
      throw new Error("Expected submitted and draft assignment fixtures.");
    }

    const submittedReview = await service.saveReview(
      reviewer(submittedAssignment.reviewerId),
      submittedAssignment.id,
      {
        scores: [
          { criterionId: "quality", value: 4, origin: "human" },
          { criterionId: "relevance", value: 8, origin: "human" },
        ],
        comment: "Submitted committee evidence.",
      },
    );
    await service.submitReview(
      reviewer(submittedAssignment.reviewerId),
      submittedAssignment.id,
      submittedReview.version,
    );
    await service.saveReview(reviewer(draftAssignment.reviewerId), draftAssignment.id, {
      scores: [
        { criterionId: "quality", value: 3, origin: "human" },
        { criterionId: "relevance", value: 6, origin: "human" },
      ],
      comment: "Private draft evidence.",
    });

    const workspace = await service.getOrganizerWorkspace(organizer, eventId);

    expect(workspace.submittedReviews).toEqual([
      expect.objectContaining({
        submissionId: submission.id,
        reviewerId: submittedAssignment.reviewerId,
        roundId: round.id,
        comment: "Submitted committee evidence.",
      }),
    ]);
    expect(JSON.stringify(workspace.submittedReviews)).not.toContain("Private draft evidence.");
    await expectEvaluationError(
      service.getOrganizerWorkspace(reviewer(submittedAssignment.reviewerId), eventId),
      "EVALUATION_FORBIDDEN",
    );

    const persistedAssignment = await repository.getAssignment(tenantId, submittedAssignment.id);
    if (persistedAssignment === null) {
      throw new Error("Expected the submitted assignment to remain persisted.");
    }
    await service.replaceAssignment(organizer, submittedAssignment.id, {
      replacementReviewerId: "reviewer-replacement",
      expectedVersion: persistedAssignment.version,
      reason: "The original reviewer became unavailable.",
    });
    await expect(service.getOrganizerWorkspace(organizer, eventId)).resolves.toMatchObject({
      submittedReviews: [],
    });
  });

  it("loads reviewer work across every granted organization scope", async () => {
    const repository = new MultiTenantWorkspaceRepository();
    const service = new EvaluationService(
      repository,
      new InMemorySubmissionReviewSource(),
      evaluationEventSource(),
    );

    await expect(
      service.listReviewerWorkspace({
        tenantId: "org-a",
        userId: "reviewer-multi-org",
        kind: "human",
        grants: [
          { tenantId: "org-a", eventId: "event-a", role: "reviewer" },
          { tenantId: "org-b", eventId: "event-b", role: "reviewer" },
        ],
      }),
    ).resolves.toEqual({ assignments: [] });

    expect(repository.workspaceScopes).toEqual([
      { tenantId: "org-a", eventIds: ["event-a"] },
      { tenantId: "org-b", eventIds: ["event-b"] },
    ]);
  });

  it("scopes duplicate event identifiers to one requested organization", async () => {
    const repository = new MultiTenantWorkspaceRepository();
    const service = new EvaluationService(
      repository,
      new InMemorySubmissionReviewSource(),
      evaluationEventSource(),
    );

    await expect(
      service.listReviewerWorkspace(
        {
          tenantId: "org-a",
          userId: "reviewer-multi-org",
          kind: "human",
          grants: [
            { tenantId: "org-a", eventId: "shared-event", role: "reviewer" },
            { tenantId: "org-b", eventId: "shared-event", role: "reviewer" },
          ],
        },
        "shared-event",
        "org-b",
      ),
    ).resolves.toEqual({ assignments: [] });

    expect(repository.workspaceScopes).toEqual([{ tenantId: "org-b", eventIds: ["shared-event"] }]);
  });

  it("accepts zero-weight dropdowns and neutral free-text bounds", async () => {
    const service = new EvaluationService(
      new InMemoryEvaluationRepository(),
      new InMemorySubmissionReviewSource(),
      evaluationEventSource(),
      { clock: () => new Date(nowIso) },
    );
    const plan = await service.createPlan(organizer, {
      id: "plan-non-numeric-criteria",
      eventId: "event-1",
      name: "Program review",
      blindReview: true,
      closesAt: "2026-09-10T19:00:00.000Z",
      assignmentRule: {
        reviewsPerSubmission: 2,
        maxAssignmentsPerReviewer: 12,
      },
      rounds: [
        {
          id: "round-1",
          name: "Committee review",
          sequence: 1,
          opensAt: "2026-08-08T12:00:00.000Z",
          closesAt: "2026-09-10T19:00:00.000Z",
          blindReview: true,
          anonymization: "double",
          reviewerPool: { name: "Program committee", reviewerIds: ["reviewer-1"] },
          rubric: {
            id: "rubric-1",
            name: "Program rubric",
            criteria: [
              {
                id: "recommendation",
                label: "Recommendation",
                description: "Would you recommend this proposal?",
                minimum: 0,
                maximum: 2,
                weight: 0,
                required: true,
                inputType: "dropdown",
                options: [
                  { label: "Accept", value: "accept" },
                  { label: "Maybe", value: "maybe" },
                  { label: "Reject", value: "reject" },
                ],
              },
              {
                id: "reviewer-notes",
                label: "Reviewer notes",
                description: "Share committee-only context.",
                minimum: 0,
                maximum: 0,
                weight: 0,
                required: false,
                inputType: "free_text",
              },
            ],
          },
        },
      ],
    });

    expect(plan.rounds[0]?.rubric.criteria).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "recommendation", inputType: "dropdown" }),
        expect.objectContaining({ id: "reviewer-notes", inputType: "free_text" }),
      ]),
    );
  });

  it("replaces the complete active reviewer set and validates resulting limits", async () => {
    const { service, repository } = await fixture({ reviewsPerSubmission: 2 });
    const initial = await service.assignReviewers(organizer, {
      planId: "plan-1",
      roundId: round.id,
      submissionId: submission.id,
      reviewerIds: ["reviewer-1", "reviewer-2"],
    });

    expect(initial).toHaveLength(2);
    const replacement = await service.assignReviewers(organizer, {
      planId: "plan-1",
      roundId: round.id,
      submissionId: submission.id,
      reviewerIds: ["reviewer-2", "reviewer-3"],
    });
    expect(replacement).toHaveLength(2);
    expect(replacement[0]?.reviewerId).toBe("reviewer-2");
    expect(replacement[0]?.id).toBe(initial[1]?.id);
    await expect(repository.getAssignment(tenantId, initial[0]?.id ?? "")).resolves.toMatchObject({
      status: "superseded",
      successorAssignmentId: null,
    });
    await expect(repository.getAssignment(tenantId, initial[1]?.id ?? "")).resolves.toMatchObject({
      reviewerId: "reviewer-2",
    });

    await expect(
      service.assignReviewers(organizer, {
        planId: "plan-1",
        roundId: round.id,
        submissionId: "submission-2",
        reviewerIds: ["reviewer-1"],
      }),
    ).resolves.toHaveLength(1);
  });

  it("reuses one active assignment for the same reviewer, plan, round, and submission", async () => {
    const { service, repository } = await fixture({ reviewsPerSubmission: 1 });
    const original = await assignOne(service, "reviewer-1");

    const repeated = await service.assignReviewers(organizer, {
      planId: "plan-1",
      roundId: round.id,
      submissionId: submission.id,
      reviewerIds: ["reviewer-1"],
    });

    expect(repeated).toEqual([original]);
    const matchingAssignments = (await repository.listAssignments(tenantId, "plan-1")).filter(
      (assignment) =>
        assignment.tenantId === tenantId &&
        assignment.eventId === eventId &&
        assignment.planId === "plan-1" &&
        assignment.roundId === round.id &&
        assignment.submissionId === submission.id &&
        assignment.reviewerId === "reviewer-1" &&
        assignment.status !== "superseded",
    );
    expect(matchingAssignments).toEqual([original]);
    expect(original).not.toHaveProperty("predecessorAssignmentId");
  });

  it("creates separate active root assignments for the same reviewer and submission in different rounds", async () => {
    const finalRound: ReviewRound = {
      ...round,
      id: "round-2",
      name: "Final review",
      sequence: 2,
    };
    const { service } = await fixture({
      reviewsPerSubmission: 1,
      maxAssignmentsPerReviewer: 2,
      reviewRounds: [round, finalRound],
    });
    const committeeAssignment = await assignOne(service, "reviewer-1");

    const finalAssignments = await service.assignReviewers(organizer, {
      planId: "plan-1",
      roundId: finalRound.id,
      submissionId: submission.id,
      reviewerIds: ["reviewer-1"],
    });
    const finalAssignment = finalAssignments[0];
    if (finalAssignment === undefined)
      throw new Error("Expected a final-round assignment fixture.");

    expect(finalAssignment).toMatchObject({
      id: `plan-1:${finalRound.id}:${submission.id}:reviewer-1`,
      roundId: finalRound.id,
      submissionId: submission.id,
      reviewerId: "reviewer-1",
      status: "assigned",
    });
    expect(finalAssignment.id).not.toBe(committeeAssignment.id);
    expect(committeeAssignment).not.toHaveProperty("predecessorAssignmentId");
    expect(finalAssignment).not.toHaveProperty("predecessorAssignmentId");
    await expect(
      service.listReviewerAssignments(reviewer("reviewer-1"), "plan-1"),
    ).resolves.toEqual([
      expect.objectContaining({ id: committeeAssignment.id, roundId: round.id }),
      expect.objectContaining({ id: finalAssignment.id, roundId: finalRound.id }),
    ]);
  });

  it("excludes terminal submissions from active queues and progress while retaining history", async () => {
    const submissions = new WorkspaceBatchSource([
      submission,
      { ...submission, id: "submission-withdrawn", status: "withdrawn" },
    ]);
    const { service, repository } = await fixture({
      submissions,
      reviewsPerSubmission: 2,
      maxAssignmentsPerReviewer: 2,
    });
    const activeAssignment = await assignOne(service, "reviewer-1");
    const withdrawnAssignment: EvaluationAssignment = {
      ...activeAssignment,
      id: "assignment-withdrawn",
      submissionId: "submission-withdrawn",
      reviewerId: "reviewer-2",
    };
    await repository.putAssignmentsForTesting([withdrawnAssignment]);
    await repository.putReview(
      {
        id: "review-withdrawn",
        tenantId,
        eventId,
        planId: "plan-1",
        roundId: round.id,
        assignmentId: withdrawnAssignment.id,
        submissionId: withdrawnAssignment.submissionId,
        reviewerId: withdrawnAssignment.reviewerId,
        scores: {},
        comment: "Historical draft remains stored.",
        submittedAt: null,
        version: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      null,
    );

    await expect(service.listReviewerWorkspace(reviewer("reviewer-2"), eventId)).resolves.toEqual({
      assignments: [],
    });
    await expect(service.listOrganizerAssignments(organizer, "plan-1")).resolves.toEqual([
      expect.objectContaining({ id: activeAssignment.id }),
    ]);
    await expect(service.getProgress(organizer, "plan-1")).resolves.toMatchObject({
      total: 1,
      assigned: 1,
    });
    await expect(repository.getAssignment(tenantId, withdrawnAssignment.id)).resolves.toMatchObject(
      {
        id: withdrawnAssignment.id,
        status: "assigned",
      },
    );
    await expect(repository.getReview(tenantId, withdrawnAssignment.id)).resolves.toMatchObject({
      id: "review-withdrawn",
    });
    await expect(
      service.getReviewContext(reviewer("reviewer-2"), withdrawnAssignment.id),
    ).rejects.toMatchObject({ code: "EVALUATION_CONFLICT" });
  });

  it("excludes decided submissions from reviewer queues while retaining organizer facts", async () => {
    const { service, repository } = await fixture({ reviewsPerSubmission: 1 });
    const assignment = await assignOne(service);
    await service.recordDecision(organizer, {
      planId: "plan-1",
      submissionId: submission.id,
      status: "rejected",
      reason: "The program committee reached a final decision.",
      idempotencyKey: "terminal-review-decision",
    });

    await expect(
      service.listReviewerAssignments(reviewer("reviewer-1"), "plan-1"),
    ).resolves.toEqual([]);
    await expect(service.getOrganizerWorkspace(organizer, eventId)).resolves.toMatchObject({
      assignments: [
        {
          id: assignment.id,
          submissionId: submission.id,
          reviewerId: "reviewer-1",
          status: "assigned",
        },
      ],
      progress: { total: 1, assigned: 1, completionPercent: 0 },
      aggregates: expect.arrayContaining([
        expect.objectContaining({
          submissionId: submission.id,
          roundId: round.id,
          submittedReviewCount: 0,
          expectedReviewCount: 1,
        }),
      ]),
      decisions: { [submission.id]: { status: "rejected" } },
    });
    await expect(repository.getAssignment(tenantId, assignment.id)).resolves.toMatchObject({
      id: assignment.id,
      status: "assigned",
    });
    await expect(
      service.assignReviewers(organizer, {
        planId: "plan-1",
        roundId: round.id,
        submissionId: submission.id,
        reviewerIds: ["reviewer-2"],
      }),
    ).rejects.toMatchObject({ code: "EVALUATION_CONFLICT" });
  });

  it("allows a historical CFP outcome to enter a new review plan", async () => {
    const submissions = new InMemorySubmissionReviewSource([
      {
        ...submission,
        id: "submission-accepted",
        status: "accepted",
        title: "Accepted in an earlier CFP workflow",
      },
    ]);
    const { service, plan, repository } = await fixture({
      submissions,
    });

    const [assignment] = await service.assignReviewers(organizer, {
      planId: plan.id,
      roundId: plan.rounds[0]?.id ?? "",
      submissionId: "submission-accepted",
      reviewerIds: ["reviewer-1"],
    });
    expect(assignment).toMatchObject({
      submissionId: "submission-accepted",
      reviewerId: "reviewer-1",
      status: "assigned",
    });
    await repository.putDecision(
      {
        id: "decision-historical-plan",
        tenantId,
        eventId,
        planId: "historical-plan",
        submissionId: "submission-accepted",
        status: "accepted",
        version: 1,
        history: [],
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      null,
    );

    await expect(service.getOrganizerWorkspace(organizer, eventId, plan.id)).resolves.toMatchObject(
      {
        assignments: [
          {
            submissionId: "submission-accepted",
            reviewerId: "reviewer-1",
            status: "assigned",
          },
        ],
      },
    );
    await expect(
      service.assignReviewers(organizer, {
        planId: plan.id,
        roundId: plan.rounds[0]?.id ?? "",
        submissionId: "submission-accepted",
        reviewerIds: ["reviewer-1"],
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        submissionId: "submission-accepted",
        reviewerId: "reviewer-1",
        status: "assigned",
      }),
    ]);
  });

  it("supports an empty replacement and removes organizer and reviewer projections", async () => {
    const { service, repository } = await fixture();
    const assignment = await assignOne(service);
    await service.saveReview(reviewer("reviewer-1"), assignment.id, {
      scores: [{ criterionId: "quality", value: 4, origin: "human" }],
    });

    await service.assignReviewers(organizer, {
      planId: "plan-1",
      roundId: round.id,
      submissionId: submission.id,
      reviewerIds: [],
    });

    await expect(repository.getAssignment(tenantId, assignment.id)).resolves.toMatchObject({
      status: "superseded",
      supersededReason: expect.any(String),
    });
    await expect(repository.getReview(tenantId, assignment.id)).resolves.toMatchObject({
      assignmentId: assignment.id,
    });
    await expect(service.listReviewerWorkspace(reviewer("reviewer-1"), eventId)).resolves.toEqual({
      assignments: [],
    });
    await expect(service.getOrganizerWorkspace(organizer, eventId)).resolves.toMatchObject({
      assignments: [],
      progress: { total: 0, completionPercent: 0 },
    });
  });

  it("retains replacement lineage and review evidence while isolating reviewer workspaces", async () => {
    const { service, repository } = await fixture({ reviewsPerSubmission: 2 });
    const original = await assignOne(service, "reviewer-1");
    const review = await service.saveReview(reviewer("reviewer-1"), original.id, {
      scores: [{ criterionId: "quality", value: 4, origin: "human" }],
      comment: "Retained evidence.",
    });
    const currentAssignment = await repository.getAssignment(tenantId, original.id);
    if (currentAssignment === null) throw new Error("Expected retained assignment fixture.");

    const result = await service.replaceAssignment(organizer, original.id, {
      replacementReviewerId: "reviewer-2",
      expectedVersion: currentAssignment.version,
      reason: "Reviewer conflict disclosed after assignment.",
    });

    expect(result.replacedAssignment).toMatchObject({
      id: original.id,
      status: "superseded",
      successorAssignmentId: result.successorAssignment.id,
      supersededReason: "Reviewer conflict disclosed after assignment.",
    });
    expect(result.replacedAssignment.lineage).toMatchObject({
      predecessorAssignmentId: null,
      successorAssignmentId: result.successorAssignment.id,
      reason: "Reviewer conflict disclosed after assignment.",
    });
    expect(result.successorAssignment).toMatchObject({
      reviewerId: "reviewer-2",
      predecessorAssignmentId: original.id,
      status: "assigned",
    });
    expect(result.successorAssignment.lineage).toMatchObject({
      predecessorAssignmentId: original.id,
      successorAssignmentId: null,
      reason: "Reviewer conflict disclosed after assignment.",
    });
    expect(result.history).toEqual([
      expect.objectContaining({
        assignment: expect.objectContaining({ id: original.id, status: "superseded" }),
        review: expect.objectContaining({ id: review.id, assignmentId: original.id }),
      }),
    ]);
    await expect(repository.getReview(tenantId, original.id)).resolves.toMatchObject({
      id: review.id,
    });
    await expect(service.listReviewerWorkspace(reviewer("reviewer-1"), eventId)).resolves.toEqual({
      assignments: [],
    });
    await expect(
      service.listReviewerWorkspace(reviewer("reviewer-2"), eventId),
    ).resolves.toMatchObject({
      assignments: [
        expect.objectContaining({
          assignment: expect.objectContaining({ id: result.successorAssignment.id }),
        }),
      ],
    });
    await expect(service.getOrganizerWorkspace(organizer, eventId)).resolves.toMatchObject({
      assignments: [
        expect.objectContaining({ id: result.successorAssignment.id, status: "assigned" }),
      ],
    });
    const organizerRecords = await repository.listOrganizerWorkspaceRecords(tenantId, eventId);
    expect(organizerRecords.assignments.map((candidate) => candidate.id)).toEqual([
      result.successorAssignment.id,
    ]);
    expect(organizerRecords.reviews).toEqual([
      expect.objectContaining({ assignmentId: original.id, id: review.id }),
    ]);
  });

  it("rejects a stale replacement without mutating the retained assignment or review", async () => {
    const { service, repository } = await fixture();
    const original = await assignOne(service, "reviewer-1");
    const draft = await service.saveReview(reviewer("reviewer-1"), original.id, {
      scores: [{ criterionId: "quality", value: 4, origin: "human" }],
    });
    const currentAssignment = await repository.getAssignment(tenantId, original.id);
    if (currentAssignment === null) throw new Error("Expected retained assignment fixture.");
    await service.replaceAssignment(organizer, original.id, {
      replacementReviewerId: "reviewer-2",
      expectedVersion: currentAssignment.version,
      reason: "Replace the first reviewer.",
    });

    await expectEvaluationError(
      service.replaceAssignment(organizer, original.id, {
        replacementReviewerId: "reviewer-3",
        expectedVersion: original.version,
        reason: "Stale replacement attempt.",
      }),
      "EVALUATION_CONFLICT",
    );
    await expect(repository.getAssignment(tenantId, original.id)).resolves.toMatchObject({
      status: "superseded",
      successorAssignmentId: expect.any(String),
    });
    await expect(repository.getReview(tenantId, original.id)).resolves.toMatchObject({
      id: draft.id,
      assignmentId: original.id,
    });
  });

  it("reports distribution deficits and reviewer exclusions", async () => {
    const { service, plan } = await fixture({
      reviewsPerSubmission: 1,
      maxAssignmentsPerReviewer: 1,
    });
    const assignment = await assignOne(service, "reviewer-1");
    await service.declareConflict(
      reviewer("reviewer-1"),
      assignment.id,
      "Reviewer has a conflict.",
    );

    const preview = await service.previewDistribution(organizer, {
      planId: plan.id,
      roundId: round.id,
      submissionIds: [submission.id],
      reviewerIds: ["reviewer-1"],
      expectedVersion: plan.version,
    });

    expect(preview.desiredAssignments).toEqual([]);
    expect(preview.deficits).toEqual([
      {
        submissionId: submission.id,
        missingReviewCount: 1,
        reason: "insufficient_eligible_reviewers",
      },
    ]);
    expect(preview.exclusions).toEqual([
      {
        submissionId: submission.id,
        reviewerId: "reviewer-1",
        reason: "declared_conflict",
      },
    ]);
  });
  it("reports track-filter exclusions without creating assignments", async () => {
    const { service, plan } = await fixture({
      reviewsPerSubmission: 1,
      maxAssignmentsPerReviewer: 2,
      submissionMaterial: { ...submission, trackIds: ["track-other"] },
      reviewRound: { ...round, trackFilter: "track-required" },
    });

    const preview = await service.previewDistribution(organizer, {
      planId: plan.id,
      roundId: round.id,
      submissionIds: [submission.id],
      reviewerIds: ["reviewer-1"],
      expectedVersion: plan.version,
    });

    expect(preview.desiredAssignments).toEqual([]);
    expect(preview.deficits).toEqual([
      {
        submissionId: submission.id,
        missingReviewCount: 1,
        reason: "submission_outside_track",
      },
    ]);
    expect(preview.exclusions).toEqual([
      {
        submissionId: submission.id,
        reviewerId: "reviewer-1",
        reason: "outside_track",
      },
    ]);
  });
  it("produces deterministic distribution fingerprints and rejects stale applies", async () => {
    const { service, plan } = await fixture({
      reviewsPerSubmission: 1,
      maxAssignmentsPerReviewer: 2,
    });
    const preview = await service.previewDistribution(organizer, {
      planId: plan.id,
      roundId: round.id,
      submissionIds: [submission.id, "submission-2"],
      reviewerIds: ["reviewer-2", "reviewer-1"],
      expectedVersion: plan.version,
    });
    const reordered = await service.previewDistribution(organizer, {
      planId: plan.id,
      roundId: round.id,
      submissionIds: ["submission-2", submission.id],
      reviewerIds: ["reviewer-1", "reviewer-2"],
      expectedVersion: plan.version,
    });
    expect(reordered).toEqual(preview);
    expect(preview.desiredAssignments).toEqual([
      expect.objectContaining({ submissionId: submission.id, reviewerId: "reviewer-1" }),
      expect.objectContaining({ submissionId: "submission-2", reviewerId: "reviewer-2" }),
    ]);
    expect(preview.deficits).toEqual([]);
    expect(preview.exclusions).toEqual([]);
    expect(preview.fingerprint).toEqual(expect.any(String));
    expect(preview.fingerprint.length).toBeGreaterThan(0);

    await assignOne(service, "reviewer-1");
    await expectEvaluationError(
      service.applyDistribution(organizer, {
        planId: plan.id,
        roundId: round.id,
        submissionIds: [submission.id, "submission-2"],
        reviewerIds: ["reviewer-1", "reviewer-2"],
        expectedVersion: plan.version,
        fingerprint: preview.fingerprint,
      }),
      "EVALUATION_CONFLICT",
    );
  });
  it("applies a submission-scoped distribution without touching unrelated assignments", async () => {
    const { service, repository, plan } = await fixture({
      reviewsPerSubmission: 1,
      maxAssignmentsPerReviewer: 2,
    });
    const unrelated = await service.assignReviewers(organizer, {
      planId: plan.id,
      roundId: round.id,
      submissionId: "submission-2",
      reviewerIds: ["reviewer-9"],
    });
    const preview = await service.previewDistribution(organizer, {
      planId: plan.id,
      roundId: round.id,
      submissionIds: [submission.id],
      reviewerIds: ["reviewer-1"],
      expectedVersion: plan.version,
    });

    await expect(
      service.applyDistribution(organizer, {
        planId: plan.id,
        roundId: round.id,
        submissionIds: [submission.id],
        reviewerIds: ["reviewer-1"],
        expectedVersion: plan.version,
        fingerprint: preview.fingerprint,
      }),
    ).resolves.toMatchObject({
      activeAssignments: [
        expect.objectContaining({
          submissionId: submission.id,
          reviewerId: "reviewer-1",
        }),
      ],
    });
    await expect(repository.getAssignment(tenantId, unrelated[0]?.id ?? "")).resolves.toMatchObject(
      {
        status: "assigned",
        submissionId: "submission-2",
        reviewerId: "reviewer-9",
      },
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
  it("starts organizer hydration while plan discovery is gated and uses authoritative review progress", async () => {
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
    await repository.putAssignmentsForTesting([
      { ...assignment, id: "assignment-other-event", eventId: "event-2" },
      { ...assignment, id: "assignment-other-tenant", tenantId: "tenant-2" },
    ]);
    repository.resetCounts();
    submissions.resetCounts();

    let releaseBatchReads = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseBatchReads = resolve;
    });
    repository.planGate = gate;
    repository.batchGate = gate;
    submissions.organizerBatchGate = gate;
    const planListStarted = new Promise<void>((resolve) => {
      repository.planListStarted = resolve;
    });
    const organizerWorkspaceStarted = new Promise<void>((resolve) => {
      repository.organizerWorkspaceStarted = resolve;
    });
    const organizerListStarted = new Promise<void>((resolve) => {
      submissions.organizerListStarted = resolve;
    });
    const pending = service.getOrganizerWorkspace(organizer, eventId);
    await Promise.all([planListStarted, organizerWorkspaceStarted, organizerListStarted]);

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
        expect.objectContaining({
          submissionId: "submission-2",
          roundId: round.id,
          submittedReviewCount: 0,
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

  it("returns missing-plan deterministically when organizer hydration fails", async () => {
    const repository = new WorkspaceBatchRepository();
    repository.organizerWorkspaceFailure = new Error("Decision row could not be decoded.");
    const submissions = new WorkspaceBatchSource([submission]);
    const service = new EvaluationService(repository, submissions, evaluationEventSource());

    await expectEvaluationError(
      service.getOrganizerWorkspace(organizer, eventId),
      "EVALUATION_NOT_FOUND",
    );

    expect(repository.planListCalls).toBe(1);
    expect(repository.organizerWorkspaceCalls).toBe(1);
    expect(repository.assignmentListCalls).toBe(0);
    expect(repository.reviewListCalls).toBe(0);
    expect(submissions.organizerListCalls).toBe(1);
  });
  it("supersedes assignments and retains review evidence during organizer cleanup", async () => {
    const { service, repository } = await fixture({ reviewsPerSubmission: 2 });
    const assigned = await assignOne(service);

    await service.unassignAssignment(organizer, "plan-1", assigned.id);
    await expect(repository.getAssignment(tenantId, assigned.id)).resolves.toMatchObject({
      status: "superseded",
    });

    const inProgress = await assignOne(service, "reviewer-2");
    const draft = await service.saveReview(reviewer("reviewer-2"), inProgress.id, {
      scores: [{ criterionId: "quality", value: 4, origin: "human" }],
    });
    expect(draft.submittedAt).toBeNull();
    await expect(repository.getAssignment(tenantId, inProgress.id)).resolves.toMatchObject({
      status: "in_progress",
    });

    await service.unassignAssignment(organizer, "plan-1", inProgress.id);
    await expect(repository.getAssignment(tenantId, inProgress.id)).resolves.toMatchObject({
      status: "superseded",
    });
    await expect(repository.getReview(tenantId, inProgress.id)).resolves.toMatchObject({
      id: draft.id,
    });
    const reassigned = await assignOne(service, "reviewer-2");
    expect(reassigned).toMatchObject({ status: "assigned", version: 1 });
    expect(reassigned.id).not.toBe(inProgress.id);
    await expect(repository.getReview(tenantId, reassigned.id)).resolves.toBeNull();
  });
  it("allows organizer cleanup after the evaluation plan closes", async () => {
    const { plan, repository, service } = await fixture();
    const assignment = await assignOne(service);
    await service.closePlan(organizer, plan.id, plan.version);

    await service.unassignAssignment(organizer, plan.id, assignment.id);

    await expect(repository.getAssignment(tenantId, assignment.id)).resolves.toMatchObject({
      status: "superseded",
    });
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

    await repository.putAssignmentsForTesting([
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

  it("supersedes submitted assignments while preserving review evidence", async () => {
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

    await service.unassignAssignment(organizer, "plan-1", assignment.id);
    await expect(repository.getAssignment(tenantId, assignment.id)).resolves.toMatchObject({
      status: "superseded",
    });
    await expect(repository.getReview(tenantId, assignment.id)).resolves.toMatchObject({
      id: submitted.id,
      assignmentId: assignment.id,
    });

    const abstained = await assignOne(service, "reviewer-2");
    await repository.putAssignmentsForTesting([
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
    await expect(
      staleService.getReviewContext(reviewer("reviewer-1"), staleAssignment.id),
    ).resolves.toMatchObject({
      assignment: { status: "submitted" },
    });
    await staleService.unassignAssignment(organizer, "plan-1", staleAssignment.id);
    await expect(staleRepository.listAssignments(tenantId, "plan-1")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: staleAssignment.id, status: "superseded" }),
      ]),
    );
  });
  it("rounds bounded completion percentages for display", async () => {
    const submissions = new InMemorySubmissionReviewSource([
      submission,
      { ...submission, id: "submission-2", title: "Another session" },
      { ...submission, id: "submission-3", title: "Third session" },
    ]);
    const { service } = await fixture({
      submissions,
      reviewsPerSubmission: 1,
      maxAssignmentsPerReviewer: 3,
    });
    const assignments = await Promise.all(
      ["submission-1", "submission-2", "submission-3"].map(async (submissionId) => {
        const result = await service.assignReviewers(organizer, {
          planId: "plan-1",
          roundId: round.id,
          submissionId,
          reviewerIds: ["reviewer-1"],
        });
        const assignment = result[0];
        if (assignment === undefined) throw new Error("Expected an assignment fixture.");
        return assignment;
      }),
    );
    for (const assignment of assignments.slice(0, 2)) {
      const draft = await service.saveReview(reviewer("reviewer-1"), assignment.id, {
        scores: [
          { criterionId: "quality", value: 4, origin: "human" },
          { criterionId: "relevance", value: 8, origin: "human" },
        ],
      });
      await service.submitReview(reviewer("reviewer-1"), assignment.id, draft.version);
    }

    await expect(service.getProgress(organizer, "plan-1")).resolves.toMatchObject({
      total: 3,
      submitted: 2,
      completionPercent: 67,
    });
  });
});

describe("evaluation temporal integrity", () => {
  it.each(["2026-08-10", "2026-08-10T12:00:00"])(
    "rejects evaluation boundaries without an explicit offset: %s",
    async (boundary) => {
      const service = new EvaluationService(
        new InMemoryEvaluationRepository(),
        new InMemorySubmissionReviewSource(),
        evaluationEventSource(),
        { clock: () => new Date(nowIso) },
      );

      await expect(
        service.createPlan(organizer, {
          id: `invalid-${boundary}`,
          eventId,
          name: "Invalid review boundary",
          blindReview: true,
          closesAt: boundary,
          assignmentRule: { reviewsPerSubmission: 1, maxAssignmentsPerReviewer: 1 },
          rounds: [round],
        }),
      ).rejects.toMatchObject({ code: "EVALUATION_INVALID_INPUT" });
      await expect(
        service.createPlan(organizer, {
          id: `invalid-round-${boundary}`,
          eventId,
          name: "Invalid round boundary",
          blindReview: true,
          closesAt: "2026-08-12T12:00:00.000Z",
          assignmentRule: { reviewsPerSubmission: 1, maxAssignmentsPerReviewer: 1 },
          rounds: [{ ...round, closesAt: boundary }],
        }),
      ).rejects.toMatchObject({ code: "EVALUATION_INVALID_INPUT" });
    },
  );

  it("normalizes alternate offsets before ordering, event-bound checks, and persistence", async () => {
    const service = new EvaluationService(
      new InMemoryEvaluationRepository(),
      new InMemorySubmissionReviewSource(),
      evaluationEventSource({ endsAt: "2026-08-11T12:00:00.000Z" }),
      { clock: () => new Date(nowIso) },
    );

    const created = await service.createPlan(organizer, {
      id: "offset-plan",
      eventId,
      name: "Offset review",
      blindReview: true,
      closesAt: "2026-08-11T08:00:00-04:00",
      assignmentRule: { reviewsPerSubmission: 1, maxAssignmentsPerReviewer: 1 },
      rounds: [
        {
          ...round,
          opensAt: "2026-08-10T10:00:00+02:00",
          closesAt: "2026-08-10T08:30:00Z",
        },
      ],
    });

    expect(created.closesAt).toBe("2026-08-11T12:00:00.000Z");
    expect(created.rounds[0]?.opensAt).toBe("2026-08-10T08:00:00.000Z");
    expect(created.rounds[0]?.closesAt).toBe("2026-08-10T08:30:00.000Z");

    await expect(
      service.createPlan(organizer, {
        id: "offset-bypass-plan",
        eventId,
        name: "Late offset review",
        blindReview: true,
        closesAt: "2026-08-11T08:30:00-04:00",
        assignmentRule: { reviewsPerSubmission: 1, maxAssignmentsPerReviewer: 1 },
        rounds: [round],
      }),
    ).rejects.toMatchObject({ code: "EVALUATION_INVALID_INPUT" });
  });

  it("rejects new review boundaries before today or after event end", async () => {
    const repository = new InMemoryEvaluationRepository();
    const service = new EvaluationService(
      repository,
      new InMemorySubmissionReviewSource(),
      evaluationEventSource({ endsAt: "2026-08-11T23:59:00.000Z" }),
      { clock: () => new Date(nowIso) },
    );

    await expect(
      service.createPlan(organizer, {
        id: "past-plan",
        eventId,
        name: "Past review",
        blindReview: true,
        closesAt: "2026-08-10T12:00:00.000Z",
        assignmentRule: { reviewsPerSubmission: 1, maxAssignmentsPerReviewer: 1 },
        rounds: [{ ...round, closesAt: "2026-08-07T12:00:00.000Z" }],
      }),
    ).rejects.toMatchObject({ code: "EVALUATION_INVALID_INPUT" });

    await expect(
      service.createPlan(organizer, {
        id: "late-plan",
        eventId,
        name: "Late review",
        blindReview: true,
        closesAt: "2026-08-12T12:00:00.000Z",
        assignmentRule: { reviewsPerSubmission: 1, maxAssignmentsPerReviewer: 1 },
        rounds: [{ ...round, closesAt: "2026-08-12T12:00:00.000Z" }],
      }),
    ).rejects.toMatchObject({ code: "EVALUATION_INVALID_INPUT" });
  });

  it("requires the overall deadline to cover the final round", async () => {
    const service = new EvaluationService(
      new InMemoryEvaluationRepository(),
      new InMemorySubmissionReviewSource(),
      evaluationEventSource(),
      { clock: () => new Date(nowIso) },
    );

    await expect(
      service.createPlan(organizer, {
        id: "short-plan",
        eventId,
        name: "Short plan",
        blindReview: true,
        closesAt: "2026-08-09T12:00:00.000Z",
        assignmentRule: { reviewsPerSubmission: 1, maxAssignmentsPerReviewer: 1 },
        rounds: [round],
      }),
    ).rejects.toMatchObject({ code: "EVALUATION_INVALID_INPUT" });
  });

  it("preserves unchanged historical boundaries but rejects changed past values", async () => {
    let currentTime = new Date(nowIso);
    const service = new EvaluationService(
      new InMemoryEvaluationRepository(),
      new InMemorySubmissionReviewSource(),
      evaluationEventSource(),
      { clock: () => new Date(currentTime) },
    );
    const created = await service.createPlan(organizer, {
      id: "active-plan",
      eventId,
      name: "Active review",
      blindReview: true,
      closesAt: "2026-08-10T12:00:00.000Z",
      assignmentRule: { reviewsPerSubmission: 1, maxAssignmentsPerReviewer: 1 },
      rounds: [round],
    });
    currentTime = new Date("2026-08-12T12:00:00.000Z");

    const unchanged = await service.updatePlan(organizer, created.id, {
      expectedVersion: created.version,
      name: created.name,
      blindReview: created.blindReview,
      closesAt: created.closesAt,
      assignmentRule: created.assignmentRule,
      rounds: created.rounds,
    });
    const unchangedRound = unchanged.rounds[0];
    if (unchangedRound === undefined) throw new Error("Expected the review round to exist.");
    await expect(
      service.updatePlan(organizer, unchanged.id, {
        expectedVersion: unchanged.version,
        name: unchanged.name,
        blindReview: unchanged.blindReview,
        closesAt: unchanged.closesAt,
        assignmentRule: unchanged.assignmentRule,
        rounds: [
          {
            ...unchangedRound,
            closesAt: "2026-08-11T12:00:00.000Z",
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "EVALUATION_INVALID_INPUT" });
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
  it("keys aggregates by round and rubric revision snapshots", async () => {
    const { service, repository, plan } = await fixture({ reviewsPerSubmission: 1 });
    const assignment = await assignOne(service);
    const draft = await service.saveReview(reviewer("reviewer-1"), assignment.id, {
      scores: [
        { criterionId: "quality", value: 4, origin: "human" },
        { criterionId: "relevance", value: 8, origin: "human" },
      ],
    });
    await service.submitReview(reviewer("reviewer-1"), assignment.id, draft.version);

    const aggregate = await service.getAggregate(organizer, plan.id, round.id, submission.id);
    expect(aggregate).toMatchObject({
      roundRevision: expect.any(Number),
      rubricRevision: expect.any(Number),
      submittedReviewCount: 1,
    });

    const currentReview = await repository.getReview(tenantId, assignment.id);
    if (currentReview === null) throw new Error("Expected submitted review fixture.");
    await repository.putReview(
      {
        ...currentReview,
        roundRevision: aggregate.roundRevision + 1,
        rubricRevision: aggregate.rubricRevision + 1,
      },
      currentReview.version,
    );
    await expect(
      service.getAggregate(organizer, plan.id, round.id, submission.id),
    ).resolves.toMatchObject({
      roundRevision: aggregate.roundRevision,
      rubricRevision: aggregate.rubricRevision,
      submittedReviewCount: 0,
      averageWeightedTotal: null,
    });
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
    await expect(service.listReviewerAssignments(actor, "plan-1")).resolves.toMatchObject([
      { status: "submitted" },
    ]);
    await expect(service.listOrganizerAssignments(organizer, "plan-1")).resolves.toMatchObject([
      { status: "submitted" },
    ]);
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
    await repository.putAssignmentsForTesting([
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
      humanConfirmedBy: null,
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
  it("runs acceptance onboarding alongside the durable decision projection", async () => {
    const started = new Set<string>();
    let markBothStarted: (() => void) | undefined;
    const bothStarted = new Promise<void>((resolve) => {
      markBothStarted = resolve;
    });
    let releaseWork: (() => void) | undefined;
    const workReleased = new Promise<void>((resolve) => {
      releaseWork = resolve;
    });
    const markStarted = (name: string) => {
      started.add(name);
      if (started.size === 2) markBothStarted?.();
    };
    const { service } = await fixture({
      decisionProjection: {
        projectDecision: async () => {
          markStarted("projection");
          await workReleased;
        },
      },
      acceptanceHandoff: {
        accept: async () => {
          markStarted("acceptance");
          await workReleased;
        },
      },
    });

    const pending = service.recordDecision(organizer, {
      planId: "plan-1",
      submissionId: submission.id,
      status: "accepted",
      reason: "Committee consensus",
      idempotencyKey: "decision-concurrent-effects",
    });
    const concurrent = await Promise.race([
      bothStarted.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 100)),
    ]);
    releaseWork?.();

    await expect(pending).resolves.toMatchObject({ status: "accepted" });
    expect(concurrent).toBe(true);
  });
  it("returns after durable projection while scheduled acceptance onboarding continues", async () => {
    let markAcceptanceStarted: (() => void) | undefined;
    const acceptanceStarted = new Promise<void>((resolve) => {
      markAcceptanceStarted = resolve;
    });
    let releaseAcceptance: (() => void) | undefined;
    const acceptanceReleased = new Promise<void>((resolve) => {
      releaseAcceptance = resolve;
    });
    const scheduled: Promise<void>[] = [];
    const { service } = await fixture({
      decisionProjection: {
        projectDecision: async () => undefined,
      },
      acceptanceHandoff: {
        accept: async () => {
          markAcceptanceStarted?.();
          await acceptanceReleased;
        },
      },
    });

    const decision = await service.recordDecision(
      organizer,
      {
        planId: "plan-1",
        submissionId: submission.id,
        status: "accepted",
        reason: "Committee consensus",
        idempotencyKey: "decision-scheduled-acceptance",
      },
      (operation) => {
        scheduled.push(operation);
        return true;
      },
    );

    expect(decision.status).toBe("accepted");
    await acceptanceStarted;
    expect(scheduled).toHaveLength(1);
    releaseAcceptance?.();
    await scheduled[0];
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
    const service = new EvaluationService(
      repository,
      source,
      {
        ...evaluationEventSource(),
      },
      {
        clock: () => new Date(nowIso),
      },
    );
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
    const rescheduled = await service.updatePlanSchedule(organizer, opened.id, {
      expectedVersion: opened.version,
      closesAt: "2026-08-13T12:00:00.000Z",
    });
    expect(rescheduled).toMatchObject({
      closesAt: "2026-08-13T12:00:00.000Z",
      version: opened.version + 1,
      gradingLockedAt: opened.gradingLockedAt,
      gradingRevision: opened.gradingRevision,
      rounds: opened.rounds,
    });
    await expectEvaluationError(
      service.updatePlan(organizer, edited.id, {
        expectedVersion: rescheduled.version,
        name: "Must remain locked",
      }),
      "EVALUATION_CONFLICT",
    );
    const assignments = await service.assignReviewers(organizer, {
      planId: rescheduled.id,
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
      "EVALUATION_ADVISORY_UNAVAILABLE",
    );
  });
  it("reopens a closed plan with the current version and preserves its grading lock", async () => {
    const { service, plan } = await fixture({ reviewsPerSubmission: 1 });
    const closedPlan = await service.closePlan(organizer, plan.id, plan.version);

    await expectEvaluationError(
      service.assignReviewers(organizer, {
        planId: plan.id,
        roundId: round.id,
        submissionId: submission.id,
        reviewerIds: ["reviewer-1"],
        expectedVersion: closedPlan.version,
      }),
      "EVALUATION_CLOSED",
    );

    const reopened = await service.openPlan(organizer, closedPlan.id, closedPlan.version);
    expect(reopened.status).toBe("open");
    expect(reopened.version).toBe(closedPlan.version + 1);
    expect(reopened.gradingLockedAt).toBe(plan.gradingLockedAt);

    await expectEvaluationError(
      service.openPlan(organizer, closedPlan.id, closedPlan.version),
      "EVALUATION_CONFLICT",
    );
    await expectEvaluationError(
      service.updatePlan(organizer, reopened.id, {
        expectedVersion: reopened.version,
        name: "Grading remains locked",
      }),
      "EVALUATION_CONFLICT",
    );

    await expect(
      service.assignReviewers(organizer, {
        planId: reopened.id,
        roundId: round.id,
        submissionId: submission.id,
        reviewerIds: ["reviewer-1"],
        expectedVersion: reopened.version,
      }),
    ).resolves.toHaveLength(1);
  });

  it("clones a grading-locked plan to a new editable draft without changing historical review state", async () => {
    const { service, repository, plan } = await fixture({ reviewsPerSubmission: 1 });
    const assignment = await assignOne(service);
    const draftReview = await service.saveReview(reviewer("reviewer-1"), assignment.id, {
      scores: [
        { criterionId: "quality", value: 4, origin: "human" },
        { criterionId: "relevance", value: 8, origin: "human" },
      ],
      comment: "Historical review",
    });
    const closedPlan = await service.closePlan(organizer, plan.id, plan.version);
    const reopened = await service.openPlan(organizer, closedPlan.id, closedPlan.version);

    const revision = await service.revisePlanToDraft(organizer, reopened.id, {
      expectedVersion: reopened.version,
    });

    expect(revision).toMatchObject({
      id: `${reopened.id}-revision-${reopened.version}`,
      eventId: reopened.eventId,
      status: "draft",
      version: 1,
      gradingLockedAt: null,
      name: `${reopened.name} revision`,
    });
    expect(revision.gradingRevision).toBeUndefined();
    expect(revision.rounds).toEqual(
      reopened.rounds.map(
        ({ revision: _roundRevision, rubricRevision: _rubricRevision, ...round }) => ({
          ...round,
          id: `${round.id}-revision-${reopened.version}`,
        }),
      ),
    );

    const edited = await service.updatePlan(organizer, revision.id, {
      expectedVersion: revision.version,
      name: "Editable grading revision",
    });
    expect(edited).toMatchObject({
      status: "draft",
      version: 2,
      name: "Editable grading revision",
    });

    expect(await repository.getPlan(tenantId, reopened.id)).toEqual(reopened);
    expect(await repository.getAssignment(tenantId, assignment.id)).toEqual({
      ...assignment,
      status: "in_progress",
      version: assignment.version + 1,
      updatedAt: nowIso,
    });
    expect(await repository.getReview(tenantId, assignment.id)).toEqual(draftReview);
    expect(await repository.listAssignments(tenantId, revision.id)).toEqual([]);
    expect(await repository.listReviews(tenantId, revision.id)).toEqual([]);
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
    const service = new EvaluationService(
      repository,
      source,
      {
        ...evaluationEventSource(),
      },
      {
        clock: () => new Date(nowIso),
        aiSuggestionProvider: provider,
      },
    );
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
      origin: "ai",
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
      origin: "ai",
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
    const service = new EvaluationService(
      repository,
      source,
      {
        ...evaluationEventSource(),
      },
      {
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
      },
    );
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
