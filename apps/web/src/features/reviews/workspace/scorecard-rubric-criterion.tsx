import type { CriterionInputType } from "./scorecard-criterion-input-type";
import type { CriterionOption } from "./scorecard-criterion-option";

export interface RubricCriterion {
  id: string;
  label: string;
  description: string;
  minimum: number;
  maximum: number;
  weight: number;
  required: boolean;
  inputType?: CriterionInputType | undefined;
  options?: readonly CriterionOption[] | undefined;
}
