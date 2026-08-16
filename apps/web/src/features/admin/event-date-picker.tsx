"use client";

import type { TimeDisambiguation } from "@eventloom/contracts";
import { EventDatePickerFields } from "./event-date-picker-fields";

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
  return (
    <EventDatePickerFields
      id={id}
      mode={mode}
      startsAt={startsAt}
      endsAt={endsAt}
      scheduleDates={scheduleDates}
      selectionMode={selectionMode}
      minimumDateTime={minimumDateTime}
      maximumDateTime={maximumDateTime}
      minimumEndDate={minimumEndDate}
      allowedDates={allowedDates}
      unchangedValues={unchangedValues}
      timeZone={timeZone}
      startDisambiguation={startDisambiguation}
      endDisambiguation={endDisambiguation}
      onStartDisambiguationChange={onStartDisambiguationChange}
      onEndDisambiguationChange={onEndDisambiguationChange}
      dateOnly={dateOnly}
      showModeToggle={showModeToggle}
      showTimeControls={showTimeControls}
      layout={layout}
      clearable={clearable}
      disabled={disabled}
      eyebrow={eyebrow}
      title={title}
      description={description}
      startLabel={startLabel}
      endLabel={endLabel}
      startTimeLabel={startTimeLabel}
      endTimeLabel={endTimeLabel}
      defaultStartTime={defaultStartTime}
      defaultEndTime={defaultEndTime}
      timeHint={timeHint}
      onChange={onChange}
    />
  );
}
