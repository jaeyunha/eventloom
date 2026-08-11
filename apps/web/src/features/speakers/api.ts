export type SpeakerStatus =
  | "pending"
  | "invited"
  | "confirmed"
  | "accepted"
  | "declined"
  | "active"
  | "revoked"
  | string;

export interface SpeakerSocialLinks {
  readonly twitter?: string;
  readonly linkedin?: string;
  readonly website?: string;
}
export interface SpeakerTravelLogistics {
  readonly travelRequired: boolean;
  readonly arrivalAt: string | null;
  readonly departureAt: string | null;
  readonly accommodation: string;
  readonly dietaryRequirements: string;
  readonly accessibilityNeeds: string;
  readonly travelNotes: string;
}

export interface SpeakerEmailTemplate {
  readonly id: string;
  readonly organizationId: string;
  readonly eventId: string;
  readonly name: string;
  readonly version: number;
  readonly status: "draft" | "approved" | "archived" | string;
  readonly sender: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly variables: readonly string[];
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SpeakerEmailPreviewRecipient {
  readonly participantId: string;
  readonly displayName: string;
  readonly firstName: string;
  readonly email: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

export interface SpeakerEmailPreview {
  readonly id: string;
  readonly organizationId: string;
  readonly eventId: string;
  readonly templateId: string;
  readonly templateVersion: number;
  readonly recipientIds: readonly string[];
  readonly recipients: readonly SpeakerEmailPreviewRecipient[];
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface SpeakerEmailDelivery {
  readonly participantId: string;
  readonly email: string;
  readonly status: "queued" | "sent" | "failed" | string;
  readonly providerMessageId: string | null;
  readonly reason: string | null;
}

export interface SpeakerEmailHistoryEntry {
  readonly occurredAt: string;
  readonly action: string;
  readonly participantId: string | null;
  readonly details: Readonly<Record<string, string | number | null>>;
}

export interface SpeakerEmailSend {
  readonly id: string;
  readonly organizationId: string;
  readonly eventId: string;
  readonly templateId: string;
  readonly templateVersion: number;
  readonly idempotencyKey: string;
  readonly status: "queued" | "sent" | "partial" | "failed" | string;
  readonly recipientIds: readonly string[];
  readonly deliveries: readonly SpeakerEmailDelivery[];
  readonly history: readonly SpeakerEmailHistoryEntry[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SpeakerReminderEligibility {
  readonly taskId: string;
  readonly participantId: string;
  readonly title: string;
  readonly dueAt: string | null;
  readonly reminderOffsetsMinutes: readonly number[];
  readonly eligible: boolean;
  readonly reason: string;
}

export interface SpeakerReminderEligibilityEnvelope {
  readonly organizationId: string;
  readonly eventId: string;
  readonly items: readonly SpeakerReminderEligibility[];
  readonly eligibleTaskIds: readonly string[];
  readonly eligibleRecipientIds: readonly string[];
}

export interface SpeakerTaskSummary {
  readonly total: number;
  readonly completed: number;
  readonly overdue: number;
}

export interface SpeakerAsset {
  readonly assetId: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly byteSize: number;
  readonly status: "pending" | "ready" | "rejected" | string;
  readonly uploadedAt: string;
  readonly downloadUrl: string | null;
}
export interface SpeakerDownloadGrant {
  readonly method?: "GET";
  readonly url: string;
  readonly expiresAt: string;
}

export interface SpeakerSession {
  readonly submissionId: string;
  readonly title: string;
  readonly status: string;
}

export interface SpeakerTask {
  readonly taskId: string;
  readonly participantId: string;
  readonly title: string;
  readonly description: string;
  readonly type: "general" | "action" | "file_request" | string;
  readonly dueAt: string | null;
  readonly status: "pending" | "in_progress" | "uploaded" | "completed" | "overdue" | string;
  readonly completedAt: string | null;
  readonly sessionId: string | null;
  readonly latestAssetId: string | null;
}

export interface SpeakerRecord {
  readonly participantId: string;
  readonly displayName: string;
  readonly email: string;
  readonly jobTitle: string;
  readonly company: string;
  readonly biography: string;
  readonly socialLinks: SpeakerSocialLinks;
  readonly travelLogistics?: SpeakerTravelLogistics;
  readonly headshotAssetId: string | null;
  readonly status: SpeakerStatus;
  readonly sessions: readonly SpeakerSession[];
  readonly taskSummary: SpeakerTaskSummary;
  readonly assets: readonly SpeakerAsset[];
  readonly version: number;
  readonly updatedAt: string;
}

export interface SpeakerRosterEnvelope {
  readonly organizationId: string;
  readonly eventId: string;
  readonly speakers: readonly SpeakerRecord[];
}

export interface SpeakerImportRow {
  readonly rowNumber: number;
  readonly displayName: string;
  readonly email: string;
  readonly jobTitle: string;
  readonly company: string;
  readonly biography: string;
  readonly socialLinks: SpeakerSocialLinks;
  readonly status?: SpeakerStatus;
}

export interface SpeakerImportIssue {
  readonly rowNumber: number;
  readonly field?: string;
  readonly message: string;
}

export interface SpeakerImportPreview {
  readonly validRows: readonly SpeakerImportRow[];
  readonly invalidRows: readonly SpeakerImportIssue[];
}

export interface SpeakerImportCommitInput {
  readonly rows: readonly SpeakerImportRow[];
  readonly idempotencyKey: string;
}

export interface SpeakerInvitationPreview {
  readonly participantId: string;
  readonly recipientEmail: string;
  readonly state: "ready" | "blocked" | string;
}

export type SpeakerInvitationDeliveryStatus = "queued" | "sent" | "failed" | "duplicate";

export interface SpeakerInvitationRecipientResult {
  readonly participantId: string;
  readonly recipientEmail: string;
  readonly status: SpeakerInvitationDeliveryStatus;
  readonly receiptId: string | null;
}

export interface SpeakerInvitationResult {
  readonly organizationId: string;
  readonly eventId: string;
  readonly idempotencyKey: string;
  readonly status: SpeakerInvitationDeliveryStatus;
  readonly duplicate: boolean;
  readonly recipients: readonly SpeakerInvitationRecipientResult[];
}

export interface SpeakerProgressRow {
  readonly participantId: string;
  readonly displayName: string;
  readonly tasks: readonly SpeakerTask[];
}

export interface SpeakerProgressEnvelope {
  readonly organizationId: string;
  readonly eventId: string;
  readonly rows: readonly SpeakerProgressRow[];
}

export interface SpeakerCreateInput {
  readonly idempotencyKey?: string;
  readonly displayName: string;
  readonly email: string;
  readonly jobTitle: string;
  readonly company: string;
  readonly biography: string;
  readonly socialLinks: SpeakerSocialLinks;
  readonly travelLogistics?: Partial<SpeakerTravelLogistics>;
  readonly status: SpeakerStatus;
}

export interface SpeakerUpdateInput {
  readonly expectedVersion: number;
  readonly displayName: string;
  readonly email: string;
  readonly jobTitle: string;
  readonly company: string;
  readonly biography: string;
  readonly socialLinks: SpeakerSocialLinks;
  readonly travelLogistics?: Partial<SpeakerTravelLogistics>;
  readonly status: SpeakerStatus;
}

export interface SpeakerTaskAssignmentInput {
  readonly title: string;
  readonly description: string;
  readonly dueAt: string;
  readonly participantIds: readonly string[];
}

export interface SpeakerInvitationPreviewInput {
  readonly participantIds: readonly string[];
}

export interface SpeakerInvitationSendInput {
  readonly participantIds: readonly string[];
  readonly templateId: string;
  readonly idempotencyKey: string;
}

export interface SpeakerTaskEnvelope {
  readonly organizationId: string;
  readonly eventId: string;
  readonly speakerProfileId: string;
  readonly tasks: readonly SpeakerTask[];
}

export interface SpeakerErrorResponse {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly traceId?: string;
  };
}

export class SpeakerApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly traceId: string | undefined;

  constructor(code: string, message: string, status: number, traceId?: string) {
    super(message);
    this.name = "SpeakerApiError";
    this.code = code;
    this.status = status;
    this.traceId = traceId;
  }
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function baseWithoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "");
}

function pathSegment(value: string): string {
  return encodeURIComponent(value);
}

function parseSpeakerInvitationResult(value: unknown): SpeakerInvitationResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("The invitation result is invalid.");
  }
  const record = value as Record<string, unknown>;
  const statuses = new Set<SpeakerInvitationDeliveryStatus>([
    "queued",
    "sent",
    "failed",
    "duplicate",
  ]);
  if (
    typeof record.organizationId !== "string" ||
    record.organizationId.trim().length === 0 ||
    typeof record.eventId !== "string" ||
    record.eventId.trim().length === 0 ||
    typeof record.idempotencyKey !== "string" ||
    record.idempotencyKey.trim().length === 0 ||
    typeof record.status !== "string" ||
    !statuses.has(record.status as SpeakerInvitationDeliveryStatus) ||
    typeof record.duplicate !== "boolean" ||
    !Array.isArray(record.recipients) ||
    record.recipients.length === 0
  ) {
    throw new TypeError("The invitation result is invalid.");
  }
  const recipients = record.recipients.map((value): SpeakerInvitationRecipientResult => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new TypeError("The invitation recipient result is invalid.");
    }
    const recipient = value as Record<string, unknown>;
    if (
      typeof recipient.participantId !== "string" ||
      recipient.participantId.trim().length === 0 ||
      typeof recipient.recipientEmail !== "string" ||
      recipient.recipientEmail.trim().length === 0 ||
      typeof recipient.status !== "string" ||
      !statuses.has(recipient.status as SpeakerInvitationDeliveryStatus) ||
      (recipient.receiptId !== null && typeof recipient.receiptId !== "string")
    ) {
      throw new TypeError("The invitation recipient result is invalid.");
    }
    return {
      participantId: recipient.participantId,
      recipientEmail: recipient.recipientEmail,
      status: recipient.status as SpeakerInvitationDeliveryStatus,
      receiptId: recipient.receiptId,
    };
  });
  return {
    organizationId: record.organizationId,
    eventId: record.eventId,
    idempotencyKey: record.idempotencyKey,
    status: record.status as SpeakerInvitationDeliveryStatus,
    duplicate: record.duplicate,
    recipients,
  };
}

