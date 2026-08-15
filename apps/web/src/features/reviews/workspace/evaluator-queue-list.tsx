"use client";

import styles from "../review-workspace.module.css";
import type { ReviewerQueueController } from "./evaluator-queue-controller";
import { ReviewerQueueFilters } from "./evaluator-queue-filters";
import { ReviewerQueueRows } from "./evaluator-queue-rows";

export function ReviewerQueueList({
  controller,
}: Readonly<{ controller: ReviewerQueueController }>) {
  const { filteredItems, inboxItems } = controller;
  return (
    <section
      className={`${styles.section} ${styles.reviewerQueuePanel}`}
      aria-labelledby="review-queue-heading"
    >
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.sectionEyebrow}>Assigned work</p>
          <h2 id="review-queue-heading">Submissions to review</h2>
          <p className={styles.sectionIntro}>
            Open one scorecard at a time. Drafts stay saved while you move through the queue.
          </p>
        </div>
        <span className={styles.mutedLabel}>
          {filteredItems.length} of {inboxItems.length}
        </span>
      </div>
      <ReviewerQueueFilters controller={controller} />
      <ReviewerQueueRows controller={controller} />
    </section>
  );
}
