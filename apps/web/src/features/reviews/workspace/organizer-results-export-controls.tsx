"use client";

import { Button } from "../../../components/ui/button";
import styles from "../review-workspace.module.css";
import type { OrganizerResultsExportRun } from "./organizer-results-export";

export interface OrganizerResultsExportControlsProps {
  readonly run: OrganizerResultsExportRun | null;
  readonly creating?: boolean;
  readonly requestError: string | null;
  readonly onExport: () => void;
}

export function OrganizerResultsExportControls({
  run,
  creating = false,
  requestError,
  onExport,
}: OrganizerResultsExportControlsProps) {
  const pending = creating || run?.status === "queued" || run?.status === "running";
  const failed = requestError !== null || run?.status === "failed";
  const blocked = creating || (pending && requestError === null);
  const state = requestError !== null ? "failed" : creating ? "creating" : (run?.status ?? "idle");
  const failureMessage = requestError ?? (run?.status === "failed" ? run.error.message : null);

  return (
    <div
      className={`${styles.viewToolbar} ${styles.resultsExportControls}`}
      data-export-state={state}
    >
      <Button
        size="sm"
        type="button"
        variant="outline"
        onClick={onExport}
        disabled={blocked}
        aria-busy={blocked}
        data-export-action={failed ? "retry" : "start"}
      >
        {blocked ? "Preparing CSV" : failed ? "Retry CSV export" : "Export CSV"}
      </Button>
      {blocked ? (
        <p className={styles.fieldHint} role="status">
          Preparing {run?.fileName ?? "evaluation results CSV"}.
        </p>
      ) : null}
      {run?.status === "ready" ? (
        <>
          <p className={styles.fieldHint} role="status">
            CSV export ready.
          </p>
          <Button asChild size="sm">
            <a href={run.downloadUrl} download={run.fileName} data-export-action="download">
              Download CSV
            </a>
          </Button>
        </>
      ) : null}
      {failureMessage === null ? null : (
        <p className={styles.formError} role="alert">
          {failureMessage}
        </p>
      )}
    </div>
  );
}
