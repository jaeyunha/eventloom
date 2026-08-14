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

export type CommunicationSenderIdentity = string;
export type CommunicationTemplateStatus = "draft" | "approved" | "archived";
export type CommunicationDeliveryStatus =
  | "queued"
  | "provider_accepted"
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
export const REMINDER_TRIGGER_TYPES = ["automatic", "manual"] as const;
export type ReminderTriggerType = (typeof REMINDER_TRIGGER_TYPES)[number];

export const REMINDER_AUDIENCE_TYPES = ["task", "review", "combined"] as const;
export type ReminderAudienceType = (typeof REMINDER_AUDIENCE_TYPES)[number];

export const REMINDER_RUN_STATES = ["pending", "running", "completed", "failed"] as const;
export type ReminderRunState = (typeof REMINDER_RUN_STATES)[number];

export const REMINDER_DISPATCH_STATUSES = [
  "candidate",
  "eligible",
  "skipped",
  "queued",
  "provider_accepted",
  "delivered",
  "failed",
  "bounced",
] as const;
export type ReminderDispatchStatus = (typeof REMINDER_DISPATCH_STATUSES)[number];

export type ReminderSubject =
  | Readonly<{ type: "task"; taskId: string }>
  | Readonly<{ type: "review"; reviewAssignmentId: string }>;

