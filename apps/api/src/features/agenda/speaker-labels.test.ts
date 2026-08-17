import { describe, expect, it } from "vitest";
import { NEUTRAL_SPEAKER_LABEL, neutralSpeakerDisplayName } from "./speaker-labels";

describe("neutralSpeakerDisplayName", () => {
  it("returns the first non-blank non-id candidate", () => {
    expect(neutralSpeakerDisplayName("p-1", "Ada", "Grace")).toBe("Ada");
    expect(neutralSpeakerDisplayName("p-1", undefined, "", "  ", "Grace")).toBe("Grace");
    expect(neutralSpeakerDisplayName("p-1", null, "  Ada  ")).toBe("  Ada  ");
  });

  it("rejects blank labels and labels equal to the participant id", () => {
    expect(neutralSpeakerDisplayName("p-1")).toBe(NEUTRAL_SPEAKER_LABEL);
    expect(neutralSpeakerDisplayName("p-1", undefined, null, "", "   ")).toBe(
      NEUTRAL_SPEAKER_LABEL,
    );
    expect(neutralSpeakerDisplayName("p-1", "p-1")).toBe(NEUTRAL_SPEAKER_LABEL);
    expect(neutralSpeakerDisplayName("p-1", "  p-1  ", "Ada")).toBe("Ada");
    expect(neutralSpeakerDisplayName(undefined, "")).toBe(NEUTRAL_SPEAKER_LABEL);
  });
});
