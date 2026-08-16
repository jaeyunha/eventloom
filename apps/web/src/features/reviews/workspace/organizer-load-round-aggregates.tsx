"use client";

import type { ApiAggregate } from "./api-api-aggregate";
import type { Fetcher } from "./api-fetcher";
import { evaluationRequest } from "./model-evaluation-request";

export async function loadRoundAggregates(
  baseUrl: string,
  planId: string,
  roundId: string,
  fetcher: Fetcher = fetch,
): Promise<readonly ApiAggregate[]> {
  const result = await evaluationRequest<{ aggregates: readonly ApiAggregate[] }>(
    baseUrl,
    `/plans/${encodeURIComponent(planId)}/rounds/${encodeURIComponent(roundId)}/aggregates`,
    {},
    fetcher,
  );
  return result.aggregates;
}
