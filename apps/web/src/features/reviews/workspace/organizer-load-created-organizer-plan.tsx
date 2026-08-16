"use client";

import { loadOrganizerData } from "./organizer-load-organizer-data";
import type { ReviewPlanSeed } from "./organizer-review-plan-seed";

export async function loadCreatedOrganizerPlan(
  eventId: string,
  baseUrl: string,
  planId: string,
  loader: typeof loadOrganizerData = loadOrganizerData,
): Promise<ReviewPlanSeed> {
  return loader(eventId, baseUrl, planId);
}
