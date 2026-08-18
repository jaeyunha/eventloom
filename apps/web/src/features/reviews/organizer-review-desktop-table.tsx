"use client";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import styles from "./organizer-review-overview.module.css";
import type { OrganizerReviewOverviewController } from "./organizer-review-overview-controller";
import {
  Attention,
  ReviewAction,
  ReviewerSummary,
  SubmissionIdentity,
} from "./organizer-review-row-parts";
import { OrganizerAiTriagePanel } from "./organizer-ai-triage-panel";
import { reviewStatus } from "./organizer-review-status";
export function OrganizerReviewDesktopTable({
  controller,
}: Readonly<{ controller: OrganizerReviewOverviewController }>) {
  const { visibleRows, onManageReviewers, onOpenDecisions, aiTriage } = controller;
  return (
    <div className={styles.desktopTable}>
      <Table>
        <TableCaption>
          Submission review progress, score, decision, and attention status.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Submission</TableHead>
            <TableHead>Round & reviewers</TableHead>
            <TableHead>Reviews</TableHead>
            <TableHead>Score</TableHead>
            {aiTriage?.enabled === true ? <TableHead>AI triage</TableHead> : null}
            <TableHead>Decision</TableHead>
            <TableHead>Attention</TableHead>
            <TableHead>
              <span className={styles.srOnly}>Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.map((row) => (
            <TableRow
              key={row.id}
              data-submission-id={row.id}
              data-review-status={reviewStatus(row)}
              data-attention={row.attentionKind}
            >
              <TableHead scope="row">
                <SubmissionIdentity row={row} />
              </TableHead>
              <TableCell>
                <span className={styles.roundName}>{row.roundName}</span>
                <ReviewerSummary row={row} />
              </TableCell>
              <TableCell>
                <strong>
                  {row.completedReviewCount}/{row.expectedReviewCount}
                </strong>
                <span className={styles.cellNote}>complete</span>
              </TableCell>
              <TableCell>
                <strong>{row.weightedScoreLabel}</strong>
                {row.conflictCount > 0 ? (
                  <span className={styles.conflict}>
                    {row.conflictCount} conflict{row.conflictCount === 1 ? "" : "s"}
                  </span>
                ) : null}
              </TableCell>
              {aiTriage?.enabled === true ? (
                <TableCell>
                  <OrganizerAiTriagePanel
                    key={`${row.id}:${aiTriage.suggestions[row.id]?.version ?? "new"}`}
                    submissionId={row.id}
                    aiTriage={aiTriage}
                  />
                </TableCell>
              ) : null}
              <TableCell>{row.decisionLabel}</TableCell>
              <TableCell>
                <Attention row={row} />
              </TableCell>
              <TableCell className={styles.actionCell}>
                <ReviewAction
                  row={row}
                  onManageReviewers={onManageReviewers}
                  onOpenDecisions={onOpenDecisions}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
