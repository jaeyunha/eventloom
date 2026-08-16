const AUTHORING_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
export function authoringDateLabel(value: string | null | undefined): string {
  if (!value) return "Not set";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Not set";
  return AUTHORING_DATE_FORMATTER.format(parsed);
}
