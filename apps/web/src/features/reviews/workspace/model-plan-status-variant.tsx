import type { PlanStatus } from "./organizer-plan-status";

export function planStatusVariant(status: PlanStatus): "default" | "secondary" | "outline" {
  if (status === "open") return "default";
  if (status === "draft") return "outline";
  return "secondary";
}
