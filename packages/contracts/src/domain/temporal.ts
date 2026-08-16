export type TimeDisambiguation = "earlier" | "later";

const localDateTimePattern =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2})(?::(?<second>\d{2}))?$/u;
const calendarDatePattern = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u;

interface DateTimeParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

export interface ResolvedZonedDateTime {
  readonly instant: string;
  readonly localDateTime: string;
  readonly timeZone: string;
  readonly offsetMinutes: number;
}

export type LocalDateTimeAnalysis =
  | { readonly state: "resolved"; readonly value: ResolvedZonedDateTime }
  | {
      readonly state: "ambiguous";
      readonly earlier: ResolvedZonedDateTime;
      readonly later: ResolvedZonedDateTime;
    }
  | { readonly state: "nonexistent"; readonly message: string }
  | {
      readonly state: "invalid";
      readonly code: "INVALID_LOCAL_DATE_TIME" | "INVALID_TIME_ZONE";
      readonly message: string;
    };

export class ZonedDateTimeError extends Error {
  constructor(
    readonly code:
      | "AMBIGUOUS_LOCAL_TIME"
      | "INVALID_LOCAL_DATE_TIME"
      | "INVALID_TIME_ZONE"
      | "NONEXISTENT_LOCAL_TIME",
    message: string,
  ) {
    super(message);
    this.name = "ZonedDateTimeError";
  }
}

export function canonicalizeTimeZone(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone;
  } catch {
    throw new ZonedDateTimeError("INVALID_TIME_ZONE", `Unknown IANA time zone: ${timeZone}`);
  }
}

export function analyzeLocalDateTime(
  localDateTime: string,
  requestedTimeZone: string,
): LocalDateTimeAnalysis {
  let parts: DateTimeParts;
  let timeZone: string;
  try {
    parts = parseLocalDateTime(localDateTime);
    timeZone = canonicalizeTimeZone(requestedTimeZone);
  } catch (error) {
    if (error instanceof ZonedDateTimeError) {
      return {
        state: "invalid",
        code: error.code === "INVALID_TIME_ZONE" ? error.code : "INVALID_LOCAL_DATE_TIME",
        message: error.message,
      };
    }
    throw error;
  }

  const candidates = candidateInstants(parts, timeZone);
  if (candidates.length === 0) {
    return {
      state: "nonexistent",
      message: `${localDateTime} does not exist in ${timeZone} because of a time-zone transition`,
    };
  }

  const resolved = candidates.map((candidate) => resolvedValue(candidate, parts, timeZone));
  const first = resolved[0];
  if (first === undefined) {
    return { state: "invalid", code: "INVALID_LOCAL_DATE_TIME", message: localDateTime };
  }
  const second = resolved[1];
  return second === undefined
    ? { state: "resolved", value: first }
    : { state: "ambiguous", earlier: first, later: second };
}

export function resolveLocalDateTime(
  localDateTime: string,
  requestedTimeZone: string,
  disambiguation?: TimeDisambiguation,
): ResolvedZonedDateTime {
  const analysis = analyzeLocalDateTime(localDateTime, requestedTimeZone);
  if (analysis.state === "resolved") return analysis.value;
  if (analysis.state === "ambiguous") {
    if (disambiguation === undefined) {
      throw new ZonedDateTimeError(
        "AMBIGUOUS_LOCAL_TIME",
        `${localDateTime} occurs twice in ${requestedTimeZone}; choose earlier or later`,
      );
    }
    return disambiguation === "later" ? analysis.later : analysis.earlier;
  }
  if (analysis.state === "nonexistent") {
    throw new ZonedDateTimeError("NONEXISTENT_LOCAL_TIME", analysis.message);
  }
  throw new ZonedDateTimeError(analysis.code, analysis.message);
}

export function formatInstantInTimeZone(instant: string, requestedTimeZone: string): string {
  const epoch = Date.parse(instant);
  if (!Number.isFinite(epoch)) {
    throw new ZonedDateTimeError("INVALID_LOCAL_DATE_TIME", `Invalid instant: ${instant}`);
  }
  const timeZone = canonicalizeTimeZone(requestedTimeZone);
  return formatLocalDateTime(readParts(epoch, createFormatter(timeZone)));
}

export function disambiguationForInstant(
  localDateTime: string,
  requestedTimeZone: string,
  instant: string,
): TimeDisambiguation | undefined {
  const analysis = analyzeLocalDateTime(localDateTime, requestedTimeZone);
  if (analysis.state !== "ambiguous") return undefined;
  const normalized = new Date(instant).toISOString();
  if (analysis.earlier.instant === normalized) return "earlier";
  if (analysis.later.instant === normalized) return "later";
  return undefined;
}

export function localDateInTimeZone(instant: string, requestedTimeZone: string): string {
  return formatInstantInTimeZone(instant, requestedTimeZone).slice(0, 10);
}

/**
 * Resolves a date-only deadline using Eventloom's inclusive event-local end-of-day policy.
 * The returned value is the earliest real instant whose local calendar date is later than the
 * deadline, so gaps at midnight and skipped dates preserve the authoritative event-zone boundary.
 */
