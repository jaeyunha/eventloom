"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import styles from "./file-library.module.css";
import { FileLibraryExport } from "./file-library-export";
import { FileLibraryFilters } from "./file-library-filters";
import { buildFileLibraryRows, filterFileLibraryRows } from "./file-library-model";
import { FileLibraryRows } from "./file-library-rows";
import type { FileLibraryProps, FileLibraryFilters as Filters } from "./file-library-types";

const initialFilters: Filters = {
  query: "",
  participantId: "all",
  sessionId: "all",
  reviewState: "all",
};

export function FileLibrary({
  organizationId,
  eventId,
  families,
  sessions,
  tasks,
  profiles,
  activeFamilyId,
  busy,
  loadFailed,
  onInspectAsset,
  onExport,
  onStartDownload,
  onRetry,
}: FileLibraryProps) {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [selectedFamilyIds, setSelectedFamilyIds] = useState<readonly string[]>([]);
  const rows = useMemo(
    () => buildFileLibraryRows(families, sessions, tasks, profiles),
    [families, profiles, sessions, tasks],
  );
  const visibleRows = useMemo(() => filterFileLibraryRows(rows, filters), [filters, rows]);

  useEffect(() => {
    const available = new Set(families.map((family) => family.familyId));
    setSelectedFamilyIds((current) => current.filter((familyId) => available.has(familyId)));
  }, [families]);

  function toggleFamily(familyId: string): void {
    setSelectedFamilyIds((current) =>
      current.includes(familyId)
        ? current.filter((candidate) => candidate !== familyId)
        : [...current, familyId],
    );
  }

  return (
    <Card className={styles.library} aria-labelledby="file-library-heading">
      <CardHeader className={styles.libraryHeader}>
        <div>
          <CardTitle id="file-library-heading">Review and download</CardTitle>
          <CardDescription>
            One row per file family, with immutable versions preserved in review.
          </CardDescription>
        </div>
        <Badge variant="outline">
          {families.length} uploaded file{families.length === 1 ? "" : "s"}
        </Badge>
      </CardHeader>

      <CardContent className={styles.libraryContent}>
        {loadFailed ? (
          <Alert variant="destructive">
            <AlertTitle>Uploaded files could not be loaded</AlertTitle>
            <AlertDescription>
              Speaker and file information is temporarily unavailable.
              {onRetry === undefined ? null : (
                <Button type="button" variant="outline" onClick={onRetry}>
                  Retry
                </Button>
              )}
            </AlertDescription>
          </Alert>
        ) : null}

        <FileLibraryFilters rows={rows} filters={filters} onChange={setFilters} />

        <FileLibraryExport
          rows={rows}
          selectedFamilyIds={selectedFamilyIds}
          busy={busy}
          onSelectionChange={setSelectedFamilyIds}
          {...(onExport === undefined ? {} : { onExport })}
          {...(onStartDownload === undefined ? {} : { onStartDownload })}
        />

        {!loadFailed && families.length === 0 ? (
          <div className={styles.emptyState}>
            <strong>No files have been submitted yet</strong>
            <p className={styles.muted}>
              Files appear here after speakers complete upload requests.
            </p>
            <Button asChild variant="outline">
              <Link
                href={`/admin/organizations/${encodeURIComponent(
                  organizationId,
                )}/events/${encodeURIComponent(eventId)}/deliverables`}
              >
                Create a content request
              </Link>
            </Button>
          </div>
        ) : (
          <FileLibraryRows
            rows={visibleRows}
            selectedFamilyIds={selectedFamilyIds}
            onToggleFamily={toggleFamily}
            {...(activeFamilyId === undefined ? {} : { activeFamilyId })}
            {...(onInspectAsset === undefined ? {} : { onInspectAsset })}
          />
        )}
      </CardContent>
    </Card>
  );
}
