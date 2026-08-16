export type AirtableConnectionState =
  | "disconnected"
  | "authorizing"
  | "connected"
  | "paused"
  | "reauthorization_required";

export type AirtableProjectionHealth = "healthy" | "degraded" | "failed";

export type AirtableConflictResolution = "use_d1" | "use_airtable" | "manual";

export type AirtableConflictResolutionInput =
  | { readonly resolution: "use_d1" }
  | { readonly resolution: "use_airtable" }
  | {
      readonly resolution: "manual";
      readonly manualValue: { readonly valueJson: string };
    };

export type AirtableSyncDirection = "to_airtable" | "from_airtable" | "bidirectional";

export interface AirtableTableMapping {
  readonly tableId: string;
  readonly tableName: string;
  readonly localResource: string;
  readonly keyField: string;
  readonly syncDirection: AirtableSyncDirection;
}

export interface AirtableBaseMapping {
  readonly baseId: string;
  readonly baseName: string;
  readonly tableMappings: readonly AirtableTableMapping[];
}

export interface AirtableProjectionFailure {
  readonly projectionId: string;
  readonly summary: string;
  readonly occurredAt: string;
  readonly retryable: boolean;
}

export interface AirtableProjectionStatus {
  readonly health: AirtableProjectionHealth;
  readonly lastProjectedAt: string | null;
  readonly projectedLast24Hours: number;
  readonly failedLast24Hours: number;
  readonly lastFailure: AirtableProjectionFailure | null;
}

export interface AirtableConflict {
  readonly id: string;
  readonly resource: string;
  readonly recordId: string;
  readonly localUpdatedAt: string;
  readonly remoteUpdatedAt: string;
  readonly summary: string;
  readonly resolution: AirtableConflictResolution | null;
}

export interface AirtableIntegrationSnapshot {
  readonly state: AirtableConnectionState;
  readonly baseMapping: AirtableBaseMapping | null;
  readonly projection: AirtableProjectionStatus;
  readonly conflicts: readonly AirtableConflict[];
}

export class AirtableIntegrationApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly traceId: string | undefined;

  constructor(code: string, message: string, status: number, traceId?: string) {
    super(message);
    this.name = "AirtableIntegrationApiError";
    this.code = code;
    this.status = status;
    this.traceId = traceId;
  }
}

