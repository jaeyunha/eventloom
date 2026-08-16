export interface ReviewerProgressSummary {
  reviewerId: string;
  roundId: string;
  assigned: number;
  inProgress: number;
  submitted: number;
  abstained: number;
  outstanding: number;
  completionPercent: number;
}
