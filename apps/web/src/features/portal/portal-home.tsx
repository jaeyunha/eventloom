"use client";

import { ArrowRight, CalendarClock, CheckCircle2, CircleAlert, Sparkles } from "lucide-react";
import Link from "next/link";
import {
  StatusBadge,
  WorkspaceHeader,
  WorkspaceMetaItem,
} from "@/components/workspace/workspace-ui";
import {
  findSubmissionForTask,
  isTaskBlocked,
  submissionStatusPresentation,
  summarizePortal,
} from "./model";
import styles from "./portal.module.css";
import { portalContextLabel, usePortal } from "./portal-provider";
import {
  EmptyState,
  formatPortalDate,
  PortalContentState,
  Progress,
  SubmissionStatusBadge,
  TaskStatusBadge,
} from "./portal-ui";
import type { PortalTask } from "./types";

export function selectNextOutstandingPortalTask(
  tasks: readonly PortalTask[],
): PortalTask | undefined {
  const outstanding = tasks.filter(
    (task) => task.status !== "completed" && task.status !== "waived",
  );
  return outstanding.find((task) => !isTaskBlocked(task, tasks)) ?? outstanding[0];
}

export function PortalHome() {
  return (
    <PortalContentState>
      <PortalHomeContent />
    </PortalContentState>
  );
}

function PortalHomeContent() {
  const { can, context, eventQuery, view } = usePortal();
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
  const nextTask = selectNextOutstandingPortalTask(view.tasks);
  const nextTaskDueDate = formatPortalDate(nextTask?.dueAt);
  const primarySubmission = view.submissions[0];

  return (
    <>
      <WorkspaceHeader
        eyebrow={context ? portalContextLabel(context) : "Speaker portal"}
        title={`Welcome${profile ? `, ${profile.displayName.split(" ")[0]}` : ""}`}
        status={
          <StatusBadge tone={summary.outstandingTaskCount === 0 ? "success" : "info"}>
            {summary.outstandingTaskCount === 0 ? "Ready" : "In progress"}
          </StatusBadge>
        }
        description="Everything the event team needs from you, ordered by what should happen next."
        metadata={
          <>
            <WorkspaceMetaItem>{summary.acceptedCount} accepted sessions</WorkspaceMetaItem>
            <WorkspaceMetaItem>{summary.outstandingTaskCount} tasks remaining</WorkspaceMetaItem>
            <WorkspaceMetaItem>{summary.completionPercent}% ready</WorkspaceMetaItem>
          </>
        }
        actions={
          can("task-response") ? (
            <Link className={styles.primaryButton} href={`/portal/tasks${eventQuery}`}>
              Open tasks
              <ArrowRight aria-hidden="true" size={14} />
            </Link>
          ) : undefined
        }
      />

      {can("task-response") ? (
        <section className={styles.nextAction} aria-labelledby="next-action-heading">
          <span className={styles.nextActionIcon}>
            {nextTask ? (
              isTaskBlocked(nextTask, view.tasks) ? (
                <CircleAlert aria-hidden="true" />
              ) : (
                <Sparkles aria-hidden="true" />
              )
            ) : (
              <CheckCircle2 aria-hidden="true" />
            )}
          </span>
          <div>
            <p className={styles.eyebrow}>Your next action</p>
            <h2 id="next-action-heading">{nextTask?.title ?? "You are ready for the event"}</h2>
            <p>
              {nextTask
                ? `${findSubmissionForTask(nextTask, view.submissions)?.title ?? "Speaker task"}${
                    nextTaskDueDate ? ` · Due ${nextTaskDueDate}` : ""
                  }`
                : "Every assigned speaker task is complete."}
            </p>
          </div>
          <Link href={`/portal/tasks${eventQuery}`}>
            {nextTask ? "Continue" : "Review tasks"}
            <ArrowRight aria-hidden="true" size={14} />
          </Link>
        </section>
      ) : null}

      <section className={styles.summaryGrid} aria-label="Portal summary">
        <article className={styles.metricCard}>
          <span className={styles.metricIcon} aria-hidden="true">
            ▤
          </span>
          <div>
            <strong>{summary.submissionCount}</strong>
            <span>{summary.submissionCount === 1 ? "Submission" : "Submissions"}</span>
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
              <p className={styles.eyebrow}>Your submissions</p>
              <h2>Submission status</h2>
            </div>
            <Link href={`/portal/submissions${eventQuery}`}>View all submissions</Link>
          </div>
          {primarySubmission === undefined ? (
            <EmptyState
              title="No submissions yet"
              description="A proposal appears here immediately after you submit it."
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
                <small>
                  Revision {profile.version} · Updated{" "}
                  {formatPortalDate(profile.updatedAt) ?? "recently"}
                </small>
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

      <section className={styles.milestoneStrip} aria-label="Task status">
        <span className={styles.milestoneIcon}>
          <CalendarClock aria-hidden="true" size={16} />
        </span>
        <div>
          <strong>Next task</strong>
          <span>
            {nextTask
              ? `${nextTask.title}${nextTaskDueDate ? ` · Due ${nextTaskDueDate}` : ""}`
              : "No outstanding tasks."}
          </span>
        </div>
        <Link href={`/portal/tasks${eventQuery}`}>View tasks</Link>
      </section>

      {summary.acceptedCount > 0 && can("task-response") ? (
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
