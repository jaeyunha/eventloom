export function isoDateTimeValue(value: string): string | null {
  if (value.trim().length === 0) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
