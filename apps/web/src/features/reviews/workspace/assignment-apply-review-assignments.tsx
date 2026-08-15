"use client";

import type { Fetcher } from "./api-fetcher";
import type { DistributionApplyResult } from "./assignment-distribution-apply-result";
import type { DistributionPreviewInput } from "./assignment-distribution-preview-input";
import { evaluationRequest } from "./model-evaluation-request";

export async function applyReviewAssignments(
  baseUrl: string,
  planId: string,
  input: DistributionPreviewInput & { readonly fingerprint: string },
  fetcher: Fetcher = fetch,
): Promise<DistributionApplyResult> {
  return evaluationRequest<DistributionApplyResult>(
    baseUrl,
    `/plans/${encodeURIComponent(planId)}/distribution/apply`,
    {
      method: "POST",
      body: JSON.stringify({
        roundId: input.roundId,
        submissionIds: input.submissionIds,
        ...(input.reviewerIds === undefined ? {} : { reviewerIds: input.reviewerIds }),
        expectedVersion: input.expectedVersion,
        fingerprint: input.fingerprint,
      }),
    },
    fetcher,
  );
}
