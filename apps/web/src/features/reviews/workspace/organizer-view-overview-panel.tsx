"use client";
import { OrganizerReviewOverview } from "../organizer-review-overview";
import { formatPlanStatus } from "./organizer-format-plan-status";
import type { OrganizerWorkspaceViewController } from "./organizer-view-controller";
export function OrganizerOverviewPanel({
  controller,
}: Readonly<{ controller: OrganizerWorkspaceViewController }>) {
  const {
    seed,
    selectedRound,
    overviewRows,
    overviewMetrics,
    overviewCompletionPercent,
    overviewAttentionSummary,
    openReviewersForSubmission,
    openDecisionForSubmission,
    setView,
  } = controller;
  return (
    <OrganizerReviewOverview
      planName={seed.planName}
      planStatusLabel={formatPlanStatus(seed.status)}
      description={`${selectedRound?.name ?? "Selected round"} has ${overviewRows.length} submission${overviewRows.length === 1 ? "" : "s"} in view.`}
      metrics={overviewMetrics}
      completionPercent={overviewCompletionPercent}
      attentionSummary={overviewAttentionSummary}
      rows={overviewRows}
      onManageReviewers={openReviewersForSubmission}
      onOpenPlan={() => setView("setup")}
      onOpenReviewers={() => setView("assignments")}
      onOpenDecisions={openDecisionForSubmission}
    />
  );
}
