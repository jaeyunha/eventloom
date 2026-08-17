"use client";

import type { TimeDisambiguation } from "@eventloom/contracts";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, X } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TemporalDisambiguation } from "@/components/ui/temporal-disambiguation";
import {
  isTemporalDateDisabled,
  rangeBoundaryTimeBounds,
  type TemporalConstraints,
  temporalTimeBounds,
} from "@/components/ui/temporal-picker-model";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { EventDateMode, EventDateSelectionValue } from "./event-date-picker";
import styles from "./event-date-picker.module.css";
import {
  datePart,
  eventDatesBetween,
  localDateKey,
  parseDateOnly,
  sortedUniqueDates,
  toggleEventDate,
} from "./event-date-picker-model";

interface EventDatePickerFieldsProps extends EventDateSelectionValue {
  readonly id: string;
  readonly selectionMode: "single" | "range";
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
  readonly dateOnly: boolean;
  readonly showModeToggle: boolean;
  readonly showTimeControls: boolean;
  readonly layout: "split" | "stacked";
  readonly clearable: boolean;
  readonly disabled: boolean;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly headerAside?: ReactNode;
  readonly startLabel: string;
  readonly endLabel: string;
  readonly startTimeLabel: string;
  readonly endTimeLabel: string;
  readonly defaultStartTime: string;
  readonly defaultEndTime: string;
  readonly timeHint: string;
  readonly onChange: (value: EventDateSelectionValue) => void;
}

interface MonthCell {
  readonly date: Date;
  readonly dateKey: string;
  readonly isCurrentMonth: boolean;
}

const weekDays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;
const EMPTY_SELECTED_DATES: readonly string[] = [];
const CONCISE_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const CONCISE_DATE_WITH_YEAR_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const LONG_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function canonicalCalendarDate(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12));
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
  return (
    date.getFullYear() === new Date().getFullYear()
      ? CONCISE_DATE_FORMATTER
      : CONCISE_DATE_WITH_YEAR_FORMATTER
  ).format(canonicalCalendarDate(date));
}

function longDate(value: string): string {
  const date = parseDateOnly(value);
  if (date === null) return value;
  return LONG_DATE_FORMATTER.format(canonicalCalendarDate(date));
}

function nextModeSelection({
  nextMode,
  startsAt,
  endsAt,
  scheduleDates,
  startDate,
  endDate,
  dateOnly,
  defaultStartTime,
  defaultEndTime,
}: {
  readonly nextMode: EventDateMode;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly scheduleDates: readonly string[];
  readonly startDate: string;
  readonly endDate: string;
  readonly dateOnly: boolean;
  readonly defaultStartTime: string;
  readonly defaultEndTime: string;
}): EventDateSelectionValue {
  if (nextMode === "individual") {
    return {
      mode: nextMode,
      startsAt,
      endsAt,
      scheduleDates: eventDatesBetween(startsAt, endsAt),
    };
  }
  const normalizedDates = sortedUniqueDates(scheduleDates);
  const firstDate = normalizedDates[0] ?? startDate;
  const lastDate = normalizedDates.at(-1) ?? endDate;
  return {
    mode: nextMode,
    startsAt: selectionDateTime(firstDate, timePart(startsAt, defaultStartTime), dateOnly),
    endsAt: selectionDateTime(lastDate, timePart(endsAt, defaultEndTime), dateOnly),
    scheduleDates: [],
  };
}

function nextRangeSelection({
  activeBoundary,
  date,
  mode,
  startsAt,
  endsAt,
  startDate,
  endDate,
  dateOnly,
  defaultStartTime,
  defaultEndTime,
}: {
  readonly activeBoundary: "start" | "end";
  readonly date: string;
  readonly mode: EventDateMode;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly dateOnly: boolean;
  readonly defaultStartTime: string;
  readonly defaultEndTime: string;
}): EventDateSelectionValue {
  if (activeBoundary === "start") {
    const nextEndDate = endDate && date <= endDate ? endDate : date;
    return {
      mode,
      startsAt: selectionDateTime(date, timePart(startsAt, defaultStartTime), dateOnly),
      endsAt: selectionDateTime(nextEndDate, timePart(endsAt, defaultEndTime), dateOnly),
      scheduleDates: [],
    };
  }
  const nextStartDate = startDate && date >= startDate ? startDate : date;
  return {
    mode,
    startsAt: selectionDateTime(nextStartDate, timePart(startsAt, defaultStartTime), dateOnly),
    endsAt: selectionDateTime(date, timePart(endsAt, defaultEndTime), dateOnly),
    scheduleDates: [],
  };
}

