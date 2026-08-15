"use client";

import type { ApiReviewerWorkspaceAssignment } from "./api-api-reviewer-workspace-assignment";
import type { ApiReviewerWorkspaceResponse } from "./api-api-reviewer-workspace-response";
import { EvaluationRequestError } from "./api-evaluation-request-error";
import { evaluationRequest } from "./model-evaluation-request";

export async function loadReviewerWorkspace(
  eventId: string | undefined,
  baseUrl: string,
): Promise<readonly ApiReviewerWorkspaceAssignment[]> {
  const path =
    eventId === undefined
      ? "/reviewer/workspace"
      : `/reviewer/workspace?eventId=${encodeURIComponent(eventId)}`;
  try {
    const result = await evaluationRequest<ApiReviewerWorkspaceResponse>(baseUrl, path);
    return result.assignments
      .filter(
        (entry) =>
          entry.assignment.status !== "abstained" && entry.assignment.status !== "superseded",
      )
      .map((entry) => ({
        ...entry,
        plan: {
          ...entry.plan,
          ...((entry.plan.status as string) === "active" ? { status: "open" as const } : {}),
        },
      }));
  } catch (reason: unknown) {
    if (
      reason instanceof EvaluationRequestError &&
      (reason.status === 401 || reason.status === 403)
    ) {
      throw new Error("Reviewer access is required to open this workspace.");
    }
    throw reason;
  }
}
