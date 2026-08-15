"use client";

import type { Fetcher } from "./api-fetcher";
import type { AssignmentReplacementResult } from "./assignment-assignment-replacement-result";
import type { ReplaceAssignmentInput } from "./assignment-replace-assignment-input";
import { evaluationRequest } from "./model-evaluation-request";

export async function replaceSingleReviewAssignment(
  baseUrl: string,
  planId: string,
  assignmentId: string,
  input: ReplaceAssignmentInput,
  fetcher: Fetcher = fetch,
): Promise<AssignmentReplacementResult> {
  return evaluationRequest<AssignmentReplacementResult>(
    baseUrl,
    `/plans/${encodeURIComponent(planId)}/assignments/${encodeURIComponent(assignmentId)}/replace`,
    {
      method: "POST",
      body: JSON.stringify({
        replacementReviewerId: input.replacementReviewerId,
        expectedVersion: input.expectedVersion,
        reason: input.reason,
      }),
    },
    fetcher,
  );
}
