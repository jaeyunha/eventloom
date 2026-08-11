export const deliverableTaskStatuses = [
  "not_started",
  "in_progress",
  "submitted",
  "needs_changes",
  "completed",
  "waived",
  "overdue",
  "reopened",
] as const;
export const deliverablesExportStatuses = [
  "all",
  "incomplete",
  "pending",
  "uploaded",
  ...deliverableTaskStatuses,
] as const;

export type DeliverableExportStatus = (typeof deliverablesExportStatuses)[number];

export type DeliverableTaskStatus = (typeof deliverableTaskStatuses)[number];
export type DeliverableTaskType = "form" | "upload" | "action";
export type DeliverableAssetKind = "headshot" | "slides" | "supporting_file";
export const deliverableAssetKinds = ["headshot", "slides", "supporting_file"] as const;
export type DeliverableAssetState = "pending_upload" | "ready" | "rejected";
export type DeliverableReviewState = "approved" | "needs_changes";

export interface DeliverableSessionHistoryEntry {
  readonly id: string;
  readonly action: "created" | "updated" | "deleted" | "restored" | "approved" | "needs_changes";
  readonly version: number;
  readonly actorId: string;
  readonly actorLabel?: string;
  readonly occurredAt: string;
  readonly title?: string;
  readonly description?: string;
}

export interface DeliverableSession {
  readonly id: string;
  readonly eventId: string;
  readonly title: string;
  readonly description: string;
  readonly status: string;
  readonly contentStatus?: string;
  readonly durationMinutes: number;
  readonly speakerIds: readonly string[];
  readonly speakerRoster: readonly {
    readonly id: string;
    readonly role?: string;
  }[];
  readonly version: number;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly updatedBy?: string;
  readonly history?: readonly DeliverableSessionHistoryEntry[];
  readonly contentHistory?: readonly DeliverableContentHistoryEntry[];
}

export interface DeliverableTask {
  readonly id: string;
  readonly eventId: string;
  readonly submissionId: string;
  readonly participantId: string;
  readonly participantName?: string;
  readonly sessionTitle?: string;
  readonly type: DeliverableTaskType;
  readonly owner: "speaker" | "organizer";
  readonly title: string;
  readonly description?: string;
  readonly status: DeliverableTaskStatus;
  readonly dueAt?: string;
  readonly dependencyIds: readonly string[];
  readonly reminderOffsetsMinutes: readonly number[];
  readonly acceptedAssetKinds?: readonly DeliverableAssetKind[];
  readonly allowedMimeTypes?: readonly string[];
  readonly maxSizeBytes?: number;
  readonly assigneeIds?: readonly string[];
  readonly version: number;
  readonly updatedAt: string;
}
/**
 * Server-derived organizer task matrix status. The UI must not reconstruct
 * `pending` or `uploaded` from task and asset projections.
 */
export type DeliverableMatrixStatus = DeliverableTaskStatus | "pending" | "uploaded";
export type DeliverableMatrixFilterStatus = DeliverableMatrixStatus | "incomplete" | "all";

export interface DeliverableMatrixQuery {
  readonly participantId?: string;
  readonly taskId?: string;
  readonly status?: DeliverableMatrixFilterStatus;
  readonly signal?: AbortSignal;
}

export interface DeliverableMatrixFilters {
  readonly participantId?: string;
  readonly taskId?: string;
  readonly status?: DeliverableMatrixFilterStatus;
}

export interface DeliverableMatrixItem {
  readonly task: DeliverableTask;
  readonly participantId: string;
  readonly participantName?: string;
  readonly assets: readonly DeliverableAsset[];
  readonly currentAsset?: DeliverableAsset;
  readonly status: DeliverableMatrixStatus;
}

export interface DeliverableTaskMatrix {
  readonly organizationId: string;
  readonly eventId: string;
  readonly total: number;
  readonly filters: DeliverableMatrixFilters;
  readonly items: readonly DeliverableMatrixItem[];
}

export type DeliverablesMatrix = DeliverableTaskMatrix;

/** Public asset projection. Server-owned object keys are deliberately not modeled. */
export interface DeliverableAsset {
  readonly id: string;
  readonly eventId: string;
  readonly submissionId?: string;
  readonly sessionTitle?: string;
  readonly participantName?: string;
  readonly participantId: string;
  readonly taskId?: string;
  readonly kind: DeliverableAssetKind;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly state: DeliverableAssetState;
  readonly createdAt: string;
  readonly version?: number;
  readonly versionFamilyId?: string;
  readonly supersedesAssetId?: string;
  readonly commentThreadId?: string;
  readonly rejectionReason?: string;
  readonly finalizedAt?: string;
  readonly reviewState?: DeliverableReviewState;
  readonly reviewNote?: string;
  readonly reviewVersion?: number;
  readonly reviewedAt?: string;
  readonly reviewedBy?: string;
}

