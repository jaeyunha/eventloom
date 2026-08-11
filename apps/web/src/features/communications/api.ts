export const COMMUNICATION_TEMPLATE_PURPOSES = [
  "verification",
  "receipt",
  "reminder",
  "decision",
  "task",
  "schedule_publish",
  "schedule_update",
  "schedule_cancel",
  "organizer_group_email",
] as const;

export type CommunicationTemplatePurpose = (typeof COMMUNICATION_TEMPLATE_PURPOSES)[number];

export const COMMUNICATION_AUDIENCES = [
  "all_participants",
  "accepted_participants",
  "waitlisted_participants",
  "rejected_participants",
  "task_assignees",
  "scheduled_participants",
] as const;

export type CommunicationAudience = (typeof COMMUNICATION_AUDIENCES)[number];

export const COMMUNICATION_SENDERS = [
  "auth@sessionboard.namuh.co",
  "speakers@sessionboard.namuh.co",
  "calendar@sessionboard.namuh.co",
] as const;

export type CommunicationSenderIdentity = (typeof COMMUNICATION_SENDERS)[number];
export type CommunicationTemplateStatus = "draft" | "approved" | "archived";
export type CommunicationDeliveryStatus =
  | "queued"
  | "delivered"
  | "failed"
  | "bounced"
  | "complained";
export type CommunicationSendStatus = "queued" | "delivered" | "partial" | "failed";

export interface CommunicationTemplate {
  readonly id: string;
  readonly tenantId: string;
  readonly eventId: string;
  readonly name: string;
  readonly purpose: CommunicationTemplatePurpose;
  readonly version: number;
  readonly status: CommunicationTemplateStatus;
  readonly sender: CommunicationSenderIdentity;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly variables: readonly string[];
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly approvedBy: string | null;
  readonly approvedAt: string | null;
}

