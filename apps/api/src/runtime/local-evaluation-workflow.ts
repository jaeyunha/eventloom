import type { InMemorySubmissionReviewSource } from "../features/evaluations/repository";
import type { EvaluationService } from "../features/evaluations/service";
import type {
  EvaluationActor,
  EvaluationAssignment,
  EvaluationPlan,
  SubmissionReviewMaterial,
} from "../features/evaluations/types";
import { LOCAL_REVIEW_SCENARIO_REVIEWERS } from "./local-review-scenario";

function organizerActor(plan: EvaluationPlan): EvaluationActor {
  return {
    tenantId: plan.tenantId,
    userId: "local-organizer",
    kind: "human",
    grants: [{ eventId: plan.eventId, role: "organizer" }],
  };
}

function reviewerActor(plan: EvaluationPlan, reviewerId: string): EvaluationActor {
  return {
    tenantId: plan.tenantId,
    userId: reviewerId,
    kind: "human",
    grants: [{ eventId: plan.eventId, role: "reviewer" }],
  };
}

function targetStatus(index: number, slot: number): EvaluationAssignment["status"] {
  if (index < 180) return "submitted";
  if (index < 220) return slot === 0 ? "submitted" : "in_progress";
  if (index < 240) return slot === 0 ? "submitted" : "abstained";
  if (index < 270) return slot === 0 ? "in_progress" : "assigned";
  return "assigned";
}

async function advanceAssignment(
  service: EvaluationService,
  plan: EvaluationPlan,
  assignment: EvaluationAssignment,
  submissionIndex: number,
  slot: number,
): Promise<void> {
  const status = targetStatus(submissionIndex, slot);
  if (status === "assigned") return;
  const actor = reviewerActor(plan, assignment.reviewerId);
  if (status === "abstained") {
    await service.declareConflict(
      actor,
      assignment.id,
      submissionIndex % 2 === 0 ? "Prior collaboration with the speaker." : "Same reporting line.",
    );
    return;
  }
  const quality = 2 + ((submissionIndex + slot) % 4);
  const recommendation = quality >= 4 ? "accept" : quality === 3 ? "maybe" : "reject";
  const review = await service.saveReview(actor, assignment.id, {
    scores: [
      { criterionId: "quality", value: quality, origin: "human" },
      { criterionId: "recommendation", value: recommendation, origin: "human" },
    ],
    comment:
      status === "submitted"
        ? "Clear audience value with concrete takeaways and a credible delivery plan."
        : "Draft notes saved; reviewer still needs to confirm the final recommendation.",
  });
  if (status === "submitted") {
    await service.submitReview(actor, assignment.id, review.version);
  }
}

async function seedAssignmentsAndReviews(
  service: EvaluationService,
  plan: EvaluationPlan,
  submissions: readonly SubmissionReviewMaterial[],
): Promise<void> {
  const round = plan.rounds[0];
  if (round === undefined) throw new Error("Local evaluation workflow requires one review round.");
  const reviewers = LOCAL_REVIEW_SCENARIO_REVIEWERS.map(({ id }) => id);
  for (const [index, submission] of submissions.entries()) {
    const primaryReviewerId = reviewers[index % reviewers.length];
    const secondaryReviewerId = reviewers[(index + 11) % reviewers.length];
    if (primaryReviewerId === undefined || secondaryReviewerId === undefined) {
      throw new Error("Local evaluation workflow reviewer is missing.");
    }
    const reviewerIds = [primaryReviewerId, secondaryReviewerId];
    const assignments = await service.assignReviewers(organizerActor(plan), {
      planId: plan.id,
      roundId: round.id,
      submissionId: submission.id,
      reviewerIds,
    });
    for (const [slot, assignment] of assignments.entries()) {
      await advanceAssignment(service, plan, assignment, index, slot);
    }
  }
}

async function seedDecisions(
  service: EvaluationService,
  plan: EvaluationPlan,
  submissions: readonly SubmissionReviewMaterial[],
): Promise<void> {
  const actor = organizerActor(plan);
  for (const [index, submission] of submissions.slice(0, 150).entries()) {
    const status = index % 10 < 5 ? "accepted" : index % 10 < 7 ? "waitlisted" : "rejected";
    await service.recordDecision(actor, {
      planId: plan.id,
      submissionId: submission.id,
      status,
      reason: "Seeded committee outcome for production-scale workflow QA.",
      idempotencyKey: `local-decision-${index + 1}`,
    });
  }
}

export async function seedLocalEvaluationWorkflow(
  service: EvaluationService,
  source: InMemorySubmissionReviewSource,
  planTemplate: EvaluationPlan,
  submissions: readonly SubmissionReviewMaterial[],
): Promise<void> {
  for (const submission of submissions) source.set(submission);
  const actor = organizerActor(planTemplate);
  const draft = await service.createPlan(actor, {
    id: planTemplate.id,
    eventId: planTemplate.eventId,
    name: planTemplate.name,
    blindReview: planTemplate.blindReview,
    closesAt: planTemplate.closesAt,
    assignmentRule: planTemplate.assignmentRule,
    rounds: planTemplate.rounds,
    reviewerProjection: planTemplate.reviewerProjection,
  });
  const openPlan = await service.openPlan(actor, draft.id, draft.version);
  await seedAssignmentsAndReviews(service, openPlan, submissions);
  await seedDecisions(service, openPlan, submissions);
}
