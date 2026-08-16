import type { ReviewPlanAssignment } from "./assignment-review-plan-assignment";

export function reviewerIdsForAssignmentTarget(
  assignments: readonly ReviewPlanAssignment[],
  roundId: string,
  submissionId: string,
  excludedReviewerId?: string,
): readonly string[] {
  return [
    ...new Set(
      assignments
        .filter(
          (assignment) =>
            assignment.roundId === roundId &&
            assignment.submissionId === submissionId &&
            assignment.status !== "abstained" &&
            assignment.status !== "superseded" &&
            assignment.reviewerId !== excludedReviewerId,
        )
        .map((assignment) => assignment.reviewerId),
    ),
  ].sort((left, right) => left.localeCompare(right));
}
