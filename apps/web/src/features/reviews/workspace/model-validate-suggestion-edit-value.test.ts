import { describe, expect, it } from "vitest";
import type { RubricCriterion } from "./scorecard-rubric-criterion";
import { validateSuggestionEditValue } from "./model-validate-suggestion-edit-value";

const dropdownCriterion: RubricCriterion = {
  id: "recommendation",
  label: "Recommendation",
  description: "Would you recommend this proposal?",
  minimum: 0,
  maximum: 5,
  weight: 1,
  required: true,
  inputType: "dropdown",
  options: [
    { label: "Accept", value: "accept" },
    { label: "Maybe", value: "maybe" },
    { label: "Reject", value: "reject" },
  ],
};

describe("validateSuggestionEditValue", () => {
  it("accepts mapped dropdown scores and rejects scores without configured options", () => {
    expect(validateSuggestionEditValue(dropdownCriterion, 0)).toBeNull();
    expect(validateSuggestionEditValue(dropdownCriterion, "accept")).toBeNull();
    expect(validateSuggestionEditValue(dropdownCriterion, 4)).toBe(
      "Recommendation must use one of the configured dropdown options.",
    );
  });
});
