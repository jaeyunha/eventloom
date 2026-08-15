import { reminderDeliveryMessage } from "./model-reminder-delivery-message";
import type { ReminderDeliveryFact } from "./progress-reminder-delivery-fact";

export function reminderDeliveryForSelection(
  facts: readonly ReminderDeliveryFact[],
  roundId: string,
  reviewerIds: readonly string[],
): string {
  const reviewerSet = new Set(reviewerIds);
  const selectedFacts = facts.filter(
    (fact) =>
      fact.roundId === roundId &&
      typeof fact.reviewerId === "string" &&
      reviewerSet.has(fact.reviewerId),
  );
  return reminderDeliveryMessage({
    queued: selectedFacts.length === 0 ? reviewerIds.length : 0,
    facts: selectedFacts,
  });
}
