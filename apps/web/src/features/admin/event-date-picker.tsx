"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Clock3, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import styles from "./event-date-picker.module.css";

export type EventDateMode = "range" | "individual";

export interface EventDateSelectionValue {
  readonly mode: EventDateMode;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly scheduleDates: readonly string[];
}

interface EventDatePickerProps extends EventDateSelectionValue {
  readonly minimumDateTime?: string | undefined;
  readonly onChange: (value: EventDateSelectionValue) => void;
}

interface MonthCell {
  readonly date: Date;
  readonly dateKey: string;
  readonly isCurrentMonth: boolean;
}

const weekDays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, month, day, 12);
  return parsed.getFullYear() === year && parsed.getMonth() === month && parsed.getDate() === day
    ? parsed
    : null;
}

function monthCells(month: Date): readonly MonthCell[] {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const firstCell = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth(),
    1 - monthStart.getDay(),
    12,
  );
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(
      firstCell.getFullYear(),
      firstCell.getMonth(),
      firstCell.getDate() + index,
      12,
    );
    return {
      date,
      dateKey: localDateKey(date),
      isCurrentMonth:
        date.getFullYear() === monthStart.getFullYear() &&
        date.getMonth() === monthStart.getMonth(),
    };
  });
}

function datePart(value: string): string {
  return value.slice(0, 10);
}

function timePart(value: string, fallback: string): string {
  const valueTime = value.slice(11, 16);
  return /^\d{2}:\d{2}$/u.test(valueTime) ? valueTime : fallback;
}

function localDateTime(date: string, time: string): string {
  return date ? `${date}T${time}` : "";
}

function sortedUniqueDates(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function eventDatesBetween(startsAt: string, endsAt: string): readonly string[] {
  const start = parseDateOnly(datePart(startsAt));
  const end = parseDateOnly(datePart(endsAt));
  if (start === null || end === null || start > end) return [];
  const dates: string[] = [];
  for (
    let date = start;
    date <= end && dates.length < 366;
    date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 12)
  ) {
    dates.push(localDateKey(date));
  }
  return dates;
}

export function toggleEventDate(selectedDates: readonly string[], date: string): readonly string[] {
  return selectedDates.includes(date)
    ? selectedDates.filter((selectedDate) => selectedDate !== date)
    : sortedUniqueDates([...selectedDates, date]);
}

function conciseDate(value: string): string {
  const date = parseDateOnly(value);
  if (date === null) return "Choose date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(date);
}

