"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import styles from "./file-library.module.css";
import {
  filePointerLabels,
  formatFileSize,
  formatFileStatus,
  formatFileTime,
} from "./file-library-model";
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
    return <p className={styles.muted}>No files match these filters.</p>;
  }
  const selectedFamilyIdSet = new Set(selectedFamilyIds);

  return (
    <div className={styles.tableFrame}>
      <Table className={styles.familyTable}>
        <TableCaption>One row per uploaded file family across every speaker</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Select</TableHead>
            <TableHead scope="col">File</TableHead>
            <TableHead scope="col">Speaker</TableHead>
            <TableHead scope="col">Session</TableHead>
            <TableHead scope="col">Uploaded</TableHead>
            <TableHead scope="col">Review state</TableHead>
            <TableHead scope="col">Versions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const { family, asset } = row;
            const selectable = family.exportAssetId !== undefined;
            const checked = selectedFamilyIdSet.has(family.familyId);
            const inspectAssetId = family.currentVersion?.id ?? family.latestVersion.id;
            const checkboxId = `file-family-${encodeURIComponent(family.familyId)}`;

            return (
              <TableRow
                key={family.familyId}
                data-file-family-row={family.familyId}
                data-current-version={family.currentVersion?.id}
                data-state={activeFamilyId === family.familyId ? "selected" : undefined}
              >
                <TableCell data-label="Select">
                  <Checkbox
                    id={checkboxId}
                    checked={checked}
                    disabled={!selectable}
                    onCheckedChange={() => onToggleFamily(family.familyId)}
                  />
                  <Label className="sr-only" htmlFor={checkboxId}>
                    {selectable
                      ? `Select ready current file ${asset.fileName}`
                      : `Current file unavailable for ${asset.fileName}`}
                  </Label>
                </TableCell>

                <TableCell data-label="File">
                  <Button
                    className={styles.fileButton}
                    variant="ghost"
                    type="button"
                    disabled={onInspectAsset === undefined}
                    onClick={() => onInspectAsset?.(inspectAssetId)}
                  >
                    {asset.fileName}
                  </Button>
                  <small className={styles.muted}>
                    {formatFileStatus(asset.kind)} · {asset.contentType} ·{" "}
                    {formatFileSize(asset.sizeBytes)}
                  </small>
                </TableCell>

                <TableCell data-label="Speaker">{row.speakerLabel}</TableCell>

                <TableCell data-label="Session">
                  {row.sessionLabel}
                  <small className={styles.muted}>{row.taskLabel}</small>
                </TableCell>

                <TableCell data-label="Uploaded">
                  <time dateTime={asset.createdAt}>{formatFileTime(asset.createdAt)}</time>
                </TableCell>

                <TableCell data-label="Review state">
                  <Badge variant={asset.reviewState === "approved" ? "default" : "outline"}>
                    {row.reviewLabel}
                  </Badge>
                </TableCell>

                <TableCell data-label="Versions">
                  <div className={styles.versionSummary}>
                    <div className={styles.badges}>
                      {filePointerLabels(asset, family.versions).map((label) => (
                        <Badge key={label} variant={label === "Released" ? "default" : "outline"}>
                          {label}
                        </Badge>
                      ))}
                    </div>
                    <strong>
                      {family.currentVersion === undefined
                        ? "Authoritative current version unavailable"
                        : `Authoritative current v${family.currentVersion.version ?? 1}`}{" "}
                      · {family.versions.length} version
                      {family.versions.length === 1 ? "" : "s"}
                    </strong>
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      disabled={onInspectAsset === undefined}
                      onClick={() => onInspectAsset?.(inspectAssetId)}
                    >
                      Review file
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
