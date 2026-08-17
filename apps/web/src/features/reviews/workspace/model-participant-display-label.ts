import type { AggregateParticipant } from "./organizer-aggregate-participant";

export function participantDisplayLabel(
  participants: readonly AggregateParticipant[] | undefined,
): string | undefined {
  if (!participants || participants.length === 0) return undefined;
  return participants
    .map(({ displayName }, index) => displayName.trim() || `Participant ${index + 1}`)
    .join(" · ");
}
