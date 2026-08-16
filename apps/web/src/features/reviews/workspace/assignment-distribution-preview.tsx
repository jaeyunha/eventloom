export interface DistributionPreview {
  readonly scope: {
    readonly tenantId: string;
    readonly eventId: string;
    readonly planId: string;
    readonly roundId: string;
    readonly planVersion: number;
  };
  readonly desiredAssignments: readonly {
    readonly submissionId: string;
    readonly reviewerId: string;
    readonly existingAssignmentId?: string | undefined;
  }[];
  readonly deficits: readonly {
    readonly submissionId: string;
    readonly missingReviewCount: number;
    readonly reason: string;
  }[];
  readonly exclusions: readonly {
    readonly submissionId: string;
    readonly reviewerId: string;
    readonly reason: string;
  }[];
  readonly expectedActiveVersions: readonly {
    readonly assignmentId: string;
    readonly version: number;
  }[];
  readonly submissionRevisions: readonly {
    readonly submissionId: string;
    readonly revision: number;
  }[];
  readonly fingerprint: string;
}