function nextIndividualSelection({
  date,
  mode,
  startsAt,
  endsAt,
  scheduleDates,
  dateOnly,
  defaultStartTime,
  defaultEndTime,
}: {
  readonly date: string;
  readonly mode: EventDateMode;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly scheduleDates: readonly string[];
  readonly dateOnly: boolean;
  readonly defaultStartTime: string;
  readonly defaultEndTime: string;
}): EventDateSelectionValue {
  const nextDates = toggleEventDate(scheduleDates, date);
  const firstDate = nextDates[0] ?? "";
  const lastDate = nextDates.at(-1) ?? "";
  return {
    mode,
    startsAt: selectionDateTime(firstDate, timePart(startsAt, defaultStartTime), dateOnly),
    endsAt: selectionDateTime(lastDate, timePart(endsAt, defaultEndTime), dateOnly),
    scheduleDates: nextDates,
  };
}

function nextTimeSelection({
  boundary,
  mode,
  startDate,
  endDate,
  time,
  startsAt,
  endsAt,
  scheduleDates,
}: {
  readonly boundary: "start" | "end";
  readonly mode: EventDateMode;
  readonly startDate: string;
  readonly endDate: string;
  readonly time: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly scheduleDates: readonly string[];
}): EventDateSelectionValue {
  return boundary === "start"
    ? { mode, startsAt: localDateTime(startDate, time), endsAt, scheduleDates }
    : { mode, startsAt, endsAt: localDateTime(endDate, time), scheduleDates };
}

function renderDatePickerSummary({
  mode,
  selectedDates,
  startDate,
  endDate,
  startLabel,
  endLabel,
  activeBoundary,
  isSingleSelection,
  disabled,
  onBoundaryChange,
}: {
  readonly mode: EventDateMode;
  readonly selectedDates: readonly string[];
  readonly startDate: string;
  readonly endDate: string;
  readonly startLabel: string;
  readonly endLabel: string;
  readonly activeBoundary: "start" | "end";
  readonly isSingleSelection: boolean;
  readonly disabled: boolean;
  readonly onBoundaryChange: (boundary: "start" | "end") => void;
}) {
  return (
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
            onClick={() => onBoundaryChange("start")}
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
                onClick={() => onBoundaryChange("end")}
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
  );
}

