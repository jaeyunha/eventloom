"use client";

import { formatInstantInTimeZone, type TimeDisambiguation } from "@eventloom/contracts";
import { EventDatePicker, type EventDateSelectionValue } from "@/features/admin/event-date-picker";
import { useEffect, useRef } from "react";
import { useZonedTemporalRange, useZonedTemporalValue } from "./zoned-temporal-value";

interface TemporalPickerBaseProps {
  readonly id: string;
  readonly precision: "date" | "date-time";
  readonly eyebrow?: string | undefined;
  readonly description?: string | undefined;
  readonly minimumDateTime?: string | undefined;
  readonly maximumDateTime?: string | undefined;
  readonly allowedDates?: readonly string[] | undefined;
  readonly unchangedValues?: readonly string[] | undefined;
  readonly timeZone?: string | undefined;
  readonly valueTimeZone?: string | undefined;
  readonly clearable?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly onValidityChange?: ((isValid: boolean) => void) | undefined;
  readonly layout?: "split" | "stacked" | undefined;
}

interface SingleTemporalPickerProps extends TemporalPickerBaseProps {
  readonly mode: "single";
  readonly value: string;
  readonly label: string;
  readonly name?: string | undefined;
  readonly defaultTime?: string | undefined;
  readonly disambiguation?: TimeDisambiguation | undefined;
  readonly onDisambiguationChange?: ((value: TimeDisambiguation | undefined) => void) | undefined;
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
  readonly startDisambiguation?: TimeDisambiguation | undefined;
  readonly endDisambiguation?: TimeDisambiguation | undefined;
  readonly onStartDisambiguationChange?:
    | ((value: TimeDisambiguation | undefined) => void)
    | undefined;
  readonly onEndDisambiguationChange?:
    | ((value: TimeDisambiguation | undefined) => void)
    | undefined;
  readonly onChange: (value: Readonly<{ start: string; end: string }>) => void;
}

export type TemporalPickerProps = SingleTemporalPickerProps | RangeTemporalPickerProps;

function pickerDescription(props: TemporalPickerProps): string {
  if (props.description) return props.description;
  return props.mode === "single"
    ? "Choose the date and time without leaving this form."
    : "Choose the opening and closing dates, then set their times.";
}
function localDateTimeFromInstant(value: string, timeZone: string): string {
  return value === "" ? "" : formatInstantInTimeZone(value, timeZone).slice(0, 16);
}

export function TemporalPicker(props: TemporalPickerProps) {
  if (props.valueTimeZone !== undefined) {
    return props.mode === "single" ? (
      <ZonedSingleTemporalPicker {...props} valueTimeZone={props.valueTimeZone} />
    ) : (
      <ZonedRangeTemporalPicker {...props} valueTimeZone={props.valueTimeZone} />
    );
  }
  return <LocalTemporalPicker {...props} />;
}

function LocalTemporalPicker(props: TemporalPickerProps) {
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
          maximumDateTime={props.maximumDateTime}
          allowedDates={props.allowedDates}
          unchangedValues={props.unchangedValues}
          timeZone={props.timeZone}
          startDisambiguation={props.disambiguation}
          onStartDisambiguationChange={props.onDisambiguationChange}
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
        maximumDateTime={props.maximumDateTime}
        minimumEndDate={props.minimumEndDate}
        allowedDates={props.allowedDates}
        unchangedValues={props.unchangedValues}
        timeZone={props.timeZone}
        startDisambiguation={props.startDisambiguation}
        endDisambiguation={props.endDisambiguation}
        onStartDisambiguationChange={props.onStartDisambiguationChange}
        onEndDisambiguationChange={props.onEndDisambiguationChange}
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

function ZonedSingleTemporalPicker(
  props: SingleTemporalPickerProps & Readonly<{ valueTimeZone: string }>,
) {
  const zoned = useZonedTemporalValue({
    value: props.value,
    valueTimeZone: props.valueTimeZone,
    onChange: props.onChange,
    onValidityChange: props.onValidityChange,
  });
  const previousExternalValue = useRef({
    value: props.value,
    valueTimeZone: props.valueTimeZone,
  });
  const externalValueChanged =
    previousExternalValue.current.value !== props.value ||
    previousExternalValue.current.valueTimeZone !== props.valueTimeZone;
  const localValue = externalValueChanged
    ? localDateTimeFromInstant(props.value, props.valueTimeZone)
    : zoned.localValue;
  useEffect(() => {
    previousExternalValue.current = {
      value: props.value,
      valueTimeZone: props.valueTimeZone,
    };
  }, [props.value, props.valueTimeZone]);
  return (
    <LocalTemporalPicker
      {...props}
      value={localValue}
      timeZone={props.valueTimeZone}
      disambiguation={zoned.disambiguation}
      onChange={zoned.updateDraft}
      onDisambiguationChange={zoned.updateDisambiguation}
      valueTimeZone={undefined}
    />
  );
}

function ZonedRangeTemporalPicker(
  props: RangeTemporalPickerProps & Readonly<{ valueTimeZone: string }>,
) {
  const zoned = useZonedTemporalRange({
    startValue: props.startValue,
    endValue: props.endValue,
    valueTimeZone: props.valueTimeZone,
    onChange: props.onChange,
    onValidityChange: props.onValidityChange,
  });
  const previousExternalValues = useRef({
    startValue: props.startValue,
    endValue: props.endValue,
    valueTimeZone: props.valueTimeZone,
  });
  const externalValuesChanged =
    previousExternalValues.current.startValue !== props.startValue ||
    previousExternalValues.current.endValue !== props.endValue ||
    previousExternalValues.current.valueTimeZone !== props.valueTimeZone;
  const localValues = externalValuesChanged
    ? {
        start: localDateTimeFromInstant(props.startValue, props.valueTimeZone),
        end: localDateTimeFromInstant(props.endValue, props.valueTimeZone),
      }
    : { start: zoned.startLocal, end: zoned.endLocal };
  useEffect(() => {
    previousExternalValues.current = {
      startValue: props.startValue,
      endValue: props.endValue,
      valueTimeZone: props.valueTimeZone,
    };
  }, [props.startValue, props.endValue, props.valueTimeZone]);
  return (
    <LocalTemporalPicker
      {...props}
      startValue={localValues.start}
      endValue={localValues.end}
      timeZone={props.valueTimeZone}
      startDisambiguation={zoned.startDisambiguation}
      endDisambiguation={zoned.endDisambiguation}
      onChange={zoned.updateRange}
      onStartDisambiguationChange={zoned.updateStartDisambiguation}
      onEndDisambiguationChange={zoned.updateEndDisambiguation}
      valueTimeZone={undefined}
    />
  );
}
