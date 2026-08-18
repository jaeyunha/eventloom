export type AssignmentReviewerSelectionMode = "automatic" | "explicit";

export function assignmentDistributionReviewerIds(
  mode: AssignmentReviewerSelectionMode,
  reviewerIds: readonly string[],
): readonly string[] | undefined {
  return mode === "automatic" ? undefined : reviewerIds;
}

export function assignmentReviewerSelectionError(
  mode: AssignmentReviewerSelectionMode,
  reviewerIds: readonly string[],
): string | null {
  return mode === "explicit" && reviewerIds.length === 0
    ? "Select at least one reviewer or use automatic distribution."
    : null;
}
