"use client";

import type { ReviewerAssignmentListProps } from "./assignment-reviewer-assignment-controller";
import { useReviewerAssignmentController } from "./assignment-reviewer-assignment-controller";
import { ReviewerAssignmentView } from "./assignment-reviewer-assignment-view";

export function ReviewerAssignmentList(props: Readonly<ReviewerAssignmentListProps>) {
  return <ReviewerAssignmentView controller={useReviewerAssignmentController(props)} />;
}
