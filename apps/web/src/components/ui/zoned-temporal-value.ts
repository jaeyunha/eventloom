"use client";

import {
  analyzeLocalDateTime,
  disambiguationForInstant,
  formatInstantInTimeZone,
  resolveLocalDateTime,
  type TimeDisambiguation,
} from "@eventloom/contracts";
import { useEffect, useRef, useState } from "react";

interface ZonedTemporalValueOptions {
  readonly value: string;
  readonly valueTimeZone?: string | undefined;
  readonly onChange: (value: string) => void;
  readonly onValidityChange?: ((isValid: boolean) => void) | undefined;
}

interface ZonedTemporalRangeOptions {
  readonly startValue: string;
  readonly endValue: string;
  readonly valueTimeZone: string;
  readonly onChange: (value: Readonly<{ start: string; end: string }>) => void;
  readonly onValidityChange?: ((isValid: boolean) => void) | undefined;
}

export function useZonedTemporalValue({
  value,
  valueTimeZone,
  onChange,
  onValidityChange,
}: ZonedTemporalValueOptions) {
  const externalLocalValue = localValue(value, valueTimeZone);
  const onValidityChangeRef = useRef(onValidityChange);
  useEffect(() => {
    onValidityChangeRef.current = onValidityChange;
  }, [onValidityChange]);
  const [draft, setDraft] = useState(externalLocalValue);
  const [disambiguation, setDisambiguation] = useState<TimeDisambiguation | undefined>(() =>
    initialDisambiguation(value, externalLocalValue, valueTimeZone),
  );

  useEffect(() => {
    const nextLocalValue = localValue(value, valueTimeZone);
    setDraft(nextLocalValue);
    setDisambiguation(initialDisambiguation(value, nextLocalValue, valueTimeZone));
    onValidityChangeRef.current?.(true);
  }, [value, valueTimeZone]);

  function updateDraft(nextValue: string) {
    setDraft(nextValue);
    setDisambiguation(undefined);
    if (valueTimeZone === undefined || nextValue === "") {
      onValidityChange?.(true);
      onChange(nextValue);
      return;
    }
    const analysis = analyzeLocalDateTime(nextValue, valueTimeZone);
    const isResolved = analysis.state === "resolved";
    onValidityChange?.(isResolved);
    if (isResolved) onChange(analysis.value.instant);
  }

  function updateDisambiguation(nextValue: TimeDisambiguation | undefined) {
    setDisambiguation(nextValue);
    if (valueTimeZone === undefined || draft === "") {
      onValidityChange?.(true);
      return;
    }
    const resolution = resolvedInstant(draft, valueTimeZone, nextValue);
    onValidityChange?.(resolution !== undefined);
    if (resolution !== undefined) onChange(resolution);
  }

  return {
    localValue: draft,
    disambiguation,
    updateDraft,
    updateDisambiguation,
  } as const;
}

export function useZonedTemporalRange({
  startValue,
  endValue,
  valueTimeZone,
  onChange,
  onValidityChange,
}: ZonedTemporalRangeOptions) {
  const onValidityChangeRef = useRef(onValidityChange);
  useEffect(() => {
    onValidityChangeRef.current = onValidityChange;
  }, [onValidityChange]);
  const initialStart = localValue(startValue, valueTimeZone);
  const initialEnd = localValue(endValue, valueTimeZone);
  const [startLocal, setStartLocal] = useState(initialStart);
  const [endLocal, setEndLocal] = useState(initialEnd);
  const [startDisambiguation, setStartDisambiguation] = useState<TimeDisambiguation | undefined>(
    () => initialDisambiguation(startValue, initialStart, valueTimeZone),
  );
  const [endDisambiguation, setEndDisambiguation] = useState<TimeDisambiguation | undefined>(() =>
    initialDisambiguation(endValue, initialEnd, valueTimeZone),
  );

  useEffect(() => {
    const nextStart = localValue(startValue, valueTimeZone);
    const nextEnd = localValue(endValue, valueTimeZone);
    setStartLocal(nextStart);
    setEndLocal(nextEnd);
    setStartDisambiguation(initialDisambiguation(startValue, nextStart, valueTimeZone));
    setEndDisambiguation(initialDisambiguation(endValue, nextEnd, valueTimeZone));
    onValidityChangeRef.current?.(true);
  }, [startValue, endValue, valueTimeZone]);

  function updateRange(next: Readonly<{ start: string; end: string }>) {
    setStartLocal(next.start);
    setEndLocal(next.end);
    setStartDisambiguation(undefined);
    setEndDisambiguation(undefined);
    emitRange(next.start, next.end, undefined, undefined);
  }

  function updateStartDisambiguation(value: TimeDisambiguation | undefined) {
    setStartDisambiguation(value);
    emitRange(startLocal, endLocal, value, endDisambiguation);
  }

  function updateEndDisambiguation(value: TimeDisambiguation | undefined) {
    setEndDisambiguation(value);
    emitRange(startLocal, endLocal, startDisambiguation, value);
  }

  function emitRange(
    nextStart: string,
    nextEnd: string,
    nextStartDisambiguation: TimeDisambiguation | undefined,
    nextEndDisambiguation: TimeDisambiguation | undefined,
  ) {
    const startInstant = resolvedInstant(nextStart, valueTimeZone, nextStartDisambiguation);
    const endInstant = resolvedInstant(nextEnd, valueTimeZone, nextEndDisambiguation);
    const isValid = startInstant !== undefined && endInstant !== undefined;
    onValidityChange?.(isValid);
    if (isValid) onChange({ start: startInstant, end: endInstant });
  }

  return {
    startLocal,
    endLocal,
    startDisambiguation,
    endDisambiguation,
    updateRange,
    updateStartDisambiguation,
    updateEndDisambiguation,
  } as const;
}

function localValue(value: string, timeZone: string | undefined): string {
  if (timeZone === undefined || value === "") return value;
  return formatInstantInTimeZone(value, timeZone).slice(0, 16);
}

function initialDisambiguation(
  instant: string,
  local: string,
  timeZone: string | undefined,
): TimeDisambiguation | undefined {
  if (timeZone === undefined || instant === "" || local === "") return undefined;
  return disambiguationForInstant(local, timeZone, instant);
}

function resolvedInstant(
  local: string,
  timeZone: string,
  disambiguation: TimeDisambiguation | undefined,
): string | undefined {
  if (local === "") return "";
  const analysis = analyzeLocalDateTime(local, timeZone);
  if (analysis.state === "resolved") return analysis.value.instant;
  if (analysis.state === "ambiguous" && disambiguation !== undefined) {
    return resolveLocalDateTime(local, timeZone, disambiguation).instant;
  }
  return undefined;
}