export interface DeliverableComment {
  readonly id: string;
  readonly eventId?: string;
  readonly assetId: string;
  readonly body: string;
  readonly authorLabel: string;
  readonly createdAt: string;
  readonly updatedAt?: string;
  readonly version?: number;
}

export type DeliverableAssetHistoryEntry = DeliverableAsset;

export interface DeliverableDownloadGrant {
  readonly method?: "GET";
  readonly url: string;
  readonly expiresAt: string;
}
export interface DeliverableExportInput {
  readonly assetIds?: readonly string[];
  readonly taskIds?: readonly string[];
  readonly participantIds?: readonly string[];
  readonly status?: DeliverableExportStatus;
}

export interface DeliverableExportDownload {
  readonly body: ArrayBuffer;
  readonly fileName: string;
  readonly contentType: "application/zip";
  readonly sizeBytes: number;
}

export interface DeliverableSpeakerProfile {
  readonly id: string;
  readonly eventId: string;
  readonly participantId: string;
  readonly displayName: string;
  readonly biography: string;
  readonly jobTitle?: string;
  readonly company?: string;
  readonly status?: string;
  readonly email?: string;
  readonly socialLinks?: Readonly<Record<string, string>>;
  readonly social?: Readonly<Record<string, string>>;
  readonly travelLogistics?: {
    readonly travelRequired: boolean;
    readonly arrivalAt: string | null;
    readonly departureAt: string | null;
    readonly origin?: string | null;
    readonly destination?: string | null;
  };
  readonly headshotAssetId?: string;
  readonly version: number;
  readonly updatedAt: string;
}

export interface DeliverableContentHistoryEntry {
  readonly id: string;
  readonly action?: "created" | "updated" | "restored" | "approved" | "needs_changes";
  readonly version: number;
  readonly actorId: string;
  readonly actorLabel?: string;
  readonly occurredAt: string;
  readonly title?: string;
  readonly description?: string;
}

export interface DeliverableTaskInput {
  readonly title: string;
  readonly description: string;
  readonly dueAt: string;
  readonly allowedMimeTypes: readonly string[];
  readonly maxSizeBytes: number;
  readonly assigneeIds: readonly string[];
  readonly acceptedAssetKinds: readonly DeliverableAssetKind[];
}
export interface DeliverableHeadshotReplacementInput {
  readonly participantId: string;
  readonly file: File;
  readonly expectedVersion: number;
  readonly supersedesAssetId?: string;
}

export interface DeliverableHeadshotReplacement {
  readonly asset: DeliverableAsset;
  readonly profile: DeliverableSpeakerProfile;
}

export interface DeliverableReviewInput {
  readonly assetId: string;
  readonly state: DeliverableReviewState;
  readonly note?: string;
}

export interface DeliverablesApi {
  listSessions(signal?: AbortSignal): Promise<readonly DeliverableSession[]>;
  getSession(sessionId: string, signal?: AbortSignal): Promise<DeliverableSession>;
  updateSession(input: {
    readonly sessionId: string;
    readonly expectedVersion: number;
    readonly title?: string;
    readonly description?: string;
    readonly contentStatus?: "Approved" | "Needs changes";
  }): Promise<DeliverableSession>;
  listSessionContentHistory?(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<readonly DeliverableContentHistoryEntry[]>;
  /** Server-derived organizer task/status/current-asset matrix. */
  listDeliverableMatrix?(options?: DeliverableMatrixQuery): Promise<DeliverableTaskMatrix>;

  listTasks?(signal?: AbortSignal): Promise<readonly DeliverableTask[]>;
  listAssets?(options?: {
    readonly participantId?: string;
    readonly versionFamilyId?: string;
    readonly signal?: AbortSignal;
  }): Promise<readonly DeliverableAsset[]>;
  getAssetHistory?(
    assetId: string,
    signal?: AbortSignal,
  ): Promise<readonly DeliverableAssetHistoryEntry[]>;
  listAssetComments?(assetId: string, signal?: AbortSignal): Promise<readonly DeliverableComment[]>;
  addAssetComment?(input: {
    readonly assetId: string;
    readonly body: string;
    readonly expectedVersion?: number;
  }): Promise<DeliverableComment>;
  getDownloadGrant?(assetId: string): Promise<DeliverableDownloadGrant>;
  listProfiles?(signal?: AbortSignal): Promise<readonly DeliverableSpeakerProfile[]>;
  exportDeliverables?(input: DeliverableExportInput): Promise<DeliverableExportDownload>;
  updateBiography?(input: {
    readonly participantId: string;
    readonly biography: string;
    readonly expectedVersion: number;
  }): Promise<DeliverableSpeakerProfile>;

  replaceHeadshot?(
    input: DeliverableHeadshotReplacementInput,
  ): Promise<DeliverableHeadshotReplacement>;
  /** Optional until an organizer task-management endpoint is provisioned. */
  createTask?(input: DeliverableTaskInput): Promise<DeliverableTask>;
  /** Optional until the transactional reminder endpoint is provisioned. */
  sendBulkReminder?(input: {
    readonly taskIds: readonly string[];
    readonly recipientIds: readonly string[];
  }): Promise<{
    readonly sentCount: number;
    readonly recipientIds: readonly string[];
  }>;
  /** Optional until content restore is supported by the session API. */
  restoreSessionVersion?(input: {
    readonly sessionId: string;
    readonly version: number;
    readonly expectedVersion: number;
  }): Promise<DeliverableSession>;
  /** Optional until organizer asset review is supported by the private asset API. */
  reviewAsset?(input: DeliverableReviewInput): Promise<DeliverableAsset>;
}

export type DeliverableApi = DeliverablesApi;

export interface DeliverablesErrorBody {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly traceId?: string;
  };
}

