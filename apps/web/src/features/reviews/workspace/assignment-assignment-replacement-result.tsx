import type { ReviewPlanAssignment } from "./assignment-review-plan-assignment";

export interface AssignmentReplacementResult {
  readonly scope: {
    readonly tenantId: string;
    readonly eventId: string;
    readonly planId: string;
    readonly roundId: string;
    readonly submissionId?: string | undefined;
    readonly planVersion?: number | undefined;
  };
  readonly replacedAssignment: ReviewPlanAssignment;
  readonly successorAssignment: ReviewPlanAssignment;
  readonly activeAssignments: readonly ReviewPlanAssignment[];
  readonly history: readonly {
    readonly assignment: ReviewPlanAssignment;
    readonly review: unknown;
  }[];
}