export function calendarDateDeadline(
  calendarDate: string,
  requestedTimeZone: string,
): Readonly<{ instant: string; epochMilliseconds: number }> {
  const parts = parseCalendarDate(calendarDate);
  const timeZone = canonicalizeTimeZone(requestedTimeZone);
  const formatter = createFormatter(timeZone);
  const referenceEpoch = toUtcEpoch(parts);
  const searchStep = 60 * 60 * 1000;
  let previousEpoch = referenceEpoch - 3 * 24 * searchStep;
  const searchEnd = referenceEpoch + 7 * 24 * searchStep;

  if (calendarDateComparison(readParts(previousEpoch, formatter), parts) > 0) {
    throw new ZonedDateTimeError(
      "INVALID_LOCAL_DATE_TIME",
      `Could not resolve the end of ${calendarDate} in ${timeZone}`,
    );
  }

  for (let epoch = previousEpoch + searchStep; epoch <= searchEnd; epoch += searchStep) {
    if (calendarDateComparison(readParts(epoch, formatter), parts) <= 0) {
      previousEpoch = epoch;
      continue;
    }

    let lower = previousEpoch;
    let upper = epoch;
    while (upper - lower > 1) {
      const middle = lower + Math.floor((upper - lower) / 2);
      if (calendarDateComparison(readParts(middle, formatter), parts) > 0) upper = middle;
      else lower = middle;
    }
    return { instant: new Date(upper).toISOString(), epochMilliseconds: upper };
  }

  throw new ZonedDateTimeError(
    "INVALID_LOCAL_DATE_TIME",
    `Could not resolve the end of ${calendarDate} in ${timeZone}`,
  );
}

function candidateInstants(parts: DateTimeParts, timeZone: string): readonly number[] {
  const localEpoch = toUtcEpoch(parts);
  const formatter = createFormatter(timeZone);
  const candidateOffsets = new Set<number>();
  for (let hourDelta = -36; hourDelta <= 36; hourDelta += 6) {
    candidateOffsets.add(offsetAt(localEpoch + hourDelta * 60 * 60 * 1000, formatter));
  }
  return [...candidateOffsets]
    .map((offset) => localEpoch - offset)
    .filter((candidate) => partsEqual(readParts(candidate, formatter), parts))
    .sort((left, right) => left - right);
}

function resolvedValue(
  candidate: number,
  parts: DateTimeParts,
  timeZone: string,
): ResolvedZonedDateTime {
  return {
    instant: new Date(candidate).toISOString(),
    localDateTime: formatLocalDateTime(parts),
    timeZone,
    offsetMinutes: (toUtcEpoch(parts) - candidate) / (60 * 1000),
  };
}

function parseCalendarDate(value: string): DateTimeParts {
  const groups = calendarDatePattern.exec(value)?.groups;
  if (groups === undefined) {
    throw new ZonedDateTimeError(
      "INVALID_LOCAL_DATE_TIME",
      `Expected an ISO calendar date, received: ${value}`,
    );
  }
  const parts: DateTimeParts = {
    year: Number(groups.year),
    month: Number(groups.month),
    day: Number(groups.day),
    hour: 0,
    minute: 0,
    second: 0,
  };
  assertValidParts(parts, `Invalid calendar date: ${value}`);
  return parts;
}

function parseLocalDateTime(value: string): DateTimeParts {
  const groups = localDateTimePattern.exec(value)?.groups;
  if (groups === undefined) {
    throw new ZonedDateTimeError(
      "INVALID_LOCAL_DATE_TIME",
      `Expected an ISO local date-time without an offset, received: ${value}`,
    );
  }
  const parts: DateTimeParts = {
    year: Number(groups.year),
    month: Number(groups.month),
    day: Number(groups.day),
    hour: Number(groups.hour),
    minute: Number(groups.minute),
    second: Number(groups.second ?? "0"),
  };
  assertValidParts(parts, `Invalid local date-time: ${value}`);
  return parts;
}

function assertValidParts(parts: DateTimeParts, message: string): void {
  const roundTrip = new Date(toUtcEpoch(parts));
  if (
    roundTrip.getUTCFullYear() !== parts.year ||
    roundTrip.getUTCMonth() + 1 !== parts.month ||
    roundTrip.getUTCDate() !== parts.day ||
    roundTrip.getUTCHours() !== parts.hour ||
    roundTrip.getUTCMinutes() !== parts.minute ||
    roundTrip.getUTCSeconds() !== parts.second
  ) {
    throw new ZonedDateTimeError("INVALID_LOCAL_DATE_TIME", message);
  }
}

function calendarDateComparison(left: DateTimeParts, right: DateTimeParts): number {
  if (left.year !== right.year) return left.year - right.year;
  if (left.month !== right.month) return left.month - right.month;
  return left.day - right.day;
}

function toUtcEpoch(parts: DateTimeParts): number {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, parts.second, 0);
  return date.getTime();
}

function createFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    calendar: "iso8601",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    numberingSystem: "latn",
    second: "2-digit",
    timeZone,
    year: "numeric",
  });
}

function readParts(epoch: number, formatter: Intl.DateTimeFormat): DateTimeParts {
  const values = new Map(
    formatter
      .formatToParts(new Date(epoch))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: requirePart(values, "year"),
    month: requirePart(values, "month"),
    day: requirePart(values, "day"),
    hour: requirePart(values, "hour"),
    minute: requirePart(values, "minute"),
    second: requirePart(values, "second"),
  };
}

function requirePart(values: ReadonlyMap<string, number>, key: string): number {
  const value = values.get(key);
  if (value === undefined) {
    throw new ZonedDateTimeError("INVALID_LOCAL_DATE_TIME", `Missing ${key} date-time part`);
  }
  return value;
}

function offsetAt(epoch: number, formatter: Intl.DateTimeFormat): number {
  return toUtcEpoch(readParts(epoch, formatter)) - epoch;
}

function partsEqual(left: DateTimeParts, right: DateTimeParts): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute &&
    left.second === right.second
  );
}

function formatLocalDateTime(parts: DateTimeParts): string {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day,
  ).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(
    2,
    "0",
  )}:${String(parts.second).padStart(2, "0")}`;
}
