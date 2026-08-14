"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleGauge,
  Scale,
  Search,
  SearchX,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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

export type OrganizerReviewAttentionKind =
  | "none"
  | "assignment"
  | "completion"
  | "conflict"
  | "decision";

export interface OrganizerReviewMetric {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}

export interface OrganizerReviewAttentionSummary {
  readonly count: number;
  readonly label: string;
  readonly description: string;
}

export interface OrganizerReviewRow {
  readonly id: string;
  readonly reference: string;
  readonly title: string;
  readonly roundName: string;
  readonly assignedReviewerCount: number;
  readonly expectedReviewerCount: number;
  readonly completedReviewCount: number;
  readonly expectedReviewCount: number;
  readonly weightedScoreLabel: string;
  readonly conflictCount: number;
  readonly decisionLabel: string;
  readonly attentionKind: OrganizerReviewAttentionKind;
  readonly attentionLabel: string;
  readonly reviewerDisplayNames: readonly string[];
  readonly manageable: boolean;
  readonly attentionAction?:
    | { readonly label: string; readonly target: "reviewers" }
    | { readonly label: string; readonly target: "decisions" };
}

export interface OrganizerReviewOverviewProps {
  readonly planName: string;
  readonly planStatusLabel: string;
  readonly description: string;
  readonly metrics: readonly OrganizerReviewMetric[];
  readonly completionPercent: number;
  readonly attentionSummary: OrganizerReviewAttentionSummary;
  readonly rows: readonly OrganizerReviewRow[];
  readonly onManageReviewers: (id: string) => void;
  readonly onOpenPlan: () => void;
  readonly onOpenReviewers: () => void;
  readonly onOpenDecisions: (id: string) => void;
}

type ReviewStatus = "not-started" | "in-progress" | "complete";
const PAGE_SIZE = 10;

function reviewStatus(row: OrganizerReviewRow): ReviewStatus {
  if (row.expectedReviewCount > 0 && row.completedReviewCount >= row.expectedReviewCount) {
    return "complete";
  }
  return row.completedReviewCount > 0 ? "in-progress" : "not-started";
}

function AttentionIcon({ kind }: Readonly<{ kind: OrganizerReviewAttentionKind }>) {
  if (kind === "none") return <CheckCircle2 aria-hidden="true" />;
  if (kind === "conflict") return <AlertTriangle aria-hidden="true" />;
  if (kind === "decision") return <Scale aria-hidden="true" />;
  return <CircleGauge aria-hidden="true" />;
}

function ReviewAction({
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
  const actionMarker = action?.target === "decisions" ? "open-decisions" : "manage-reviewers";
  const activate = () =>
    action?.target === "decisions" ? onOpenDecisions(row.id) : onManageReviewers(row.id);

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={!row.manageable}
      onClick={activate}
      data-action={actionMarker}
      aria-label={`${label} for ${row.reference}: ${row.title}`}
    >
      {label}
      <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
    </Button>
  );
}

function SubmissionIdentity({ row }: Readonly<{ row: OrganizerReviewRow }>) {
  return (
    <div className={styles.identity}>
      <span>{row.reference}</span>
      <strong>{row.title}</strong>
    </div>
  );
}

