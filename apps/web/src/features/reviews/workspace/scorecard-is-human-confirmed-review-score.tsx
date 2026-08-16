export function isHumanConfirmedReviewScore(score: {
  origin: "human" | "ai";
  humanConfirmedBy: string | null;
  suggestionStatus?: "pending" | "accepted" | "edited" | "rejected" | "stale" | null;
}): boolean {
  return (
    score.origin === "human" ||
    (score.origin === "ai" &&
      score.humanConfirmedBy !== null &&
      (score.suggestionStatus === "accepted" || score.suggestionStatus === "edited"))
  );
}
