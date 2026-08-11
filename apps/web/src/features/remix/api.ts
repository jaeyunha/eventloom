export type RemixSourceType = "session" | "speaker";

export type RemixField = "title" | "description" | "tags" | "tracks" | "biography";

export const remixSessionFields = ["title", "description", "tags", "tracks"] as const;
export const remixSpeakerFields = ["biography"] as const;

export type RemixSessionField = (typeof remixSessionFields)[number];
export type RemixSpeakerField = (typeof remixSpeakerFields)[number];

export interface RemixSessionContent {
  title: string;
  description: string;
  tags: readonly string[];
  tracks: readonly string[];
}

export interface RemixSpeakerContent {
  biography: string;
}

export type RemixContent = RemixSessionContent | RemixSpeakerContent;

export interface RemixSessionRecord extends Omit<RemixSessionContent, "tags" | "tracks"> {
  kind: "session";
  id: string;
  eventId: string;
  revision: number;
  tags?: readonly string[];
  tracks?: readonly string[];
}

export interface RemixSpeakerRecord extends RemixSpeakerContent {
  kind: "speaker";
  id: string;
  eventId: string;
  revision: number;
}

export type RemixSourceRecord = RemixSessionRecord | RemixSpeakerRecord;

export interface RemixProvenance {
  provider: string;
  model: string;
  promptVersion: string;
  generatedAt: string;
  requestId?: string;
  metadata?: Readonly<Record<string, string>>;
}

export type RemixCandidateStatus = "pending" | "applied" | "rejected" | "stale";

export interface RemixCandidate {
  id: string;
  tenantId: string;
  eventId: string;
  sourceType: RemixSourceType;
  sourceId: string;
  sourceRevision: number;
  fields: readonly RemixField[];
  tone: string;
  guidance: string;
  original: RemixContent;
  candidate: RemixContent;
  changedFields: readonly RemixField[];
  changeSummary: string;
  provenance: RemixProvenance;
  status: RemixCandidateStatus;
  version: number;
  generation: number;
  parentCandidateId: string | null;
  createdAt: string;
  createdBy: string;
  appliedAt?: string;
  appliedBy?: string;
  appliedRevisionId?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  staleAt?: string;
  staleReason?: string;
}

export type RemixAuditAction =
  | "candidate.generated"
  | "candidate.regenerated"
  | "candidate.stale"
  | "candidate.rejected"
  | "candidate.applied";

export interface RemixAuditEntry {
  id: string;
  tenantId: string;
  eventId: string;
  candidateId: string;
  actorId: string;
  action: RemixAuditAction;
  createdAt: string;
  details: Readonly<Record<string, string | number | boolean>>;
}

export interface RemixRecordFilter {
  ids?: readonly string[];
  query?: string;
  tags?: readonly string[];
  tracks?: readonly string[];
}

export interface RemixCandidateFilter {
  status?: RemixCandidateStatus;
  sourceType?: RemixSourceType;
  sourceId?: string;
}

export interface RemixGenerateInput {
  eventId: string;
  sourceType: RemixSourceType;
  sourceIds: readonly string[];
  fields: readonly RemixField[];
  tone: string;
  guidance?: string;
}

export interface RemixRegenerateInput {
  eventId: string;
  candidateId: string;
  tone?: string;
  guidance?: string;
}

export interface RemixRejectInput {
  eventId: string;
  candidateId: string;
  reason?: string;
}

export interface RemixApplyInput {
  eventId: string;
  candidateId: string;
  expectedVersion?: number;
  content?: Readonly<Record<string, unknown>>;
}

