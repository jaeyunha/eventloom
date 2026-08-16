"use client";
import { OrganizerAuthoring } from "./organizer-authoring-organizer-authoring";
import type { OrganizerWorkspaceViewController } from "./organizer-view-controller";
export function OrganizerSetupPanel({
  controller,
}: Readonly<{ controller: OrganizerWorkspaceViewController }>) {
  const {
    seed,
    baseUrl,
    reviewerMembers,
    reviewerMembersLoading,
    reviewerMembersError,
    onAuthoritativePlan,
    onAssignmentsPersisted,
  } = controller;
  return (
    <OrganizerAuthoring
      seed={seed}
      baseUrl={baseUrl}
      reviewerMembers={reviewerMembers}
      reviewerMembersLoading={reviewerMembersLoading}
      reviewerMembersError={reviewerMembersError}
      onAuthoritativePlan={onAuthoritativePlan}
      onAssignmentsPersisted={onAssignmentsPersisted}
    />
  );
}
