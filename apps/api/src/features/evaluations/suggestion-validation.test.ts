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
    ] as const;

    for (const [source, rationale] of cases) {
      expect(isMeaningfulSuggestionRationale(rationale, source)).toBe(true);
    }
  });

  it("rejects known filler terms while retaining structural grounding", () => {
    expect(
      isMeaningfulSuggestionRationale(
        "The practical material gives the audience a concrete outcome with pineapple locomotive.",
        "Practical material for the audience.",
      ),
    ).toBe(false);
    expect(
      isMeaningfulSuggestionRationale(
        "The practical material gives the audience a concrete outcome with nebula toaster.",
        "Practical material for the audience.",
      ),
    ).toBe(false);
  });
});
