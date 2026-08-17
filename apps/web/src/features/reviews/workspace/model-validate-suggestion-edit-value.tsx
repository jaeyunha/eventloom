"use client";

import { criterionNumericValue } from "./model-criterion-numeric-value";
import { criterionType } from "./model-criterion-type";
import type { RubricCriterion } from "./scorecard-rubric-criterion";

export function validateSuggestionEditValue(
  criterion: RubricCriterion,
  rawValue: number | string,
): string | null {
  if (criterionType(criterion) === "free_text") {
    return "Free-text criteria cannot resolve a numeric suggestion.";
  }
  const isDropdown = criterionType(criterion) === "dropdown";
  const numericValue = isDropdown
    ? typeof rawValue === "number"
      ? rawValue
      : criterionNumericValue(criterion, rawValue)
    : Number(rawValue);
  if (!Number.isFinite(numericValue)) return `Enter a numeric value for ${criterion.label}.`;
  if (isDropdown) {
    const optionIndex = numericValue - criterion.minimum;
    if (
      !Number.isInteger(optionIndex) ||
      optionIndex < 0 ||
      optionIndex >= (criterion.options?.length ?? 0)
    ) {
      return `${criterion.label} must use one of the configured dropdown options.`;
    }
  }
  if (numericValue < criterion.minimum || numericValue > criterion.maximum) {
    return `${criterion.label} must be between ${criterion.minimum} and ${criterion.maximum}.`;
  }
  return null;
}
