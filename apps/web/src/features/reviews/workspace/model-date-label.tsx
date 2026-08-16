const REVIEW_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const REVIEW_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

export function dateLabel(value: string | null): string {
  if (value === null) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? REVIEW_DATE_FORMATTER.format(date) : value;
}

export function utcDateTimeLabel(value: string | null | undefined): string {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? REVIEW_DATE_TIME_FORMATTER.format(date) : value;
}