export interface RemixApi {
  listRecords(input: {
    eventId: string;
    sourceType: RemixSourceType;
    filter?: RemixRecordFilter;
    signal?: AbortSignal;
  }): Promise<readonly RemixSourceRecord[]>;
  listCandidates(input: {
    eventId: string;
    filter?: RemixCandidateFilter;
    signal?: AbortSignal;
  }): Promise<readonly RemixCandidate[]>;
  getCandidate(input: {
    eventId: string;
    candidateId: string;
    signal?: AbortSignal;
  }): Promise<RemixCandidate>;
  listAudit(eventId: string, signal?: AbortSignal): Promise<readonly RemixAuditEntry[]>;
  generate(input: RemixGenerateInput): Promise<readonly RemixCandidate[]>;
  regenerate(input: RemixRegenerateInput): Promise<RemixCandidate>;
  reject(input: RemixRejectInput): Promise<RemixCandidate>;
  apply(input: RemixApplyInput): Promise<RemixContentRevision>;
}

export interface RemixContentRevision {
  id: string;
  tenantId: string;
  eventId: string;
  sourceType: RemixSourceType;
  sourceId: string;
  sourceRevision: number;
  fields: readonly RemixField[];
  content: RemixContent;
  candidateId: string;
  appliedBy: string;
  appliedAt: string;
}

export type RemixErrorCode =
  | "REMIX_DEPENDENCY_UNAVAILABLE"
  | "REMIX_INVALID_INPUT"
  | "REMIX_FORBIDDEN"
  | "REMIX_NOT_FOUND"
  | "REMIX_CONFLICT"
  | "REMIX_PROVIDER_FAILURE"
  | "REMIX_PROVIDER_INVALID_OUTPUT"
  | string;

export class RemixApiError extends Error {
  readonly code: RemixErrorCode;
  readonly status: number;
  readonly traceId: string | undefined;

  constructor(code: RemixErrorCode, message: string, status: number, traceId?: string) {
    super(message);
    this.name = "RemixApiError";
    this.code = code;
    this.status = status;
    this.traceId = traceId;
  }
}

export type RemixFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "");
}

function segment(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new TypeError(`${label} is required for remix requests.`);
  return encodeURIComponent(normalized);
}

function queryValues(values: readonly string[] | undefined): string | null {
  if (values === undefined || values.length === 0) return null;
  const normalized = values.map((value) => value.trim()).filter((value) => value.length > 0);
  return normalized.length === 0 ? null : normalized.join(",");
}

function queryForRecords(filter: RemixRecordFilter | undefined): string {
  const query = new URLSearchParams();
  if (filter?.ids !== undefined) {
    const value = queryValues(filter.ids);
    if (value !== null) query.set("ids", value);
  }
  if (filter?.query !== undefined && filter.query.trim().length > 0) {
    query.set("query", filter.query.trim());
  }
  if (filter?.tags !== undefined) {
    const value = queryValues(filter.tags);
    if (value !== null) query.set("tags", value);
  }
  if (filter?.tracks !== undefined) {
    const value = queryValues(filter.tracks);
    if (value !== null) query.set("tracks", value);
  }
  const encoded = query.toString();
  return encoded.length === 0 ? "" : `?${encoded}`;
}

function queryForCandidates(filter: RemixCandidateFilter | undefined): string {
  const query = new URLSearchParams();
  if (filter?.status !== undefined) query.set("status", filter.status);
  if (filter?.sourceType !== undefined) query.set("sourceType", filter.sourceType);
  if (filter?.sourceId !== undefined && filter.sourceId.trim().length > 0) {
    query.set("sourceId", filter.sourceId.trim());
  }
  const encoded = query.toString();
  return encoded.length === 0 ? "" : `?${encoded}`;
}

