"use client";

import Link from "next/link";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useOrganizerEventId } from "./organizer-event-workspace";
import styles from "./submission-workspace.module.css";
import {
  ApiRequestError,
  type EvaluationDecisionRecord,
  type EvaluationDecisionStatus,
  enrichCanonicalSubmission,
  indexOrganizerEvaluationWorkspace,
  initialOrganizerEventName,
  loadCanonicalSubmissionList,
  loadOrganizerEvaluationWorkspace,
  loadOrganizerEventIdentity,
  mapCanonicalSubmission,
  mergeCanonicalSubmissionEvaluation,
  type ReviewDataState,
  reviewDataStateForIndex,
  reviewDataStateFromError,
  type SubmissionLoadFailure,
  type SubmissionRecord,
  type SubmissionSortDirection,
  type SubmissionSortKey,
  type SubmissionStatus,
  submissionListHref,
  submissionListState,
  submissionLoadFailure,
  submissionStatusLabels,
} from "./submission-workspace-model";
import { SubmissionDetailView, SubmissionListView } from "./submission-workspace-views";

export { ReviewDataNotice } from "./submission-workspace-views";

type SortKey = SubmissionSortKey;
type SortDirection = SubmissionSortDirection;
type SubmissionListViewState = {
  search: string;
  status: SubmissionStatus | "all";
  track: string;
  format: string;
  sortKey: SortKey;
  sortDirection: SortDirection;
};

type SubmissionListViewAction =
  | { type: "search-changed"; search: string }
  | { type: "status-changed"; status: SubmissionStatus | "all" }
  | { type: "track-changed"; track: string }
  | { type: "format-changed"; format: string }
  | { type: "sort-toggled"; sortKey: SortKey }
  | { type: "filters-cleared" };

const INITIAL_SUBMISSION_LIST_VIEW_STATE: SubmissionListViewState = {
  search: "",
  status: "all",
  track: "all",
  format: "all",
  sortKey: "updatedAt",
  sortDirection: "desc",
};

function submissionListViewReducer(
  state: SubmissionListViewState,
  action: SubmissionListViewAction,
): SubmissionListViewState {
  switch (action.type) {
    case "search-changed":
      return { ...state, search: action.search };
    case "status-changed":
      return { ...state, status: action.status };
    case "track-changed":
      return { ...state, track: action.track };
    case "format-changed":
      return { ...state, format: action.format };
    case "sort-toggled":
      return state.sortKey === action.sortKey
        ? {
            ...state,
            sortDirection: state.sortDirection === "asc" ? "desc" : "asc",
          }
        : {
            ...state,
            sortKey: action.sortKey,
            sortDirection: action.sortKey === "updatedAt" ? "desc" : "asc",
          };
    case "filters-cleared":
      return { ...state, search: "", status: "all", track: "all", format: "all" };
  }
}
type SubmissionListDataState = {
  submissions: SubmissionRecord[];
  loading: boolean;
  loadFailure: SubmissionLoadFailure | null;
  evaluationLoadState: ReviewDataState;
  evaluationReloadVersion: number;
  eventName: string;
  eventSlug: string | null;
  eventIdentityState: "loading" | "ready" | "failure";
};

type SubmissionListDataAction =
  | { type: "load-reset"; preserveRows: boolean }
  | { type: "scope-invalid"; message: string }
  | { type: "event-identity-succeeded"; name: string; slug: string | null }
  | { type: "event-identity-failed"; message: string }
  | { type: "submissions-succeeded"; submissions: SubmissionRecord[] }
  | {
      type: "evaluation-succeeded";
      submissions: SubmissionRecord[];
      reviewState: ReviewDataState;
    }
  | {
      type: "evaluation-failed";
      submissions: SubmissionRecord[];
      reviewState: ReviewDataState;
    }
  | { type: "load-failed"; failure: SubmissionLoadFailure }
  | { type: "retry-requested" };

const INITIAL_SUBMISSION_LIST_DATA_STATE: SubmissionListDataState = {
  submissions: [],
  loading: true,
  loadFailure: null,
  evaluationLoadState: { status: "pending" },
  evaluationReloadVersion: 0,
  eventName: initialOrganizerEventName(),
  eventSlug: null,
  eventIdentityState: "loading",
};

