/** Public/local speaker label when no usable display name is available. */
export const NEUTRAL_SPEAKER_LABEL = "Speaker";

/**
 * Prefer the first non-blank candidate that is not a raw participant id.
 * Empty, whitespace-only, and id-equal labels fall through to the neutral copy.
 */
export function neutralSpeakerDisplayName(
  participantId: string | null | undefined,
  ...candidates: ReadonlyArray<string | null | undefined>
): string {
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (trimmed.length === 0) continue;
    if (
      typeof participantId === "string" &&
      participantId.length > 0 &&
      (candidate === participantId || trimmed === participantId)
    ) {
      continue;
    }
    return candidate;
  }
  return NEUTRAL_SPEAKER_LABEL;
}
