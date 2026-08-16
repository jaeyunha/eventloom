"use client";

import { Badge } from "../../../components/ui/badge";
import styles from ".././review-workspace.module.css";
import type { EvaluatorAssignment } from "./assignment-evaluator-assignment";
import { formatAssignmentStatus } from "./assignment-format-assignment-status";
import { assignmentReviewStatus } from "./model-assignment-review-status";

export function AssignmentStatusBadge({
  status,
}: Readonly<{ status: EvaluatorAssignment["assignmentStatus"] }>) {
  const normalized = assignmentReviewStatus(status);
  const className =
    normalized === "submitted"
      ? styles.statusSubmitted
      : normalized === "in-progress"
        ? styles.statusInProgress
        : normalized === "recused" || normalized === "superseded"
          ? styles.statusRecused
          : styles.statusNeedsReview;
  return (
    <Badge variant="outline" className={className} data-assignment-status={normalized}>
      {formatAssignmentStatus(status)}
    </Badge>
  );
}