function submissionListDataReducer(
  state: SubmissionListDataState,
  action: SubmissionListDataAction,
): SubmissionListDataState {
  switch (action.type) {
    case "load-reset":
      return {
        ...state,
        submissions: action.preserveRows ? state.submissions : [],
        loading: !action.preserveRows,
        loadFailure: null,
        evaluationLoadState: { status: "pending" },
        eventName: initialOrganizerEventName(),
        eventSlug: null,
        eventIdentityState: "loading",
      };
    case "scope-invalid":
      return {
        ...state,
        loading: false,
        eventIdentityState: "failure",
        loadFailure: {
          kind: "failure",
          message: action.message,
        },
      };
    case "event-identity-succeeded":
      return {
        ...state,
        eventName: action.name,
        eventSlug: action.slug,
        eventIdentityState: "ready",
      };
    case "event-identity-failed":
      return {
        ...state,
        eventSlug: null,
        eventIdentityState: "failure",
        loadFailure: {
          kind: "failure",
          message: action.message,
        },
      };
    case "submissions-succeeded":
      return {
        ...state,
        submissions: action.submissions,
        loading: false,
      };
    case "evaluation-succeeded":
    case "evaluation-failed":
      return {
        ...state,
        submissions: action.submissions,
        evaluationLoadState: action.reviewState,
      };
    case "load-failed":
      return {
        ...state,
        loading: false,
        loadFailure: action.failure,
      };
    case "retry-requested":
      return {
        ...state,
        evaluationReloadVersion: state.evaluationReloadVersion + 1,
      };
  }
}
type SubmissionDetailState = {
  submission: SubmissionRecord | null;
  loading: boolean;
  loadError: string | null;
  notFound: boolean;
  reloadVersion: number;
};

type SubmissionDetailAction =
  | { type: "load-started" }
  | { type: "invalid-scope"; message: string }
  | { type: "submission-not-found" }
  | { type: "canonical-loaded"; submission: SubmissionRecord }
  | { type: "enrichment-loaded"; submission: SubmissionRecord }
  | { type: "enrichment-failed"; submission: SubmissionRecord }
  | { type: "load-failed"; message: string }
  | { type: "reload-requested" }
  | { type: "decision-saved"; decision: EvaluationDecisionRecord };

const INITIAL_SUBMISSION_DETAIL_STATE: SubmissionDetailState = {
  submission: null,
  loading: true,
  loadError: null,
  notFound: false,
  reloadVersion: 0,
};

function submissionDetailReducer(
  state: SubmissionDetailState,
  action: SubmissionDetailAction,
): SubmissionDetailState {
  switch (action.type) {
    case "load-started":
      return { ...state, loading: true, loadError: null, notFound: false };
    case "invalid-scope":
      return { ...state, loading: false, loadError: action.message, notFound: false };
    case "submission-not-found":
      return { ...state, submission: null, loading: false, notFound: true };
    case "canonical-loaded":
      return { ...state, submission: action.submission, loading: false };
    case "enrichment-loaded":
      return { ...state, submission: action.submission };
    case "enrichment-failed":
      return { ...state, submission: action.submission };
    case "load-failed":
      return {
        ...state,
        submission: null,
        loading: false,
        loadError: action.message,
        notFound: false,
      };
    case "reload-requested":
      return { ...state, reloadVersion: state.reloadVersion + 1 };
    case "decision-saved":
      if (state.submission === null) return state;
      return {
        ...state,
        submission: {
          ...state.submission,
          decision: action.decision,
          status: decisionSubmissionStatus(action.decision.status),
          reviewSummary: {
            ...state.submission.reviewSummary,
            recommendation: `${action.decision.status[0]?.toLocaleUpperCase() ?? ""}${action.decision.status.slice(1)}`,
          },
        },
      };
  }
}

