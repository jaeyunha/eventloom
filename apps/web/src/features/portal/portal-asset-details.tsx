"use client";

import type { FormEvent } from "react";
import { Button, Input } from "@/components/ui";
import { MetadataList, MetadataRow, StatusBadge } from "@/components/workspace";
import {
  assetPointerLabels,
  portalFileStatus,
  portalReviewStatus,
  resolvePortalAssetFamily,
} from "./portal-assets";
import styles from "./portal-workspace.module.css";
import type { PortalAsset } from "./types";

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Unknown date"
    : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

export interface AssetDetailsProps {
  readonly asset: PortalAsset;
  readonly versions: readonly PortalAsset[];
  readonly comments?: readonly unknown[];
  readonly canComment?: boolean;
  readonly canCompleteUpload: boolean;
  readonly busy: boolean;
  readonly onRetryUpload: (file: File) => void;
  readonly onCompleteUpload: () => void;
  readonly onDownload: (asset: PortalAsset) => void;
  readonly commentDraft?: string;
  readonly onCommentDraftChange?: (value: string) => void;
  readonly onComment?: (event: FormEvent<HTMLFormElement>) => void;
}

export function AssetDetails({
  asset,
  versions,
  canCompleteUpload,
  busy,
  onRetryUpload,
  onCompleteUpload,
  onDownload,
}: AssetDetailsProps) {
  const resolution = resolvePortalAssetFamily(versions, asset);
  const retryInputId = `asset-retry-file-${asset.id}`;
  return (
    <div className={styles.stack}>
      <strong>Immutable versions</strong>
      <p className={styles.help}>
        Each upload remains downloadable; authoritative pointers determine the current version.
      </p>
      <ol className={styles.versionList}>
        {versions.map((version) => {
          const labels = assetPointerLabels(version, resolution.pointers);
          return (
            <li key={version.id}>
              <div className={styles.row}>
                <span>
                  Version {version.version ?? "?"} · {version.fileName}
                </span>
                <div className={styles.badges}>
                  <StatusBadge
                    tone={
                      version.state === "ready"
                        ? "success"
                        : version.state === "rejected"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {portalFileStatus(version)}
                  </StatusBadge>
                  {labels.map((label) => (
                    <StatusBadge key={label} tone="info">
                      {label}
                    </StatusBadge>
                  ))}
                </div>
              </div>
              <MetadataList>
                <MetadataRow label="Uploaded" value={formatDate(version.createdAt)} />
                <MetadataRow label="Review" value={portalReviewStatus(version)} />
              </MetadataList>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={version.state !== "ready" || busy}
                  onClick={() => onDownload(version)}
                >
                  Download version {version.version ?? "?"}
                </Button>
              </div>
            </li>
          );
        })}
      </ol>

      {resolution.pointers.status !== "ready" ? (
        <p className={styles.notice} role="status">
          Version status unavailable. Current-version actions remain disabled until authoritative
          pointer metadata is available.
        </p>
      ) : null}

      {canCompleteUpload && asset.state === "pending_upload" ? (
        <div className={styles.form}>
          <p className={styles.help}>
            Choose the same file to retry a failed or expired transfer. A successful retry is
            finalized automatically; event-team approval happens separately.
          </p>
          <label className={styles.field} htmlFor={retryInputId}>
            <span>Retry file upload</span>
            <Input
              id={retryInputId}
              type="file"
              disabled={busy}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) onRetryUpload(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <div>
            <Button type="button" disabled={busy} onClick={onCompleteUpload}>
              Mark upload complete
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
