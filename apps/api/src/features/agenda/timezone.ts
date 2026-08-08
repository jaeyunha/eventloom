import type { TimeDisambiguation } from "./types";

const localDateTimePattern =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2})(?::(?<second>\d{2}))?$/;

interface DateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export interface ResolvedZonedDateTime {
  instant: string;
  localDateTime: string;
  timeZone: string;
  offsetMinutes: number;
}

export class AgendaTimeZoneError extends Error {
  constructor(
    readonly code:
      | "AMBIGUOUS_LOCAL_TIME"
      | "INVALID_LOCAL_DATE_TIME"
      | "INVALID_TIME_ZONE"
      | "NONEXISTENT_LOCAL_TIME",
    message: string,
  ) {
    super(message);
    this.name = "AgendaTimeZoneError";
  }
}

export function canonicalizeTimeZone(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone;
  } catch {
    throw new AgendaTimeZoneError("INVALID_TIME_ZONE", `Unknown IANA time zone: ${timeZone}`);
  }
}

export function resolveLocalDateTime(
  localDateTime: string,
  requestedTimeZone: string,
  disambiguation?: TimeDisambiguation,
): ResolvedZonedDateTime {
  const parts = parseLocalDateTime(localDateTime);
  const timeZone = canonicalizeTimeZone(requestedTimeZone);
  const localEpoch = toUtcEpoch(parts);
  const formatter = createFormatter(timeZone);
  const candidateOffsets = new Set<number>();

  for (let hourDelta = -36; hourDelta <= 36; hourDelta += 6) {
    const probe = localEpoch + hourDelta * 60 * 60 * 1000;
    candidateOffsets.add(offsetAt(probe, formatter));
  }

  const candidates = [...candidateOffsets]
    .map((offset) => localEpoch - offset)
    .filter((candidate) => partsEqual(readParts(candidate, formatter), parts))
    .sort((left, right) => left - right);

  if (candidates.length === 0) {
    throw new AgendaTimeZoneError(
      "NONEXISTENT_LOCAL_TIME",
      `${localDateTime} does not exist in ${timeZone} because of a time-zone transition`,
    );
  }

  if (candidates.length > 1 && disambiguation === undefined) {
    throw new AgendaTimeZoneError(
      "AMBIGUOUS_LOCAL_TIME",
      `${localDateTime} occurs twice in ${timeZone}; choose earlier or later`,
    );
  }

  const candidate = disambiguation === "later" ? candidates.at(-1) : candidates[0];
  if (candidate === undefined) {
    throw new AgendaTimeZoneError("INVALID_LOCAL_DATE_TIME", "Unable to resolve local date-time");
  }

  return {
    instant: new Date(candidate).toISOString(),
    localDateTime: formatLocalDateTime(parts),
    timeZone,
    offsetMinutes: (localEpoch - candidate) / (60 * 1000),
  };
}

export function formatInstantInTimeZone(instant: string, requestedTimeZone: string): string {
  const epoch = Date.parse(instant);
  if (!Number.isFinite(epoch)) {
    throw new AgendaTimeZoneError("INVALID_LOCAL_DATE_TIME", `Invalid instant: ${instant}`);
  }

  const timeZone = canonicalizeTimeZone(requestedTimeZone);
  return formatLocalDateTime(readParts(epoch, createFormatter(timeZone)));
}

function parseLocalDateTime(value: string): DateTimeParts {
  const match = localDateTimePattern.exec(value);
  const groups = match?.groups;
  if (groups === undefined) {
    throw new AgendaTimeZoneError(
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
  const roundTrip = new Date(toUtcEpoch(parts));
  if (
    roundTrip.getUTCFullYear() !== parts.year ||
    roundTrip.getUTCMonth() + 1 !== parts.month ||
    roundTrip.getUTCDate() !== parts.day ||
    roundTrip.getUTCHours() !== parts.hour ||
    roundTrip.getUTCMinutes() !== parts.minute ||
    roundTrip.getUTCSeconds() !== parts.second
  ) {
    throw new AgendaTimeZoneError("INVALID_LOCAL_DATE_TIME", `Invalid local date-time: ${value}`);
  }

  return parts;
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
    throw new AgendaTimeZoneError("INVALID_LOCAL_DATE_TIME", `Missing ${key} date-time part`);
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
