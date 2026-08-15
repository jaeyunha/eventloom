"use client";
import { Button } from "../../../components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
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
            Finish the scorecard and reviewer eligibility settings, save the draft, and open the
            plan. Submission assignments will become available here.
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
      <OrganizerAuthoring
        seed={seed}
        baseUrl={baseUrl}
        reviewerMembers={reviewerMembers}
        reviewerMembersLoading={reviewerMembersLoading}
        reviewerMembersError={reviewerMembersError}
        onAuthoritativePlan={onAuthoritativePlan}
        onAssignmentsPersisted={onAssignmentsPersisted}
        assignmentOnly
        assignmentTarget={assignmentTarget ?? undefined}
      />
      <div className={styles.viewIntro}>
        <p className={styles.sectionEyebrow}>Assignments</p>
        <h2>Progress and active assignments</h2>
        <p>Monitor completed reviews, send reminders, and replace assignments as needed.</p>
      </div>
      {seed.assignments.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No reviewer assignments yet</CardTitle>
            <CardDescription>Use the assignment form above to assign reviewers.</CardDescription>
          </CardHeader>
        </Card>
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
