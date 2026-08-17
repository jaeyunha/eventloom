"use client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import styles from "../review-workspace.module.css";
import { EvaluatorAssignmentStatusBadge } from "./assignment-evaluator-assignment-status-badge";
import { EvaluatorAbstainedView } from "./evaluator-abstained-view";
import { EvaluatorActionBar } from "./evaluator-action-bar";
import { EvaluatorConflictDialog } from "./evaluator-conflict-dialog";
import type { EvaluatorController } from "./evaluator-controller";
import { EvaluatorPrivacyNotice } from "./evaluator-privacy-notice";
import { ReviewNavigation } from "./evaluator-queue-review-navigation";
import { EvaluatorRoundAvailabilityNotice } from "./evaluator-round-availability-notice";
import { EvaluatorScorecardView } from "./evaluator-scorecard-view";
import { EvaluatorSubmissionPanel } from "./evaluator-submission-panel";
import { AuthorityNotice } from "./workspace-authority-notice";
export function EvaluatorWorkspaceView({
  controller,
}: Readonly<{ controller: EvaluatorController }>) {
  const { assignment, embedded, submitted, queuePosition, abstained, returnHref } = controller;
  if (abstained) return <EvaluatorAbstainedView controller={controller} />;
  const fullPage = returnHref !== undefined;
  const reviewSections = (
    <>
      <EvaluatorPrivacyNotice controller={controller} />
      <EvaluatorRoundAvailabilityNotice round={assignment.round} />
      <EvaluatorSubmissionPanel controller={controller} pageHeading={fullPage} />
      <EvaluatorScorecardView controller={controller} />
    </>
  );

  if (embedded) {
    return (
      <div className={`${styles.embeddedEvaluator} ${styles.evaluatorMode}`}>
        <div className={styles.embeddedEvaluatorScroll} data-reviewer-scorecard-scroll="true">
          <AuthorityNotice />
          {reviewSections}
        </div>
        <EvaluatorActionBar controller={controller} />
        <EvaluatorConflictDialog controller={controller} />
      </div>
    );
  }

  return (
    <div
      className={`${styles.workspace} ${styles.evaluatorMode} ${
        fullPage ? styles.fullPageEvaluator : ""
      }`}
      id="review-workspace"
    >
      <a className={styles.skipLink} href="#review-content">
        Skip to review workspace content
      </a>
      {fullPage ? (
        <div className={styles.fullPageReviewToolbar}>
          <Button asChild size="sm" variant="ghost">
            <Link href={returnHref}>
              <ArrowLeft data-icon="inline-start" aria-hidden="true" />
              Back to queue
            </Link>
          </Button>
        </div>
      ) : (
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
      )}
      <div id="review-content" tabIndex={-1}>
        <AuthorityNotice />
        {reviewSections}
        <EvaluatorActionBar controller={controller} />
        <EvaluatorConflictDialog controller={controller} />
      </div>
    </div>
  );
}
