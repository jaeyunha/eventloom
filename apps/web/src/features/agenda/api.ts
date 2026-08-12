import type {
  AgendaEntryInput,
  AgendaErrorResponse,
  AgendaPreview,
  AgendaWorkspaceData,
} from "./types";

export interface AgendaValidationIssue {
  readonly path: readonly (string | number)[];
  readonly code: string;
  readonly message: string;
}

type LegacyAgendaErrorDetails = NonNullable<AgendaErrorResponse["error"]>["details"];
export type AgendaApiErrorDetails = readonly AgendaValidationIssue[] | LegacyAgendaErrorDetails;
export class AgendaApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly traceId: string | undefined;
  readonly details: AgendaApiErrorDetails | undefined;

  constructor(
    code: string,
    message: string,
    status: number,
    traceId?: string,
    details?: AgendaApiErrorDetails,
  ) {
    super(message);
    this.name = "AgendaApiError";
    this.code = code;
    this.status = status;
    this.traceId = traceId;
    this.details = details;
  }
}
export type AgendaSuggestionChangeKind = "add" | "move" | "change" | "remove";

export interface AgendaSuggestionChange {
  readonly id: string;
  readonly kind: AgendaSuggestionChangeKind;
  readonly entryId: string;
  readonly sessionId: string;
  readonly summary: string;
}

export interface AgendaSuggestionRun {
  readonly id: string;
  readonly version: number;
  readonly status: "pending" | "rejected" | "superseded" | "applied" | "stale";
  readonly baseDraftVersion: number;
  readonly diff: {
    readonly summary: string;
    readonly changes: readonly AgendaSuggestionChange[];
  };
  readonly validation: {
    readonly conflicts: readonly {
      readonly id: string;
      readonly kind: string;
      readonly message: string;
    }[];
  };
  readonly acceptedChangeIds: readonly string[];
}

