"use client";

import Link from "next/link";
import { portalSubmissionEditTarget, submissionStatusPresentation } from "./model";
import styles from "./portal.module.css";
import { usePortal } from "./portal-provider";
import {
  canonicalPortalSubmissionId,
  portalSubmissionDisplayTitle,
  portalSubmissionIdsMatch,
} from "./portal-submissions";
import {
  EmptyState,
  formatPortalDate,
  PageHeading,
  PortalContentState,
  SubmissionStatusBadge,
  TaskStatusBadge,
} from "./portal-ui";
import type { PortalSubmission, PortalSubmissionStatus } from "./types";

const standardJourney: readonly PortalSubmissionStatus[] = [
  "submitted",
  "under_review",
  "accepted",
];

function portalDetailEditTarget(
  context: Parameters<typeof portalSubmissionEditTarget>[0],
  submission: PortalSubmission,
): ReturnType<typeof portalSubmissionEditTarget> {
  const target = portalSubmissionEditTarget(context, submission);
  if (target !== null || submission.status !== "accepted") return target;
  return portalSubmissionEditTarget(context, { ...submission, status: "submitted" });
}

export function SubmissionDetail({ submissionId }: Readonly<{ submissionId: string }>) {
  return (
    <PortalContentState>
      <SubmissionDetailContent submissionId={submissionId} />
    </PortalContentState>
  );
}

function SubmissionDetailContent({ submissionId }: Readonly<{ submissionId: string }>) {
  const { eventQuery, view, context, can } = usePortal();
  if (!view) {
    return null;
  }
  const submission = view.submissions.find((candidate) =>
    portalSubmissionIdsMatch(candidate.id, submissionId),
  );
  if (!submission) {
    return (
      <EmptyState
        title="Session not found"
        description="This session is not available to your speaker account."
        action={
          <Link className={styles.secondaryButton} href={`/portal/submissions${eventQuery}`}>
            Back to sessions
          </Link>
        }
      />
    );
  }
  const presentation = submissionStatusPresentation(submission.status);
  const submissionTasks = view.tasks.filter((task) =>
    portalSubmissionIdsMatch(task.submissionId, submission.id),
  );
  const displayTitle = portalSubmissionDisplayTitle(submission, view.submissions);
  const currentJourneyIndex = standardJourney.indexOf(submission.status);
  const editTarget = can("submission-edit") ? portalDetailEditTarget(context, submission) : null;

  return (
    <>
      <Link className={styles.backLink} href={`/portal/submissions${eventQuery}`}>
        <span aria-hidden="true">←</span> All sessions
      </Link>
      <PageHeading
        eyebrow={`Session ${submission.id}`}
        title={displayTitle}
        description="Your latest session status and accepted-speaker requirements."
        action={<SubmissionStatusBadge status={submission.status} />}
      />
      {editTarget === null ? null : (
        <Link
          className={styles.primaryButton}
          href={editTarget.href}
          onClick={() =>
            window.localStorage.setItem(
              editTarget.pointerKey,
              canonicalPortalSubmissionId(submission.id),
            )
          }
        >
          Edit proposal
        </Link>
      )}

      <section className={`${styles.panel} ${styles.statusHero}`}>
        <div
          className={`${styles.statusMark} ${styles[`tone_${presentation.tone}`]}`}
          aria-hidden="true"
        >
          {submission.status === "accepted" ? "✓" : "i"}
        </div>
        <div>
          <p className={styles.eyebrow}>Current status</p>
          <h2>{presentation.label}</h2>
          <p>{presentation.description}</p>
          <small>Last updated {formatPortalDate(submission.updatedAt) ?? "recently"}</small>
        </div>
      </section>

      {submission.status === "declined" || submission.status === "withdrawn" ? null : (
        <section className={styles.panel} aria-labelledby="status-progress-heading">
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.eyebrow}>Program workflow</p>
              <h2 id="status-progress-heading">Status progress</h2>
            </div>
          </div>
          <ol className={styles.statusTimeline}>
            {standardJourney.map((status, index) => {
              const statusPresentation = submissionStatusPresentation(status);
              const isCurrent = submission.status === status;
              const complete = currentJourneyIndex > index;
              return (
                <li
                  key={status}
                  data-current={isCurrent || undefined}
                  data-complete={complete || undefined}
                >
                  <span aria-hidden="true">{complete ? "✓" : index + 1}</span>
                  <div>
                    <strong>{statusPresentation.label}</strong>
                    <p>{statusPresentation.description}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {submission.status === "accepted" ? (
        <section className={styles.panel} aria-labelledby="accepted-tasks-heading">
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.eyebrow}>Accepted speaker checklist</p>
              <h2 id="accepted-tasks-heading">Tasks for this session</h2>
            </div>
            <Link href={`/portal/tasks${eventQuery}`}>Open task workspace</Link>
          </div>
          {submissionTasks.length === 0 ? (
            <EmptyState
              title="No tasks assigned"
              description="The event team has not assigned any tasks for this session."
            />
          ) : (
            <ul className={styles.detailTaskList}>
              {submissionTasks.map((task) => (
                <li key={task.id}>
                  <div>
                    <h3>{task.title}</h3>
                    <p>{task.description || "Complete this requirement for the event team."}</p>
                  </div>
                  <TaskStatusBadge status={task.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </>
  );
}
