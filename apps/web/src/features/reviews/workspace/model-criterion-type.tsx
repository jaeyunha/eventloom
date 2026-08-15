import type { CriterionInputType } from "./scorecard-criterion-input-type";
import type { RubricCriterion } from "./scorecard-rubric-criterion";

export function criterionType(criterion: RubricCriterion): CriterionInputType {
  return criterion.inputType ?? "numeric";
}
