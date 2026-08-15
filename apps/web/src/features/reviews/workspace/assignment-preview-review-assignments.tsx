"use client";

import type { Fetcher } from "./api-fetcher";
import type { DistributionPreview } from "./assignment-distribution-preview";
import type { DistributionPreviewInput } from "./assignment-distribution-preview-input";
import { evaluationRequest } from "./model-evaluation-request";

export async function previewReviewAssignments(
  baseUrl: string,
  planId: string,
  input: DistributionPreviewInput,
  fetcher: Fetcher = fetch,
): Promise<DistributionPreview> {
  return evaluationRequest<DistributionPreview>(
    baseUrl,
    `/plans/${encodeURIComponent(planId)}/distribution/preview`,
    {
      method: "POST",
      body: JSON.stringify({
        roundId: input.roundId,
        submissionIds: input.submissionIds,
        ...(input.reviewerIds === undefined ? {} : { reviewerIds: input.reviewerIds }),
        expectedVersion: input.expectedVersion,
      }),
    },
    fetcher,
  );
}
