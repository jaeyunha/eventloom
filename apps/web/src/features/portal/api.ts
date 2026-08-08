import type {
  PortalErrorResponse,
  PortalProfile,
  PortalTask,
  PortalTaskStatus,
  PortalUploadAuthorization,
  PortalView,
} from "./types";

export class PortalApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly traceId: string | undefined;

  constructor(code: string, message: string, status: number, traceId?: string) {
    super(message);
    this.name = "PortalApiError";
    this.code = code;
    this.status = status;
    this.traceId = traceId;
  }
}

export interface PortalApi {
  getPortal(eventId: string, signal?: AbortSignal): Promise<PortalView>;
  updateBiography(input: {
    eventId: string;
    participantId: string;
    biography: string;
    expectedVersion: number;
  }): Promise<PortalProfile>;
  transitionTask(input: {
    eventId: string;
    taskId: string;
    toStatus: PortalTaskStatus;
    expectedVersion: number;
    note?: string;
  }): Promise<PortalTask>;
  uploadTaskFile(input: {
    eventId: string;
    participantId: string;
    taskId: string;
    kind: "headshot" | "slides" | "supporting_file";
    file: File;
  }): Promise<{ assetId: string }>;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function removeTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function routeSegment(value: string): string {
  return encodeURIComponent(value);
}

async function errorFrom(response: Response): Promise<PortalApiError> {
  const body = (await response.json().catch(() => undefined)) as PortalErrorResponse | undefined;
  return new PortalApiError(
    body?.error?.code ?? "PORTAL_REQUEST_FAILED",
    body?.error?.message ?? "The speaker portal request could not be completed.",
    response.status,
    body?.error?.traceId,
  );
}

export function createPortalApi(baseUrl: string, fetcher: Fetcher = fetch): PortalApi {
  const speakerBaseUrl = `${removeTrailingSlash(baseUrl)}/api/speaker`;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetcher(`${speakerBaseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        accept: "application/json",
        ...init?.headers,
      },
    });
    if (!response.ok) {
      throw await errorFrom(response);
    }
    const body = (await response.json()) as { data: T };
    return body.data;
  }

  return {
    getPortal(eventId, signal) {
      return request<PortalView>(
        `/events/${routeSegment(eventId)}/portal`,
        signal === undefined ? undefined : { signal },
      );
    },

    updateBiography(input) {
      return request<PortalProfile>(
        `/events/${routeSegment(input.eventId)}/profiles/${routeSegment(input.participantId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            biography: input.biography,
            expectedVersion: input.expectedVersion,
          }),
        },
      );
    },

    async transitionTask(input) {
      const data = await request<{ task: PortalTask }>(
        `/events/${routeSegment(input.eventId)}/tasks/${routeSegment(input.taskId)}/transitions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            toStatus: input.toStatus,
            expectedVersion: input.expectedVersion,
            ...(input.note === undefined ? {} : { note: input.note }),
          }),
        },
      );
      return data.task;
    },

    async uploadTaskFile(input) {
      const authorization = await request<PortalUploadAuthorization>(
        `/events/${routeSegment(input.eventId)}/uploads`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            participantId: input.participantId,
            taskId: input.taskId,
            kind: input.kind,
            fileName: input.file.name,
            contentType: input.file.type || "application/octet-stream",
            sizeBytes: input.file.size,
          }),
        },
      );
      const upload = await fetcher(authorization.grant.url, {
        method: authorization.grant.method,
        credentials: "omit",
        headers: authorization.grant.headers,
        body: input.file,
      });
      if (!upload.ok) {
        throw new PortalApiError(
          "UPLOAD_FAILED",
          "The file could not be uploaded. Try again.",
          upload.status,
        );
      }
      return { assetId: authorization.asset.id };
    },
  };
}
