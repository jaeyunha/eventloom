import type { HTMLAttributes, ReactNode } from "react";
import { Progress } from "@/components/ui";
import { cn } from "@/lib/utils";
import styles from "./workspace-content.module.css";

export interface WorkspaceProgressSummaryProps extends HTMLAttributes<HTMLElement> {
  readonly label: ReactNode;
  readonly value: number;
  readonly max: number;
  readonly detail?: ReactNode;
  readonly status?: ReactNode;
}

export function WorkspaceProgressSummary({
  label,
  value,
  max,
  detail,
  status,
  className,
  ...props
}: WorkspaceProgressSummaryProps) {
  return (
    <section className={cn(styles.progressSummary, className)} {...props}>
      <div className={styles.progressHeading}>
        <div>
          <h2 className={styles.progressLabel}>{label}</h2>
          {detail === undefined ? null : <p className={styles.progressDetail}>{detail}</p>}
        </div>
        {status === undefined ? null : <div className={styles.progressStatus}>{status}</div>}
      </div>
      <Progress
        aria-label={typeof label === "string" ? label : undefined}
        max={max}
        value={value}
      />
    </section>
  );
}

export interface WorkspaceListDetailProps extends HTMLAttributes<HTMLDivElement> {
  readonly list: ReactNode;
  readonly listLabel: string;
  readonly detail: ReactNode;
  readonly detailLabel: string;
  readonly inspector?: ReactNode;
  readonly inspectorLabel?: string;
}

export function WorkspaceListDetail({
  list,
  listLabel,
  detail,
  detailLabel,
  inspector,
  inspectorLabel = "Contextual details",
  className,
  ...props
}: WorkspaceListDetailProps) {
  return (
    <div
      className={cn(styles.listDetail, inspector !== undefined && styles.withInspector, className)}
      {...props}
    >
      <nav aria-label={listLabel} className={styles.list}>
        {list}
      </nav>
      <section aria-label={detailLabel} className={styles.detail}>
        {detail}
      </section>
      {inspector === undefined ? null : (
        <aside aria-label={inspectorLabel} className={styles.inspector}>
          {inspector}
        </aside>
      )}
    </div>
  );
}

export interface MetadataListProps extends HTMLAttributes<HTMLDListElement> {}

export function MetadataList({ className, children, ...props }: MetadataListProps) {
  return (
    <dl className={cn(styles.metadataList, className)} {...props}>
      {children}
    </dl>
  );
}

export interface MetadataRowProps extends HTMLAttributes<HTMLDivElement> {
  readonly label: ReactNode;
  readonly value: ReactNode;
}

export function MetadataRow({ label, value, className, ...props }: MetadataRowProps) {
  return (
    <div className={cn(styles.metadataRow, className)} {...props}>
      <dt className={styles.metadataLabel}>{label}</dt>
      <dd className={styles.metadataValue}>{value}</dd>
    </div>
  );
}

export const ProgressSummary = WorkspaceProgressSummary;

export const CollectionLayout = WorkspaceListDetail;
