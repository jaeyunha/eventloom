import type { PlanStatus } from "./organizer-plan-status";

export function formatPlanStatus(status: PlanStatus): string {
  if (status === "open") return "Open for review";
  if (status === "draft") return "Draft";
  return "Closed";
}
