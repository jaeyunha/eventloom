import type { ReminderDeliveryFact } from "./progress-reminder-delivery-fact";

export function reminderReviewerIdsRequiringSend(
  facts: readonly ReminderDeliveryFact[],
  roundId: string,
  reviewerIds: readonly string[],
): readonly string[] {
  const reusableStatuses = new Set(["queued", "processing", "delivered"]);
  return reviewerIds.filter(
    (reviewerId) =>
      !facts.some(
        (fact) =>
          fact.roundId === roundId &&
          fact.reviewerId === reviewerId &&
          typeof fact.status === "string" &&
          reusableStatuses.has(fact.status.toLowerCase()),
      ),
  );
}
