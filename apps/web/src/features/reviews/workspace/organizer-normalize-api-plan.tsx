import type { ApiPlan } from "./api-api-plan";

export function normalizeApiPlan(plan: ApiPlan): ApiPlan {
  return {
    ...plan,
    ...(Array.isArray(plan.rounds) ? {} : { rounds: [] }),
    ...((plan.status as string) === "active" ? { status: "open" } : {}),
  };
}
