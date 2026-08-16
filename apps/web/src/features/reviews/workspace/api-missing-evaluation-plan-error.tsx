export class MissingEvaluationPlanError extends Error {
  constructor() {
    super("No evaluation plan is configured for this event.");
    this.name = "MissingEvaluationPlanError";
  }
}
