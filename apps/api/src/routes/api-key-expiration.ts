const EXPLICIT_OFFSET_ISO_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/u;

export class ApiKeyExpirationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiKeyExpirationError";
  }
}

function parsedInstant(value: string): Date {
  const match = EXPLICIT_OFFSET_ISO_INSTANT.exec(value);
  if (match === null) {
    throw new ApiKeyExpirationError(
      "API key expiration must be an ISO instant with an explicit UTC offset.",
    );
  }
  const [
    ,
    yearValue,
    monthValue,
    dayValue,
    hourValue,
    minuteValue,
    secondValue,
    ,
    offsetHourValue,
    offsetMinuteValue,
  ] = match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  const second = Number(secondValue);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  calendar.setUTCHours(hour, minute, second, 0);
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day ||
    calendar.getUTCHours() !== hour ||
    calendar.getUTCMinutes() !== minute ||
    calendar.getUTCSeconds() !== second ||
    (offsetHourValue !== undefined && Number(offsetHourValue) > 14) ||
    (offsetMinuteValue !== undefined && Number(offsetMinuteValue) > 59) ||
    (offsetHourValue === "14" && offsetMinuteValue !== "00")
  ) {
    throw new ApiKeyExpirationError("API key expiration is invalid.");
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new ApiKeyExpirationError("API key expiration is invalid.");
  }
  return parsed;
}

export function normalizeApiKeyExpiration(value: string | null, now: Date): string | null {
  if (value === null) return null;
  const parsed = parsedInstant(value);
  if (parsed.getTime() <= now.getTime()) {
    throw new ApiKeyExpirationError("API key expiration must be in the future.");
  }
  return parsed.toISOString();
}

export function normalizeStoredApiKeyExpiration(value: string | null): string | null {
  if (value === null) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new ApiKeyExpirationError("Stored API key expiration is invalid.");
  }
  return parsed.toISOString();
}