function ReviewerSummary({ row }: Readonly<{ row: OrganizerReviewRow }>) {
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

function Attention({ row }: Readonly<{ row: OrganizerReviewRow }>) {
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

export function OrganizerReviewOverview({
  planName,
  planStatusLabel,
  description,
  metrics,
  completionPercent,
  attentionSummary,
  rows,
  onManageReviewers,
  onOpenPlan,
  onOpenReviewers,
  onOpenDecisions,
}: OrganizerReviewOverviewProps) {
  const [query, setQuery] = useState("");
  const [needsAttention, setNeedsAttention] = useState(false);
  const [page, setPage] = useState(0);
  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    return rows.filter((row) => {
      if (needsAttention && row.attentionKind === "none") return false;
      if (!normalizedQuery) return true;

      return [row.title, row.reference, ...row.reviewerDisplayNames].some((value) =>
        value.toLocaleLowerCase().includes(normalizedQuery),
      );
    });
  }, [needsAttention, query, rows]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageStart = currentPage * PAGE_SIZE;
  const visibleRows = filteredRows.slice(pageStart, pageStart + PAGE_SIZE);
  const rangeStart = filteredRows.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(pageStart + PAGE_SIZE, filteredRows.length);
  const hasActiveFilters = query.length > 0 || needsAttention;

  const clearFilters = () => {
    setQuery("");
    setNeedsAttention(false);
    setPage(0);
  };

  return (
    <section className={styles.overview} aria-labelledby="review-overview-title">
      <header className={styles.header}>
        <div className={styles.heading}>
          <div className={styles.kickerRow}>
            <span>Review operations</span>
            <Badge variant="outline">{planStatusLabel}</Badge>
          </div>
          <h2 id="review-overview-title">{planName}</h2>
          <p>{description}</p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="outline" onClick={onOpenReviewers} data-action="open-reviewers">
            <Users data-icon="inline-start" aria-hidden="true" />
            Reviewers
          </Button>
          <Button onClick={onOpenPlan} data-action="open-plan">
            Review plan
            <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
          </Button>
        </div>
      </header>

      <section className={styles.summaryGrid} aria-label="Review plan summary">
        <Card className={styles.metricsCard}>
          <CardHeader className={styles.cardHeader}>
            <CardTitle>Plan pulse</CardTitle>
            <CircleGauge aria-hidden="true" />
          </CardHeader>
          <CardContent className={styles.metrics}>
            {metrics.map((metric) => (
              <div key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.detail}</small>
              </div>
            ))}
            <div className={styles.overallProgress}>
              <span>Overall progress</span>
              <strong>{completionPercent}%</strong>
              <Progress
                value={completionPercent}
                aria-label="Overall review completion"
                aria-valuetext={`${completionPercent}% complete`}
              />
            </div>
          </CardContent>
        </Card>
        <button
          className={styles.attentionSummary}
          type="button"
          onClick={onOpenReviewers}
          data-action="open-reviewers"
        >
          <span className={styles.attentionIcon}>
            <AlertTriangle aria-hidden="true" />
          </span>
          <span>
            <small>Attention queue</small>
            <strong>
              {attentionSummary.count} {attentionSummary.label}
            </strong>
            <span>{attentionSummary.description}</span>
          </span>
          <ArrowUpRight className={styles.summaryArrow} aria-hidden="true" />
        </button>
      </section>

      <Card className={styles.submissionsCard}>
        <CardHeader className={styles.listHeader}>
          <div>
            <CardTitle>Submissions</CardTitle>
            <p>{rows.length} submissions in this review plan</p>
          </div>
          <Badge variant="secondary">Submission view</Badge>
        </CardHeader>
        <CardContent className={styles.listContent}>
          <search className={styles.collectionToolbar} aria-label="Submission filters">
            <div className={styles.filterControls}>
              <div className={styles.searchField}>
                <Search aria-hidden="true" />
                <Input
                  className={styles.searchInput}
                  type="search"
                  aria-label="Search submissions"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.currentTarget.value);
                    setPage(0);
                  }}
                  placeholder="Search title, reference, or reviewer"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                aria-pressed={needsAttention}
                className={styles.attentionFilter}
                onClick={() => {
                  setNeedsAttention((current) => !current);
                  setPage(0);
                }}
              >
                <AlertTriangle data-icon="inline-start" aria-hidden="true" />
                Needs attention
              </Button>
            </div>
            <p className={styles.resultCount} aria-live="polite">
              <strong>{filteredRows.length}</strong> result{filteredRows.length === 1 ? "" : "s"}
            </p>
          </search>
          {visibleRows.length ? (
            <>
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
              <div className={styles.mobileList}>
                {visibleRows.map((row) => (
                  <article
                    key={row.id}
                    className={styles.mobileRow}
                    data-submission-id={row.id}
                    data-review-status={reviewStatus(row)}
                    data-attention={row.attentionKind}
                  >
                    <div className={styles.mobileHeading}>
                      <SubmissionIdentity row={row} />
                      <Attention row={row} />
                    </div>
                    <dl className={styles.mobileFacts}>
                      <div>
                        <dt>Round</dt>
                        <dd>{row.roundName}</dd>
                      </div>
                      <div>
                        <dt>Reviews</dt>
                        <dd>
                          {row.completedReviewCount}/{row.expectedReviewCount}
                        </dd>
                      </div>
                      <div>
                        <dt>Weighted score</dt>
                        <dd>{row.weightedScoreLabel}</dd>
                      </div>
                      <div>
                        <dt>Decision</dt>
                        <dd>{row.decisionLabel}</dd>
                      </div>
                    </dl>
                    <ReviewerSummary row={row} />
                    <div className={styles.mobileAction}>
                      <ReviewAction
                        row={row}
                        onManageReviewers={onManageReviewers}
                        onOpenDecisions={onOpenDecisions}
                      />
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className={styles.noResults} role="status">
              <span className={styles.noResultsIcon}>
                <SearchX aria-hidden="true" />
              </span>
              <div>
                <strong>No submissions found</strong>
                <p>Try a different title, reference, reviewer, or attention filter.</p>
              </div>
              {hasActiveFilters ? (
                <Button type="button" variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : null}
            </div>
          )}
          <nav className={styles.pagination} aria-label="Submission pagination">
            <p>
              Showing <strong>{rangeStart}</strong>–<strong>{rangeEnd}</strong> of{" "}
              <strong>{filteredRows.length}</strong>
            </p>
            <div className={styles.pageControls}>
              <span aria-live="polite">
                Page {currentPage + 1} of {pageCount}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={currentPage >= pageCount - 1}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </Button>
            </div>
          </nav>
        </CardContent>
      </Card>
    </section>
  );
}
