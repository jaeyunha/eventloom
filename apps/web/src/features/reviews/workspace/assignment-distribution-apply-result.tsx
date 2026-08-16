import type { DistributionPreview } from "./assignment-distribution-preview";
import type { ReviewPlanAssignment } from "./assignment-review-plan-assignment";

export interface DistributionApplyResult {
  readonly scope: DistributionPreview["scope"];
  readonly activeAssignments: readonly ReviewPlanAssignment[];
  readonly supersededAssignments: readonly ReviewPlanAssignment[];
  readonly history: readonly {
    readonly assignment: ReviewPlanAssignment;
    readonly review: unknown;
  }[];
}