async function errorFrom(response: Response): Promise<SpeakerApiError> {
  const body = (await response.json().catch(() => undefined)) as SpeakerErrorResponse | undefined;
  return new SpeakerApiError(
    body?.error?.code ?? "SPEAKER_REQUEST_FAILED",
    body?.error?.message ?? "The speaker request could not be completed.",
    response.status,
    body?.error?.traceId,
  );
}

export interface SpeakerApi {
  list(signal?: AbortSignal): Promise<SpeakerRosterEnvelope>;
  get(participantId: string, signal?: AbortSignal): Promise<SpeakerRecord>;
  create(input: SpeakerCreateInput): Promise<SpeakerRosterEnvelope>;
  update(participantId: string, input: SpeakerUpdateInput): Promise<SpeakerRosterEnvelope>;
  getSessions(participantId: string, signal?: AbortSignal): Promise<readonly SpeakerSession[]>;
  getAssets(participantId: string, signal?: AbortSignal): Promise<readonly SpeakerAsset[]>;
  getDownloadGrant(assetId: string, signal?: AbortSignal): Promise<SpeakerDownloadGrant>;
  previewImport(file: File, signal?: AbortSignal): Promise<SpeakerImportPreview>;
  commitImport(
    input: SpeakerImportCommitInput,
    signal?: AbortSignal,
  ): Promise<SpeakerRosterEnvelope>;
  listTasks(participantId: string, signal?: AbortSignal): Promise<SpeakerTaskEnvelope>;
  assignTasks(input: SpeakerTaskAssignmentInput): Promise<SpeakerTaskEnvelope>;
  previewInvitations(
    input: SpeakerInvitationPreviewInput,
  ): Promise<readonly SpeakerInvitationPreview[]>;
  sendInvitations(input: SpeakerInvitationSendInput): Promise<SpeakerInvitationResult>;
  listEmailTemplates(signal?: AbortSignal): Promise<readonly SpeakerEmailTemplate[]>;
  createEmailTemplate(
    input: {
      templateId?: string;
      name: string;
      subject: string;
      html: string;
      text: string;
      status?: "draft" | "approved";
    },
    signal?: AbortSignal,
  ): Promise<SpeakerEmailTemplate>;
  createEmailTemplateVersion(
    input: {
      templateId: string;
      subject: string;
      html: string;
      text: string;
      status?: "draft" | "approved";
    },
    signal?: AbortSignal,
  ): Promise<SpeakerEmailTemplate>;
  previewEmails(
    input: {
      participantIds: readonly string[];
      templateId: string;
      templateVersion?: number;
    },
    signal?: AbortSignal,
  ): Promise<SpeakerEmailPreview>;
  sendEmails(
    input: { previewId: string; idempotencyKey: string },
    signal?: AbortSignal,
  ): Promise<SpeakerEmailSend>;
  listEmailHistory(signal?: AbortSignal): Promise<readonly SpeakerEmailSend[]>;
  getReminderEligibility(
    input?: {
      taskIds?: readonly string[];
      recipientIds?: readonly string[];
    },
    signal?: AbortSignal,
  ): Promise<SpeakerReminderEligibilityEnvelope>;
}

