import { ChevronLeft, ChevronRight } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import styles from "./agenda-day-selector.module.css";

const AGENDA_DAY_SELECTOR_DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export interface AgendaDayOption {
  readonly date: string;
  readonly label: string;
  readonly sessionCount: number;
}

interface AgendaDaySelectorProps {
  readonly days: readonly AgendaDayOption[];
  readonly selectedDate: string;
  readonly onSelectDate: (date: string) => void;
}

function formatCompactDate(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(value.valueOf())) return date;
  return AGENDA_DAY_SELECTOR_DATE_FORMATTER.format(value);
}

export function AgendaDaySelector({ days, selectedDate, onSelectDate }: AgendaDaySelectorProps) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const activeIndex = Math.max(
    0,
    days.findIndex((day) => day.date === selectedDate),
  );
  const activeDay = days[activeIndex];
  const previousDay = days[activeIndex - 1];
  const nextDay = days[activeIndex + 1];

  useEffect(() => {
    railRef.current
      ?.querySelector<HTMLElement>(`[data-date="${selectedDate}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedDate]);

  function selectAt(index: number) {
    const day = days[index];
    if (day === undefined) return;
    onSelectDate(day.date);
    requestAnimationFrame(() => {
      railRef.current?.querySelector<HTMLElement>(`[data-date="${day.date}"]`)?.focus();
    });
  }

  function moveSelection(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      selectAt(Math.max(0, index - 1));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      selectAt(Math.min(days.length - 1, index + 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      selectAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      selectAt(days.length - 1);
    }
  }

  return (
    <section
      className={styles.selector}
      data-agenda-day-selector="true"
      aria-label="Event day navigation"
    >
      <div className={styles.selectorHeader}>
        <span>Event day</span>
        <p aria-live="polite">
          {activeDay
            ? `${activeDay.label} · Day ${activeIndex + 1} of ${days.length} · ${activeDay.sessionCount} ${
                activeDay.sessionCount === 1 ? "session" : "sessions"
              }`
            : "No event days available"}
        </p>
      </div>
      <div className={styles.controls}>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={previousDay === undefined}
          aria-label={previousDay ? `Previous day, ${previousDay.label}` : "Previous day"}
          onClick={() => {
            if (previousDay) onSelectDate(previousDay.date);
          }}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <div
          ref={railRef}
          className={styles.rail}
          role="radiogroup"
          aria-label="Choose an event day"
        >
          {days.map((day, index) => (
            <label key={day.date} className={styles.day}>
              <input
                className={styles.dayInput}
                type="radio"
                name="agenda-day"
                value={day.date}
                checked={day.date === activeDay?.date}
                data-date={day.date}
                aria-current={day.date === activeDay?.date ? "date" : undefined}
                aria-label={`Day ${index + 1}, ${day.label}, ${day.sessionCount} ${
                  day.sessionCount === 1 ? "session" : "sessions"
                }`}
                onChange={() => onSelectDate(day.date)}
                onKeyDown={(event) => moveSelection(event, index)}
              />
              <span>Day {index + 1}</span>
              <strong>{formatCompactDate(day.date)}</strong>
              <small>
                {day.sessionCount} {day.sessionCount === 1 ? "session" : "sessions"}
              </small>
            </label>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={nextDay === undefined}
          aria-label={nextDay ? `Next day, ${nextDay.label}` : "Next day"}
          onClick={() => {
            if (nextDay) onSelectDate(nextDay.date);
          }}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}
