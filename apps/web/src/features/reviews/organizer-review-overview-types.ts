export type OrganizerReviewAttentionKind =
  | "none"
  | "assignment"
  | "completion"
  | "conflict"
  | "decision";
export interface OrganizerReviewMetric {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}
export interface OrganizerReviewAttentionSummary {
  readonly count: number;
  readonly label: string;
  readonly description: string;
}
export interface OrganizerReviewRow {
  readonly id: string;
  readonly reference: string;
  readonly title: string;
  readonly roundName: string;
  readonly assignedReviewerCount: number;
  readonly expectedReviewerCount: number;
  readonly completedReviewCount: number;
  readonly expectedReviewCount: number;
  readonly weightedScoreLabel: string;
  readonly conflictCount: number;
  readonly decisionLabel: string;
  readonly attentionKind: OrganizerReviewAttentionKind;
  readonly attentionLabel: string;
  readonly reviewerDisplayNames: readonly string[];
  readonly manageable: boolean;
  readonly attentionAction?:
    | { readonly label: string; readonly target: "reviewers" }
    | { readonly label: string; readonly target: "decisions" };
}
export interface OrganizerReviewOverviewProps {
  readonly planName: string;
  readonly planStatusLabel: string;
  readonly description: string;
  readonly metrics: readonly OrganizerReviewMetric[];
  readonly completionPercent: number;
  readonly attentionSummary: OrganizerReviewAttentionSummary;
  readonly rows: readonly OrganizerReviewRow[];
  readonly aiTriage?: OrganizerAiTriageView | undefined;
  readonly onManageReviewers: (id: string) => void;
  readonly onOpenPlan: () => void;
  readonly onOpenReviewers: () => void;
  readonly onOpenDecisions: (id: string) => void;
}
import type { OrganizerAiTriageView } from "./organizer-ai-triage";
