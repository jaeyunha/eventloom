import {
  OrganizerResultsExportApiError,
  type OrganizerResultsExportRun,
} from "./organizer-results-export-model";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`The organizer results export response is missing ${field}.`);
  }
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`The organizer results export response contains an invalid ${field}.`);
  }
  return value;
}

function optionalNonNegativeInteger(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`The organizer results export response contains an invalid ${field}.`);
  }
  return value as number;
}

export function parseOrganizerResultsExportRun(value: unknown): OrganizerResultsExportRun {
  if (!isRecord(value)) {
    throw new TypeError("The organizer results export response is invalid.");
  }

  const base = {
    id: requiredString(value.id, "id"),
    fileName: requiredString(value.fileName, "fileName"),
    createdAt: requiredString(value.createdAt, "createdAt"),
  };

  switch (value.status) {
    case "queued":
      return { ...base, status: "queued" };
    case "running": {
      const startedAt = optionalString(value.startedAt, "startedAt");
      return {
        ...base,
        status: "running",
        ...(startedAt === undefined ? {} : { startedAt }),
      };
    }
    case "ready": {
      const startedAt = optionalString(value.startedAt, "startedAt");
      const rowCount = optionalNonNegativeInteger(value.rowCount, "rowCount");
      return {
        ...base,
        status: "ready",
        ...(startedAt === undefined ? {} : { startedAt }),
        completedAt: requiredString(value.completedAt, "completedAt"),
        downloadUrl: requiredString(value.downloadUrl, "downloadUrl"),
        ...(rowCount === undefined ? {} : { rowCount }),
      };
    }
    case "failed": {
      if (!isRecord(value.error)) {
        throw new TypeError("The organizer results export response is missing error details.");
      }
      if (typeof value.error.retryable !== "boolean") {
        throw new TypeError(
          "The organizer results export response contains an invalid error.retryable.",
        );
      }
      const startedAt = optionalString(value.startedAt, "startedAt");
      return {
        ...base,
        status: "failed",
        ...(startedAt === undefined ? {} : { startedAt }),
        completedAt: requiredString(value.completedAt, "completedAt"),
        error: {
          code: requiredString(value.error.code, "error.code"),
          message: requiredString(value.error.message, "error.message"),
          retryable: value.error.retryable,
        },
      };
    }
    default:
      throw new TypeError("The organizer results export response contains an invalid status.");
  }
}

export function envelopeOrganizerResultsExportData(value: unknown): unknown {
  return isRecord(value) && "data" in value ? value.data : value;
}

export async function parseOrganizerResultsExportApiError(
  response: Response,
): Promise<OrganizerResultsExportApiError> {
  const body = (await response.json().catch(() => undefined)) as unknown;
  const error = isRecord(body) && isRecord(body.error) ? body.error : undefined;
  return new OrganizerResultsExportApiError({
    code:
      typeof error?.code === "string" && error.code.trim().length > 0
        ? error.code
        : "EVALUATION_EXPORT_REQUEST_FAILED",
    message:
      typeof error?.message === "string" && error.message.trim().length > 0
        ? error.message
        : `The organizer results export request failed with status ${response.status}.`,
    status: response.status,
    retryable: typeof error?.retryable === "boolean" ? error.retryable : response.status >= 500,
    ...(typeof error?.traceId === "string" ? { traceId: error.traceId } : {}),
    details: error?.details,
  });
}
