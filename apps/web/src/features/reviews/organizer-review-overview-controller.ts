"use client";
import { useMemo, useState } from "react";
import type { OrganizerReviewOverviewProps } from "./organizer-review-overview-types";

const PAGE_SIZE = 10;
export function useOrganizerReviewOverviewController(props: OrganizerReviewOverviewProps) {
  const [query, setQuery] = useState("");
  const [needsAttention, setNeedsAttention] = useState(false);
  const [page, setPage] = useState(0);
  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return props.rows.filter((row) => {
      if (needsAttention && row.attentionKind === "none") return false;
      if (!normalizedQuery) return true;
      return [row.title, row.reference, ...row.reviewerDisplayNames].some((value) =>
        value.toLocaleLowerCase().includes(normalizedQuery),
      );
    });
  }, [needsAttention, query, props.rows]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageStart = currentPage * PAGE_SIZE;
  const visibleRows = filteredRows.slice(pageStart, pageStart + PAGE_SIZE);
  const rangeStart = filteredRows.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(pageStart + PAGE_SIZE, filteredRows.length);
  const clearFilters = () => {
    setQuery("");
    setNeedsAttention(false);
    setPage(0);
  };
  return {
    ...props,
    query,
    setQuery,
    needsAttention,
    setNeedsAttention,
    page,
    setPage,
    filteredRows,
    pageCount,
    currentPage,
    visibleRows,
    rangeStart,
    rangeEnd,
    hasActiveFilters: query.length > 0 || needsAttention,
    clearFilters,
  };
}
export type OrganizerReviewOverviewController = ReturnType<
  typeof useOrganizerReviewOverviewController
>;
