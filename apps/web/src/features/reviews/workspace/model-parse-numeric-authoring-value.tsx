export function parseNumericAuthoringValue(current: number, rawValue: string): number {
  const normalized = rawValue.trim();
  if (normalized.length === 0) return current;
  const next = Number(normalized);
  return Number.isFinite(next) ? next : current;
}
