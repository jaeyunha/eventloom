"use client";
import styles from "./organizer-review-overview.module.css";
import type { OrganizerReviewOverviewController } from "./organizer-review-overview-controller";
import {
  Attention,
  ReviewAction,
  ReviewerSummary,
  SubmissionIdentity,
} from "./organizer-review-row-parts";
import { OrganizerAiTriagePanel } from "./organizer-ai-triage-panel";
import { reviewStatus } from "./organizer-review-status";
export function OrganizerReviewMobileList({
  controller,
}: Readonly<{ controller: OrganizerReviewOverviewController }>) {
  const { visibleRows, onManageReviewers, onOpenDecisions, aiTriage } = controller;
  return (
    <div className={styles.mobileList}>
      {visibleRows.map((row) => (
        <article
          key={row.id}
          className={styles.mobileRow}
          data-submission-id={row.id}
          data-review-status={reviewStatus(row)}
          data-attention={row.attentionKind}
        >
          <div className={styles.mobileHeading}>
            <SubmissionIdentity row={row} />
            <Attention row={row} />
          </div>
          <dl className={styles.mobileFacts}>
            <div>
              <dt>Round</dt>
              <dd>{row.roundName}</dd>
            </div>
            <div>
              <dt>Reviews</dt>
              <dd>
                {row.completedReviewCount}/{row.expectedReviewCount}
              </dd>
            </div>
            <div>
              <dt>Weighted score</dt>
              <dd>{row.weightedScoreLabel}</dd>
            </div>
            <div>
              <dt>Decision</dt>
              <dd>{row.decisionLabel}</dd>
            </div>
          </dl>
          {aiTriage?.enabled === true ? (
            <OrganizerAiTriagePanel
              key={`${row.id}:${aiTriage.suggestions[row.id]?.version ?? "new"}`}
              submissionId={row.id}
              aiTriage={aiTriage}
            />
          ) : null}
          <ReviewerSummary row={row} />
          <div className={styles.mobileAction}>
            <ReviewAction
              row={row}
              onManageReviewers={onManageReviewers}
              onOpenDecisions={onOpenDecisions}
            />
          </div>
        </article>
      ))}
    </div>
  );
}
