"use client";
import { StickyActionBar } from "@/components/workspace";
import styles from "../review-workspace.module.css";
import type { EvaluatorController } from "./evaluator-controller";
export function EvaluatorActionBar({ controller }: Readonly<{ controller: EvaluatorController }>) {
  const {
    assignment,
    primaryAction,
    onNext,
    autosaveState,
    submitError,
    submitBusy,
    reviewLocked,
    submitReview,
    openConflictDisclosure,
  } = controller;
  const summary =
    assignment.round.status === "scheduled"
      ? "Scoring and comments stay locked until the scheduled round opens."
      : assignment.round.status === "closed"
        ? "This review round is closed; scores and comments are read-only."
        : `Submission waits for autosave, then locks scores and comments for organizer aggregation. ${autosaveState}.`;
  return (
    <StickyActionBar
      className={styles.evaluatorActionBar}
      data-reviewer-scorecard-footer="true"
      summary={
        <div className={styles.evaluatorActionSummary}>
          <strong>Submit review</strong>
          <span>{summary}</span>
          {submitError ? (
            <span className={styles.formError} role="alert">
              {submitError}
            </span>
          ) : null}
        </div>
      }
      actions={
        primaryAction.kind !== "submit" ? (
          <div className={styles.confirmationActions}>
            <p className={styles.submittedMessage} role="status">
              Review submitted to the committee.
            </p>
            {primaryAction.kind === "open-next" && onNext ? (
              <button className={styles.primaryButton} type="button" onClick={onNext}>
                {primaryAction.label}
              </button>
            ) : null}
          </div>
        ) : (
          <div className={styles.confirmationActions}>
            <button type="button" onClick={openConflictDisclosure} disabled={reviewLocked}>
              Declare conflict
            </button>
            <button
              className={styles.primaryButton}
              type="button"
              onClick={() => void submitReview()}
              disabled={primaryAction.disabled || reviewLocked}
            >
              {submitBusy ? "Submitting…" : primaryAction.label}
            </button>
          </div>
        )
      }
    />
  );
}