export class DeliverablesApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly traceId: string | undefined;

  constructor(code: string, message: string, status: number, traceId?: string) {
    super(message);
    this.name = "DeliverablesApiError";
    this.code = code;
    this.status = status;
    this.traceId = traceId;
  }
}
export { DeliverablesApiError as DeliverableApiError };

export type DeliverablesFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type JsonRecord = Record<string, unknown>;
function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringRecord(value: unknown): Readonly<Record<string, string>> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "");
}

function segment(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0)
    throw new TypeError(`An ${field} is required for deliverables requests.`);
  return encodeURIComponent(normalized);
}

function unwrap<T>(body: unknown): T {
  if (isRecord(body) && "data" in body) {
    return body.data as T;
  }
  return body as T;
}

function responseCollection<T>(body: unknown, key: string): readonly T[] {
  const value = unwrap<unknown>(body);
  if (Array.isArray(value)) return value as readonly T[];
  if (!isRecord(value)) return [];
  const collection = value[key];
  return Array.isArray(collection) ? (collection as readonly T[]) : [];
}

async function errorFrom(response: Response): Promise<DeliverablesApiError> {
  const body = (await response.json().catch(() => undefined)) as DeliverablesErrorBody | undefined;
  return new DeliverablesApiError(
    body?.error?.code ?? "DELIVERABLES_REQUEST_FAILED",
    body?.error?.message ?? "The deliverables request could not be completed.",
    response.status,
    body?.error?.traceId,
  );
}

function publicAsset(value: unknown): DeliverableAsset {
  const candidate = isRecord(value) ? value : {};
  const reviewState =
    candidate.reviewState === "approved" || candidate.reviewState === "needs_changes"
      ? candidate.reviewState
      : candidate.reviewStatus === "approved" || candidate.reviewStatus === "needs_changes"
        ? candidate.reviewStatus
        : undefined;
  return {
    id: typeof candidate.id === "string" ? candidate.id : "",
    eventId: typeof candidate.eventId === "string" ? candidate.eventId : "",
    participantId: typeof candidate.participantId === "string" ? candidate.participantId : "",
    kind: candidate.kind as DeliverableAssetKind,
    fileName: typeof candidate.fileName === "string" ? candidate.fileName : "",
    contentType: typeof candidate.contentType === "string" ? candidate.contentType : "",
    sizeBytes: typeof candidate.sizeBytes === "number" ? candidate.sizeBytes : 0,
    state: candidate.state as DeliverableAssetState,
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : "",
    ...(typeof candidate.submissionId === "string" ? { submissionId: candidate.submissionId } : {}),
    ...(typeof candidate.sessionTitle === "string" ? { sessionTitle: candidate.sessionTitle } : {}),
    ...(typeof candidate.participantName === "string"
      ? { participantName: candidate.participantName }
      : {}),
    ...(typeof candidate.taskId === "string" ? { taskId: candidate.taskId } : {}),
    ...(typeof candidate.version === "number" ? { version: candidate.version } : {}),
    ...(typeof candidate.versionFamilyId === "string"
      ? { versionFamilyId: candidate.versionFamilyId }
      : {}),
    ...(typeof candidate.supersedesAssetId === "string"
      ? { supersedesAssetId: candidate.supersedesAssetId }
      : {}),
    ...(typeof candidate.commentThreadId === "string"
      ? { commentThreadId: candidate.commentThreadId }
      : {}),
    ...(typeof candidate.rejectionReason === "string"
      ? { rejectionReason: candidate.rejectionReason }
      : {}),
    ...(typeof candidate.finalizedAt === "string" ? { finalizedAt: candidate.finalizedAt } : {}),
    ...(reviewState === undefined ? {} : { reviewState }),
    ...(typeof candidate.reviewNote === "string" ? { reviewNote: candidate.reviewNote } : {}),
    ...(typeof candidate.reviewVersion === "number"
      ? { reviewVersion: candidate.reviewVersion }
      : {}),
    ...(typeof candidate.reviewedAt === "string" ? { reviewedAt: candidate.reviewedAt } : {}),
    ...(typeof candidate.reviewedBy === "string" ? { reviewedBy: candidate.reviewedBy } : {}),
  };
}
interface DeliverableUploadAuthorization {
  readonly asset: DeliverableAsset;
  readonly grant: {
    readonly method: "PUT";
    readonly url: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly expiresAt: string;
  };
}

