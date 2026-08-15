"use client";

import { Button } from "../../../components/ui/button";
import styles from "../review-workspace.module.css";
import { EvaluatorAssignmentStatusBadge } from "./assignment-evaluator-assignment-status-badge";
import type { ReviewerQueueController } from "./evaluator-queue-controller";
import { reviewerSelectionBlocked } from "./evaluator-queue-reviewer-selection-blocked";

export function ReviewerQueueRows({
  controller,
}: Readonly<{ controller: ReviewerQueueController }>) {
  const {
    selectedId,
    pendingAutosaveAssignmentId,
    submittedAtById,
    groupBy,
    queueActionRefs,
    restoreQueueFocusIdRef,
    inboxItems,
    filteredItems,
    visibleEntries,
    selectAssignment,
    clearFilters,
  } = controller;
  if (inboxItems.length === 0)
    return (
      <div className={styles.emptyQueue} role="status">
        <h3>No assigned reviews yet</h3>
        <p>
          This queue is assignment-driven. An organizer must assign a submission before it appears
          here.
        </p>
      </div>
    );
  if (filteredItems.length === 0)
    return (
      <div className={styles.filteredQueueEmpty} role="status">
        <h3>No reviews match these filters</h3>
        <Button size="sm" type="button" variant="outline" onClick={clearFilters}>
          Clear filters
        </Button>
      </div>
    );
  return (
    <div className={styles.reviewerQueueList}>
      {visibleEntries.map(({ assignment, groupCount, groupLabel, groupStart }) => {
        const isSelected = assignment.id === selectedId;
        const isSubmitted =
          assignment.submittedAt !== null || submittedAtById[assignment.id] !== undefined;
        const blocked = reviewerSelectionBlocked(
          pendingAutosaveAssignmentId,
          selectedId,
          assignment.id,
        );
        const actionLabel = isSubmitted
          ? "View review"
          : assignment.assignmentStatus === "in_progress"
            ? "Resume review"
            : "Start review";
        return (
          <article
            className={`${styles.reviewerQueueCard} ${isSelected ? styles.reviewerQueueCardSelected : ""}`}
            key={assignment.id}
          >
            {groupStart ? (
              <div className={styles.reviewerGroupHeader}>
                <strong>{groupLabel}</strong>
                <span>{groupCount}</span>
              </div>
            ) : null}
            <div className={styles.reviewerQueueRow}>
              <div className={styles.reviewerQueueContent}>
                <div className={styles.reviewerQueueSummary}>
                  <div>
                    <p className={styles.sectionEyebrow}>
                      {groupBy === "event"
                        ? assignment.planName
                        : `${assignment.eventName} · ${assignment.planName}`}
                    </p>
                    <h3>{assignment.title}</h3>
                  </div>
                  <span className={styles.mutedLabel}>{assignment.reference}</span>
                </div>
                <div className={styles.reviewerQueueMeta}>
                  <span>{assignment.round.name}</span>
                  <span>Due {assignment.round.closesAt}</span>
                </div>
              </div>
              <div className={styles.reviewerQueueFooter}>
                <EvaluatorAssignmentStatusBadge
                  status={isSubmitted ? "submitted" : assignment.assignmentStatus}
                />
                <button
                  ref={(element) => {
                    queueActionRefs.current[assignment.id] = element;
                  }}
                  className={styles.reviewerQueueAction}
                  data-action-kind={isSubmitted ? "secondary" : "primary"}
                  type="button"
                  onClick={() => {
                    restoreQueueFocusIdRef.current = assignment.id;
                    selectAssignment(assignment.id);
                  }}
                  aria-label={`Open scorecard for ${assignment.title}`}
                  aria-pressed={isSelected}
                  disabled={blocked}
                >
                  {isSelected ? "Review open" : actionLabel}
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
