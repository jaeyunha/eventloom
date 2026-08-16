import { describe, expect, it } from "vitest";
import { distributionAppliedMessage } from "./organizer-authoring-assignment-actions";

describe("distributionAppliedMessage", () => {
  it("reports the user-facing outcome without exposing assignment identifiers", () => {
    const message = distributionAppliedMessage(1);

    expect(message).toBe("Reviewer assignments updated. 1 active assignment.");
    expect(message).not.toContain("plan-");
    expect(message).not.toContain("round-");
    expect(message).not.toContain("submission_");
    expect(message).not.toContain("History preserved");
    expect(message).not.toContain("Superseded");
  });

  it("uses a plural summary for multiple active assignments", () => {
    expect(distributionAppliedMessage(3)).toBe(
      "Reviewer assignments updated. 3 active assignments.",
    );
  });
});
