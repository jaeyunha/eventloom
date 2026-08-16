"use client";

import { ListFilter } from "lucide-react";
import { Popover } from "radix-ui";
import { Button } from "../../../components/ui/button";
import type {
  ReviewerInboxFilters,
  ReviewerInboxGroupBy,
  ReviewerInboxStatusView,
} from "../reviewer-inbox";
import type { ReviewerQueueController } from "./evaluator-queue-controller";
import styles from "./reviewer-queue.module.css";

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
  const activeFilterCount =
    (statusView === "all" ? 0 : 1) +
    Object.values(filters).filter((value) => value !== "all").length;
  const filterLabel =
    activeFilterCount > 0
      ? `Filter assigned reviews, ${activeFilterCount} active`
      : "Filter assigned reviews";
  return (
    <div className={styles.controls}>
      <Popover.Root>
        <Popover.Trigger asChild>
          <Button
            aria-label={filterLabel}
            className={styles.filterTrigger}
            size="icon-sm"
            title={filterLabel}
            type="button"
            variant="outline"
          >
            <ListFilter aria-hidden="true" />
            {activeFilterCount > 0 ? (
              <span aria-hidden="true" className={styles.filterActiveCount}>
                {activeFilterCount}
              </span>
            ) : null}
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            aria-label="Reviewer filters"
            className={styles.filterPopover}
            sideOffset={8}
          >
            <div className={styles.filterPopoverHeader}>
              <strong>Filters</strong>
              {filtersActive ? (
                <Button size="xs" type="button" variant="ghost" onClick={clearFilters}>
                  Clear
                </Button>
              ) : null}
            </div>
            <fieldset className={styles.filterMenu}>
              <legend className={styles.srOnly}>Reviewer inbox filters</legend>
              <label className={styles.filterRow}>
                <span>Status</span>
                <select
                  aria-label="Status"
                  value={statusView}
                  onChange={(event) => setStatusView(event.target.value as ReviewerInboxStatusView)}
                >
                  <option value="all">All · {statusCounts.all}</option>
                  <option value="needs-review">Needs review · {statusCounts.needsReview}</option>
                  <option value="in-progress">In progress · {statusCounts.inProgress}</option>
                  <option value="submitted">Submitted · {statusCounts.submitted}</option>
                </select>
              </label>
              <label className={styles.filterRow}>
                <span>Organization</span>
                <select
                  aria-label="Organization"
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
                  <option value="all">All</option>
                  {organizationOptions.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.filterRow}>
                <span>Event</span>
                <select
                  aria-label="Event"
                  value={filters.eventId}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      eventId: event.target.value,
                      roundKey: "all",
                    }))
                  }
                >
                  <option value="all">All</option>
                  {eventOptions.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.filterRow}>
                <span>Round</span>
                <select
                  aria-label="Round"
                  value={filters.roundKey}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      roundKey: event.target.value,
                    }))
                  }
                >
                  <option value="all">All</option>
                  {roundOptions.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.filterRow}>
                <span>Due</span>
                <select
                  aria-label="Due"
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
              <label className={styles.filterRow}>
                <span>Track</span>
                <select
                  aria-label="Track"
                  value={filters.track}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      track: event.target.value,
                    }))
                  }
                >
                  <option value="all">All</option>
                  <option value="none">No track</option>
                  {trackOptions.map((track) => (
                    <option key={track} value={track}>
                      {track}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.filterRow}>
                <span>Group by</span>
                <select
                  aria-label="Group by"
                  value={groupBy}
                  onChange={(event) => setGroupBy(event.target.value as ReviewerInboxGroupBy)}
                >
                  <option value="none">None</option>
                  <option value="event">Event</option>
                  <option value="organization">Organization</option>
                  <option value="round">Round</option>
                  <option value="due">Due date</option>
                </select>
              </label>
            </fieldset>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
