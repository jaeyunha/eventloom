"use client";
import styles from "./organizer-review-overview.module.css";
import { useOrganizerReviewOverviewController } from "./organizer-review-overview-controller";
import type { OrganizerReviewOverviewProps } from "./organizer-review-overview-types";
import { OrganizerReviewSubmissionList } from "./organizer-review-submission-list";
import { OrganizerReviewSummary } from "./organizer-review-summary";

export type {
  OrganizerReviewAttentionKind,
  OrganizerReviewAttentionSummary,
  OrganizerReviewMetric,
  OrganizerReviewOverviewProps,
  OrganizerReviewRow,
} from "./organizer-review-overview-types";
export function OrganizerReviewOverview(props: OrganizerReviewOverviewProps) {
  const controller = useOrganizerReviewOverviewController(props);
  return (
    <section className={styles.overview} aria-labelledby="review-overview-title">
      <OrganizerReviewSummary controller={controller} />
      <OrganizerReviewSubmissionList controller={controller} />
    </section>
  );
}
