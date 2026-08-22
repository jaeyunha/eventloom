const AUTHORING_DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

export function authoringDateLabel(
  value: string | null | undefined,
  timeZone?: string | undefined,
): string {
  if (!value) return "Not set";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Not set";
  const formatter = new Intl.DateTimeFormat("en-US", {
    ...AUTHORING_DATE_FORMAT_OPTIONS,
    ...(timeZone === undefined ? {} : { timeZone }),
  });
  return formatter.format(parsed);
}