function normalizeUploadAuthorization(value: unknown): DeliverableUploadAuthorization {
  const candidate = isRecord(value) ? value : {};
  const rawAsset = candidate.asset;
  const rawGrant = isRecord(candidate.grant) ? candidate.grant : {};
  const rawHeaders = isRecord(rawGrant.headers) ? rawGrant.headers : {};
  const headers: Record<string, string> = {};
  for (const [key, headerValue] of Object.entries(rawHeaders)) {
    if (typeof headerValue === "string") headers[key] = headerValue;
  }
  if (
    !isRecord(rawAsset) ||
    rawGrant.method !== "PUT" ||
    typeof rawGrant.url !== "string" ||
    rawGrant.url.trim().length === 0 ||
    typeof rawGrant.expiresAt !== "string"
  ) {
    throw new DeliverablesApiError(
      "UPLOAD_AUTHORIZATION_INVALID",
      "The organizer headshot upload authorization was invalid.",
      502,
    );
  }
  return {
    asset: publicAsset(rawAsset),
    grant: {
      method: "PUT",
      url: rawGrant.url,
      headers,
      expiresAt: rawGrant.expiresAt,
    },
  };
}

function normalizeSession(value: unknown): DeliverableSession {
  if (!isRecord(value)) return value as DeliverableSession;
  const contentStatus =
    typeof value.contentStatus === "string"
      ? value.contentStatus
      : typeof value.reviewStatus === "string"
        ? value.reviewStatus
        : typeof value.approvalStatus === "string"
          ? value.approvalStatus
          : typeof value.status === "string" &&
              /^(?:approved|needs[\s_-]+changes)$/iu.test(value.status)
            ? value.status
            : undefined;
  const contentHistory = Array.isArray(value.contentHistory)
    ? value.contentHistory.map(normalizeContentHistory)
    : undefined;
  return {
    ...value,
    ...(contentStatus === undefined ? {} : { contentStatus }),
    ...(contentHistory === undefined ? {} : { contentHistory }),
  } as unknown as DeliverableSession;
}
function normalizeContentHistory(value: unknown): DeliverableContentHistoryEntry {
  const candidate = isRecord(value) ? value : {};
  const snapshot = isRecord(candidate.snapshot) ? candidate.snapshot : {};
  const text = (source: JsonRecord, key: string): string | undefined =>
    typeof source[key] === "string" ? source[key] : undefined;
  const actorId =
    text(candidate, "actorId") ??
    text(candidate, "actorAccountId") ??
    text(candidate, "actorLabel") ??
    "";
  const actorLabel = text(candidate, "actorLabel");
  const title = text(candidate, "title") ?? text(snapshot, "title");
  const description =
    text(candidate, "description") ??
    text(candidate, "abstract") ??
    text(snapshot, "description") ??
    text(snapshot, "abstract");
  const action = text(candidate, "action");
  return {
    id: text(candidate, "id") ?? `${actorId}:${String(candidate.version ?? "")}`,
    version: typeof candidate.version === "number" ? candidate.version : 0,
    actorId,
    ...(actorLabel === undefined ? {} : { actorLabel }),
    occurredAt: text(candidate, "occurredAt") ?? "",
    ...(action === "created" ||
    action === "updated" ||
    action === "restored" ||
    action === "approved" ||
    action === "needs_changes"
      ? { action }
      : {}),
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
  };
}

function normalizeTask(value: unknown): DeliverableTask {
  return value as DeliverableTask;
}
function normalizeMatrixItem(value: unknown): DeliverableMatrixItem {
  if (
    !isRecord(value) ||
    !isRecord(value.task) ||
    !Array.isArray(value.assets) ||
    typeof value.participantId !== "string" ||
    typeof value.status !== "string" ||
    !(deliverableTaskStatuses as readonly string[])
      .concat(["pending", "uploaded"])
      .includes(value.status)
  ) {
    throw new DeliverablesApiError(
      "DELIVERABLES_MATRIX_INVALID_RESPONSE",
      "The organizer deliverables matrix item was invalid.",
      200,
    );
  }
  const currentAsset = isRecord(value.currentAsset) ? publicAsset(value.currentAsset) : undefined;
  return {
    task: normalizeTask(value.task),
    participantId: value.participantId,
    ...(typeof value.participantName === "string"
      ? { participantName: value.participantName }
      : {}),
    assets: value.assets.map(publicAsset),
    ...(currentAsset === undefined ? {} : { currentAsset }),
    status: value.status as DeliverableMatrixStatus,
  };
}

