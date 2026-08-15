"use client";

import type { ReviewerQueueProps } from "./evaluator-queue-controller";
import { useReviewerQueueController } from "./evaluator-queue-controller";
import { ReviewerQueueView } from "./evaluator-queue-view";

export function ReviewerQueueWorkspace(props: Readonly<ReviewerQueueProps>) {
  return <ReviewerQueueView controller={useReviewerQueueController(props)} />;
}
