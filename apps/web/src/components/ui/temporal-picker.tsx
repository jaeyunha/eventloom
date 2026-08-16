"use client";

import { EventDatePicker, type EventDateSelectionValue } from "@/features/admin/event-date-picker";

interface TemporalPickerBaseProps {
  readonly id: string;
  readonly precision: "date" | "date-time";
  readonly eyebrow?: string | undefined;
  readonly description?: string | undefined;
  readonly minimumDateTime?: string | undefined;
  readonly clearable?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly layout?: "split" | "stacked" | undefined;
}

interface SingleTemporalPickerProps extends TemporalPickerBaseProps {
  readonly mode: "single";
  readonly value: string;
  readonly label: string;
  readonly name?: string | undefined;
  readonly defaultTime?: string | undefined;
  readonly onChange: (value: string) => void;
}

interface RangeTemporalPickerProps extends TemporalPickerBaseProps {
  readonly mode: "range";
  readonly startValue: string;
  readonly endValue: string;
  readonly startLabel: string;
  readonly endLabel: string;
  readonly startName?: string | undefined;
  readonly endName?: string | undefined;
  readonly minimumEndDate?: string | undefined;
  readonly onChange: (value: Readonly<{ start: string; end: string }>) => void;
}

export type TemporalPickerProps = SingleTemporalPickerProps | RangeTemporalPickerProps;

function pickerDescription(props: TemporalPickerProps): string {
  if (props.description) return props.description;
  return props.mode === "single"
    ? "Choose the date and time without leaving this form."
    : "Choose the opening and closing dates, then set their times.";
}

export function TemporalPicker(props: TemporalPickerProps) {
  const dateOnly = props.precision === "date";
  if (props.mode === "single") {
    const updateValue = (selection: EventDateSelectionValue) => {
      props.onChange(selection.startsAt);
    };
    return (
      <div data-temporal-picker="single">
        {props.name ? <input type="hidden" name={props.name} value={props.value} /> : null}
        <EventDatePicker
          id={props.id}
          mode="range"
          selectionMode="single"
          startsAt={props.value}
          endsAt={props.value}
          scheduleDates={[]}
          minimumDateTime={props.minimumDateTime}
          dateOnly={dateOnly}
          showModeToggle={false}
          showTimeControls={!dateOnly}
          layout={props.layout ?? "stacked"}
          clearable={props.clearable ?? false}
          disabled={props.disabled ?? false}
          eyebrow={props.eyebrow ?? "Schedule"}
          title={props.label}
          description={pickerDescription(props)}
          startLabel={props.label}
          startTimeLabel="Time"
          defaultStartTime={props.defaultTime ?? "17:00"}
          timeHint="Choose the local date and time used by this workflow."
          onChange={updateValue}
        />
      </div>
    );
  }

  const updateRange = (selection: EventDateSelectionValue) => {
    props.onChange({ start: selection.startsAt, end: selection.endsAt });
  };
  return (
    <div data-temporal-picker="range">
      {props.startName ? (
        <input type="hidden" name={props.startName} value={props.startValue} />
      ) : null}
      {props.endName ? <input type="hidden" name={props.endName} value={props.endValue} /> : null}
      <EventDatePicker
        id={props.id}
        mode="range"
        selectionMode="range"
        startsAt={props.startValue}
        endsAt={props.endValue}
        scheduleDates={[]}
        minimumDateTime={props.minimumDateTime}
        minimumEndDate={props.minimumEndDate}
        dateOnly={dateOnly}
        showModeToggle={false}
        showTimeControls={!dateOnly}
        layout={props.layout ?? "split"}
        clearable={props.clearable ?? false}
        disabled={props.disabled ?? false}
        eyebrow={props.eyebrow ?? "Schedule"}
        title={`${props.startLabel} and ${props.endLabel}`}
        description={pickerDescription(props)}
        startLabel={props.startLabel}
        endLabel={props.endLabel}
        timeHint="Choose the local opening and closing times used by this workflow."
        onChange={updateRange}
      />
    </div>
  );
}
