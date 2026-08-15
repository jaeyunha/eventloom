"use client";

import styles from "../review-workspace.module.css";
import type { DistributionPreview } from "./assignment-distribution-preview";

export function OrganizerAssignmentPreview({
  preview,
}: Readonly<{
  preview: DistributionPreview | null;
}>) {
  if (preview === null) return null;
  return (
    <div className={styles.fieldHint} role="status" aria-live="polite">
      <p>
        Fingerprint: <code>{preview.fingerprint}</code>
      </p>
      <p>
        Desired assignments ({preview.desiredAssignments.length}):{" "}
        {[...preview.desiredAssignments]
          .sort(
            (left, right) =>
              left.submissionId.localeCompare(right.submissionId) ||
              left.reviewerId.localeCompare(right.reviewerId),
          )
          .map(
            (assignment) =>
              `${assignment.submissionId} → ${assignment.reviewerId}${assignment.existingAssignmentId ? ` (existing ${assignment.existingAssignmentId})` : ""}`,
          )
          .join(", ") || "none"}
      </p>
      <p>
        Deficits ({preview.deficits.length}):{" "}
        {[...preview.deficits]
          .sort((left, right) => left.submissionId.localeCompare(right.submissionId))
          .map(
            (deficit) =>
              `${deficit.submissionId}: ${deficit.missingReviewCount} (${deficit.reason})`,
          )
          .join(", ") || "none"}
      </p>
      <p>
        Exclusions ({preview.exclusions.length}):{" "}
        {[...preview.exclusions]
          .sort(
            (left, right) =>
              left.submissionId.localeCompare(right.submissionId) ||
              left.reviewerId.localeCompare(right.reviewerId),
          )
          .map(
            (exclusion) => `${exclusion.submissionId}/${exclusion.reviewerId}: ${exclusion.reason}`,
          )
          .join(", ") || "none"}
      </p>
      <p>
        Submission revisions:{" "}
        {[...preview.submissionRevisions]
          .sort((left, right) => left.submissionId.localeCompare(right.submissionId))
          .map((revision) => `${revision.submissionId}=${revision.revision}`)
          .join(", ") || "none"}
      </p>
    </div>
  );
}