function renderDatePickerCalendar({
  cells,
  minimumEndDate,
  constraints,
  dateOnly,
  disabled,
  isSingleSelection,
  mode,
  activeBoundary,
  startDate,
  endDate,
  selectedDateSet,
  visibleMonth,
  onMonthChange,
  onSelectDate,
}: {
  readonly cells: readonly MonthCell[];
  readonly minimumEndDate: string;
  readonly constraints: TemporalConstraints;
  readonly dateOnly: boolean;
  readonly disabled: boolean;
  readonly isSingleSelection: boolean;
  readonly mode: EventDateMode;
  readonly activeBoundary: "start" | "end";
  readonly startDate: string;
  readonly endDate: string;
  readonly selectedDateSet: ReadonlySet<string>;
  readonly visibleMonth: Date;
  readonly onMonthChange: (delta: number) => void;
  readonly onSelectDate: (date: string) => void;
}) {
  return (
    <div className={styles.calendar}>
      <div className={styles.calendarHeader}>
        <strong>{MONTH_LABEL_FORMATTER.format(canonicalCalendarDate(visibleMonth))}</strong>
        <div className={styles.monthControls}>
          <Button
            aria-label="Previous month"
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={() => onMonthChange(-1)}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            aria-label="Next month"
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={() => onMonthChange(1)}
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
              minimumEndDate !== "" &&
              (dateOnly ? cell.dateKey <= minimumEndDate : cell.dateKey < minimumEndDate));
          const individuallySelected = selectedDateSet.has(cell.dateKey);
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
              onClick={() => onSelectDate(cell.dateKey)}
            >
              {cell.date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function renderDatePickerDetails({
  id,
  selectedDates,
  showSelectedDates,
  showTimeControls,
  startsAt,
  endsAt,
  startDate,
  endDate,
  isSingleSelection,
  disabled,
  layout,
  startLabel,
  endLabel,
  startTimeLabel,
  endTimeLabel,
  defaultStartTime,
  defaultEndTime,
  headerAside,
  timeHint,
  constraints,
  timeZone,
  startDisambiguation,
  endDisambiguation,
  onStartDisambiguationChange,
  onEndDisambiguationChange,
  onSelectDate,
  onUpdateTime,
}: {
  readonly id: string;
  readonly selectedDates: readonly string[];
  readonly showSelectedDates: boolean;
  readonly showTimeControls: boolean;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly isSingleSelection: boolean;
  readonly disabled: boolean;
  readonly layout: "split" | "stacked";
  readonly startLabel: string;
  readonly endLabel: string;
  readonly startTimeLabel: string;
  readonly endTimeLabel: string;
  readonly defaultStartTime: string;
  readonly defaultEndTime: string;
  readonly headerAside?: ReactNode;
  readonly timeHint: string;
  readonly constraints: TemporalConstraints;
  readonly timeZone?: string | undefined;
  readonly startDisambiguation?: TimeDisambiguation | undefined;
  readonly endDisambiguation?: TimeDisambiguation | undefined;
  readonly onStartDisambiguationChange?:
    | ((value: TimeDisambiguation | undefined) => void)
    | undefined;
  readonly onEndDisambiguationChange?:
    | ((value: TimeDisambiguation | undefined) => void)
    | undefined;
  readonly onSelectDate: (date: string) => void;
  readonly onUpdateTime: (boundary: "start" | "end", time: string) => void;
}) {
  return (
    <div className={`${styles.details} ${layout === "stacked" ? styles.detailsStacked : ""}`}>
      {showSelectedDates ? (
        <div className={styles.selectedDates}>
          <span className={styles.detailLabel}>Selected days</span>
          <div className={styles.dateChips}>
            {selectedDates.map((date) => (
              <button
                aria-label={`Remove ${longDate(date)}`}
                className={styles.dateChip}
                disabled={disabled}
                key={date}
                type="button"
                onClick={() => onSelectDate(date)}
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
                      : rangeBoundaryTimeBounds("start", startDate, startsAt, endsAt, constraints)
                    ).maximum
                  }
                  min={
                    (isSingleSelection
                      ? temporalTimeBounds(startDate, constraints)
                      : rangeBoundaryTimeBounds("start", startDate, startsAt, endsAt, constraints)
                    ).minimum
                  }
                  type="time"
                  value={startDate === "" ? "" : timePart(startsAt, defaultStartTime)}
                  onChange={(event) => onUpdateTime("start", event.target.value)}
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
                      rangeBoundaryTimeBounds("end", endDate, startsAt, endsAt, constraints).maximum
                    }
                    min={
                      rangeBoundaryTimeBounds("end", endDate, startsAt, endsAt, constraints).minimum
                    }
                    type="time"
                    value={endDate === "" ? "" : timePart(endsAt, defaultEndTime)}
                    onChange={(event) => onUpdateTime("end", event.target.value)}
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
          <div className={styles.scheduleFooter}>
            <p className={styles.timeHint}>{timeHint}</p>
            {headerAside}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function EventDatePickerFields({
  id,
  mode,
  startsAt,
  endsAt,
  scheduleDates,
  selectionMode,
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
  dateOnly,
  showModeToggle,
  showTimeControls,
  layout,
  clearable,
  disabled,
  headerAside,
  eyebrow,
  title,
  description,
  startLabel,
  endLabel,
  startTimeLabel,
  endTimeLabel,
  defaultStartTime,
  defaultEndTime,
  timeHint,
  onChange,
}: EventDatePickerFieldsProps) {
  const startDate = datePart(startsAt);
  const endDate = datePart(endsAt);
  const isSingleSelection = selectionMode === "single";
  const constraints: TemporalConstraints = {
    ...(minimumDateTime === undefined ? {} : { minimum: minimumDateTime }),
    ...(maximumDateTime === undefined ? {} : { maximum: maximumDateTime }),
    ...(allowedDates === undefined ? {} : { allowedDates }),
    ...(unchangedValues === undefined ? {} : { unchangedValues }),
  };
  const minimumDate = minimumDateTime?.slice(0, 10) ?? "";
  const minimumEndDateValue = minimumEndDate?.slice(0, 10) ?? "";
  const initialMonth = parseDateOnly(scheduleDates[0] || startDate || minimumDate) ?? new Date();
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1, 12),
  );
  const [activeBoundary, setActiveBoundary] = useState<"start" | "end">("start");
  const cells = useMemo(() => monthCells(visibleMonth), [visibleMonth]);
  const selectedDates = mode === "individual" ? scheduleDates : EMPTY_SELECTED_DATES;
  const selectedDateSet = useMemo(() => new Set(selectedDates), [selectedDates]);
  const showSelectedDates = mode === "individual" && selectedDates.length > 0;
  const showDetails = showTimeControls || showSelectedDates;

  function changeMode(nextMode: EventDateMode): void {
    if (nextMode === mode) return;
    resetDisambiguation();
    onChange(
      nextModeSelection({
        nextMode,
        startsAt,
        endsAt,
        scheduleDates,
        startDate,
        endDate,
        dateOnly,
        defaultStartTime,
        defaultEndTime,
      }),
    );
  }

  function resetDisambiguation(boundary?: "start" | "end"): void {
    if (boundary === undefined || boundary === "start") {
      onStartDisambiguationChange?.(undefined);
    }
    if (boundary === undefined || boundary === "end") {
      onEndDisambiguationChange?.(undefined);
    }
  }

  function selectDate(date: string): void {
    if (mode === "individual") {
      resetDisambiguation();
      onChange(
        nextIndividualSelection({
          date,
          mode,
          startsAt,
          endsAt,
          scheduleDates,
          dateOnly,
          defaultStartTime,
          defaultEndTime,
        }),
      );
      return;
    }
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
    onChange(
      nextRangeSelection({
        activeBoundary,
        date,
        mode,
        startsAt,
        endsAt,
        startDate,
        endDate,
        dateOnly,
        defaultStartTime,
        defaultEndTime,
      }),
    );
    setActiveBoundary((boundary) => (boundary === "start" ? "end" : "start"));
  }

  function updateTime(boundary: "start" | "end", time: string): void {
    resetDisambiguation(boundary);
    const nextSelection = nextTimeSelection({
      boundary,
      mode,
      startDate,
      endDate,
      time,
      startsAt,
      endsAt,
      scheduleDates,
    });
    onChange(
      isSingleSelection && boundary === "start"
        ? { ...nextSelection, endsAt: nextSelection.startsAt }
        : nextSelection,
    );
  }

  function clearSelection(): void {
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
        <div className={styles.headingCopy}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h3 id={`${id}-title`}>{title}</h3>
          <p>{description}</p>
          {clearable && (startDate !== "" || endDate !== "" || scheduleDates.length > 0) ? (
            <Button
              className={styles.clearDate}
              type="button"
              variant="ghost"
              onClick={clearSelection}
              disabled={disabled}
            >
              Clear {isSingleSelection ? "date" : "dates"}
            </Button>
          ) : null}
        </div>
        {showModeToggle ? (
          <div className={styles.headingActions}>
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
          </div>
        ) : null}
      </div>

      {renderDatePickerSummary({
        activeBoundary,
        disabled,
        endDate,
        endLabel,
        isSingleSelection,
        mode,
        selectedDates,
        startDate,
        startLabel,
        onBoundaryChange: setActiveBoundary,
      })}

      <div className={styles.pickerLayout} data-details-hidden={!showDetails} data-layout={layout}>
        {renderDatePickerCalendar({
          activeBoundary,
          cells,
          constraints,
          dateOnly,
          disabled,
          endDate,
          isSingleSelection,
          minimumEndDate: minimumEndDateValue,
          mode,
          selectedDateSet,
          startDate,
          visibleMonth,
          onMonthChange: (delta) =>
            setVisibleMonth(
              (month) => new Date(month.getFullYear(), month.getMonth() + delta, 1, 12),
            ),
          onSelectDate: selectDate,
        })}
        {showDetails
          ? renderDatePickerDetails({
              constraints,
              defaultEndTime,
              defaultStartTime,
              disabled,
              endDate,
              endLabel,
              endDisambiguation,
              id,
              isSingleSelection,
              layout,
              onEndDisambiguationChange,
              onSelectDate: selectDate,
              onStartDisambiguationChange,
              onUpdateTime: updateTime,
              selectedDates,
              showSelectedDates,
              showTimeControls,
              startDate,
              startDisambiguation,
              startLabel,
              startTimeLabel,
              startsAt,
              endTimeLabel,
              endsAt,
              timeHint,
              timeZone,
              headerAside,
            })
          : null}
      </div>
    </section>
  );
}