function longDate(value: string): string {
  const date = parseDateOnly(value);
  if (date === null) return value;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function EventDatePicker({
  mode,
  startsAt,
  endsAt,
  scheduleDates,
  minimumDateTime,
  onChange,
}: EventDatePickerProps) {
  const startDate = datePart(startsAt);
  const endDate = datePart(endsAt);
  const minimumDate = minimumDateTime?.slice(0, 10) ?? "";
  const initialMonth = parseDateOnly(scheduleDates[0] || startDate || minimumDate) ?? new Date();
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1, 12),
  );
  const [activeBoundary, setActiveBoundary] = useState<"start" | "end">("start");
  const cells = useMemo(() => monthCells(visibleMonth), [visibleMonth]);
  const selectedDates = mode === "individual" ? scheduleDates : [];

  function changeMode(nextMode: EventDateMode) {
    if (nextMode === mode) return;
    if (nextMode === "individual") {
      onChange({
        mode: nextMode,
        startsAt,
        endsAt,
        scheduleDates: eventDatesBetween(startsAt, endsAt),
      });
      return;
    }
    const normalizedDates = sortedUniqueDates(scheduleDates);
    const firstDate = normalizedDates[0] ?? startDate;
    const lastDate = normalizedDates.at(-1) ?? endDate;
    onChange({
      mode: nextMode,
      startsAt: localDateTime(firstDate, timePart(startsAt, "09:00")),
      endsAt: localDateTime(lastDate, timePart(endsAt, "17:00")),
      scheduleDates: [],
    });
  }

  function selectRangeDate(date: string) {
    if (activeBoundary === "start") {
      const nextEndDate = endDate && date <= endDate ? endDate : date;
      onChange({
        mode,
        startsAt: localDateTime(date, timePart(startsAt, "09:00")),
        endsAt: localDateTime(nextEndDate, timePart(endsAt, "17:00")),
        scheduleDates: [],
      });
      setActiveBoundary("end");
      return;
    }
    const nextStartDate = startDate && date >= startDate ? startDate : date;
    onChange({
      mode,
      startsAt: localDateTime(nextStartDate, timePart(startsAt, "09:00")),
      endsAt: localDateTime(date, timePart(endsAt, "17:00")),
      scheduleDates: [],
    });
    setActiveBoundary("start");
  }

  function selectIndividualDate(date: string) {
    const nextDates = toggleEventDate(scheduleDates, date);
    const firstDate = nextDates[0] ?? "";
    const lastDate = nextDates.at(-1) ?? "";
    onChange({
      mode,
      startsAt: localDateTime(firstDate, timePart(startsAt, "09:00")),
      endsAt: localDateTime(lastDate, timePart(endsAt, "17:00")),
      scheduleDates: nextDates,
    });
  }

  function selectDate(date: string) {
    if (mode === "individual") {
      selectIndividualDate(date);
      return;
    }
    selectRangeDate(date);
  }

  function updateTime(boundary: "start" | "end", time: string) {
    if (boundary === "start") {
      onChange({
        mode,
        startsAt: localDateTime(startDate, time),
        endsAt,
        scheduleDates,
      });
      return;
    }
    onChange({
      mode,
      startsAt,
      endsAt: localDateTime(endDate, time),
      scheduleDates,
    });
  }

  return (
    <section className={styles.root} aria-labelledby="event-date-schedule-title">
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>Event schedule</span>
          <h3 id="event-date-schedule-title">When does this event happen?</h3>
          <p>Use a continuous span or choose only the days that belong to the event.</p>
        </div>
        <ToggleGroup
          aria-label="Event date selection mode"
          className={styles.modeToggle}
          type="single"
          value={mode}
          variant="outline"
          onValueChange={(value) => {
            if (value === "range" || value === "individual") changeMode(value);
          }}
        >
          <ToggleGroupItem type="button" value="range">
            Date range
          </ToggleGroupItem>
          <ToggleGroupItem type="button" value="individual">
            Individual days
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className={styles.summary}>
        <CalendarDays aria-hidden="true" />
        {mode === "range" ? (
          <div className={styles.rangeSummary}>
            <button
              className={styles.boundaryButton}
              data-active={activeBoundary === "start"}
              type="button"
              onClick={() => setActiveBoundary("start")}
            >
              <span>Starts</span>
              <strong>{conciseDate(startDate)}</strong>
            </button>
            <span className={styles.rangeArrow}>to</span>
            <button
              className={styles.boundaryButton}
              data-active={activeBoundary === "end"}
              type="button"
              onClick={() => setActiveBoundary("end")}
            >
              <span>Ends</span>
              <strong>{conciseDate(endDate)}</strong>
            </button>
          </div>
        ) : (
          <div className={styles.individualSummary}>
            <strong>
              {selectedDates.length === 0
                ? "Choose event days"
                : `${selectedDates.length} ${selectedDates.length === 1 ? "day" : "days"} selected`}
            </strong>
            <span>Non-consecutive dates are supported.</span>
          </div>
        )}
      </div>

      <div className={styles.pickerLayout}>
        <div className={styles.calendar}>
          <div className={styles.calendarHeader}>
            <strong>
              {new Intl.DateTimeFormat("en-US", {
                month: "long",
                year: "numeric",
              }).format(visibleMonth)}
            </strong>
            <div className={styles.monthControls}>
              <Button
                aria-label="Previous month"
                size="icon-sm"
                type="button"
                variant="ghost"
                onClick={() =>
                  setVisibleMonth(
                    (month) => new Date(month.getFullYear(), month.getMonth() - 1, 1, 12),
                  )
                }
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              <Button
                aria-label="Next month"
                size="icon-sm"
                type="button"
                variant="ghost"
                onClick={() =>
                  setVisibleMonth(
                    (month) => new Date(month.getFullYear(), month.getMonth() + 1, 1, 12),
                  )
                }
              >
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          </div>
          <div className={styles.weekDays} aria-hidden="true">
            {weekDays.map((weekDay) => (
              <span key={weekDay}>{weekDay}</span>
            ))}
          </div>
          <div className={styles.days}>
            {cells.map((cell) => {
              const disabled = minimumDate !== "" && cell.dateKey < minimumDate;
              const individuallySelected = selectedDates.includes(cell.dateKey);
              const inRange =
                mode === "range" &&
                startDate !== "" &&
                endDate !== "" &&
                cell.dateKey >= startDate &&
                cell.dateKey <= endDate;
              const boundary = cell.dateKey === startDate || cell.dateKey === endDate;
              return (
                <button
                  aria-label={longDate(cell.dateKey)}
                  aria-pressed={individuallySelected || inRange}
                  className={styles.day}
                  data-boundary={boundary}
                  data-muted={!cell.isCurrentMonth}
                  data-selected={individuallySelected}
                  data-within-range={inRange}
                  disabled={disabled}
                  key={cell.dateKey}
                  type="button"
                  onClick={() => selectDate(cell.dateKey)}
                >
                  {cell.date.getDate()}
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.details}>
          {mode === "individual" && selectedDates.length > 0 ? (
            <div className={styles.selectedDates}>
              <span className={styles.detailLabel}>Selected days</span>
              <div className={styles.dateChips}>
                {selectedDates.map((date) => (
                  <button
                    aria-label={`Remove ${longDate(date)}`}
                    className={styles.dateChip}
                    key={date}
                    type="button"
                    onClick={() => selectIndividualDate(date)}
                  >
                    {conciseDate(date)}
                    <X aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className={styles.timeGrid}>
            <label htmlFor="organizer-event-start-time">
              <span className={styles.detailLabel}>
                <Clock3 aria-hidden="true" />
                Start time
              </span>
              <Input
                aria-label="Event start time"
                disabled={startDate === ""}
                id="organizer-event-start-time"
                type="time"
                value={startDate === "" ? "" : timePart(startsAt, "09:00")}
                onChange={(event) => updateTime("start", event.target.value)}
              />
            </label>
            <label htmlFor="organizer-event-end-time">
              <span className={styles.detailLabel}>
                <Clock3 aria-hidden="true" />
                End time
              </span>
              <Input
                aria-label="Event end time"
                disabled={endDate === ""}
                id="organizer-event-end-time"
                type="time"
                value={endDate === "" ? "" : timePart(endsAt, "17:00")}
                onChange={(event) => updateTime("end", event.target.value)}
              />
            </label>
          </div>
          <p className={styles.timeHint}>
            Times use the event time zone. For individual days, these are the opening time on the
            first day and closing time on the last day.
          </p>
        </div>
      </div>
    </section>
  );
}
