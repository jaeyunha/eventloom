import { ArrowRight, CalendarDays, CheckCircle2, Clock3, FileText } from "lucide-react";
import Link from "next/link";
import { StatusBadge, WorkspaceHeader, WorkspaceProgressSummary } from "@/components/workspace";
import { submissionStatusPresentation } from "./model";
import type {
  ParticipantDashboard,
  ParticipantDashboardEvent,
} from "./participant-dashboard-model";
import styles from "./portal-dashboard.module.css";
import { portalSubmissionDisplayTitle } from "./portal-submission-model";
import { SubmissionStatusBadge } from "./portal-ui";

function plural(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function readinessLabel(event: ParticipantDashboardEvent): string {
  switch (event.taskSummary.state) {
    case "action-required":
      return "Action required";
    case "awaiting-review":
      return "Awaiting review";
    case "complete":
      return "Tasks complete";
    case "not-assigned":
      return "No tasks assigned";
  }
}

function SelectedEventDetails({ event }: { readonly event: ParticipantDashboardEvent }) {
  return (
    <div className={styles.selectedDetails}>
      {event.speakerPreparation.status === "available" ? (
        <section className={styles.preparationCallout} aria-label="Accepted session preparation">
          <div className={styles.calloutIcon}>
            <CheckCircle2 aria-hidden="true" />
          </div>
          <div>
            <span className={styles.kicker}>Accepted session</span>
            <h3>Prepare for your event</h3>
            <p>
              {plural(event.speakerPreparation.acceptedSubmissionCount, "accepted proposal")} and
              your assigned speaker tasks are ready to review.
            </p>
          </div>
          <Link className={styles.primaryAction} href={event.speakerPreparation.href}>
            Prepare for event <ArrowRight aria-hidden="true" />
          </Link>
        </section>
      ) : null}

      <div className={styles.eventColumns}>
        <section
          className={styles.submissionSection}
          aria-labelledby={`submissions-${event.context.id}`}
        >
          <header className={styles.sectionHeading}>
            <div>
              <span className={styles.kicker}>Selected event</span>
              <h3 id={`submissions-${event.context.id}`}>Submission statuses</h3>
            </div>
            <Link href={`/portal/submissions${event.eventQuery}`}>View all</Link>
          </header>
          {event.submissions.length === 0 ? (
            <p className={styles.emptyCopy}>No proposals are attached to this event context.</p>
          ) : (
            <ul className={styles.submissionList}>
              {event.submissions.map(({ submission, primaryAction }) => {
                const presentation = submissionStatusPresentation(submission.status);
                return (
                  <li key={submission.id}>
                    <div className={styles.submissionIcon}>
                      <FileText aria-hidden="true" />
                    </div>
                    <div className={styles.submissionCopy}>
                      <h4>
                        {portalSubmissionDisplayTitle(
                          submission,
                          event.submissions.map(({ submission: item }) => item),
                        )}
                      </h4>
                      <p>{presentation.description}</p>
                    </div>
                    <SubmissionStatusBadge status={submission.status} />
                    <Link className={styles.rowAction} href={primaryAction.href}>
                      {primaryAction.label}
                      <span className={styles.srOnly}>
                        : {portalSubmissionDisplayTitle(submission)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className={styles.readinessPanel} aria-label="Speaker task progress">
          <WorkspaceProgressSummary
            label="Speaker tasks"
            value={event.taskSummary.finishedTaskCount}
            max={Math.max(event.taskSummary.totalTaskCount, 1)}
            detail={`${event.taskSummary.finishedTaskCount} of ${event.taskSummary.totalTaskCount} assigned tasks complete`}
            status={
              <StatusBadge
                tone={
                  event.taskSummary.state === "complete"
                    ? "success"
                    : event.taskSummary.state === "action-required"
                      ? "warning"
                      : "neutral"
                }
              >
                {readinessLabel(event)}
              </StatusBadge>
            }
          />
          <div className={styles.readinessFacts}>
            <span>
              <Clock3 aria-hidden="true" />
              {plural(event.taskSummary.outstandingTaskCount, "task")} remaining
            </span>
            <span>
              <CalendarDays aria-hidden="true" />
              Event preparation only
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}

function EventCard({
  event,
  selected,
}: {
  readonly event: ParticipantDashboardEvent;
  readonly selected: boolean;
}) {
  const authoritativeCount = selected
    ? event.submissionSummary.totalCount
    : event.context.submissionIds.length;
  return (
    <article className={styles.eventCard} data-selected={selected || undefined}>
      <div className={styles.eventSummary}>
        <div className={styles.eventMark} aria-hidden="true">
          <CalendarDays />
        </div>
        <div className={styles.eventTitle}>
          <span className={styles.kicker}>{selected ? "Selected event" : "Authorized event"}</span>
          <h2>{event.context.name}</h2>
          <p>{plural(authoritativeCount, "submission")}</p>
        </div>
        {selected ? <StatusBadge tone="info">Current context</StatusBadge> : null}
        {!selected ? (
          <Link className={styles.selectAction} href={`/portal${event.eventQuery}`}>
            Select event <ArrowRight aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      {selected ? (
        <SelectedEventDetails event={event} />
      ) : (
        <p className={styles.contextHint}>
          Select this event to view proposal statuses and available actions.
        </p>
      )}
    </article>
  );
}

export function ParticipantEventsDashboard({
  dashboard,
  selectedContextId,
}: {
  readonly dashboard: ParticipantDashboard;
  readonly selectedContextId: string | null;
}) {
  return (
    <div className={styles.dashboard}>
      <WorkspaceHeader
        eyebrow="Participant workspace"
        title="My events"
        description="Track every proposal by event. Select an event to see its authoritative statuses and speaker preparation work."
        metadata={<span>{plural(dashboard.events.length, "authorized event")}</span>}
      />
      <div className={styles.eventList}>
        {dashboard.events.map((event) => (
          <EventCard
            key={event.context.id}
            event={event}
            selected={event.context.id === selectedContextId}
          />
        ))}
      </div>
    </div>
  );
}
