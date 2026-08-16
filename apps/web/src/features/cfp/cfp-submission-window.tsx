import { CalendarClock } from "lucide-react";
import styles from "./cfp-submission-window.module.css";

type WindowStatus = "closed" | "open" | "upcoming";

interface CfpSubmissionWindowProps {
  readonly closesAt: string;
  readonly closesLabel: string;
  readonly limit?: number;
  readonly opensAt: string;
  readonly opensLabel: string;
  readonly status: WindowStatus;
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

export function CfpSubmissionWindow({
  closesAt,
  closesLabel,
  limit,
  opensAt,
  opensLabel,
  status,
}: CfpSubmissionWindowProps) {
  const copy = STATUS_COPY[status];

  return (
    <section className={styles.window} data-status={status} aria-labelledby="cfp-window-heading">
      <div className={styles.heading}>
        <span className={styles.icon} aria-hidden="true">
          <CalendarClock size={15} />
        </span>
        <div>
          <p>Submission window</p>
          <h2 id="cfp-window-heading">{copy.label}</h2>
        </div>
      </div>
      <p className={styles.description}>{copy.description}</p>
      <dl className={styles.dates}>
        <div>
          <dt>Opens</dt>
          <dd>
            <time dateTime={opensAt}>{opensLabel}</time>
          </dd>
        </div>
        <div>
          <dt>Closes</dt>
          <dd>
            <time dateTime={closesAt}>{closesLabel}</time>
          </dd>
        </div>
      </dl>
      {limit !== undefined ? (
        <p className={styles.limit}>
          Up to {limit} proposal{limit === 1 ? "" : "s"} per account
        </p>
      ) : null}
    </section>
  );
}
