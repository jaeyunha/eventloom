"use client";

import { activeVerifiedReviewers } from "../../members/api";
import { EvaluatorWorkspace } from "./evaluator-evaluator-workspace";
import { ReviewerQueueWorkspace } from "./evaluator-queue-reviewer-queue-workspace";
import { OrganizerDetailStatus } from "./organizer-organizer-detail-status";
import { OrganizerPlanCreation } from "./organizer-organizer-plan-creation";
import { OrganizerWorkspace } from "./organizer-organizer-workspace";
import { seedFromCreatedPlan } from "./organizer-seed-from-created-plan";
import type { ReviewWorkspaceController } from "./workspace-review-controller";
import { WorkspaceStatus } from "./workspace-workspace-status";

export function ReviewWorkspaceDispatcher({
  controller,
}: Readonly<{
  controller: ReviewWorkspaceController;
}>) {
  const {
    mode,
    explicitOrganizationId,
    eventId,
    baseUrl,
    reviewerQueueMode,
    seed,
    setSeed,
    assignment,
    queue,
    loading,
    error,
    missingPlan,
    setMissingPlan,
    reviewerMembers,
    reviewerMembersLoading,
    reviewerMembersError,
    createdPlanRefresh,
    setCreatedPlanRefresh,
    createdPlanRefreshLoading,
    createdPlanRefreshError,
    refreshCreatedPlan,
  } = controller;
  const statusProps = {
    ...(eventId === undefined ? {} : { eventId }),
    mode,
    organizationId: explicitOrganizationId,
  };
  if (loading) {
    return <WorkspaceStatus {...statusProps} message="Loading authoritative evaluation data…" />;
  }
  if (error !== null) return <WorkspaceStatus {...statusProps} message={error} error />;
  if (mode === "evaluator") {
    if (reviewerQueueMode)
      return <ReviewerQueueWorkspace entries={queue ?? []} baseUrl={baseUrl} />;
    return assignment === null ? (
      <WorkspaceStatus {...statusProps} message="No review assignment is available." error />
    ) : (
      <EvaluatorWorkspace assignment={assignment} baseUrl={baseUrl} />
    );
  }
  if (missingPlan && eventId !== undefined) {
    return (
      <OrganizerPlanCreation
        eventId={eventId}
        baseUrl={baseUrl}
        onCreated={(plan) => {
          const refresh = { eventId, planId: plan.id };
          setMissingPlan(false);
          setSeed(seedFromCreatedPlan(plan, eventId));
          setCreatedPlanRefresh(refresh);
          void refreshCreatedPlan(refresh.eventId, refresh.planId);
        }}
      />
    );
  }
  if (seed === null) {
    return <WorkspaceStatus {...statusProps} message="No evaluation plan is available." error />;
  }
  return (
    <>
      <OrganizerDetailStatus
        loading={createdPlanRefreshLoading}
        error={createdPlanRefreshError}
        onRetry={() => {
          if (createdPlanRefresh !== null) {
            void refreshCreatedPlan(createdPlanRefresh.eventId, createdPlanRefresh.planId);
          }
        }}
      />
      <OrganizerWorkspace
        seed={seed}
        baseUrl={baseUrl}
        organizationId={explicitOrganizationId}
        reviewerMembers={activeVerifiedReviewers(reviewerMembers)}
        reviewerMembersLoading={reviewerMembersLoading}
        reviewerMembersError={reviewerMembersError}
      />
    </>
  );
}
