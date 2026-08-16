"use client";

import type { Fetcher } from "./api-fetcher";
import { evaluationRequest } from "./model-evaluation-request";
import type { ReminderDeliveryFact } from "./progress-reminder-delivery-fact";

export async function loadReminderDeliveryFacts(
  baseUrl: string,
  planId: string,
  fetcher: Fetcher = fetch,
): Promise<readonly ReminderDeliveryFact[]> {
  const result = await evaluationRequest<{ readonly facts: readonly ReminderDeliveryFact[] }>(
    baseUrl,
    `/plans/${encodeURIComponent(planId)}/reminders`,
    {},
    fetcher,
  );
  return result.facts;
}
