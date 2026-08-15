"use client";

import type { ApiPlan } from "./api-api-plan";
import type { Fetcher } from "./api-fetcher";
import { evaluationRequest } from "./model-evaluation-request";
import { buildEvaluationPlanCreateDto } from "./organizer-build-evaluation-plan-create-dto";
import type { CreateEvaluationPlanFormInput } from "./organizer-create-evaluation-plan-form-input";
import { validateCreateEvaluationPlanForm } from "./organizer-validate-create-evaluation-plan-form";

export async function createEvaluationPlan(
  baseUrl: string,
  input: CreateEvaluationPlanFormInput,
  fetcher: Fetcher = fetch,
): Promise<ApiPlan> {
  const validationMessage = validateCreateEvaluationPlanForm(input);
  if (validationMessage !== null) throw new Error(validationMessage);
  return evaluationRequest<ApiPlan>(
    baseUrl,
    "/plans",
    {
      method: "POST",
      body: JSON.stringify(buildEvaluationPlanCreateDto(input)),
    },
    fetcher,
  );
}
