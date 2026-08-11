"use client";

import Link from "next/link";
import {
  findSubmissionForTask,
  isTaskBlocked,
  submissionStatusPresentation,
  summarizePortal,
} from "./model";
import styles from "./portal.module.css";
import { usePortal } from "./portal-provider";
import {
  EmptyState,
  formatPortalDate,
  PageHeading,
  PortalContentState,
  Progress,
  SubmissionStatusBadge,
  TaskStatusBadge,
} from "./portal-ui";

export function PortalHome() {
  return (
    <PortalContentState>
      <PortalHomeContent />
    </PortalContentState>
  );
}

function PortalHomeContent() {
  const { eventQuery, view } = usePortal();
  if (!view) {
    return null;
  }
  const profile = view.profiles.find(
    (candidate) => candidate.participantId === view.context?.primaryParticipantId,
  );
  const summary = summarizePortal(view);
  const visibleTasks = view.tasks.filter(
    (task) => task.status !== "completed" && task.status !== "waived",
  );

  return (
    <>
      <PageHeading
        eyebrow="Speaker portal"
        title={`Welcome${profile ? `, ${profile.displayName.split(" ")[0]}` : ""}`}
        description="Track your proposals as they become sessions and complete everything the event team needs from you."
        action={
          <Link className={styles.primaryButton} href={`/portal/tasks${eventQuery}`}>
            View tasks
          </Link>
        }
      />

      <section className={styles.summaryGrid} aria-label="Portal summary">
        <article className={styles.metricCard}>
          <span className={styles.metricIcon} aria-hidden="true">
            ▤
          </span>
          <div>
            <strong>{summary.submissionCount}</strong>
            <span>{summary.submissionCount === 1 ? "Session" : "Sessions"}</span>
          </div>
          <small>{summary.acceptedCount} accepted</small>
        </article>
        <article className={styles.metricCard}>
          <span className={styles.metricIcon} aria-hidden="true">
            ✓
          </span>
          <div>
            <strong>{summary.outstandingTaskCount}</strong>
            <span>Tasks remaining</span>
          </div>
          <small>{summary.completedTaskCount} completed</small>
        </article>
        <article className={`${styles.metricCard} ${styles.progressCard}`}>
          <Progress value={summary.completionPercent} label="Speaker readiness" />
        </article>
      </section>

      <div className={styles.dashboardGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.eyebrow}>Your sessions</p>
              <h2>Session status</h2>
            </div>
            <Link href={`/portal/submissions${eventQuery}`}>View all sessions</Link>
          </div>
          {view.submissions.length === 0 ? (
            <EmptyState
              title="No sessions yet"
              description="Submitted proposals will appear here as they become sessions."
            />
          ) : (
            <div className={styles.cardList}>
              {view.submissions.slice(0, 3).map((submission) => {
                const presentation = submissionStatusPresentation(submission.status);
                return (
                  <Link
                    key={submission.id}
                    className={styles.submissionCard}
                    href={`/portal/submissions/${encodeURIComponent(submission.id)}${eventQuery}`}
                  >
                    <div>
                      <h3>{submission.title}</h3>
                      <p>{presentation.description}</p>
                    </div>
                    <SubmissionStatusBadge status={submission.status} />
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.eyebrow}>Profile</p>
              <h2>Your speaker details</h2>
            </div>
            <Link href={`/portal/profile${eventQuery}`}>Edit biography</Link>
          </div>
          {profile ? (
            <div className={styles.profilePreview}>
              <span className={styles.largeAvatar} aria-hidden="true">
                {profile.displayName
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part[0]?.toLocaleUpperCase())
                  .join("")}
              </span>
              <div>
                <h3>{profile.displayName}</h3>
                <p>{profile.biography || "Add a biography for the event program."}</p>
                <small>Updated {formatPortalDate(profile.updatedAt) ?? "recently"}</small>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No profile available"
              description="Your speaker profile will appear after you are added as a participant."
            />
          )}
        </section>
      </div>

      {summary.acceptedCount > 0 ? (
        <section className={`${styles.panel} ${styles.taskPanel}`}>
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.eyebrow}>Accepted speaker checklist</p>
              <h2>Prepare for the event</h2>
            </div>
            <Link href={`/portal/tasks${eventQuery}`}>Open all tasks</Link>
          </div>
          {visibleTasks.length === 0 ? (
            <EmptyState
              title="You are all set"
              description="Every assigned speaker task is complete."
            />
          ) : (
            <ul className={styles.taskSummaryList}>
              {visibleTasks.slice(0, 4).map((task) => {
                const submission = findSubmissionForTask(task, view.submissions);
                const blocked = isTaskBlocked(task, view.tasks);
                return (
                  <li key={task.id}>
                    <span className={styles.taskCheck} aria-hidden="true">
                      {blocked ? "×" : "○"}
                    </span>
                    <div>
                      <h3>{task.title}</h3>
                      <p>
                        {submission?.title ?? "Speaker task"}
                        {task.dueAt ? ` · Due ${formatPortalDate(task.dueAt)}` : ""}
                      </p>
                    </div>
                    <TaskStatusBadge status={task.status} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}
    </>
  );
}
