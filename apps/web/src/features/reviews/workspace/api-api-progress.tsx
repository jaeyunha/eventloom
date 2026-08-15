import type { ReviewerProgressSummary } from "./progress-reviewer-progress-summary";

export interface ApiProgress {
  total: number;
  assigned: number;
  inProgress: number;
  submitted: number;
  abstained: number;
  completionPercent: number;
  reviewers?: readonly ReviewerProgressSummary[];
}
