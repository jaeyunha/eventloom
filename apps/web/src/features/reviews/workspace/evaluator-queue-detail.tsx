"use client";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useRef } from "react";
import { EvaluatorWorkspace } from "./evaluator-evaluator-workspace";
import type { ReviewerQueueController } from "./evaluator-queue-controller";
import { reviewerSelectionBlocked } from "./evaluator-queue-reviewer-selection-blocked";
import { compactSubmissionReference } from "./model-compact-submission-reference";
import styles from "./reviewer-queue.module.css";

export function ReviewerQueueDetail({
  controller,
}: Readonly<{ controller: ReviewerQueueController }>) {
  const {
    baseUrl,
    selectedId,
    pendingAutosaveAssignmentId,
    setRecusedIds,
    submittedAtById,
    setSubmittedAtById,
    setDraftsById,
    restoreQueueFocusIdRef,
    navigationEntries,
    selected,
    selectedIndex,
    updateAutosavePending,
    selectAssignment,
  } = controller;
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  if (!selected) return null;

  const selectedAssignmentId = selected.id;
  const previousAssignment = navigationEntries[selectedIndex - 1]?.assignment;
  const nextAssignment = navigationEntries[selectedIndex + 1]?.assignment;
  const closeBlocked = reviewerSelectionBlocked(pendingAutosaveAssignmentId, selectedId, null);
  const previousBlocked =
    previousAssignment === undefined ||
    reviewerSelectionBlocked(pendingAutosaveAssignmentId, selectedId, previousAssignment.id);
  const nextBlocked =
    nextAssignment === undefined ||
    reviewerSelectionBlocked(pendingAutosaveAssignmentId, selectedId, nextAssignment.id);

  function closeSheet(): void {
    if (closeBlocked) return;
    restoreQueueFocusIdRef.current = selectedAssignmentId;
    selectAssignment(null);
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) closeSheet();
      }}
    >
      <SheetContent
        id="review-scorecard-sheet"
        className={styles.sheet}
        overlayClassName={styles.sheetOverlay}
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          closeButtonRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (closeBlocked) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (closeBlocked) event.preventDefault();
        }}
      >
        <SheetTitle className={styles.srOnly}>Review {selected.title}</SheetTitle>
        <SheetDescription className={styles.srOnly}>
          Score the assigned submission for {selected.eventName}, {selected.round.name}.
        </SheetDescription>
        <div className={styles.sheetToolbar}>
          <Button
            ref={closeButtonRef}
            aria-label="Close review"
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={closeSheet}
            disabled={closeBlocked}
          >
            <X aria-hidden="true" />
          </Button>
          <span className={styles.sheetReference}>
            {compactSubmissionReference(selected.reference)}
          </span>
          <div className={styles.sheetNavigation}>
            <Button
              aria-label="Previous submission"
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => {
                if (previousAssignment !== undefined) {
                  selectAssignment(previousAssignment.id);
                }
              }}
              disabled={previousBlocked}
            >
              <ChevronLeft aria-hidden="true" />
              <span className={styles.sheetNavigationLabel}>Prev</span>
            </Button>
            <Button
              aria-label="Next submission"
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => {
                if (nextAssignment !== undefined) {
                  selectAssignment(nextAssignment.id);
                }
              }}
              disabled={nextBlocked}
            >
              <span className={styles.sheetNavigationLabel}>Next</span>
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
        <div className={styles.sheetBody}>
          <EvaluatorWorkspace
            key={selected.id}
            assignment={selected}
            baseUrl={baseUrl}
            embedded
            submittedOverride={submittedAtById[selected.id] !== undefined}
            queuePosition={{ position: selectedIndex + 1, total: navigationEntries.length }}
            onNext={
              nextAssignment === undefined ? undefined : () => selectAssignment(nextAssignment.id)
            }
            onDraftChange={(snapshot) =>
              setDraftsById((current) => ({ ...current, [selected.id]: snapshot }))
            }
            onAutosavePendingChange={(pending) => updateAutosavePending(selected.id, pending)}
            onAbstain={() => {
              restoreQueueFocusIdRef.current = selected.id;
              if (!selectAssignment(null)) return;
              setRecusedIds((current) => new Set([...current, selected.id]));
            }}
            onSubmitted={(review) => {
              if (review.submittedAt !== null) {
                setSubmittedAtById((current) => ({
                  ...current,
                  [selected.id]: review.submittedAt as string,
                }));
              }
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
