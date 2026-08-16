import { resolveLocalDateTime, ZonedDateTimeError } from "@eventloom/contracts";

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u;

function invalidExpiration(): Error {
  return new Error("Choose a valid expiration date and time.");
}

export function browserApiKeyExpirationTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone?.trim() || "UTC";
}

export function apiKeyExpirationInstant(
  value: string,
  now = new Date(),
  timeZone = browserApiKeyExpirationTimeZone(),
): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!LOCAL_DATE_TIME.test(trimmed)) throw invalidExpiration();

  let instant: string;
  try {
    instant = resolveLocalDateTime(trimmed, timeZone).instant;
  } catch (error) {
    if (error instanceof ZonedDateTimeError && error.code === "AMBIGUOUS_LOCAL_TIME") {
      throw new Error(
        `The selected local expiration occurs twice in ${timeZone} when clocks move back. Choose a different date or time.`,
      );
    }
    if (error instanceof ZonedDateTimeError && error.code === "NONEXISTENT_LOCAL_TIME") {
      throw new Error(
        `The selected local expiration does not exist in ${timeZone} when clocks move forward. Choose a different date or time.`,
      );
    }
    throw invalidExpiration();
  }

  if (Date.parse(instant) <= now.getTime()) {
    throw new Error("API key expiration must be in the future.");
  }
  return instant;
}

export function minimumApiKeyExpirationLocal(now = new Date()): string {
  const minimum = new Date(now);
  minimum.setSeconds(0, 0);
  if (minimum.getTime() <= now.getTime()) minimum.setMinutes(minimum.getMinutes() + 1);
  return [
    String(minimum.getFullYear()).padStart(4, "0"),
    "-",
    String(minimum.getMonth() + 1).padStart(2, "0"),
    "-",
    String(minimum.getDate()).padStart(2, "0"),
    "T",
    String(minimum.getHours()).padStart(2, "0"),
    ":",
    String(minimum.getMinutes()).padStart(2, "0"),
  ].join("");
}
