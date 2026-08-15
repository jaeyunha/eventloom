import { planIdForCreation } from "./model-plan-id-for-creation";
import type { CreateEvaluationPlanFormInput } from "./organizer-create-evaluation-plan-form-input";

export function buildEvaluationPlanCreateDto(input: CreateEvaluationPlanFormInput) {
  const normalizedName = input.name.trim();
  const normalizedRoundTitle = input.firstRoundTitle.trim();
  const normalizedRubricTitle = input.firstRubricTitle.trim();
  const normalizedCriterionTitle = input.firstCriterionTitle.trim();
  const rounds = Array.from({ length: input.roundCount }, (_, index) => {
    const sequence = index + 1;
    const suffix = sequence === 1 ? "" : ` ${sequence}`;
    return {
      id: `round-${sequence}`,
      name: `${normalizedRoundTitle}${suffix}`,
      sequence,
      opensAt: null,
      closesAt: null,
      blindReview: input.blindReview,
      anonymization: input.blindReview ? ("double" as const) : ("none" as const),
      rubric: {
        id: `rubric-${sequence}`,
        name: `${normalizedRubricTitle}${suffix}`,
        criteria: [
          {
            id: `criterion-${sequence}-1`,
            label: `${normalizedCriterionTitle}${suffix}`,
            description: "Describe the evidence reviewers should consider.",
            minimum: 1,
            maximum: 5,
            weight: 1,
            required: true,
          },
        ],
      },
    };
  });
  return {
    id: planIdForCreation(input.eventId, normalizedName),
    eventId: input.eventId,
    name: normalizedName,
    blindReview: input.blindReview,
    closesAt: null,
    assignmentRule: {
      reviewsPerSubmission: 1,
      maxAssignmentsPerReviewer: 5,
    },
    rounds,
  };
}
