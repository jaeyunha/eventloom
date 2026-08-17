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
    expect(
      isMeaningfulSuggestionRationale(
        "Practical material gives the audience zorbles flibbles.",
        "Practical material for the audience.",
      ),
    ).toBe(false);
    expect(
      isMeaningfulSuggestionRationale(
        "The rollback checklist gives engineering teams wugga blorptastic.",
        "The rollback checklist documents deployment practices for engineering teams.",
      ),
    ).toBe(false);
    expect(
      isMeaningfulSuggestionRationale(
        "The practical material supports audience needs through glorp wibble.",
        "Practical material for the audience.",
      ),
    ).toBe(false);
    expect(
      isMeaningfulSuggestionRationale(
        "The practical material supports audience needs through snazzle frobnitz.",
        "Practical material for the audience.",
      ),
    ).toBe(false);
    expect(
      isMeaningfulSuggestionRationale(
        "The rollback checklist provides safeguards through splunge crondle.",
        "The rollback checklist documents deployment practices for engineering teams.",
      ),
    ).toBe(false);
    expect(
      isMeaningfulSuggestionRationale(
        "Because practical material matters, frumious bandersnatch improves outcomes.",
        "Practical material for the audience.",
      ),
    ).toBe(false);
    expect(
      isMeaningfulSuggestionRationale(
        "Practical material supports the audience with zorbles9 flibbles9.",
        "Practical material for the audience.",
      ),
    ).toBe(false);
    expect(
      isMeaningfulSuggestionRationale(
        "Practical material supports the audience with zxqv7 plmn8.",
        "Practical material for the audience.",
      ),
    ).toBe(false);
    for (const rationale of [
      "Practical material gives the audience snorfle garbax.",
      "Practical material audience utterly vacuous drivel.",
      "Practical material audience lorem ipsum dolor.",
      "Practical material audience alpha beta gamma.",
    ]) {
      expect(
        isMeaningfulSuggestionRationale(rationale, "Practical material for the audience."),
      ).toBe(false);
    }
    expect(
      isMeaningfulSuggestionRationale(
        "The rollback checklist convincingly details operational readiness for engineering teams.",
        "The rollback checklist documents deployment practices for engineering teams.",
      ),
    ).toBe(true);
  });
});
