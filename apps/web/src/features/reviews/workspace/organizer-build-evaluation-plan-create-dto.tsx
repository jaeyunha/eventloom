import { planIdForCreation } from "./model-plan-id-for-creation";
import type { CreateEvaluationPlanFormInput } from "./organizer-create-evaluation-plan-form-input";

export function buildEvaluationPlanCreateDto(input: CreateEvaluationPlanFormInput) {
  const normalizedName = input.name.trim();
  const round = {
    id: "round-1",
    name: "Initial review",
    sequence: 1,
    opensAt: null,
    closesAt: null,
    blindReview: false,
    anonymization: "none" as const,
    rubric: {
      id: "rubric-1",
      name: "Evaluation rubric",
      criteria: [
        {
          id: "criterion-1-1",
          label: "Overall quality",
          description: "Describe the evidence reviewers should consider.",
          minimum: 1,
          maximum: 5,
          weight: 1,
          required: true,
          inputType: "numeric" as const,
        },
      ],
    },
  };
  return {
    id: planIdForCreation(input.eventId, normalizedName),
    eventId: input.eventId,
    name: normalizedName,
    blindReview: false,
    closesAt: null,
    assignmentRule: {
      reviewsPerSubmission: 1,
      maxAssignmentsPerReviewer: 5,
    },
    rounds: [round],
  };
}
