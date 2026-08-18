"use client";

import styles from "../review-workspace.module.css";
import type { ReviewPlanAssignment } from "./assignment-review-plan-assignment";
import type { ReviewerAssignmentController } from "./assignment-reviewer-assignment-controller";
import { ReviewerAssignmentEditor } from "./assignment-reviewer-assignment-editor";
import { ReviewerAssignmentTable } from "./assignment-reviewer-assignment-table";

export function ReviewerAssignmentView({
  controller,
}: Readonly<{ controller: ReviewerAssignmentController }>) {
  const {
    seed,
    message,
    assignmentQuery,
    setAssignmentQuery,
    assignmentStatusFilter,
    setAssignmentStatusFilter,
    assignmentRowLimit,
    setAssignmentRowLimit,
    filteredAssignments,
    visibleAssignments,
  } = controller;
  return (
    <section className={styles.section} aria-labelledby="current-assignments-heading">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.sectionEyebrow}>Current assignments and lineage</p>
          <h2 id="current-assignments-heading">Reviewer assignment history</h2>
        </div>
        <span className={styles.mutedLabel}>{seed.assignments.length} records</span>
      </div>
      <div className={styles.collectionToolbar}>
        <div className={styles.formField}>
          <label htmlFor="assignment-search">Find an assignment</label>
          <input
            id="assignment-search"
            type="search"
            value={assignmentQuery}
            onChange={(event) => setAssignmentQuery(event.currentTarget.value)}
            placeholder="Search proposal, reviewer, or round"
          />
        </div>
        <div className={styles.formField}>
          <label htmlFor="assignment-status-filter">Assignment status</label>
          <select
            id="assignment-status-filter"
            value={assignmentStatusFilter}
            onChange={(event) =>
              setAssignmentStatusFilter(
                event.currentTarget.value as "all" | ReviewPlanAssignment["status"],
              )
            }
          >
            <option value="all">All statuses</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In progress</option>
            <option value="submitted">Submitted</option>
            <option value="abstained">Conflict / recused</option>
            <option value="superseded">Superseded</option>
          </select>
        </div>
        <div className={styles.formField}>
          <label htmlFor="assignment-row-limit">Rows shown</label>
          <select
            id="assignment-row-limit"
            value={assignmentRowLimit}
            onChange={(event) => setAssignmentRowLimit(Number(event.currentTarget.value))}
          >
            {[5, 10, 25, 50, 100].map((value) => (
              <option value={value} key={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <p className={styles.toolbarMeta} role="status">
          Showing {visibleAssignments.length} of {filteredAssignments.length} matching assignments
        </p>
      </div>
      <ReviewerAssignmentTable controller={controller} />
      <ReviewerAssignmentEditor controller={controller} />
      {message ? (
        <p className={styles.submittedMessage} role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
