import type {
  AgendaEntryInput,
  AgendaErrorResponse,
  AgendaPreview,
  AgendaWorkspaceData,
} from "./types";

export class AgendaApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly traceId: string | undefined;
  readonly details: NonNullable<AgendaErrorResponse["error"]>["details"];

  constructor(
    code: string,
    message: string,
    status: number,
    traceId?: string,
    details?: NonNullable<AgendaErrorResponse["error"]>["details"],
  ) {
    super(message);
    this.name = "AgendaApiError";
    this.code = code;
    this.status = status;
    this.traceId = traceId;
    this.details = details;
  }
}

export interface AgendaApi {
  getWorkspace(eventId: string, signal?: AbortSignal): Promise<AgendaWorkspaceData>;
  saveEntry(input: {
    eventId: string;
    expectedVersion: number;
    entry: AgendaEntryInput;
  }): Promise<AgendaWorkspaceData>;
  removeEntry(input: {
    eventId: string;
    entryId: string;
    expectedVersion: number;
  }): Promise<AgendaWorkspaceData>;
  preview(eventId: string): Promise<AgendaPreview>;
  overrideWarning(input: {
    eventId: string;
    expectedVersion: number;
    warningId: string;
    reason: string;
  }): Promise<AgendaWorkspaceData>;
  publish(input: {
    eventId: string;
    expectedVersion: number;
  }): Promise<AgendaWorkspaceData>;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function baseWithoutTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

async function apiError(response: Response): Promise<AgendaApiError> {
  const body = (await response.json().catch(() => undefined)) as AgendaErrorResponse | undefined;
  return new AgendaApiError(
    body?.error?.code ?? "AGENDA_REQUEST_FAILED",
    body?.error?.message ?? "The agenda request could not be completed.",
    response.status,
    body?.error?.traceId,
    body?.error?.details,
  );
}

export function createAgendaApi(baseUrl: string, fetcher: Fetcher = fetch): AgendaApi {
  const apiBase = `${baseWithoutTrailingSlash(baseUrl)}/api/admin/events`;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetcher(`${apiBase}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        accept: "application/json",
        ...init?.headers,
      },
    });
    if (!response.ok) {
      throw await apiError(response);
    }
    const body = (await response.json()) as { data: T };
    return body.data;
  }

  return {
    getWorkspace(eventId, signal) {
      return request<AgendaWorkspaceData>(
        `/${segment(eventId)}/agenda`,
        signal === undefined ? undefined : { signal },
      );
    },
    saveEntry(input) {
      return request<AgendaWorkspaceData>(`/${segment(input.eventId)}/agenda/draft/entries`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: input.expectedVersion, entry: input.entry }),
      });
    },
    removeEntry(input) {
      return request<AgendaWorkspaceData>(
        `/${segment(input.eventId)}/agenda/draft/entries/${segment(input.entryId)}`,
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ expectedVersion: input.expectedVersion }),
        },
      );
    },
    preview(eventId) {
      return request<AgendaPreview>(`/${segment(eventId)}/agenda/preview`, { method: "POST" });
    },
    overrideWarning(input) {
      return request<AgendaWorkspaceData>(
        `/${segment(input.eventId)}/agenda/warnings/${segment(input.warningId)}/override`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            expectedVersion: input.expectedVersion,
            reason: input.reason,
          }),
        },
      );
    },
    publish(input) {
      return request<AgendaWorkspaceData>(`/${segment(input.eventId)}/agenda/publications`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: input.expectedVersion }),
      });
    },
  };
}
