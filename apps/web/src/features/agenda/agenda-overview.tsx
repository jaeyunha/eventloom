import styles from "./agenda-overview.module.css";

interface AgendaOverviewProps {
  readonly scheduledCount: number;
  readonly toPlaceCount: number;
  readonly hardConflictCount: number | null;
  readonly publishedRevisionNumber: number | null;
}

interface AgendaMetricProps {
  readonly label: string;
  readonly value: string | number;
  readonly detail: string;
  readonly tone?: "attention" | "success";
}

function AgendaMetric({ label, value, detail, tone }: AgendaMetricProps) {
  return (
    <div className={styles.metric} data-tone={tone}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

export function AgendaOverview({
  scheduledCount,
  toPlaceCount,
  hardConflictCount,
  publishedRevisionNumber,
}: AgendaOverviewProps) {
  const agendaSessionCount = scheduledCount + toPlaceCount;
  return (
    <section className={styles.overview} aria-label="Schedule at a glance">
      <AgendaMetric label="Sessions" value={agendaSessionCount} detail="in this draft" />
      <AgendaMetric label="Scheduled" value={scheduledCount} detail="placed on the agenda" />
      <AgendaMetric label="To place" value={toPlaceCount} detail="waiting for a time" />
      <AgendaMetric
        label="Conflicts"
        value={hardConflictCount ?? "—"}
        detail={hardConflictCount === null ? "run validation to check" : "blocking issues"}
        {...(hardConflictCount !== null && hardConflictCount > 0
          ? { tone: "attention" as const }
          : {})}
      />
      <AgendaMetric
        label="Public agenda"
        value={
          publishedRevisionNumber === null ? "Not published" : `Revision ${publishedRevisionNumber}`
        }
        detail={publishedRevisionNumber === null ? "private draft only" : "currently live"}
        {...(publishedRevisionNumber === null ? {} : { tone: "success" as const })}
      />
    </section>
  );
}