export interface CommunicationTemplateSnapshot {
  readonly id: string;
  readonly name: string;
  readonly purpose: CommunicationTemplatePurpose;
  readonly version: number;
  readonly sender: CommunicationSenderIdentity;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

export interface CommunicationRecipientSnapshot {
  readonly id: string;
  readonly participantId: string;
  readonly tenantId: string;
  readonly eventId: string;
  readonly email: string;
  readonly displayName: string;
  readonly audiences: readonly CommunicationAudience[];
  readonly data: Readonly<Record<string, unknown>>;
}
export interface CommunicationRecipientPreview {
  readonly recipientId: string;
  readonly email: string;
  readonly displayName: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

export interface CommunicationPreview {
  readonly id: string;
  readonly tenantId: string;
  readonly eventId: string;
  readonly purpose: CommunicationTemplatePurpose;
  readonly templateId: string;
  readonly templateVersion: number;
  readonly audience: CommunicationAudience;
  readonly data: Readonly<Record<string, unknown>>;
  readonly recipientCount: number;
  readonly recipientIds: readonly string[];
  readonly recipients: readonly CommunicationRecipientSnapshot[];
  readonly recipientPreviews: readonly CommunicationRecipientPreview[];
  readonly template: CommunicationTemplateSnapshot;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface CommunicationDeliveryHistoryEntry {
  readonly id: string;
  readonly status: CommunicationDeliveryStatus;
  readonly occurredAt: string;
  readonly providerMessageId: string | null;
  readonly reason: string | null;
  readonly actorId: string;
}

export interface CommunicationDelivery {
  readonly recipientId: string;
  readonly email: string;
  readonly status: CommunicationDeliveryStatus;
  readonly providerMessageId: string | null;
  readonly failureReason: string | null;
  readonly attempts: number;
  readonly history: readonly CommunicationDeliveryHistoryEntry[];
}

export interface CommunicationAuditEntry {
  readonly id: string;
  readonly tenantId: string;
  readonly eventId: string;
  readonly sendId: string;
  readonly recipientId: string | null;
  readonly action: string;
  readonly actorId: string;
  readonly occurredAt: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface CommunicationSend {
  readonly id: string;
  readonly tenantId: string;
  readonly eventId: string;
  readonly purpose: CommunicationTemplatePurpose;
  readonly audience: CommunicationAudience | null;
  readonly templateId: string;
  readonly templateVersion: number;
  readonly template: CommunicationTemplateSnapshot;
  readonly idempotencyKey: string;
  readonly previewId: string | null;
  readonly data: Readonly<Record<string, unknown>>;
  readonly status: CommunicationSendStatus;
  readonly recipientCount: number;
  readonly queuedCount: number;
  readonly deliveredCount: number;
  readonly failedCount: number;
  readonly terminal: boolean;
  readonly recipients: readonly CommunicationRecipientSnapshot[];
  readonly deliveries: readonly CommunicationDelivery[];
  readonly history: readonly CommunicationAuditEntry[];
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface CommunicationDeliveryHistory {
  readonly history: readonly CommunicationAuditEntry[];
  readonly deliveries: readonly CommunicationDelivery[];
  readonly recipientCount: number;
  readonly queuedCount: number;
  readonly deliveredCount: number;
  readonly failedCount: number;
  readonly terminal: boolean;
}

export class CommunicationApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly traceId: string | undefined;

  constructor(code: string, message: string, status: number, traceId?: string) {
    super(message);
    this.name = "CommunicationApiError";
    this.code = code;
    this.status = status;
    this.traceId = traceId;
  }
}

export { CommunicationApiError as CommunicationsApiError };

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function segment(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0)
    throw new TypeError(`A ${field} is required for communication requests.`);
  return encodeURIComponent(normalized);
}

function senderForPurpose(purpose: CommunicationTemplatePurpose): CommunicationSenderIdentity {
  if (purpose === "verification") return "auth@sessionboard.namuh.co";
  if (
    purpose === "schedule_publish" ||
    purpose === "schedule_update" ||
    purpose === "schedule_cancel"
  ) {
    return "calendar@sessionboard.namuh.co";
  }
  return "speakers@sessionboard.namuh.co";
}

export function approvedSenderForPurpose(
  purpose: CommunicationTemplatePurpose,
): CommunicationSenderIdentity {
  return senderForPurpose(purpose);
}

export function escapeHtmlForPreview(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatCommunicationPurpose(purpose: CommunicationTemplatePurpose): string {
  return purpose
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatCommunicationAudience(audience: CommunicationAudience): string {
  return audience
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function unwrapData<T>(body: unknown): T {
  if (isRecord(body) && Object.keys(body).length === 1 && body.data !== undefined)
    return body.data as T;
  return body as T;
}

async function toApiError(response: Response): Promise<CommunicationApiError> {
  const body = (await response.json().catch(() => undefined)) as unknown;
  const error = isRecord(body) && isRecord(body.error) ? body.error : undefined;
  return new CommunicationApiError(
    typeof error?.code === "string" ? error.code : "COMMUNICATION_REQUEST_FAILED",
    typeof error?.message === "string"
      ? error.message
      : "The communication request could not be completed.",
    response.status,
    typeof error?.traceId === "string" ? error.traceId : undefined,
  );
}

export interface CommunicationApi {
  listTemplates(
    eventId: string,
    purpose?: CommunicationTemplatePurpose,
    signal?: AbortSignal,
  ): Promise<readonly CommunicationTemplate[]>;
  getTemplate(
    eventId: string,
    templateId: string,
    version?: number,
    signal?: AbortSignal,
  ): Promise<CommunicationTemplate>;
  createTemplate(input: {
    eventId: string;
    name: string;
    purpose: CommunicationTemplatePurpose;
    subject: string;
    html: string;
    text: string;
    variables?: readonly string[];
  }): Promise<CommunicationTemplate>;
  createTemplateVersion(input: {
    eventId: string;
    templateId: string;
    subject: string;
    html: string;
    text: string;
    variables?: readonly string[];
  }): Promise<CommunicationTemplate>;
  approveTemplate(input: {
    eventId: string;
    templateId: string;
    version: number;
  }): Promise<CommunicationTemplate>;
  preview(input: {
    eventId: string;
    purpose: "organizer_group_email";
    templateId: string;
    templateVersion?: number;
    audience: CommunicationAudience;
    data?: Readonly<Record<string, unknown>>;
  }): Promise<CommunicationPreview>;
  getPreview(eventId: string, previewId: string): Promise<CommunicationPreview>;
  sendGroup(input: {
    eventId: string;
    previewId: string;
    idempotencyKey: string;
  }): Promise<CommunicationSend>;
  sendTransactional(input: {
    eventId: string;
    purpose: Exclude<CommunicationTemplatePurpose, "organizer_group_email">;
    templateId?: string;
    templateVersion?: number;
    recipientIds: readonly string[];
    data?: Readonly<Record<string, unknown>>;
    idempotencyKey: string;
    action?: "accept" | "waitlist" | "reject" | "task" | "withdrawal";
  }): Promise<CommunicationSend>;
  getSend(eventId: string, sendId: string): Promise<CommunicationSend>;
  getHistory(eventId: string, sendId: string): Promise<CommunicationDeliveryHistory>;
  listDeliveryHistory(eventId: string, sendId: string): Promise<CommunicationDeliveryHistory>;
  retryFailed(eventId: string, sendId: string): Promise<CommunicationSend>;
}

export function createCommunicationApi(
  baseUrl: string,
  organizationId: string,
  fetcher: Fetcher = fetch,
): CommunicationApi {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl.trim());
  const apiBase = `${normalizedBaseUrl}/api/admin/organizations/${segment(organizationId, "organization ID")}/events`;

  async function request<T>(eventId: string, path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body !== undefined) headers.set("content-type", "application/json");
    const response = await fetcher(
      `${apiBase}/${segment(eventId, "event ID")}/communications${path}`,
      {
        ...init,
        credentials: "include",
        headers,
        cache: "no-store",
      },
    );
    if (!response.ok) throw await toApiError(response);
    if (response.status === 204) return undefined as T;
    return unwrapData<T>(await response.json());
  }

  return {
    async listTemplates(eventId, purpose, signal) {
      const query = purpose === undefined ? "" : `?purpose=${encodeURIComponent(purpose)}`;
      const raw = await request<unknown>(
        eventId,
        `/templates${query}`,
        signal === undefined ? {} : { signal },
      );
      if (Array.isArray(raw)) return raw as readonly CommunicationTemplate[];
      if (isRecord(raw) && Array.isArray(raw.templates))
        return raw.templates as readonly CommunicationTemplate[];
      return [];
    },
    getTemplate(eventId, templateId, version, signal) {
      const query = version === undefined ? "" : `?version=${encodeURIComponent(String(version))}`;
      return request<CommunicationTemplate>(
        eventId,
        `/templates/${segment(templateId, "template ID")}${query}`,
        signal === undefined ? {} : { signal },
      );
    },
    createTemplate(input) {
      return request<CommunicationTemplate>(input.eventId, "/templates", {
        method: "POST",
        body: JSON.stringify({
          name: input.name,
          purpose: input.purpose,
          subject: input.subject,
          html: input.html,
          text: input.text,
          ...(input.variables === undefined ? {} : { variables: input.variables }),
        }),
      });
    },
    createTemplateVersion(input) {
      return request<CommunicationTemplate>(
        input.eventId,
        `/templates/${segment(input.templateId, "template ID")}/versions`,
        {
          method: "POST",
          body: JSON.stringify({
            subject: input.subject,
            html: input.html,
            text: input.text,
            ...(input.variables === undefined ? {} : { variables: input.variables }),
          }),
        },
      );
    },
    approveTemplate(input) {
      return request<CommunicationTemplate>(
        input.eventId,
        `/templates/${segment(input.templateId, "template ID")}/approve`,
        { method: "POST", body: JSON.stringify({ version: input.version }) },
      );
    },
    preview(input) {
      return request<CommunicationPreview>(input.eventId, "/previews", {
        method: "POST",
        body: JSON.stringify({
          purpose: input.purpose,
          templateId: input.templateId,
          ...(input.templateVersion === undefined
            ? {}
            : { templateVersion: input.templateVersion }),
          audience: input.audience,
          ...(input.data === undefined ? {} : { data: input.data }),
        }),
      });
    },
    getPreview(eventId, previewId) {
      return request<CommunicationPreview>(
        eventId,
        `/previews/${segment(previewId, "preview ID")}`,
      );
    },
    sendGroup(input) {
      const idempotencyKey = input.idempotencyKey.trim();
      if (idempotencyKey.length === 0) {
        return Promise.reject(
          new TypeError("An idempotency key is required for communication sends."),
        );
      }
      return request<CommunicationSend>(input.eventId, "/sends", {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey },
        body: JSON.stringify({ previewId: input.previewId, idempotencyKey }),
      });
    },
    sendTransactional(input) {
      const idempotencyKey = input.idempotencyKey.trim();
      if (idempotencyKey.length === 0) {
        return Promise.reject(
          new TypeError("An idempotency key is required for communication sends."),
        );
      }
      return request<CommunicationSend>(input.eventId, "/sends", {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey },
        body: JSON.stringify({
          purpose: input.purpose,
          ...(input.templateId === undefined ? {} : { templateId: input.templateId }),
          ...(input.templateVersion === undefined
            ? {}
            : { templateVersion: input.templateVersion }),
          recipientIds: input.recipientIds,
          ...(input.data === undefined ? {} : { data: input.data }),
          idempotencyKey,
          ...(input.action === undefined ? {} : { action: input.action }),
        }),
      });
    },
    getSend(eventId, sendId) {
      return request<CommunicationSend>(eventId, `/sends/${segment(sendId, "send ID")}`);
    },
    getHistory(eventId, sendId) {
      return request<CommunicationDeliveryHistory>(
        eventId,
        `/sends/${segment(sendId, "send ID")}/history`,
      );
    },
    listDeliveryHistory(eventId, sendId) {
      return this.getHistory(eventId, sendId);
    },
    retryFailed(eventId, sendId) {
      return request<CommunicationSend>(eventId, `/sends/${segment(sendId, "send ID")}/retry`, {
        method: "POST",
      });
    },
  };
}

export const createCommunicationsApi = createCommunicationApi;
