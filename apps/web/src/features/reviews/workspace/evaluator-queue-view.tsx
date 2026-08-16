"use client";

import styles from "../review-workspace.module.css";
import type { ReviewerQueueController } from "./evaluator-queue-controller";
import { ReviewerQueueDetail } from "./evaluator-queue-detail";
import { ReviewerQueueList } from "./evaluator-queue-list";
import queueStyles from "./reviewer-queue.module.css";

export function ReviewerQueueView({
  controller,
}: Readonly<{ controller: ReviewerQueueController }>) {
  const { selected } = controller;
  return (
    <div className={`${styles.workspace} ${styles.evaluatorQueueMode}`} id="review-workspace">
      <a
        className={styles.skipLink}
        href={selected ? "#review-scorecard-sheet" : "#review-content"}
      >
        {selected ? "Skip to open scorecard" : "Skip to reviewer queue"}
      </a>
      <header className={styles.workspaceHeader}>
        <div>
          <h1>Reviewer queue</h1>
        </div>
      </header>
      <div id="review-content" className={queueStyles.workbench} data-reviewer-collection="true">
        <nav aria-label="Assigned reviews">
          <ReviewerQueueList controller={controller} />
        </nav>
        <ReviewerQueueDetail controller={controller} />
      </div>
    </div>
  );
}