function normalizeMatrix(value: unknown): DeliverableTaskMatrix {
  if (
    !isRecord(value) ||
    typeof value.organizationId !== "string" ||
    typeof value.eventId !== "string" ||
    typeof value.total !== "number" ||
    !Number.isInteger(value.total) ||
    value.total < 0 ||
    !Array.isArray(value.items)
  ) {
    throw new DeliverablesApiError(
      "DELIVERABLES_MATRIX_INVALID_RESPONSE",
      "The organizer deliverables matrix response was invalid.",
      200,
    );
  }
  const rawFilters = isRecord(value.filters) ? value.filters : {};
  const status =
    typeof rawFilters.status === "string" &&
    (deliverableTaskStatuses as readonly string[])
      .concat(["pending", "uploaded", "incomplete", "all"])
      .includes(rawFilters.status)
      ? (rawFilters.status as DeliverableMatrixFilterStatus)
      : undefined;
  return {
    organizationId: value.organizationId,
    eventId: value.eventId,
    total: value.total,
    filters: {
      ...(typeof rawFilters.participantId === "string"
        ? { participantId: rawFilters.participantId }
        : {}),
      ...(typeof rawFilters.taskId === "string" ? { taskId: rawFilters.taskId } : {}),
      ...(status === undefined ? {} : { status }),
    },
    items: value.items.map(normalizeMatrixItem),
  };
}

function normalizeProfile(value: unknown): DeliverableSpeakerProfile {
  const candidate = isRecord(value) ? value : {};
  const socialLinks = stringRecord(candidate.socialLinks);
  const social = stringRecord(candidate.social);
  const travel = isRecord(candidate.travelLogistics) ? candidate.travelLogistics : undefined;
  return {
    id: typeof candidate.id === "string" ? candidate.id : "",
    eventId: typeof candidate.eventId === "string" ? candidate.eventId : "",
    participantId: typeof candidate.participantId === "string" ? candidate.participantId : "",
    displayName: typeof candidate.displayName === "string" ? candidate.displayName : "",
    biography: typeof candidate.biography === "string" ? candidate.biography : "",
    ...(typeof candidate.jobTitle === "string" ? { jobTitle: candidate.jobTitle } : {}),
    ...(typeof candidate.company === "string" ? { company: candidate.company } : {}),
    ...(typeof candidate.status === "string" ? { status: candidate.status } : {}),
    ...(typeof candidate.email === "string" ? { email: candidate.email } : {}),
    ...(socialLinks === undefined ? {} : { socialLinks }),
    ...(social === undefined ? {} : { social }),
    ...(travel === undefined
      ? {}
      : {
          travelLogistics: {
            travelRequired: travel.travelRequired === true,
            arrivalAt: typeof travel.arrivalAt === "string" ? travel.arrivalAt : null,
            departureAt: typeof travel.departureAt === "string" ? travel.departureAt : null,
            ...(typeof travel.origin === "string" ? { origin: travel.origin } : {}),
            ...(typeof travel.destination === "string" ? { destination: travel.destination } : {}),
          },
        }),
    ...(typeof candidate.headshotAssetId === "string"
      ? { headshotAssetId: candidate.headshotAssetId }
      : {}),
    version: typeof candidate.version === "number" ? candidate.version : 0,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : "",
  };
}

function normalizeComment(value: unknown): DeliverableComment {
  const candidate = isRecord(value) ? value : {};
  return {
    id: typeof candidate.id === "string" ? candidate.id : "",
    assetId: typeof candidate.assetId === "string" ? candidate.assetId : "",
    body: typeof candidate.body === "string" ? candidate.body : "",
    authorLabel: typeof candidate.authorLabel === "string" ? candidate.authorLabel : "",
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : "",
    ...(typeof candidate.eventId === "string" ? { eventId: candidate.eventId } : {}),
    ...(typeof candidate.updatedAt === "string" ? { updatedAt: candidate.updatedAt } : {}),
    ...(typeof candidate.version === "number" ? { version: candidate.version } : {}),
  };
}

function withJsonHeaders(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return { ...init, credentials: "include", cache: "no-store", headers };
}
function resolveUploadGrantUrl(value: string, origin: string): string {
  try {
    return new URL(value).toString();
  } catch {
    return new URL(value, `${trimTrailingSlash(origin)}/`).toString();
  }
}

function withZipHeaders(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/zip");
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return { ...init, credentials: "include", cache: "no-store", headers };
}

const maxDeliverablesExportBytes = 250 * 1024 * 1024;
const maxDeliverablesExportFilenameLength = 255;

