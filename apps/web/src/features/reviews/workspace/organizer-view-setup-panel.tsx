"use client";
import styles from "../review-workspace.module.css";
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
    <>
      <div className={styles.viewIntro}>
        <p className={styles.sectionEyebrow}>Plan &amp; rubric</p>
        <h2>Configure the review plan</h2>
        <p>
          Set dates, rounds, rubrics, reviewer pools, and the fields reviewers can use before
          opening the plan.
        </p>
      </div>
      <OrganizerAuthoring
        seed={seed}
        baseUrl={baseUrl}
        reviewerMembers={reviewerMembers}
        reviewerMembersLoading={reviewerMembersLoading}
        reviewerMembersError={reviewerMembersError}
        onAuthoritativePlan={onAuthoritativePlan}
        onAssignmentsPersisted={onAssignmentsPersisted}
      />
    </>
  );
}
