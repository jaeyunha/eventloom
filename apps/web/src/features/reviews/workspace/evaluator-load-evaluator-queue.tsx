"use client";

import { mapEvaluatorAssignment } from "./assignment-map-evaluator-assignment";
import type { ReviewerQueueEntry } from "./evaluator-queue-reviewer-queue-entry";
import { loadReviewerWorkspace } from "./workspace-load-reviewer-workspace";

export async function loadEvaluatorQueue(
  eventId: string | undefined,
  baseUrl: string,
): Promise<readonly ReviewerQueueEntry[]> {
  const entries = await loadReviewerWorkspace(eventId, baseUrl);
  return entries
    .map((entry) => ({
      assignment: mapEvaluatorAssignment(entry.plan, entry),
    }))
    .sort(
      (left, right) =>
        left.assignment.eventId.localeCompare(right.assignment.eventId) ||
        left.assignment.planName.localeCompare(right.assignment.planName) ||
        left.assignment.round.name.localeCompare(right.assignment.round.name) ||
        left.assignment.title.localeCompare(right.assignment.title) ||
        left.assignment.id.localeCompare(right.assignment.id),
    );
}
