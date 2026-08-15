"use client";

import type { CreateEvaluationPlanFormInput } from "./organizer-create-evaluation-plan-form-input";

export function validateCreateEvaluationPlanForm(
  input: CreateEvaluationPlanFormInput,
): string | null {
  if (input.eventId.trim().length === 0) return "Event ID is required.";
  if (input.name.trim().length === 0) return "Plan name is required.";
  return null;
}
