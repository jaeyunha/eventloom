"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  return [
    ...new Map(
      rows.filter((row) => row[key].length > 0).map((row) => [row[key], row[label]] as const),
    ).entries(),
  ].sort((left, right) => left[1].localeCompare(right[1]));
}

export function FileLibraryFilters({ rows, filters, onChange }: FileLibraryFiltersProps) {
  const speakers = uniqueOptions(rows, "participantId", "speakerLabel");
  const sessions = uniqueOptions(rows, "sessionId", "sessionLabel");

  return (
    <fieldset className={styles.filters} aria-label="File filters">
      <div className={styles.field}>
        <Label htmlFor="files-filter-search">Search files</Label>
        <Input
          id="files-filter-search"
          value={filters.query}
          placeholder="Filename, speaker, session, or request"
          onChange={(event) => onChange({ ...filters, query: event.currentTarget.value })}
        />
      </div>

      <div className={styles.field}>
        <Label htmlFor="files-filter-speaker">Filter by speaker</Label>
        <Select
          value={filters.participantId}
          onValueChange={(participantId) => onChange({ ...filters, participantId })}
        >
          <SelectTrigger id="files-filter-speaker">
            <SelectValue placeholder="All speakers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All speakers</SelectItem>
            {speakers.map(([id, label]) => (
              <SelectItem key={id} value={id}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className={styles.field}>
        <Label htmlFor="files-filter-session">Filter by session</Label>
        <Select
          value={filters.sessionId}
          onValueChange={(sessionId) => onChange({ ...filters, sessionId })}
        >
          <SelectTrigger id="files-filter-session">
            <SelectValue placeholder="All sessions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sessions</SelectItem>
            {sessions.map(([id, label]) => (
              <SelectItem key={id} value={id}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className={styles.field}>
        <Label htmlFor="files-filter-review">Filter by review state</Label>
        <Select
          value={filters.reviewState}
          onValueChange={(reviewState) => onChange({ ...filters, reviewState })}
        >
          <SelectTrigger id="files-filter-review">
            <SelectValue placeholder="All review states" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All review states</SelectItem>
            <SelectItem value="pending">Pending review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="needs_changes">Needs changes</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </fieldset>
  );
}
