import { describe, expect, it } from "vitest";
import { isMeaningfulSuggestionRationale } from "./suggestion-validation";

describe("suggestion rationale validation", () => {
  it("accepts varied grounded provider prose without vocabulary pinning", () => {
    const cases = [
      [
        "The proposal promises a concrete audience outcome for attendees.",
        "Because the proposal promises a concrete audience outcome, attendees can expect clear practical value.",
      ],
      [
        "A concrete audience outcome supports practical value for the audience.",
        "This excerpt describes a concrete audience outcome, which justifies a high quality rating.",
      ],
      [
        "The concrete audience outcome gives participants useful knowledge.",
        "The concrete audience outcome suggests that participants will leave with useful knowledge.",
      ],
      [
        "The rollback checklist documents deployment practices for engineering teams.",
        "The rollback checklist provides safeguards that reduce deployment risk for engineering teams.",
      ],
      [
        "The session includes a practical workshop and measurable audience outcomes.",
        "A practical workshop with measurable audience outcomes merits the highest rating.",
      ],
      [
        "Practical material for the audience.",
        "Practical material is valuable to the audience as an immediately usable takeaway.",
      ],
    ] as const;

    for (const [source, rationale] of cases) {
      expect(isMeaningfulSuggestionRationale(rationale, source)).toBe(true);
    }
  });

  it("rejects text that lacks length or source overlap", () => {
    expect(isMeaningfulSuggestionRationale("Excellent", "Practical material.")).toBe(false);
    expect(isMeaningfulSuggestionRationale("", "Practical material.")).toBe(false);
    expect(
      isMeaningfulSuggestionRationale(
        "Practical material audience practical material audience.",
        "Practical material for the audience.",
      ),
    ).toBe(false);
    expect(
      isMeaningfulSuggestionRationale(
        "Something entirely disconnected from any submitted source text content here.",
        "Practical material for the audience.",
      ),
    ).toBe(false);
  });

  it("leaves quality judgment of unusual-but-grounded prose to humans", () => {
    expect(
      isMeaningfulSuggestionRationale(
        "The practical material supports audience needs through bold unconventional framing.",
        "Practical material for the audience.",
      ),
    ).toBe(true);
    expect(
      isMeaningfulSuggestionRationale(
        "The rollback checklist convincingly details operational readiness for engineering teams.",
        "The rollback checklist documents deployment practices for engineering teams.",
      ),
    ).toBe(true);
  });
});
