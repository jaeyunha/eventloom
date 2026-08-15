"use client";

export function withScorecardResponses(
  comment: string,
  responses: Readonly<Record<string, string>>,
): string {
  const entries = Object.entries(responses)
    .filter(([, value]) => value.trim().length > 0)
    .sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return comment.trim();
  return `${comment.trim()}${comment.trim().length > 0 ? "\n\n" : ""}${entries
    .map(([id, value]) => `[scorecard-response id="${id}"]\n${value.trim()}\n[/scorecard-response]`)
    .join("\n")}`;
}
