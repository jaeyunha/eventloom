import type {
  AgendaCalendarDeliveryState,
  AgendaEntryInput,
  AgendaErrorResponse,
  AgendaPlacementFailureData,
  AgendaPreview,
  AgendaRoom,
  AgendaTrack,
  AgendaValidationReport,
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
  readonly candidateDiagnostics: AgendaPlacementFailureData | undefined;

  constructor(
    code: string,
    message: string,
    status: number,
    traceId?: string,
    details?: AgendaApiErrorDetails,
    candidateDiagnostics?: AgendaPlacementFailureData,
  ) {
    super(message);
    this.name = "AgendaApiError";
    this.code = code;
    this.status = status;
    this.traceId = traceId;
    this.details = details;
    this.candidateDiagnostics = candidateDiagnostics;
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
  readonly candidateDiagnostics: AgendaValidationReport;
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
  createRoom(input: {
    eventId: string;
    name: string;
    capacity: number;
  }): Promise<{ resource: AgendaRoom; workspace: AgendaWorkspaceData }>;
  createTrack(input: {
    eventId: string;
    name: string;
  }): Promise<{ resource: AgendaTrack; workspace: AgendaWorkspaceData }>;
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
  getCalendarDelivery(eventId: string, signal?: AbortSignal): Promise<AgendaCalendarDeliveryState>;
  retryCalendarDelivery(input: {
    eventId: string;
    deliveryId: string;
  }): Promise<AgendaCalendarDeliveryState>;
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
function isAgendaValidationReport(value: unknown): value is AgendaValidationReport {
  return isRecord(value) && Array.isArray(value.conflicts) && Array.isArray(value.warnings);
}

function placementFailureData(
  candidateValue: unknown,
  authoritativePreview: unknown,
): AgendaPlacementFailureData | undefined {
  if (
    !isRecord(candidateValue) ||
    typeof candidateValue.evaluated !== "boolean" ||
    (candidateValue.report !== null && !isAgendaValidationReport(candidateValue.report)) ||
    !isRecord(authoritativePreview)
  ) {
    return undefined;
  }
  return {
    evaluated: candidateValue.evaluated,
    report: candidateValue.report === null ? null : candidateValue.report,
    authoritativeSavedPreview: authoritativePreview as unknown as AgendaPreview,
  };
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
  const data = isRecord(rawBody) && isRecord(rawBody.data) ? rawBody.data : undefined;
  const candidateDiagnostics = placementFailureData(
    data?.candidateDiagnostics,
    data?.authoritativeSavedPreview,
  );
  return new AgendaApiError(
    typeof error.code === "string" ? error.code : "AGENDA_REQUEST_FAILED",
    typeof error.message === "string"
      ? error.message
      : "The agenda request could not be completed.",
    response.status,
    typeof error.traceId === "string" ? error.traceId : undefined,
    normalizedErrorDetails(error.details),
    candidateDiagnostics,
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
    if (response.status === 204) {
      return undefined as T;
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
  type AgendaIntegrationsResponse = {
    readonly delivery: {
      readonly calendar: AgendaCalendarDeliveryState;
    };
  };

  async function loadCalendarDelivery(
    eventId: string,
    signal?: AbortSignal,
  ): Promise<AgendaCalendarDeliveryState> {
    const snapshot = await request<AgendaIntegrationsResponse>(
      `/${segment(eventId)}/integrations`,
      {
        cache: "no-store",
        ...(signal === undefined ? {} : { signal }),
      },
    );
    return snapshot.delivery.calendar;
  }

  async function loadCreatedRoom(
    eventId: string,
    roomId: string,
  ): Promise<{ resource: AgendaRoom; workspace: AgendaWorkspaceData }> {
    const workspace = await loadWorkspace(eventId);
    const resource = workspace.rooms.find((room) => room.id === roomId);
    if (!resource) {
      throw new Error("The created room was not present in the authoritative agenda workspace.");
    }
    return { resource, workspace };
  }

  async function loadCreatedTrack(
    eventId: string,
    trackId: string,
  ): Promise<{ resource: AgendaTrack; workspace: AgendaWorkspaceData }> {
    const workspace = await loadWorkspace(eventId);
    const resource = workspace.tracks.find((track) => track.id === trackId);
    if (!resource) {
      throw new Error("The created track was not present in the authoritative agenda workspace.");
    }
    return { resource, workspace };
  }

  async function createRoom(input: {
    eventId: string;
    name: string;
    capacity: number;
  }): Promise<{ resource: AgendaRoom; workspace: AgendaWorkspaceData }> {
    const created = await request<AgendaRoom>(`/${segment(input.eventId)}/sessions/rooms`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: input.name, capacity: input.capacity }),
    });
    return loadCreatedRoom(input.eventId, created.id);
  }

  async function createTrack(input: {
    eventId: string;
    name: string;
  }): Promise<{ resource: AgendaTrack; workspace: AgendaWorkspaceData }> {
    const created = await request<AgendaTrack>(`/${segment(input.eventId)}/sessions/tracks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: input.name }),
    });
    return loadCreatedTrack(input.eventId, created.id);
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
    startDisambiguation?: "earlier" | "later";
    endDisambiguation?: "earlier" | "later";
  };

  function draftEntryPayload(entry: AgendaWorkspaceEntry): AgendaDraftEntryPayload {
    return {
      id: entry.id,
      sessionId: entry.sessionId,
      roomId: entry.roomId,
      trackIds: entry.trackIds,
      startsAtLocal: entry.startsAtLocal,
      endsAtLocal: entry.endsAtLocal,
      ...(entry.startDisambiguation === undefined
        ? {}
        : { startDisambiguation: entry.startDisambiguation }),
      ...(entry.endDisambiguation === undefined
        ? {}
        : { endDisambiguation: entry.endDisambiguation }),
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
      ...(entry.startDisambiguation === undefined
        ? {}
        : { startDisambiguation: entry.startDisambiguation }),
      ...(entry.endDisambiguation === undefined
        ? {}
        : { endDisambiguation: entry.endDisambiguation }),
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
          workspace.draft.entries.reduce<AgendaDraftEntryPayload[]>((entries, entry) => {
            if (entry.id !== input.entryId) {
              entries.push(draftEntryPayload(entry));
            }
            return entries;
          }, []),
        ),
      );
    },
    createRoom,
    createTrack,
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
    getCalendarDelivery(eventId, signal) {
      return loadCalendarDelivery(eventId, signal);
    },
    retryCalendarDelivery(input) {
      return request<void>(
        `/${segment(input.eventId)}/integrations/calendar/deliveries/${segment(input.deliveryId)}/retry`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        },
      ).then(() => loadCalendarDelivery(input.eventId));
    },
  };
}
