import type { AggregateParticipant } from "./organizer-aggregate-participant";

export function participantDisplayLabel(
  participants: readonly AggregateParticipant[] | undefined,
): string | undefined {
  const names =
    participants
      ?.map(({ displayName }) => displayName.trim())
      .filter((displayName) => displayName.length > 0) ?? [];
  return names.length > 0 ? names.join(" · ") : undefined;
}
