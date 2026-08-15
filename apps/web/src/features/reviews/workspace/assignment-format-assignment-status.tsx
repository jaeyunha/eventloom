import type { EvaluatorAssignment } from "./assignment-evaluator-assignment";

export function formatAssignmentStatus(status: EvaluatorAssignment["assignmentStatus"]): string {
  if (status === "submitted") return "Submitted";
  if (status === "in_progress") return "In progress";
  if (status === "abstained") return "Recused";
  if (status === "superseded") return "Superseded";
  return "Needs review";
}
