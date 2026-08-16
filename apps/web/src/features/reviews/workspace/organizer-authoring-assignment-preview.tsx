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
    <div className={styles.fieldHint} role="status" aria-live="polite">
      <p>Assignments to apply: {preview.desiredAssignments.length}</p>
      <p>Remaining missing reviewers: {remainingMissingReviewers}</p>
      <p>Exclusions: {preview.exclusions.length}</p>
    </div>
  );
}
