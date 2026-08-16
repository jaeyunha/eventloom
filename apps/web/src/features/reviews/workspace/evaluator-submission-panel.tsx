"use client";
import { WorkspaceProgressSummary } from "@/components/workspace";
import styles from "../review-workspace.module.css";
import { EvaluatorAssignmentStatusBadge } from "./assignment-evaluator-assignment-status-badge";
import type { EvaluatorController } from "./evaluator-controller";
import { compactSubmissionReference } from "./model-compact-submission-reference";

export function EvaluatorSubmissionPanel({
  controller,
  showReference = true,
}: Readonly<{ controller: EvaluatorController; showReference?: boolean }>) {
  const {
    assignment,
    identityRedacted,
    visibleSubmissionFields,
    completedCriteria,
    rubricCriteria,
    submitted,
  } = controller;
  const contextLabels = [
    assignment.organizationName !== assignment.organizationId &&
    assignment.organizationName !== "Organization"
      ? assignment.organizationName
      : null,
    assignment.eventName !== assignment.eventId && assignment.eventName !== "Assigned event"
      ? assignment.eventName
      : null,
    assignment.planName,
  ].filter((label): label is string => label !== null);
  return (
    <section className={styles.submissionPanel} aria-labelledby="assigned-submission-heading">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.sectionEyebrow}>{contextLabels.join(" · ")}</p>
          <h2 id="assigned-submission-heading">{assignment.title}</h2>
        </div>
        <div className={styles.submissionHeadingMeta}>
          {showReference ? (
            <span className={styles.referenceBadge}>
              {compactSubmissionReference(assignment.reference)}
            </span>
          ) : null}
          <EvaluatorAssignmentStatusBadge
            status={submitted ? "submitted" : assignment.assignmentStatus}
          />
        </div>
      </div>
      <dl className={styles.submissionProperties}>
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
      </dl>
      <div className={styles.submissionProse}>
        <h3>Submission overview</h3>
        <p className={styles.submissionAbstract}>{assignment.abstract}</p>
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
      {!identityRedacted ? (
        <div className={styles.participantBlock}>
          <h3>Speaker / participants</h3>
          {assignment.participants && assignment.participants.length > 0 ? (
            <ul className={styles.participantList}>
              {assignment.participants.map((participant) => (
                <li key={participant.id}>
                  <strong>{participant.displayName}</strong>
                  {participant.role ? <span>{participant.role}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.fieldHint}>No participant details were shared with reviewers.</p>
          )}
        </div>
      ) : null}
      <WorkspaceProgressSummary
        className={styles.reviewProgressSummary}
        label="Rubric progress"
        value={completedCriteria}
        max={Math.max(rubricCriteria.length, 1)}
        detail={`${completedCriteria} of ${rubricCriteria.length} criteria complete`}
      />
    </section>
  );
}
