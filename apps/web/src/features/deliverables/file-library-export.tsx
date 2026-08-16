"use client";

import { useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DeliverableExportDownload, DeliverableExportInput } from "./api";
import { exportAssetIdsForFamilies } from "./file-family-model";
import styles from "./file-library.module.css";
import type { FileLibraryRow } from "./file-library-types";

type ExportState =
  | "idle"
  | "queued"
  | "preparing"
  | "generating"
  | "ready"
  | "download-started"
  | "failure";

const actionLabels: Readonly<Record<ExportState, string>> = {
  idle: "Download selected files ZIP",
  queued: "ZIP export queued",
  preparing: "Preparing ZIP…",
  generating: "Generating ZIP…",
  ready: "Inspect authoritative manifest",
  "download-started": "Download started",
  failure: "Retry ZIP export",
};

interface FileLibraryExportProps {
  readonly rows: readonly FileLibraryRow[];
  readonly selectedFamilyIds: readonly string[];
  readonly busy: boolean;
  readonly onSelectionChange: (familyIds: readonly string[]) => void;
  readonly onExport?: (
    input: DeliverableExportInput,
  ) => Promise<DeliverableExportDownload | undefined>;
  readonly onStartDownload?: (download: DeliverableExportDownload) => void;
}

export function FileLibraryExport({
  rows,
  selectedFamilyIds,
  busy,
  onSelectionChange,
  onExport,
  onStartDownload,
}: FileLibraryExportProps) {
  const [sessionId, setSessionId] = useState("all");
  const [state, setState] = useState<ExportState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [download, setDownload] = useState<DeliverableExportDownload | null>(null);

  const families = useMemo(() => rows.map((row) => row.family), [rows]);
  const assetIds = useMemo(
    () => exportAssetIdsForFamilies(families, selectedFamilyIds),
    [families, selectedFamilyIds],
  );
  const sessions = useMemo(
    () =>
      [
        ...new Map(
          rows
            .filter((row) => row.sessionId.length > 0 && row.family.exportAssetId !== undefined)
            .map((row) => [row.sessionId, row.sessionLabel]),
        ).entries(),
      ].sort((left, right) => left[1].localeCompare(right[1])),
    [rows],
  );
  const inFlight = state === "queued" || state === "preparing" || state === "generating";

  function selectSession(): void {
    if (sessionId === "all") return;
    const additions = rows
      .filter((row) => row.sessionId === sessionId && row.family.exportAssetId !== undefined)
      .map((row) => row.family.familyId);
    onSelectionChange([...new Set([...selectedFamilyIds, ...additions])]);
  }

  async function requestExport(): Promise<void> {
    if (onExport === undefined || assetIds.length === 0 || inFlight) return;

    setError(null);
    setDownload(null);
    setState("queued");
    await Promise.resolve();
    setState("preparing");

    try {
      setState("generating");
      const result = await onExport({ assetIds });
      if (result === undefined) {
        throw new Error("The ZIP export returned no download response.");
      }
      setDownload(result);
      setState("ready");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The authorized ZIP request failed.");
      setState("failure");
    }
  }

  function startDownload(): void {
    if (download === null || onStartDownload === undefined) return;
    try {
      onStartDownload(download);
      setDownload(null);
      setState("download-started");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The download could not start.");
      setState("failure");
    }
  }

  return (
    <div className={styles.exportSection}>
      <Alert>
        <AlertTitle>Download rules</AlertTitle>
        <AlertDescription>
          ZIP export includes only ready server-authoritative current versions. Newer uploads and
          prior versions remain available in file review.
        </AlertDescription>
      </Alert>

      <div className={styles.selectionBar}>
        <div className={styles.sessionSelection}>
          <Select value={sessionId} onValueChange={setSessionId}>
            <SelectTrigger id="files-session-selection" aria-label="Session for eligible files">
              <SelectValue placeholder="Choose a session" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Choose a session</SelectItem>
              {sessions.map(([id, label]) => (
                <SelectItem key={id} value={id}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            disabled={sessionId === "all"}
            onClick={selectSession}
          >
            Select approved files from a session
          </Button>
        </div>

        <div className={styles.selectionActions}>
          <span className={styles.muted}>
            {selectedFamilyIds.length} selected · {assetIds.length} exportable
          </span>
          <Button
            type="button"
            variant="ghost"
            disabled={selectedFamilyIds.length === 0}
            onClick={() => onSelectionChange([])}
          >
            Clear
          </Button>
          <Button
            type="button"
            disabled={
              busy ||
              inFlight ||
              state === "ready" ||
              onExport === undefined ||
              assetIds.length === 0
            }
            onClick={() => void requestExport()}
          >
            {actionLabels[state]}
          </Button>
        </div>
      </div>

      <p className={styles.muted}>
        {assetIds.length === 0
          ? "Only confirmed current files can be downloaded."
          : `${assetIds.length} authoritative current file${
              assetIds.length === 1 ? "" : "s"
            } selected for ZIP export.`}
      </p>

      {state !== "idle" ? (
        <Alert variant={state === "failure" ? "destructive" : "default"} data-export-status={state}>
          <AlertTitle>ZIP export request state: {state}</AlertTitle>
          <AlertDescription>
            {error ??
              (state === "ready"
                ? "The server returned a ZIP with a validated authoritative manifest."
                : actionLabels[state])}
          </AlertDescription>
        </Alert>
      ) : null}

      {state === "ready" && download !== null ? (
        <div className={styles.downloadReady}>
          <strong>
            {download.manifest.entries.length} authoritative manifest{" "}
            {download.manifest.entries.length === 1 ? "entry" : "entries"}
          </strong>
          <Button type="button" disabled={onStartDownload === undefined} onClick={startDownload}>
            Download validated ZIP
          </Button>
        </div>
      ) : null}
    </div>
  );
}
