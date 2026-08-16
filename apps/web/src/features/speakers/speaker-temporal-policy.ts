import { localDateInTimeZone } from "@eventloom/contracts";

export interface SpeakerEventTemporalContext {
  readonly timeZone: string;
  readonly startsAt: string;
  readonly endsAt: string;
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/u;

export function isStrictCalendarDate(value: string): boolean {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const roundTrip = new Date(0);
  roundTrip.setUTCFullYear(year ?? 0, (month ?? 0) - 1, day ?? 0);
  roundTrip.setUTCHours(0, 0, 0, 0);
  return (
    roundTrip.getUTCFullYear() === year &&
    roundTrip.getUTCMonth() + 1 === month &&
    roundTrip.getUTCDate() === day
  );
}

export function eventDateRange(event: SpeakerEventTemporalContext): Readonly<{
  startsOn: string;
  endsOn: string;
}> {
  return {
    startsOn: localDateInTimeZone(event.startsAt, event.timeZone),
    endsOn: localDateInTimeZone(event.endsAt, event.timeZone),
  };
}

export function normalizeEventDateValue(
  value: string | null | undefined,
  timeZone: string,
): string {
  const normalized = value?.trim() ?? "";
  if (normalized.length === 0 || isStrictCalendarDate(normalized)) return normalized;
  return Number.isFinite(Date.parse(normalized))
    ? localDateInTimeZone(normalized, timeZone)
    : normalized;
}

export function deadlineTemporalPolicy(
  event: SpeakerEventTemporalContext,
  now = new Date(),
  unchangedValue?: string | null,
): Readonly<{ minimumDate: string; eventEndDate: string; unchangedValues: readonly string[] }> {
  const { endsOn } = eventDateRange(event);
  return {
    minimumDate: localDateInTimeZone(now.toISOString(), event.timeZone),
    eventEndDate: endsOn,
    unchangedValues: unchangedValue ? [unchangedValue] : [],
  };
}

export function deadlineAfterEventWarning(
  value: string,
  event: SpeakerEventTemporalContext,
): string | null {
  const { endsOn } = eventDateRange(event);
  return value && value > endsOn
    ? `This deadline is after the event ends on ${endsOn}. It will still be saved.`
    : null;
}

export function travelDateWarnings(
  arrivalAt: string,
  departureAt: string,
  event: SpeakerEventTemporalContext,
): readonly string[] {
  const { startsOn, endsOn } = eventDateRange(event);
  return [
    ...(arrivalAt && arrivalAt < startsOn
      ? [`Arrival is before the event starts on ${startsOn}.`]
      : []),
    ...(arrivalAt && arrivalAt > endsOn ? [`Arrival is after the event ends on ${endsOn}.`] : []),
    ...(departureAt && departureAt < startsOn
      ? [`Departure is before the event starts on ${startsOn}.`]
      : []),
    ...(departureAt && departureAt > endsOn
      ? [`Departure is after the event ends on ${endsOn}.`]
      : []),
  ];
}