export interface AirtableIntegrationApi {
  getSnapshot(organizationId: string, signal?: AbortSignal): Promise<AirtableIntegrationSnapshot>;
  startOAuth(organizationId: string): Promise<{ readonly authorizationUrl: string }>;
  pause(organizationId: string): Promise<void>;
  resume(organizationId: string): Promise<void>;
  disconnect(organizationId: string): Promise<void>;
  retry(organizationId: string): Promise<void>;
  resolveConflict(
    organizationId: string,
    conflictId: string,
    input: AirtableConflictResolutionInput,
  ): Promise<void>;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

async function toApiError(response: Response): Promise<AirtableIntegrationApiError> {
  const body = (await response.json().catch(() => undefined)) as
    | {
        readonly error?: {
          readonly code?: string;
          readonly message?: string;
          readonly traceId?: string;
        };
      }
    | undefined;
  return new AirtableIntegrationApiError(
    body?.error?.code ?? "AIRTABLE_REQUEST_FAILED",
    body?.error?.message ?? "The Airtable request could not be completed.",
    response.status,
    body?.error?.traceId,
  );
}

const AIRTABLE_STATUS_INVALID_CODE = "AIRTABLE_INVALID_RESPONSE";
const AIRTABLE_STATUS_INVALID_MESSAGE =
  "The Airtable integration API returned an invalid status response.";
const AIRTABLE_STATUS_INVALID_STATUS = 502;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAirtableConnectionState(value: unknown): value is AirtableConnectionState {
  return (
    value === "disconnected" ||
    value === "authorizing" ||
    value === "connected" ||
    value === "paused" ||
    value === "reauthorization_required"
  );
}

function isAirtableSyncDirection(value: unknown): value is AirtableSyncDirection {
  return value === "to_airtable" || value === "from_airtable" || value === "bidirectional";
}

function isAirtableConflictResolution(value: unknown): value is AirtableConflictResolution {
  return value === "use_d1" || value === "use_airtable" || value === "manual";
}

function isAirtableProjectionHealth(value: unknown): value is AirtableProjectionHealth {
  return value === "healthy" || value === "degraded" || value === "failed";
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isAirtableTableMapping(value: unknown): value is AirtableTableMapping {
  return (
    isRecord(value) &&
    typeof value.tableId === "string" &&
    typeof value.tableName === "string" &&
    typeof value.localResource === "string" &&
    typeof value.keyField === "string" &&
    isAirtableSyncDirection(value.syncDirection)
  );
}

function isAirtableBaseMapping(value: unknown): value is AirtableBaseMapping {
  return (
    isRecord(value) &&
    typeof value.baseId === "string" &&
    typeof value.baseName === "string" &&
    Array.isArray(value.tableMappings) &&
    value.tableMappings.every(isAirtableTableMapping)
  );
}

function isAirtableProjectionFailure(value: unknown): value is AirtableProjectionFailure {
  return (
    isRecord(value) &&
    typeof value.projectionId === "string" &&
    typeof value.summary === "string" &&
    typeof value.occurredAt === "string" &&
    typeof value.retryable === "boolean"
  );
}

function isAirtableProjectionStatus(value: unknown): value is AirtableProjectionStatus {
  return (
    isRecord(value) &&
    isAirtableProjectionHealth(value.health) &&
    (value.lastProjectedAt === null || typeof value.lastProjectedAt === "string") &&
    isNonNegativeInteger(value.projectedLast24Hours) &&
    isNonNegativeInteger(value.failedLast24Hours) &&
    (value.lastFailure === null || isAirtableProjectionFailure(value.lastFailure))
  );
}

function isAirtableConflict(value: unknown): value is AirtableConflict {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.resource === "string" &&
    typeof value.recordId === "string" &&
    typeof value.localUpdatedAt === "string" &&
    typeof value.remoteUpdatedAt === "string" &&
    typeof value.summary === "string" &&
    (value.resolution === null || isAirtableConflictResolution(value.resolution))
  );
}

function isAirtableIntegrationSnapshot(value: unknown): value is AirtableIntegrationSnapshot {
  return (
    isRecord(value) &&
    isAirtableConnectionState(value.state) &&
    (value.baseMapping === null || isAirtableBaseMapping(value.baseMapping)) &&
    isAirtableProjectionStatus(value.projection) &&
    Array.isArray(value.conflicts) &&
    value.conflicts.every(isAirtableConflict)
  );
}

function disconnectedAirtableSnapshot(): AirtableIntegrationSnapshot {
  return {
    state: "disconnected",
    baseMapping: null,
    projection: {
      health: "healthy",
      lastProjectedAt: null,
      projectedLast24Hours: 0,
      failedLast24Hours: 0,
      lastFailure: null,
    },
    conflicts: [],
  };
}

function invalidAirtableStatusResponse(): AirtableIntegrationApiError {
  return new AirtableIntegrationApiError(
    AIRTABLE_STATUS_INVALID_CODE,
    AIRTABLE_STATUS_INVALID_MESSAGE,
    AIRTABLE_STATUS_INVALID_STATUS,
  );
}

function parseAirtableIntegrationSnapshot(value: unknown): AirtableIntegrationSnapshot {
  if (
    isRecord(value) &&
    Object.keys(value).length === 2 &&
    value.state === "disconnected" &&
    value.baseId === null
  ) {
    return disconnectedAirtableSnapshot();
  }
  if (!isAirtableIntegrationSnapshot(value)) {
    throw invalidAirtableStatusResponse();
  }
  return value;
}

function idempotencyKey(): string {
  return `web-${crypto.randomUUID()}`;
}

export function createAirtableIntegrationApi(
  baseUrl: string,
  fetcher: Fetcher = fetch,
): AirtableIntegrationApi {
  const adminBaseUrl = `${trimTrailingSlash(baseUrl)}/api/admin/organizations`;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body !== undefined) {
      headers.set("content-type", "application/json");
    }
    const response = await fetcher(`${adminBaseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers,
    });
    if (!response.ok) {
      throw await toApiError(response);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    const body = (await response.json()) as { data: T };
    return body.data;
  }

  function airtablePath(organizationId: string): string {
    return `/${segment(organizationId)}/integrations/airtable`;
  }

  return {
    async getSnapshot(organizationId, signal) {
      const status = await request<unknown>(`${airtablePath(organizationId)}/status`, {
        cache: "no-store",
        ...(signal === undefined ? {} : { signal }),
      });
      return parseAirtableIntegrationSnapshot(status);
    },
    startOAuth(organizationId) {
      return request<{ readonly authorizationUrl: string }>(
        `${airtablePath(organizationId)}/oauth/start`,
        {
          method: "POST",
          headers: { "idempotency-key": idempotencyKey() },
          body: JSON.stringify({}),
        },
      );
    },
    pause(organizationId) {
      return request<void>(`${airtablePath(organizationId)}/pause`, {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey() },
        body: JSON.stringify({}),
      });
    },
    resume(organizationId) {
      return request<void>(`${airtablePath(organizationId)}/resume`, {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey() },
        body: JSON.stringify({}),
      });
    },
    disconnect(organizationId) {
      return request<void>(`${airtablePath(organizationId)}/connection`, {
        method: "DELETE",
        headers: { "idempotency-key": idempotencyKey() },
      });
    },
    retry(organizationId) {
      return request<void>(`${airtablePath(organizationId)}/retry`, {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey() },
        body: JSON.stringify({}),
      });
    },
    resolveConflict(organizationId, conflictId, input) {
      return request<void>(
        `${airtablePath(organizationId)}/conflicts/${segment(conflictId)}/resolve`,
        {
          method: "POST",
          headers: { "idempotency-key": idempotencyKey() },
          body: JSON.stringify(input),
        },
      );
    },
  };
}
