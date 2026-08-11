export type ReportFormat = "csv" | "xlsx";

export type ReportRelationship = "sessions" | "participants" | "speakers" | "evaluationProgress";

export type ReportFilterOperator =
  | "eq"
  | "neq"
  | "contains"
  | "startsWith"
  | "endsWith"
  | "in"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "isNull"
  | "isNotNull";

export interface ReportFilter {
  readonly field: string;
  readonly operator: ReportFilterOperator;
  readonly value?: unknown;
}

export interface ReportSort {
  readonly field: string;
  readonly direction: "asc" | "desc";
}

export interface ReportDefinition {
  readonly id: string;
  readonly tenantId?: string;
  readonly eventId: string;
  readonly name: string;
  readonly description: string;
  readonly relationships: readonly ReportRelationship[];
  readonly fields: readonly string[];
  readonly order: readonly string[];
  readonly filters: readonly ReportFilter[];
  readonly sort: readonly ReportSort[];
  readonly version: number;
  readonly createdBy?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ReportDefinitionInput {
  readonly name: string;
  readonly description?: string;
  readonly relationships: readonly ReportRelationship[];
  readonly fields: readonly string[];
  readonly order: readonly string[];
  readonly filters: readonly ReportFilter[];
  readonly sort: readonly ReportSort[];
}

export interface ReportRunParameters {
  readonly format: ReportFormat;
  readonly expectedVersion: number;
  readonly definitionId: string;
  readonly definitionVersion: number;
  readonly requestedFilters: readonly ReportFilter[];
  readonly requestedSort: readonly ReportSort[];
  readonly runParameters?: Readonly<Record<string, unknown>>;
  readonly evaluationPlanId?: string;
  readonly evaluationPlanVersion?: number;
}

export interface ReportExport {
  readonly format: ReportFormat;
  readonly fileName: string;
  readonly contentType: string;
  readonly body: string;
  readonly content?: string;
  readonly columns: readonly string[];
  readonly rowCount: number;
  readonly outputDigest: string;
}

export interface ReportRunAudit {
  readonly requesterId: string;
  readonly tenantId: string;
  readonly eventId: string;
  readonly definitionId: string;
  readonly definitionVersion: number;
  readonly parameters: ReportRunParameters;
  readonly requestedAt: string;
  readonly completedAt: string;
  readonly outputDigest: string;
  readonly rowCount: number;
}

export interface ReportRun {
  readonly id: string;
  readonly tenantId?: string;
  readonly eventId: string;
  readonly definitionId: string;
  readonly definitionVersion: number;
  readonly requesterId: string;
  readonly parameters: ReportRunParameters;
  readonly requestedAt: string;
  readonly completedAt: string;
  readonly export: ReportExport;
  readonly output?: ReportExport;
  readonly audit: ReportRunAudit;
}

export interface ReportDownload {
  readonly body: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly runId?: string;
}

export class ReportApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly traceId: string | undefined;

  constructor(code: string, message: string, status: number, traceId?: string) {
    super(message);
    this.name = "ReportApiError";
    this.code = code;
    this.status = status;
    this.traceId = traceId;
  }
}
export { ReportApiError as ReportsApiError };

export interface ReportsApi {
  listDefinitions(signal?: AbortSignal): Promise<readonly ReportDefinition[]>;
  createDefinition(input: ReportDefinitionInput): Promise<ReportDefinition>;
  updateDefinition(
    definitionId: string,
    input: ReportDefinitionInput & { readonly expectedVersion: number },
  ): Promise<ReportDefinition>;
  deleteDefinition(definitionId: string, expectedVersion: number): Promise<void>;
  runDefinition(
    definitionId: string,
    input: {
      readonly format: ReportFormat;
      readonly expectedVersion: number;
      readonly parameters?: Readonly<Record<string, unknown>>;
      readonly evaluationPlanId?: string;
      readonly evaluationPlanVersion?: number;
    },
  ): Promise<ReportRun>;
  getRun(runId: string): Promise<ReportRun>;
  listRuns(): Promise<readonly ReportRun[]>;
  download(runId: string): Promise<ReportDownload>;
}
export type ReportApi = ReportsApi;

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "");
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

interface ApiErrorBody {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly traceId?: string;
  };
}

