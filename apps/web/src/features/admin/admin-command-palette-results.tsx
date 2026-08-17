import { AlertCircle, CalendarDays, CornerDownLeft, LoaderCircle, Search } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import styles from "./admin-command-palette.module.css";
import type { AdminCommandEvent, AdminCommandResult } from "./admin-command-palette-model";
import { AdminNavigationIcon } from "./admin-navigation-icon";

const ADMIN_COMMAND_EVENT_MONTH_DAY_FORMATTER = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});
const ADMIN_COMMAND_EVENT_YEAR_FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
});

export type AdminCommandEventState =
  | { readonly status: "idle" | "loading" }
  | { readonly events: readonly AdminCommandEvent[]; readonly status: "loaded" }
  | { readonly status: "error" };

function eventDates(result: Extract<AdminCommandResult, { kind: "event" }>): string {
  const start = new Date(result.startsAt);
  const end = new Date(result.endsAt);
  const monthDay = ADMIN_COMMAND_EVENT_MONTH_DAY_FORMATTER;
  const year = ADMIN_COMMAND_EVENT_YEAR_FORMATTER;
  if (start.toDateString() === end.toDateString()) {
    return `${monthDay.format(start)}, ${year.format(start)}`;
  }
  return `${monthDay.format(start)} – ${monthDay.format(end)}, ${year.format(end)}`;
}

export function AdminCommandPaletteResults({
  activeIndex,
  eventState,
  onActiveIndexChange,
  onOpenChange,
  onRetry,
  query,
  results,
}: Readonly<{
  activeIndex: number;
  eventState: AdminCommandEventState;
  onActiveIndexChange(index: number): void;
  onOpenChange(open: boolean): void;
  onRetry(): void;
  query: string;
  results: readonly AdminCommandResult[];
}>) {
  const groups = new Map<string, AdminCommandResult[]>();
  for (const result of results) {
    const group = groups.get(result.group) ?? [];
    group.push(result);
    groups.set(result.group, group);
  }

  return (
    <div className={styles.results}>
      {eventState.status === "loading" ? (
        <div className={styles.state} role="status">
          <LoaderCircle className={styles.spinner} aria-hidden="true" />
          Loading organization events…
        </div>
      ) : null}
      {eventState.status === "error" ? (
        <div className={styles.state} role="alert">
          <AlertCircle aria-hidden="true" />
          Event search is temporarily unavailable.
          <Button size="xs" type="button" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : null}
      {eventState.status === "loaded" && eventState.events.length === 0 && query.length === 0 ? (
        <div className={styles.state} role="status">
          <CalendarDays aria-hidden="true" />
          No organization events yet. Page shortcuts are still available.
        </div>
      ) : null}
      <div aria-label="Search results" id="admin-command-results" role="listbox">
        {[...groups.entries()].map(([group, groupResults]) => (
          <fieldset className={styles.group} key={group}>
            <legend className={styles.groupLabel}>{group}</legend>
            {groupResults.map((result) => {
              const index = results.indexOf(result);
              const active = index === activeIndex;
              return (
                <Link
                  aria-selected={active}
                  className={styles.result}
                  data-active={active}
                  href={result.href}
                  id={`admin-command-result-${index}`}
                  key={result.key}
                  role="option"
                  tabIndex={-1}
                  onClick={() => onOpenChange(false)}
                  onMouseEnter={() => onActiveIndexChange(index)}
                >
                  <span className={styles.resultIcon}>
                    {result.kind === "event" ? (
                      <CalendarDays aria-hidden="true" />
                    ) : (
                      <AdminNavigationIcon name={result.icon} />
                    )}
                  </span>
                  <span className={styles.resultCopy}>
                    <strong>{result.label}</strong>
                    <span className={styles.resultMeta}>
                      {result.kind === "event" ? (
                        <>
                          <span>{eventDates(result)}</span>
                          {result.current ? (
                            <span className={styles.current}>Current event</span>
                          ) : null}
                        </>
                      ) : (
                        <span>{result.group}</span>
                      )}
                    </span>
                  </span>
                  {active ? (
                    <span className={styles.enterHint}>
                      Open
                      <CornerDownLeft aria-hidden="true" />
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </fieldset>
        ))}
      </div>
      {results.length === 0 && eventState.status !== "loading" ? (
        <div className={styles.state} role="status">
          <Search aria-hidden="true" />
          No matching events or pages.
        </div>
      ) : null}
    </div>
  );
}
