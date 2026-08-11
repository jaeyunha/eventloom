"use client";

import Link from "next/link";
import { portalSubmissionEditTarget, submissionStatusPresentation } from "./model";
import styles from "./portal.module.css";
import { usePortal } from "./portal-provider";
import { portalSubmissionIdsMatch } from "./portal-submissions";
import {
  EmptyState,
  formatPortalDate,
  PageHeading,
  PortalContentState,
  SubmissionStatusBadge,
  TaskStatusBadge,
} from "./portal-ui";
import type { PortalSubmissionStatus } from "./types";

const standardJourney: readonly PortalSubmissionStatus[] = [
  "submitted",
  "under_review",
  "accepted",
];

export function SubmissionDetail({ submissionId }: Readonly<{ submissionId: string }>) {
  return (
    <PortalContentState>
      <SubmissionDetailContent submissionId={submissionId} />
    </PortalContentState>
  );
}

function SubmissionDetailContent({ submissionId }: Readonly<{ submissionId: string }>) {
  const { eventQuery, view, context, can, workspace, workspaceLoading } = usePortal();
  if (!view) {
    return null;
  }
  const submission = view.submissions.find((candidate) =>
    portalSubmissionIdsMatch(candidate.id, submissionId),
  );
  if (!submission) {
    return (
      <EmptyState
        title="Submission not found"
        description="This submission is not available to your speaker account."
        action={
          <Link className={styles.secondaryButton} href={`/portal/submissions${eventQuery}`}>
            Back to submissions
          </Link>
        }
      />
    );
  }
  const presentation = submissionStatusPresentation(submission.status);
  const submissionTasks = view.tasks.filter((task) =>
    portalSubmissionIdsMatch(task.submissionId, submission.id),
  );
  const currentJourneyIndex = standardJourney.indexOf(submission.status);
  const editTarget = can("submission-edit")
    ? portalSubmissionEditTarget(context, submission)
    : null;
  const roster = Object.values(workspace.rosters).find((candidate) =>
    portalSubmissionIdsMatch(candidate.submissionId, submission.id),
  );
  const canManageRoster = can("roster-manage") && (roster?.capabilities.manage ?? false);

  return (
    <>
      <Link className={styles.backLink} href={`/portal/submissions${eventQuery}`}>
        <span aria-hidden="true">←</span> All submissions
      </Link>
      <PageHeading
        eyebrow={`Submission ${submission.id}`}
        title={submission.title}
        description="Your latest program status and accepted-speaker requirements."
        action={<SubmissionStatusBadge status={submission.status} />}
      />
      {editTarget === null ? null : (
        <Link
          className={styles.primaryButton}
          href={editTarget.href}
          onClick={() => window.localStorage.setItem(editTarget.pointerKey, submission.id)}
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
        <section className={styles.panel} aria-labelledby="participants-heading">
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.eyebrow}>Accepted session</p>
              <h2 id="participants-heading">Participants</h2>
            </div>
            {canManageRoster ? (
              <Link href="/portal?workspace=co-speakers">Manage co-speakers</Link>
            ) : null}
          </div>
          {roster === undefined ? (
            <p className={styles.toolbarDescription}>
              {workspaceLoading
                ? "Loading the participant roster…"
                : "The participant roster is unavailable for this session."}
            </p>
          ) : roster.members.length === 0 ? (
            <EmptyState
              title="No co-speakers added"
              description={
                canManageRoster
                  ? "Add collaborators from the co-speaker workspace."
                  : "No co-speakers are listed for this session."
              }
            />
          ) : (
            <ul className={styles.taskSummaryList} aria-label="Session participants">
              {roster.members.map((member) => (
                <li key={member.participantId}>
                  <span className={styles.taskCheck} aria-hidden="true">
                    {member.status === "active" ? "✓" : "○"}
                  </span>
                  <div>
                    <h3>{member.displayName}</h3>
                    <p>
                      {member.role.replaceAll("_", " ")} · {member.status}
                      {member.email ? ` · ${member.email}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

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
