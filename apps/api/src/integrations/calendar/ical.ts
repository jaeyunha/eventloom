import {
  CalendarInvitationError,
  type CalendarInvitationPayload,
  type CalendarInvitationResult,
  type CalendarInvitationSerializationOptions,
  isCalendarEmailAddress,
} from "./types";

const MAX_ICAL_LINE_OCTETS = 75;
const UTC_MINUTE = 60_000;
const UTC_HOUR = 60 * UTC_MINUTE;
const TRANSITION_SCAN_STEP = 6 * UTC_HOUR;
const TRANSITION_PRECISION = 1_000;

interface InstantParts {
  epoch: number;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

interface DateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

interface TimeZoneTransition {
  epoch: number;
  local: DateTimeParts;
  offsetFrom: number;
  offsetTo: number;
  name: string;
  isDaylight: boolean;
}

const instantPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Serializes a provider-neutral invitation to RFC 5545. UPDATE is deliberately
 * represented by METHOD:REQUEST: calendar clients apply it to the existing UID
 * using its higher SEQUENCE rather than creating a second event.
 */
export function serializeCalendarInvitation(
  payload: CalendarInvitationPayload,
  options: CalendarInvitationSerializationOptions = {},
): string {
  const validated = validateCalendarInvitationPayload(payload);
  const start = parseInstant(validated.startsAt, "startsAt");
  const end = parseInstant(validated.endsAt, "endsAt");
  const generatedAt = normalizeGeneratedAt(options.generatedAt);
  const localStart = formatInstantInTimeZone(start.epoch, validated.timeZone);
  const localEnd = formatInstantInTimeZone(end.epoch, validated.timeZone);
  const method = validated.method === "CANCEL" ? "CANCEL" : "REQUEST";
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Forever Browsing//Eventloom//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    ...buildTimeZoneLines(validated.timeZone, localStart.year),
    "BEGIN:VEVENT",
    `UID:${escapeIcalText(validated.uid)}`,
    `DTSTAMP:${formatUtcDateTime(generatedAt.epoch)}`,
    `SEQUENCE:${validated.sequence}`,
    `DTSTART;TZID=${validated.timeZone}:${formatBasicDateTime(localStart)}`,
    `DTEND;TZID=${validated.timeZone}:${formatBasicDateTime(localEnd)}`,
    `SUMMARY:${escapeIcalText(validated.summary)}`,
    `LOCATION:${escapeIcalText(validated.location)}`,
    `ORGANIZER:mailto:${validated.organizer}`,
    ...validated.attendees.map(
      (attendee) =>
        `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendee}`,
    ),
    ...(validated.method === "CANCEL" ? ["STATUS:CANCELLED"] : []),
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return `${lines.flatMap((line) => foldIcalLine(line)).join("\r\n")}\r\n`;
}
export function createCalendarInvitation(
  payload: CalendarInvitationPayload,
  options: CalendarInvitationSerializationOptions = {},
): CalendarInvitationResult {
  const validated = validateCalendarInvitationPayload(payload);
  const method = validated.method === "CANCEL" ? "CANCEL" : "REQUEST";
  const generatedAt = normalizeGeneratedAt(options.generatedAt);
  return {
    ics: serializeCalendarInvitation(validated, { generatedAt: generatedAt.iso }),
    method,
    contentType: `text/calendar; charset=utf-8; method=${method}`,
    generatedAt: generatedAt.iso,
  };
}

/** Alias with the common iCal spelling kept as a named, explicit API. */
export const serializeIcal = serializeCalendarInvitation;

/**
 * Performs the runtime checks that the contracts package cannot perform when a
 * payload arrives from an outbox or another worker boundary.
 */
export function validateCalendarInvitationPayload(
  payload: CalendarInvitationPayload,
): CalendarInvitationPayload {
  if (payload === null || typeof payload !== "object") {
    throw calendarPayloadError("Payload must be an object");
  }

  assertSafeText(payload.uid, "uid", true);
  assertSafeText(payload.timeZone, "timeZone", true);
  assertSafeText(payload.startsAt, "startsAt", true);
  assertSafeText(payload.endsAt, "endsAt", true);
  assertCalendarText(payload.summary, "summary", true);
  assertCalendarText(payload.location, "location", false);
  assertSafeText(payload.organizer, "organizer", true);
  assertSafeText(payload.idempotencyKey, "idempotencyKey", true);
  assertTextLength(payload.uid, "uid", 1, 255);
  assertTextLength(payload.summary, "summary", 1, 300);
  assertTextLength(payload.location, "location", 0, 300);
  assertTextLength(payload.idempotencyKey, "idempotencyKey", 8, 128);

  if (payload.method !== "REQUEST" && payload.method !== "UPDATE" && payload.method !== "CANCEL") {
    throw calendarPayloadError(`Unsupported calendar method: ${String(payload.method)}`);
  }
  if (!Number.isSafeInteger(payload.sequence) || payload.sequence < 0) {
    throw calendarPayloadError("Calendar sequence must be a non-negative integer");
  }
  if (!isCalendarEmailAddress(payload.organizer)) {
    throw calendarPayloadError(`Invalid organizer address: ${payload.organizer}`);
  }
  if (!Array.isArray(payload.attendees) || payload.attendees.length === 0) {
    throw calendarPayloadError("At least one attendee is required");
  }
  for (const attendee of payload.attendees) {
    assertSafeText(attendee, "attendee", false);
    if (!isCalendarEmailAddress(attendee)) {
      throw calendarPayloadError(`Invalid attendee address: ${attendee}`);
    }
  }

  const timeZone = canonicalizeCalendarTimeZone(payload.timeZone);
  const start = parseInstant(payload.startsAt, "startsAt");
  const end = parseInstant(payload.endsAt, "endsAt");
  if (end.epoch <= start.epoch) {
    throw new CalendarInvitationError(
      "INVALID_INTERVAL",
      "Calendar invitation end must be after its start",
    );
  }

  return timeZone === payload.timeZone
    ? clonePayload(payload)
    : { ...clonePayload(payload), timeZone };
}

export function canonicalizeCalendarTimeZone(timeZone: string): string {
  assertSafeText(timeZone, "timeZone", false);
  try {
    const formatter = new Intl.DateTimeFormat("en-US", { timeZone });
    formatter.format(0);
    const resolved = formatter.resolvedOptions().timeZone;
    if (resolved === undefined || resolved.length === 0) {
      throw new Error("Missing resolved time zone");
    }
    return resolved;
  } catch {
    throw new CalendarInvitationError("INVALID_TIME_ZONE", `Unknown IANA time zone: ${timeZone}`);
  }
}

/** RFC 5545 TEXT escaping, including normalized newlines. */
export function escapeIcalText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
}

