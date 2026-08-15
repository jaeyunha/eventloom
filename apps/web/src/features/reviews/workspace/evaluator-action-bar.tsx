"use client";
import { StickyActionBar } from "@/components/workspace";
import styles from "../review-workspace.module.css";
import type { EvaluatorController } from "./evaluator-controller";
export function EvaluatorActionBar({ controller }: Readonly<{ controller: EvaluatorController }>) {
  const {
    primaryAction,
    onNext,
    autosaveState,
    submitError,
    submitBusy,
    reviewLocked,
    submitReview,
  } = controller;
  return (
    <StickyActionBar
      className={styles.evaluatorActionBar}
      summary={
        <div className={styles.evaluatorActionSummary}>
          <strong>Submit review</strong>
          <span>
            Submission waits for autosave, then locks scores and comments for organizer aggregation.{" "}
            {autosaveState}.
          </span>
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
          <button
            className={styles.primaryButton}
            type="button"
            onClick={() => void submitReview()}
            disabled={primaryAction.disabled || reviewLocked}
          >
            {submitBusy ? "Submitting…" : primaryAction.label}
          </button>
        )
      }
    />
  );
}
