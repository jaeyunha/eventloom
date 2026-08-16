import type { ApiPlan } from "./api-api-plan";

export function effectiveReviewClosesAt(plan: ApiPlan): string | null {
  if (plan.closesAt !== null) return plan.closesAt;
  return (
    plan.rounds
      .map((round) => round.closesAt)
      .filter((value): value is string => value !== null)
      .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null
  );
}
