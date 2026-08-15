"use client";

import { WorkspaceSurface } from "@/components/workspace";
import styles from "../review-workspace.module.css";
import { EvaluatorWorkspace } from "./evaluator-evaluator-workspace";
import type { ReviewerQueueController } from "./evaluator-queue-controller";
import { reviewerSelectionBlocked } from "./evaluator-queue-reviewer-selection-blocked";

export function ReviewerQueueDetail({
  controller,
}: Readonly<{ controller: ReviewerQueueController }>) {
  const {
    baseUrl,
    selectedId,
    setSelectedId,
    pendingAutosaveAssignmentId,
    setRecusedIds,
    submittedAtById,
    setSubmittedAtById,
    setDraftsById,
    detailHeadingRef,
    restoreQueueFocusIdRef,
    navigationEntries,
    selected,
    selectedIndex,
    updateAutosavePending,
    selectAssignment,
  } = controller;
  if (!selected)
    return (
      <WorkspaceSurface
        className={styles.evaluatorQueueGuidance}
        title="Select a submission"
        description="Open an assigned review to see its blind submission projection and scorecard."
      >
        <p>Drafts autosave before you move to another assignment.</p>
      </WorkspaceSurface>
    );
  return (
    <section
      className={`${styles.section} ${styles.reviewerDetailPanel}`}
      id={`scorecard-${encodeURIComponent(selected.id)}`}
      aria-label={`Review ${selected.title}`}
      ref={detailHeadingRef}
      tabIndex={-1}
    >
      <div className={styles.reviewerDetailToolbar}>
        <span>
          {selected.eventName} · {selected.round.name}
        </span>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={() => {
            restoreQueueFocusIdRef.current = selected.id;
            selectAssignment(null);
          }}
          disabled={reviewerSelectionBlocked(pendingAutosaveAssignmentId, selectedId, null)}
        >
          Back to reviewer queue
        </button>
      </div>
      <EvaluatorWorkspace
        key={selected.id}
        assignment={selected}
        baseUrl={baseUrl}
        embedded
        submittedOverride={submittedAtById[selected.id] !== undefined}
        queuePosition={{ position: selectedIndex + 1, total: navigationEntries.length }}
        onNext={
          selectedIndex >= 0 && selectedIndex < navigationEntries.length - 1
            ? () => selectAssignment(navigationEntries[selectedIndex + 1]?.assignment.id ?? null)
            : undefined
        }
        onDraftChange={(snapshot) =>
          setDraftsById((current) => ({ ...current, [selected.id]: snapshot }))
        }
        onAutosavePendingChange={(pending) => updateAutosavePending(selected.id, pending)}
        onAbstain={() => {
          setRecusedIds((current) => new Set([...current, selected.id]));
          setSelectedId(null);
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
    </section>
  );
}
