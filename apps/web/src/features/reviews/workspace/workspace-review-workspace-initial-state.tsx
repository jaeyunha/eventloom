import type { EvaluatorAssignment } from "./assignment-evaluator-assignment";
import type { ReviewerQueueEntry } from "./evaluator-queue-reviewer-queue-entry";
import type { ReviewPlanSeed } from "./organizer-review-plan-seed";

export interface ReviewWorkspaceInitialState {
  readonly organizer?: ReviewPlanSeed | null;
  readonly assignment?: EvaluatorAssignment | null;
  readonly queue?: readonly ReviewerQueueEntry[] | null;
  readonly organizerPlanMissing?: boolean;
}
