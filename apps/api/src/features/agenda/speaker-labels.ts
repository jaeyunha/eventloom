/** Public/local speaker label when no usable display name is available. */
export const NEUTRAL_SPEAKER_LABEL = "Speaker";

/**
 * Prefer the first non-blank candidate; never surface empty/whitespace or
 * missing names as public speaker labels.
 */
export function neutralSpeakerDisplayName(
  ...candidates: ReadonlyArray<string | null | undefined>
): string {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return NEUTRAL_SPEAKER_LABEL;
}
