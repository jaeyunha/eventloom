"use client";

import type { ReviewRound } from "./organizer-review-round";

export function submissionTrack(
  round: ReviewRound,
  answers: Readonly<Record<string, unknown>> | undefined,
): string | null {
  const trackEntry = Object.entries(answers ?? {}).find(([id, value]) => {
    const normalizedId = id.toLowerCase();
    return (
      typeof value === "string" &&
      (normalizedId === "track" ||
        normalizedId === "tracks" ||
        normalizedId.includes("track") ||
        normalizedId === "category")
    );
  });
  return typeof trackEntry?.[1] === "string" ? trackEntry[1] : (round.trackFilter ?? null);
}
