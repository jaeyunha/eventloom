"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Clock3, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import styles from "./event-date-picker.module.css";
import {
  datePart,
  eventDatesBetween,
  isEventDateDisabled,
  localDateKey,
  parseDateOnly,
  sortedUniqueDates,
  toggleEventDate,
} from "./event-date-picker-model";

export type EventDateMode = "range" | "individual";

export interface EventDateSelectionValue {
  readonly mode: EventDateMode;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly scheduleDates: readonly string[];
}

export interface EventDatePickerProps extends EventDateSelectionValue {
  readonly minimumDateTime?: string | undefined;
  readonly minimumEndDate?: string | undefined;
  readonly dateOnly?: boolean;
  readonly showModeToggle?: boolean;
  readonly showTimeControls?: boolean;
  readonly eyebrow?: string;
  readonly title?: string;
  readonly description?: string;
  readonly startLabel?: string;
  readonly endLabel?: string;
  readonly onChange: (value: EventDateSelectionValue) => void;
}

interface MonthCell {
  readonly date: Date;
  readonly dateKey: string;
  readonly isCurrentMonth: boolean;
}

const weekDays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

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

function timePart(value: string, fallback: string): string {
  const valueTime = value.slice(11, 16);
  return /^\d{2}:\d{2}$/u.test(valueTime) ? valueTime : fallback;
}

function localDateTime(date: string, time: string): string {
  return date ? `${date}T${time}` : "";
}
function selectionDateTime(date: string, time: string, dateOnly: boolean): string {
  return dateOnly ? date : localDateTime(date, time);
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
  minimumEndDate,
  dateOnly = false,
  showModeToggle = true,
  showTimeControls = true,
  eyebrow = "Event schedule",
  title = "When does this event happen?",
  description = "Use a continuous span or choose only the days that belong to the event.",
  startLabel = "Starts",
  endLabel = "Ends",
  onChange,
}: EventDatePickerProps) {
  const startDate = datePart(startsAt);
  const endDate = datePart(endsAt);
  const minimumDate = minimumDateTime?.slice(0, 10) ?? "";
  const minimumEndDateValue = minimumEndDate?.slice(0, 10) ?? "";
  const initialMonth = parseDateOnly(scheduleDates[0] || startDate || minimumDate) ?? new Date();
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1, 12),
  );
  const [activeBoundary, setActiveBoundary] = useState<"start" | "end">("start");
  const cells = useMemo(() => monthCells(visibleMonth), [visibleMonth]);
  const selectedDates = mode === "individual" ? scheduleDates : [];
  const showSelectedDates = mode === "individual" && selectedDates.length > 0;
  const showDetails = showTimeControls || showSelectedDates;

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
      startsAt: selectionDateTime(firstDate, timePart(startsAt, "09:00"), dateOnly),
      endsAt: selectionDateTime(lastDate, timePart(endsAt, "17:00"), dateOnly),
      scheduleDates: [],
    });
  }

  function selectRangeDate(date: string) {
    if (activeBoundary === "start") {
      const nextEndDate = endDate && date <= endDate ? endDate : date;
      onChange({
        mode,
        startsAt: selectionDateTime(date, timePart(startsAt, "09:00"), dateOnly),
        endsAt: selectionDateTime(nextEndDate, timePart(endsAt, "17:00"), dateOnly),
        scheduleDates: [],
      });
      setActiveBoundary("end");
      return;
    }
    const nextStartDate = startDate && date >= startDate ? startDate : date;
    onChange({
      mode,
      startsAt: selectionDateTime(nextStartDate, timePart(startsAt, "09:00"), dateOnly),
      endsAt: selectionDateTime(date, timePart(endsAt, "17:00"), dateOnly),
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
      startsAt: selectionDateTime(firstDate, timePart(startsAt, "09:00"), dateOnly),
      endsAt: selectionDateTime(lastDate, timePart(endsAt, "17:00"), dateOnly),
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
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h3 id="event-date-schedule-title">{title}</h3>
          <p>{description}</p>
        </div>
        {showModeToggle ? (
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
        ) : null}
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
              <span>{startLabel}</span>
              <strong>{conciseDate(startDate)}</strong>
            </button>
            <span className={styles.rangeArrow}>to</span>
            <button
              className={styles.boundaryButton}
              data-active={activeBoundary === "end"}
              type="button"
              onClick={() => setActiveBoundary("end")}
            >
              <span>{endLabel}</span>
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

      <div className={styles.pickerLayout} data-details-hidden={!showDetails}>
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
              const disabled = isEventDateDisabled(
                cell.dateKey,
                minimumDate,
                mode === "range" ? minimumEndDateValue : "",
                activeBoundary,
              );
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

        {showDetails ? (
          <div className={styles.details}>
            {showSelectedDates ? (
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
            {showTimeControls ? (
              <>
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
                  Times use the event time zone. For individual days, these are the opening time on
                  the first day and closing time on the last day.
                </p>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
