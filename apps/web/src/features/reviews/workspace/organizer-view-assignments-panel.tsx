"use client";
import { Button } from "../../../components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "../../../components/ui/empty";
import styles from "../review-workspace.module.css";
import { ReviewerAssignmentList } from "./assignment-reviewer-assignment-list";
import { OrganizerAuthoring } from "./organizer-authoring-organizer-authoring";
import type { OrganizerWorkspaceViewController } from "./organizer-view-controller";
import { ReviewerProgressDashboard } from "./progress-reviewer-progress-dashboard";
export function OrganizerAssignmentsPanel({
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
    assignmentTarget,
    setView,
  } = controller;
  if (seed.status === "draft") {
    return (
      <section className={styles.section} aria-labelledby="assignments-unavailable-heading">
        <div className={styles.viewIntro}>
          <p className={styles.sectionEyebrow}>Assignments</p>
          <h2 id="assignments-unavailable-heading">Open the plan before assigning reviewers</h2>
          <p>
            Finish the rounds, dates, and scorecards in Setup, save the draft, and open the plan.
            Round review teams and proposal assignments will become available here.
          </p>
          <Button type="button" onClick={() => setView("setup")}>
            Finish plan setup
          </Button>
        </div>
      </section>
    );
  }
  return (
    <>
      <div className={styles.assignmentSectionIntro}>
        <div className={styles.assignmentSectionIntroCopy}>
          <p className={styles.sectionEyebrow}>Review team</p>
          <h2>Choose the round team, then distribute work</h2>
          <p>
            Add organization reviewers to this event round, set their capacity, create proposal
            assignments, and monitor completion from one place.
          </p>
        </div>
      </div>
      <OrganizerAuthoring
        seed={seed}
        baseUrl={baseUrl}
        organizationId={controller.organizationId}
        reviewerMembers={reviewerMembers}
        reviewerMembersLoading={reviewerMembersLoading}
        reviewerMembersError={reviewerMembersError}
        onAuthoritativePlan={onAuthoritativePlan}
        onAssignmentsPersisted={onAssignmentsPersisted}
        assignmentOnly
        assignmentTarget={assignmentTarget ?? undefined}
      />
      <div className={styles.assignmentSectionIntro}>
        <div className={styles.assignmentSectionIntroCopy}>
          <p className={styles.sectionEyebrow}>Assignments</p>
          <h2>Progress and active assignments</h2>
          <p>Monitor completed reviews, send reminders, and replace assignments as needed.</p>
        </div>
      </div>
      {seed.assignments.length === 0 ? (
        <Empty className={styles.assignmentEmpty}>
          <EmptyHeader>
            <EmptyTitle>No assignments yet</EmptyTitle>
            <EmptyDescription>
              Save the round review team above, then choose a proposal and reviewers to create the
              first assignments.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <a href="#assignment-task-heading">Fill reviewer slots</a>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <ReviewerProgressDashboard
            seed={seed}
            baseUrl={baseUrl}
            reviewerMembers={reviewerMembers}
          />
          <ReviewerAssignmentList
            seed={seed}
            baseUrl={baseUrl}
            reviewerMembers={reviewerMembers}
            onAssignmentsPersisted={onAssignmentsPersisted}
          />
        </>
      )}
    </>
  );
}
