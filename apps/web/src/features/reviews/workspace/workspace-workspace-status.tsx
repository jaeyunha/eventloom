"use client";

import styles from ".././review-workspace.module.css";
import { ReviewNavigation } from "./evaluator-queue-review-navigation";
import type { ReviewWorkspaceMode } from "./workspace-review-workspace-mode";

export function WorkspaceStatus({
  eventId,
  mode,
  organizationId,
  message,
  error = false,
}: Readonly<{
  eventId?: string;
  organizationId?: string | undefined;
  mode: ReviewWorkspaceMode;
  message: string;
  error?: boolean;
}>) {
  const reviewer = mode === "evaluator";
  return (
    <div className={styles.workspace} id="review-workspace">
      <a className={styles.skipLink} href="#review-content">
        Skip to review workspace content
      </a>
      <header className={styles.workspaceHeader}>
        <div>
          <p className={styles.eyebrow}>
            {mode === "organizer" ? "Organizer review" : "Reviewer workspace"}
          </p>
          <h1>{reviewer ? "Reviewer queue" : "Evaluation plan"}</h1>
        </div>
        <ReviewNavigation
          {...(eventId === undefined ? {} : { eventId })}
          mode={mode}
          organizationId={organizationId}
        />
      </header>
      <section id="review-content" className={styles.section} role={error ? "alert" : "status"}>
        <h2>{error ? "Evaluation unavailable" : "Evaluation data"}</h2>
        <p>{message}</p>
      </section>
    </div>
  );
}
