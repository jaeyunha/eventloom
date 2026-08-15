import type { DecisionStatus } from "./organizer-decision-status";

export function formatDecisionStatus(status: DecisionStatus): string {
  if (status === "accepted") return "Accepted";
  if (status === "waitlisted") return "Waitlisted";
  return "Rejected";
}
