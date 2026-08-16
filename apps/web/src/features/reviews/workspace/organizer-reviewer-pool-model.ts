import type { SetReviewerPoolInput } from "../../members/api";

export type ReviewerPoolDraft = Readonly<Record<string, number>>;

export function buildReviewerPoolInput(
  draft: ReviewerPoolDraft,
  expectedVersion?: number,
): SetReviewerPoolInput {
  const reviewers = Object.entries(draft)
    .map(([reviewerId, maxAssignments]) => ({ reviewerId, maxAssignments }))
    .sort((left, right) => left.reviewerId.localeCompare(right.reviewerId));
  return {
    reviewers,
    ...(expectedVersion === undefined ? {} : { expectedVersion }),
  };
}