async function toApiError(response: Response): Promise<ReportApiError> {
  const body = (await response.json().catch(() => undefined)) as ApiErrorBody | undefined;
  return new ReportApiError(
    body?.error?.code ?? "REPORT_REQUEST_FAILED",
    body?.error?.message ?? "The report request could not be completed.",
    response.status,
    body?.error?.traceId,
  );
}
function invalidResponse(resource: string): ReportApiError {
  return new ReportApiError(
    "REPORT_INVALID_RESPONSE",
    `The reports API returned an invalid ${resource} response. Refresh the page and try again.`,
    502,
  );
}

function responseRecord<T>(body: unknown, resource: string): T {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw invalidResponse(resource);
  }
  return body as T;
}

function responseList<T>(body: unknown, key: string): readonly T[] {
  const value =
    typeof body === "object" && body !== null && key in body
      ? (body as Record<string, unknown>)[key]
      : body;
  if (!Array.isArray(value) || value.some((item) => item === null || typeof item !== "object")) {
    throw invalidResponse(key);
  }
  return value as readonly T[];
}

function unwrap<T>(body: unknown): T {
  if (
    typeof body === "object" &&
    body !== null &&
    "data" in body &&
    (body as { data?: unknown }).data !== undefined
  ) {
    return (body as { data: T }).data;
  }
  return body as T;
}

function withJsonHeaders(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return { ...init, credentials: "include", headers, cache: "no-store" };
}

function parseFileName(value: string | null): string {
  if (value === null) return "report-export";
  const match = /filename="?([^";]+)"?/iu.exec(value);
  return match?.[1]?.trim() || "report-export";
}

export function createReportsApi(
  baseUrl: string,
  organizationId: string,
  eventId: string,
  fetcher: Fetcher = fetch,
): ReportsApi {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl);
  const normalizedOrganizationId = organizationId.trim();
  const normalizedEventId = eventId.trim();
  if (normalizedOrganizationId.length === 0) {
    throw new TypeError("An organization ID is required for report requests.");
  }
  if (normalizedEventId.length === 0) {
    throw new TypeError("An event ID is required for report requests.");
  }
  const reportsBaseUrl = `${normalizedBaseUrl}/api/admin/organizations/${segment(normalizedOrganizationId)}/events/${segment(normalizedEventId)}/reports`;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetcher(`${reportsBaseUrl}${path}`, withJsonHeaders(init));
    if (!response.ok) throw await toApiError(response);
    if (response.status === 204) return undefined as T;
    return unwrap<T>(await response.json());
  }

  return {
    listDefinitions(signal) {
      return request<unknown>("", {
        ...(signal === undefined ? {} : { signal }),
      }).then((body) => responseList<ReportDefinition>(body, "definitions"));
    },
    createDefinition(input) {
      return request<unknown>("", {
        method: "POST",
        body: JSON.stringify(input),
      }).then((body) => responseRecord<ReportDefinition>(body, "definition"));
    },
    updateDefinition(definitionId, input) {
      return request<unknown>(`/${segment(definitionId)}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }).then((body) => responseRecord<ReportDefinition>(body, "definition"));
    },
    deleteDefinition(definitionId, expectedVersion) {
      return request<void>(
        `/${segment(definitionId)}?expectedVersion=${encodeURIComponent(String(expectedVersion))}`,
        {
          method: "DELETE",
        },
      );
    },
    runDefinition(definitionId, input) {
      return request<unknown>(`/${segment(definitionId)}/runs`, {
        method: "POST",
        body: JSON.stringify(input),
      }).then((body) => responseRecord<ReportRun>(body, "report run"));
    },
    getRun(runId) {
      return request<unknown>(`/runs/${segment(runId)}`).then((body) =>
        responseRecord<ReportRun>(body, "report run"),
      );
    },
    listRuns() {
      return request<unknown>(`/runs?eventId=${encodeURIComponent(normalizedEventId)}`).then(
        (body) => responseList<ReportRun>(body, "runs"),
      );
    },
    async download(runId) {
      const response = await fetcher(
        `${reportsBaseUrl}/runs/${segment(runId)}/download`,
        withJsonHeaders({}),
      );
      if (!response.ok) throw await toApiError(response);
      const runIdHeader = response.headers.get("x-report-run-id");
      return {
        body: await response.text(),
        fileName: parseFileName(response.headers.get("content-disposition")),
        contentType: response.headers.get("content-type") ?? "application/octet-stream",
        ...(runIdHeader === null ? {} : { runId: runIdHeader }),
      };
    },
  };
}
export const createReportApi = createReportsApi;
