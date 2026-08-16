"use client";

import { ListFilter, Search, X } from "lucide-react";
import Link from "next/link";
import { Popover } from "radix-ui";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
import { useOrganizerEventId } from "./organizer-event-workspace";
import { SubmissionDetailDrawer } from "./submission-detail-drawer";
import styles from "./submission-workspace.module.css";
import {
  ApiRequestError,
  answerText,
  decisionNotificationSummary,
  type EvaluationDecisionRecord,
  type EvaluationDecisionStatus,
  enrichCanonicalSubmission,
  evaluationRequest,
  formatDateTime,
  getAcceptedHandoffMetadata,
  indexOrganizerEvaluationWorkspace,
  initialOrganizerEventName,
  loadCanonicalSubmissionList,
  loadOrganizerEvaluationWorkspace,
  loadOrganizerEventIdentity,
  mapCanonicalSubmission,
  mergeCanonicalSubmissionEvaluation,
  type ReviewAssignment,
  type ReviewDataState,
  reviewDataIsReady,
  reviewDataMessage,
  reviewDataStateForIndex,
  reviewDataStateFromError,
  type SubmissionLoadFailure,
  type SubmissionRecord,
  type SubmissionStatus,
  submissionListState,
  submissionLoadFailure,
} from "./submission-workspace-model";

const statusLabels: Record<SubmissionStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  reopened: "Reopened",
  under_review: "Under review",
  accepted: "Accepted",
  waitlisted: "Waitlisted",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

const reviewStatusLabels: Record<ReviewAssignment["status"], string> = {
  complete: "Complete",
  in_progress: "In progress",
  not_started: "Not started",
  abstained: "Abstained",
};

type SortKey = "title" | "status" | "updatedAt";
type SortDirection = "asc" | "desc";

const sortLabels: Record<SortKey, string> = {
  title: "Title",
  status: "Status",
  updatedAt: "Last updated",
};

function apiBaseUrl(): string {
  return "";
}
function submissionListHref(eventId: string, organizationId: string): string {
  return `/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventId)}/submissions`;
}

