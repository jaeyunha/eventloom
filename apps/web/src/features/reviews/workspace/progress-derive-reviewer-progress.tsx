"use client";

import type { ApiAssignment } from "./api-api-assignment";
import { normalizeCompletionPercent } from "./model-normalize-completion-percent";
import type { ReviewerProgressSummary } from "./progress-reviewer-progress-summary";

export function deriveReviewerProgress(
  assignments: readonly ApiAssignment[],
): readonly ReviewerProgressSummary[] {
  const grouped = new Map<string, ReviewerProgressSummary>();
  for (const assignment of assignments) {
    const key = `${assignment.reviewerId}\u0000${assignment.roundId}`;
    const current = grouped.get(key) ?? {
      reviewerId: assignment.reviewerId,
      roundId: assignment.roundId,
      assigned: 0,
      inProgress: 0,
      submitted: 0,
      abstained: 0,
      outstanding: 0,
      completionPercent: 0,
    };
    if (assignment.status === "abstained") current.abstained += 1;
    else if (assignment.status !== "superseded") {
      current.assigned += 1;
      if (assignment.status === "in_progress") current.inProgress += 1;
      if (assignment.status === "submitted") current.submitted += 1;
    }
    current.outstanding = Math.max(0, current.assigned - current.submitted);
    current.completionPercent = normalizeCompletionPercent(
      current.assigned === 0 ? 0 : (current.submitted / current.assigned) * 100,
    );
    grouped.set(key, current);
  }
  return [...grouped.values()].sort(
    (left, right) =>
      left.reviewerId.localeCompare(right.reviewerId) || left.roundId.localeCompare(right.roundId),
  );
}
