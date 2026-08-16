"use client";

import { useEffect, useRef, useState } from "react";
import type {
  ReviewerInboxFilters,
  ReviewerInboxGroupBy,
  ReviewerInboxStatusView,
} from "../reviewer-inbox";
import {
  emptyReviewerInboxFilters,
  filterReviewerInbox,
  groupReviewerInbox,
  reviewerInboxItems,
} from "../reviewer-inbox";
import type { EvaluatorDraftSnapshot } from "./evaluator-evaluator-draft-snapshot";
import type { ReviewerQueueEntry } from "./evaluator-queue-reviewer-queue-entry";
import { reviewerSelectionBlocked } from "./evaluator-queue-reviewer-selection-blocked";
import {
  syncReviewerQueueRouteSelection,
  useReviewerQueueRouteHistory,
} from "./evaluator-review-route-history";

export interface ReviewerQueueProps {
  entries: readonly ReviewerQueueEntry[];
  baseUrl: string;
  initialSelectedAssignmentId?: string | undefined;
}

export function useReviewerQueueController({
  entries,
  baseUrl,
  initialSelectedAssignmentId,
}: ReviewerQueueProps) {
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedAssignmentId ?? null);
  const pendingAutosaveAssignmentRef = useRef<string | null>(null);
  const [pendingAutosaveAssignmentId, setPendingAutosaveAssignmentId] = useState<string | null>(
    null,
  );
  const [recusedIds, setRecusedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [submittedAtById, setSubmittedAtById] = useState<Readonly<Record<string, string>>>({});
  const [draftsById, setDraftsById] = useState<Readonly<Record<string, EvaluatorDraftSnapshot>>>(
    {},
  );
  const [statusView, setStatusView] = useState<ReviewerInboxStatusView>("all");
  const [filters, setFilters] = useState<ReviewerInboxFilters>(emptyReviewerInboxFilters);
  const [groupBy, setGroupBy] = useState<ReviewerInboxGroupBy>("none");
  const queueActionRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const restoreQueueFocusIdRef = useRef<string | null>(null);
  const normalizedAssignments = entries.map(({ assignment }) => ({
    ...assignment,
    organizationId: assignment.organizationId ?? assignment.eventId,
    organizationName:
      assignment.organizationName?.trim() &&
      assignment.organizationName !== assignment.organizationId &&
      assignment.organizationName !== assignment.eventId
        ? assignment.organizationName
        : "Organization",
    eventName:
      assignment.eventName.trim() && assignment.eventName !== assignment.eventId
        ? assignment.eventName
        : "Assigned event",
    roundId: assignment.round.id,
    roundName: assignment.round.name,
    track: assignment.track ?? null,
    dueAt: assignment.dueAt ?? assignment.round.closesAt ?? null,
    assignmentStatus: assignment.assignmentStatus ?? "assigned",
  }));
  const inboxItems = reviewerInboxItems(
    normalizedAssignments,
    recusedIds,
    submittedAtById,
    new Date(),
  );
  const filteredItems = filterReviewerInbox(inboxItems, statusView, filters);
  const groupedItems = groupReviewerInbox(filteredItems, groupBy);
  const visibleEntries = groupedItems.flatMap((group) =>
    group.items.map(({ assignment }, index) => ({
      assignment,
      groupLabel: group.label,
      groupCount: group.items.length,
      groupStart: groupBy !== "none" && index === 0,
    })),
  );
  const selectedVisible = visibleEntries.some((entry) => entry.assignment.id === selectedId);
  const navigationEntries = selectedVisible
    ? visibleEntries
    : inboxItems.map(({ assignment }) => ({ assignment }));
  const selectedBase =
    inboxItems.find(({ assignment }) => assignment.id === selectedId)?.assignment ?? null;
  const selectedDraft = selectedBase === null ? undefined : draftsById[selectedBase.id];
  const selected =
    selectedBase === null || selectedDraft === undefined
      ? selectedBase
      : {
          ...selectedBase,
          initialScores: selectedDraft.scoreValues,
          initialResponses: selectedDraft.responseValues,
          initialConfirmed: selectedDraft.humanConfirmed,
          initialComment: selectedDraft.comment,
          reviewVersion: selectedDraft.reviewVersion,
        };
  const selectedIndex =
    selectedBase === null
      ? -1
      : navigationEntries.findIndex((entry) => entry.assignment.id === selectedBase.id);
  const statusCounts = {
    all: inboxItems.length,
    needsReview: inboxItems.filter(({ status }) => status === "assigned").length,
    inProgress: inboxItems.filter(({ status }) => status === "in_progress").length,
    submitted: inboxItems.filter(({ status }) => status === "submitted").length,
  };
  const organizationOptions = [
    ...new Map(
      inboxItems.map(({ assignment }) => [assignment.organizationId, assignment.organizationName]),
    ),
  ].sort((left, right) => left[1].localeCompare(right[1]));
  const eventOptions = [
    ...new Map(
      inboxItems
        .filter(
          ({ assignment }) =>
            filters.organizationId === "all" ||
            assignment.organizationId === filters.organizationId,
        )
        .map(({ assignment }) => [assignment.eventId, assignment.eventName]),
    ),
  ].sort((left, right) => left[1].localeCompare(right[1]));
  const roundOptions = [
    ...new Map(
      inboxItems
        .filter(
          ({ assignment }) =>
            (filters.organizationId === "all" ||
              assignment.organizationId === filters.organizationId) &&
            (filters.eventId === "all" || assignment.eventId === filters.eventId),
        )
        .map(({ assignment, roundKey }) => [
          roundKey,
          `${assignment.eventName} · ${assignment.roundName}`,
        ]),
    ),
  ].sort((left, right) => left[1].localeCompare(right[1]));
  const trackOptions = [
    ...new Set(
      inboxItems.flatMap(({ assignment }) => (assignment.track === null ? [] : [assignment.track])),
    ),
  ].sort((left, right) => left.localeCompare(right));
  const filtersActive =
    statusView !== "all" ||
    filters.organizationId !== "all" ||
    filters.eventId !== "all" ||
    filters.roundKey !== "all" ||
    filters.due !== "all" ||
    filters.track !== "all";

  useReviewerQueueRouteHistory({
    entries,
    pendingAutosaveAssignmentRef,
    restoreQueueFocusIdRef,
    selectedId,
    setSelectedId,
  });

  useEffect(() => {
    if (selectedId !== null) return;
    const restoreId = restoreQueueFocusIdRef.current;
    if (restoreId === null) return;
    queueActionRefs.current[restoreId]?.focus();
    queueActionRefs.current[restoreId]?.scrollIntoView({ block: "center" });
    restoreQueueFocusIdRef.current = null;
  }, [selectedId]);

  function updateAutosavePending(assignmentId: string, pending: boolean): void {
    if (pending) {
      pendingAutosaveAssignmentRef.current = assignmentId;
      setPendingAutosaveAssignmentId(assignmentId);
      return;
    }
    if (pendingAutosaveAssignmentRef.current === assignmentId)
      pendingAutosaveAssignmentRef.current = null;
    setPendingAutosaveAssignmentId((current) => (current === assignmentId ? null : current));
  }
  function selectAssignment(nextAssignmentId: string | null): boolean {
    if (
      reviewerSelectionBlocked(pendingAutosaveAssignmentRef.current, selectedId, nextAssignmentId)
    ) {
      return false;
    }
    setSelectedId(nextAssignmentId);
    syncReviewerQueueRouteSelection(selectedId, nextAssignmentId);
    return true;
  }
  function clearFilters(): void {
    setStatusView("all");
    setFilters(emptyReviewerInboxFilters);
  }

  return {
    baseUrl,
    selectedId,
    setSelectedId,
    pendingAutosaveAssignmentId,
    recusedIds,
    setRecusedIds,
    submittedAtById,
    setSubmittedAtById,
    draftsById,
    setDraftsById,
    statusView,
    setStatusView,
    filters,
    setFilters,
    groupBy,
    setGroupBy,
    queueActionRefs,
    restoreQueueFocusIdRef,
    inboxItems,
    filteredItems,
    visibleEntries,
    navigationEntries,
    selected,
    selectedIndex,
    statusCounts,
    organizationOptions,
    eventOptions,
    roundOptions,
    trackOptions,
    filtersActive,
    updateAutosavePending,
    selectAssignment,
    clearFilters,
  };
}

export type ReviewerQueueController = ReturnType<typeof useReviewerQueueController>;