/**
 * Folds one content line at the RFC 5545 limit. The continuation whitespace is
 * counted in the 75-octet budget, and code points are never split mid-UTF-8.
 */
export function foldIcalLine(line: string): readonly string[] {
  assertSafeText(line, "iCalendar line", false);
  if (line.length === 0) {
    return [line];
  }

  const encoder = new TextEncoder();
  const folded: string[] = [];
  let current = "";
  let currentOctets = 0;

  for (const codePoint of line) {
    const codePointOctets = encoder.encode(codePoint).length;
    if (current.length > 0 && currentOctets + codePointOctets > MAX_ICAL_LINE_OCTETS) {
      folded.push(current);
      current = " ";
      currentOctets = 1;
    }

    current += codePoint;
    currentOctets += codePointOctets;
  }

  if (current.length > 0) {
    folded.push(current);
  }
  return folded;
}

function buildTimeZoneLines(timeZone: string, eventYear: number): string[] {
  const transitions = collectTimeZoneTransitions(timeZone, eventYear);
  const startEpoch = utcEpoch(eventYear - 1, 1, 1, 0, 0, 0);
  const formatter = createDateTimeFormatter(timeZone);
  const initialEpoch = startEpoch + 12 * UTC_HOUR;
  const initialOffset = offsetAt(initialEpoch, timeZone, formatter);
  const initialLocal = readDateTimeParts(initialEpoch, timeZone, formatter);
  const initialName = timeZoneNameAt(initialEpoch, timeZone);
  const initialIsDaylight = isDaylightAt(initialEpoch, timeZone);
  const observances: string[] = [
    `BEGIN:VTIMEZONE`,
    `TZID:${timeZone}`,
    `X-LIC-LOCATION:${timeZone}`,
    ...buildObservanceLines({
      local: initialLocal,
      offsetFrom: initialOffset,
      offsetTo: initialOffset,
      name: initialName,
      isDaylight: initialIsDaylight,
    }),
  ];

  for (const transition of transitions) {
    observances.push(...buildObservanceLines(transition));
  }
  observances.push("END:VTIMEZONE");
  return observances;
}

