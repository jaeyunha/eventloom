"use client";

import type { ReviewerProgressProps } from "./progress-reviewer-progress-controller";
import { useReviewerProgressController } from "./progress-reviewer-progress-controller";
import { ReviewerProgressView } from "./progress-reviewer-progress-view";

export function ReviewerProgressDashboard(props: Readonly<ReviewerProgressProps>) {
  return <ReviewerProgressView controller={useReviewerProgressController(props)} />;
}
