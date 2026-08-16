"use client";

import { Fragment } from "react";
import { Button } from "../../../components/ui/button";
import { EvaluatorAssignmentStatusBadge } from "./assignment-evaluator-assignment-status-badge";
import type { ReviewerQueueController } from "./evaluator-queue-controller";
import { reviewerSelectionBlocked } from "./evaluator-queue-reviewer-selection-blocked";
import styles from "./reviewer-queue.module.css";

export function ReviewerQueueRows({
  controller,
}: Readonly<{ controller: ReviewerQueueController }>) {
  const {
    selectedId,
    pendingAutosaveAssignmentId,
    submittedAtById,
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
      <div className={styles.empty} role="status">
        <h3>No assigned reviews yet</h3>
        <p>
          This queue is assignment-driven. An organizer must assign a submission before it appears
          here.
        </p>
      </div>
    );
  if (filteredItems.length === 0)
    return (
      <div className={styles.filteredEmpty} role="status">
        <h3>No reviews match these filters</h3>
        <Button size="sm" type="button" variant="outline" onClick={clearFilters}>
          Clear filters
        </Button>
      </div>
    );
  return (
    <ul className={styles.list}>
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
          <Fragment key={assignment.id}>
            {groupStart ? (
              <li className={styles.groupHeader}>
                <strong>{groupLabel}</strong>
                <span>{groupCount}</span>
              </li>
            ) : null}
            <li className={`${styles.card} ${isSelected ? styles.cardSelected : ""}`}>
              <div className={styles.row} data-reviewer-row-layout="summary">
                <h3 className={styles.title} data-reviewer-column="title" title={assignment.title}>
                  {assignment.title}
                </h3>
                <div className={styles.meta}>
                  <span className={styles.context} data-reviewer-column="context">
                    {assignment.eventName} · {assignment.round.name}
                    {assignment.track === undefined || assignment.track === null
                      ? null
                      : ` · ${assignment.track}`}
                  </span>
                  <span className={styles.due} data-reviewer-column="due">
                    <span className={styles.mobileDueLabel}>Due </span>
                    {assignment.round.closesAt}
                  </span>
                </div>
                <div className={styles.status} data-reviewer-column="status">
                  <EvaluatorAssignmentStatusBadge
                    status={isSubmitted ? "submitted" : assignment.assignmentStatus}
                  />
                </div>
                <button
                  ref={(element) => {
                    queueActionRefs.current[assignment.id] = element;
                  }}
                  className={styles.action}
                  data-reviewer-assignment-id={assignment.id}
                  data-action-kind={isSubmitted ? "secondary" : "primary"}
                  type="button"
                  onClick={() => {
                    restoreQueueFocusIdRef.current = assignment.id;
                    selectAssignment(assignment.id);
                  }}
                  aria-label={`Open scorecard for ${assignment.title}`}
                  aria-pressed={isSelected}
                  data-reviewer-column="action"
                  disabled={blocked}
                >
                  {isSelected ? "Review open" : actionLabel}
                </button>
              </div>
            </li>
          </Fragment>
        );
      })}
    </ul>
  );
}