function buildObservanceLines(observance: {
  local: DateTimeParts;
  offsetFrom: number;
  offsetTo: number;
  name: string;
  isDaylight: boolean;
}): string[] {
  return [
    `BEGIN:${observance.isDaylight ? "DAYLIGHT" : "STANDARD"}`,
    `DTSTART:${formatBasicDateTime(observance.local)}`,
    `TZOFFSETFROM:${formatOffset(observance.offsetFrom)}`,
    `TZOFFSETTO:${formatOffset(observance.offsetTo)}`,
    `TZNAME:${escapeIcalText(observance.name)}`,
    `END:${observance.isDaylight ? "DAYLIGHT" : "STANDARD"}`,
  ];
}

function collectTimeZoneTransitions(timeZone: string, eventYear: number): TimeZoneTransition[] {
  const rangeStart = utcEpoch(eventYear - 1, 1, 1, 0, 0, 0);
  const rangeEnd = utcEpoch(eventYear + 2, 1, 1, 0, 0, 0);
  const transitions: TimeZoneTransition[] = [];
  const formatter = createDateTimeFormatter(timeZone);
  let previousEpoch = rangeStart;
  let previousOffset = offsetAt(previousEpoch, timeZone, formatter);

  for (
    let probe = rangeStart + TRANSITION_SCAN_STEP;
    probe <= rangeEnd;
    probe += TRANSITION_SCAN_STEP
  ) {
    const currentOffset = offsetAt(probe, timeZone, formatter);
    if (currentOffset !== previousOffset) {
      const transitionProbe = findTransitionEpoch(
        previousEpoch,
        probe,
        previousOffset,
        timeZone,
        formatter,
      );
      const transitionEpoch =
        Math.floor(transitionProbe / TRANSITION_PRECISION) * TRANSITION_PRECISION;
      const offsetFrom = offsetAt(transitionEpoch - TRANSITION_PRECISION, timeZone, formatter);
      const offsetTo = offsetAt(transitionEpoch + TRANSITION_PRECISION, timeZone, formatter);
      if (offsetFrom !== offsetTo) {
        const previous = transitions.at(-1);
        if (previous === undefined || previous.epoch !== transitionEpoch) {
          transitions.push({
            epoch: transitionEpoch,
            local: readDateTimeParts(transitionEpoch + offsetFrom * UTC_MINUTE, "UTC"),
            offsetFrom,
            offsetTo,
            name: timeZoneNameAt(transitionEpoch + TRANSITION_PRECISION, timeZone),
            isDaylight: isDaylightAt(transitionEpoch + TRANSITION_PRECISION, timeZone),
          });
        }
      }
      previousOffset = currentOffset;
    }
    previousEpoch = probe;
  }

  return transitions;
}