function submissionHref(eventId: string, submissionId: string, organizationId: string): string {
  return `${submissionListHref(eventId, organizationId)}/${encodeURIComponent(submissionId)}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
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
      {statusLabels[status]}
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

export function SubmissionListWorkspace({
  eventId: fallbackEventId,
  organizationId,
  selectedSubmissionId,
}: Readonly<{
  eventId: string;
  organizationId: string;
  selectedSubmissionId?: string;
}>) {
  const eventId = useOrganizerEventId(fallbackEventId);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SubmissionStatus | "all">("all");
  const [track, setTrack] = useState("all");
  const [format, setFormat] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const canonicalRowsEventId = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailure, setLoadFailure] = useState<SubmissionLoadFailure | null>(null);
  const [evaluationLoadState, setEvaluationLoadState] = useState<ReviewDataState>({
    status: "pending",
  });
  const [evaluationReloadVersion, setEvaluationReloadVersion] = useState(0);
  const baseUrl = apiBaseUrl();
  const [eventName, setEventName] = useState(initialOrganizerEventName);
  const [eventSlug, setEventSlug] = useState<string | null>(null);
  const [eventIdentityState, setEventIdentityState] = useState<"loading" | "ready" | "failure">(
    "loading",
  );

  useEffect(() => {
    void evaluationReloadVersion;
    let active = true;
    if (organizationId === undefined || organizationId.trim().length === 0) {
      setLoading(false);
      setEventIdentityState("failure");
      setLoadFailure({
        kind: "failure",
        message: "An organization-scoped route is required to load submissions.",
      });
      return () => {
        active = false;
      };
    }
    const rowsLoadedForEvent = canonicalRowsEventId.current === eventId;
    if (!rowsLoadedForEvent) setSubmissions([]);
    setLoading(!rowsLoadedForEvent);
    setLoadFailure(null);
    setEvaluationLoadState({ status: "pending" });
    setEventName(initialOrganizerEventName());
    setEventSlug(null);
    setEventIdentityState("loading");
    const eventController = new AbortController();
    void loadOrganizerEventIdentity(baseUrl, organizationId, eventId, eventController.signal)
      .then((event) => {
        if (active) {
          setEventName(event.name);
          setEventSlug(event.slug);
          setEventIdentityState("ready");
        }
      })
      .catch((error: unknown) => {
        if (!active || eventController.signal.aborted) return;
        setEventIdentityState("failure");
        setEventSlug(null);
        setLoadFailure({
          kind: "failure",
          message:
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : "Event details could not be loaded.",
        });
      });

    const workspacePromise = loadOrganizerEvaluationWorkspace(
      baseUrl,
      eventId,
      eventController.signal,
    )
      .then((workspace) => ({ workspace, error: null }))
      .catch((error: unknown) => ({ workspace: null, error }));
    void loadCanonicalSubmissionList(baseUrl, organizationId, eventId, eventController.signal)
      .then((records) => {
        if (!active) return;
        const canonicalRows = records.map(mapCanonicalSubmission);
        canonicalRowsEventId.current = eventId;
        setSubmissions(canonicalRows);
        setLoading(false);
        void workspacePromise.then(({ workspace, error }) => {
          if (!active) return;
          if (workspace === null) {
            const reviewState = reviewDataStateFromError(error);
            setEvaluationLoadState(reviewState);
            setSubmissions(
              canonicalRows.map((record) => ({
                ...record,
                reviewData: reviewState,
              })),
            );
            return;
          }
          const index = indexOrganizerEvaluationWorkspace(workspace);
          const reviewState = reviewDataStateForIndex(index);
          setEvaluationLoadState(reviewState);
          setSubmissions(
            records.map((record) => ({
              ...mergeCanonicalSubmissionEvaluation(record, index),
              reviewData: reviewState,
            })),
          );
        });
      })
      .catch((reason: unknown) => {
        if (active) {
          setLoadFailure(
            submissionLoadFailure(
              reason instanceof ApiRequestError ? reason.status : undefined,
              reason instanceof Error ? reason.message : undefined,
            ),
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      eventController.abort();
      active = false;
    };
  }, [baseUrl, eventId, organizationId, evaluationReloadVersion]);

  const tracks = useMemo(
    () => [...new Set(submissions.map((submission) => submission.track))].sort(),
    [submissions],
  );
  const formats = useMemo(
    () => [...new Set(submissions.map((submission) => submission.format))].sort(),
    [submissions],
  );
  const filteredSubmissions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return submissions
      .filter((submission) => {
        if (status !== "all" && submission.status !== status) return false;
        if (track !== "all" && submission.track !== track) return false;
        if (format !== "all" && submission.format !== format) return false;
        if (!query) return true;
        return [
          submission.title,
          submission.track,
          submission.format,
          ...submission.participants.map((participant) => participant.name),
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query);
      })
      .sort((left, right) => {
        const leftValue = sortKey === "status" ? statusLabels[left.status] : left[sortKey];
        const rightValue = sortKey === "status" ? statusLabels[right.status] : right[sortKey];
        const result = String(leftValue).localeCompare(String(rightValue));
        return sortDirection === "asc" ? result : -result;
      });
  }, [format, search, sortDirection, sortKey, status, submissions, track]);
  const selectedSubmission =
    selectedSubmissionId === undefined
      ? undefined
      : submissions.find((submission) => submission.id === selectedSubmissionId);

  const selectedVisibleCount = filteredSubmissions.filter((submission) =>
    selected.has(submission.id),
  ).length;
  const activeFilterCount =
    (status === "all" ? 0 : 1) + (track === "all" ? 0 : 1) + (format === "all" ? 0 : 1);
  const allVisibleSelected =
    filteredSubmissions.length > 0 && selectedVisibleCount === filteredSubmissions.length;

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "updatedAt" ? "desc" : "asc");
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        filteredSubmissions.forEach((submission) => {
          next.delete(submission.id);
        });
      } else {
        filteredSubmissions.forEach((submission) => {
          next.add(submission.id);
        });
      }
      return next;
    });
  }

  const listState = submissionListState({
    loading: loading || eventIdentityState === "loading",
    loadFailure,
    submissionCount: submissions.length,
    visibleCount: filteredSubmissions.length,
  });
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
        <div className={styles.reviewDesk}>
          <div className={styles.submissionMaster}>
            <section
              id="submission-list-card"
              className={styles.listPanel}
              aria-labelledby="submission-table-heading"
              data-submission-collection="true"
            >
              <h2 id="submission-table-heading" className={styles.srOnly}>
                {submissions.length === 0 ? "Submission inbox" : "Submission queue"}
              </h2>

              {submissions.length > 0 ? (
                <div className={styles.listContent}>
                  <ReviewDataNotice
                    state={evaluationLoadState}
                    onRetry={() => setEvaluationReloadVersion((current) => current + 1)}
                    {...(eventSlug === null
                      ? {}
                      : {
                          setupHref: `/admin/organizations/${encodeURIComponent(organizationId)}/events/${encodeURIComponent(eventSlug)}/reviews`,
                        })}
                  />
                  <div className={styles.toolbar}>
                    <p className={styles.collectionCount} aria-live="polite">
                      <span>
                        {filteredSubmissions.length} of {submissions.length}
                      </span>
                      {selectedVisibleCount > 0 ? (
                        <strong>{selectedVisibleCount} selected</strong>
                      ) : null}
                    </p>
                    <div className={styles.toolbarControls}>
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
                          onChange={(event) => setSearch(event.currentTarget.value)}
                        />
                        {search.length > 0 ? (
                          <Button
                            className={styles.clearSearch}
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Clear submission search"
                            onClick={() => setSearch("")}
                          >
                            <X aria-hidden="true" />
                          </Button>
                        ) : null}
                      </div>
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
                              {activeFilterCount > 0 ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="xs"
                                  onClick={() => {
                                    setStatus("all");
                                    setTrack("all");
                                    setFormat("all");
                                  }}
                                >
                                  Clear
                                </Button>
                              ) : null}
                            </div>
                            <fieldset className={styles.filterMenu}>
                              <legend className={styles.srOnly}>Filter submissions</legend>
                              <div className={styles.filterRow}>
                                <label htmlFor="submission-status">Status</label>
                                <Select
                                  value={status}
                                  onValueChange={(value) =>
                                    setStatus(value as SubmissionStatus | "all")
                                  }
                                >
                                  <SelectTrigger
                                    id="submission-status"
                                    className={styles.filterSelectTrigger}
                                  >
                                    <SelectValue placeholder="All statuses" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="all">All statuses</SelectItem>
                                    {Object.entries(statusLabels).map(([value, label]) => (
                                      <SelectItem key={value} value={value}>
                                        {label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className={styles.filterRow}>
                                <label htmlFor="submission-track">Track</label>
                                <Select value={track} onValueChange={setTrack}>
                                  <SelectTrigger
                                    id="submission-track"
                                    className={styles.filterSelectTrigger}
                                  >
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
                              <div className={styles.filterRow}>
                                <label htmlFor="submission-format">Format</label>
                                <Select value={format} onValueChange={setFormat}>
                                  <SelectTrigger
                                    id="submission-format"
                                    className={styles.filterSelectTrigger}
                                  >
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
                            </fieldset>
                          </Popover.Content>
                        </Popover.Portal>
                      </Popover.Root>
                    </div>
                  </div>

                  {listState === "loading" ? (
                    <div className={styles.emptyState} role="status" aria-live="polite">
                      <h3>Loading submissions</h3>
                      <p>We&apos;re getting the latest proposals for this event.</p>
                    </div>
                  ) : listState === "failure" || listState === "unconfigured" ? (
                    <div className={styles.emptyState} role="alert">
                      <h3>
                        {listState === "unconfigured"
                          ? "Set up submission intake"
                          : "Unable to load submissions"}
                      </h3>
                      <p>{loadFailure?.message ?? "Submissions could not be loaded."}</p>
                      {listState === "failure" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setEvaluationReloadVersion((value) => value + 1)}
                        >
                          Retry submissions
                        </Button>
                      ) : null}
                    </div>
                  ) : listState === "filtered_empty" ? (
                    <div className={styles.emptyState} role="status">
                      <h3>No matching submissions</h3>
                      <p>Try a different search or clear the filters to see more proposals.</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSearch("");
                          setStatus("all");
                          setTrack("all");
                          setFormat("all");
                        }}
                      >
                        Clear filters
                      </Button>
                    </div>
                  ) : (
                    <div className={styles.tableWrap} data-scroll-region="submission-queue">
                      <Table className={styles.submissionTable}>
                        <TableCaption className={styles.srOnly}>
                          Submissions for {eventName}
                        </TableCaption>
                        <TableHeader>
                          <TableRow>
                            <TableHead className={styles.checkboxColumn} scope="col">
                              <Checkbox
                                checked={
                                  allVisibleSelected
                                    ? true
                                    : selectedVisibleCount > 0
                                      ? "indeterminate"
                                      : false
                                }
                                onCheckedChange={toggleAllVisible}
                                aria-label="Select all visible submissions"
                              />
                            </TableHead>
                            <SortableHeader
                              className={styles.titleColumn}
                              sortKey="title"
                              activeKey={sortKey}
                              direction={sortDirection}
                              onSort={toggleSort}
                            >
                              Title
                            </SortableHeader>
                            <SortableHeader
                              className={styles.statusColumn}
                              sortKey="status"
                              activeKey={sortKey}
                              direction={sortDirection}
                              onSort={toggleSort}
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
                              onSort={toggleSort}
                            >
                              Updated
                            </SortableHeader>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredSubmissions.map((submission) => (
                            <TableRow
                              key={submission.id}
                              aria-current={
                                submission.id === selectedSubmissionId ? "page" : undefined
                              }
                              data-state={
                                submission.id === selectedSubmissionId ? "selected" : undefined
                              }
                              data-bulk-selected={selected.has(submission.id) ? "true" : "false"}
                              aria-selected={selected.has(submission.id)}
                              data-submission-row-layout="summary"
                            >
                              <TableCell className={styles.checkboxColumn}>
                                <Checkbox
                                  checked={selected.has(submission.id)}
                                  onCheckedChange={() => toggleSelected(submission.id)}
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
                                  title={submission.participants
                                    .map((participant) => participant.name)
                                    .join(", ")}
                                >
                                  {submission.participants.length === 0
                                    ? "No speaker"
                                    : submission.participants
                                        .map((participant) => participant.name)
                                        .join(", ")}
                                </span>
                              </TableCell>
                              <TableCell className={styles.reviewCell}>
                                <span className={styles.mobileLabel}>Reviews</span>
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
                              <TableCell className={styles.taxonomyCell}>
                                <span className={styles.mobileLabel}>Track / format</span>
                                <span className={styles.trackValue}>{submission.track}</span>
                                <span className={styles.submissionMeta}>{submission.format}</span>
                              </TableCell>
                              <TableCell className={styles.updatedCell}>
                                <span className={styles.mobileLabel}>Updated</span>
                                <time dateTime={submission.updatedAt}>
                                  {formatDate(submission.updatedAt)}
                                </time>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              ) : listState === "loading" ? (
                <div className={styles.listContent}>
                  <div className={styles.emptyState} role="status" aria-live="polite">
                    <h3>Loading submissions</h3>
                    <p>We&apos;re getting the latest proposals for this event.</p>
                  </div>
                </div>
              ) : listState === "failure" || listState === "unconfigured" ? (
                <div className={styles.listContent}>
                  <div className={styles.emptyState} role="alert">
                    <h3>
                      {listState === "unconfigured"
                        ? "Set up submission intake"
                        : "Unable to load submissions"}
                    </h3>
                    <p>{loadFailure?.message ?? "Submissions could not be loaded."}</p>
                    {listState === "failure" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEvaluationReloadVersion((value) => value + 1)}
                      >
                        Retry submissions
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className={styles.emptyCardContent}>
                  <Empty className={styles.emptyState} role="status">
                    <EmptyHeader>
                      <EmptyTitle>No submissions yet</EmptyTitle>
                      <EmptyDescription>
                        Share the public call for proposals to start collecting sessions for{" "}
                        {eventName}.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </div>
              )}
            </section>
          </div>
        </div>
        {selectedSubmissionId === undefined ? null : (
          <SubmissionDetailDrawer
            closeHref={submissionListHref(eventId, organizationId)}
            title={selectedSubmission?.title ?? "Submission details"}
          >
            <SubmissionDetailWorkspace
              organizationId={organizationId}
              eventId={eventId}
              submissionId={selectedSubmissionId}
              displayMode="panel"
            />
          </SubmissionDetailDrawer>
        )}
      </div>
    </div>
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
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onSort: (sortKey: SortKey) => void;
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

function decisionSubmissionStatus(status: EvaluationDecisionStatus): SubmissionStatus {
  return status === "accepted" ? "accepted" : status === "waitlisted" ? "waitlisted" : "declined";
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
      <form onSubmit={handleSubmit}>
        <div className={styles.formGrid}>
          <div className={styles.filterField}>
            <label htmlFor="decision-status">Decision outcome</label>
            <select
              id="decision-status"
              value={status}
              disabled={!hasDecisionApi || busy}
              onChange={(event) => setStatus(event.currentTarget.value as EvaluationDecisionStatus)}
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
          onChange={(event) => setReason(event.currentTarget.value)}
        />
        <p className={styles.fieldHelp}>
          The reason is retained in the immutable decision history.
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
                  <time dateTime={transition.decidedAt}>
                    {formatDateTime(transition.decidedAt)}
                  </time>
                  <p>{transition.reason} · recorded by organizer</p>
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
export function SubmissionDetailWorkspace({
  eventId,
  submissionId,
  organizationId,
  displayMode = "page",
}: Readonly<{
  eventId: string;
  submissionId: string;
  organizationId: string;
  displayMode?: "page" | "panel";
}>) {
  const baseUrl = apiBaseUrl();
  const [submission, setSubmission] = useState<SubmissionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [eventName, setEventName] = useState(initialOrganizerEventName);
  const [eventSlug, setEventSlug] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (organizationId === undefined || organizationId.trim().length === 0) {
      setLoading(false);
      setNotFound(false);
      setLoadError("An organization-scoped route is required to load submissions.");
      return () => {
        active = false;
      };
    }
    setLoading(true);
    setLoadError(null);
    setNotFound(false);
    setEventName(initialOrganizerEventName());
    setEventSlug(null);
    const controller = new AbortController();

    void loadOrganizerEventIdentity(baseUrl, organizationId, eventId, controller.signal)
      .then((event) => {
        if (active) {
          setEventName(event.name);
          setEventSlug(event.slug);
        }
      })
      .catch(() => undefined);
    void loadCanonicalSubmissionList(baseUrl, organizationId, eventId, controller.signal)
      .then((records) => {
        if (!active) return;
        const envelope = records.find((candidate) => candidate.submission.id === submissionId);
        if (envelope === undefined) {
          setSubmission(null);
          setNotFound(true);
          setLoading(false);
          return;
        }
        const canonical = mapCanonicalSubmission(envelope);
        setSubmission(canonical);
        setLoading(false);
        void enrichCanonicalSubmission(baseUrl, envelope, organizationId)
          .then((loaded) => {
            if (active) setSubmission(loaded);
          })
          .catch((reason: unknown) => {
            if (active) {
              setSubmission({
                ...canonical,
                reviewData: reviewDataStateFromError(reason),
              });
            }
          });
      })
      .catch((reason: unknown) => {
        if (active) {
          setSubmission(null);
          setNotFound(false);
          setLoadError(
            reason instanceof Error ? reason.message : "Submission could not be loaded.",
          );
          setLoading(false);
        }
      });
    return () => {
      active = false;
      controller.abort(`Submission load attempt ${reloadVersion} was superseded.`);
    };
  }, [baseUrl, eventId, organizationId, reloadVersion, submissionId]);

  if (loading) {
    return (
      <section
        className={displayMode === "panel" ? styles.reviewPanel : styles.workspaceRoot}
        aria-label={displayMode === "panel" ? "Submission review panel" : "Submission details"}
      >
        <div className={styles.notFound} role="status">
          <p className={styles.eyebrow}>Organizer workspace</p>
          <h1>Loading submission</h1>
          <p>Loading this submission.</p>
        </div>
      </section>
    );
  }
  if (!submission) {
    return (
      <section
        className={displayMode === "panel" ? styles.reviewPanel : styles.workspaceRoot}
        aria-label={displayMode === "panel" ? "Submission review panel" : "Submission details"}
      >
        <div className={styles.notFound} role="alert">
          <p className={styles.eyebrow}>Organizer workspace</p>
          <h1>{notFound ? "Submission not found" : "Unable to load submission"}</h1>
          <p>
            {notFound
              ? "This submission is not part of the selected event."
              : (loadError ?? "Submission could not be loaded.")}
          </p>
          <Link className={styles.primaryLink} href={submissionListHref(eventId, organizationId)}>
            Back to submissions
          </Link>
        </div>
      </section>
    );
  }
  const submittedReviewRead = submission.submittedReviewRead ?? {
    status: "ready",
    count: submission.reviewAssignments.filter((assignment) => assignment.status === "complete")
      .length,
  };

  return (
    <section
      className={displayMode === "panel" ? styles.reviewPanel : styles.workspaceRoot}
      aria-label={displayMode === "panel" ? "Submission review panel" : "Submission details"}
    >
      {displayMode === "page" ? (
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
                {statusLabels[submission.status]}
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
                    <dd>{statusLabels[submission.status]}</dd>
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
              submission={submission}
              baseUrl={baseUrl}
              onSaved={(decision) => {
                setSubmission((current) =>
                  current === null
                    ? current
                    : {
                        ...current,
                        decision,
                        status: decisionSubmissionStatus(decision.status),
                        reviewSummary: {
                          ...current.reviewSummary,
                          recommendation: `${decision.status[0]?.toLocaleUpperCase() ?? ""}${decision.status.slice(1)}`,
                        },
                      },
                );
              }}
            />
            <AcceptedHandoffSummary submission={submission} />
            <ReopenControl submission={submission} baseUrl={baseUrl} />
          </div>

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
                      {participant.biography ? (
                        <span>Biography: {participant.biography}</span>
                      ) : null}
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
                onRetry={() => setReloadVersion((current) => current + 1)}
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
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setReloadVersion((current) => current + 1)}
                    >
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

            <section className={styles.detailPanel} aria-labelledby="assignment-heading">
              <p className={styles.eyebrow}>Access controls</p>
              <h2 id="assignment-heading">Assignment &amp; conflicts</h2>
              <p className={styles.mutedText}>
                Assignments are event-scoped. A declared conflict removes reviewer access and keeps
                the submission out of that reviewer&apos;s queue.
              </p>
              <ul className={styles.conflictList}>
                {submission.reviewAssignments
                  .filter((assignment) => assignment.conflict)
                  .map((assignment) => (
                    <li key={assignment.reviewer}>
                      <strong>{assignment.reviewer}</strong> — {assignment.conflict}
                    </li>
                  ))}
              </ul>
              {submission.reviewAssignments.every((assignment) => !assignment.conflict) ? (
                <p className={styles.noConflict}>No conflicts recorded for this submission.</p>
              ) : null}
            </section>

            <section className={styles.detailPanel} aria-labelledby="notes-heading">
              <p className={styles.eyebrow}>Private organizer note</p>
              <h2 id="notes-heading">Organizer notes</h2>
              <p className={styles.mutedText}>{submission.organizerNotes}</p>
            </section>
          </aside>
        </div>
      </div>
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

export const AdminSubmissionList = SubmissionListWorkspace;
export const AdminSubmissionDetail = SubmissionDetailWorkspace;
