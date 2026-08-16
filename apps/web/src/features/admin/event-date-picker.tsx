"use client";

import type { TimeDisambiguation } from "@eventloom/contracts";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TemporalDisambiguation } from "@/components/ui/temporal-disambiguation";
import {
  isTemporalDateDisabled,
  rangeBoundaryTimeBounds,
  temporalTimeBounds,
} from "@/components/ui/temporal-picker-model";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import styles from "./event-date-picker.module.css";
import {
  datePart,
  eventDatesBetween,
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
  readonly id?: string;
  readonly selectionMode?: "single" | "range";
  readonly minimumDateTime?: string | undefined;
  readonly maximumDateTime?: string | undefined;
  readonly minimumEndDate?: string | undefined;
  readonly allowedDates?: readonly string[] | undefined;
  readonly unchangedValues?: readonly string[] | undefined;
  readonly timeZone?: string | undefined;
  readonly startDisambiguation?: TimeDisambiguation | undefined;
  readonly endDisambiguation?: TimeDisambiguation | undefined;
  readonly onStartDisambiguationChange?:
    | ((value: TimeDisambiguation | undefined) => void)
    | undefined;
  readonly onEndDisambiguationChange?:
    | ((value: TimeDisambiguation | undefined) => void)
    | undefined;
  readonly dateOnly?: boolean;
  readonly showModeToggle?: boolean;
  readonly showTimeControls?: boolean;
  readonly layout?: "split" | "stacked";
  readonly clearable?: boolean;
  readonly disabled?: boolean;
  readonly eyebrow?: string;
  readonly title?: string;
  readonly description?: string;
  readonly startLabel?: string;
  readonly endLabel?: string;
  readonly startTimeLabel?: string;
  readonly endTimeLabel?: string;
  readonly defaultStartTime?: string;
  readonly defaultEndTime?: string;
  readonly timeHint?: string;
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
  id = "event-date-schedule",
  mode,
  startsAt,
  endsAt,
  scheduleDates,
  selectionMode = "range",
  minimumDateTime,
  maximumDateTime,
  minimumEndDate,
  allowedDates,
  unchangedValues,
  timeZone,
  startDisambiguation,
  endDisambiguation,
  onStartDisambiguationChange,
  onEndDisambiguationChange,
  dateOnly = false,
  showModeToggle = true,
  showTimeControls = true,
  layout = "split",
  clearable = false,
  disabled = false,
  eyebrow = "Event schedule",
  title = "When does this event happen?",
  description = "Use a continuous span or choose only the days that belong to the event.",
  startLabel = "Starts",
  endLabel = "Ends",
  startTimeLabel = "Start time",
  endTimeLabel = "End time",
  defaultStartTime = "09:00",
  defaultEndTime = "17:00",
  timeHint = "Times use the event time zone. For individual days, these are the opening time on the first day and closing time on the last day.",
  onChange,
}: EventDatePickerProps) {
  const isSingleSelection = selectionMode === "single";
  const startDate = datePart(startsAt);
  const endDate = datePart(endsAt);
  const minimumDate = minimumDateTime?.slice(0, 10) ?? "";
  const minimumEndDateValue = minimumEndDate?.slice(0, 10) ?? "";
  const constraints = {
    ...(minimumDateTime === undefined ? {} : { minimum: minimumDateTime }),
    ...(maximumDateTime === undefined ? {} : { maximum: maximumDateTime }),
    ...(allowedDates === undefined ? {} : { allowedDates }),
    ...(unchangedValues === undefined ? {} : { unchangedValues }),
  };

  function resetDisambiguation(boundary?: "start" | "end") {
    if (boundary === undefined || boundary === "start") {
      onStartDisambiguationChange?.(undefined);
    }
    if (boundary === undefined || boundary === "end") {
      onEndDisambiguationChange?.(undefined);
    }
  }
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
    resetDisambiguation();
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
    resetDisambiguation(isSingleSelection ? "start" : activeBoundary);
    if (isSingleSelection) {
      const nextValue = selectionDateTime(date, timePart(startsAt, defaultStartTime), dateOnly);
      onChange({
        mode,
        startsAt: nextValue,
        endsAt: nextValue,
        scheduleDates: [],
      });
      return;
    }
    if (activeBoundary === "start") {
      const nextEndDate = endDate && date <= endDate ? endDate : date;
      onChange({
        mode,
        startsAt: selectionDateTime(date, timePart(startsAt, defaultStartTime), dateOnly),
        endsAt: selectionDateTime(nextEndDate, timePart(endsAt, defaultEndTime), dateOnly),
        scheduleDates: [],
      });
      setActiveBoundary("end");
      return;
    }
    const nextStartDate = startDate && date >= startDate ? startDate : date;
    onChange({
      mode,
      startsAt: selectionDateTime(nextStartDate, timePart(startsAt, defaultStartTime), dateOnly),
      endsAt: selectionDateTime(date, timePart(endsAt, defaultEndTime), dateOnly),
      scheduleDates: [],
    });
    setActiveBoundary("start");
  }

  function selectIndividualDate(date: string) {
    resetDisambiguation();
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
    resetDisambiguation(boundary);
    if (boundary === "start") {
      const nextStart = localDateTime(startDate, time);
      onChange({
        mode,
        startsAt: nextStart,
        endsAt: isSingleSelection ? nextStart : endsAt,
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

  function clearSelection() {
    resetDisambiguation();
    onChange({
      mode,
      startsAt: "",
      endsAt: "",
      scheduleDates: [],
    });
    setActiveBoundary("start");
  }

  return (
    <section
      className={styles.root}
      aria-labelledby={`${id}-title`}
      aria-disabled={disabled || undefined}
      data-selection-mode={selectionMode}
    >
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h3 id={`${id}-title`}>{title}</h3>
          <p>{description}</p>
        </div>
        <div className={styles.headingActions}>
          {clearable && (startDate !== "" || endDate !== "" || scheduleDates.length > 0) ? (
            <Button type="button" variant="ghost" onClick={clearSelection} disabled={disabled}>
              Clear {isSingleSelection ? "date" : "dates"}
            </Button>
          ) : null}
          {showModeToggle ? (
            <ToggleGroup
              aria-label="Event date selection mode"
              className={styles.modeToggle}
              disabled={disabled}
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
      </div>

      <div className={styles.summary}>
        <CalendarDays aria-hidden="true" />
        {mode === "range" ? (
          <div className={styles.rangeSummary}>
            <button
              className={styles.boundaryButton}
              data-active={activeBoundary === "start"}
              data-boundary-control="start"
              disabled={disabled}
              type="button"
              onClick={() => setActiveBoundary("start")}
            >
              <span>{startLabel}</span>
              <strong>{conciseDate(startDate)}</strong>
            </button>
            {isSingleSelection ? null : (
              <>
                <span className={styles.rangeArrow}>to</span>
                <button
                  className={styles.boundaryButton}
                  data-active={activeBoundary === "end"}
                  data-boundary-control="end"
                  disabled={disabled}
                  type="button"
                  onClick={() => setActiveBoundary("end")}
                >
                  <span>{endLabel}</span>
                  <strong>{conciseDate(endDate)}</strong>
                </button>
              </>
            )}
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

      <div className={styles.pickerLayout} data-details-hidden={!showDetails} data-layout={layout}>
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
          <div className={styles.days} data-calendar-grid="">
            {cells.map((cell) => {
              const dateDisabled =
                disabled ||
                isTemporalDateDisabled(cell.dateKey, constraints) ||
                (mode === "range" &&
                  !isSingleSelection &&
                  activeBoundary === "end" &&
                  minimumEndDateValue !== "" &&
                  (dateOnly
                    ? cell.dateKey <= minimumEndDateValue
                    : cell.dateKey < minimumEndDateValue));
              const individuallySelected = selectedDates.includes(cell.dateKey);
              const inRange =
                mode === "range" &&
                !isSingleSelection &&
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
                  disabled={dateDisabled}
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
          <div className={`${styles.details} ${layout === "stacked" ? styles.detailsStacked : ""}`}>
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
                <div className={styles.timeGrid} data-single={isSingleSelection}>
                  <div className={styles.timeField}>
                    <label htmlFor={`${id}-time`}>
                      <span className={styles.detailLabel}>
                        <Clock3 aria-hidden="true" />
                        {startTimeLabel}
                      </span>
                      <Input
                        aria-label={startTimeLabel}
                        disabled={disabled || startDate === ""}
                        id={`${id}-time`}
                        max={
                          (isSingleSelection
                            ? temporalTimeBounds(startDate, constraints)
                            : rangeBoundaryTimeBounds(
                                "start",
                                startDate,
                                startsAt,
                                endsAt,
                                constraints,
                              )
                          ).maximum
                        }
                        min={
                          (isSingleSelection
                            ? temporalTimeBounds(startDate, constraints)
                            : rangeBoundaryTimeBounds(
                                "start",
                                startDate,
                                startsAt,
                                endsAt,
                                constraints,
                              )
                          ).minimum
                        }
                        type="time"
                        value={startDate === "" ? "" : timePart(startsAt, defaultStartTime)}
                        onChange={(event) => updateTime("start", event.target.value)}
                      />
                    </label>
                    {timeZone === undefined ? null : (
                      <TemporalDisambiguation
                        id={`${id}-start`}
                        label={startLabel}
                        localDateTime={startsAt}
                        timeZone={timeZone}
                        value={startDisambiguation}
                        disabled={disabled}
                        onChange={(value) => onStartDisambiguationChange?.(value)}
                      />
                    )}
                  </div>
                  {isSingleSelection ? null : (
                    <div className={styles.timeField}>
                      <label htmlFor={`${id}-end-time`}>
                        <span className={styles.detailLabel}>
                          <Clock3 aria-hidden="true" />
                          {endTimeLabel}
                        </span>
                        <Input
                          aria-label={endTimeLabel}
                          disabled={disabled || endDate === ""}
                          id={`${id}-end-time`}
                          max={
                            rangeBoundaryTimeBounds("end", endDate, startsAt, endsAt, constraints)
                              .maximum
                          }
                          min={
                            rangeBoundaryTimeBounds("end", endDate, startsAt, endsAt, constraints)
                              .minimum
                          }
                          type="time"
                          value={endDate === "" ? "" : timePart(endsAt, defaultEndTime)}
                          onChange={(event) => updateTime("end", event.target.value)}
                        />
                      </label>
                      {timeZone === undefined ? null : (
                        <TemporalDisambiguation
                          id={`${id}-end`}
                          label={endLabel}
                          localDateTime={endsAt}
                          timeZone={timeZone}
                          value={endDisambiguation}
                          disabled={disabled}
                          onChange={(value) => onEndDisambiguationChange?.(value)}
                        />
                      )}
                    </div>
                  )}
                </div>
                <p className={styles.timeHint}>{timeHint}</p>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
