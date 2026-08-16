"use client";
import { AlertTriangle, ArrowUpRight, CheckCircle2, CircleGauge, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import styles from "./organizer-review-overview.module.css";
import type {
  OrganizerReviewAttentionKind,
  OrganizerReviewRow,
} from "./organizer-review-overview-types";
function AttentionIcon({ kind }: Readonly<{ kind: OrganizerReviewAttentionKind }>) {
  if (kind === "none") return <CheckCircle2 aria-hidden="true" />;
  if (kind === "conflict") return <AlertTriangle aria-hidden="true" />;
  if (kind === "decision") return <Scale aria-hidden="true" />;
  return <CircleGauge aria-hidden="true" />;
}
export function ReviewAction({
  row,
  onManageReviewers,
  onOpenDecisions,
}: Readonly<{
  row: OrganizerReviewRow;
  onManageReviewers: (id: string) => void;
  onOpenDecisions: (id: string) => void;
}>) {
  const action = row.attentionAction;
  const label = action?.label ?? "Manage reviewers";
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={!row.manageable}
      onClick={() =>
        action?.target === "decisions" ? onOpenDecisions(row.id) : onManageReviewers(row.id)
      }
      data-action={action?.target === "decisions" ? "open-decisions" : "manage-reviewers"}
      aria-label={`${label} for ${row.reference}: ${row.title}`}
    >
      {label}
      <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
    </Button>
  );
}
export function SubmissionIdentity({ row }: Readonly<{ row: OrganizerReviewRow }>) {
  return (
    <div className={styles.identity}>
      <span>{row.reference}</span>
      <strong>{row.title}</strong>
    </div>
  );
}
export function ReviewerSummary({ row }: Readonly<{ row: OrganizerReviewRow }>) {
  return (
    <div className={styles.cellStack}>
      <strong>
        {row.assignedReviewerCount}/{row.expectedReviewerCount} assigned
      </strong>
      <span>
        {row.reviewerDisplayNames.length ? row.reviewerDisplayNames.join(", ") : "No reviewers"}
      </span>
    </div>
  );
}
export function Attention({ row }: Readonly<{ row: OrganizerReviewRow }>) {
  return (
    <Badge
      variant={row.attentionKind === "none" ? "secondary" : "outline"}
      className={styles.attentionBadge}
      data-kind={row.attentionKind}
    >
      <AttentionIcon kind={row.attentionKind} />
      {row.attentionLabel}
    </Badge>
  );
}
