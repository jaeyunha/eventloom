"use client";

import { Fragment } from "react";
import { Button } from "../../../components/ui/button";
import { EvaluatorAssignmentStatusBadge } from "./assignment-evaluator-assignment-status-badge";
import type { ReviewerQueueController } from "./evaluator-queue-controller";
import { reviewerSelectionBlocked } from "./evaluator-queue-reviewer-selection-blocked";
import { compactSubmissionReference } from "./model-compact-submission-reference";
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
              <div className={styles.row}>
                <div className={styles.identity}>
                  <span className={styles.reference}>
                    {compactSubmissionReference(assignment.reference)}
                  </span>
                  <div className={styles.titleBlock}>
                    <h3 title={assignment.title}>{assignment.title}</h3>
                    <div className={styles.secondaryMeta}>
                      <span>
                        {assignment.eventName} · {assignment.round.name}
                      </span>
                      <span>{assignment.track ?? "No track"}</span>
                      <span>Due {assignment.round.closesAt}</span>
                    </div>
                  </div>
                </div>
                <span className={`${styles.cell} ${styles.event}`}>{assignment.eventName}</span>
                <span className={`${styles.cell} ${styles.round}`}>{assignment.round.name}</span>
                <span className={`${styles.cell} ${styles.track}`}>
                  {assignment.track ?? "No track"}
                </span>
                <span className={`${styles.cell} ${styles.due}`}>{assignment.round.closesAt}</span>
                <div className={styles.footer}>
                  <EvaluatorAssignmentStatusBadge
                    status={isSubmitted ? "submitted" : assignment.assignmentStatus}
                  />
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
                    disabled={blocked}
                  >
                    {isSelected ? "Review open" : actionLabel}
                  </button>
                </div>
              </div>
            </li>
          </Fragment>
        );
      })}
    </ul>
  );
}
