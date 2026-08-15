"use client";

import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import styles from "../review-workspace.module.css";
import type {
  ReviewerInboxFilters,
  ReviewerInboxGroupBy,
  ReviewerInboxStatusView,
} from "../reviewer-inbox";
import type { ReviewerQueueController } from "./evaluator-queue-controller";

export function ReviewerQueueFilters({
  controller,
}: Readonly<{ controller: ReviewerQueueController }>) {
  const {
    statusView,
    setStatusView,
    filters,
    setFilters,
    groupBy,
    setGroupBy,
    statusCounts,
    organizationOptions,
    eventOptions,
    roundOptions,
    trackOptions,
    filtersActive,
    clearFilters,
  } = controller;
  return (
    <>
      <fieldset className={styles.reviewerStatusViews}>
        <legend className={styles.srOnly}>Review status views</legend>
        {(
          [
            ["all", "All", statusCounts.all],
            ["needs-review", "Needs review", statusCounts.needsReview],
            ["in-progress", "In progress", statusCounts.inProgress],
            ["submitted", "Submitted", statusCounts.submitted],
          ] as const
        ).map(([value, label, count]) => (
          <Button
            aria-pressed={statusView === value}
            key={value}
            size="sm"
            type="button"
            variant={statusView === value ? "default" : "outline"}
            onClick={() => setStatusView(value as ReviewerInboxStatusView)}
          >
            {label}
            <Badge variant={statusView === value ? "secondary" : "outline"}>{count}</Badge>
          </Button>
        ))}
      </fieldset>
      <fieldset className={styles.reviewerFilterBar}>
        <legend className={styles.srOnly}>Reviewer inbox filters</legend>
        <label className={styles.reviewerFilterField}>
          <span>Organization</span>
          <select
            value={filters.organizationId}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                organizationId: event.target.value,
                eventId: "all",
                roundKey: "all",
              }))
            }
          >
            <option value="all">All organizations</option>
            {organizationOptions.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.reviewerFilterField}>
          <span>Event</span>
          <select
            value={filters.eventId}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                eventId: event.target.value,
                roundKey: "all",
              }))
            }
          >
            <option value="all">All events</option>
            {eventOptions.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.reviewerFilterField}>
          <span>Round</span>
          <select
            value={filters.roundKey}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                roundKey: event.target.value,
              }))
            }
          >
            <option value="all">All rounds</option>
            {roundOptions.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.reviewerFilterField}>
          <span>Due</span>
          <select
            value={filters.due}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                due: event.target.value as ReviewerInboxFilters["due"],
              }))
            }
          >
            <option value="all">Any time</option>
            <option value="overdue">Overdue</option>
            <option value="today">Today</option>
            <option value="next-7-days">Next 7 days</option>
            <option value="later">Later</option>
            <option value="none">No deadline</option>
          </select>
        </label>
        <label className={styles.reviewerFilterField}>
          <span>Track</span>
          <select
            value={filters.track}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                track: event.target.value,
              }))
            }
          >
            <option value="all">All tracks</option>
            <option value="none">No track</option>
            {trackOptions.map((track) => (
              <option key={track} value={track}>
                {track}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.reviewerFilterField}>
          <span>Group by</span>
          <select
            value={groupBy}
            onChange={(event) => setGroupBy(event.target.value as ReviewerInboxGroupBy)}
          >
            <option value="event">Event</option>
            <option value="organization">Organization</option>
            <option value="round">Round</option>
            <option value="due">Due date</option>
          </select>
        </label>
        {filtersActive ? (
          <Button
            className={styles.reviewerClearFilters}
            size="sm"
            type="button"
            variant="ghost"
            onClick={clearFilters}
          >
            Clear filters
          </Button>
        ) : null}
      </fieldset>
    </>
  );
}
