"use client";
import styles from "../review-workspace.module.css";
import type { EvaluatorController } from "./evaluator-controller";
import { ReviewNavigation } from "./evaluator-queue-review-navigation";

export function EvaluatorAbstainedView({
  controller,
}: Readonly<{ controller: EvaluatorController }>) {
  const { assignment } = controller;
  return (
    <div className={styles.workspace} id="review-workspace">
      <a className={styles.skipLink} href="#abstention-result">
        Skip to abstention result
      </a>
      <header className={styles.workspaceHeader}>
        <div>
          <p className={styles.eyebrow}>
            {assignment.eventName} · {assignment.planName}
          </p>
          <h1>Review access removed</h1>
          <p className={styles.headerDescription}>Your conflict declaration has been recorded.</p>
        </div>
        <div className={styles.headerSide}>
          <ReviewNavigation mode="evaluator" />
        </div>
      </header>
      <section
        className={styles.abstentionResult}
        id="abstention-result"
        role="alert"
        tabIndex={-1}
      >
        <span className={styles.noticeIcon} aria-hidden="true">
          !
        </span>
        <div>
          <h2>Assignment abstained</h2>
          <p>
            Access to the assigned submission has been removed from this workspace. The written
            reason was recorded for organizer audit and a replacement reviewer can now be assigned.
          </p>
        </div>
      </section>
    </div>
  );
}
