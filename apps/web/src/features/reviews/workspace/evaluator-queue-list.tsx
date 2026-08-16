"use client";

import type { ReviewerQueueController } from "./evaluator-queue-controller";
import { ReviewerQueueFilters } from "./evaluator-queue-filters";
import { ReviewerQueueRows } from "./evaluator-queue-rows";
import styles from "./reviewer-queue.module.css";

export function ReviewerQueueList({
  controller,
}: Readonly<{ controller: ReviewerQueueController }>) {
  return (
    <section className={styles.panel} aria-label="Assigned reviews">
      <ReviewerQueueFilters controller={controller} />
      <div className={styles.columns} aria-hidden="true">
        <span>Submission</span>
        <span>Event</span>
        <span>Round</span>
        <span className={styles.track}>Track</span>
        <span>Due</span>
        <span>Status</span>
      </div>
      <ReviewerQueueRows controller={controller} />
    </section>
  );
}
