"use client";
import { Badge } from "../../../components/ui/badge";
import styles from "../review-workspace.module.css";
import { OrganizerAssignmentCoverage } from "./organizer-authoring-assignment-coverage";
import type { OrganizerAuthoringController } from "./organizer-authoring-controller";
import { OrganizerAuthoringWorkbench } from "./organizer-authoring-workbench";
export function OrganizerAuthoringView({
  controller,
}: Readonly<{ controller: OrganizerAuthoringController }>) {
  const { assignmentOnly, isDraft, status, planStatusLabel, version, message } = controller;
  return (
    <section
      className={`${styles.section} ${assignmentOnly ? "" : styles.authoringSection}`}
      aria-labelledby="authoring-heading"
    >
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.sectionEyebrow}>{assignmentOnly ? "Assignments" : "Setup"}</p>
          <h2 id="authoring-heading">
            {assignmentOnly
              ? "Assign reviewers"
              : isDraft
                ? "Configure the plan"
                : "Current plan configuration"}
          </h2>
        </div>
        {!assignmentOnly ? (
          <div className={styles.authoringStatus}>
            <Badge variant={status === "open" ? "default" : "outline"}>{planStatusLabel}</Badge>
            <span className={styles.mutedLabel}>Version {version}</span>
          </div>
        ) : null}
      </div>
      <p className={styles.sectionIntro}>
        {assignmentOnly
          ? "Choose a round and submission, then select eligible reviewers. Preview assignments and apply them without editing the plan or rubric. Existing assignments remain unchanged."
          : isDraft
            ? "Shape the review schedule, track targeting, reviewer eligibility, assignment limits, and rubric before opening this version for reviewers. Round review teams are managed from the Review team tab."
            : "Inspect the live grading configuration. Its rounds and rubric are locked to protect existing assignments and reviews; create a revision before changing rounds, eligibility, assignment limits, or scorecard criteria."}
      </p>
      {assignmentOnly ? <OrganizerAssignmentCoverage controller={controller} /> : null}
      {!assignmentOnly ? <OrganizerAuthoringWorkbench controller={controller} /> : null}
      {message ? (
        <p className={styles.submittedMessage} role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
