"use client";

import type { CreateEvaluationPlanFormInput } from "./organizer-create-evaluation-plan-form-input";

export function validateCreateEvaluationPlanForm(
  input: CreateEvaluationPlanFormInput,
): string | null {
  if (input.eventId.trim().length === 0) return "Event ID is required.";
  if (input.name.trim().length === 0) return "Plan name is required.";
  if (input.firstRoundTitle.trim().length === 0) return "The first round title is required.";
  if (input.firstRubricTitle.trim().length === 0) return "The first rubric title is required.";
  if (input.firstCriterionTitle.trim().length === 0)
    return "The first criterion title is required.";
  if (!Number.isSafeInteger(input.roundCount) || input.roundCount < 1 || input.roundCount > 10) {
    return "Rounds must be a whole number between 1 and 10.";
  }
  return null;
}
