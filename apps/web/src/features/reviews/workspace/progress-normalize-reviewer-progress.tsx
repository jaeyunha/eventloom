import { normalizeCompletionPercent } from "./model-normalize-completion-percent";
import type { ReviewerProgressSummary } from "./progress-reviewer-progress-summary";

export function normalizeReviewerProgress(
  reviewer: ReviewerProgressSummary,
): ReviewerProgressSummary {
  return {
    ...reviewer,
    completionPercent: normalizeCompletionPercent(reviewer.completionPercent),
  };
}
