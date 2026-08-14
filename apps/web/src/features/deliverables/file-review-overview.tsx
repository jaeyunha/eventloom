"use client";

import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { DeliverableReviewState } from "./api";
import {
  filePointerLabels,
  fileReviewPresentation,
  formatFileSize,
  formatFileStatus,
  formatFileTime,
} from "./file-library-model";
import type { FileReviewContext } from "./file-review-types";
import styles from "./file-library.module.css";

interface FileReviewOverviewProps {
  readonly context: FileReviewContext;
  readonly busy: boolean;
  readonly reviewAvailable: boolean;
  readonly onDownload?: (assetId: string) => Promise<void>;
  readonly onReview?: (
    state: DeliverableReviewState,
    note: string | undefined,
    release: boolean,
  ) => Promise<void>;
}

export function FileReviewOverview({
  context,
  busy,
  reviewAvailable,
  onDownload,
  onReview,
}: FileReviewOverviewProps) {
  const [note, setNote] = useState("");
  const { asset, family, versions } = context;
  const review = fileReviewPresentation(asset);

  function reviewAsset(state: DeliverableReviewState, release: boolean): void {
    void onReview?.(state, note.trim() || undefined, release);
  }

  const fields = [
    ["Speaker", context.speakerLabel],
    ["Session", context.sessionLabel],
    ["Request", context.taskLabel],
    ["Uploaded", formatFileTime(asset.createdAt)],
    ["File type", `${formatFileStatus(asset.kind)} · ${asset.contentType}`],
    ["Size", formatFileSize(asset.sizeBytes)],
    ["Version", `v${asset.version ?? 1} of ${versions.length}`],
    ["Review state", review.label],
  ] as const;

  return (
    <div className={styles.tabContent}>
      <div className={styles.fileHeading}>
        <div>
          <p className={styles.muted}>Private asset review</p>
          <h2>{asset.fileName}</h2>
          <p className={styles.muted}>
            Version {asset.version ?? 1} ·{" "}
            {family.currentVersion?.id === asset.id
              ? "Authoritative current"
              : family.latestVersion.id === asset.id
                ? "Latest upload"
                : "Prior version"}
          </p>
        </div>
        <div className={styles.badges}>
          {filePointerLabels(asset, versions).map((label) => (
            <Badge key={label} variant={label === "Released" ? "default" : "outline"}>
              {label}
            </Badge>
          ))}
        </div>
      </div>

      {family.currentVersion === undefined ? (
        <Alert>
          <AlertTitle>Current version unavailable</AlertTitle>
          <AlertDescription>
            This family remains visible, but no authoritative current version is available for ZIP
            export.
          </AlertDescription>
        </Alert>
      ) : null}

      <dl className={styles.overviewGrid}>
        {fields.map(([label, value]) => (
          <div className={styles.overviewItem} key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        {asset.reviewNote === undefined ? null : (
          <div className={styles.overviewItem}>
            <dt>Review note</dt>
            <dd>{asset.reviewNote}</dd>
          </div>
        )}
      </dl>

      <Button
        variant="outline"
        type="button"
        disabled={busy || onDownload === undefined}
        onClick={() => void onDownload?.(asset.id)}
      >
        {onDownload === undefined ? "Download unavailable" : "Download this version"}
      </Button>

      <section className={styles.reviewSection}>
        <h3>Review decision</h3>
        {reviewAvailable ? (
          <>
            <div className={styles.field}>
              <Label htmlFor="file-review-note">Review note (optional)</Label>
              <Textarea
                id="file-review-note"
                rows={3}
                value={note}
                onChange={(event) => setNote(event.currentTarget.value)}
              />
            </div>
            <p className={styles.muted}>
              Decisions apply to exact immutable asset v{asset.version ?? 1}.
            </p>
            <div className={styles.reviewActions}>
              <Button type="button" disabled={busy} onClick={() => reviewAsset("approved", false)}>
                Approve
              </Button>
              <Button
                variant="outline"
                type="button"
                disabled={busy}
                onClick={() => reviewAsset("approved", true)}
              >
                Approve and release
              </Button>
              <Button
                variant="outline"
                type="button"
                disabled={busy}
                onClick={() => reviewAsset("needs_changes", false)}
              >
                Needs changes
              </Button>
            </div>
          </>
        ) : (
          <p className={styles.muted}>
            Organizer asset review is unavailable because the endpoint is not provisioned.
          </p>
        )}
      </section>
    </div>
  );
}