function findTransitionEpoch(
  lowEpoch: number,
  highEpoch: number,
  previousOffset: number,
  timeZone: string,
  formatter: Intl.DateTimeFormat,
): number {
  let low = lowEpoch;
  let high = highEpoch;
  while (high - low > TRANSITION_PRECISION) {
    const middle = low + Math.floor((high - low) / 2);
    if (offsetAt(middle, timeZone, formatter) === previousOffset) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return high;
}

function parseInstant(value: string, fieldName: string): InstantParts {
  assertSafeText(value, fieldName, false);
  const match = instantPattern.exec(value);
  if (match === null) {
    throw new CalendarInvitationError(
      "INVALID_TIMESTAMP",
      `${fieldName} must be an ISO timestamp with an explicit offset`,
    );
  }

  const year = numberFromMatch(match, 1, fieldName);
  const month = numberFromMatch(match, 2, fieldName);
  const day = numberFromMatch(match, 3, fieldName);
  const hour = numberFromMatch(match, 4, fieldName);
  const minute = numberFromMatch(match, 5, fieldName);
  const second = optionalNumberFromMatch(match, 6);
  const fraction = match[7] ?? "";
  const offset = match[8];
  if (offset === undefined) {
    throw new CalendarInvitationError("INVALID_TIMESTAMP", `Missing offset in ${fieldName}`);
  }

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    throw new CalendarInvitationError("INVALID_TIMESTAMP", `Invalid ISO timestamp in ${fieldName}`);
  }

  const milliseconds = fraction.length === 0 ? 0 : Number(fraction.slice(0, 3).padEnd(3, "0"));
  const wall = new Date(0);
  wall.setUTCFullYear(year, month - 1, day);
  wall.setUTCHours(hour, minute, second, milliseconds);
  if (
    wall.getUTCFullYear() !== year ||
    wall.getUTCMonth() + 1 !== month ||
    wall.getUTCDate() !== day ||
    wall.getUTCHours() !== hour ||
    wall.getUTCMinutes() !== minute ||
    wall.getUTCSeconds() !== second ||
    wall.getUTCMilliseconds() !== milliseconds
  ) {
    throw new CalendarInvitationError("INVALID_TIMESTAMP", `Invalid ISO timestamp in ${fieldName}`);
  }

  const offsetMatch = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  const offsetHours =
    offsetMatch === null ? Number.NaN : numberFromMatch(offsetMatch, 2, fieldName);
  const offsetMinutePart =
    offsetMatch === null ? Number.NaN : numberFromMatch(offsetMatch, 3, fieldName);
  const offsetMinutes =
    offset === "Z" ? 0 : offsetMatch === null ? Number.NaN : offsetHours * 60 + offsetMinutePart;
  if (
    !Number.isFinite(offsetMinutes) ||
    (offsetMatch !== null &&
      (!Number.isFinite(offsetHours) ||
        !Number.isFinite(offsetMinutePart) ||
        offsetHours > 23 ||
        offsetMinutePart > 59))
  ) {
    throw new CalendarInvitationError("INVALID_TIMESTAMP", `Invalid offset in ${fieldName}`);
  }
  const signedOffset = offset === "Z" || offsetMatch?.[1] === "+" ? offsetMinutes : -offsetMinutes;
  const epoch = wall.getTime() - signedOffset * UTC_MINUTE;
  return { epoch, year, month, day, hour, minute, second, millisecond: milliseconds };
}

function formatInstantInTimeZone(epoch: number, timeZone: string): DateTimeParts {
  return readDateTimeParts(epoch, timeZone);
}

function readDateTimeParts(
  epoch: number,
  timeZone: string,
  formatter: Intl.DateTimeFormat = createDateTimeFormatter(timeZone),
): DateTimeParts {
  const values = new Map<string, number>();
  for (const part of formatter.formatToParts(new Date(epoch))) {
    if (part.type !== "literal") {
      values.set(part.type, Number(part.value));
    }
  }
  return {
    year: requiredDatePart(values, "year"),
    month: requiredDatePart(values, "month"),
    day: requiredDatePart(values, "day"),
    hour: requiredDatePart(values, "hour"),
    minute: requiredDatePart(values, "minute"),
    second: requiredDatePart(values, "second"),
  };
}

