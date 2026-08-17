export type EvaluationErrorCode =
  | "EVALUATION_INVALID_INPUT"
  | "EVALUATION_FORBIDDEN"
  | "EVALUATION_NOT_FOUND"
  | "EVALUATION_CONFLICT"
  | "EVALUATION_CLOSED"
  | "EVALUATION_ADVISORY_UNAVAILABLE"
  | "EVALUATION_ADVISORY_UNSUPPORTED";

export class EvaluationError extends Error {
  readonly code: EvaluationErrorCode;
  readonly status: 400 | 403 | 404 | 409 | 503;

  constructor(code: EvaluationErrorCode, message: string, status: 400 | 403 | 404 | 409 | 503) {
    super(message);
    this.name = "EvaluationError";
    this.code = code;
    this.status = status;
  }
}

export function invalidInput(message: string): EvaluationError {
  return new EvaluationError("EVALUATION_INVALID_INPUT", message, 400);
}

export function forbidden(message = "Evaluation access is not allowed."): EvaluationError {
  return new EvaluationError("EVALUATION_FORBIDDEN", message, 403);
}

export function notFound(message: string): EvaluationError {
  return new EvaluationError("EVALUATION_NOT_FOUND", message, 404);
}

export function conflict(message: string): EvaluationError {
  return new EvaluationError("EVALUATION_CONFLICT", message, 409);
}

export function closed(message: string): EvaluationError {
  return new EvaluationError("EVALUATION_CLOSED", message, 409);
}

export function advisoryUnavailable(
  message = "Advisory evaluation is temporarily unavailable. Manual review remains available.",
): EvaluationError {
  return new EvaluationError("EVALUATION_ADVISORY_UNAVAILABLE", message, 503);
}

export function advisoryUnsupported(
  message = "AI suggestions require at least one scoreable rubric criterion.",
): EvaluationError {
  return new EvaluationError("EVALUATION_ADVISORY_UNSUPPORTED", message, 400);
}
