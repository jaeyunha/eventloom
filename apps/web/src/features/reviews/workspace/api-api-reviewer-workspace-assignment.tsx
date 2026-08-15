import type { ApiReviewContext } from "./api-api-review-context";
import type { ApiReviewerWorkspacePlan } from "./api-api-reviewer-workspace-plan";

export interface ApiReviewerWorkspaceAssignment extends ApiReviewContext {
  plan: ApiReviewerWorkspacePlan;
}
