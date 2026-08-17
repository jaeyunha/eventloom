"use client";

import styles from "../review-workspace.module.css";
import { AssignmentStatusBadge } from "./assignment-assignment-status-badge";
import type { ReviewerAssignmentController } from "./assignment-reviewer-assignment-controller";
import { participantDisplayLabel } from "./model-participant-display-label";
import { reviewerDisplayLabel } from "./model-reviewer-display-label";

export function ReviewerAssignmentTable({
  controller,
}: Readonly<{ controller: ReviewerAssignmentController }>) {
  const {
    seed,
    reviewerMembers,
    submissionById,
    roundById,
    visibleAssignments,
    selectedAssignmentId,
    setSelectedAssignmentId,
  } = controller;
  if (seed.assignments.length === 0) {
    return <p className={styles.fieldHint}>No reviewer assignments yet.</p>;
  }
  return (
    <div className={styles.tableWrap}>
      <table className={`${styles.dataTable} ${styles.assignmentTable}`}>
        <caption>Active reviewer assignments and protected history</caption>
        <thead>
          <tr>
            <th scope="col">Proposal</th>
            <th scope="col">Reviewer</th>
            <th scope="col">Round</th>
            <th scope="col">Status</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {visibleAssignments.map((assignment) => {
            const aggregate = submissionById.get(assignment.submissionId);
            const round = roundById.get(assignment.roundId);
            const participantNames = participantDisplayLabel(aggregate?.participants);
            const reviewer = reviewerDisplayLabel(assignment.reviewerId, reviewerMembers);
            const protectedHistory =
              assignment.status === "abstained" || assignment.status === "superseded";
            return (
              <tr key={assignment.id}>
                <th scope="row" data-label="Proposal">
                  <strong>{aggregate?.title ?? "No title"}</strong>
                  {participantNames ? <span>{participantNames}</span> : null}
                </th>
                <td data-label="Reviewer">
                  <strong>{reviewer}</strong>
                </td>
                <td data-label="Round">{round?.name ?? "Round unavailable"}</td>
                <td data-label="Status">
                  <AssignmentStatusBadge status={assignment.status} />
                  {assignment.predecessorAssignmentId || assignment.successorAssignmentId ? (
                    <span className={styles.fieldHint}>Replacement history preserved</span>
                  ) : null}
                  {assignment.supersededReason ? (
                    <span className={styles.fieldHint}>Reason: {assignment.supersededReason}</span>
                  ) : null}
                </td>
                <td data-label="Action">
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={() =>
                      setSelectedAssignmentId((current) =>
                        current === assignment.id ? null : assignment.id,
                      )
                    }
                    aria-expanded={selectedAssignmentId === assignment.id}
                    aria-controls={
                      selectedAssignmentId === assignment.id
                        ? `assignment-editor-${assignment.id}`
                        : undefined
                    }
                  >
                    {selectedAssignmentId === assignment.id
                      ? "Hide assignment"
                      : protectedHistory
                        ? "View assignment"
                        : "Manage assignment"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
