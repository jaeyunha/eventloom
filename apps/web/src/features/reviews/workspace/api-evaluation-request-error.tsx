export class EvaluationRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "EvaluationRequestError";
    this.status = status;
  }
}
