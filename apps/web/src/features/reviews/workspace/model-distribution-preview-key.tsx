import type { DistributionPreviewInput } from "./assignment-distribution-preview-input";

export function distributionPreviewKey(input: DistributionPreviewInput): string {
  return JSON.stringify({
    roundId: input.roundId,
    submissionIds: [...input.submissionIds],
    ...(input.reviewerIds === undefined ? {} : { reviewerIds: [...input.reviewerIds] }),
    expectedVersion: input.expectedVersion,
  });
}
