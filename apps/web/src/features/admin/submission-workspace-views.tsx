"use client";

import { ListFilter, Search, X } from "lucide-react";
import Link from "next/link";
import { Popover } from "radix-ui";
import { type FormEvent, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  WorkspaceBreadcrumb,
  WorkspaceHeader,
  WorkspaceMetaItem,
  StatusBadge as WorkspaceStatusBadge,
} from "@/components/workspace/workspace-ui";
import { SubmissionDetailDrawer } from "./submission-detail-drawer";
import styles from "./submission-workspace.module.css";
import {
  answerText,
  DECISION_COMMITTED_WITHOUT_DELIVERY_MESSAGE,
  createEvaluationDecisionAttempt,
  decisionAttemptMatches,
  decisionNotificationSummary,
  reconcileEvaluationDecisionFailure,
  type EvaluationDecisionAttempt,
  type EvaluationDecisionRecord,
  type EvaluationDecisionStatus,
  evaluationRequest,
  formatDateTime,
  getAcceptedHandoffMetadata,
  loadOrganizerEvaluationDecision,
  type ReviewAssignment,
  type ReviewDataState,
  reviewDataIsReady,
  reviewDataMessage,
  type SubmissionListState,
  type SubmissionLoadFailure,
  type SubmissionRecord,
  type SubmissionSortDirection,
  type SubmissionSortKey,
  type SubmissionStatus,
  type SubmittedReviewReadState,
  submissionListHref,
  submissionStatusLabels,
} from "./submission-workspace-model";

const reviewStatusLabels: Record<ReviewAssignment["status"], string> = {
  complete: "Complete",
  in_progress: "In progress",
  not_started: "Not started",
  abstained: "Abstained",
};

const sortLabels: Record<SubmissionSortKey, string> = {
  title: "Title",
  status: "Status",
  updatedAt: "Last updated",
};

const SUBMISSION_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const decisionAttemptByScope = new Map<string, EvaluationDecisionAttempt>();
const ambiguousDecisionScopes = new Set<string>();

function decisionAttemptScope(baseUrl: string, submission: SubmissionRecord): string {
  return `${baseUrl}\u0000${submission.eventId}\u0000${submission.evaluationPlanId ?? ""}\u0000${submission.id}`;
}

function submissionHref(eventId: string, submissionId: string, organizationId: string): string {
  return `${submissionListHref(eventId, organizationId)}/${encodeURIComponent(submissionId)}`;
}

function formatDate(value: string): string {
  return SUBMISSION_DATE_FORMATTER.format(new Date(value));
}

function initials(name: string): string {
  return name
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toLocaleUpperCase();
}

function submissionStatusTone(
  status: SubmissionStatus,
): "neutral" | "info" | "success" | "warning" | "danger" {
  switch (status) {
    case "accepted":
      return "success";
    case "declined":
    case "withdrawn":
      return "danger";
    case "waitlisted":
    case "reopened":
      return "warning";
    case "under_review":
    case "submitted":
      return "info";
    case "draft":
      return "neutral";
  }
}

function StatusBadge({ status }: Readonly<{ status: SubmissionStatus }>) {
  return (
    <WorkspaceStatusBadge tone={submissionStatusTone(status)}>
      {submissionStatusLabels[status]}
    </WorkspaceStatusBadge>
  );
}

function ProgressMeter({
  completed,
  total,
  label,
}: Readonly<{ completed: number; total: number; label: string }>) {
  const value = total === 0 ? 0 : Math.round((completed / total) * 100);
  return (
    <span className={styles.progressCell}>
      <span className={styles.progressText}>
        {completed}/{total}
      </span>
      <span
        className={styles.progressTrack}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completed}
      >
        <span className={styles.progressFill} style={{ width: `${value}%` }} />
      </span>
    </span>
  );
}

