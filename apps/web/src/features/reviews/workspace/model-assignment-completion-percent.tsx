import type { ReviewPlanAssignment } from "./assignment-review-plan-assignment";
import { normalizeCompletionPercent } from "./model-normalize-completion-percent";

export function assignmentCompletionPercent(
  assignments: readonly ReviewPlanAssignment[],
  roundId?: string,
): number {
  const relevantAssignments =
    roundId === undefined
      ? assignments
      : assignments.filter((assignment) => assignment.roundId === roundId);
  const activeAssignments = relevantAssignments.filter(
    (assignment) => assignment.status !== "abstained" && assignment.status !== "superseded",
  );
  const submitted = activeAssignments.filter(
    (assignment) => assignment.status === "submitted",
  ).length;
  return normalizeCompletionPercent(
    activeAssignments.length === 0 ? 0 : (submitted / activeAssignments.length) * 100,
  );
}
