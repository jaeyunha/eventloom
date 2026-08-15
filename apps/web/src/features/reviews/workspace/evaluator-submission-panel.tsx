"use client";
import { WorkspaceProgressSummary } from "@/components/workspace";
import styles from "../review-workspace.module.css";
import { EvaluatorAssignmentStatusBadge } from "./assignment-evaluator-assignment-status-badge";
import type { EvaluatorController } from "./evaluator-controller";

export function EvaluatorSubmissionPanel({
  controller,
}: Readonly<{ controller: EvaluatorController }>) {
  const {
    assignment,
    identityRedacted,
    visibleSubmissionFields,
    completedCriteria,
    rubricCriteria,
    submitted,
  } = controller;
  return (
    <section className={styles.submissionPanel} aria-labelledby="assigned-submission-heading">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.sectionEyebrow}>
            {assignment.organizationName ?? assignment.organizationId ?? assignment.eventName} ·{" "}
            {assignment.eventName} · {assignment.planName}
          </p>
          <h2 id="assigned-submission-heading">{assignment.title}</h2>
        </div>
        <span className={styles.referenceBadge}>{assignment.reference}</span>
      </div>
      <div className={styles.submissionContent}>
        <div className={styles.submissionProse}>
          <h3>Submission overview</h3>
          <p className={styles.submissionAbstract}>{assignment.abstract}</p>
        </div>
        <div className={styles.submissionMeta}>
          <dl className={styles.assignmentDetails}>
            <div>
              <dt>Round</dt>
              <dd>{assignment.round.name}</dd>
            </div>
            <div>
              <dt>Track</dt>
              <dd>{assignment.track ?? "Not specified"}</dd>
            </div>
            <div>
              <dt>Review closes</dt>
              <dd>{assignment.round.closesAt}</dd>
            </div>
            <div>
              <dt>Reviewer state</dt>
              <dd>
                <EvaluatorAssignmentStatusBadge
                  status={submitted ? "submitted" : assignment.assignmentStatus}
                />
              </dd>
            </div>
            <div>
              <dt>Identity</dt>
              <dd>
                {identityRedacted ? "Redacted for blind review" : "Visible per round projection"}
              </dd>
            </div>
          </dl>
          <div className={styles.participantBlock}>
            <h3>Speaker / participants</h3>
            {assignment.participants && assignment.participants.length > 0 && !identityRedacted ? (
              <ul className={styles.participantList}>
                {assignment.participants.map((participant) => (
                  <li key={participant.id}>
                    <strong>{participant.displayName}</strong>
                    {participant.role ? <span>{participant.role}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.fieldHint}>
                {identityRedacted
                  ? "Participant identities are hidden for this blind review."
                  : "No participant details were shared with reviewers."}
              </p>
            )}
          </div>
        </div>
      </div>
      {visibleSubmissionFields.length > 0 ? (
        <dl className={styles.submissionFields}>
          {visibleSubmissionFields.map((field) => (
            <div key={field.id ?? field.label}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <WorkspaceProgressSummary
        className={styles.reviewProgressSummary}
        label="Rubric progress"
        value={completedCriteria}
        max={Math.max(rubricCriteria.length, 1)}
        detail={`${completedCriteria} of ${rubricCriteria.length} criteria complete`}
        status={
          <EvaluatorAssignmentStatusBadge
            status={submitted ? "submitted" : assignment.assignmentStatus}
          />
        }
      />
    </section>
  );
}
