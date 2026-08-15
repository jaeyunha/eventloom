import type { AssignmentReviewStatus } from "./assignment-assignment-review-status";
import type { EvaluatorAssignment } from "./assignment-evaluator-assignment";

export function assignmentReviewStatus(
  status: EvaluatorAssignment["assignmentStatus"],
): AssignmentReviewStatus {
  if (status === "submitted") return "submitted";
  if (status === "in_progress") return "in-progress";
  if (status === "abstained") return "recused";
  if (status === "superseded") return "superseded";
  return "needs-review";
}