export function ReviewDataNotice({
  state,
  onRetry,
  setupHref,
}: Readonly<{ state: ReviewDataState; onRetry: () => void; setupHref?: string }>) {
  if (state.status === "ready" || state.status === "pending") return null;
  if (state.status === "no_plan") {
    return (
      <div className={styles.reviewPlanNotice} role="status">
        <div className={styles.reviewPlanNoticeCopy}>
          <strong>Review plan not set up</strong>
          <p>{state.message} Review progress will appear after the plan is created.</p>
        </div>
        {setupHref === undefined ? null : (
          <Button asChild size="sm" variant="outline">
            <Link href={setupHref}>Set up review plan</Link>
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className={styles.auditCallout} role="alert">
      <p>{state.message}</p>
      <Button type="button" variant="outline" onClick={onRetry}>
        Retry review data
      </Button>
    </div>
  );
}

type SubmissionListViewProps = Readonly<{
  eventId: string;
  organizationId: string;
  selectedSubmissionId: string | undefined;
  eventName: string;
  eventSlug: string | null;
  submissions: SubmissionRecord[];
  filteredSubmissions: SubmissionRecord[];
  loadFailure: SubmissionLoadFailure | null;
  evaluationLoadState: ReviewDataState;
  listState: SubmissionListState;
  search: string;
  status: SubmissionStatus | "all";
  track: string;
  format: string;
  sortKey: SubmissionSortKey;
  sortDirection: SubmissionSortDirection;
  tracks: string[];
  formats: string[];
  selected: ReadonlySet<string>;
  selectedVisibleCount: number;
  filtersActive: boolean;
  allVisibleSelected: boolean;
  onSearchChange: (search: string) => void;
  onStatusChange: (status: SubmissionStatus | "all") => void;
  onTrackChange: (track: string) => void;
  onFormatChange: (format: string) => void;
  onClearFilters: () => void;
  onSort: (sortKey: SubmissionSortKey) => void;
  onToggleSelected: (id: string) => void;
  onToggleAllVisible: () => void;
  onRetry: () => void;
  detailPanel: ReactNode;
}>;

export function SubmissionListView({
  eventId,
  organizationId,
  selectedSubmissionId,
  eventName,
  eventSlug,
  submissions,
  filteredSubmissions,
  loadFailure,
  evaluationLoadState,
  listState,
  search,
  status,
  track,
  format,
  sortKey,
  sortDirection,
  tracks,
  formats,
  selected,
  selectedVisibleCount,
  filtersActive,
  allVisibleSelected,
  onSearchChange,
  onStatusChange,
  onTrackChange,
  onFormatChange,
  onClearFilters,
  onSort,
  onToggleSelected,
  onToggleAllVisible,
  onRetry,
  detailPanel,
}: SubmissionListViewProps) {
  const selectedSubmission =
    selectedSubmissionId === undefined
      ? undefined
      : submissions.find((submission) => submission.id === selectedSubmissionId);
  const acceptedSubmissionCount = submissions.filter(
    (submission) => submission.status === "accepted",
  ).length;
  const awaitingDecisionCount = submissions.filter(
    (submission) => submission.status === "submitted" || submission.status === "under_review",
  ).length;

  return (
    <div className={styles.workspaceRoot}>
      <a className={styles.skipLink} href="#submission-list-content">
        Skip to submissions
      </a>
      <SubmissionWorkspaceHeader
        eventId={eventId}
        organizationId={organizationId}
        eventName={eventName}
        eventSlug={eventSlug}
        listState={listState}
        submissionCount={submissions.length}
        acceptedSubmissionCount={acceptedSubmissionCount}
        awaitingDecisionCount={awaitingDecisionCount}
        visibleCount={filteredSubmissions.length}
      />
      <div
        id="submission-list-content"
        className={styles.workspaceMain}
        data-layout="submission-review-desk"
        tabIndex={-1}
      >
        <div className={styles.reviewDesk}>
          <SubmissionQueue
            eventId={eventId}
            organizationId={organizationId}
            selectedSubmissionId={selectedSubmissionId}
            eventName={eventName}
            eventSlug={eventSlug}
            submissions={submissions}
            filteredSubmissions={filteredSubmissions}
            loadFailure={loadFailure}
            evaluationLoadState={evaluationLoadState}
            listState={listState}
            search={search}
            status={status}
            track={track}
            format={format}
            sortKey={sortKey}
            sortDirection={sortDirection}
            tracks={tracks}
            formats={formats}
            selected={selected}
            selectedVisibleCount={selectedVisibleCount}
            filtersActive={filtersActive}
            allVisibleSelected={allVisibleSelected}
            onSearchChange={onSearchChange}
            onStatusChange={onStatusChange}
            onTrackChange={onTrackChange}
            onFormatChange={onFormatChange}
            onClearFilters={onClearFilters}
            onSort={onSort}
            onToggleSelected={onToggleSelected}
            onToggleAllVisible={onToggleAllVisible}
            onRetry={onRetry}
          />
          <SubmissionDetailOverlay
            eventId={eventId}
            organizationId={organizationId}
            selectedSubmissionId={selectedSubmissionId}
            selectedSubmission={selectedSubmission}
            detailPanel={detailPanel}
          />
        </div>
      </div>
    </div>
  );
}

type SubmissionQueueProps = Omit<SubmissionListViewProps, "detailPanel">;

function SubmissionWorkspaceHeader({
  eventId,
  organizationId,
  eventName,
  eventSlug,
  listState,
  submissionCount,
  acceptedSubmissionCount,
  awaitingDecisionCount,
  visibleCount,
}: Readonly<{
  eventId: string;
  organizationId: string;
  eventName: string;
  eventSlug: string | null;
  listState: SubmissionListState;
  submissionCount: number;
  acceptedSubmissionCount: number;
  awaitingDecisionCount: number;
  visibleCount: number;
}>) {
  const cfpConfigurationHref = `/admin/organizations/${encodeURIComponent(
    organizationId,
  )}/events/${encodeURIComponent(eventId)}/cfp`;

  return (
    <WorkspaceHeader
      breadcrumb={
        <WorkspaceBreadcrumb>
          <span>{eventName}</span>
          <span>/</span>
          <strong>Submissions</strong>
        </WorkspaceBreadcrumb>
      }
      title="Submissions"
      status={<WorkspaceStatusBadge>{submissionCount} total</WorkspaceStatusBadge>}
      description="Move proposals from intake through review and a final organizer decision."
      metadata={
        <>
          <WorkspaceMetaItem>{visibleCount} in this view</WorkspaceMetaItem>
          <WorkspaceMetaItem>{acceptedSubmissionCount} accepted</WorkspaceMetaItem>
          <WorkspaceMetaItem>{awaitingDecisionCount} awaiting decision</WorkspaceMetaItem>
        </>
      }
      actions={
        <>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/events">Back to events</Link>
          </Button>
          {listState === "unconfigured" ? (
            <Button asChild size="sm">
              <Link href={cfpConfigurationHref}>Configure CFP</Link>
            </Button>
          ) : eventSlug !== null ? (
            <Button asChild size="sm">
              <Link
                href={`/cfp/organizations/${encodeURIComponent(organizationId ?? "local-organization")}/events/${encodeURIComponent(eventSlug)}`}
              >
                Open CFP
              </Link>
            </Button>
          ) : null}
        </>
      }
    />
  );
}

function SubmissionQueue({
  eventId,
  organizationId,
  selectedSubmissionId,
  eventName,
  eventSlug,
  submissions,
  filteredSubmissions,
  loadFailure,
  evaluationLoadState,
  listState,
  search,
  status,
  track,
  format,
  sortKey,
  sortDirection,
  tracks,
  formats,
  selected,
  selectedVisibleCount,
  filtersActive,
  allVisibleSelected,
  onSearchChange,
  onStatusChange,
  onTrackChange,
  onFormatChange,
  onClearFilters,
  onSort,
  onToggleSelected,
  onToggleAllVisible,
  onRetry,
}: SubmissionQueueProps) {
  const queueContent =
    submissions.length > 0 ? (
      <SubmissionQueueLoaded
        eventId={eventId}
        organizationId={organizationId}
        selectedSubmissionId={selectedSubmissionId}
        eventName={eventName}
        eventSlug={eventSlug}
        submissions={submissions}
        filteredSubmissions={filteredSubmissions}
        loadFailure={loadFailure}
        evaluationLoadState={evaluationLoadState}
        listState={listState}
        search={search}
        status={status}
        track={track}
        format={format}
        sortKey={sortKey}
        sortDirection={sortDirection}
        tracks={tracks}
        formats={formats}
        selected={selected}
        selectedVisibleCount={selectedVisibleCount}
        filtersActive={filtersActive}
        allVisibleSelected={allVisibleSelected}
        onSearchChange={onSearchChange}
        onStatusChange={onStatusChange}
        onTrackChange={onTrackChange}
        onFormatChange={onFormatChange}
        onClearFilters={onClearFilters}
        onSort={onSort}
        onToggleSelected={onToggleSelected}
        onToggleAllVisible={onToggleAllVisible}
        onRetry={onRetry}
      />
    ) : (
      <SubmissionQueueEmpty
        eventName={eventName}
        listState={listState}
        loadFailure={loadFailure}
        onRetry={onRetry}
      />
    );

  return (
    <section
      id="submission-list-card"
      className={styles.listPanel}
      aria-labelledby="submission-table-heading"
      data-submission-collection="true"
    >
      <h2 id="submission-table-heading" className={styles.srOnly}>
        {submissions.length === 0 ? "Submission inbox" : "Submission queue"}
      </h2>
      {queueContent}
    </section>
  );
}

function SubmissionQueueLoaded({
  submissions,
  evaluationLoadState,
  eventSlug,
  organizationId,
  search,
  status,
  track,
  format,
  tracks,
  formats,
  filtersActive,
  selectedVisibleCount,
  onSearchChange,
  onStatusChange,
  onTrackChange,
  onFormatChange,
  onClearFilters,
  listState,
  loadFailure,
  eventName,
  eventId,
  selectedSubmissionId,
  filteredSubmissions,
  sortKey,
  sortDirection,
  selected,
  allVisibleSelected,
  onSort,
  onToggleSelected,
  onToggleAllVisible,
  onRetry,
}: SubmissionQueueProps) {
  return (
    <div className={styles.listContent}>
      <ReviewDataNotice
        state={evaluationLoadState}
        onRetry={onRetry}
        {...(eventSlug === null
          ? {}
          : {
              setupHref: `/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventSlug)}/reviews`,
            })}
      />
      <SubmissionQueueToolbar
        search={search}
        status={status}
        track={track}
        format={format}
        tracks={tracks}
        formats={formats}
        filtersActive={filtersActive}
        selectedVisibleCount={selectedVisibleCount}
        visibleCount={filteredSubmissions.length}
        submissionCount={submissions.length}
        onSearchChange={onSearchChange}
        onStatusChange={onStatusChange}
        onTrackChange={onTrackChange}
        onFormatChange={onFormatChange}
        onClearFilters={onClearFilters}
      />
      <SubmissionQueueState
        listState={listState}
        loadFailure={loadFailure}
        eventName={eventName}
        eventId={eventId}
        organizationId={organizationId}
        selectedSubmissionId={selectedSubmissionId}
        filteredSubmissions={filteredSubmissions}
        sortKey={sortKey}
        sortDirection={sortDirection}
        selected={selected}
        selectedVisibleCount={selectedVisibleCount}
        allVisibleSelected={allVisibleSelected}
        onSort={onSort}
        onToggleSelected={onToggleSelected}
        onToggleAllVisible={onToggleAllVisible}
        onClearFilters={onClearFilters}
        onRetry={onRetry}
      />
    </div>
  );
}

function SubmissionQueueToolbar({
  search,
  status,
  track,
  format,
  tracks,
  formats,
  filtersActive,
  selectedVisibleCount,
  visibleCount,
  submissionCount,
  onSearchChange,
  onStatusChange,
  onTrackChange,
  onFormatChange,
  onClearFilters,
}: Readonly<{
  search: string;
  status: SubmissionStatus | "all";
  track: string;
  format: string;
  tracks: string[];
  formats: string[];
  filtersActive: boolean;
  selectedVisibleCount: number;
  visibleCount: number;
  submissionCount: number;
  onSearchChange: (search: string) => void;
  onStatusChange: (status: SubmissionStatus | "all") => void;
  onTrackChange: (track: string) => void;
  onFormatChange: (format: string) => void;
  onClearFilters: () => void;
}>) {
  return (
    <div className={styles.toolbar}>
      <p className={styles.collectionCount} aria-live="polite">
        <span>
          {visibleCount} of {submissionCount}
        </span>
        {selectedVisibleCount > 0 ? <strong>{selectedVisibleCount} selected</strong> : null}
      </p>
      <div className={styles.toolbarControls}>
        <SubmissionSearchField search={search} onSearchChange={onSearchChange} />
        <SubmissionFilterPopover
          status={status}
          track={track}
          format={format}
          tracks={tracks}
          formats={formats}
          filtersActive={filtersActive}
          onStatusChange={onStatusChange}
          onTrackChange={onTrackChange}
          onFormatChange={onFormatChange}
          onClearFilters={onClearFilters}
        />
      </div>
    </div>
  );
}

function SubmissionSearchField({
  search,
  onSearchChange,
}: Readonly<{
  search: string;
  onSearchChange: (search: string) => void;
}>) {
  return (
    <div className={styles.toolbarSearch}>
      <Search aria-hidden="true" />
      <label className={styles.srOnly} htmlFor="submission-search">
        Search submissions
      </label>
      <Input
        id="submission-search"
        type="search"
        value={search}
        placeholder="Search submissions"
        onChange={(event) => onSearchChange(event.currentTarget.value)}
      />
      {search.length > 0 ? (
        <Button
          className={styles.clearSearch}
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Clear submission search"
          onClick={() => onSearchChange("")}
        >
          <X aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}

function SubmissionFilterPopover({
  status,
  track,
  format,
  tracks,
  formats,
  filtersActive,
  onStatusChange,
  onTrackChange,
  onFormatChange,
  onClearFilters,
}: Readonly<{
  status: SubmissionStatus | "all";
  track: string;
  format: string;
  tracks: string[];
  formats: string[];
  filtersActive: boolean;
  onStatusChange: (status: SubmissionStatus | "all") => void;
  onTrackChange: (track: string) => void;
  onFormatChange: (format: string) => void;
  onClearFilters: () => void;
}>) {
  const activeFilterCount =
    (status === "all" ? 0 : 1) + (track === "all" ? 0 : 1) + (format === "all" ? 0 : 1);

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button
          className={styles.filterTrigger}
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={
            activeFilterCount > 0
              ? `Filter submissions, ${activeFilterCount} active`
              : "Filter submissions"
          }
          title={
            activeFilterCount > 0
              ? `Filter submissions, ${activeFilterCount} active`
              : "Filter submissions"
          }
        >
          <ListFilter aria-hidden="true" />
          {activeFilterCount > 0 ? (
            <span className={styles.filterActiveCount} aria-hidden="true">
              {activeFilterCount}
            </span>
          ) : null}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          aria-label="Submission filters"
          className={styles.filterPopover}
          sideOffset={8}
        >
          <div className={styles.filterPopoverHeader}>
            <strong>Filters</strong>
            {filtersActive ? (
              <Button type="button" variant="ghost" size="xs" onClick={onClearFilters}>
                Clear
              </Button>
            ) : null}
          </div>
          <SubmissionFilterFields
            status={status}
            track={track}
            format={format}
            tracks={tracks}
            formats={formats}
            onStatusChange={onStatusChange}
            onTrackChange={onTrackChange}
            onFormatChange={onFormatChange}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function SubmissionFilterFields({
  status,
  track,
  format,
  tracks,
  formats,
  onStatusChange,
  onTrackChange,
  onFormatChange,
}: Readonly<{
  status: SubmissionStatus | "all";
  track: string;
  format: string;
  tracks: string[];
  formats: string[];
  onStatusChange: (status: SubmissionStatus | "all") => void;
  onTrackChange: (track: string) => void;
  onFormatChange: (format: string) => void;
}>) {
  return (
    <fieldset className={styles.filterMenu}>
      <legend className={styles.srOnly}>Filter submissions</legend>
      <SubmissionFilterField
        id="submission-status"
        label="Status"
        value={status}
        placeholder="All statuses"
        options={[
          { value: "all", label: "All statuses" },
          ...Object.entries(submissionStatusLabels).map(([value, label]) => ({ value, label })),
        ]}
        onValueChange={(value) => onStatusChange(value as SubmissionStatus | "all")}
      />
      <SubmissionFilterField
        id="submission-track"
        label="Track"
        value={track}
        placeholder="All tracks"
        options={[
          { value: "all", label: "All tracks" },
          ...tracks.map((value) => ({ value, label: value })),
        ]}
        onValueChange={onTrackChange}
      />
      <SubmissionFilterField
        id="submission-format"
        label="Format"
        value={format}
        placeholder="All formats"
        options={[
          { value: "all", label: "All formats" },
          ...formats.map((value) => ({ value, label: value })),
        ]}
        onValueChange={onFormatChange}
      />
    </fieldset>
  );
}

function SubmissionFilterField({
  id,
  label,
  value,
  placeholder,
  options,
  onValueChange,
}: Readonly<{
  id: string;
  label: string;
  value: string;
  placeholder: string;
  options: readonly { value: string; label: string }[];
  onValueChange: (value: string) => void;
}>) {
  return (
    <div className={styles.filterRow}>
      <label htmlFor={id}>{label}</label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id} className={styles.filterSelectTrigger}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

type SubmissionQueueStateProps = Pick<
  SubmissionQueueProps,
  | "eventName"
  | "eventId"
  | "organizationId"
  | "selectedSubmissionId"
  | "filteredSubmissions"
  | "listState"
  | "loadFailure"
  | "sortKey"
  | "sortDirection"
  | "selected"
  | "allVisibleSelected"
  | "selectedVisibleCount"
  | "onSort"
  | "onToggleSelected"
  | "onToggleAllVisible"
  | "onClearFilters"
  | "onRetry"
>;

function SubmissionQueueState({
  listState,
  loadFailure,
  eventName,
  eventId,
  organizationId,
  selectedSubmissionId,
  filteredSubmissions,
  sortKey,
  sortDirection,
  selected,
  selectedVisibleCount,
  allVisibleSelected,
  onSort,
  onToggleSelected,
  onToggleAllVisible,
  onClearFilters,
  onRetry,
}: SubmissionQueueStateProps) {
  if (listState === "loading") return <SubmissionLoadingState />;
  if (listState === "failure" || listState === "unconfigured") {
    return (
      <SubmissionFailureState listState={listState} loadFailure={loadFailure} onRetry={onRetry} />
    );
  }
  if (listState === "filtered_empty") {
    return <SubmissionFilteredEmptyState onClearFilters={onClearFilters} />;
  }
  return (
    <SubmissionQueueTable
      eventName={eventName}
      eventId={eventId}
      organizationId={organizationId}
      selectedSubmissionId={selectedSubmissionId}
      filteredSubmissions={filteredSubmissions}
      sortKey={sortKey}
      sortDirection={sortDirection}
      selected={selected}
      allVisibleSelected={allVisibleSelected}
      selectedVisibleCount={selectedVisibleCount}
      onSort={onSort}
      onToggleSelected={onToggleSelected}
      onToggleAllVisible={onToggleAllVisible}
    />
  );
}

function SubmissionQueueEmpty({
  eventName,
  listState,
  loadFailure,
  onRetry,
}: Readonly<Pick<SubmissionQueueProps, "eventName" | "listState" | "loadFailure" | "onRetry">>) {
  if (listState === "loading") {
    return (
      <div className={styles.listContent}>
        <SubmissionLoadingState />
      </div>
    );
  }
  if (listState === "failure" || listState === "unconfigured") {
    return (
      <div className={styles.listContent}>
        <SubmissionFailureState listState={listState} loadFailure={loadFailure} onRetry={onRetry} />
      </div>
    );
  }
  return (
    <div className={styles.emptyCardContent}>
      <Empty className={styles.emptyState} role="status">
        <EmptyHeader>
          <EmptyTitle>No submissions yet</EmptyTitle>
          <EmptyDescription>
            Share the public call for proposals to start collecting sessions for {eventName}.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

function SubmissionLoadingState() {
  return (
    <div className={styles.emptyState} role="status" aria-live="polite">
      <h3>Loading submissions</h3>
      <p>We&apos;re getting the latest proposals for this event.</p>
    </div>
  );
}

function SubmissionFailureState({
  listState,
  loadFailure,
  onRetry,
}: Readonly<{
  listState: "failure" | "unconfigured";
  loadFailure: SubmissionLoadFailure | null;
  onRetry: () => void;
}>) {
  return (
    <div className={styles.emptyState} role="alert">
      <h3>
        {listState === "unconfigured" ? "Set up submission intake" : "Unable to load submissions"}
      </h3>
      <p>{loadFailure?.message ?? "Submissions could not be loaded."}</p>
      {listState === "failure" ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Retry submissions
        </Button>
      ) : null}
    </div>
  );
}

function SubmissionFilteredEmptyState({
  onClearFilters,
}: Readonly<{ onClearFilters: () => void }>) {
  return (
    <div className={styles.emptyState} role="status">
      <h3>No matching submissions</h3>
      <p>Try a different search or clear the filters to see more proposals.</p>
      <Button type="button" variant="outline" size="sm" onClick={onClearFilters}>
        Clear filters
      </Button>
    </div>
  );
}

type SubmissionQueueTableProps = Pick<
  SubmissionQueueProps,
  | "eventName"
  | "eventId"
  | "organizationId"
  | "selectedSubmissionId"
  | "filteredSubmissions"
  | "sortKey"
  | "sortDirection"
  | "selected"
  | "allVisibleSelected"
  | "selectedVisibleCount"
  | "onSort"
  | "onToggleSelected"
  | "onToggleAllVisible"
>;

function SubmissionQueueTable({
  eventName,
  eventId,
  organizationId,
  selectedSubmissionId,
  filteredSubmissions,
  sortKey,
  sortDirection,
  selected,
  selectedVisibleCount,
  allVisibleSelected,
  onSort,
  onToggleSelected,
  onToggleAllVisible,
}: SubmissionQueueTableProps) {
  return (
    <div className={styles.tableWrap} data-scroll-region="submission-queue">
      <Table className={styles.submissionTable}>
        <TableCaption className={styles.srOnly}>Submissions for {eventName}</TableCaption>
        <SubmissionTableHeader
          sortKey={sortKey}
          sortDirection={sortDirection}
          allVisibleSelected={allVisibleSelected}
          onSort={onSort}
          onToggleAllVisible={onToggleAllVisible}
          selectedVisible={selectedVisibleCount > 0}
        />
        <TableBody>
          {filteredSubmissions.map((submission) => (
            <SubmissionQueueRow
              key={submission.id}
              eventId={eventId}
              organizationId={organizationId}
              selectedSubmissionId={selectedSubmissionId}
              submission={submission}
              selected={selected}
              onToggleSelected={onToggleSelected}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SubmissionTableHeader({
  sortKey,
  sortDirection,
  allVisibleSelected,
  onSort,
  onToggleAllVisible,
  selectedVisible,
}: Readonly<{
  sortKey: SubmissionSortKey;
  sortDirection: SubmissionSortDirection;
  allVisibleSelected: boolean;
  onSort: (sortKey: SubmissionSortKey) => void;
  onToggleAllVisible: () => void;
  selectedVisible: boolean;
}>) {
  return (
    <TableHeader>
      <TableRow>
        <TableHead className={styles.checkboxColumn} scope="col">
          <Checkbox
            checked={allVisibleSelected ? true : selectedVisible ? "indeterminate" : false}
            onCheckedChange={onToggleAllVisible}
            aria-label="Select all visible submissions"
          />
        </TableHead>
        <SortableHeader
          className={styles.titleColumn}
          sortKey="title"
          activeKey={sortKey}
          direction={sortDirection}
          onSort={onSort}
        >
          Title
        </SortableHeader>
        <SortableHeader
          className={styles.statusColumn}
          sortKey="status"
          activeKey={sortKey}
          direction={sortDirection}
          onSort={onSort}
        >
          Status
        </SortableHeader>
        <TableHead className={styles.speakersColumn} scope="col">
          Speakers
        </TableHead>
        <TableHead className={styles.reviewColumn} scope="col">
          Reviews
        </TableHead>
        <TableHead className={styles.taxonomyColumn} scope="col">
          Track / format
        </TableHead>
        <SortableHeader
          className={styles.updatedColumn}
          sortKey="updatedAt"
          activeKey={sortKey}
          direction={sortDirection}
          onSort={onSort}
        >
          Updated
        </SortableHeader>
      </TableRow>
    </TableHeader>
  );
}

function SubmissionQueueRow({
  eventId,
  organizationId,
  selectedSubmissionId,
  submission,
  selected,
  onToggleSelected,
}: Readonly<{
  eventId: string;
  organizationId: string;
  selectedSubmissionId: string | undefined;
  submission: SubmissionRecord;
  selected: ReadonlySet<string>;
  onToggleSelected: (id: string) => void;
}>) {
  return (
    <TableRow
      aria-current={submission.id === selectedSubmissionId ? "page" : undefined}
      data-state={submission.id === selectedSubmissionId ? "selected" : undefined}
      data-bulk-selected={selected.has(submission.id) ? "true" : "false"}
      aria-selected={selected.has(submission.id)}
      data-submission-row-layout="summary"
    >
      <TableCell className={styles.checkboxColumn}>
        <Checkbox
          checked={selected.has(submission.id)}
          onCheckedChange={() => onToggleSelected(submission.id)}
          aria-label={`Select ${submission.title}`}
        />
      </TableCell>
      <TableHead scope="row" className={styles.titleCell}>
        <a
          className={styles.submissionLink}
          href={submissionHref(eventId, submission.id, organizationId)}
          title={submission.title}
        >
          {submission.title}
        </a>
      </TableHead>
      <TableCell className={styles.statusCell}>
        <span className={styles.mobileLabel}>Status</span>
        <StatusBadge status={submission.status} />
      </TableCell>
      <TableCell className={styles.speakersCell}>
        <span className={styles.mobileLabel}>Speakers</span>
        <span
          className={styles.speakerNames}
          title={submission.participants.map((participant) => participant.name).join(", ")}
        >
          {submission.participants.length === 0
            ? "No speaker"
            : submission.participants.map((participant) => participant.name).join(", ")}
        </span>
      </TableCell>
      <TableCell className={styles.reviewCell}>
        <span className={styles.mobileLabel}>Reviews</span>
        <SubmissionReviewProgress submission={submission} />
      </TableCell>
      <TableCell className={styles.taxonomyCell}>
        <span className={styles.mobileLabel}>Track / format</span>
        <span className={styles.trackValue}>{submission.track}</span>
        <span className={styles.submissionMeta}>{submission.format}</span>
      </TableCell>
      <TableCell className={styles.updatedCell}>
        <span className={styles.mobileLabel}>Updated</span>
        <time dateTime={submission.updatedAt}>{formatDate(submission.updatedAt)}</time>
      </TableCell>
    </TableRow>
  );
}

function SubmissionReviewProgress({ submission }: Readonly<{ submission: SubmissionRecord }>) {
  if (reviewDataIsReady(submission)) {
    return (
      <ProgressMeter
        completed={submission.reviewSummary.completed}
        total={submission.reviewSummary.total}
        label={`${submission.title} review progress`}
      />
    );
  }
  return <span className={styles.mutedText}>{reviewDataMessage(submission.reviewData)}</span>;
}

function SubmissionDetailOverlay({
  eventId,
  organizationId,
  selectedSubmissionId,
  selectedSubmission,
  detailPanel,
}: Readonly<{
  eventId: string;
  organizationId: string;
  selectedSubmissionId: string | undefined;
  selectedSubmission: SubmissionRecord | undefined;
  detailPanel: ReactNode;
}>) {
  if (selectedSubmissionId === undefined) return null;

  return (
    <SubmissionDetailDrawer
      closeHref={submissionListHref(eventId, organizationId)}
      title={selectedSubmission?.title ?? "Submission details"}
    >
      {detailPanel}
    </SubmissionDetailDrawer>
  );
}

function SortableHeader({
  sortKey,
  activeKey,
  direction,
  onSort,
  children,
  className = "",
}: Readonly<{
  sortKey: SubmissionSortKey;
  activeKey: SubmissionSortKey;
  direction: SubmissionSortDirection;
  onSort: (sortKey: SubmissionSortKey) => void;
  children: string;
  className?: string | undefined;
}>) {
  const active = activeKey === sortKey;
  return (
    <TableHead
      className={className}
      scope="col"
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        className={styles.sortButton}
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${sortLabels[sortKey]}`}
      >
        {children}
        <span aria-hidden="true">{active ? (direction === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    </TableHead>
  );
}

type SubmissionDetailViewProps = Readonly<{
  eventId: string;
  organizationId: string;
  displayMode: "page" | "panel";
  eventName: string;
  eventSlug: string | null;
  submission: SubmissionRecord;
  baseUrl: string;
  onDecisionSaved: (decision: EvaluationDecisionRecord) => void;
  onRetry: () => void;
}>;

export function SubmissionDetailView({
  eventId,
  organizationId,
  displayMode,
  eventName,
  eventSlug,
  submission,
  baseUrl,
  onDecisionSaved,
  onRetry,
}: SubmissionDetailViewProps) {
  return (
    <section
      className={displayMode === "panel" ? styles.reviewPanel : styles.workspaceRoot}
      aria-label={displayMode === "panel" ? "Submission review panel" : "Submission details"}
    >
      {displayMode === "page" ? (
        <SubmissionDetailHeader
          eventId={eventId}
          organizationId={organizationId}
          eventName={eventName}
          submission={submission}
        />
      ) : null}

      <div
        id="submission-detail-content"
        className={displayMode === "panel" ? styles.reviewPanelBody : styles.workspaceMain}
        tabIndex={-1}
      >
        {displayMode === "panel" ? (
          <div className={styles.drawerIntro}>
            <strong>Organizer review.</strong>
            <span>
              Review the submission content, participant context, committee activity, and final
              decision.
            </span>
          </div>
        ) : null}
        <div className={styles.detailGrid}>
          <SubmissionDetailPrimary
            eventName={eventName}
            displayMode={displayMode}
            submission={submission}
            baseUrl={baseUrl}
            onDecisionSaved={onDecisionSaved}
          />
          <SubmissionDetailAside
            submission={submission}
            eventSlug={eventSlug}
            organizationId={organizationId}
            onRetry={onRetry}
          />
        </div>
      </div>
    </section>
  );
}

function SubmissionDetailHeader({
  eventId,
  organizationId,
  eventName,
  submission,
}: Readonly<{
  eventId: string;
  organizationId: string;
  eventName: string;
  submission: SubmissionRecord;
}>) {
  return (
    <>
      <a className={styles.skipLink} href="#submission-detail-content">
        Skip to submission details
      </a>
      <WorkspaceHeader
        breadcrumb={
          <WorkspaceBreadcrumb>
            <Link href="/admin/events">{eventName}</Link>
            <span>/</span>
            <Link href={submissionListHref(eventId, organizationId)}>Submissions</Link>
            <span>/</span>
            <strong>Submission details</strong>
          </WorkspaceBreadcrumb>
        }
        title={submission.title}
        status={
          <WorkspaceStatusBadge tone={submission.status === "accepted" ? "success" : "info"}>
            {submissionStatusLabels[submission.status]}
          </WorkspaceStatusBadge>
        }
        description={`${submission.format} · ${submission.track}`}
        metadata={
          <>
            <WorkspaceMetaItem>
              Updated{" "}
              <time dateTime={submission.updatedAt}>{formatDate(submission.updatedAt)}</time>
            </WorkspaceMetaItem>
            <WorkspaceMetaItem>{submission.participants.length} participants</WorkspaceMetaItem>
          </>
        }
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href={submissionListHref(eventId, organizationId)}>Back to queue</Link>
          </Button>
        }
      />
    </>
  );
}

function SubmissionDetailPrimary({
  eventName,
  displayMode,
  submission,
  baseUrl,
  onDecisionSaved,
}: Readonly<{
  eventName: string;
  displayMode: "page" | "panel";
  submission: SubmissionRecord;
  baseUrl: string;
  onDecisionSaved: (decision: EvaluationDecisionRecord) => void;
}>) {
  return (
    <div className={styles.detailPrimary}>
      {displayMode === "panel" ? (
        <section
          className={`${styles.detailPanel} ${styles.submissionOverviewPanel}`}
          aria-labelledby="submission-overview-heading"
        >
          <div className={styles.submissionOverviewHeader}>
            <div>
              <p className={styles.eyebrow}>{eventName} · Submission</p>
              <h1 id="submission-overview-heading">{submission.title}</h1>
            </div>
            <StatusBadge status={submission.status} />
          </div>
          <dl className={styles.submissionOverviewMeta}>
            <div>
              <dt>Status</dt>
              <dd>{submissionStatusLabels[submission.status]}</dd>
            </div>
            <div>
              <dt>Track / format</dt>
              <dd>
                {submission.track} · {submission.format}
              </dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{formatDateTime(submission.updatedAt)}</dd>
            </div>
          </dl>
          <div className={styles.submissionOverviewCopy}>
            <h2>Submission overview</h2>
            <p>{submission.abstract}</p>
          </div>
          <div className={styles.submissionOverviewAnswers}>
            <p className={styles.eyebrow}>Form responses</p>
            <h2>Structured answers</h2>
            <dl className={styles.answerList}>
              {submission.answers.map((answer) => (
                <div key={answer.question}>
                  <dt>{answer.question}</dt>
                  <dd>{answer.answer}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      ) : (
        <>
          <section className={styles.detailPanel} aria-labelledby="abstract-heading">
            <div className={styles.panelHeading}>
              <div>
                <p className={styles.eyebrow}>Submission content</p>
                <h2 id="abstract-heading">Abstract</h2>
              </div>
            </div>
            <p className={styles.abstract}>{submission.abstract}</p>
          </section>

          <section className={styles.detailPanel} aria-labelledby="answers-heading">
            <p className={styles.eyebrow}>Form responses</p>
            <h2 id="answers-heading">Structured answers</h2>
            <dl className={styles.answerList}>
              {submission.answers.map((answer) => (
                <div key={answer.question}>
                  <dt>{answer.question}</dt>
                  <dd>{answer.answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        </>
      )}

      <section className={styles.detailPanel} aria-labelledby="timeline-heading">
        <p className={styles.eyebrow}>Audit history</p>
        <h2 id="timeline-heading">Lifecycle timeline</h2>
        <ol className={styles.timeline}>
          {submission.timeline.map((entry) => (
            <li key={`${entry.label}-${entry.at}`}>
              <span className={styles.timelineMarker} aria-hidden="true" />
              <div>
                <h3>{entry.label}</h3>
                <time dateTime={entry.at}>{formatDateTime(entry.at)}</time>
                <p>{entry.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <DecisionControl
        key={`${submission.id}:${submission.decision?.version ?? 0}`}
        submission={submission}
        baseUrl={baseUrl}
        onSaved={onDecisionSaved}
      />
      <AcceptedHandoffSummary submission={submission} />
      <ReopenControl submission={submission} baseUrl={baseUrl} />
    </div>
  );
}

function SubmissionDetailAside({
  submission,
  eventSlug,
  organizationId,
  onRetry,
}: Readonly<{
  submission: SubmissionRecord;
  eventSlug: string | null;
  organizationId: string;
  onRetry: () => void;
}>) {
  const submittedReviewRead = submission.submittedReviewRead ?? {
    status: "ready" as const,
    count: submission.reviewAssignments.filter((assignment) => assignment.status === "complete")
      .length,
  };
  return (
    <aside className={styles.detailAside} aria-label="Organizer-only submission information">
      <section className={styles.detailPanel} aria-labelledby="participants-heading">
        <p className={styles.eyebrow}>Private organizer view</p>
        <h2 id="participants-heading">Participants</h2>
        <ul className={styles.participantList}>
          {submission.participants.map((participant) => (
            <li key={participant.id}>
              <span className={styles.avatar} aria-hidden="true">
                {initials(participant.name)}
              </span>
              <div>
                <strong>{participant.name}</strong>
                <span>
                  {participant.role}
                  {participant.organization ? ` · ${participant.organization}` : ""}
                </span>
                <a href={`mailto:${participant.email}`}>{participant.email}</a>
                {participant.biography ? <span>Biography: {participant.biography}</span> : null}
                {Object.entries(participant.answers ?? {}).map(([question, answer]) => (
                  <span key={`${participant.id}-${question}`}>
                    {question}: {answerText(answer) ?? "—"}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <ProgressMeter
          completed={submission.participantProgress.completed}
          total={submission.participantProgress.total}
          label="Participant profile completion"
        />
      </section>

      <SubmissionReviewSummary
        submission={submission}
        eventSlug={eventSlug}
        organizationId={organizationId}
        submittedReviewRead={submittedReviewRead}
        onRetry={onRetry}
      />
      <SubmissionAssignmentSummary submission={submission} />

      <section className={styles.detailPanel} aria-labelledby="notes-heading">
        <p className={styles.eyebrow}>Private organizer note</p>
        <h2 id="notes-heading">Organizer notes</h2>
        <p className={styles.mutedText}>{submission.organizerNotes}</p>
      </section>
    </aside>
  );
}

function SubmissionReviewSummary({
  submission,
  eventSlug,
  organizationId,
  submittedReviewRead,
  onRetry,
}: Readonly<{
  submission: SubmissionRecord;
  eventSlug: string | null;
  organizationId: string;
  submittedReviewRead: SubmittedReviewReadState;
  onRetry: () => void;
}>) {
  return (
    <section className={styles.detailPanel} aria-labelledby="review-heading">
      <p className={styles.eyebrow}>Committee activity</p>
      <h2 id="review-heading">Review score summary</h2>
      <div className={styles.scoreSummary}>
        <strong>
          {submission.reviewSummary.averageScore === null
            ? "—"
            : `${submission.reviewSummary.averageScore}/${submission.reviewSummary.maxScore}`}
        </strong>
        <span>{submission.reviewSummary.recommendation}</span>
      </div>
      {reviewDataIsReady(submission) ? (
        <ProgressMeter
          completed={submission.reviewSummary.completed}
          total={submission.reviewSummary.total}
          label="Completed reviews"
        />
      ) : null}
      <ReviewDataNotice
        state={submission.reviewData ?? { status: "ready" as const }}
        onRetry={onRetry}
        {...(eventSlug === null
          ? {}
          : {
              setupHref: `/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventSlug)}/reviews`,
            })}
      />
      {reviewDataIsReady(submission) ? (
        submittedReviewRead.status === "error" ? (
          <div className={styles.auditCallout} role="alert">
            <p>Submitted reviews could not be loaded: {submittedReviewRead.message}</p>
            <Button type="button" variant="outline" onClick={onRetry}>
              Retry submitted reviews
            </Button>
          </div>
        ) : submittedReviewRead.count === 0 ? (
          <p className={styles.mutedText}>No submitted reviews yet.</p>
        ) : null
      ) : null}
      <ul className={styles.assignmentList}>
        {submission.reviewAssignments.map((assignment) => (
          <li key={assignment.reviewer}>
            <div>
              <strong>{assignment.reviewer}</strong>
              <span>
                {reviewStatusLabels[assignment.status]}
                {assignment.score === undefined
                  ? ""
                  : ` · ${assignment.score}/${submission.reviewSummary.maxScore}`}
              </span>
            </div>
            {assignment.criterionScores && assignment.criterionScores.length > 0 ? (
              <ul>
                {assignment.criterionScores.map((score) => (
                  <li key={score.criterion}>
                    {score.criterion}: {score.value}
                  </li>
                ))}
              </ul>
            ) : null}
            {assignment.comment ? (
              <p className={styles.mutedText}>Reviewer comment: {assignment.comment}</p>
            ) : null}
            {assignment.conflict ? (
              <p className={styles.conflictNotice}>Conflict: {assignment.conflict}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SubmissionAssignmentSummary({ submission }: Readonly<{ submission: SubmissionRecord }>) {
  return (
    <section className={styles.detailPanel} aria-labelledby="assignment-heading">
      <p className={styles.eyebrow}>Access controls</p>
      <h2 id="assignment-heading">Assignment &amp; conflicts</h2>
      <p className={styles.mutedText}>
        Assignments are event-scoped. A declared conflict removes reviewer access and keeps the
        submission out of that reviewer&apos;s queue.
      </p>
      <ul className={styles.conflictList}>
        {submission.reviewAssignments.reduce<ReactNode[]>((conflictItems, assignment) => {
          if (assignment.conflict) {
            conflictItems.push(
              <li key={assignment.reviewer}>
                <strong>{assignment.reviewer}</strong> — {assignment.conflict}
              </li>,
            );
          }
          return conflictItems;
        }, [])}
      </ul>
      {submission.reviewAssignments.every((assignment) => !assignment.conflict) ? (
        <p className={styles.noConflict}>No conflicts recorded for this submission.</p>
      ) : null}
    </section>
  );
}

function DecisionControl({
  submission,
  baseUrl,
  onSaved,
}: Readonly<{
  submission: SubmissionRecord;
  baseUrl: string;
  onSaved: (decision: EvaluationDecisionRecord) => void;
}>) {
  const initialStatus =
    submission.decision?.status ??
    (submission.status === "accepted"
      ? "accepted"
      : submission.status === "waitlisted"
        ? "waitlisted"
        : submission.status === "declined"
          ? "rejected"
          : "");
  const initialReason = submission.decision?.history.at(-1)?.reason ?? "";
  const attemptScope = decisionAttemptScope(baseUrl, submission);
  const storedAttempt = decisionAttemptByScope.get(attemptScope);
  const [status, setStatus] = useState<EvaluationDecisionStatus | "">(initialStatus);
  const [reason, setReason] = useState(initialReason);
  const [decisionAttempt, setDecisionAttempt] = useState<EvaluationDecisionAttempt | null>(() =>
    initialStatus !== "" && decisionAttemptMatches(storedAttempt, initialStatus, initialReason)
      ? storedAttempt
      : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notificationState, setNotificationState] = useState<DecisionNotificationState>(() =>
    ambiguousDecisionScopes.has(attemptScope)
      ? "committed"
      : submission.decision === undefined
        ? "idle"
        : "confirmed",
  );
  const hasDecisionApi = submission.evaluationPlanId !== undefined;
  const decisionHistory = submission.decision?.history ?? [];
  const canSubmit = hasDecisionApi && status !== "" && reason.trim().length >= 5 && !busy;

  function clearAmbiguousCommit(): void {
    ambiguousDecisionScopes.delete(attemptScope);
    if (notificationState === "committed") setNotificationState("idle");
  }

  function updateAttemptForPayload(
    nextStatus: EvaluationDecisionStatus | "",
    nextReason: string,
  ): void {
    if (nextStatus !== "" && decisionAttemptMatches(decisionAttempt, nextStatus, nextReason))
      return;
    decisionAttemptByScope.delete(attemptScope);
    setDecisionAttempt(null);
    clearAmbiguousCommit();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canSubmit || submission.evaluationPlanId === undefined) return;
    const selectedStatus = status as EvaluationDecisionStatus;
    const selectedReason = reason.trim();
    const attempt = createEvaluationDecisionAttempt(
      selectedStatus,
      selectedReason,
      decisionAttempt,
    );
    decisionAttemptByScope.set(attemptScope, attempt);
    setDecisionAttempt(attempt);
    setBusy(true);
    setError(null);
    try {
      const decision = await evaluationRequest<EvaluationDecisionRecord>(
        baseUrl,
        `/plans/${encodeURIComponent(submission.evaluationPlanId)}/submissions/${encodeURIComponent(submission.id)}/decision`,
        {
          method: "PUT",
          body: JSON.stringify({
            status: selectedStatus,
            reason: selectedReason,
            ...(submission.decision === undefined
              ? {}
              : { expectedVersion: submission.decision.version }),
            idempotencyKey: attempt.idempotencyKey,
          }),
        },
      );
      decisionAttemptByScope.delete(attemptScope);
      ambiguousDecisionScopes.delete(attemptScope);
      setDecisionAttempt(null);
      onSaved(decision);
      setNotificationState("queued");
      setReason("");
    } catch (reasonValue: unknown) {
      const originalError =
        reasonValue instanceof Error ? reasonValue.message : "The decision could not be saved.";
      let reconciledDecision: EvaluationDecisionRecord | undefined;
      try {
        reconciledDecision = await loadOrganizerEvaluationDecision(
          baseUrl,
          submission.evaluationPlanId,
          submission.id,
        );
      } catch {
        // Keep the original PUT error when the reconciliation read is unavailable.
      }
      const reconciliation = reconcileEvaluationDecisionFailure(
        reconciledDecision,
        attempt,
        originalError,
      );
      if (reconciliation.status === "committed") {
        decisionAttemptByScope.set(attemptScope, attempt);
        ambiguousDecisionScopes.add(attemptScope);
        setDecisionAttempt(attempt);
        setError(null);
        setNotificationState("committed");
        onSaved(reconciliation.decision);
      } else {
        decisionAttemptByScope.set(attemptScope, attempt);
        setDecisionAttempt(attempt);
        setError(reconciliation.error);
        setNotificationState("idle");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.detailPanel} aria-labelledby="decision-heading">
      <p className={styles.eyebrow}>Human organizer decision</p>
      <h2 id="decision-heading">Accept or reject</h2>
      <p className={styles.mutedText}>
        Decisions are versioned on the evaluation server. Saving waits for the durable decision and
        its submitter notification queue. Accepted-speaker onboarding then continues through the
        idempotent background handoff.
      </p>
      <DecisionForm
        status={status}
        reason={reason}
        error={error}
        busy={busy}
        hasDecisionApi={hasDecisionApi}
        canSubmit={canSubmit}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        onStatusChange={(nextStatus) => {
          setStatus(nextStatus);
          updateAttemptForPayload(nextStatus, reason);
        }}
        onReasonChange={(nextReason) => {
          setReason(nextReason);
          updateAttemptForPayload(status, nextReason);
        }}
      />
      <DecisionHistory
        submission={submission}
        status={status}
        decisionHistory={decisionHistory}
        notificationState={notificationState}
      />
    </section>
  );
}

type DecisionNotificationState = "idle" | "queued" | "confirmed" | "committed";

type DecisionFormProps = Readonly<{
  status: EvaluationDecisionStatus | "";
  reason: string;
  error: string | null;
  busy: boolean;
  hasDecisionApi: boolean;
  canSubmit: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStatusChange: (status: EvaluationDecisionStatus | "") => void;
  onReasonChange: (reason: string) => void;
}>;

function DecisionForm({
  status,
  reason,
  error,
  busy,
  hasDecisionApi,
  canSubmit,
  onSubmit,
  onStatusChange,
  onReasonChange,
}: DecisionFormProps) {
  return (
    <form onSubmit={onSubmit}>
      <div className={styles.formGrid}>
        <div className={styles.filterField}>
          <label htmlFor="decision-status">Decision outcome</label>
          <select
            id="decision-status"
            value={status}
            disabled={!hasDecisionApi || busy}
            onChange={(event) =>
              onStatusChange(event.currentTarget.value as EvaluationDecisionStatus | "")
            }
          >
            <option value="">Choose an outcome</option>
            <option value="accepted">Accept</option>
            <option value="waitlisted">Waitlist</option>
            <option value="rejected">Reject</option>
          </select>
        </div>
      </div>
      <label className={styles.textareaLabel} htmlFor="decision-reason">
        Human-authored decision reason
      </label>
      <textarea
        id="decision-reason"
        name="decisionReason"
        value={reason}
        minLength={5}
        required
        rows={3}
        placeholder="Explain the program decision for the audit history."
        disabled={!hasDecisionApi || busy}
        onChange={(event) => onReasonChange(event.currentTarget.value)}
      />
      <p className={styles.fieldHelp}>The reason is retained in the immutable decision history.</p>
      {!hasDecisionApi ? (
        <p className={styles.auditCallout} role="note">
          Decision controls are read-only until the server evaluation plan is available.
        </p>
      ) : null}
      {error ? (
        <p className={styles.formError} role="alert">
          {error}
        </p>
      ) : null}
      <Button
        className={styles.decisionSubmit}
        type="submit"
        variant={status === "rejected" ? "destructive" : "default"}
        disabled={!canSubmit}
      >
        Save {status === "accepted" ? "accept" : status === "rejected" ? "reject" : "waitlist"}{" "}
        decision
      </Button>
    </form>
  );
}

type DecisionHistoryProps = Readonly<{
  submission: SubmissionRecord;
  status: EvaluationDecisionStatus | "";
  decisionHistory: EvaluationDecisionRecord["history"];
  notificationState: DecisionNotificationState;
}>;

function DecisionHistory({
  submission,
  status,
  decisionHistory,
  notificationState,
}: DecisionHistoryProps) {
  return (
    <section aria-labelledby="decision-history-heading">
      <h3 id="decision-history-heading">Decision and notification history</h3>
      {decisionHistory.length ? (
        <ol className={styles.timeline}>
          {decisionHistory.map((transition) => (
            <li key={`${transition.idempotencyKey}-${transition.decidedAt}`}>
              <span className={styles.timelineMarker} aria-hidden="true" />
              <div>
                <h4>
                  {transition.to === "accepted"
                    ? "Accepted"
                    : transition.to === "rejected"
                      ? "Rejected"
                      : "Waitlisted"}
                </h4>
                <time dateTime={transition.decidedAt}>{formatDateTime(transition.decidedAt)}</time>
                <p>{transition.reason} · Human organizer</p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.mutedText}>No decision has been recorded.</p>
      )}
      {notificationState === "committed" ? (
        <p className={styles.auditCallout} role="status">
          {DECISION_COMMITTED_WITHOUT_DELIVERY_MESSAGE} Retry with the same request to safely
          reconcile delivery.
        </p>
      ) : notificationState === "queued" ? (
        <p className={styles.successMessage} role="status">
          Decision notification queued for the all_participants audience.
          {status === "accepted"
            ? " Accepted-speaker onboarding is continuing through the idempotent background handoff."
            : " No accepted-speaker handoff is required for this outcome."}
        </p>
      ) : notificationState === "confirmed" ? (
        <p className={styles.successMessage} role="status">
          Notification projection confirmed for the recorded decision.
        </p>
      ) : null}
      {submission.decision?.notificationDelivery ? (
        <p className={styles.successMessage} role="status">
          {decisionNotificationSummary(submission.decision.notificationDelivery)}
        </p>
      ) : null}
    </section>
  );
}
function AcceptedHandoffSummary({ submission }: Readonly<{ submission: SubmissionRecord }>) {
  const accepted = submission.status === "accepted" || submission.decision?.status === "accepted";
  if (!accepted) return null;
  const metadata = getAcceptedHandoffMetadata(submission);
  return (
    <section className={styles.detailPanel} aria-labelledby="accepted-handoff-heading">
      <p className={styles.eyebrow}>Session and agenda handoff</p>
      <h2 id="accepted-handoff-heading">Accepted session handoff</h2>
      <p className={styles.mutedText}>
        The accepted session is ready to move into your event program.
      </p>
      <dl className={styles.answerList}>
        <div>
          <dt>Session title</dt>
          <dd>{metadata.title}</dd>
        </div>
        <div>
          <dt>Primary speaker</dt>
          <dd>{metadata.primarySpeaker?.name ?? "—"}</dd>
        </div>
        <div>
          <dt>Co-speaker(s)</dt>
          <dd>
            {metadata.coSpeakers.length === 0
              ? "—"
              : metadata.coSpeakers.map((speaker) => speaker.name).join(", ")}
          </dd>
        </div>
        <div>
          <dt>Track</dt>
          <dd>{metadata.track}</dd>
        </div>
      </dl>
    </section>
  );
}

function ReopenControl({
  submission,
  baseUrl,
}: Readonly<{ submission: SubmissionRecord; baseUrl: string }>) {
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = reason.trim().length >= 10 && confirmed;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      await evaluationRequest(
        baseUrl,
        `/events/${encodeURIComponent(submission.eventId)}/submissions/${encodeURIComponent(submission.id)}/reopen`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedVersion: submission.version,
            reason: reason.trim(),
            idempotencyKey: `web-reopen-${crypto.randomUUID()}`,
          }),
        },
      );
      setSaved(true);
    } catch (reasonValue: unknown) {
      setError(
        reasonValue instanceof Error
          ? reasonValue.message
          : "The reopen request could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={`${styles.detailPanel} ${styles.reopenPanel}`}
      aria-labelledby="reopen-heading"
    >
      <p className={styles.eyebrow}>Restricted action</p>
      <h2 id="reopen-heading">Reopen submission</h2>
      <p>
        Organizer-only control for a post-close edit. A human organizer must provide the reason and
        confirm the action; automated tools cannot reopen a submission or make a final decision.
      </p>
      <p className={styles.mutedText} role="note">
        After the CFP close date, the public portal shows a closed message and speaker edits are
        read-only. This audited reopen is the only organizer path to permit a post-close change.
      </p>
      <p className={styles.auditCallout} role="note">
        Every reopen is recorded in the audit log with the organizer identity, timestamp, and
        reason.
        {submission.reopenAudit.length > 0
          ? ` ${submission.reopenAudit.length} prior reopen event${submission.reopenAudit.length === 1 ? "" : "s"} recorded.`
          : " No prior reopen events are recorded."}
      </p>
      <form onSubmit={handleSubmit}>
        <label className={styles.textareaLabel} htmlFor="reopen-reason">
          Human-authored reason
        </label>
        <textarea
          id="reopen-reason"
          name="reopenReason"
          value={reason}
          minLength={10}
          required
          rows={4}
          placeholder="Explain why this submission needs to be reopened."
          aria-describedby="reopen-reason-help"
          onChange={(event) => {
            setReason(event.currentTarget.value);
            setSaved(false);
          }}
        />
        <p className={styles.fieldHelp} id="reopen-reason-help">
          Use at least 10 characters. This text becomes part of the immutable audit record.
        </p>
        <label className={styles.confirmLabel}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => {
              setConfirmed(event.currentTarget.checked);
              setSaved(false);
            }}
          />
          <span>I confirm that reopening is necessary and authorized for this event.</span>
        </label>
        {error ? (
          <p className={styles.formError} role="alert">
            {error}
          </p>
        ) : null}
        <button
          className={styles.dangerButton}
          type="submit"
          disabled={!canSubmit || busy || saved}
        >
          Reopen and write audit event
        </button>
        {saved ? (
          <p className={styles.successMessage} role="status">
            Reopen request recorded for organizer review. The audit event includes your reason.
          </p>
        ) : null}
      </form>
    </section>
  );
}