function apiBaseUrl(): string {
  return "";
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
  const [viewState, dispatchView] = useReducer(
    submissionListViewReducer,
    INITIAL_SUBMISSION_LIST_VIEW_STATE,
  );
  const { search, status, track, format, sortKey, sortDirection } = viewState;
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const canonicalRowsEventId = useRef<string | null>(null);
  const [dataState, dispatchData] = useReducer(
    submissionListDataReducer,
    INITIAL_SUBMISSION_LIST_DATA_STATE,
  );
  const {
    submissions,
    loading,
    loadFailure,
    evaluationLoadState,
    evaluationReloadVersion,
    eventName,
    eventSlug,
    eventIdentityState,
  } = dataState;
  const baseUrl = apiBaseUrl();

  useEffect(() => {
    void evaluationReloadVersion;
    let active = true;
    if (organizationId === undefined || organizationId.trim().length === 0) {
      dispatchData({
        type: "scope-invalid",
        message: "An organization-scoped route is required to load submissions.",
      });
      return () => {
        active = false;
      };
    }
    const rowsLoadedForEvent = canonicalRowsEventId.current === eventId;
    dispatchData({ type: "load-reset", preserveRows: rowsLoadedForEvent });
    const eventController = new AbortController();
    void loadOrganizerEventIdentity(baseUrl, organizationId, eventId, eventController.signal)
      .then((event) => {
        if (active) {
          dispatchData({
            type: "event-identity-succeeded",
            name: event.name,
            slug: event.slug,
          });
        }
      })
      .catch((error: unknown) => {
        if (!active || eventController.signal.aborted) return;
        dispatchData({
          type: "event-identity-failed",
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
        dispatchData({ type: "submissions-succeeded", submissions: canonicalRows });
        void workspacePromise.then(({ workspace, error }) => {
          if (!active) return;
          if (workspace === null) {
            const reviewState = reviewDataStateFromError(error);
            dispatchData({
              type: "evaluation-failed",
              submissions: canonicalRows.map((record) => ({
                ...record,
                reviewData: reviewState,
              })),
              reviewState,
            });
            return;
          }
          const index = indexOrganizerEvaluationWorkspace(workspace);
          const reviewState = reviewDataStateForIndex(index);
          dispatchData({
            type: "evaluation-succeeded",
            submissions: records.map((record) => ({
              ...mergeCanonicalSubmissionEvaluation(record, index),
              reviewData: reviewState,
            })),
            reviewState,
          });
        });
      })
      .catch((reason: unknown) => {
        if (active) {
          dispatchData({
            type: "load-failed",
            failure: submissionLoadFailure(
              reason instanceof ApiRequestError ? reason.status : undefined,
              reason instanceof Error ? reason.message : undefined,
            ),
          });
        }
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
        const leftValue =
          sortKey === "status" ? submissionStatusLabels[left.status] : left[sortKey];
        const rightValue =
          sortKey === "status" ? submissionStatusLabels[right.status] : right[sortKey];
        const result = String(leftValue).localeCompare(String(rightValue));
        return sortDirection === "asc" ? result : -result;
      });
  }, [format, search, sortDirection, sortKey, status, submissions, track]);

  const selectedVisibleCount = filteredSubmissions.filter((submission) =>
    selected.has(submission.id),
  ).length;
  const filtersActive =
    search.trim().length > 0 || status !== "all" || track !== "all" || format !== "all";
  const allVisibleSelected =
    filteredSubmissions.length > 0 && selectedVisibleCount === filteredSubmissions.length;

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

  return (
    <SubmissionListView
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
      onSearchChange={(nextSearch) => dispatchView({ type: "search-changed", search: nextSearch })}
      onStatusChange={(nextStatus) => dispatchView({ type: "status-changed", status: nextStatus })}
      onTrackChange={(nextTrack) => dispatchView({ type: "track-changed", track: nextTrack })}
      onFormatChange={(nextFormat) => dispatchView({ type: "format-changed", format: nextFormat })}
      onClearFilters={() => dispatchView({ type: "filters-cleared" })}
      onSort={(nextSortKey) => dispatchView({ type: "sort-toggled", sortKey: nextSortKey })}
      onToggleSelected={toggleSelected}
      onToggleAllVisible={toggleAllVisible}
      onRetry={() => dispatchData({ type: "retry-requested" })}
      detailPanel={
        selectedSubmissionId === undefined ? null : (
          <SubmissionDetailWorkspace
            organizationId={organizationId}
            eventId={eventId}
            submissionId={selectedSubmissionId}
            displayMode="panel"
          />
        )
      }
    />
  );
}

function decisionSubmissionStatus(status: EvaluationDecisionStatus): SubmissionStatus {
  return status === "accepted" ? "accepted" : status === "waitlisted" ? "waitlisted" : "declined";
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
  const [detailState, dispatchDetail] = useReducer(
    submissionDetailReducer,
    INITIAL_SUBMISSION_DETAIL_STATE,
  );
  const { submission, loading, loadError, notFound, reloadVersion } = detailState;
  const [eventName, setEventName] = useState(initialOrganizerEventName);
  const [eventSlug, setEventSlug] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (organizationId === undefined || organizationId.trim().length === 0) {
      dispatchDetail({
        type: "invalid-scope",
        message: "An organization-scoped route is required to load submissions.",
      });
      return () => {
        active = false;
      };
    }
    dispatchDetail({ type: "load-started" });
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
          dispatchDetail({ type: "submission-not-found" });
          return;
        }
        const canonical = mapCanonicalSubmission(envelope);
        dispatchDetail({ type: "canonical-loaded", submission: canonical });
        void enrichCanonicalSubmission(baseUrl, envelope, organizationId)
          .then((loaded) => {
            if (active) dispatchDetail({ type: "enrichment-loaded", submission: loaded });
          })
          .catch((reason: unknown) => {
            if (active) {
              dispatchDetail({
                type: "enrichment-failed",
                submission: {
                  ...canonical,
                  reviewData: reviewDataStateFromError(reason),
                },
              });
            }
          });
      })
      .catch((reason: unknown) => {
        if (active) {
          dispatchDetail({
            type: "load-failed",
            message: reason instanceof Error ? reason.message : "Submission could not be loaded.",
          });
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

  return (
    <SubmissionDetailView
      eventId={eventId}
      organizationId={organizationId}
      displayMode={displayMode}
      eventName={eventName}
      eventSlug={eventSlug}
      submission={submission}
      baseUrl={baseUrl}
      onDecisionSaved={(decision) => dispatchDetail({ type: "decision-saved", decision })}
      onRetry={() => dispatchDetail({ type: "reload-requested" })}
    />
  );
}
