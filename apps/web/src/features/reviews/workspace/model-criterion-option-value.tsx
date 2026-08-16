import { criterionType } from "./model-criterion-type";
import type { RubricCriterion } from "./scorecard-rubric-criterion";

export function criterionOptionValue(
  criterion: RubricCriterion,
  score: number | string | undefined,
): string {
  if (score === undefined || criterionType(criterion) !== "dropdown") return "";
  if (typeof score === "string") return score;
  const index = Math.round(score - criterion.minimum);
  return criterion.options?.[index]?.value ?? "";
}
