"use client";

import type { ApiPlan } from "./api-api-plan";
import type { Fetcher } from "./api-fetcher";
import { evaluationRequest } from "./model-evaluation-request";

export async function reviseEvaluationPlan(
  baseUrl: string,
  planId: string,
  expectedVersion: number,
  fetcher: Fetcher = fetch,
): Promise<ApiPlan> {
  return evaluationRequest<ApiPlan>(
    baseUrl,
    `/plans/${encodeURIComponent(planId)}/revise`,
    { method: "POST", body: JSON.stringify({ expectedVersion }) },
    fetcher,
  );
}
