"use client";
import { AlertTriangle, Search, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OrganizerReviewDesktopTable } from "./organizer-review-desktop-table";
import { OrganizerReviewMobileList } from "./organizer-review-mobile-list";
import styles from "./organizer-review-overview.module.css";
import type { OrganizerReviewOverviewController } from "./organizer-review-overview-controller";
export function OrganizerReviewSubmissionList({
  controller,
}: Readonly<{ controller: OrganizerReviewOverviewController }>) {
  const {
    rows,
    query,
    setQuery,
    needsAttention,
    setNeedsAttention,
    setPage,
    filteredRows,
    visibleRows,
    pageCount,
    currentPage,
    rangeStart,
    rangeEnd,
    hasActiveFilters,
    clearFilters,
  } = controller;
  return (
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
            <OrganizerReviewDesktopTable controller={controller} />
            <OrganizerReviewMobileList controller={controller} />
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
  );
}
