import type { Context } from "hono";

export const publicApiErrorCodes = [
  "AUTHENTICATION_REQUIRED",
  "ACCESS_DENIED",
  "TENANT_SCOPE_VIOLATION",
  "NOT_FOUND",
  "VALIDATION_FAILED",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "IDEMPOTENCY_CONFLICT",
  "RATE_LIMITED",
  "INTEGRATION_UNAVAILABLE",
  "CONFIGURATION_ERROR",
  "INTERNAL_ERROR",
] as const;

export type PublicApiErrorCode = (typeof publicApiErrorCodes)[number];

export interface PublicApiValidationIssue {
  readonly path: readonly (string | number)[];
  readonly code: string;
  readonly message: string;
}

export interface PublicApiErrorBody {
  readonly error: {
    readonly code: PublicApiErrorCode;
    readonly message: string;
    readonly traceId: string;
    readonly details?: readonly PublicApiValidationIssue[];
  };
}

const statuses: Readonly<Record<PublicApiErrorCode, 400 | 401 | 403 | 404 | 409 | 412 | 429 | 500 | 503>> = {
  AUTHENTICATION_REQUIRED: 401,
  ACCESS_DENIED: 403,
  TENANT_SCOPE_VIOLATION: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 400,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  IDEMPOTENCY_CONFLICT: 409,
  RATE_LIMITED: 429,
  INTEGRATION_UNAVAILABLE: 503,
  CONFIGURATION_ERROR: 503,
  INTERNAL_ERROR: 500,
};

export class PublicApiError extends Error {
  readonly code: PublicApiErrorCode;
  readonly status: (typeof statuses)[PublicApiErrorCode];
  readonly details?: readonly PublicApiValidationIssue[];

  constructor(
    code: PublicApiErrorCode,
    message: string,
    options?: {
      readonly status?: (typeof statuses)[PublicApiErrorCode];
      readonly details?: readonly PublicApiValidationIssue[];
      readonly cause?: unknown;
    },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "PublicApiError";
    this.code = code;
    this.status = options?.status ?? statuses[code];
    if (options?.details !== undefined) {
      this.details = options.details;
    }
  }
}

export function isPublicApiError(error: unknown): error is PublicApiError {
  return error instanceof PublicApiError;
}

export function traceIdFor(context: Pick<Context, "get" | "req">): string {
  const contextTraceId = context.get("traceId" as never) as unknown;
  if (typeof contextTraceId === "string" && contextTraceId.length > 0) {
    return contextTraceId;
  }

  const requestTraceId = context.req.header("x-request-id");
  if (requestTraceId !== undefined && requestTraceId.trim().length > 0) {
    return requestTraceId.trim();
  }

  return crypto.randomUUID();
}

export function publicApiErrorBody(
  error: PublicApiError,
  traceId: string,
): PublicApiErrorBody {
  const details = error.details;
  if (details === undefined) {
    return {
      error: {
        code: error.code,
        message: error.message,
        traceId,
      },
    };
  }
  return {
    error: {
      code: error.code,
      message: error.message,
      traceId,
      details,
    },
  };
}

export function publicApiErrorResponse(
  context: Pick<Context, "get" | "json" | "req">,
  error: PublicApiError,
): Response {
  return context.json(publicApiErrorBody(error, traceIdFor(context)), error.status);
}

export function validationError(
  message = "The request is invalid.",
  details?: readonly PublicApiValidationIssue[],
): PublicApiError {
  return details === undefined
    ? new PublicApiError("VALIDATION_FAILED", message)
    : new PublicApiError("VALIDATION_FAILED", message, { details });
}

export function internalError(): PublicApiError {
  return new PublicApiError("INTERNAL_ERROR", "The request could not be completed.");
}
