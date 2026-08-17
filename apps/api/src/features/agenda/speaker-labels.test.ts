import { describe, expect, it } from "vitest";
import { NEUTRAL_SPEAKER_LABEL, neutralSpeakerDisplayName } from "./speaker-labels";

describe("neutralSpeakerDisplayName", () => {
  it("returns the first non-blank candidate", () => {
    expect(neutralSpeakerDisplayName("Ada", "Grace")).toBe("Ada");
    expect(neutralSpeakerDisplayName(undefined, "", "  ", "Grace")).toBe("Grace");
    expect(neutralSpeakerDisplayName(null, "  Ada  ")).toBe("  Ada  ");
  });

  it("falls back to the neutral Speaker label", () => {
    expect(neutralSpeakerDisplayName()).toBe(NEUTRAL_SPEAKER_LABEL);
    expect(neutralSpeakerDisplayName(undefined, null, "", "   ")).toBe(NEUTRAL_SPEAKER_LABEL);
    expect(neutralSpeakerDisplayName("")).toBe(NEUTRAL_SPEAKER_LABEL);
  });
});
