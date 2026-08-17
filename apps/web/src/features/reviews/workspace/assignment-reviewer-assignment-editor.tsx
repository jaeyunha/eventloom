"use client";

import type { ReactNode } from "react";
import styles from "../review-workspace.module.css";
import { AssignmentStatusBadge } from "./assignment-assignment-status-badge";
import type { ReviewerAssignmentController } from "./assignment-reviewer-assignment-controller";
import { participantDisplayLabel } from "./model-participant-display-label";
import { submissionDisplayTitle } from "./model-submission-display-title";

export function ReviewerAssignmentEditor({
  controller,
}: Readonly<{ controller: ReviewerAssignmentController }>) {
  const {
    reviewerMembers,
    busyAssignmentId,
    replacementReviewerByAssignment,
    setReplacementReviewerByAssignment,
    replacementReasonByAssignment,
    setReplacementReasonByAssignment,
    assignmentEditorRef,
    selectedAssignment,
    selectedAggregate,
    selectedRound,
    selectedReviewer,
    selectedProtectedHistory,
    replaceAssignment,
  } = controller;
  if (!selectedAssignment) return null;
  const replacementReviewerOptions: ReactNode[] = [];
  for (const member of reviewerMembers) {
    if (member.userId === selectedAssignment.reviewerId) continue;
    replacementReviewerOptions.push(
      <option value={member.userId} key={member.userId}>
        {member.name ?? member.email} · {member.email}
      </option>,
    );
  }
  const participantNames = participantDisplayLabel(selectedAggregate?.participants);
  return (
    <section
      ref={assignmentEditorRef}
      id={`assignment-editor-${selectedAssignment.id}`}
      className={styles.assignmentManagementEditor}
      aria-labelledby="assignment-editor-heading"
      tabIndex={-1}
    >
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.sectionEyebrow}>Selected assignment</p>
          <h3 id="assignment-editor-heading">{submissionDisplayTitle(selectedAggregate ?? {})}</h3>
        </div>
        <AssignmentStatusBadge status={selectedAssignment.status} />
      </div>
      <dl className={styles.assignmentEditorSummary}>
        <div>
          <dt>Reviewer</dt>
          <dd>{selectedReviewer}</dd>
        </div>
        <div>
          <dt>Round</dt>
          <dd>{selectedRound?.name ?? "Round unavailable"}</dd>
        </div>
        {participantNames ? (
          <div>
            <dt>Participants</dt>
            <dd>{participantNames}</dd>
          </div>
        ) : null}
      </dl>
      {selectedProtectedHistory ? (
        <p className={styles.fieldHint}>
          This {selectedAssignment.status} record is protected history and cannot be replaced.
        </p>
      ) : (
        <div className={styles.assignmentReplacementForm}>
          <div className={styles.formField}>
            <label htmlFor={`replacement-reviewer-${selectedAssignment.id}`}>
              Replacement reviewer
            </label>
            <select
              id={`replacement-reviewer-${selectedAssignment.id}`}
              value={replacementReviewerByAssignment[selectedAssignment.id] ?? ""}
              onChange={(event) =>
                setReplacementReviewerByAssignment((current) => ({
                  ...current,
                  [selectedAssignment.id]: event.currentTarget.value,
                }))
              }
              disabled={busyAssignmentId !== null}
            >
              <option value="">Choose verified reviewer</option>
              {replacementReviewerOptions}
            </select>
          </div>
          <div className={styles.formField}>
            <label htmlFor={`replacement-reason-${selectedAssignment.id}`}>
              Replacement reason
            </label>
            <textarea
              id={`replacement-reason-${selectedAssignment.id}`}
              rows={3}
              placeholder="Explain why this assignment must move."
              value={replacementReasonByAssignment[selectedAssignment.id] ?? ""}
              onChange={(event) =>
                setReplacementReasonByAssignment((current) => ({
                  ...current,
                  [selectedAssignment.id]: event.currentTarget.value,
                }))
              }
              disabled={busyAssignmentId !== null}
            />
          </div>
          <button
            className={styles.dangerButton}
            type="button"
            onClick={() => void replaceAssignment(selectedAssignment)}
            disabled={busyAssignmentId !== null}
          >
            {busyAssignmentId === selectedAssignment.id
              ? "Replacing reviewer…"
              : "Replace reviewer"}
          </button>
          <p className={styles.fieldHint}>
            The old assignment remains in protected history and the replacement is recorded
            atomically.
          </p>
        </div>
      )}
    </section>
  );
}
