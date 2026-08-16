import type { OrganizerReviewRow } from "./organizer-review-overview-types";

export function reviewStatus(row: OrganizerReviewRow) {
  if (row.expectedReviewCount > 0 && row.completedReviewCount >= row.expectedReviewCount)
    return "complete";
  return row.completedReviewCount > 0 ? "in-progress" : "not-started";
}
