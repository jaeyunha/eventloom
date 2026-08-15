export interface CreateEvaluationPlanFormInput {
  readonly eventId: string;
  readonly name: string;
  readonly roundCount: number;
  readonly firstRoundTitle: string;
  readonly firstRubricTitle: string;
  readonly firstCriterionTitle: string;
  readonly blindReview: boolean;
}
