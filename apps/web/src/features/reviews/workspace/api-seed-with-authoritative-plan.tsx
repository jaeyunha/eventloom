import type { ApiPlan } from "./api-api-plan";
import { mapPlan } from "./organizer-map-plan";
import type { ReviewPlanSeed } from "./organizer-review-plan-seed";

export function seedWithAuthoritativePlan(seed: ReviewPlanSeed, plan: ApiPlan): ReviewPlanSeed {
  const decisions = Object.fromEntries(
    Object.entries(seed.decisionBySubmission).map(([submissionId, decision]) => [
      submissionId,
      {
        status: decision.status,
        version: decision.version,
        history: [{ reason: decision.reason }],
      },
    ]),
  );
  const mapped = mapPlan(
    plan,
    seed.eventId,
    seed.aggregates,
    {
      total: seed.progress.totalAssignments,
      assigned: seed.progress.assigned,
      inProgress: seed.progress.inProgress,
      submitted: seed.progress.submitted,
      abstained: seed.progress.abstained,
      completionPercent: seed.progress.completionPercent,
      reviewers: seed.progress.reviewers,
    },
    decisions,
    seed.assignments,
  );
  return {
    ...mapped,
    eventName: seed.eventName,
    eventTimeZone: seed.eventTimeZone,
    eventStartsAt: seed.eventStartsAt,
    eventEndsAt: seed.eventEndsAt,
    progress: { ...mapped.progress, conflicts: seed.progress.conflicts },
  };
}
