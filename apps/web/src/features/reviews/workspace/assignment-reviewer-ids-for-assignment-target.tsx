import type { ReviewPlanAssignment } from "./assignment-review-plan-assignment";

export function reviewerIdsForAssignmentTarget(
  assignments: readonly ReviewPlanAssignment[],
  roundId: string,
  submissionId: string,
  excludedReviewerId?: string,
): readonly string[] {
  const reviewerIds = new Set<string>();
  for (const assignment of assignments) {
    if (
      assignment.roundId !== roundId ||
      assignment.submissionId !== submissionId ||
      assignment.status === "abstained" ||
      assignment.status === "superseded" ||
      assignment.reviewerId === excludedReviewerId
    ) {
      continue;
    }
    reviewerIds.add(assignment.reviewerId);
  }
  return [...reviewerIds].sort((left, right) => left.localeCompare(right));
}
