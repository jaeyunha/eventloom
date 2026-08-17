import { describe, expect, it } from "vitest";
import { neutralSpeakerDisplayName } from "./speaker-labels";

describe("neutralSpeakerDisplayName", () => {
  it("returns a usable approved name", () => {
    expect(neutralSpeakerDisplayName("participant-1", "Ada Lovelace")).toBe("Ada Lovelace");
  });

  it("rejects blank and participant-id labels", () => {
    expect(neutralSpeakerDisplayName("participant-1", "", "participant-1")).toBe("Speaker");
    expect(neutralSpeakerDisplayName("participant-1", " participant-1 ")).toBe("Speaker");
  });
});
