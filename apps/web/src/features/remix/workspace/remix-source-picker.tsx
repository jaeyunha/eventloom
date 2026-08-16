import { LoaderCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RemixSourceRecord, RemixSourceType } from "../api";
import styles from "../remix-workspace.module.css";
import { sourceLabel } from "./remix-workspace-model";

interface RemixSourcePickerProps {
  readonly sourceType: RemixSourceType;
  readonly onSourceTypeChange: (value: RemixSourceType) => void;
  readonly search: string;
  readonly onSearchChange: (value: string) => void;
  readonly tagFilter: string;
  readonly onTagFilterChange: (value: string) => void;
  readonly trackFilter: string;
  readonly onTrackFilterChange: (value: string) => void;
  readonly records: readonly RemixSourceRecord[];
  readonly selectedSourceIds: readonly string[];
  readonly onToggleSource: (sourceId: string) => void;
  readonly loading: boolean;
  readonly error: string | null;
}

export function RemixSourcePicker({
  sourceType,
  onSourceTypeChange,
  search,
  onSearchChange,
  tagFilter,
  onTagFilterChange,
  trackFilter,
  onTrackFilterChange,
  records,
  selectedSourceIds,
  onToggleSource,
  loading,
  error,
}: RemixSourcePickerProps) {
  return (
    <section className={styles.composerSection} aria-labelledby="remix-content-heading">
      <header className={styles.sectionHeading}>
        <span className={styles.stepLabel}>1 · Content</span>
        <h3 id="remix-content-heading">What should be rewritten?</h3>
        <p>Select one or more sessions or speaker profiles from this event.</p>
      </header>
      <FieldGroup>
        <div className={styles.controlGrid}>
          <Field>
            <FieldLabel htmlFor="remix-source-type">Content type</FieldLabel>
            <Select value={sourceType} onValueChange={onSourceTypeChange}>
              <SelectTrigger id="remix-source-type" className={styles.selectTrigger}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="session">Sessions</SelectItem>
                  <SelectItem value="speaker">Speakers</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="remix-record-search">Search</FieldLabel>
            <Input
              id="remix-record-search"
              type="search"
              value={search}
              onChange={(event) => onSearchChange(event.currentTarget.value)}
              placeholder={
                sourceType === "session" ? "Search titles or descriptions" : "Search biographies"
              }
            />
          </Field>
        </div>
        {sourceType === "session" ? (
          <div className={styles.controlGrid}>
            <Field>
              <FieldLabel htmlFor="remix-tag-filter">Tags</FieldLabel>
              <Input
                id="remix-tag-filter"
                value={tagFilter}
                onChange={(event) => onTagFilterChange(event.currentTarget.value)}
                placeholder="design, operations"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="remix-track-filter">Tracks</FieldLabel>
              <Input
                id="remix-track-filter"
                value={trackFilter}
                onChange={(event) => onTrackFilterChange(event.currentTarget.value)}
                placeholder="Civic technology"
              />
            </Field>
          </div>
        ) : null}
      </FieldGroup>
      {loading ? (
        <p className={styles.loadingState} role="status">
          <LoaderCircle aria-hidden="true" /> Loading event content…
        </p>
      ) : null}
      {error !== null ? (
        <Alert variant="destructive">
          <AlertTitle>Content is unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <FieldSet className={styles.sourceList}>
        <FieldLegend variant="label">
          {sourceType === "session" ? "Sessions" : "Speaker profiles"}
        </FieldLegend>
        {records.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No matching content</EmptyTitle>
              <EmptyDescription>
                Adjust the search or filters to see available records.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul>
            {records.map((record) => {
              const detail =
                record.kind === "session"
                  ? record.description.trim() || "No description"
                  : "Speaker biography";
              return (
                <li key={record.id}>
                  <FieldLabel className={styles.sourceItem} htmlFor={`remix-source-${record.id}`}>
                    <Checkbox
                      id={`remix-source-${record.id}`}
                      checked={selectedSourceIds.includes(record.id)}
                      onCheckedChange={(checked) => {
                        if (checked === true || checked === false) onToggleSource(record.id);
                      }}
                    />
                    <span className={styles.sourceCopy}>
                      <strong>{sourceLabel(record)}</strong>
                      <span>{detail}</span>
                    </span>
                  </FieldLabel>
                </li>
              );
            })}
          </ul>
        )}
      </FieldSet>
    </section>
  );
}
