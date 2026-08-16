import styles from "./portal.module.css";
import type { PortalSubmission } from "./types";

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
