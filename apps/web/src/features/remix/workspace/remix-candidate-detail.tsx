import { RotateCcw, ShieldCheck, X } from "lucide-react";
import type { RefObject } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/workspace/workspace-ui";
import type { RemixCandidate, RemixSourceRecord } from "../api";
import styles from "../remix-workspace.module.css";
import {
  candidateStatusLabel,
  displayValue,
  fieldLabels,
  formatTimestamp,
  inputValue,
  sourceLabel,
  valueForField,
} from "./remix-workspace-model";

interface RemixCandidateDetailProps {
  readonly candidate: RemixCandidate;
  readonly source: RemixSourceRecord | undefined;
  readonly stale: boolean;
  readonly draftContent: Readonly<Record<string, string>>;
  readonly onDraftChange: (field: string, value: string) => void;
  readonly busyAction: string | null;
  readonly loading: boolean;
  readonly apiAvailable: boolean;
  readonly onRegenerate: () => void;
  readonly onReject: () => void;
  readonly humanConfirmed: boolean;
  readonly onHumanConfirmedChange: (confirmed: boolean) => void;
  readonly canApply: boolean;
  readonly onOpenApply: () => void;
  readonly applyButtonRef: RefObject<HTMLButtonElement | null>;
}

function statusTone(candidate: RemixCandidate, stale: boolean) {
  if (stale) return "warning" as const;
  if (candidate.status === "applied") return "success" as const;
  if (candidate.status === "rejected") return "danger" as const;
  return "info" as const;
}

export function RemixCandidateDetail({
  candidate,
  source,
  stale,
  draftContent,
  onDraftChange,
  busyAction,
  loading,
  apiAvailable,
  onRegenerate,
  onReject,
  humanConfirmed,
  onHumanConfirmedChange,
  canApply,
  onOpenApply,
  applyButtonRef,
}: RemixCandidateDetailProps) {
  return (
    <article className={styles.candidateDetail}>
      <header className={styles.candidateHeader}>
        <div>
          <span className={styles.stepLabel}>Selected suggestion</span>
          <h3>{sourceLabel(source)}</h3>
          <p>
            Generation {candidate.generation} · created {formatTimestamp(candidate.createdAt)}
          </p>
        </div>
        <StatusBadge tone={statusTone(candidate, stale)}>
          {stale ? "Source changed" : candidateStatusLabel(candidate)}
        </StatusBadge>
      </header>

      {stale ? (
        <Alert variant="destructive">
          <AlertTitle>Generate a fresh suggestion</AlertTitle>
          <AlertDescription>
            The source changed after this suggestion was created, so it cannot be applied.
          </AlertDescription>
        </Alert>
      ) : null}

      <Table className={styles.comparisonTable}>
        <TableCaption>Original content beside the editable suggestion</TableCaption>
        <TableHeader className={styles.comparisonTableHeader}>
          <TableRow className={styles.comparisonTableRow}>
            <TableHead className={styles.comparisonTableHead}>Field</TableHead>
            <TableHead className={styles.comparisonTableHead}>Original</TableHead>
            <TableHead className={styles.comparisonTableHead}>Suggestion</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {candidate.fields.map((field) => (
            <TableRow className={styles.comparisonTableRow} key={field}>
              <TableHead className={styles.comparisonTableHead} scope="row">
                {fieldLabels[field]}
              </TableHead>
              <TableCell className={styles.comparisonTableCell} data-label="Original">
                {displayValue(valueForField(candidate.original, field))}
              </TableCell>
              <TableCell className={styles.comparisonTableCell} data-label="Suggestion">
                {candidate.status === "pending" && !stale ? (
                  field === "description" || field === "biography" ? (
                    <Textarea
                      aria-label={`${fieldLabels[field]} suggestion`}
                      rows={5}
                      value={
                        draftContent[field] ?? inputValue(valueForField(candidate.candidate, field))
                      }
                      onChange={(event) => onDraftChange(field, event.currentTarget.value)}
                    />
                  ) : (
                    <Input
                      aria-label={`${fieldLabels[field]} suggestion`}
                      value={
                        draftContent[field] ?? inputValue(valueForField(candidate.candidate, field))
                      }
                      onChange={(event) => onDraftChange(field, event.currentTarget.value)}
                    />
                  )
                ) : (
                  displayValue(valueForField(candidate.candidate, field))
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <section className={styles.changeSummary}>
        <h4>What changed</h4>
        <p>{candidate.changeSummary}</p>
        <span>
          {candidate.changedFields.map((field) => fieldLabels[field]).join(", ") ||
            "No fields changed"}
        </span>
      </section>

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="sm">
            Technical details
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className={styles.technicalDetails}>
          <dl className={styles.provenance}>
            <div>
              <dt>Provider</dt>
              <dd>{candidate.provenance.provider}</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>{candidate.provenance.model}</dd>
            </div>
            <div>
              <dt>Prompt version</dt>
              <dd>{candidate.provenance.promptVersion}</dd>
            </div>
            <div>
              <dt>Source revision</dt>
              <dd>{candidate.sourceRevision}</dd>
            </div>
            <div>
              <dt>Candidate ID</dt>
              <dd>{candidate.id}</dd>
            </div>
            {candidate.provenance.requestId ? (
              <div>
                <dt>Provider request</dt>
                <dd>{candidate.provenance.requestId}</dd>
              </div>
            ) : null}
          </dl>
        </CollapsibleContent>
      </Collapsible>

      <div className={styles.reviewActions}>
        <Button
          type="button"
          variant="outline"
          onClick={onRegenerate}
          disabled={
            busyAction !== null || loading || candidate.status === "applied" || !apiAvailable
          }
        >
          <RotateCcw data-icon="inline-start" />
          {busyAction === "regenerate" ? "Regenerating…" : "Regenerate"}
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={onReject}
          disabled={
            busyAction !== null ||
            loading ||
            candidate.status === "applied" ||
            candidate.status === "rejected" ||
            !apiAvailable
          }
        >
          <X data-icon="inline-start" />
          {busyAction === "reject" ? "Rejecting…" : "Reject"}
        </Button>
      </div>

      <fieldset className={styles.confirmation}>
        <legend>Apply approved changes</legend>
        <Label className={styles.confirmationLabel} htmlFor="remix-human-confirmation">
          <Checkbox
            id="remix-human-confirmation"
            checked={humanConfirmed}
            onCheckedChange={(checked) => onHumanConfirmedChange(checked === true)}
            disabled={loading || candidate.status !== "pending" || stale || !apiAvailable}
          />
          <span>I reviewed the original, suggestion, and changed fields.</span>
        </Label>
        <p>Applying writes only the selected fields and records the action in the audit trail.</p>
        <Button ref={applyButtonRef} type="button" onClick={onOpenApply} disabled={!canApply}>
          <ShieldCheck data-icon="inline-start" />
          Apply approved changes
        </Button>
      </fieldset>
    </article>
  );
}
