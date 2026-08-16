import { CalendarClock } from "lucide-react";
import styles from "./cfp-submission-window.module.css";

type WindowStatus = "closed" | "open" | "upcoming";

interface CfpSubmissionWindowProps {
  readonly closesAt: string;
  readonly limit?: number;
  readonly opensAt: string;
  readonly status: WindowStatus;
  readonly timeZone: string;
}

const STATUS_COPY: Record<WindowStatus, { label: string; description: string }> = {
  open: {
    label: "Open for submissions",
    description: "You can save a draft and return before the deadline.",
  },
  upcoming: {
    label: "Submissions open soon",
    description: "You can review the form now and start when the window opens.",
  },
  closed: {
    label: "Submissions closed",
    description: "New drafts and proposal edits are no longer accepted.",
  },
};

function formatInstant(value: string, timeZone: string): { date: string; clock: string } {
  const instant = new Date(value);
  return {
    date: new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone,
    }).format(instant),
    clock: new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
      timeZone,
    }).format(instant),
  };
}

function WindowInstant({
  dateTime,
  timeZone,
}: {
  readonly dateTime: string;
  readonly timeZone: string;
}) {
  const formatted = formatInstant(dateTime, timeZone);
  return (
    <time data-cfp-window-value="true" dateTime={dateTime}>
      <span className={styles.dateGroup} data-cfp-window-date-group="true">
        {formatted.date}
      </span>{" "}
      <span className={styles.clockGroup} data-cfp-window-clock-group="true">
        {formatted.clock}
      </span>
    </time>
  );
}

export function CfpSubmissionWindow({
  closesAt,
  limit,
  opensAt,
  status,
  timeZone,
}: CfpSubmissionWindowProps) {
  const copy = STATUS_COPY[status];

  return (
    <section
      aria-labelledby="cfp-window-heading"
      className={styles.window}
      data-cfp-submission-window="true"
      data-status={status}
    >
      <div className={styles.summary}>
        <span aria-hidden="true" className={styles.icon}>
          <CalendarClock size={15} />
        </span>
        <div className={styles.copy}>
          <div className={styles.heading}>
            <p>Submission window</p>
            <h2 id="cfp-window-heading">{copy.label}</h2>
          </div>
          <p className={styles.description}>{copy.description}</p>
          <div className={styles.metadata}>
            <p className={styles.timeZone}>Times shown in {timeZone}</p>
            {limit !== undefined ? (
              <p className={styles.limit}>
                Up to {limit} proposal{limit === 1 ? "" : "s"} per account
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <dl className={styles.dates}>
        <div>
          <dt>Opens</dt>
          <dd>
            <WindowInstant dateTime={opensAt} timeZone={timeZone} />
          </dd>
        </div>
        <div>
          <dt>Closes</dt>
          <dd>
            <WindowInstant dateTime={closesAt} timeZone={timeZone} />
          </dd>
        </div>
      </dl>
    </section>
  );
}
