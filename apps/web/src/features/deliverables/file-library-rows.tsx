"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import styles from "./file-library.module.css";
import { formatFileSize, formatFileStatus, formatFileTime } from "./file-library-model";
import type { FileLibraryRow } from "./file-library-types";

interface FileLibraryRowsProps {
  readonly rows: readonly FileLibraryRow[];
  readonly selectedFamilyIds: readonly string[];
  readonly activeFamilyId?: string | null;
  readonly onToggleFamily: (familyId: string) => void;
  readonly onInspectAsset?: (assetId: string) => void;
}

export function FileLibraryRows({
  rows,
  selectedFamilyIds,
  activeFamilyId,
  onToggleFamily,
  onInspectAsset,
}: FileLibraryRowsProps) {
  if (rows.length === 0) {
    return (
      <div className={styles.filteredEmpty}>
        <h3>No files match these filters</h3>
        <p className={styles.muted}>Adjust the filters to see uploaded files.</p>
      </div>
    );
  }
  const selectedFamilyIdSet = new Set(selectedFamilyIds);

  return (
    <div className={styles.listFrame}>
      <div aria-hidden="true" className={styles.columns}>
        <span className={styles.columnFile}>File</span>
        <span className={styles.columnContext}>Speaker / session</span>
        <span className={styles.columnUploaded}>Uploaded</span>
        <span className={styles.columnState}>Review state</span>
        <span className={styles.columnVersions}>Versions</span>
        <span className={styles.columnAction}>Action</span>
      </div>
      <ul className={styles.list}>
        {rows.map((row) => {
          const { family, asset } = row;
          const selectable = family.exportAssetId !== undefined;
          const checked = selectedFamilyIdSet.has(family.familyId);
          const inspectAssetId = family.currentVersion?.id ?? family.latestVersion.id;
          const checkboxId = `file-family-${encodeURIComponent(family.familyId)}`;

          return (
            <li
              key={family.familyId}
              data-file-family-row={family.familyId}
              data-current-version={family.currentVersion?.id}
            >
              <div
                className={styles.rowCard}
                data-state={activeFamilyId === family.familyId ? "selected" : undefined}
              >
                <Checkbox
                  aria-label={
                    selectable
                      ? `Select ready current file ${asset.fileName}`
                      : `Current file unavailable for ${asset.fileName}`
                  }
                  checked={checked}
                  disabled={!selectable}
                  id={checkboxId}
                  onCheckedChange={() => onToggleFamily(family.familyId)}
                />
                <button
                  className={styles.fileCell}
                  disabled={onInspectAsset === undefined}
                  type="button"
                  onClick={() => onInspectAsset?.(inspectAssetId)}
                >
                  <span className={styles.fileName}>{asset.fileName}</span>
                  <span className={styles.fileMeta}>
                    {formatFileStatus(asset.kind)} · {asset.contentType} ·{" "}
                    {formatFileSize(asset.sizeBytes)}
                  </span>
                </button>
                <div className={styles.contextCell}>
                  <span className={styles.speakerLabel}>{row.speakerLabel}</span>
                  <span className={styles.sessionLabel}>
                    {row.sessionLabel}
                    {row.taskLabel ? ` · ${row.taskLabel}` : ""}
                  </span>
                </div>
                <time className={styles.uploadedCell} dateTime={asset.createdAt}>
                  {formatFileTime(asset.createdAt)}
                </time>
                <span className={styles.stateCell}>
                  <Badge variant={asset.reviewState === "approved" ? "default" : "outline"}>
                    {row.reviewLabel}
                  </Badge>
                </span>
                <span className={styles.versionsCell}>
                  {family.currentVersion === undefined
                    ? "Current unavailable"
                    : `Current v${family.currentVersion.version ?? 1}`}{" "}
                  · {family.versions.length} version{family.versions.length === 1 ? "" : "s"}
                </span>
                <span className={styles.actionCell}>
                  <Button
                    className={styles.action}
                    disabled={onInspectAsset === undefined}
                    size="xs"
                    type="button"
                    variant="outline"
                    onClick={() => onInspectAsset?.(inspectAssetId)}
                  >
                    Review file
                  </Button>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
