import type { ApiPlan } from "./api-api-plan";
import { mapPlan } from "./organizer-map-plan";
import type { ReviewPlanSeed } from "./organizer-review-plan-seed";

export function seedFromCreatedPlan(plan: ApiPlan, eventId: string): ReviewPlanSeed {
  return mapPlan(
    plan,
    eventId,
    [],
    {
      total: 0,
      assigned: 0,
      inProgress: 0,
      submitted: 0,
      abstained: 0,
      completionPercent: 0,
      reviewers: [],
    },
    {},
  );
}