function createDateTimeFormatter(timeZone: string): Intl.DateTimeFormat {
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

function requiredDatePart(values: ReadonlyMap<string, number>, name: string): number {
  const value = values.get(name);
  if (value === undefined || !Number.isFinite(value)) {
    throw new CalendarInvitationError("INVALID_TIMESTAMP", `Missing ${name} time-zone part`);
  }
  return value;
}

function offsetAt(
  epoch: number,
  timeZone: string,
  formatter: Intl.DateTimeFormat = createDateTimeFormatter(timeZone),
): number {
  const local = readDateTimeParts(epoch, timeZone, formatter);
  const wall = new Date(0);
  wall.setUTCFullYear(local.year, local.month - 1, local.day);
  wall.setUTCHours(local.hour, local.minute, local.second, 0);
  return Math.round((wall.getTime() - epoch) / UTC_MINUTE);
}

function timeZoneNameAt(epoch: number, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short",
  });
  const part = formatter
    .formatToParts(new Date(epoch))
    .find((entry) => entry.type === "timeZoneName");
  return part?.value ?? timeZone;
}

function isDaylightAt(epoch: number, timeZone: string): boolean {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "long",
  });
  const part = formatter
    .formatToParts(new Date(epoch))
    .find((entry) => entry.type === "timeZoneName");
  return /daylight|summer/i.test(part?.value ?? "");
}

function formatUtcDateTime(epoch: number): string {
  const date = new Date(epoch);
  return `${String(date.getUTCFullYear()).padStart(4, "0")}${String(
    date.getUTCMonth() + 1,
  ).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}T${String(
    date.getUTCHours(),
  ).padStart(2, "0")}${String(date.getUTCMinutes()).padStart(2, "0")}${String(
    date.getUTCSeconds(),
  ).padStart(2, "0")}Z`;
}

function formatBasicDateTime(parts: DateTimeParts): string {
  return `${String(parts.year).padStart(4, "0")}${String(parts.month).padStart(2, "0")}${String(
    parts.day,
  ).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}${String(parts.minute).padStart(
    2,
    "0",
  )}${String(parts.second).padStart(2, "0")}`;
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const remainder = absolute % 60;
  return `${sign}${String(hours).padStart(2, "0")}${String(remainder).padStart(2, "0")}`;
}

function utcEpoch(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  return date.getTime();
}
function normalizeGeneratedAt(value: string | undefined): { epoch: number; iso: string } {
  const instant = parseInstant(value ?? new Date().toISOString(), "generatedAt");
  return { epoch: instant.epoch, iso: new Date(instant.epoch).toISOString() };
}

function assertSafeText(
  value: unknown,
  fieldName: string,
  requireNonEmpty: boolean,
): asserts value is string {
  if (typeof value !== "string") {
    throw calendarPayloadError(`${fieldName} must be a string`);
  }
  if (value.includes("\r") || value.includes("\n")) {
    throw new CalendarInvitationError(
      "HEADER_INJECTION",
      `${fieldName} must not contain CR or LF characters`,
    );
  }
  if (requireNonEmpty && value.trim().length === 0) {
    throw calendarPayloadError(`${fieldName} must not be empty`);
  }
}
function assertCalendarText(
  value: unknown,
  fieldName: string,
  requireNonEmpty: boolean,
): asserts value is string {
  if (typeof value !== "string") {
    throw calendarPayloadError(`${fieldName} must be a string`);
  }
  if (requireNonEmpty && value.trim().length === 0) {
    throw calendarPayloadError(`${fieldName} must not be empty`);
  }
}
function assertTextLength(
  value: string,
  fieldName: string,
  minimum: number,
  maximum: number,
): void {
  if (value.trim().length < minimum || value.length > maximum) {
    throw calendarPayloadError(
      `${fieldName} must contain between ${minimum} and ${maximum} characters`,
    );
  }
}

function calendarPayloadError(message: string): CalendarInvitationError {
  return new CalendarInvitationError("INVALID_PAYLOAD", message);
}

function clonePayload(payload: CalendarInvitationPayload): CalendarInvitationPayload {
  return { ...payload, attendees: [...payload.attendees] };
}

function numberFromMatch(match: RegExpExecArray, index: number, fieldName: string): number {
  const value = match[index];
  if (value === undefined) {
    throw new CalendarInvitationError("INVALID_TIMESTAMP", `Invalid ${fieldName}`);
  }
  return Number(value);
}

function optionalNumberFromMatch(match: RegExpExecArray, index: number): number {
  const value = match[index];
  return value === undefined ? 0 : Number(value);
}
