"use client";

import { EventDatePickerFields } from "./event-date-picker-fields";

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

export function EventDatePicker({
  dateOnly = false,
  showModeToggle = true,
  showTimeControls = true,
  eyebrow = "Event schedule",
  title = "When does this event happen?",
  description = "Use a continuous span or choose only the days that belong to the event.",
  startLabel = "Starts",
  endLabel = "Ends",
  ...selection
}: EventDatePickerProps) {
  return (
    <EventDatePickerFields
      {...selection}
      dateOnly={dateOnly}
      showModeToggle={showModeToggle}
      showTimeControls={showTimeControls}
      eyebrow={eyebrow}
      title={title}
      description={description}
      startLabel={startLabel}
      endLabel={endLabel}
    />
  );
}
