"use client";

import type { StatusTone } from "@/components/workspace";
import { StatusBadge } from "@/components/workspace";
import type { EvaluatorAssignment } from "./assignment-evaluator-assignment";
import { formatAssignmentStatus } from "./assignment-format-assignment-status";
import { assignmentReviewStatus } from "./model-assignment-review-status";

export function EvaluatorAssignmentStatusBadge({
  status,
}: Readonly<{ status: EvaluatorAssignment["assignmentStatus"] }>) {
  const normalized = assignmentReviewStatus(status);
  const tone: StatusTone =
    normalized === "submitted"
      ? "success"
      : normalized === "in-progress"
        ? "info"
        : normalized === "recused" || normalized === "superseded"
          ? "danger"
          : "warning";
  return (
    <StatusBadge tone={tone} data-assignment-status={normalized}>
      {formatAssignmentStatus(status)}
    </StatusBadge>
  );
}