function validateExportInput(input: DeliverableExportInput): void {
  if (input === null || typeof input !== "object") {
    throw new TypeError("A deliverables export selection is required.");
  }
  const selectors = [input.assetIds, input.taskIds, input.participantIds];
  if (selectors.every((value) => value === undefined) && input.status === undefined) {
    throw new TypeError("Select deliverable asset IDs or task filters before exporting.");
  }
  for (const values of selectors) {
    if (values === undefined) continue;
    if (!Array.isArray(values) || values.length > 100) {
      throw new TypeError("A deliverables export selection may contain at most 100 IDs.");
    }
    if (values.some((value) => typeof value !== "string" || value.trim().length === 0)) {
      throw new TypeError("Deliverables export IDs must be non-empty strings.");
    }
  }
  if (input.status !== undefined && !deliverablesExportStatuses.includes(input.status)) {
    throw new TypeError("The deliverable status filter is invalid.");
  }
}

function exportPayload(input: DeliverableExportInput): JsonRecord {
  const payload: JsonRecord = {};
  if (input.assetIds !== undefined) payload.assetIds = [...input.assetIds];
  if (input.taskIds !== undefined) payload.taskIds = [...input.taskIds];
  if (input.participantIds !== undefined) payload.participantIds = [...input.participantIds];
  if (input.status !== undefined) payload.status = input.status;
  return payload;
}

function invalidExportResponse(message: string): DeliverablesApiError {
  return new DeliverablesApiError("DELIVERABLES_EXPORT_INVALID_RESPONSE", message, 200);
}

function attachmentFileName(value: string | null): string {
  if (value === null || !/^\s*attachment(?:;|$)/iu.test(value)) {
    throw invalidExportResponse("The deliverables export did not return an attachment.");
  }
  const extended = /(?:^|;)\s*filename\*\s*=\s*([^;]+)/iu.exec(value)?.[1]?.trim();
  const regularMatch = /(?:^|;)\s*filename\s*=\s*(?:"([^"]*)"|([^;]*))/iu.exec(value);
  let fileName = extended;
  if (fileName !== undefined) {
    const separator = fileName.indexOf("''");
    if (separator < 0 || !/^utf-8$/iu.test(fileName.slice(0, separator))) {
      throw invalidExportResponse("The deliverables export filename encoding is invalid.");
    }
    try {
      fileName = decodeURIComponent(fileName.slice(separator + 2));
    } catch {
      throw invalidExportResponse("The deliverables export filename encoding is invalid.");
    }
  } else {
    fileName = regularMatch?.[1] ?? regularMatch?.[2]?.trim();
  }
  const hasUnsafeCharacter = [...(fileName ?? "")].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 || '\\/<>:"|?*'.includes(character);
  });
  if (
    fileName === undefined ||
    fileName.length === 0 ||
    fileName.length > maxDeliverablesExportFilenameLength ||
    fileName !== fileName.trim() ||
    fileName === "." ||
    fileName === ".." ||
    !/\.zip$/iu.test(fileName) ||
    hasUnsafeCharacter
  ) {
    throw invalidExportResponse("The deliverables export filename is unsafe.");
  }
  return fileName;
}

async function deliverablesExportResponse(response: Response): Promise<DeliverableExportDownload> {
  if (!response.ok) throw await errorFrom(response);
  if (response.status !== 200) {
    throw invalidExportResponse("The deliverables export returned an unexpected status.");
  }
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/zip") {
    throw invalidExportResponse("The deliverables export did not return a ZIP archive.");
  }
  const contentLengthHeader = response.headers.get("content-length");
  let declaredLength: number | undefined;
  if (contentLengthHeader !== null) {
    const normalized = contentLengthHeader.trim();
    if (!/^\d+$/u.test(normalized)) {
      throw invalidExportResponse("The deliverables export content length is invalid.");
    }
    declaredLength = Number(normalized);
    if (!Number.isSafeInteger(declaredLength) || declaredLength > maxDeliverablesExportBytes) {
      throw invalidExportResponse("The deliverables export exceeds the size limit.");
    }
  }
  const body = await response.arrayBuffer();
  if (body.byteLength > maxDeliverablesExportBytes) {
    throw invalidExportResponse("The deliverables export exceeds the size limit.");
  }
  if (declaredLength !== undefined && declaredLength !== body.byteLength) {
    throw invalidExportResponse(
      "The deliverables export content length does not match the response body.",
    );
  }
  return {
    body,
    fileName: attachmentFileName(response.headers.get("content-disposition")),
    contentType: "application/zip",
    sizeBytes: body.byteLength,
  };
}

