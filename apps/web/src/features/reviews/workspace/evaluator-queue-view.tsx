"use client";

import { StatusBadge, WorkspaceListDetail } from "@/components/workspace";
import styles from "../review-workspace.module.css";
import type { ReviewerQueueController } from "./evaluator-queue-controller";
import { ReviewerQueueDetail } from "./evaluator-queue-detail";
import { ReviewerQueueList } from "./evaluator-queue-list";
import { ReviewNavigation } from "./evaluator-queue-review-navigation";

export function ReviewerQueueView({
  controller,
}: Readonly<{ controller: ReviewerQueueController }>) {
  const { selected } = controller;
  return (
    <div className={`${styles.workspace} ${styles.evaluatorQueueMode}`} id="review-workspace">
      <a
        className={styles.skipLink}
        href={selected ? `#scorecard-${encodeURIComponent(selected.id)}` : "#review-content"}
      >
        {selected ? "Skip to open scorecard" : "Skip to reviewer queue"}
      </a>
      <header className={styles.workspaceHeader}>
        <div>
          <p className={styles.eyebrow}>Reviewer workspace</p>
          <h1>Reviewer queue</h1>
          <p className={styles.headerDescription}>
            Review only the submissions assigned to you. Event, plan, and round access come from the
            server assignment projection.
          </p>
        </div>
        <div className={styles.headerSide}>
          <ReviewNavigation mode="evaluator" />
          <StatusBadge tone="success">Reviewer access</StatusBadge>
        </div>
      </header>
      <WorkspaceListDetail
        id="review-content"
        className={styles.reviewerWorkbench}
        data-detail-open={selected !== null}
        list={<ReviewerQueueList controller={controller} />}
        listLabel="Assigned reviews"
        detail={<ReviewerQueueDetail controller={controller} />}
        detailLabel={selected ? `Review ${selected.title}` : "Reviewer queue guidance"}
      />
    </div>
  );
}