type ErrorPayload = {
  error?: {
    code?: unknown;
    message?: unknown;
    traceId?: unknown;
  };
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function toApiError(response: Response): Promise<RemixApiError> {
  const body = (await response.json().catch(() => undefined)) as ErrorPayload | undefined;
  const error = body?.error;
  return new RemixApiError(
    typeof error?.code === "string" ? error.code : "REMIX_REQUEST_FAILED",
    typeof error?.message === "string"
      ? error.message
      : "The remix request could not be completed.",
    response.status,
    typeof error?.traceId === "string" ? error.traceId : undefined,
  );
}

function unwrap<T>(body: unknown): T {
  if (isObject(body) && Object.hasOwn(body, "data")) {
    return body.data as T;
  }
  return body as T;
}

function collection<T>(body: unknown, key: string): readonly T[] {
  const value = unwrap<unknown>(body);
  if (Array.isArray(value)) return value as readonly T[];
  if (isObject(value) && Array.isArray(value[key])) return value[key] as readonly T[];
  throw new RemixApiError(
    "REMIX_INVALID_RESPONSE",
    `The remix response did not include ${key}.`,
    502,
  );
}

export function createRemixApi(
  baseUrl: string,
  organizationId: string,
  fetcher: RemixFetcher = fetch,
): RemixApi {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl.trim());
  if (normalizedBaseUrl.length === 0) throw new TypeError("A remix API base URL is required.");
  const organizationPath = segment(organizationId, "Organization id");

  function eventBase(eventId: string): string {
    return `${normalizedBaseUrl}/api/admin/organizations/${organizationPath}/events/${segment(eventId, "Event id")}/remix`;
  }

  async function request<T>(eventId: string, path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body !== undefined) headers.set("content-type", "application/json");
    const response = await fetcher(`${eventBase(eventId)}${path}`, {
      ...init,
      credentials: "include",
      headers,
      cache: "no-store",
    });
    if (!response.ok) throw await toApiError(response);
    if (response.status === 204) return undefined as T;
    return unwrap<T>(await response.json().catch(() => undefined));
  }

  return {
    async listRecords(input) {
      const path = `/records?sourceType=${encodeURIComponent(input.sourceType)}${queryForRecords(input.filter).replace("?", "&")}`;
      const body = await request<unknown>(input.eventId, path, {
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
      return collection<RemixSourceRecord>(body, "records");
    },

    async listCandidates(input) {
      const body = await request<unknown>(
        input.eventId,
        `/candidates${queryForCandidates(input.filter)}`,
        input.signal === undefined ? {} : { signal: input.signal },
      );
      return collection<RemixCandidate>(body, "candidates");
    },

    getCandidate(input) {
      return request<RemixCandidate>(
        input.eventId,
        `/candidates/${segment(input.candidateId, "Candidate id")}`,
        input.signal === undefined ? {} : { signal: input.signal },
      );
    },

    async listAudit(eventId, signal) {
      const body = await request<unknown>(
        eventId,
        "/audit",
        signal === undefined ? {} : { signal },
      );
      return collection<RemixAuditEntry>(body, "audit");
    },

    async generate(input) {
      const body = await request<unknown>(input.eventId, "/candidates", {
        method: "POST",
        body: JSON.stringify({
          sourceType: input.sourceType,
          sourceIds: input.sourceIds,
          fields: input.fields,
          tone: input.tone,
          ...(input.guidance === undefined ? {} : { guidance: input.guidance }),
        }),
      });
      return collection<RemixCandidate>(body, "candidates");
    },

    regenerate(input) {
      return request<RemixCandidate>(
        input.eventId,
        `/candidates/${segment(input.candidateId, "Candidate id")}/regenerate`,
        {
          method: "POST",
          body: JSON.stringify({
            ...(input.tone === undefined ? {} : { tone: input.tone }),
            ...(input.guidance === undefined ? {} : { guidance: input.guidance }),
          }),
        },
      );
    },

    reject(input) {
      return request<RemixCandidate>(
        input.eventId,
        `/candidates/${segment(input.candidateId, "Candidate id")}/reject`,
        {
          method: "POST",
          body: JSON.stringify({
            ...(input.reason === undefined ? {} : { reason: input.reason }),
          }),
        },
      );
    },

    apply(input) {
      return request<RemixContentRevision>(
        input.eventId,
        `/candidates/${segment(input.candidateId, "Candidate id")}/apply`,
        {
          method: "POST",
          body: JSON.stringify({
            ...(input.expectedVersion === undefined
              ? {}
              : { expectedVersion: input.expectedVersion }),
            ...(input.content === undefined ? {} : { content: input.content }),
          }),
        },
      );
    },
  } satisfies RemixApi;
}
