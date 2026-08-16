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
      <div aria-hidden="true" className={styles.columns} data-reviewer-column-headings="true">
        <span data-reviewer-column="title">Title</span>
        <span data-reviewer-column="context">Event / round</span>
        <span data-reviewer-column="due">Due</span>
        <span data-reviewer-column="status">Status</span>
        <span />
      </div>
      <ReviewerQueueRows controller={controller} />
    </section>
  );
}
