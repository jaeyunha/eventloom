"use client";
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
        <p className={styles.sectionEyebrow}>Reviewers</p>
        <h2>Keep reviewer coverage moving</h2>
        <p>Monitor completion, send reminders, and remove assignments that need to be replaced.</p>
        <Button type="button" variant="outline" onClick={() => setView("assignments")}>
          Add or update assignments
        </Button>
      </div>
      {seed.assignments.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No reviewers assigned</CardTitle>
            <CardDescription>
              Choose a submission and verified reviewers to begin this review round.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" onClick={() => setView("assignments")}>
              Assign reviewers
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
