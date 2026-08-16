export interface DistributionPreviewInput {
  readonly roundId: string;
  readonly submissionIds: readonly string[];
  readonly reviewerIds?: readonly string[] | undefined;
  readonly expectedVersion: number;
}
