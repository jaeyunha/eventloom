"use client";

import { criterionType } from "./model-criterion-type";
import type { RubricCriterion } from "./scorecard-rubric-criterion";

export function criterionNumericValue(criterion: RubricCriterion, value: string): number {
  if (criterionType(criterion) === "dropdown") {
    const index = criterion.options?.findIndex((option) => option.value === value) ?? -1;
    return index < 0 ? Number.NaN : criterion.minimum + index;
  }
  return Number(value);
}
