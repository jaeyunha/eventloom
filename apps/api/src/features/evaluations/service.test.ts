import { describe, expect, it } from "vitest";
import type { EvaluationError } from "./errors";
import { InMemoryEvaluationRepository, InMemorySubmissionReviewSource } from "./repository";
import { EvaluationService } from "./service";
import type { EvaluationActor, ReviewRound, SubmissionReviewMaterial } from "./types";

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

async function fixture(options: { blindReview?: boolean; reviewsPerSubmission?: number } = {}) {
  let currentTime = new Date(nowIso);
  const repository = new InMemoryEvaluationRepository();
  const submissions = new InMemorySubmissionReviewSource([
    submission,
    { ...submission, id: "submission-2", title: "Another session" },
  ]);
  const service = new EvaluationService(repository, submissions, {
    clock: () => new Date(currentTime),
  });
  const draft = await service.createPlan(organizer, {
    id: "plan-1",
    eventId,
    name: "Main review",
    blindReview: options.blindReview ?? true,
    closesAt: "2026-08-12T12:00:00.000Z",
    assignmentRule: {
      reviewsPerSubmission: options.reviewsPerSubmission ?? 2,
      maxAssignmentsPerReviewer: 1,
    },
    rounds: [round],
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
    const { service } = await fixture({ blindReview: true });
    const assignment = await assignOne(service);

    const context = await service.getReviewContext(reviewer("reviewer-1"), assignment.id);

    expect(context.submission).toEqual({
      id: submission.id,
      title: submission.title,
      abstract: submission.abstract,
      answers: { experience: "Advanced" },
      participants: [],
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
    expect(context.submission.answers).toHaveProperty("speakerEmail");
  });
});

describe("review drafts, AI assistance, and aggregates", () => {
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
    expect(await service.getProgress(organizer, "plan-1")).toEqual({
      planId: "plan-1",
      total: 1,
      assigned: 0,
      inProgress: 0,
      submitted: 0,
      abstained: 1,
      completionPercent: 0,
    });
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
      status: "rejected",
      reason: "This replay must not alter the outcome",
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