export function createDeliverablesApi(
  baseUrl: string,
  organizationId: string,
  eventId: string,
  fetcher: DeliverablesFetcher = fetch,
): DeliverablesApi {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl.trim());
  const organizationScope = organizationId.trim();
  const eventScope = eventId.trim();
  const organizationSegment = segment(organizationScope, "organization ID");
  const eventSegment = segment(eventScope, "event ID");
  const adminSessionsBase = `${normalizedBaseUrl}/api/admin/organizations/${organizationSegment}/events/${eventSegment}/sessions`;
  const speakerBase = `${normalizedBaseUrl}/api/speaker/events/${eventSegment}`;

  async function adminRequest<T>(path = "", init: RequestInit = {}): Promise<T> {
    const response = await fetcher(`${adminSessionsBase}${path}`, withJsonHeaders(init));
    if (!response.ok) throw await errorFrom(response);
    if (response.status === 204) return undefined as T;
    return unwrap<T>(await response.json());
  }

  async function speakerRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetcher(`${speakerBase}${path}`, withJsonHeaders(init));
    if (!response.ok) throw await errorFrom(response);
    if (response.status === 204) return undefined as T;
    return unwrap<T>(await response.json());
  }
  async function uploadPrivateAsset(
    file: File,
    authorization: DeliverableUploadAuthorization,
  ): Promise<void> {
    const response = await fetcher(
      resolveUploadGrantUrl(authorization.grant.url, normalizedBaseUrl),
      {
        method: authorization.grant.method,
        credentials: "omit",
        cache: "no-store",
        headers: authorization.grant.headers,
        body: file,
      },
    );
    if (!response.ok) throw await errorFrom(response);
  }

  async function replaceHeadshot(
    input: DeliverableHeadshotReplacementInput,
  ): Promise<DeliverableHeadshotReplacement> {
    const contentType = input.file.type.trim() || "application/octet-stream";
    const authorization = normalizeUploadAuthorization(
      await speakerRequest<unknown>(
        `/organizer/profiles/${segment(input.participantId, "participant ID")}/headshot`,
        {
          method: "POST",
          body: JSON.stringify({
            participantId: input.participantId,
            kind: "headshot",
            fileName: input.file.name,
            contentType,
            sizeBytes: input.file.size,
            ...(input.supersedesAssetId === undefined
              ? {}
              : { supersedesAssetId: input.supersedesAssetId }),
          }),
        },
      ),
    );
    await uploadPrivateAsset(input.file, authorization);
    const asset = await speakerRequest<unknown>(
      `/organizer/assets/${segment(authorization.asset.id, "asset ID")}/finalize`,
      {
        method: "POST",
        body: JSON.stringify({ state: "ready" }),
      },
    ).then(publicAsset);
    const profile = await speakerRequest<unknown>(
      `/organizer/profiles/${segment(input.participantId, "participant ID")}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          headshotAssetId: asset.id,
          expectedVersion: input.expectedVersion,
        }),
      },
    ).then(normalizeProfile);
    return { asset, profile };
  }

  return {
    async listSessions(signal) {
      const body = await adminRequest<unknown>("", signal === undefined ? {} : { signal });
      return responseCollection<DeliverableSession>(body, "items").map(normalizeSession);
    },
    getSession(sessionId, signal) {
      return adminRequest<unknown>(
        `/${segment(sessionId, "session ID")}`,
        signal === undefined ? {} : { signal },
      ).then(normalizeSession);
    },
    updateSession(input) {
      const payload: JsonRecord = { expectedVersion: input.expectedVersion };
      if (input.title !== undefined) payload.title = input.title;
      if (input.description !== undefined) payload.description = input.description;
      if (input.contentStatus !== undefined) payload.contentStatus = input.contentStatus;
      return adminRequest<unknown>(`/${segment(input.sessionId, "session ID")}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }).then(normalizeSession);
    },
    async listSessionContentHistory(sessionId, signal) {
      const body = await adminRequest<unknown>(
        `/${segment(sessionId, "session ID")}/history`,
        signal === undefined ? {} : { signal },
      );
      return responseCollection<unknown>(body, "history").map(normalizeContentHistory);
    },
    replaceHeadshot,
    async createTask(input) {
      if (
        !Array.isArray(input.acceptedAssetKinds) ||
        input.acceptedAssetKinds.length === 0 ||
        input.acceptedAssetKinds.some(
          (kind) => !deliverableAssetKinds.includes(kind as (typeof deliverableAssetKinds)[number]),
        )
      ) {
        throw new TypeError("At least one accepted asset kind is required for upload tasks.");
      }
      return speakerRequest<unknown>("/organizer/tasks", {
        method: "POST",
        body: JSON.stringify({
          type: "upload",
          title: input.title,
          instructions: input.description,
          description: input.description,
          dueAt: input.dueAt,
          allowedMimeTypes: input.allowedMimeTypes,
          maxBytes: input.maxSizeBytes,
          acceptedAssetKinds: [...input.acceptedAssetKinds],
          assigneeIds: input.assigneeIds,
        }),
      }).then(normalizeTask);
    },
    async listDeliverableMatrix(options) {
      const query = new URLSearchParams();
      if (options?.participantId !== undefined) query.set("participantId", options.participantId);
      if (options?.taskId !== undefined) query.set("taskId", options.taskId);
      if (options?.status !== undefined) query.set("status", options.status);
      const suffix = query.size === 0 ? "" : `?${query.toString()}`;
      const body = await speakerRequest<unknown>(
        `/organizer/deliverables${suffix}`,
        options?.signal === undefined ? {} : { signal: options.signal },
      );
      const matrix = normalizeMatrix(body);
      if (matrix.organizationId !== organizationScope || matrix.eventId !== eventScope) {
        throw new DeliverablesApiError(
          "DELIVERABLES_MATRIX_SCOPE_MISMATCH",
          "The organizer deliverables matrix did not match the requested organization and event.",
          200,
        );
      }
      return matrix;
    },
    async listTasks(signal) {
      const body = await speakerRequest<unknown>(
        "/organizer/tasks",
        signal === undefined ? {} : { signal },
      );
      return responseCollection<DeliverableTask>(body, "tasks").map(normalizeTask);
    },
    async listAssets(options) {
      const query = new URLSearchParams();
      if (options?.participantId !== undefined) query.set("participantId", options.participantId);
      if (options?.versionFamilyId !== undefined)
        query.set("versionFamilyId", options.versionFamilyId);
      const suffix = query.size === 0 ? "" : `?${query.toString()}`;
      const body = await speakerRequest<unknown>(
        `/organizer/assets${suffix}`,
        options?.signal === undefined ? {} : { signal: options.signal },
      );
      return responseCollection<unknown>(body, "assets").map(publicAsset);
    },
    async getAssetHistory(assetId, signal) {
      const body = await speakerRequest<unknown>(
        `/organizer/assets/${segment(assetId, "asset ID")}/history`,
        signal === undefined ? {} : { signal },
      );
      return responseCollection<unknown>(body, "assets").map(publicAsset);
    },
    async listAssetComments(assetId, signal) {
      const body = await speakerRequest<unknown>(
        `/organizer/assets/${segment(assetId, "asset ID")}/comments`,
        signal === undefined ? {} : { signal },
      );
      return responseCollection<DeliverableComment>(body, "comments").map(normalizeComment);
    },
    addAssetComment(input) {
      const payload: JsonRecord = { body: input.body };
      if (input.expectedVersion !== undefined) payload.expectedVersion = input.expectedVersion;
      return speakerRequest<unknown>(
        `/organizer/assets/${segment(input.assetId, "asset ID")}/comments`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      ).then(normalizeComment);
    },
    getDownloadGrant(assetId) {
      return speakerRequest<DeliverableDownloadGrant>(
        `/organizer/assets/${segment(assetId, "asset ID")}/download`,
        { method: "POST" },
      );
    },
    async listProfiles(signal) {
      const body = await speakerRequest<unknown>(
        "/organizer/profiles",
        signal === undefined ? {} : { signal },
      );
      return responseCollection<DeliverableSpeakerProfile>(body, "profiles").map(normalizeProfile);
    },
    updateBiography(input) {
      return speakerRequest<unknown>(
        `/organizer/profiles/${segment(input.participantId, "participant ID")}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            biography: input.biography,
            expectedVersion: input.expectedVersion,
          }),
        },
      ).then(normalizeProfile);
    },
    sendBulkReminder(input) {
      return speakerRequest<{
        sentCount: number;
        recipientIds: readonly string[];
      }>("/organizer/reminders/queue", {
        method: "POST",
        body: JSON.stringify({
          taskIds: input.taskIds,
          recipientIds: input.recipientIds,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
    },
    reviewAsset(input) {
      return speakerRequest<unknown>(
        `/organizer/assets/${segment(input.assetId, "asset ID")}/review`,
        {
          method: "POST",
          body: JSON.stringify({
            state: input.state,
            ...(input.note === undefined ? {} : { note: input.note }),
          }),
        },
      ).then(publicAsset);
    },
    async restoreSessionVersion(input) {
      return adminRequest<unknown>(`/${segment(input.sessionId, "session ID")}/restore`, {
        method: "POST",
        body: JSON.stringify({
          version: input.version,
          expectedVersion: input.expectedVersion,
        }),
      }).then(normalizeSession);
    },
    async exportDeliverables(input) {
      validateExportInput(input);
      const response = await fetcher(
        `${speakerBase}/organizer/deliverables/export`,
        withZipHeaders({
          method: "POST",
          body: JSON.stringify(exportPayload(input)),
        }),
      );
      return deliverablesExportResponse(response);
    },
  };
}

export const createDeliverableApi = createDeliverablesApi;
export const createContentManagementApi = createDeliverablesApi;
