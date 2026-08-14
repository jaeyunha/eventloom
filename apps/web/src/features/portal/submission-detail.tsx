"use client";

import Link from "next/link";
import { clearCfpSubmissionState } from "../cfp/draft-persistence";
import { portalSubmissionIdsMatch, submissionStatusPresentation } from "./model";
import styles from "./portal.module.css";
import { usePortal } from "./portal-provider";
import {
  canonicalPortalSubmissionId,
  portalSubmissionActionTargets,
  portalSubmissionDisplayTitle,
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

function answerLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[_-]+/gu, " ")
    .replace(/^./u, (value) => value.toUpperCase());
}

function answerValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.map(answerValue).join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function SubmissionAnswers({
  answers,
}: {
  readonly answers: Readonly<Record<string, unknown>>;
}) {
  const entries = Object.entries(answers);
  if (entries.length === 0) return null;
  return (
    <section className={styles.panel} aria-labelledby="proposal-content-heading">
      <div className={styles.panelHeading}>
        <div>
          <p className={styles.eyebrow}>Submitted proposal</p>
          <h2 id="proposal-content-heading">Proposal content</h2>
        </div>
      </div>
      <dl className={styles.submissionAnswers}>
        {entries.map(([key, value]) => (
          <div key={key}>
            <dt>{answerLabel(key)}</dt>
            <dd>{answerValue(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function SubmissionParticipants({
  participants,
}: {
  readonly participants: NonNullable<PortalSubmission["participants"]>;
}) {
  if (participants.length === 0) return null;
  return (
    <section className={styles.panel} aria-labelledby="submission-participants-heading">
      <div className={styles.panelHeading}>
        <div>
          <p className={styles.eyebrow}>Proposal team</p>
          <h2 id="submission-participants-heading">Participants</h2>
        </div>
      </div>
      <div className={styles.taskStack}>
        {participants.map((participant) => {
          const displayName =
            `${participant.firstName} ${participant.lastName}`.trim() || participant.email;
          return (
            <article className={styles.taskItem} key={participant.id}>
              <div>
                <h3>{displayName}</h3>
                <p>{participant.email}</p>
              </div>
              <span>{participant.role === "primary" ? "Primary speaker" : "Co-author"}</span>
            </article>
          );
        })}
      </div>
    </section>
  );
}

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
        title="Submission not found"
        description="This submission is not available to your account in the selected event."
        action={
          <Link className={styles.secondaryButton} href={`/portal/submissions${eventQuery}`}>
            Back to submissions
          </Link>
        }
      />
    );
  }
  const presentation = submissionStatusPresentation(submission.status);
  const submissionTasks = view.tasks.filter(
    (task) =>
      task.submissionId !== null && portalSubmissionIdsMatch(task.submissionId, submission.id),
  );
  const displayTitle = portalSubmissionDisplayTitle(submission, view.submissions);
  const currentJourneyIndex = standardJourney.indexOf(submission.status);
  const actionTargets = can("submission-edit")
    ? portalSubmissionActionTargets(context, submission)
    : null;
  const cfpEventSlug = context?.slug?.trim() || context?.eventId.trim() || "";

  return (
    <>
      <Link className={styles.backLink} href={`/portal/submissions${eventQuery}`}>
        <span aria-hidden="true">←</span> All submissions
      </Link>
      <PageHeading
        eyebrow={`Submission ${submission.id}`}
        title={displayTitle}
        description="Your latest persisted proposal status and accepted-speaker requirements."
        action={<SubmissionStatusBadge status={submission.status} />}
      />
      {actionTargets === null ? null : (
        <>
          <Link
            className={styles.primaryButton}
            href={actionTargets.editHref}
            onClick={() =>
              window.localStorage.setItem(
                actionTargets.pointerKey,
                canonicalPortalSubmissionId(submission.id),
              )
            }
          >
            Edit proposal
          </Link>
          <Link
            className={styles.secondaryButton}
            href={actionTargets.newProposalHref}
            onClick={() => {
              if (context === null || cfpEventSlug.length === 0) return;
              clearCfpSubmissionState(cfpEventSlug, actionTargets.identity, window.localStorage);
            }}
          >
            Submit another proposal
          </Link>
        </>
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
          <small>
            {submission.version === undefined ? "" : `Revision ${submission.version} · `}
            Last updated {formatPortalDate(submission.updatedAt) ?? "recently"}
          </small>
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

      {submission.answers ? <SubmissionAnswers answers={submission.answers} /> : null}

      {submission.participants ? (
        <SubmissionParticipants participants={submission.participants} />
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
