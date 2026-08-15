export function planIdForCreation(eventId: string, name: string): string {
  const slug = `${eventId}-${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 92);
  return `plan-${slug || "evaluation"}`;
}
