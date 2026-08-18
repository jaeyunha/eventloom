"use client";
import { Badge } from "../../../components/ui/badge";
import styles from "../review-workspace.module.css";
import { OrganizerAssignmentCoverage } from "./organizer-authoring-assignment-coverage";
import type { OrganizerAuthoringController } from "./organizer-authoring-controller";
import { OrganizerAuthoringWorkbench } from "./organizer-authoring-workbench";
export function OrganizerAuthoringView({
  controller,
}: Readonly<{ controller: OrganizerAuthoringController }>) {
  const { assignmentOnly, isDraft, status, planStatusLabel, message } = controller;
  if (assignmentOnly) {
    return (
      <>
        <OrganizerAssignmentCoverage controller={controller} />
        {message ? (
          <p className={styles.submittedMessage} role="status">
            {message}
          </p>
        ) : null}
      </>
    );
  }
  return (
    <section
      className={`${styles.section} ${styles.authoringSection}`}
      aria-labelledby="authoring-heading"
    >
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.sectionEyebrow}>Setup</p>
          <h2 id="authoring-heading">
            {isDraft ? "Configure the plan" : "Current plan configuration"}
          </h2>
        </div>
        <div className={styles.authoringStatus}>
          <Badge variant={status === "open" ? "default" : "outline"}>{planStatusLabel}</Badge>
        </div>
      </div>
      <p className={styles.sectionIntro}>
        {isDraft
          ? "Set the review schedule, track targeting, assignment limits, and scorecard before opening the plan. Round review teams are managed afterward in Assignments."
          : "Review the active plan. Create an editable revision before changing rounds, track targeting, assignment limits, or scorecard criteria."}
      </p>
      <OrganizerAuthoringWorkbench controller={controller} />
      {message ? (
        <p className={styles.submittedMessage} role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
