"use client";
import Link from "next/link";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
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
  const invitationHref = controller.organizationId
    ? `/admin/organizations/${encodeURIComponent(controller.organizationId)}/members?tab=invite`
    : "/admin/events";
  if (seed.status === "draft") {
    return (
      <section className={styles.section} aria-labelledby="assignments-unavailable-heading">
        <div className={styles.viewIntro}>
          <p className={styles.sectionEyebrow}>Assignments</p>
          <h2 id="assignments-unavailable-heading">Open the plan before assigning reviewers</h2>
          <p>
            Finish the rounds, dates, and scorecards in Setup, save the draft, and open the plan.
            Round review teams and submission assignments will become available here.
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
      <div className={styles.viewIntro}>
        <p className={styles.sectionEyebrow}>Review team</p>
        <h2>Choose the round team, then distribute work</h2>
        <p>
          Add organization reviewers to this event round, set their capacity, create submission
          assignments, and monitor completion from one place.
        </p>
        <Button asChild variant="outline">
          <Link href={invitationHref}>Invite reviewers</Link>
        </Button>
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
      <div className={styles.viewIntro}>
        <p className={styles.sectionEyebrow}>Assignments</p>
        <h2>Progress and active assignments</h2>
        <p>Monitor completed reviews, send reminders, and replace assignments as needed.</p>
      </div>
      {seed.assignments.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No assignments yet</CardTitle>
            <CardDescription>
              Save the round review team above, then choose a submission and reviewers to create the
              first assignments.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <a href="#assignment-task-heading">Fill reviewer slots</a>
            </Button>
          </CardContent>
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
