"use client";

import { ListFilter } from "lucide-react";
import { Popover } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import styles from "./file-library.module.css";
import type {
  FileLibraryFilters as FileLibraryFilterState,
  FileLibraryRow,
} from "./file-library-types";

interface FileLibraryFiltersProps {
  readonly rows: readonly FileLibraryRow[];
  readonly filters: FileLibraryFilterState;
  readonly onChange: (filters: FileLibraryFilterState) => void;
}

function uniqueOptions(
  rows: readonly FileLibraryRow[],
  key: "participantId" | "sessionId",
  label: "speakerLabel" | "sessionLabel",
): readonly (readonly [string, string])[] {
  const optionsByValue = new Map<string, string>();
  for (const row of rows) {
    if (row[key].length > 0) {
      optionsByValue.set(row[key], row[label]);
    }
  }
  return [...optionsByValue.entries()].sort((left, right) => left[1].localeCompare(right[1]));
}

export function FileLibraryFilters({ rows, filters, onChange }: FileLibraryFiltersProps) {
  const speakers = uniqueOptions(rows, "participantId", "speakerLabel");
  const sessions = uniqueOptions(rows, "sessionId", "sessionLabel");
  const activeFilterCount =
    (filters.query.trim().length > 0 ? 1 : 0) +
    (filters.participantId === "all" ? 0 : 1) +
    (filters.sessionId === "all" ? 0 : 1) +
    (filters.reviewState === "all" ? 0 : 1);
  const filtersActive = activeFilterCount > 0;
  const filterLabel = filtersActive
    ? `Filter uploaded files, ${activeFilterCount} active`
    : "Filter uploaded files";
  const clearFilters = () =>
    onChange({ query: "", participantId: "all", sessionId: "all", reviewState: "all" });

  return (
    <div className={styles.controls}>
      <Input
        aria-label="Search files"
        className={styles.searchInput}
        placeholder="Search files"
        value={filters.query}
        onChange={(event) => onChange({ ...filters, query: event.currentTarget.value })}
      />
      <Popover.Root>
        <Popover.Trigger asChild>
          <Button
            aria-label={filterLabel}
            className={styles.filterTrigger}
            size="icon-sm"
            title={filterLabel}
            type="button"
            variant="outline"
          >
            <ListFilter aria-hidden="true" />
            {activeFilterCount > 0 ? (
              <span aria-hidden="true" className={styles.filterActiveCount}>
                {activeFilterCount}
              </span>
            ) : null}
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            aria-label="File filters"
            className={styles.filterPopover}
            sideOffset={8}
          >
            <div className={styles.filterPopoverHeader}>
              <strong>Filters</strong>
              {filtersActive ? (
                <Button size="xs" type="button" variant="ghost" onClick={clearFilters}>
                  Clear
                </Button>
              ) : null}
            </div>
            <fieldset className={styles.filterMenu}>
              <legend className="sr-only">Uploaded file filters</legend>
              <label className={styles.filterRow}>
                <span>Speaker</span>
                <select
                  aria-label="Speaker"
                  value={filters.participantId}
                  onChange={(event) => onChange({ ...filters, participantId: event.target.value })}
                >
                  <option value="all">All</option>
                  {speakers.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.filterRow}>
                <span>Session</span>
                <select
                  aria-label="Session"
                  value={filters.sessionId}
                  onChange={(event) => onChange({ ...filters, sessionId: event.target.value })}
                >
                  <option value="all">All</option>
                  {sessions.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.filterRow}>
                <span>Review state</span>
                <select
                  aria-label="Review state"
                  value={filters.reviewState}
                  onChange={(event) => onChange({ ...filters, reviewState: event.target.value })}
                >
                  <option value="all">All</option>
                  <option value="pending">Pending review</option>
                  <option value="approved">Approved</option>
                  <option value="needs_changes">Needs changes</option>
                </select>
              </label>
            </fieldset>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
