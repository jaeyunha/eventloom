"use client";
import styles from "../review-workspace.module.css";
import { EvaluatorAssignmentStatusBadge } from "./assignment-evaluator-assignment-status-badge";
import { EvaluatorAbstainedView } from "./evaluator-abstained-view";
import { EvaluatorActionBar } from "./evaluator-action-bar";
import { EvaluatorConflictDialog } from "./evaluator-conflict-dialog";
import type { EvaluatorController } from "./evaluator-controller";
import { EvaluatorPrivacyNotice } from "./evaluator-privacy-notice";
import { ReviewNavigation } from "./evaluator-queue-review-navigation";
import { EvaluatorScorecardView } from "./evaluator-scorecard-view";
import { EvaluatorSubmissionPanel } from "./evaluator-submission-panel";
import { AuthorityNotice } from "./workspace-authority-notice";
export function EvaluatorWorkspaceView({
  controller,
}: Readonly<{ controller: EvaluatorController }>) {
  const { assignment, embedded, submitted, queuePosition, abstained } = controller;
  if (abstained) return <EvaluatorAbstainedView controller={controller} />;
  return (
    <div
      className={
        embedded
          ? `${styles.embeddedEvaluator} ${styles.evaluatorMode}`
          : `${styles.workspace} ${styles.evaluatorMode}`
      }
      id={embedded ? undefined : "review-workspace"}
    >
      {embedded ? null : (
        <>
          <a className={styles.skipLink} href="#review-content">
            Skip to review workspace content
          </a>
          <header className={styles.workspaceHeader}>
            <div>
              <p className={styles.eyebrow}>
                Assigned review · {assignment.eventName} · {assignment.planName}
              </p>
              <h1>{assignment.title}</h1>
              <p className={styles.headerDescription}>
                Evaluate this submission in <strong>{assignment.round.name}</strong>. Only your
                assigned submission is available in this workspace; your draft stays available while
                you move through the reviewer queue.
              </p>
            </div>
            <div className={styles.headerSide}>
              <ReviewNavigation mode="evaluator" />
              <section className={styles.reviewState} aria-label="Review state">
                <EvaluatorAssignmentStatusBadge
                  status={submitted ? "submitted" : assignment.assignmentStatus}
                />
                <span className={styles.queuePosition}>
                  {queuePosition
                    ? `Queue position ${queuePosition.position} of ${queuePosition.total}`
                    : "Assigned submission"}
                </span>
              </section>
            </div>
          </header>
        </>
      )}
      <div id={embedded ? undefined : "review-content"} tabIndex={embedded ? undefined : -1}>
        <AuthorityNotice />
        <EvaluatorPrivacyNotice controller={controller} />
        <EvaluatorSubmissionPanel controller={controller} />
        <EvaluatorScorecardView controller={controller} />
        <EvaluatorActionBar controller={controller} />
        <EvaluatorConflictDialog controller={controller} />
      </div>
    </div>
  );
}
