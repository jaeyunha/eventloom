"use client";

import styles from "../review-workspace.module.css";
import type { DistributionPreview } from "./assignment-distribution-preview";

export function OrganizerAssignmentPreview({
  preview,
}: Readonly<{
  preview: DistributionPreview | null;
}>) {
  if (preview === null) return null;
  const remainingMissingReviewers = preview.deficits.reduce(
    (total, deficit) => total + deficit.missingReviewCount,
    0,
  );
  return (
    <div className={styles.assignmentPreview} role="status" aria-live="polite">
      <p className={styles.mutedLabel}>Assignment preview</p>
      <div className={styles.assignmentPreviewMetrics}>
        <div>
          <strong>{preview.desiredAssignments.length}</strong>
          <span>To apply</span>
        </div>
        <div>
          <strong>{remainingMissingReviewers}</strong>
          <span>Slots unfilled</span>
        </div>
        <div>
          <strong>{preview.exclusions.length}</strong>
          <span>Excluded</span>
        </div>
      </div>
    </div>
  );
}
