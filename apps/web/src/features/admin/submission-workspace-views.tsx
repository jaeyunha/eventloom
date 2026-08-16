"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import styles from "./submission-workspace.module.css";
import {
  answerText,
  decisionNotificationSummary,
  type EvaluationDecisionRecord,
  type EvaluationDecisionStatus,
  evaluationRequest,
  formatDateTime,
  getAcceptedHandoffMetadata,
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

type SubmissionListViewProps = {
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
};

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
  const cfpConfigurationHref = `/admin/organizations/${encodeURIComponent(
    organizationId,
  )}/events/${encodeURIComponent(eventId)}/cfp`;
  return (
    <div className={styles.workspaceRoot}>
      <a className={styles.skipLink} href="#submission-list-content">
        Skip to submissions
      </a>
      <WorkspaceHeader
        breadcrumb={
          <WorkspaceBreadcrumb>
            <span>{eventName}</span>
            <span>/</span>
            <strong>Submissions</strong>
          </WorkspaceBreadcrumb>
        }
        title="Submissions"
        status={<WorkspaceStatusBadge>{submissions.length} total</WorkspaceStatusBadge>}
        description="Move proposals from intake through review and a final organizer decision."
        metadata={
          <>
            <WorkspaceMetaItem>{filteredSubmissions.length} in this view</WorkspaceMetaItem>
            <WorkspaceMetaItem>
              {submissions.filter((submission) => submission.status === "accepted").length} accepted
            </WorkspaceMetaItem>
            <WorkspaceMetaItem>
              {
                submissions.filter(
                  (submission) =>
                    submission.status === "submitted" || submission.status === "under_review",
                ).length
              }{" "}
              awaiting decision
            </WorkspaceMetaItem>
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

      <div
        id="submission-list-content"
        className={styles.workspaceMain}
        data-layout="submission-review-desk"
        tabIndex={-1}
      >
        <div
          className={styles.reviewDesk}
          data-detail-open={selectedSubmissionId === undefined ? "false" : "true"}
        >
          <SubmissionListCard
            eventName={eventName}
            eventSlug={eventSlug}
            organizationId={organizationId}
            eventId={eventId}
            selectedSubmissionId={selectedSubmissionId}
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
          {detailPanel}
        </div>
      </div>
    </div>
  );
}

type SubmissionListCardProps = Omit<SubmissionListViewProps, "detailPanel"> & {
  eventName: string;
};

function SubmissionListCard({
  eventName,
  eventSlug,
  organizationId,
  eventId,
  selectedSubmissionId,
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
}: SubmissionListCardProps) {
  return (
    <div className={styles.submissionMaster}>
      <Card
        id="submission-list-card"
        className={styles.listPanel}
        aria-labelledby="submission-table-heading"
      >
        <CardHeader className={styles.panelHeader}>
          <CardTitle id="submission-table-heading">
            {submissions.length === 0 ? "Submission inbox" : "Submission queue"}
          </CardTitle>
          {listState !== "empty" ? (
            <p className={styles.mutedText}>
              {filteredSubmissions.length} of {submissions.length}
              {selectedVisibleCount > 0 ? ` · ${selectedVisibleCount} selected` : ""}
            </p>
          ) : null}
        </CardHeader>

        {submissions.length > 0 ? (
          <CardContent className={styles.listContent}>
            <ReviewDataNotice
              state={evaluationLoadState}
              onRetry={onRetry}
              {...(eventSlug === null
                ? {}
                : {
                    setupHref: `/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventSlug)}/reviews`,
                  })}
            />
            <SubmissionListToolbar
              search={search}
              status={status}
              track={track}
              format={format}
              tracks={tracks}
              formats={formats}
              filtersActive={filtersActive}
              onSearchChange={onSearchChange}
              onStatusChange={onStatusChange}
              onTrackChange={onTrackChange}
              onFormatChange={onFormatChange}
              onClearFilters={onClearFilters}
            />
            <SubmissionListBody
              eventName={eventName}
              eventId={eventId}
              organizationId={organizationId}
              selectedSubmissionId={selectedSubmissionId}
              filteredSubmissions={filteredSubmissions}
              listState={listState}
              loadFailure={loadFailure}
              sortKey={sortKey}
              sortDirection={sortDirection}
              selected={selected}
              allVisibleSelected={allVisibleSelected}
              onSort={onSort}
              onToggleSelected={onToggleSelected}
              onToggleAllVisible={onToggleAllVisible}
              onClearFilters={onClearFilters}
              onRetry={onRetry}
            />
          </CardContent>
        ) : (
          <SubmissionListEmptyCard
            eventName={eventName}
            listState={listState}
            loadFailure={loadFailure}
            onRetry={onRetry}
          />
        )}
      </Card>
    </div>
  );
}

type SubmissionListToolbarProps = Readonly<{
  search: string;
  status: SubmissionStatus | "all";
  track: string;
  format: string;
  tracks: string[];
  formats: string[];
  filtersActive: boolean;
  onSearchChange: (search: string) => void;
  onStatusChange: (status: SubmissionStatus | "all") => void;
  onTrackChange: (track: string) => void;
  onFormatChange: (format: string) => void;
  onClearFilters: () => void;
}>;

function SubmissionListToolbar({
  search,
  status,
  track,
  format,
  tracks,
  formats,
  filtersActive,
  onSearchChange,
  onStatusChange,
  onTrackChange,
  onFormatChange,
  onClearFilters,
}: SubmissionListToolbarProps) {
  return (
    <fieldset className={styles.toolbar} aria-label="Submission filters">
      <legend className={styles.srOnly}>Filter submissions</legend>
      <label className={styles.toolbarSearch} htmlFor="submission-search">
        <span className={styles.srOnly}>Search</span>
        <Input
          id="submission-search"
          type="search"
          value={search}
          placeholder="Search submissions"
          onChange={(event) => onSearchChange(event.currentTarget.value)}
        />
      </label>
      <div className={styles.toolbarField}>
        <span className={styles.srOnly}>Status</span>
        <Select
          value={status}
          onValueChange={(value) => onStatusChange(value as SubmissionStatus | "all")}
        >
          <SelectTrigger id="submission-status" aria-label="Filter by status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(submissionStatusLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className={styles.toolbarField}>
        <span className={styles.srOnly}>Track</span>
        <Select value={track} onValueChange={onTrackChange}>
          <SelectTrigger id="submission-track" aria-label="Filter by track">
            <SelectValue placeholder="All tracks" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tracks</SelectItem>
            {tracks.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className={styles.toolbarField}>
        <span className={styles.srOnly}>Format</span>
        <Select value={format} onValueChange={onFormatChange}>
          <SelectTrigger id="submission-format" aria-label="Filter by format">
            <SelectValue placeholder="All formats" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All formats</SelectItem>
            {formats.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {filtersActive ? (
        <Button
          className={styles.clearButton}
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
        >
          Clear
        </Button>
      ) : null}
    </fieldset>
  );
}

type SubmissionListBodyProps = Readonly<{
  eventName: string;
  eventId: string;
  organizationId: string;
  selectedSubmissionId: string | undefined;
  filteredSubmissions: SubmissionRecord[];
  listState: SubmissionListState;
  loadFailure: SubmissionLoadFailure | null;
  sortKey: SubmissionSortKey;
  sortDirection: SubmissionSortDirection;
  selected: ReadonlySet<string>;
  allVisibleSelected: boolean;
  onSort: (sortKey: SubmissionSortKey) => void;
  onToggleSelected: (id: string) => void;
  onToggleAllVisible: () => void;
  onClearFilters: () => void;
  onRetry: () => void;
}>;

function SubmissionListBody({
  eventName,
  eventId,
  organizationId,
  selectedSubmissionId,
  filteredSubmissions,
  listState,
  loadFailure,
  sortKey,
  sortDirection,
  selected,
  allVisibleSelected,
  onSort,
  onToggleSelected,
  onToggleAllVisible,
  onClearFilters,
  onRetry,
}: SubmissionListBodyProps) {
  if (listState === "loading") {
    return <SubmissionLoadingState />;
  }
  if (listState === "failure" || listState === "unconfigured") {
    return (
      <SubmissionFailureState listState={listState} loadFailure={loadFailure} onRetry={onRetry} />
    );
  }
  if (listState === "filtered_empty") {
    return <SubmissionFilteredEmptyState onClearFilters={onClearFilters} />;
  }
  return (
    <SubmissionTable
      eventName={eventName}
      eventId={eventId}
      organizationId={organizationId}
      selectedSubmissionId={selectedSubmissionId}
      filteredSubmissions={filteredSubmissions}
      sortKey={sortKey}
      sortDirection={sortDirection}
      selected={selected}
      allVisibleSelected={allVisibleSelected}
      onSort={onSort}
      onToggleSelected={onToggleSelected}
      onToggleAllVisible={onToggleAllVisible}
    />
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

function SubmissionListEmptyCard({
  eventName,
  listState,
  loadFailure,
  onRetry,
}: Readonly<{
  eventName: string;
  listState: SubmissionListState;
  loadFailure: SubmissionLoadFailure | null;
  onRetry: () => void;
}>) {
  if (listState === "loading") {
    return (
      <CardContent>
        <SubmissionLoadingState />
      </CardContent>
    );
  }
  if (listState === "failure" || listState === "unconfigured") {
    return (
      <CardContent>
        <SubmissionFailureState listState={listState} loadFailure={loadFailure} onRetry={onRetry} />
      </CardContent>
    );
  }
  return (
    <CardContent className={styles.emptyCardContent}>
      <Empty className={styles.emptyState} role="status">
        <EmptyHeader>
          <EmptyTitle>No submissions yet</EmptyTitle>
          <EmptyDescription>
            Share the public call for proposals to start collecting sessions for {eventName}.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </CardContent>
  );
}

type SubmissionTableProps = Readonly<{
  eventName: string;
  eventId: string;
  organizationId: string;
  selectedSubmissionId: string | undefined;
  filteredSubmissions: SubmissionRecord[];
  sortKey: SubmissionSortKey;
  sortDirection: SubmissionSortDirection;
  selected: ReadonlySet<string>;
  allVisibleSelected: boolean;
  onSort: (sortKey: SubmissionSortKey) => void;
  onToggleSelected: (id: string) => void;
  onToggleAllVisible: () => void;
}>;

function SubmissionTable({
  eventName,
  eventId,
  organizationId,
  selectedSubmissionId,
  filteredSubmissions,
  sortKey,
  sortDirection,
  selected,
  allVisibleSelected,
  onSort,
  onToggleSelected,
  onToggleAllVisible,
}: SubmissionTableProps) {
  return (
    <div className={styles.tableWrap} data-scroll-region="submission-queue">
      <Table className={styles.submissionTable}>
        <TableCaption className={styles.srOnly}>Submissions for {eventName}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className={styles.checkboxColumn} scope="col">
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={onToggleAllVisible}
                  aria-label="Select all visible submissions"
                />
                <span className={styles.srOnly}>Select all visible submissions</span>
              </label>
            </TableHead>
            <SortableHeader
              sortKey="title"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={onSort}
            >
              Submission
            </SortableHeader>
            <SortableHeader
              sortKey="status"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={onSort}
            >
              Status
            </SortableHeader>
            <TableHead scope="col">Participants</TableHead>
            <TableHead scope="col">Review progress</TableHead>
            <TableHead scope="col">Track / format</TableHead>
            <SortableHeader
              sortKey="updatedAt"
              activeKey={sortKey}
              direction={sortDirection}
              onSort={onSort}
            >
              Updated
            </SortableHeader>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredSubmissions.map((submission) => (
            <TableRow
              key={submission.id}
              aria-current={submission.id === selectedSubmissionId ? "page" : undefined}
              data-state={submission.id === selectedSubmissionId ? "selected" : undefined}
            >
              <TableCell className={styles.checkboxColumn}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={selected.has(submission.id)}
                    onChange={() => onToggleSelected(submission.id)}
                    aria-label={`Select ${submission.title}`}
                  />
                  <span className={styles.srOnly}>Select {submission.title}</span>
                </label>
              </TableCell>
              <TableHead scope="row" className={styles.titleCell}>
                <a
                  className={styles.submissionLink}
                  href={submissionHref(eventId, submission.id, organizationId)}
                  title={submission.title}
                >
                  {submission.title}
                </a>
                <span className={styles.submissionMeta}>
                  {submission.id} · v{submission.version}
                </span>
              </TableHead>
              <TableCell>
                <StatusBadge status={submission.status} />
              </TableCell>
              <TableCell>
                <ProgressMeter
                  completed={submission.participantProgress.completed}
                  total={submission.participantProgress.total}
                  label={`${submission.title} participant profile progress`}
                />
              </TableCell>
              <TableCell>
                {reviewDataIsReady(submission) ? (
                  <ProgressMeter
                    completed={submission.reviewSummary.completed}
                    total={submission.reviewSummary.total}
                    label={`${submission.title} review progress`}
                  />
                ) : (
                  <span className={styles.mutedText}>
                    {reviewDataMessage(submission.reviewData)}
                  </span>
                )}
              </TableCell>
              <TableCell>
                <span className={styles.trackValue}>{submission.track}</span>
                <span className={styles.submissionMeta}>{submission.format}</span>
              </TableCell>
              <TableCell>
                <time dateTime={submission.updatedAt}>{formatDate(submission.updatedAt)}</time>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SortableHeader({
  sortKey,
  activeKey,
  direction,
  onSort,
  children,
}: Readonly<{
  sortKey: SubmissionSortKey;
  activeKey: SubmissionSortKey;
  direction: SubmissionSortDirection;
  onSort: (sortKey: SubmissionSortKey) => void;
  children: string;
}>) {
  const active = activeKey === sortKey;
  return (
    <TableHead
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
      ) : (
        <div className={styles.reviewPanelBar}>
          <div>
            <span className={styles.submissionCode}>{submission.id}</span>
            <StatusBadge status={submission.status} />
          </div>
          <Button asChild size="sm" variant="ghost">
            <Link href={submissionListHref(eventId, organizationId)}>Close</Link>
          </Button>
        </div>
      )}

      <div
        id="submission-detail-content"
        className={displayMode === "panel" ? styles.reviewPanelBody : styles.workspaceMain}
        data-scroll-region={displayMode === "panel" ? "submission-detail" : undefined}
        tabIndex={-1}
      >
        <div className={styles.detailGrid}>
          <SubmissionDetailPrimary
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
            <strong>{submission.id}</strong>
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
            <WorkspaceMetaItem>Version {submission.version}</WorkspaceMetaItem>
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
  submission,
  baseUrl,
  onDecisionSaved,
}: Readonly<{
  submission: SubmissionRecord;
  baseUrl: string;
  onDecisionSaved: (decision: EvaluationDecisionRecord) => void;
}>) {
  return (
    <div className={styles.detailPrimary}>
      <section className={styles.detailPanel} aria-labelledby="abstract-heading">
        <div className={styles.panelHeading}>
          <div>
            <p className={styles.eyebrow}>Submission content</p>
            <h2 id="abstract-heading">Abstract</h2>
          </div>
          <span className={styles.versionBadge}>Version {submission.version}</span>
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

      <DecisionControl submission={submission} baseUrl={baseUrl} onSaved={onDecisionSaved} />
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
          : "accepted");
  const [status, setStatus] = useState<EvaluationDecisionStatus>(initialStatus);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notificationState, setNotificationState] = useState<"idle" | "queued" | "confirmed">(
    submission.decision === undefined ? "idle" : "confirmed",
  );
  const hasDecisionApi = submission.evaluationPlanId !== undefined;
  const decisionHistory = submission.decision?.history ?? [];
  const canSubmit = hasDecisionApi && reason.trim().length >= 5 && !busy;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canSubmit || submission.evaluationPlanId === undefined) return;
    setBusy(true);
    setError(null);
    try {
      const decision = await evaluationRequest<EvaluationDecisionRecord>(
        baseUrl,
        `/plans/${encodeURIComponent(submission.evaluationPlanId)}/submissions/${encodeURIComponent(submission.id)}/decision`,
        {
          method: "PUT",
          body: JSON.stringify({
            status,
            reason: reason.trim(),
            ...(submission.decision === undefined
              ? {}
              : { expectedVersion: submission.decision.version }),
            idempotencyKey: `web-decision-${crypto.randomUUID()}`,
          }),
        },
      );
      onSaved(decision);
      setNotificationState("queued");
      setReason("");
    } catch (reasonValue: unknown) {
      setError(
        reasonValue instanceof Error ? reasonValue.message : "The decision could not be saved.",
      );
      setNotificationState("idle");
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
        onStatusChange={setStatus}
        onReasonChange={setReason}
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

type DecisionNotificationState = "idle" | "queued" | "confirmed";

type DecisionFormProps = Readonly<{
  status: EvaluationDecisionStatus;
  reason: string;
  error: string | null;
  busy: boolean;
  hasDecisionApi: boolean;
  canSubmit: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStatusChange: (status: EvaluationDecisionStatus) => void;
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
              onStatusChange(event.currentTarget.value as EvaluationDecisionStatus)
            }
          >
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
      <p className={styles.fieldHelp}>
        The reason and server decision version are retained in the immutable decision history.
      </p>
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
        decision and queue notifications
      </Button>
    </form>
  );
}

type DecisionHistoryProps = Readonly<{
  submission: SubmissionRecord;
  status: EvaluationDecisionStatus;
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
                <p>
                  {transition.reason} · organizer {transition.decidedBy} · decision version{" "}
                  {decisionHistory.indexOf(transition) + 1}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.mutedText}>No decision has been recorded.</p>
      )}
      {notificationState === "queued" ? (
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
        <div>
          <dt>Submission version</dt>
          <dd>{metadata.version}</dd>
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
