"use client";

import { type Dispatch, type RefObject, type SetStateAction, useEffect, useRef } from "react";
import type { ReviewerQueueEntry } from "./evaluator-queue-reviewer-queue-entry";
import { reviewerSelectionBlocked } from "./evaluator-queue-reviewer-selection-blocked";
import {
  reviewAssignmentIdFromSearchParams,
  reviewQueueUrlWithAssignment,
} from "./evaluator-review-route-state";

const reviewerDrawerHistoryKey = "__eventloomReviewerDrawer";

function browserRelativeUrl(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}

function reviewerDrawerHistoryEntry(): boolean {
  const state: unknown = window.history.state;
  return (
    typeof state === "object" &&
    state !== null &&
    reviewerDrawerHistoryKey in state &&
    (state as Record<string, unknown>)[reviewerDrawerHistoryKey] === true
  );
}

function reviewerDrawerHistoryState(): Record<string, unknown> {
  const state: unknown = window.history.state;
  return {
    ...(typeof state === "object" && state !== null ? state : {}),
    [reviewerDrawerHistoryKey]: true,
  };
}

function replaceReviewerQueueUrl(assignmentId: string | null): void {
  const nextUrl = reviewQueueUrlWithAssignment(new URL(window.location.href), assignmentId);
  window.history.replaceState(window.history.state, "", browserRelativeUrl(nextUrl));
}

export function restoreBlockedReviewerQueueRouteSelection(
  selectedAssignmentId: string | null,
  drawerEntryCanBeRestored: boolean,
): void {
  if (drawerEntryCanBeRestored) {
    window.history.forward();
    return;
  }
  const selectedUrl = reviewQueueUrlWithAssignment(
    new URL(window.location.href),
    selectedAssignmentId,
  );
  window.history.pushState(window.history.state, "", browserRelativeUrl(selectedUrl));
}

export function syncReviewerQueueRouteSelection(
  currentAssignmentId: string | null,
  nextAssignmentId: string | null,
): void {
  if (nextAssignmentId === null) {
    if (reviewerDrawerHistoryEntry()) {
      window.history.back();
    } else {
      replaceReviewerQueueUrl(null);
    }
    return;
  }
  const selectedUrl = reviewQueueUrlWithAssignment(new URL(window.location.href), nextAssignmentId);
  if (currentAssignmentId === null) {
    window.history.pushState(reviewerDrawerHistoryState(), "", browserRelativeUrl(selectedUrl));
  } else {
    window.history.replaceState(window.history.state, "", browserRelativeUrl(selectedUrl));
  }
}

export function useReviewerQueueRouteHistory({
  entries,
  pendingAutosaveAssignmentRef,
  restoreQueueFocusIdRef,
  selectedId,
  setSelectedId,
}: Readonly<{
  entries: readonly ReviewerQueueEntry[];
  pendingAutosaveAssignmentRef: RefObject<string | null>;
  restoreQueueFocusIdRef: RefObject<string | null>;
  selectedId: string | null;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
}>): void {
  const reviewerDrawerHistoryEntryRef = useRef(false);

  useEffect(() => {
    reviewerDrawerHistoryEntryRef.current = reviewerDrawerHistoryEntry();

    function handlePopState(): void {
      const nextAssignmentId = reviewAssignmentIdFromSearchParams(
        new URLSearchParams(window.location.search),
      );
      if (
        reviewerSelectionBlocked(pendingAutosaveAssignmentRef.current, selectedId, nextAssignmentId)
      ) {
        restoreBlockedReviewerQueueRouteSelection(
          selectedId,
          reviewerDrawerHistoryEntryRef.current,
        );
        return;
      }
      reviewerDrawerHistoryEntryRef.current = reviewerDrawerHistoryEntry();
      if (nextAssignmentId === null && selectedId !== null) {
        restoreQueueFocusIdRef.current = selectedId;
      }
      setSelectedId(nextAssignmentId);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [pendingAutosaveAssignmentRef, restoreQueueFocusIdRef, selectedId, setSelectedId]);

  useEffect(() => {
    if (selectedId === null || entries.some(({ assignment }) => assignment.id === selectedId)) {
      return;
    }
    setSelectedId(null);
    replaceReviewerQueueUrl(null);
  }, [entries, selectedId, setSelectedId]);
}