export interface ReminderRenderedMessage {
  readonly from: CommunicationSenderIdentity;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

export interface ReminderCandidate {
  readonly id: string;
  readonly organizationId: string;
  readonly eventId: string;
  readonly recipientApplicationId: string;
  readonly normalizedEmail: string | null;
  readonly displayName: string;
  readonly subject: ReminderSubject;
  readonly eligibilityReason: string;
  readonly cadenceWindow: string;
  readonly nextEligibleAt: string | null;
  readonly eligible: boolean;
  readonly renderedMessage: ReminderRenderedMessage;
}

export interface ReminderRun {
  readonly id: string;
  readonly organizationId: string;
  readonly eventId: string;
  readonly triggerType: ReminderTriggerType;
  readonly audienceType: ReminderAudienceType;
  readonly audienceRevision: string;
  readonly candidateCount: number;
  readonly eligibleCount: number;
  readonly queuedCount: number;
  readonly skippedCount: number;
  readonly failedCount: number;
  readonly state: ReminderRunState;
  readonly configurationFailure: string | null;
  readonly actorId: string | null;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ReminderDispatch {
  readonly id: string;
  readonly runId: string;
  readonly organizationId: string;
  readonly eventId: string;
  readonly recipient: string;
  readonly subject: ReminderSubject;
  readonly eligibilityReason: string;
  readonly cadenceWindow: string;
  readonly idempotencyKey: string;
  readonly providerMessageId: string | null;
  readonly status: ReminderDispatchStatus;
  readonly skipMetadata: Readonly<Record<string, unknown>> | null;
  readonly failureMetadata: Readonly<Record<string, unknown>> | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly eligibleAt: string | null;
  readonly skippedAt: string | null;
  readonly queuedAt: string | null;
  readonly providerAcceptedAt: string | null;
  readonly deliveredAt: string | null;
  readonly failedAt: string | null;
  readonly bouncedAt: string | null;
  readonly completedAt: string | null;
  readonly outboxJobId: string | null;
}

export interface ReminderFacts {
  readonly lastAutomatic: ReminderRun | null;
  readonly lastManual: ReminderRun | null;
  readonly nextEligibleAt: string | null;
  readonly lastOutcome: ReminderDispatch | null;
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
const COMMUNICATION_TEMPLATE_STATUSES = ["draft", "approved", "archived"] as const;

const COMMUNICATION_RESPONSE_INVALID_CODE = "COMMUNICATION_INVALID_RESPONSE";
const COMMUNICATION_RESPONSE_INVALID_MESSAGE =
  "The communication API returned an invalid response.";
const COMMUNICATION_RESPONSE_INVALID_STATUS = 502;

function isRequiredCommunicationString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableCommunicationString(value: unknown): value is string | null {
  return value === null || isRequiredCommunicationString(value);
}

const COMMUNICATION_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function isCommunicationEmail(value: unknown): value is CommunicationSenderIdentity {
  return (
    typeof value === "string" &&
    value.length <= 320 &&
    value === value.trim() &&
    !/[\r\n]/u.test(value) &&
    COMMUNICATION_EMAIL_PATTERN.test(value)
  );
}

function isCommunicationTemplate(value: unknown): value is CommunicationTemplate {
  if (!isRecord(value)) return false;
  return (
    isRequiredCommunicationString(value.id) &&
    isRequiredCommunicationString(value.tenantId) &&
    isRequiredCommunicationString(value.eventId) &&
    isRequiredCommunicationString(value.name) &&
    typeof value.purpose === "string" &&
    COMMUNICATION_TEMPLATE_PURPOSES.includes(value.purpose as CommunicationTemplatePurpose) &&
    typeof value.version === "number" &&
    Number.isSafeInteger(value.version) &&
    value.version > 0 &&
    typeof value.status === "string" &&
    COMMUNICATION_TEMPLATE_STATUSES.includes(value.status as CommunicationTemplateStatus) &&
    isCommunicationEmail(value.sender) &&
    isRequiredCommunicationString(value.subject) &&
    isRequiredCommunicationString(value.html) &&
    isRequiredCommunicationString(value.text) &&
    Array.isArray(value.variables) &&
    value.variables.every((variable) => isRequiredCommunicationString(variable)) &&
    isRequiredCommunicationString(value.createdBy) &&
    isRequiredCommunicationString(value.createdAt) &&
    isRequiredCommunicationString(value.updatedAt) &&
    isNullableCommunicationString(value.approvedBy) &&
    isNullableCommunicationString(value.approvedAt)
  );
}

function communicationTemplateResponse(value: unknown): CommunicationTemplate {
  if (!isCommunicationTemplate(value)) throw invalidCommunicationResponse();
  return value;
}

function invalidCommunicationResponse(): CommunicationApiError {
  return new CommunicationApiError(
    COMMUNICATION_RESPONSE_INVALID_CODE,
    COMMUNICATION_RESPONSE_INVALID_MESSAGE,
    COMMUNICATION_RESPONSE_INVALID_STATUS,
  );
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}
function isReminderSubject(value: unknown): value is ReminderSubject {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (value.type === "task") return isRequiredCommunicationString(value.taskId);
  if (value.type === "review") return isRequiredCommunicationString(value.reviewAssignmentId);
  return false;
}

function isReminderRun(value: unknown): value is ReminderRun {
  if (!isRecord(value)) return false;
  return (
    isRequiredCommunicationString(value.id) &&
    isRequiredCommunicationString(value.organizationId) &&
    isRequiredCommunicationString(value.eventId) &&
    typeof value.triggerType === "string" &&
    REMINDER_TRIGGER_TYPES.includes(value.triggerType as ReminderTriggerType) &&
    typeof value.audienceType === "string" &&
    REMINDER_AUDIENCE_TYPES.includes(value.audienceType as ReminderAudienceType) &&
    isRequiredCommunicationString(value.audienceRevision) &&
    typeof value.candidateCount === "number" &&
    Number.isSafeInteger(value.candidateCount) &&
    value.candidateCount >= 0 &&
    typeof value.eligibleCount === "number" &&
    Number.isSafeInteger(value.eligibleCount) &&
    value.eligibleCount >= 0 &&
    typeof value.queuedCount === "number" &&
    Number.isSafeInteger(value.queuedCount) &&
    value.queuedCount >= 0 &&
    typeof value.skippedCount === "number" &&
    Number.isSafeInteger(value.skippedCount) &&
    value.skippedCount >= 0 &&
    typeof value.failedCount === "number" &&
    Number.isSafeInteger(value.failedCount) &&
    value.failedCount >= 0 &&
    typeof value.state === "string" &&
    REMINDER_RUN_STATES.includes(value.state as ReminderRunState) &&
    isNullableCommunicationString(value.configurationFailure) &&
    (value.actorId === null || isRequiredCommunicationString(value.actorId)) &&
    isRequiredCommunicationString(value.startedAt) &&
    isNullableCommunicationString(value.completedAt) &&
    isRequiredCommunicationString(value.createdAt) &&
    isRequiredCommunicationString(value.updatedAt)
  );
}

function isReminderDispatch(value: unknown): value is ReminderDispatch {
  if (!isRecord(value)) return false;
  const nullableMetadata = (entry: unknown): entry is Readonly<Record<string, unknown>> | null =>
    entry === null || isRecord(entry);
  return (
    isRequiredCommunicationString(value.id) &&
    isRequiredCommunicationString(value.runId) &&
    isRequiredCommunicationString(value.organizationId) &&
    isRequiredCommunicationString(value.eventId) &&
    isRequiredCommunicationString(value.recipient) &&
    isReminderSubject(value.subject) &&
    isRequiredCommunicationString(value.eligibilityReason) &&
    isRequiredCommunicationString(value.cadenceWindow) &&
    isRequiredCommunicationString(value.idempotencyKey) &&
    isNullableCommunicationString(value.providerMessageId) &&
    typeof value.status === "string" &&
    REMINDER_DISPATCH_STATUSES.includes(value.status as ReminderDispatchStatus) &&
    nullableMetadata(value.skipMetadata) &&
    nullableMetadata(value.failureMetadata) &&
    isRequiredCommunicationString(value.createdAt) &&
    isRequiredCommunicationString(value.updatedAt) &&
    isNullableCommunicationString(value.eligibleAt) &&
    isNullableCommunicationString(value.skippedAt) &&
    isNullableCommunicationString(value.queuedAt) &&
    isNullableCommunicationString(value.providerAcceptedAt) &&
    isNullableCommunicationString(value.deliveredAt) &&
    isNullableCommunicationString(value.failedAt) &&
    isNullableCommunicationString(value.bouncedAt) &&
    isNullableCommunicationString(value.completedAt) &&
    isNullableCommunicationString(value.outboxJobId)
  );
}

function isReminderFacts(value: unknown): value is ReminderFacts {
  if (!isRecord(value)) return false;
  return (
    (value.lastAutomatic === null || isReminderRun(value.lastAutomatic)) &&
    (value.lastManual === null || isReminderRun(value.lastManual)) &&
    isNullableCommunicationString(value.nextEligibleAt) &&
    (value.lastOutcome === null || isReminderDispatch(value.lastOutcome))
  );
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

export function escapeHtmlForPreview(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatCommunicationPurpose(
  purpose: CommunicationTemplatePurpose | null | undefined,
): string {
  if (purpose === null || purpose === undefined) return "Not specified";
  return purpose
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatCommunicationAudience(
  audience: CommunicationAudience | null | undefined,
): string {
  if (audience === null || audience === undefined) return "Not specified";
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
    purpose: "organizer_group_email" | "decision";
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
  listReminderRuns(eventId: string, signal?: AbortSignal): Promise<readonly ReminderRun[]>;
  listReminderDispatches(
    eventId: string,
    runId?: string,
    signal?: AbortSignal,
  ): Promise<readonly ReminderDispatch[]>;
  getReminderFacts(
    eventId: string,
    inputOrRecipient:
      | string
      | {
          readonly recipientApplicationId: string;
          readonly subject: ReminderSubject;
        },
    subjectOrSignal?: ReminderSubject | AbortSignal,
    signal?: AbortSignal,
  ): Promise<ReminderFacts>;
  runManualReminders(input: {
    eventId: string;
    idempotencyKey: string;
    expectedAudienceRevision: string;
    scheduledAt?: string;
  }): Promise<ReminderRun>;
  refreshReminderDelivery(
    eventId: string,
    dispatchId: string,
    signal?: AbortSignal,
  ): Promise<ReminderDispatch>;
  refreshDeliveryTruth(input: {
    eventId: string;
    dispatchId: string;
    providerMessageId?: string;
    status: ReminderDispatchStatus;
    failureMetadata?: Readonly<Record<string, unknown>>;
  }): Promise<ReminderDispatch>;
  recordReminderDispatchStatus(input: {
    eventId: string;
    dispatchId: string;
    providerMessageId?: string;
    status: ReminderDispatchStatus;
    failureMetadata?: Readonly<Record<string, unknown>>;
  }): Promise<ReminderDispatch>;
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
      const templates = Array.isArray(raw)
        ? raw
        : isRecord(raw) && Array.isArray(raw.templates)
          ? raw.templates
          : undefined;
      if (templates === undefined || !templates.every(isCommunicationTemplate)) {
        throw invalidCommunicationResponse();
      }
      return templates;
    },
    async getTemplate(eventId, templateId, version, signal) {
      const query = version === undefined ? "" : `?version=${encodeURIComponent(String(version))}`;
      return communicationTemplateResponse(
        await request<unknown>(
          eventId,
          `/templates/${segment(templateId, "template ID")}${query}`,
          signal === undefined ? {} : { signal },
        ),
      );
    },
    async createTemplate(input) {
      return communicationTemplateResponse(
        await request<unknown>(input.eventId, "/templates", {
          method: "POST",
          body: JSON.stringify({
            name: input.name,
            purpose: input.purpose,
            subject: input.subject,
            html: input.html,
            text: input.text,
            ...(input.variables === undefined ? {} : { variables: input.variables }),
          }),
        }),
      );
    },
    async createTemplateVersion(input) {
      return communicationTemplateResponse(
        await request<unknown>(
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
        ),
      );
    },
    async approveTemplate(input) {
      return communicationTemplateResponse(
        await request<unknown>(
          input.eventId,
          `/templates/${segment(input.templateId, "template ID")}/approve`,
          { method: "POST", body: JSON.stringify({ version: input.version }) },
        ),
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
    async listReminderRuns(eventId, signal) {
      const raw = await request<unknown>(
        eventId,
        "/reminders/runs",
        signal === undefined ? {} : { signal },
      );
      const runs = Array.isArray(raw)
        ? raw
        : isRecord(raw) && Array.isArray(raw.runs)
          ? raw.runs
          : undefined;
      if (runs === undefined || !runs.every(isReminderRun)) {
        throw invalidCommunicationResponse();
      }
      return runs;
    },
    async listReminderDispatches(eventId, runId, signal) {
      const query = runId === undefined ? "" : `?runId=${encodeURIComponent(runId)}`;
      const raw = await request<unknown>(
        eventId,
        `/reminders/dispatches${query}`,
        signal === undefined ? {} : { signal },
      );
      const dispatches = Array.isArray(raw)
        ? raw
        : isRecord(raw) && Array.isArray(raw.dispatches)
          ? raw.dispatches
          : undefined;
      if (dispatches === undefined || !dispatches.every(isReminderDispatch)) {
        throw invalidCommunicationResponse();
      }
      return dispatches;
    },
    async getReminderFacts(eventId, inputOrRecipient, subjectOrSignal, signal) {
      const input =
        typeof inputOrRecipient === "string"
          ? {
              recipientApplicationId: inputOrRecipient,
              subject: subjectOrSignal as ReminderSubject,
            }
          : inputOrRecipient;
      const requestSignal =
        typeof inputOrRecipient === "string"
          ? signal
          : typeof AbortSignal !== "undefined" && subjectOrSignal instanceof AbortSignal
            ? subjectOrSignal
            : signal;
      if (!isReminderSubject(input.subject)) {
        throw new TypeError("A reminder subject is required for reminder facts.");
      }
      const query = new URLSearchParams({
        recipientApplicationId: input.recipientApplicationId,
        subjectType: input.subject.type,
        ...(input.subject.type === "task"
          ? { taskId: input.subject.taskId }
          : { reviewAssignmentId: input.subject.reviewAssignmentId }),
      });
      const raw = await request<unknown>(
        eventId,
        `/reminders/facts?${query.toString()}`,
        requestSignal === undefined ? {} : { signal: requestSignal },
      );
      const facts = isRecord(raw) && isRecord(raw.facts) ? raw.facts : raw;
      if (!isReminderFacts(facts)) {
        throw invalidCommunicationResponse();
      }
      return facts;
    },
    async runManualReminders(input) {
      const idempotencyKey = input.idempotencyKey.trim();
      const expectedAudienceRevision = input.expectedAudienceRevision.trim();
      if (idempotencyKey.length === 0) {
        throw new TypeError("An idempotency key is required for reminder runs.");
      }
      if (expectedAudienceRevision.length === 0) {
        throw new TypeError("An audience revision is required for reminder runs.");
      }
      const raw = await request<unknown>(input.eventId, "/reminders/runs/manual", {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey },
        body: JSON.stringify({
          idempotencyKey,
          expectedAudienceRevision,
          ...(input.scheduledAt === undefined ? {} : { scheduledAt: input.scheduledAt }),
        }),
      });
      const run = isRecord(raw) && isRecord(raw.run) ? raw.run : raw;
      if (!isReminderRun(run)) {
        throw invalidCommunicationResponse();
      }
      return run;
    },
    async refreshReminderDelivery(eventId, dispatchId, signal) {
      const raw = await request<unknown>(
        eventId,
        `/reminders/dispatches/${segment(dispatchId, "dispatch ID")}`,
        signal === undefined ? {} : { signal },
      );
      const dispatch = isRecord(raw) && isRecord(raw.dispatch) ? raw.dispatch : raw;
      if (!isReminderDispatch(dispatch)) {
        throw invalidCommunicationResponse();
      }
      return dispatch;
    },
    async refreshDeliveryTruth(input) {
      const raw = await request<unknown>(
        input.eventId,
        `/reminders/dispatches/${segment(input.dispatchId, "dispatch ID")}/status`,
        {
          method: "POST",
          body: JSON.stringify({
            status: input.status,
            ...(input.providerMessageId === undefined
              ? {}
              : { providerMessageId: input.providerMessageId }),
            ...(input.failureMetadata === undefined
              ? {}
              : { failureMetadata: input.failureMetadata }),
          }),
        },
      );
      const dispatch = isRecord(raw) && isRecord(raw.dispatch) ? raw.dispatch : raw;
      if (!isReminderDispatch(dispatch)) {
        throw invalidCommunicationResponse();
      }
      return dispatch;
    },
    recordReminderDispatchStatus(input) {
      return this.refreshDeliveryTruth(input);
    },
  };
}

export const createCommunicationsApi = createCommunicationApi;