export function createSpeakerApi(
  baseUrl: string,
  organizationId: string,
  eventId: string,
  fetcher: Fetcher = fetch,
): SpeakerApi {
  const normalizedBaseUrl = baseWithoutTrailingSlash(baseUrl.trim());
  const normalizedOrganizationId = organizationId.trim();
  const normalizedEventId = eventId.trim();
  if (normalizedBaseUrl.length === 0) throw new TypeError("A speaker API base URL is required.");
  if (normalizedOrganizationId.length === 0) {
    throw new TypeError("An organization ID is required for speaker requests.");
  }
  if (normalizedEventId.length === 0) {
    throw new TypeError("An event ID is required for speaker requests.");
  }

  const eventApiBase = `${normalizedBaseUrl}/api/admin/organizations/${pathSegment(normalizedOrganizationId)}/events/${pathSegment(normalizedEventId)}`;
  const apiBase = `${eventApiBase}/speakers`;

  async function requestAt<T>(base: string, path: string, init?: RequestInit): Promise<T> {
    const response = await fetcher(`${base}${path}`, {
      ...init,
      cache: "no-store",
      credentials: "include",
      headers: {
        accept: "application/json",
        ...init?.headers,
      },
    });
    if (!response.ok) throw await errorFrom(response);
    if (response.status === 204) return undefined as T;
    const body = (await response.json()) as unknown;
    return typeof body === "object" && body !== null && "data" in body
      ? (body as { data: T }).data
      : (body as T);
  }

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    return requestAt<T>(apiBase, path, init);
  }

  async function eventRequest<T>(path: string, init?: RequestInit): Promise<T> {
    return requestAt<T>(eventApiBase, path, init);
  }

  function jsonRequest<T>(
    path: string,
    method: "POST" | "PATCH",
    value: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    return request<T>(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(value),
      ...(signal === undefined ? {} : { signal }),
    });
  }

  function eventJsonRequest<T>(path: string, method: "POST" | "PATCH", value: unknown): Promise<T> {
    return eventRequest<T>(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(value),
    });
  }

  return {
    list(signal) {
      return request<SpeakerRosterEnvelope>("", signal === undefined ? undefined : { signal });
    },
    get(participantId, signal) {
      return request<SpeakerRecord>(
        `/${pathSegment(participantId)}`,
        signal === undefined ? undefined : { signal },
      );
    },
    create(input) {
      return jsonRequest<SpeakerRosterEnvelope>("", "POST", input);
    },
    update(participantId, input) {
      return jsonRequest<SpeakerRosterEnvelope>(`/${pathSegment(participantId)}`, "PATCH", input);
    },
    getSessions(participantId, signal) {
      return request<readonly SpeakerSession[]>(
        `/${pathSegment(participantId)}/sessions`,
        signal === undefined ? undefined : { signal },
      );
    },
    getAssets(participantId, signal) {
      return request<readonly SpeakerAsset[]>(
        `/${pathSegment(participantId)}/assets`,
        signal === undefined ? undefined : { signal },
      ).then((assets) =>
        assets.map((asset) => ({
          ...asset,
          // The list endpoint may include a short-lived grant for legacy callers. Keep it out of
          // the browser-facing workspace until the organizer explicitly requests a download.
          downloadUrl: null,
        })),
      );
    },
    getDownloadGrant(assetId, signal) {
      return requestAt<SpeakerDownloadGrant>(
        normalizedBaseUrl,
        `/api/speaker/events/${pathSegment(normalizedEventId)}/organizer/assets/${pathSegment(assetId)}/download`,
        {
          method: "POST",
          ...(signal === undefined ? {} : { signal }),
        },
      );
    },
    previewImport(file, signal) {
      const body = new FormData();
      body.append("file", file);
      return request<SpeakerImportPreview>("/imports/preview", {
        method: "POST",
        body,
        ...(signal === undefined ? {} : { signal }),
      });
    },
    commitImport(input, signal) {
      return jsonRequest<SpeakerRosterEnvelope>("/imports", "POST", input, signal);
    },
    listTasks(participantId, signal) {
      const query = new URLSearchParams({ participantId });
      return eventRequest<SpeakerTaskEnvelope>(
        `/speaker-tasks?${query.toString()}`,
        signal === undefined ? undefined : { signal },
      );
    },
    assignTasks(input) {
      return eventJsonRequest<SpeakerTaskEnvelope>("/speaker-tasks", "POST", input);
    },
    previewInvitations(input) {
      return jsonRequest<readonly SpeakerInvitationPreview[]>(
        "/invitations/preview",
        "POST",
        input,
      );
    },
    sendInvitations(input) {
      return jsonRequest<unknown>("/invitations/send", "POST", input).then(
        parseSpeakerInvitationResult,
      );
    },
    listEmailTemplates(signal) {
      return request<readonly SpeakerEmailTemplate[]>(
        "/email/templates",
        signal === undefined ? undefined : { signal },
      );
    },
    createEmailTemplate(input, signal) {
      return jsonRequest<SpeakerEmailTemplate>("/email/templates", "POST", input, signal);
    },
    createEmailTemplateVersion(input, signal) {
      return jsonRequest<SpeakerEmailTemplate>(
        `/email/templates/${pathSegment(input.templateId)}/versions`,
        "POST",
        input,
        signal,
      );
    },
    previewEmails(input, signal) {
      return jsonRequest<SpeakerEmailPreview>("/email/preview", "POST", input, signal);
    },
    sendEmails(input, signal) {
      return jsonRequest<SpeakerEmailSend>("/email/send", "POST", input, signal);
    },
    listEmailHistory(signal) {
      return request<readonly SpeakerEmailSend[]>(
        "/email/history",
        signal === undefined ? undefined : { signal },
      );
    },
    getReminderEligibility(input = {}, signal) {
      const query = new URLSearchParams();
      if (input.taskIds !== undefined && input.taskIds.length > 0) {
        query.set("taskIds", input.taskIds.join(","));
      }
      if (input.recipientIds !== undefined && input.recipientIds.length > 0) {
        query.set("recipientIds", input.recipientIds.join(","));
      }
      const suffix = query.toString().length === 0 ? "" : `?${query.toString()}`;
      return request<SpeakerReminderEligibilityEnvelope>(
        `/reminders/eligibility${suffix}`,
        signal === undefined ? undefined : { signal },
      );
    },
  };
}
