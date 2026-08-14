"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  filePointerLabels,
  formatFileSize,
  formatFileStatus,
  formatFileTime,
} from "./file-library-model";
import type { FileReviewContext } from "./file-review-types";
import styles from "./file-library.module.css";

interface FileReviewVersionsProps {
  readonly context: FileReviewContext;
  readonly loading: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onSelectVersion?: (assetId: string) => void;
  readonly onDownload?: (assetId: string) => Promise<void>;
}

export function FileReviewVersions({
  context,
  loading,
  busy,
  error,
  onSelectVersion,
  onDownload,
}: FileReviewVersionsProps) {
  return (
    <div className={styles.tabContent}>
      <div>
        <h3>Immutable version history</h3>
        <p className={styles.muted}>
          Current, latest, approved, and released are separate server-owned pointers.
        </p>
      </div>

      {error !== null ? (
        <Alert variant="destructive">
          <AlertTitle>Version history unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : context.versions.length === 0 ? (
        <p className={styles.muted}>
          {loading ? "Loading immutable versions…" : "No version history was returned."}
        </p>
      ) : (
        <ol className={styles.versionList}>
          {context.versions.map((version) => {
            const active = version.id === context.asset.id;
            return (
              <li className={styles.versionCard} data-active={active} key={version.id}>
                <div className={styles.versionMeta}>
                  <strong>
                    v{version.version ?? 1} · {version.fileName}
                  </strong>
                  <div className={styles.badges}>
                    {filePointerLabels(version, context.versions).map((label) => (
                      <Badge key={label} variant={label === "Released" ? "default" : "outline"}>
                        {label}
                      </Badge>
                    ))}
                  </div>
                  <p className={styles.muted}>
                    {formatFileTime(version.createdAt)} · {formatFileStatus(version.state)} ·{" "}
                    {formatFileSize(version.sizeBytes)}
                  </p>
                </div>

                <div className={styles.versionActions}>
                  <Button
                    variant={active ? "secondary" : "outline"}
                    size="sm"
                    type="button"
                    disabled={active || onSelectVersion === undefined}
                    onClick={() => onSelectVersion?.(version.id)}
                  >
                    {active ? "Reviewing" : "Review version"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    disabled={busy || onDownload === undefined}
                    onClick={() => void onDownload?.(version.id)}
                  >
                    Download
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