export type AgendaSuggestionRule = string | Readonly<Record<string, unknown>>;

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
  publish(input: { eventId: string; expectedVersion: number }): Promise<AgendaWorkspaceData>;
  generateSuggestion(input: {
    eventId: string;
    baseDraftVersion: number;
    dates: readonly string[];
    eligibleStatuses: readonly string[];
    roomIds: readonly string[];
    dayWindows: readonly {
      date: string;
      startLocal: string;
      endLocal: string;
    }[];
    orderedRules: readonly AgendaSuggestionRule[];
    ignoreExistingTimes: boolean;
    ignoreExistingRooms: boolean;
  }): Promise<AgendaSuggestionRun>;
  regenerateSuggestion(input: {
    eventId: string;
    runId: string;
    baseDraftVersion: number;
  }): Promise<AgendaSuggestionRun>;
  rejectSuggestion(input: { eventId: string; runId: string }): Promise<AgendaSuggestionRun>;
  applySuggestion(input: {
    eventId: string;
    runId: string;
    acceptedChangeIds: readonly string[];
  }): Promise<AgendaWorkspaceData>;
  getSuggestion(input: { eventId: string; runId: string }): Promise<AgendaSuggestionRun>;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function baseWithoutTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function segment(value: string): string {
  return encodeURIComponent(value);
}
function unwrapData<T>(body: unknown): T {
  return isRecord(body) && Object.hasOwn(body, "data") ? (body.data as T) : (body as T);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidationIssue(value: unknown): value is AgendaValidationIssue {
  if (!isRecord(value) || !Array.isArray(value.path)) return false;
  return (
    value.path.every((segment) => typeof segment === "string" || typeof segment === "number") &&
    typeof value.code === "string" &&
    value.code.trim().length > 0 &&
    typeof value.message === "string" &&
    value.message.trim().length > 0
  );
}

function normalizedErrorDetails(value: unknown): AgendaApiErrorDetails | undefined {
  if (Array.isArray(value)) {
    return value.filter(isValidationIssue);
  }
  return isRecord(value) ? (value as LegacyAgendaErrorDetails) : undefined;
}

async function apiError(response: Response): Promise<AgendaApiError> {
  const rawBody = await response.json().catch(() => undefined);
  const error =
    isRecord(rawBody) && isRecord(rawBody.error) ? rawBody.error : ({} as Record<string, unknown>);
  return new AgendaApiError(
    typeof error.code === "string" ? error.code : "AGENDA_REQUEST_FAILED",
    typeof error.message === "string"
      ? error.message
      : "The agenda request could not be completed.",
    response.status,
    typeof error.traceId === "string" ? error.traceId : undefined,
    normalizedErrorDetails(error.details),
  );
}

export function createAgendaApi(
  baseUrl: string,
  organizationId: string,
  fetcher: Fetcher = fetch,
): AgendaApi {
  const normalizedOrganizationId = organizationId.trim();
  if (normalizedOrganizationId.length === 0) {
    throw new TypeError("An organization ID is required for agenda requests.");
  }
  const apiBase = `${baseWithoutTrailingSlash(baseUrl)}/api/admin/organizations/${segment(normalizedOrganizationId)}/events`;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetcher(`${apiBase}${path}`, {
      ...init,
      credentials: "include",
      cache: init?.cache ?? "no-store",
      headers: {
        accept: "application/json",
        ...init?.headers,
      },
    });
    if (!response.ok) {
      throw await apiError(response);
    }
    const body: unknown = await response.json();
    return unwrapData<T>(body);
  }
  async function loadWorkspace(
    eventId: string,
    signal?: AbortSignal,
  ): Promise<AgendaWorkspaceData> {
    return request<AgendaWorkspaceData>(`/${segment(eventId)}/agenda`, {
      cache: "no-store",
      ...(signal === undefined ? {} : { signal }),
    });
  }
  type AgendaDraftResponse = {
    readonly eventId: string;
    readonly version: number;
  };
  type AgendaWorkspaceEntry = AgendaWorkspaceData["draft"]["entries"][number];
  type AgendaDraftEntryPayload = {
    id: string;
    sessionId: string;
    roomId: string;
    trackIds: readonly string[];
    startsAtLocal: string;
    endsAtLocal: string;
  };

  function draftEntryPayload(entry: AgendaWorkspaceEntry): AgendaDraftEntryPayload {
    return {
      id: entry.id,
      sessionId: entry.sessionId,
      roomId: entry.roomId,
      trackIds: entry.trackIds,
      startsAtLocal: entry.startsAtLocal,
      endsAtLocal: entry.endsAtLocal,
    };
  }

  function inputEntryPayload(entry: AgendaEntryInput): AgendaDraftEntryPayload {
    return {
      id: entry.id ?? `entry_${entry.sessionId}`,
      sessionId: entry.sessionId,
      roomId: entry.roomId,
      trackIds: entry.trackIds,
      startsAtLocal: entry.startsAtLocal,
      endsAtLocal: entry.endsAtLocal,
    };
  }

  function nextDraftEntries(
    workspace: AgendaWorkspaceData,
    entry: AgendaEntryInput,
  ): readonly AgendaDraftEntryPayload[] {
    const currentEntries = workspace.draft.entries.map(draftEntryPayload);
    const nextEntry = inputEntryPayload(entry);
    const existingIndex = currentEntries.findIndex((candidate) => candidate.id === nextEntry.id);
    if (existingIndex < 0) {
      return [...currentEntries, nextEntry];
    }
    return currentEntries.map((candidate, index) =>
      index === existingIndex ? nextEntry : candidate,
    );
  }

  async function updateDraft(
    eventId: string,
    expectedVersion: number,
    entries: readonly AgendaDraftEntryPayload[],
  ): Promise<AgendaWorkspaceData> {
    const draft = await request<AgendaDraftResponse>(`/${segment(eventId)}/agenda/draft`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion, entries }),
    });
    if (draft.eventId !== eventId || draft.version < expectedVersion) {
      throw new Error("The agenda draft mutation returned an invalid revision.");
    }
    return loadWorkspace(eventId);
  }
  return {
    getWorkspace(eventId, signal) {
      return loadWorkspace(eventId, signal);
    },

    saveEntry(input) {
      return loadWorkspace(input.eventId).then((workspace) =>
        updateDraft(input.eventId, input.expectedVersion, nextDraftEntries(workspace, input.entry)),
      );
    },
    removeEntry(input) {
      return loadWorkspace(input.eventId).then((workspace) =>
        updateDraft(
          input.eventId,
          input.expectedVersion,
          workspace.draft.entries
            .filter((entry) => entry.id !== input.entryId)
            .map(draftEntryPayload),
        ),
      );
    },
    preview(eventId) {
      return request<AgendaPreview>(`/${segment(eventId)}/agenda/preview`, { method: "GET" });
    },
    overrideWarning(input) {
      return request<unknown>(
        `/${segment(input.eventId)}/agenda/warnings/${segment(input.warningId)}/override`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            expectedVersion: input.expectedVersion,
            reason: input.reason,
          }),
        },
      ).then(() => loadWorkspace(input.eventId));
    },
    publish(input) {
      return request<unknown>(`/${segment(input.eventId)}/agenda/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: input.expectedVersion }),
      }).then(() => loadWorkspace(input.eventId));
    },
    generateSuggestion(input) {
      return request<AgendaSuggestionRun>(`/${segment(input.eventId)}/agenda/suggestions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseDraftVersion: input.baseDraftVersion,
          dates: input.dates,
          eligibleStatuses: input.eligibleStatuses,
          roomIds: input.roomIds,
          dayWindows: input.dayWindows,
          orderedRules: input.orderedRules,
          ignoreExistingTimes: input.ignoreExistingTimes,
          ignoreExistingRooms: input.ignoreExistingRooms,
        }),
      });
    },
    regenerateSuggestion(input) {
      return request<AgendaSuggestionRun>(
        `/${segment(input.eventId)}/agenda/suggestions/${segment(input.runId)}/regenerate`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ baseDraftVersion: input.baseDraftVersion }),
        },
      );
    },
    rejectSuggestion(input) {
      return request<AgendaSuggestionRun>(
        `/${segment(input.eventId)}/agenda/suggestions/${segment(input.runId)}/reject`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
        },
      );
    },
    applySuggestion(input) {
      return request<unknown>(
        `/${segment(input.eventId)}/agenda/suggestions/${segment(input.runId)}/apply`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ acceptedChangeIds: input.acceptedChangeIds }),
        },
      ).then(() => loadWorkspace(input.eventId));
    },
    getSuggestion(input) {
      return request<AgendaSuggestionRun>(
        `/${segment(input.eventId)}/agenda/suggestions/${segment(input.runId)}`,
      );
    },
  };
}
