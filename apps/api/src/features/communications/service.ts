import type {
  CommunicationActor,
  CommunicationAudience,
  CommunicationAuditEntry,
  CommunicationDelivery,
  CommunicationDeliveryAdapter,
  CommunicationDeliveryHistoryEntry,
  CommunicationDeliveryRequest,
  CommunicationDeliveryResult,
  CommunicationDeliveryStatus,
  CommunicationGrant,
  CommunicationPreview,
  CommunicationRecipient,
  CommunicationRecipientPreview,
  CommunicationRecipientSnapshot,
  CommunicationRenderData,
  CommunicationRepository,
  CommunicationRole,
  CommunicationSend,
  CommunicationSenderIdentities,
  CommunicationSenderIdentity,
  CommunicationSenderPurpose,
  CommunicationSendStatus,
  CommunicationTemplate,
  CommunicationTemplatePurpose,
  CommunicationTemplateSnapshot,
  ReminderCandidate,
  ReminderCandidateSourceResult,
  ReminderDispatch,
  ReminderDispatchStatus,
  ReminderFacts,
  ReminderRepository,
  ReminderRun,
  ReminderRuntime,
  ReminderSubject,
  ReminderTriggerType,
} from "./types";
import { COMMUNICATION_AUDIENCES, COMMUNICATION_TEMPLATE_PURPOSES } from "./types";

export type CommunicationErrorCode =
  | "COMMUNICATION_INVALID_INPUT"
  | "COMMUNICATION_FORBIDDEN"
  | "COMMUNICATION_NOT_FOUND"
  | "COMMUNICATION_CONFLICT"
  | "COMMUNICATION_UNAVAILABLE";

export const COMMUNICATION_OPERATION_MARKER = "__eventloom_speaker_operation";
type CommunicationPreviewOperation = "generic" | "speaker_invitation";

export class CommunicationError extends Error {
  readonly code: CommunicationErrorCode;
  readonly status: 400 | 403 | 404 | 409 | 503;

  constructor(code: CommunicationErrorCode, status: 400 | 403 | 404 | 409 | 503, message: string) {
    super(message);
    this.name = "CommunicationError";
    this.code = code;
    this.status = status;
  }
}

export interface CreateCommunicationTemplateInput {
  id?: string;
  eventId: string;
  name: string;
  purpose: CommunicationTemplatePurpose;
  sender?: CommunicationSenderIdentity;
  subject: string;
  html: string;
  text: string;
  variables?: readonly string[];
}

export interface CreateCommunicationTemplateVersionInput {
  templateId: string;
  eventId?: string;
  subject: string;
  html: string;
  text: string;
  variables?: readonly string[];
}

export interface CommunicationPreviewInput {
  eventId: string;
  purpose: CommunicationTemplatePurpose;
  templateId: string;
  templateVersion?: number;
  audience: CommunicationAudience;
  recipientIds?: readonly string[];
  data?: CommunicationRenderData;
  protectedRecipientDataKeys?: readonly string[];
}

export interface SendGroupCommunicationInput {
  eventId: string;
  previewId: string;
  idempotencyKey: string;
}

export type CommunicationTransactionalAction =
  | "accept"
  | "waitlist"
  | "reject"
  | "task"
  | "withdrawal";

export interface SendTransactionalCommunicationInput {
  eventId: string;
  purpose: Exclude<CommunicationTemplatePurpose, "organizer_group_email">;
  templateId?: string;
  templateVersion?: number;
  recipientIds: readonly string[];
  data?: CommunicationRenderData;
  idempotencyKey: string;
  action?: CommunicationTransactionalAction;
}

export interface RecordCommunicationDeliveryInput {
  eventId: string;
  sendId: string;
  recipientId: string;
  status: CommunicationDeliveryStatus;
  providerMessageId?: string;
  reason?: string;
  occurredAt?: string;
}

export interface CommunicationServiceOptions {
  clock?: () => Date;
  previewLifetimeMs?: number;
  reminders?: ReminderRuntime;
  senderIdentities?: CommunicationSenderIdentities;
}
export interface ReminderPreviewInput {
  organizationId?: string;
  eventId: string;
  triggerType?: ReminderTriggerType;
  scheduledAt?: string;
}

export interface RunManualRemindersInput {
  organizationId?: string;
  eventId: string;
  idempotencyKey: string;
  expectedAudienceRevision: string;
  scheduledAt?: string;
}

export interface RunAutomaticRemindersInput {
  organizationId?: string;
  eventId: string;
  scheduledAt: string;
}

export interface ReminderListRunsInput {
  organizationId?: string;
  eventId: string;
}

export interface ReminderListDispatchesInput {
  organizationId?: string;
  eventId: string;
  runId?: string;
}

export interface ReminderFactsInput {
  organizationId?: string;
  eventId: string;
  recipientApplicationId: string;
  subject: ReminderSubject;
}

export interface RecordReminderDispatchStatusInput {
  organizationId?: string;
  eventId: string;
  runId?: string;
  dispatchId?: string;
  providerMessageId?: string;
  status: ReminderDispatchStatus;
  failureMetadata?: Readonly<Record<string, unknown>>;
}

export interface ReminderPreview {
  audienceType: ReminderCandidateSourceResult["audienceType"];
  audienceRevision: string;
  candidates: readonly ReminderCandidate[];
}

function invalidInput(message: string): CommunicationError {
  return new CommunicationError("COMMUNICATION_INVALID_INPUT", 400, message);
}

function forbidden(message = "The actor is not authorized for this event."): CommunicationError {
  return new CommunicationError("COMMUNICATION_FORBIDDEN", 403, message);
}

function notFound(message = "The communication resource was not found."): CommunicationError {
  return new CommunicationError("COMMUNICATION_NOT_FOUND", 404, message);
}

function conflict(message: string): CommunicationError {
  return new CommunicationError("COMMUNICATION_CONFLICT", 409, message);
}

function unavailable(message: string): CommunicationError {
  return new CommunicationError("COMMUNICATION_UNAVAILABLE", 503, message);
}

function requireText(value: string, field: string, maximum: number): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximum) {
    throw invalidInput(`${field} must contain between 1 and ${maximum} characters.`);
  }
  return normalized;
}

function requirePositiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw invalidInput(`${field} must be a positive integer.`);
  }
  return value;
}

function requireIsoInstant(value: string, field: string): string {
  if (!Number.isFinite(Date.parse(value))) {
    throw invalidInput(`${field} must be an ISO-8601 instant.`);
  }
  return value;
}

function requireAudience(value: CommunicationAudience): CommunicationAudience {
  if (!COMMUNICATION_AUDIENCES.includes(value)) {
    throw invalidInput("The recipient audience is not supported.");
  }
  return value;
}

function requirePurpose(value: CommunicationTemplatePurpose): CommunicationTemplatePurpose {
  if (!COMMUNICATION_TEMPLATE_PURPOSES.includes(value)) {
    throw invalidInput("The communication template purpose is not approved.");
  }
  return value;
}

const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function validEmailAddress(value: string): boolean {
  return (
    value.length <= 320 &&
    value === value.trim() &&
    !/[\r\n]/u.test(value) &&
    EMAIL_ADDRESS_PATTERN.test(value)
  );
}

function resolveSenderIdentities(
  configured: CommunicationSenderIdentities | undefined,
): CommunicationSenderIdentities | undefined {
  if (configured === undefined) return undefined;
  for (const purpose of ["auth", "speakers", "calendar"] as const) {
    if (!validEmailAddress(configured[purpose])) {
      throw new TypeError(`Communication ${purpose} sender must be a valid email address.`);
    }
  }
  return { ...configured };
}

function senderPurposeForTemplatePurpose(
  purpose: CommunicationTemplatePurpose,
): CommunicationSenderPurpose {
  if (purpose === "verification") return "auth";
  if (
    purpose === "schedule_publish" ||
    purpose === "schedule_update" ||
    purpose === "schedule_cancel"
  ) {
    return "calendar";
  }
  return "speakers";
}

function senderForPurpose(
  purpose: CommunicationTemplatePurpose,
  identities: CommunicationSenderIdentities,
): CommunicationSenderIdentity {
  return identities[senderPurposeForTemplatePurpose(purpose)];
}

function hasGrant(actor: CommunicationActor, eventId: string, role: CommunicationRole): boolean {
  return actor.grants.some((grant) => grant.eventId === eventId && grant.role === role);
}

function requireOrganizer(actor: CommunicationActor, eventId: string): void {
  if (actor.kind !== "human" || !hasGrant(actor, eventId, "organizer")) {
    throw forbidden("A human event organizer must perform this communication action.");
  }
}

function requireDeliveryActor(actor: CommunicationActor, eventId: string): void {
  if (actor.kind === "human" && hasGrant(actor, eventId, "organizer")) {
    return;
  }
  if (actor.kind === "automation" && hasGrant(actor, eventId, "delivery")) {
    return;
  }
  throw forbidden("The actor cannot record delivery state for this event.");
}

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function cloneData(data: CommunicationRenderData | undefined): Readonly<Record<string, unknown>> {
  if (data === undefined) {
    return {};
  }
  return JSON.parse(JSON.stringify(data)) as Readonly<Record<string, unknown>>;
}

function cloneRecipient(recipient: CommunicationRecipient): CommunicationRecipientSnapshot {
  if (recipient.tenantId.length === 0 || recipient.eventId.length === 0) {
    throw invalidInput("Recipient scope is required.");
  }
  const email = requireText(recipient.email, "Recipient email", 320);
  if (!email.includes("@") || /[\r\n]/u.test(email)) {
    throw invalidInput("Recipient email is invalid.");
  }
  const id = requireText(recipient.id, "Recipient id", 200);
  return {
    id,
    participantId: recipient.participantId ?? id,
    tenantId: recipient.tenantId,
    eventId: recipient.eventId,
    email,
    displayName: requireText(recipient.displayName, "Recipient display name", 300),
    audiences: [...recipient.audiences],
    data: cloneData(recipient.data),
  };
}

function withoutRecipientDataKeys(
  recipient: CommunicationRecipientSnapshot,
  protectedDataKeys: readonly string[] | undefined,
): CommunicationRecipientSnapshot {
  if (protectedDataKeys === undefined || protectedDataKeys.length === 0) return recipient;
  const data = { ...recipient.data };
  for (const key of protectedDataKeys) delete data[key];
  return { ...recipient, data };
}

function templateSnapshot(template: CommunicationTemplate): CommunicationTemplateSnapshot {
  return {
    id: template.id,
    name: template.name,
    purpose: template.purpose,
    version: template.version,
    sender: template.sender,
    subject: template.subject,
    html: template.html,
    text: template.text,
  };
}

function stableValue(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableValue(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableValue(entry)}`).join(",")}}`;
}

function dataFingerprint(data: CommunicationRenderData): string {
  return stableValue(data);
}

function canonicalSendPayload(input: {
  purpose: CommunicationTemplatePurpose;
  audience: CommunicationAudience | null;
  templateId: string;
  templateVersion: number;
  recipientIds: readonly string[];
  data: CommunicationRenderData;
}): string {
  return stableValue({
    purpose: input.purpose,
    audience: input.audience,
    templateId: input.templateId,
    templateVersion: input.templateVersion,
    recipientIds: [...input.recipientIds].sort(),
    data: input.data,
  });
}

function sendMatchesPayload(
  send: CommunicationSend,
  input: Parameters<typeof canonicalSendPayload>[0],
): boolean {
  return (
    canonicalSendPayload({
      purpose: send.purpose,
      audience: send.audience,
      templateId: send.templateId,
      templateVersion: send.templateVersion,
      recipientIds: send.recipients.map((recipient) => recipient.id),
      data: send.data,
    }) === canonicalSendPayload(input)
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeSubject(value: string): string {
  return value.replace(/[\r\n]/gu, " ");
}

function readRenderValue(data: CommunicationRenderData, path: string): unknown {
  let current: unknown = data;
  for (const segment of path.split(".")) {
    if (typeof current !== "object" || current === null || !(segment in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function renderChannel(
  source: string,
  data: CommunicationRenderData,
  escapeValue: (value: string) => string,
): string {
  return source.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/gu, (_match, path: string) => {
    const value = readRenderValue(data, path);
    if (value === undefined || value === null) {
      throw invalidInput(`Template data is missing the ${path} value.`);
    }
    if (typeof value === "object" || typeof value === "function" || typeof value === "symbol") {
      throw invalidInput(`Template data for ${path} must be a scalar value.`);
    }
    return escapeValue(String(value));
  });
}

export interface RenderedCommunication {
  subject: string;
  html: string;
  text: string;
}

export function renderCommunicationTemplate(
  template: CommunicationTemplate | CommunicationTemplateSnapshot,
  data: CommunicationRenderData,
): RenderedCommunication {
  return {
    subject: renderChannel(template.subject, data, escapeSubject),
    html: renderChannel(template.html, data, escapeHtml),
    text: renderChannel(template.text, data, escapeSubject),
  };
}
export const renderTemplate = renderCommunicationTemplate;

function firstNameForRecipient(recipient: CommunicationRecipientSnapshot): string {
  const configured = recipient.data.first_name ?? recipient.data.firstName;
  if (typeof configured === "string" && configured.trim().length > 0) {
    return configured.trim();
  }
  return recipient.displayName.trim().split(/\s+/u)[0] ?? recipient.displayName;
}

function renderDataForRecipient(
  data: CommunicationRenderData,
  recipient: CommunicationRecipientSnapshot,
): CommunicationRenderData {
  const firstName = firstNameForRecipient(recipient);
  return {
    ...data,
    ...recipient.data,
    recipientId: recipient.id,
    first_name: firstName,
    display_name: recipient.displayName,
    email: recipient.email,
    displayName: recipient.displayName,
    recipient: {
      id: recipient.id,
      firstName,
      displayName: recipient.displayName,
      email: recipient.email,
    },
  };
}

export function redactCommunicationProviderReason(value: string): string {
  return value
    .replace(/\b(https?:\/\/)([^\s/@:]+):([^\s/@]+)@/giu, "$1[REDACTED]@")
    .replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+/giu, "$1 [REDACTED]")
    .replace(
      /\b(api[-_ ]?key|access[-_ ]?token|auth(?:orization)?|password|secret|token)\b(\s*[:=]\s*)([^\s,;]+)/giu,
      "$1$2[REDACTED]",
    );
}

function providerReason(value: string | undefined): string | undefined {
  return value === undefined ? undefined : redactCommunicationProviderReason(value);
}

function deliveryAction(status: CommunicationDeliveryStatus): CommunicationAuditEntry["action"] {
  return status === "queued"
    ? "delivery_queued"
    : (`delivery_${status}` as CommunicationAuditEntry["action"]);
}

interface CommunicationDeliverySummary {
  status: CommunicationSendStatus;
  recipientCount: number;
  queuedCount: number;
  deliveredCount: number;
  failedCount: number;
  terminal: boolean;
}

function summarizeDeliveries(
  deliveries: readonly CommunicationDelivery[],
  recipientCount = deliveries.length,
): CommunicationDeliverySummary {
  const normalizedRecipientCount = Math.max(recipientCount, deliveries.length);
  const missingDeliveryCount = normalizedRecipientCount - deliveries.length;
  let queuedCount = missingDeliveryCount;
  let deliveredCount = 0;
  let failedCount = 0;
  for (const delivery of deliveries) {
    if (delivery.status === "queued") {
      queuedCount += 1;
    } else if (delivery.status === "delivered") {
      deliveredCount += 1;
    } else {
      failedCount += 1;
    }
  }
  const terminal = queuedCount === 0;
  const status: CommunicationSendStatus = !terminal
    ? "queued"
    : normalizedRecipientCount > 0 && deliveredCount === normalizedRecipientCount
      ? "delivered"
      : normalizedRecipientCount > 0 && failedCount === normalizedRecipientCount
        ? "failed"
        : "partial";
  return {
    status,
    recipientCount: normalizedRecipientCount,
    queuedCount,
    deliveredCount,
    failedCount,
    terminal,
  };
}

function copySend(send: CommunicationSend): CommunicationSend {
  const recipients = send.recipients.map((recipient) => ({
    ...recipient,
    audiences: [...recipient.audiences],
    data: cloneData(recipient.data),
  }));
  const deliveries = send.deliveries.map((delivery) => ({
    ...delivery,
    failureReason:
      delivery.failureReason === null
        ? null
        : redactCommunicationProviderReason(delivery.failureReason),
    history: delivery.history.map((entry) => ({
      ...entry,
      reason: entry.reason === null ? null : redactCommunicationProviderReason(entry.reason),
    })),
  }));
  const summary = summarizeDeliveries(deliveries, recipients.length);
  return {
    ...send,
    ...summary,
    data: cloneData(send.data),
    template: { ...send.template },
    recipients,
    deliveries,
    history: send.history.map((entry) => {
      const details = cloneData(entry.details);
      return {
        ...entry,
        details:
          typeof details.reason === "string"
            ? { ...details, reason: redactCommunicationProviderReason(details.reason) }
            : details,
      };
    }),
  };
}

function copyPreview(preview: CommunicationPreview): CommunicationPreview {
  return {
    ...preview,
    data: cloneData(preview.data),
    recipientIds: [...preview.recipientIds],
    recipients: preview.recipients.map((recipient) => ({
      ...recipient,
      audiences: [...recipient.audiences],
      data: cloneData(recipient.data),
    })),
    recipientPreviews: preview.recipientPreviews.map((recipient) => ({ ...recipient })),
    template: { ...preview.template },
  };
}
function cloneReminderMetadata(
  metadata: Readonly<Record<string, unknown>> | null,
): Readonly<Record<string, unknown>> | null {
  return metadata === null
    ? null
    : (JSON.parse(JSON.stringify(metadata)) as Readonly<Record<string, unknown>>);
}

function cloneReminderSubject(subject: ReminderSubject): ReminderSubject {
  return subject.type === "task"
    ? { type: "task", taskId: subject.taskId }
    : { type: "review", reviewAssignmentId: subject.reviewAssignmentId };
}

function copyReminderCandidate(candidate: ReminderCandidate): ReminderCandidate {
  return {
    ...candidate,
    subject: cloneReminderSubject(candidate.subject),
    renderedMessage: { ...candidate.renderedMessage },
  };
}

function copyReminderRun(run: ReminderRun): ReminderRun {
  return { ...run };
}

function copyReminderDispatch(dispatch: ReminderDispatch): ReminderDispatch {
  return {
    ...dispatch,
    subject: cloneReminderSubject(dispatch.subject),
    skipMetadata: cloneReminderMetadata(dispatch.skipMetadata),
    failureMetadata: cloneReminderMetadata(dispatch.failureMetadata),
  };
}

function reminderSubjectKey(subject: ReminderSubject): string {
  return subject.type === "task"
    ? `task:${subject.taskId}`
    : `review:${subject.reviewAssignmentId}`;
}

function reminderRunId(
  organizationId: string,
  eventId: string,
  triggerType: ReminderTriggerType,
  key: string,
): string {
  return `reminder-run:${organizationId}:${eventId}:${triggerType}:${key}`;
}

function reminderDispatchId(idempotencyKey: string): string {
  return `reminder-dispatch:${idempotencyKey}`;
}

function reminderIdempotencyKey(
  organizationId: string,
  eventId: string,
  triggerType: ReminderTriggerType,
  candidate: ReminderCandidate,
): string {
  return [
    "reminder",
    organizationId,
    eventId,
    triggerType,
    reminderSubjectKey(candidate.subject),
    candidate.recipientApplicationId,
    candidate.cadenceWindow,
  ].join(":");
}

function reminderHourWindow(scheduledAt: string): string {
  const parsed = Date.parse(scheduledAt);
  if (!Number.isFinite(parsed)) {
    throw invalidInput("scheduledAt must be an ISO-8601 instant.");
  }
  return new Date(Math.floor(parsed / 3_600_000) * 3_600_000).toISOString();
}

function reminderScope(
  actor: CommunicationActor,
  organizationId: string | undefined,
  eventId: string,
): { organizationId: string; eventId: string } {
  const normalizedEventId = requireText(eventId, "Event id", 200);
  const normalizedOrganizationId = requireText(
    organizationId ?? actor.tenantId,
    "Organization id",
    200,
  );
  if (normalizedOrganizationId !== actor.tenantId) {
    throw forbidden("The actor cannot access this organization.");
  }
  return { organizationId: normalizedOrganizationId, eventId: normalizedEventId };
}

function requireAutomationDelivery(actor: CommunicationActor, eventId: string): void {
  if (actor.kind !== "automation" || !hasGrant(actor, eventId, "delivery")) {
    throw forbidden("An automation delivery actor must perform this reminder action.");
  }
}

function reminderErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : String(error);
}

function isReminderTerminal(status: ReminderDispatchStatus): boolean {
  return (
    status === "skipped" || status === "failed" || status === "bounced" || status === "delivered"
  );
}

function reminderCountStatus(status: ReminderDispatchStatus): {
  eligible: number;
  queued: number;
  skipped: number;
  failed: number;
} {
  return {
    eligible:
      status === "eligible" ||
      status === "queued" ||
      status === "provider_accepted" ||
      status === "delivered" ||
      status === "failed" ||
      status === "bounced"
        ? 1
        : 0,
    queued: status === "queued" || status === "provider_accepted" || status === "delivered" ? 1 : 0,
    skipped: status === "skipped" ? 1 : 0,
    failed: status === "failed" || status === "bounced" ? 1 : 0,
  };
}

export class CommunicationService {
  private readonly clock: () => Date;
  private readonly previewLifetimeMs: number;
  private readonly senderIdentities: CommunicationSenderIdentities | undefined;
  private reminders: ReminderRuntime | undefined;

  constructor(
    private readonly repository: CommunicationRepository,
    private readonly deliveryAdapter?: CommunicationDeliveryAdapter,
    options: CommunicationServiceOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.previewLifetimeMs = options.previewLifetimeMs ?? 15 * 60 * 1_000;
    this.senderIdentities = resolveSenderIdentities(options.senderIdentities);
    if (!Number.isSafeInteger(this.previewLifetimeMs) || this.previewLifetimeMs < 1_000) {
      throw new Error("previewLifetimeMs must be at least one second.");
    }
    this.reminders = options.reminders;
  }

  async createTemplate(
    actor: CommunicationActor,
    input: CreateCommunicationTemplateInput,
  ): Promise<CommunicationTemplate> {
    requireOrganizer(actor, input.eventId);
    const purpose = requirePurpose(input.purpose);
    const name = requireText(input.name, "Template name", 200);
    const subject = requireText(input.subject, "Template subject", 500);
    const html = requireText(input.html, "Template html", 100_000);
    const text = requireText(input.text, "Template text", 100_000);
    const id =
      input.id === undefined ? createId("template") : requireText(input.id, "Template id", 200);
    if (this.senderIdentities === undefined) {
      throw unavailable("Communication sender identities are not configured.");
    }
    const approvedSender = senderForPurpose(purpose, this.senderIdentities);
    const sender = input.sender ?? approvedSender;
    if (!validEmailAddress(sender) || sender !== approvedSender) {
      throw invalidInput(`The ${purpose} purpose must use its approved sender identity.`);
    }
    const variables = this.validateVariables(input.variables ?? [], subject, html, text);
    const current = await this.repository.getTemplate(actor.tenantId, input.eventId, id);
    if (current !== undefined) {
      throw conflict("A template with this id already exists.");
    }
    const now = this.clock().toISOString();
    return this.repository.saveTemplate({
      id,
      tenantId: actor.tenantId,
      eventId: input.eventId,
      name,
      purpose,
      version: 1,
      status: "draft",
      sender,
      subject,
      html,
      text,
      variables,
      createdBy: actor.userId,
      createdAt: now,
      updatedAt: now,
      approvedBy: null,
      approvedAt: null,
    });
  }

  async createTemplateVersion(
    actor: CommunicationActor,
    input: CreateCommunicationTemplateVersionInput,
  ): Promise<CommunicationTemplate> {
    const existing = await this.findTemplateForActor(actor, input.templateId, input.eventId);
    requireOrganizer(actor, existing.eventId);
    const subject = requireText(input.subject, "Template subject", 500);
    const html = requireText(input.html, "Template html", 100_000);
    const text = requireText(input.text, "Template text", 100_000);
    const variables = this.validateVariables(
      input.variables ?? existing.variables,
      subject,
      html,
      text,
    );
    if (this.senderIdentities === undefined) {
      throw unavailable("Communication sender identities are not configured.");
    }
    const sender = senderForPurpose(existing.purpose, this.senderIdentities);
    const versions = await this.repository.listTemplates(actor.tenantId, existing.eventId);
    const latest = versions
      .filter((candidate) => candidate.id === existing.id)
      .reduce((maximum, candidate) => Math.max(maximum, candidate.version), 0);
    const now = this.clock().toISOString();
    return this.repository.saveTemplate({
      ...existing,
      version: latest + 1,
      status: "draft",
      sender,
      subject,
      html,
      text,
      variables,
      createdBy: actor.userId,
      createdAt: now,
      updatedAt: now,
      approvedBy: null,
      approvedAt: null,
    });
  }

  async approveTemplate(
    actor: CommunicationActor,
    eventId: string,
    templateId: string,
    version: number,
  ): Promise<CommunicationTemplate> {
    requireOrganizer(actor, eventId);
    requirePositiveInteger(version, "Template version");
    const template = await this.repository.getTemplate(
      actor.tenantId,
      eventId,
      templateId,
      version,
    );
    if (template === undefined) {
      throw notFound("The template version was not found.");
    }
    if (template.status === "archived") {
      throw conflict("An archived template version cannot be approved.");
    }
    const now = this.clock().toISOString();
    const approved = {
      ...template,
      status: "approved",
      approvedBy: actor.userId,
      approvedAt: now,
      updatedAt: now,
    } satisfies CommunicationTemplate;
    return this.repository.updateTemplate?.(approved) ?? this.repository.saveTemplate(approved);
  }

  async archiveTemplate(
    actor: CommunicationActor,
    eventId: string,
    templateId: string,
    version: number,
  ): Promise<CommunicationTemplate> {
    requireOrganizer(actor, eventId);
    const template = await this.repository.getTemplate(
      actor.tenantId,
      eventId,
      templateId,
      version,
    );
    if (template === undefined) {
      throw notFound("The template version was not found.");
    }
    const archived = {
      ...template,
      status: "archived",
      updatedAt: this.clock().toISOString(),
    } satisfies CommunicationTemplate;
    return this.repository.updateTemplate?.(archived) ?? this.repository.saveTemplate(archived);
  }

  async listTemplates(
    actor: CommunicationActor,
    eventId: string,
    purpose?: CommunicationTemplatePurpose,
  ): Promise<readonly CommunicationTemplate[]> {
    requireOrganizer(actor, eventId);
    if (purpose !== undefined) {
      requirePurpose(purpose);
    }
    return this.repository.listTemplates(actor.tenantId, eventId, purpose);
  }

  async getTemplate(
    actor: CommunicationActor,
    eventId: string,
    templateId: string,
    version?: number,
  ): Promise<CommunicationTemplate> {
    requireOrganizer(actor, eventId);
    const template = await this.repository.getTemplate(
      actor.tenantId,
      eventId,
      templateId,
      version,
    );
    if (template === undefined) {
      throw notFound("The template was not found.");
    }
    return template;
  }

  async previewGroupSend(
    actor: CommunicationActor,
    input: CommunicationPreviewInput,
  ): Promise<CommunicationPreview> {
    return this.previewGroupSendInternal(actor, input, "generic");
  }

  async previewInvitationGroupSend(
    actor: CommunicationActor,
    input: CommunicationPreviewInput,
  ): Promise<CommunicationPreview> {
    return this.previewGroupSendInternal(actor, input, "speaker_invitation");
  }

  private async previewGroupSendInternal(
    actor: CommunicationActor,
    input: CommunicationPreviewInput,
    operation: CommunicationPreviewOperation,
  ): Promise<CommunicationPreview> {
    requireOrganizer(actor, input.eventId);
    if (input.purpose !== "organizer_group_email" && input.purpose !== "decision") {
      throw invalidInput(
        "Only organizer group email and decision templates can preview a participant audience.",
      );
    }
    const audience = requireAudience(input.audience);
    if (
      input.purpose === "decision" &&
      audience !== "accepted_participants" &&
      audience !== "waitlisted_participants" &&
      audience !== "rejected_participants"
    ) {
      throw invalidInput("Decision templates require a decision-status participant audience.");
    }
    const recipientIds = this.validateRecipientIds(input.recipientIds);
    const authorization = this.assertAudienceAuthorized(actor.tenantId, input.eventId, audience);
    const templatePromise = this.resolveApprovedTemplate(
      actor.tenantId,
      input.eventId,
      input.templateId,
      input.templateVersion,
      input.purpose,
    );
    const recipientsPromise =
      recipientIds === undefined
        ? this.repository.listRecipients(actor.tenantId, input.eventId, audience)
        : this.repository.getRecipientsByIds(actor.tenantId, input.eventId, recipientIds);
    const [, template, recipients] = await Promise.all([
      authorization,
      templatePromise,
      recipientsPromise,
    ]);
    if (recipientIds !== undefined && recipients.length !== recipientIds.length) {
      throw notFound("One or more preview recipients were not found for this event.");
    }
    const snapshots = recipients.map((recipient) => {
      const snapshot = withoutRecipientDataKeys(
        this.assertRecipientScope(recipient, actor, input.eventId),
        input.protectedRecipientDataKeys,
      );
      if (
        recipientIds !== undefined &&
        snapshot.audiences.length > 0 &&
        !snapshot.audiences.includes(audience)
      ) {
        throw notFound("One or more preview recipients do not belong to the selected audience.");
      }
      return snapshot;
    });
    const data = {
      ...cloneData(input.data),
      [COMMUNICATION_OPERATION_MARKER]:
        operation === "speaker_invitation" ? "speaker_invitation" : "generic",
    };
    const recipientPreviews: CommunicationRecipientPreview[] = snapshots.map((recipient) => {
      const renderedRecipient = renderCommunicationTemplate(
        template,
        renderDataForRecipient(data, recipient),
      );
      return {
        recipientId: recipient.id,
        email: recipient.email,
        displayName: recipient.displayName,
        ...renderedRecipient,
      };
    });
    const firstPreview = recipientPreviews[0];
    const rendered =
      firstPreview ??
      renderCommunicationTemplate(
        template,
        renderDataForRecipient(data, this.emptyRecipient(actor.tenantId, input.eventId)),
      );
    const now = this.clock();
    const preview: CommunicationPreview = {
      id: createId("preview"),
      tenantId: actor.tenantId,
      eventId: input.eventId,
      purpose: input.purpose,
      templateId: template.id,
      templateVersion: template.version,
      audience,
      data,
      recipientCount: snapshots.length,
      recipientIds: snapshots.map((recipient) => recipient.id),
      recipients: snapshots,
      recipientPreviews,
      template: templateSnapshot(template),
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      createdBy: actor.userId,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.previewLifetimeMs).toISOString(),
    };
    return this.repository.savePreview(preview);
  }

  async previewSend(
    actor: CommunicationActor,
    input: CommunicationPreviewInput,
  ): Promise<CommunicationPreview> {
    return this.previewGroupSend(actor, input);
  }
  async previewOrganizerGroup(
    actor: CommunicationActor,
    input: CommunicationPreviewInput,
  ): Promise<CommunicationPreview> {
    return this.previewGroupSend(actor, input);
  }

  async sendGroup(
    actor: CommunicationActor,
    input: SendGroupCommunicationInput,
  ): Promise<CommunicationSend> {
    requireOrganizer(actor, input.eventId);
    const idempotencyKey = requireText(input.idempotencyKey, "Idempotency key", 300);
    const preview = await this.repository.getPreview(
      actor.tenantId,
      input.eventId,
      input.previewId,
    );
    if (preview === undefined) {
      throw notFound("The communication preview was not found.");
    }
    if (Date.parse(preview.expiresAt) <= this.clock().getTime()) {
      throw conflict("The communication preview has expired; create a new preview.");
    }
    await this.assertAudienceAuthorized(actor.tenantId, input.eventId, preview.audience);
    const template = await this.resolveApprovedTemplate(
      actor.tenantId,
      input.eventId,
      preview.templateId,
      preview.templateVersion,
      preview.purpose,
    );
    if (preview.templateVersion !== template.version || preview.templateId !== template.id) {
      throw conflict("The preview template version is no longer available.");
    }
    const recipients = preview.recipients.map((recipient) => ({
      ...recipient,
      audiences: [...recipient.audiences],
      data: cloneData(recipient.data),
    }));
    if (recipients.length === 0) {
      throw invalidInput("The selected audience has no recipients.");
    }
    const existing = await this.repository.findSendByIdempotency(
      actor.tenantId,
      input.eventId,
      idempotencyKey,
    );
    if (existing !== undefined) {
      if (
        !sendMatchesPayload(existing, {
          purpose: preview.purpose,
          audience: preview.audience,
          templateId: template.id,
          templateVersion: template.version,
          recipientIds: recipients.map((recipient) => recipient.id),
          data: preview.data,
        })
      ) {
        throw conflict(
          "The idempotency key was already used with a different communication payload.",
        );
      }
      return copySend(existing);
    }
    if (this.deliveryAdapter === undefined) {
      throw unavailable("Operational email delivery is not configured.");
    }
    const previewTemplate: CommunicationTemplate = {
      ...template,
      name: preview.template.name,
      purpose: preview.template.purpose,
      sender: preview.template.sender,
      subject: preview.template.subject,
      html: preview.template.html,
      text: preview.template.text,
    };
    const created = await this.createSend(actor, {
      eventId: input.eventId,
      purpose: preview.purpose,
      audience: preview.audience,
      template: previewTemplate,
      recipients,
      data: preview.data,
      idempotencyKey,
      previewId: preview.id,
    });
    return created.created ? this.deliverSend(actor, created.send) : copySend(created.send);
  }
  async sendOrganizerGroup(
    actor: CommunicationActor,
    input: SendGroupCommunicationInput,
  ): Promise<CommunicationSend> {
    return this.sendGroup(actor, input);
  }

  async sendTransactional(
    actor: CommunicationActor,
    input: SendTransactionalCommunicationInput,
  ): Promise<CommunicationSend> {
    requireOrganizer(actor, input.eventId);
    const purpose = requirePurpose(input.purpose);
    if (purpose === "organizer_group_email") {
      throw invalidInput("Organizer group email must use the preview-before-send workflow.");
    }
    if (input.action !== undefined) {
      if (input.action === "task" && purpose !== "task") {
        throw invalidInput("Task notifications must use the task template purpose.");
      }
      if (input.action !== "task" && purpose !== "decision") {
        throw invalidInput("Decision outcomes must use the decision template purpose.");
      }
    }
    const idempotencyKey = requireText(input.idempotencyKey, "Idempotency key", 300);
    if (input.recipientIds.length === 0) {
      throw invalidInput("At least one recipient is required.");
    }
    const template = await this.resolveApprovedTemplate(
      actor.tenantId,
      input.eventId,
      input.templateId,
      input.templateVersion,
      purpose,
    );
    const recipients = await this.repository.getRecipientsByIds(
      actor.tenantId,
      input.eventId,
      input.recipientIds,
    );
    if (recipients.length !== new Set(input.recipientIds).size) {
      throw notFound("One or more recipients were not found for this event.");
    }
    const snapshots = recipients.map((recipient) =>
      this.assertRecipientScope(recipient, actor, input.eventId),
    );
    const data = cloneData(input.data);
    const existing = await this.repository.findSendByIdempotency(
      actor.tenantId,
      input.eventId,
      idempotencyKey,
    );
    if (existing !== undefined) {
      if (
        !sendMatchesPayload(existing, {
          purpose,
          audience: null,
          templateId: template.id,
          templateVersion: template.version,
          recipientIds: snapshots.map((recipient) => recipient.id),
          data,
        })
      ) {
        throw conflict(
          "The idempotency key was already used with a different communication payload.",
        );
      }
      return copySend(existing);
    }
    if (this.deliveryAdapter === undefined) {
      throw unavailable("Operational email delivery is not configured.");
    }
    const created = await this.createSend(actor, {
      eventId: input.eventId,
      purpose,
      audience: null,
      template,
      recipients: snapshots,
      data,
      idempotencyKey,
      previewId: null,
    });
    return created.created ? this.deliverSend(actor, created.send) : copySend(created.send);
  }

  async sendDecision(
    actor: CommunicationActor,
    input: Omit<SendTransactionalCommunicationInput, "purpose" | "action"> & {
      status: "accepted" | "waitlisted" | "rejected";
      templateId?: string;
      templateVersion?: number;
    },
  ): Promise<CommunicationSend> {
    return this.sendTransactional(actor, {
      ...input,
      purpose: "decision",
      action:
        input.status === "accepted"
          ? "accept"
          : input.status === "waitlisted"
            ? "waitlist"
            : "reject",
    });
  }

  async sendTask(
    actor: CommunicationActor,
    input: Omit<SendTransactionalCommunicationInput, "purpose" | "action">,
  ): Promise<CommunicationSend> {
    return this.sendTransactional(actor, { ...input, purpose: "task", action: "task" });
  }

  async sendWithdrawal(
    actor: CommunicationActor,
    input: Omit<SendTransactionalCommunicationInput, "purpose" | "action">,
  ): Promise<CommunicationSend> {
    return this.sendTransactional(actor, { ...input, purpose: "decision", action: "withdrawal" });
  }

  async retryFailed(
    actor: CommunicationActor,
    eventId: string,
    sendId: string,
  ): Promise<CommunicationSend> {
    requireOrganizer(actor, eventId);
    if (this.deliveryAdapter === undefined) {
      throw unavailable("Operational email delivery is not configured.");
    }
    const send = await this.repository.getSend(actor.tenantId, eventId, sendId);
    if (send === undefined) {
      throw notFound("The communication send was not found.");
    }
    const failed = new Set(
      send.deliveries
        .filter((delivery) => delivery.status === "failed")
        .map((delivery) => delivery.recipientId),
    );
    return failed.size === 0 ? copySend(send) : this.deliverSend(actor, send, failed);
  }
  async getPreview(
    actor: CommunicationActor,
    eventId: string,
    previewId: string,
  ): Promise<CommunicationPreview> {
    requireOrganizer(actor, eventId);
    const preview = await this.repository.getPreview(actor.tenantId, eventId, previewId);
    if (preview === undefined) {
      throw notFound("The communication preview was not found.");
    }
    return copyPreview(preview);
  }

  async listSends(
    actor: CommunicationActor,
    eventId: string,
  ): Promise<readonly CommunicationSend[]> {
    requireOrganizer(actor, eventId);
    if (this.repository.listSends === undefined) {
      throw unavailable("Durable communication send history is not configured.");
    }
    return (await this.repository.listSends(actor.tenantId, eventId)).map(copySend);
  }

  async getSend(
    actor: CommunicationActor,
    eventId: string,
    sendId: string,
  ): Promise<CommunicationSend> {
    requireOrganizer(actor, eventId);
    const send = await this.repository.getSend(actor.tenantId, eventId, sendId);
    if (send === undefined) {
      throw notFound("The communication send was not found.");
    }
    return copySend(send);
  }

  async listDeliveryHistory(
    actor: CommunicationActor,
    eventId: string,
    sendId: string,
  ): Promise<{
    history: readonly CommunicationAuditEntry[];
    deliveries: readonly CommunicationDelivery[];
    recipientCount: number;
    queuedCount: number;
    deliveredCount: number;
    failedCount: number;
    terminal: boolean;
  }> {
    const send = await this.getSend(actor, eventId, sendId);
    return {
      history: send.history,
      deliveries: send.deliveries,
      recipientCount: send.recipientCount,
      queuedCount: send.queuedCount,
      deliveredCount: send.deliveredCount,
      failedCount: send.failedCount,
      terminal: send.terminal,
    };
  }

  async recordDeliveryStatus(
    actor: CommunicationActor,
    input: RecordCommunicationDeliveryInput,
  ): Promise<CommunicationSend> {
    requireDeliveryActor(actor, input.eventId);
    const send = await this.repository.getSend(actor.tenantId, input.eventId, input.sendId);
    if (send === undefined) {
      throw notFound("The communication send was not found.");
    }
    const delivery = send.deliveries.find(
      (candidate) => candidate.recipientId === input.recipientId,
    );
    if (delivery === undefined) {
      throw notFound("The delivery recipient was not found.");
    }
    const status = input.status;
    const reason = providerReason(input.reason);
    const terminalStatus =
      delivery.status === "delivered" ||
      delivery.status === "bounced" ||
      delivery.status === "complained";
    if (terminalStatus && status !== delivery.status) {
      throw conflict("A terminal delivery state cannot move to another state.");
    }
    if (
      status === delivery.status &&
      (input.providerMessageId === undefined ||
        input.providerMessageId === delivery.providerMessageId) &&
      (reason === undefined || reason === delivery.failureReason)
    ) {
      return copySend(send);
    }
    if (status === "queued" && delivery.status !== "queued" && delivery.status !== "failed") {
      throw conflict("Only a failed delivery can be queued for retry.");
    }
    const occurredAt =
      input.occurredAt === undefined
        ? this.clock().toISOString()
        : requireIsoInstant(input.occurredAt, "Delivery timestamp");
    const historyEntry: CommunicationDeliveryHistoryEntry = {
      id: createId("delivery-event"),
      status,
      occurredAt,
      providerMessageId: input.providerMessageId ?? delivery.providerMessageId,
      reason: reason ?? null,
      actorId: actor.userId,
    };
    const nextDelivery: CommunicationDelivery = {
      ...delivery,
      status,
      providerMessageId: input.providerMessageId ?? delivery.providerMessageId,
      failureReason:
        status === "failed" || status === "bounced" || status === "complained"
          ? (reason ?? delivery.failureReason)
          : null,
      attempts: delivery.attempts,
      history: [...delivery.history, historyEntry],
    };
    const audit: CommunicationAuditEntry = {
      id: createId("communication-audit"),
      tenantId: send.tenantId,
      eventId: send.eventId,
      sendId: send.id,
      recipientId: input.recipientId,
      action:
        status === "queued" && delivery.status === "failed"
          ? "delivery_retry"
          : deliveryAction(status),
      actorId: actor.userId,
      occurredAt,
      details: {
        providerMessageId: input.providerMessageId ?? null,
        reason: reason ?? null,
      },
    };
    const deliveries = send.deliveries.map((candidate) =>
      candidate.recipientId === input.recipientId ? nextDelivery : candidate,
    );
    const next: CommunicationSend = {
      ...send,
      ...summarizeDeliveries(deliveries, send.recipientCount),
      deliveries,
      history: [...send.history, audit],
      updatedAt: occurredAt,
    };
    return this.repository.saveSend(next);
  }

  private validateVariables(
    variables: readonly string[],
    ...sources: readonly string[]
  ): readonly string[] {
    const unique = [
      ...new Set(variables.map((variable) => requireText(variable, "Template variable", 100))),
    ];
    const tokens = new Set<string>();
    for (const source of sources) {
      for (const match of source.matchAll(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/gu)) {
        const token = match[1];
        if (token !== undefined) {
          tokens.add(token);
        }
      }
    }
    for (const token of tokens) {
      if (unique.length > 0 && !unique.includes(token)) {
        throw invalidInput(`Template token ${token} is not declared in variables.`);
      }
    }
    return unique.length > 0 ? unique : [...tokens];
  }

  private async findTemplateForActor(
    actor: CommunicationActor,
    templateId: string,
    eventId?: string,
  ): Promise<CommunicationTemplate> {
    const eventIds =
      eventId === undefined
        ? actor.grants.filter((grant) => grant.role === "organizer").map((grant) => grant.eventId)
        : [eventId];
    for (const candidateEventId of eventIds) {
      const versions = await this.repository.listTemplates(actor.tenantId, candidateEventId);
      const found = versions.find((template) => template.id === templateId);
      if (found !== undefined) {
        requireOrganizer(actor, found.eventId);
        return found;
      }
    }
    throw notFound("The template was not found.");
  }

  private async resolveApprovedTemplate(
    tenantId: string,
    eventId: string,
    templateId: string | undefined,
    version: number | undefined,
    purpose: CommunicationTemplatePurpose,
  ): Promise<CommunicationTemplate> {
    requirePurpose(purpose);
    if (version !== undefined) {
      requirePositiveInteger(version, "Template version");
    }
    const templates = await this.repository.listTemplates(tenantId, eventId, purpose);
    const candidates = templates.filter(
      (template) =>
        template.purpose === purpose &&
        template.status === "approved" &&
        (templateId === undefined || template.id === templateId) &&
        (version === undefined || template.version === version),
    );
    const selected = candidates.reduce<CommunicationTemplate | undefined>(
      (current, candidate) =>
        current === undefined || candidate.version > current.version ? candidate : current,
      undefined,
    );
    if (selected === undefined) {
      throw notFound("No approved template version is available for this purpose.");
    }
    if (
      !validEmailAddress(selected.sender) ||
      (this.senderIdentities !== undefined &&
        selected.sender !== senderForPurpose(purpose, this.senderIdentities))
    ) {
      throw invalidInput(`The ${purpose} purpose must use its approved sender identity.`);
    }
    return selected;
  }

  private async assertAudienceAuthorized(
    tenantId: string,
    eventId: string,
    audience: CommunicationAudience,
  ): Promise<void> {
    const authorized =
      this.repository.isAudienceAuthorized === undefined
        ? true
        : await this.repository.isAudienceAuthorized(tenantId, eventId, audience);
    if (!authorized) {
      throw forbidden("This recipient audience is not authorized for the event.");
    }
  }

  private validateRecipientIds(
    recipientIds: readonly string[] | undefined,
  ): readonly string[] | undefined {
    if (recipientIds === undefined) return undefined;
    if (recipientIds.length === 0) {
      throw invalidInput(
        "At least one preview recipient is required when recipientIds is provided.",
      );
    }
    const validated = recipientIds.map((recipientId) => {
      const normalized = requireText(recipientId, "Recipient id", 200);
      if (normalized !== recipientId) {
        throw invalidInput("Recipient ids cannot contain surrounding whitespace.");
      }
      return normalized;
    });
    if (new Set(validated).size !== validated.length) {
      throw invalidInput("Recipient ids must be unique.");
    }
    return validated;
  }

  private assertRecipientScope(
    recipient: CommunicationRecipient,
    actor: CommunicationActor,
    eventId: string,
  ): CommunicationRecipientSnapshot {
    if (recipient.tenantId !== actor.tenantId || recipient.eventId !== eventId) {
      throw notFound("A recipient does not belong to this event.");
    }
    return cloneRecipient(recipient);
  }

  private emptyRecipient(tenantId: string, eventId: string): CommunicationRecipientSnapshot {
    return {
      id: "preview",
      participantId: "preview",
      tenantId,
      eventId,
      email: "preview@example.invalid",
      displayName: "Preview recipient",
      audiences: [],
      data: {},
    };
  }

  private async createSend(
    actor: CommunicationActor,
    input: {
      eventId: string;
      purpose: CommunicationTemplatePurpose;
      audience: CommunicationAudience | null;
      template: CommunicationTemplate;
      recipients: readonly CommunicationRecipientSnapshot[];
      data: CommunicationRenderData;
      idempotencyKey: string;
      previewId: string | null;
    },
  ): Promise<{ send: CommunicationSend; created: boolean }> {
    const now = this.clock().toISOString();
    const history: CommunicationAuditEntry[] = [];
    const deliveries: CommunicationDelivery[] = [];
    for (const recipient of input.recipients) {
      const queuedHistory: CommunicationDeliveryHistoryEntry = {
        id: createId("delivery-event"),
        status: "queued",
        occurredAt: now,
        providerMessageId: null,
        reason: null,
        actorId: actor.userId,
      };
      deliveries.push({
        recipientId: recipient.id,
        email: recipient.email,
        status: "queued",
        providerMessageId: null,
        failureReason: null,
        attempts: 0,
        history: [queuedHistory],
      });
      history.push({
        id: createId("communication-audit"),
        tenantId: actor.tenantId,
        eventId: input.eventId,
        sendId: "pending",
        recipientId: recipient.id,
        action: "delivery_queued",
        actorId: actor.userId,
        occurredAt: now,
        details: {},
      });
    }
    const sendId = createId("send");
    const sendHistory: CommunicationAuditEntry[] = [
      {
        id: createId("communication-audit"),
        tenantId: actor.tenantId,
        eventId: input.eventId,
        sendId,
        recipientId: null,
        action: "send_created",
        actorId: actor.userId,
        occurredAt: now,
        details: {
          templateId: input.template.id,
          templateVersion: input.template.version,
          recipientCount: input.recipients.length,
          previewId: input.previewId,
          dataFingerprint: dataFingerprint(input.data),
        },
      },
      ...history.map((entry) => ({ ...entry, sendId })),
    ];
    const summary = summarizeDeliveries(deliveries, input.recipients.length);
    const send: CommunicationSend = {
      id: sendId,
      tenantId: actor.tenantId,
      eventId: input.eventId,
      purpose: input.purpose,
      audience: input.audience,
      templateId: input.template.id,
      templateVersion: input.template.version,
      template: templateSnapshot(input.template),
      idempotencyKey: input.idempotencyKey,
      previewId: input.previewId,
      data: cloneData(input.data),
      ...summary,
      recipients: input.recipients,
      deliveries,
      history: sendHistory,
      createdBy: actor.userId,
      createdAt: now,
      updatedAt: now,
    };
    try {
      return { send: await this.repository.saveSend(send), created: true };
    } catch (error) {
      if (error instanceof CommunicationError && error.code === "COMMUNICATION_CONFLICT") {
        const existing = await this.repository.findSendByIdempotency(
          actor.tenantId,
          input.eventId,
          input.idempotencyKey,
        );
        if (existing !== undefined) {
          if (
            !sendMatchesPayload(existing, {
              purpose: input.purpose,
              audience: input.audience,
              templateId: input.template.id,
              templateVersion: input.template.version,
              recipientIds: input.recipients.map((recipient) => recipient.id),
              data: input.data,
            })
          ) {
            throw conflict(
              "The idempotency key was already used with a different communication payload.",
            );
          }
          return { send: existing, created: false };
        }
      }
      throw error;
    }
  }

  private async deliverSend(
    actor: CommunicationActor,
    initial: CommunicationSend,
    recipientIds?: ReadonlySet<string>,
  ): Promise<CommunicationSend> {
    if (this.deliveryAdapter === undefined) {
      throw unavailable("Operational email delivery is not configured.");
    }
    let current = initial;
    for (const recipient of initial.recipients) {
      if (recipientIds !== undefined && !recipientIds.has(recipient.id)) {
        continue;
      }
      const delivery = current.deliveries.find(
        (candidate) => candidate.recipientId === recipient.id,
      );
      if (delivery === undefined) {
        continue;
      }
      const data = renderDataForRecipient(this.recipientDataForSend(current), recipient);
      const rendered = renderCommunicationTemplate(current.template, data);
      const request: CommunicationDeliveryRequest = {
        tenantId: current.tenantId,
        eventId: current.eventId,
        sendId: current.id,
        recipientId: recipient.id,
        to: recipient.email,
        from: current.template.sender,
        senderPurpose: senderPurposeForTemplatePurpose(current.purpose),
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        idempotencyKey: `${current.id}:${recipient.id}`,
      };
      let result: CommunicationDeliveryResult;
      try {
        result = await this.deliveryAdapter.send(request);
      } catch (error) {
        const reason = redactCommunicationProviderReason(
          error instanceof Error ? error.message : "The delivery provider failed.",
        );
        current = this.applyDeliveryResult(actor, current, recipient.id, {
          status: "failed",
          reason,
        });
        await this.repository.saveSend(current);
        continue;
      }
      const reason = providerReason(result.reason);
      current = this.applyDeliveryResult(actor, current, recipient.id, {
        status: result.status ?? "queued",
        ...(result.providerMessageId === undefined
          ? {}
          : { providerMessageId: result.providerMessageId }),
        ...(reason === undefined ? {} : { reason }),
      });
      await this.repository.saveSend(current);
    }
    return copySend(current);
  }

  private recipientDataForSend(send: CommunicationSend): CommunicationRenderData {
    return send.data;
  }

  private applyDeliveryResult(
    actor: CommunicationActor,
    send: CommunicationSend,
    recipientId: string,
    result: {
      status: CommunicationDeliveryStatus;
      providerMessageId?: string;
      reason?: string;
    },
  ): CommunicationSend {
    const occurredAt = this.clock().toISOString();
    const current = send.deliveries.find((delivery) => delivery.recipientId === recipientId);
    if (current === undefined) {
      return send;
    }
    const historyEntry: CommunicationDeliveryHistoryEntry = {
      id: createId("delivery-event"),
      status: result.status,
      occurredAt,
      providerMessageId: result.providerMessageId ?? current.providerMessageId,
      reason: providerReason(result.reason) ?? null,
      actorId: actor.userId,
    };
    const nextDelivery: CommunicationDelivery = {
      ...current,
      status: result.status,
      providerMessageId: result.providerMessageId ?? current.providerMessageId,
      failureReason:
        result.status === "failed" || result.status === "bounced" || result.status === "complained"
          ? (providerReason(result.reason) ?? current.failureReason)
          : null,
      attempts: current.attempts + 1,
      history: [...current.history, historyEntry],
    };
    const audit: CommunicationAuditEntry = {
      id: createId("communication-audit"),
      tenantId: send.tenantId,
      eventId: send.eventId,
      sendId: send.id,
      recipientId,
      action: deliveryAction(result.status),
      actorId: actor.userId,
      occurredAt,
      details: {
        providerMessageId: result.providerMessageId ?? null,
        reason: providerReason(result.reason) ?? null,
      },
    };
    const deliveries = send.deliveries.map((delivery) =>
      delivery.recipientId === recipientId ? nextDelivery : delivery,
    );
    return {
      ...send,
      ...summarizeDeliveries(deliveries, send.recipientCount),
      deliveries,
      history: [...send.history, audit],
      updatedAt: occurredAt,
    };
  }
  configureReminders(runtime: ReminderRuntime): void {
    if (this.reminders !== undefined && this.reminders !== runtime) {
      throw conflict("Reminder runtime has already been configured.");
    }
    this.reminders = runtime;
  }

  async previewReminders(
    actor: CommunicationActor,
    input: ReminderPreviewInput,
  ): Promise<ReminderPreview> {
    requireOrganizer(actor, input.eventId);
    const scope = reminderScope(actor, input.organizationId, input.eventId);
    const runtime = this.reminders;
    if (runtime?.source === undefined) {
      throw unavailable("The reminder candidate source is not configured.");
    }
    const triggerType = input.triggerType ?? "manual";
    const scheduledAt = requireIsoInstant(
      input.scheduledAt ?? this.clock().toISOString(),
      "scheduledAt",
    );
    const result = await runtime.source.listCandidates({
      ...scope,
      triggerType,
      scheduledAt,
    });
    return {
      audienceType: result.audienceType,
      audienceRevision: result.audienceRevision,
      candidates: result.candidates.map(copyReminderCandidate),
    };
  }

  async runManualReminders(
    actor: CommunicationActor,
    input: RunManualRemindersInput,
  ): Promise<ReminderRun> {
    requireOrganizer(actor, input.eventId);
    const idempotencyKey = requireText(input.idempotencyKey, "Idempotency key", 300);
    const expectedAudienceRevision = requireText(
      input.expectedAudienceRevision,
      "Expected audience revision",
      300,
    );
    const scheduledAt = requireIsoInstant(
      input.scheduledAt ?? this.clock().toISOString(),
      "scheduledAt",
    );
    return this.executeReminderRun(actor, {
      ...input,
      idempotencyKey,
      expectedAudienceRevision,
      scheduledAt,
      triggerType: "manual",
    });
  }

  async runAutomaticReminders(
    actor: CommunicationActor,
    input: RunAutomaticRemindersInput,
  ): Promise<ReminderRun> {
    requireAutomationDelivery(actor, input.eventId);
    const scheduledAt = requireIsoInstant(input.scheduledAt, "scheduledAt");
    return this.executeReminderRun(actor, {
      ...input,
      scheduledAt,
      triggerType: "automatic",
    });
  }

  async listReminderRuns(
    actor: CommunicationActor,
    input: string | ReminderListRunsInput,
  ): Promise<readonly ReminderRun[]> {
    const eventId = typeof input === "string" ? input : input.eventId;
    requireOrganizer(actor, eventId);
    const scope = reminderScope(
      actor,
      typeof input === "string" ? undefined : input.organizationId,
      eventId,
    );
    const runtime = this.requireReminderRepository();
    return (await runtime.listRuns(scope.organizationId, scope.eventId)).map(copyReminderRun);
  }

  async listReminderDispatches(
    actor: CommunicationActor,
    input: string | ReminderListDispatchesInput,
    runId?: string,
  ): Promise<readonly ReminderDispatch[]> {
    const eventId = typeof input === "string" ? input : input.eventId;
    requireOrganizer(actor, eventId);
    const scope = reminderScope(
      actor,
      typeof input === "string" ? undefined : input.organizationId,
      eventId,
    );
    const runtime = this.requireReminderRepository();
    const filterRunId = typeof input === "string" ? runId : input.runId;
    return (await runtime.listDispatches(scope.organizationId, scope.eventId, filterRunId)).map(
      copyReminderDispatch,
    );
  }

  async getReminderFacts(
    actor: CommunicationActor,
    input: ReminderFactsInput,
  ): Promise<ReminderFacts> {
    requireOrganizer(actor, input.eventId);
    const scope = reminderScope(actor, input.organizationId, input.eventId);
    const runtime = this.requireReminderRepository();
    const [runs, dispatches] = await Promise.all([
      runtime.listRuns(scope.organizationId, scope.eventId),
      runtime.listDispatches(scope.organizationId, scope.eventId),
    ]);
    const runsById = new Map(runs.map((run) => [run.id, run]));
    const matching = dispatches
      .filter(
        (dispatch) =>
          dispatch.recipient === input.recipientApplicationId &&
          reminderSubjectKey(dispatch.subject) === reminderSubjectKey(input.subject),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    let lastAutomatic: ReminderRun | null = null;
    let lastManual: ReminderRun | null = null;
    for (const dispatch of matching) {
      const run = runsById.get(dispatch.runId);
      if (run?.triggerType === "automatic" && lastAutomatic === null) {
        lastAutomatic = copyReminderRun(run);
      }
      if (run?.triggerType === "manual" && lastManual === null) {
        lastManual = copyReminderRun(run);
      }
      if (lastAutomatic !== null && lastManual !== null) break;
    }
    let nextEligibleAt: string | null = null;
    const source = this.reminders?.source;
    if (source !== undefined) {
      try {
        const sourceResult = await source.listCandidates({
          ...scope,
          triggerType: "automatic",
          scheduledAt: this.clock().toISOString(),
        });
        for (const candidate of sourceResult.candidates) {
          const candidateNext = candidate.nextEligibleAt;
          if (
            candidate.recipientApplicationId === input.recipientApplicationId &&
            reminderSubjectKey(candidate.subject) === reminderSubjectKey(input.subject) &&
            candidateNext !== null &&
            Number.isFinite(Date.parse(candidateNext)) &&
            Date.parse(candidateNext) > this.clock().getTime() &&
            (nextEligibleAt === null || candidateNext < nextEligibleAt)
          ) {
            nextEligibleAt = candidateNext;
          }
        }
      } catch {
        nextEligibleAt = null;
      }
    }
    return {
      lastAutomatic,
      lastManual,
      nextEligibleAt,
      lastOutcome: matching[0] === undefined ? null : copyReminderDispatch(matching[0]),
    };
  }

  async requeuePendingReminders(
    actor: CommunicationActor,
    input: { organizationId?: string; eventId: string },
  ): Promise<{ requeued: number }> {
    requireAutomationDelivery(actor, input.eventId);
    const scope = reminderScope(actor, input.organizationId, input.eventId);
    const outbox = this.reminders?.outbox;
    if (outbox === undefined) return { requeued: 0 };
    return outbox.requeuePending(scope);
  }

  async recordReminderDispatchStatus(
    actor: CommunicationActor,
    input: RecordReminderDispatchStatusInput,
  ): Promise<ReminderDispatch> {
    requireAutomationDelivery(actor, input.eventId);
    const scope = reminderScope(actor, input.organizationId, input.eventId);
    const runtime = this.requireReminderRepository();
    const dispatchId =
      input.dispatchId === undefined
        ? undefined
        : requireText(input.dispatchId, "Dispatch id", 300);
    const providerMessageId =
      input.providerMessageId === undefined
        ? undefined
        : requireText(input.providerMessageId, "Provider message id", 300);
    const dispatch =
      dispatchId === undefined
        ? providerMessageId === undefined
          ? undefined
          : await runtime.findDispatchByProviderMessageId(
              scope.organizationId,
              scope.eventId,
              providerMessageId,
            )
        : await runtime.getDispatch(scope.organizationId, scope.eventId, dispatchId);
    if (dispatch === undefined) {
      throw notFound("The reminder dispatch was not found.");
    }
    const runId = input.runId === undefined ? undefined : requireText(input.runId, "Run id", 500);
    if (
      dispatch.organizationId !== scope.organizationId ||
      dispatch.eventId !== scope.eventId ||
      (runId !== undefined && dispatch.runId !== runId)
    ) {
      throw conflict("The reminder dispatch ownership does not match the delivery target.");
    }
    if (
      providerMessageId !== undefined &&
      dispatch.providerMessageId !== null &&
      dispatch.providerMessageId !== providerMessageId
    ) {
      throw conflict("The provider message id does not match the reminder dispatch.");
    }
    if (providerMessageId !== undefined) {
      const duplicate = await runtime.findDispatchByProviderMessageId(
        scope.organizationId,
        scope.eventId,
        providerMessageId,
      );
      if (duplicate !== undefined && duplicate.id !== dispatch.id) {
        throw conflict("The provider message id belongs to another reminder dispatch.");
      }
    }
    if (
      (input.status === "provider_accepted" ||
        input.status === "delivered" ||
        input.status === "bounced") &&
      providerMessageId === undefined
    ) {
      throw invalidInput("A provider message id is required for this reminder status.");
    }
    const currentProviderMessageId = providerMessageId ?? dispatch.providerMessageId;
    const recoverableEnqueueFailure =
      dispatch.status === "failed" &&
      dispatch.providerMessageId === null &&
      dispatch.failureMetadata?.stage === "enqueue";
    const validTransition =
      (dispatch.status === "queued" &&
        (input.status === "provider_accepted" || input.status === "failed")) ||
      (recoverableEnqueueFailure && input.status === "provider_accepted") ||
      (dispatch.status === "provider_accepted" &&
        (input.status === "delivered" ||
          input.status === "failed" ||
          input.status === "bounced")) ||
      (dispatch.status === input.status && currentProviderMessageId === dispatch.providerMessageId);
    if (!validTransition) {
      throw conflict(
        `Cannot transition reminder dispatch from ${dispatch.status} to ${input.status}.`,
      );
    }
    const now = this.clock().toISOString();
    const next: ReminderDispatch = {
      ...dispatch,
      providerMessageId: currentProviderMessageId,
      status: input.status,
      failureMetadata:
        input.failureMetadata === undefined
          ? dispatch.failureMetadata
          : cloneReminderMetadata(input.failureMetadata),
      updatedAt: now,
      providerAcceptedAt:
        input.status === "provider_accepted"
          ? (dispatch.providerAcceptedAt ?? now)
          : dispatch.providerAcceptedAt,
      deliveredAt: input.status === "delivered" ? now : dispatch.deliveredAt,
      failedAt: input.status === "failed" ? now : dispatch.failedAt,
      bouncedAt: input.status === "bounced" ? now : dispatch.bouncedAt,
      completedAt:
        input.status === "failed" || input.status === "delivered" || input.status === "bounced"
          ? now
          : dispatch.completedAt,
    };
    const saved = await runtime.updateDispatch(next);
    await this.refreshReminderRun(saved.runId, scope.organizationId, scope.eventId);
    return copyReminderDispatch(saved);
  }

  private requireReminderRepository(): ReminderRepository {
    const runtime = this.reminders;
    if (runtime?.repository === undefined) {
      throw unavailable("The reminder repository is not configured.");
    }
    return runtime.repository;
  }

  private async executeReminderRun(
    actor: CommunicationActor,
    input: {
      organizationId?: string;
      eventId: string;
      scheduledAt: string;
      triggerType: ReminderTriggerType;
      idempotencyKey?: string;
      expectedAudienceRevision?: string;
    },
  ): Promise<ReminderRun> {
    const scope = reminderScope(actor, input.organizationId, input.eventId);
    const runtime = this.reminders;
    if (runtime?.repository === undefined) {
      throw unavailable("The reminder repository is not configured.");
    }
    const runKey =
      input.triggerType === "manual"
        ? requireText(input.idempotencyKey ?? "", "Idempotency key", 300)
        : reminderHourWindow(input.scheduledAt);
    const id = reminderRunId(scope.organizationId, scope.eventId, input.triggerType, runKey);
    if (input.triggerType === "automatic" && runtime.outbox !== undefined) {
      try {
        await runtime.outbox.requeuePending(scope);
      } catch {
        // Candidate recovery below must still run when a queue wakeup remains unavailable.
      }
    }
    let run = await runtime.repository.getRun(scope.organizationId, scope.eventId, id);
    if (run?.state === "completed" || run?.state === "failed") {
      return copyReminderRun(run);
    }
    if (run === undefined) {
      const now = this.clock().toISOString();
      const pending: ReminderRun = {
        id,
        organizationId: scope.organizationId,
        eventId: scope.eventId,
        triggerType: input.triggerType,
        audienceType: "combined",
        audienceRevision: input.expectedAudienceRevision ?? "",
        candidateCount: 0,
        eligibleCount: 0,
        queuedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        state: "pending",
        configurationFailure: null,
        actorId: actor.userId,
        startedAt: now,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      try {
        run = await runtime.repository.insertRun(pending);
      } catch (error) {
        run = await runtime.repository.getRun(scope.organizationId, scope.eventId, id);
        if (run === undefined) throw error;
        if (run.state === "completed" || run.state === "failed") {
          return copyReminderRun(run);
        }
      }
    }
    run = await runtime.repository.updateRun({
      ...run,
      state: "running",
      updatedAt: this.clock().toISOString(),
    });
    if (runtime.source === undefined || runtime.outbox === undefined) {
      return this.finishReminderRun(
        run,
        runtime.source === undefined
          ? "The reminder candidate source is not configured."
          : "The reminder outbox is not configured.",
        runtime.repository,
      );
    }
    let sourceResult: ReminderCandidateSourceResult;
    try {
      sourceResult = await runtime.source.listCandidates({
        ...scope,
        triggerType: input.triggerType,
        scheduledAt: input.scheduledAt,
      });
    } catch (error) {
      return this.finishReminderRun(
        run,
        `Candidate source failed: ${reminderErrorMessage(error)}`,
        runtime.repository,
      );
    }
    run = await runtime.repository.updateRun({
      ...run,
      audienceType: sourceResult.audienceType,
      audienceRevision: sourceResult.audienceRevision,
      updatedAt: this.clock().toISOString(),
    });
    if (
      input.triggerType === "manual" &&
      sourceResult.audienceRevision !== input.expectedAudienceRevision
    ) {
      const failed = await this.finishReminderRun(
        run,
        `Audience revision ${sourceResult.audienceRevision} does not match expected revision ${input.expectedAudienceRevision}.`,
        runtime.repository,
      );
      throw conflict(failed.configurationFailure ?? "The reminder audience revision is stale.");
    }
    for (const candidate of sourceResult.candidates) {
      const idempotencyKey = reminderIdempotencyKey(
        scope.organizationId,
        scope.eventId,
        input.triggerType,
        candidate,
      );
      let dispatch = await runtime.repository.findDispatchByIdempotency(
        scope.organizationId,
        scope.eventId,
        idempotencyKey,
      );
      let ownedByCurrentRun = dispatch?.runId === run.id;
      if (dispatch !== undefined) {
        const recoverableEnqueueFailure =
          dispatch.status === "failed" &&
          dispatch.providerMessageId === null &&
          dispatch.failureMetadata?.stage === "enqueue";
        if (
          dispatch.status !== "candidate" &&
          dispatch.status !== "eligible" &&
          !recoverableEnqueueFailure
        ) {
          continue;
        }
      } else {
        const dispatchNow = this.clock().toISOString();
        dispatch = {
          id: reminderDispatchId(idempotencyKey),
          runId: run.id,
          organizationId: scope.organizationId,
          eventId: scope.eventId,
          recipient: candidate.recipientApplicationId,
          subject: cloneReminderSubject(candidate.subject),
          eligibilityReason: candidate.eligibilityReason,
          cadenceWindow: candidate.cadenceWindow,
          idempotencyKey,
          providerMessageId: null,
          status: "candidate",
          skipMetadata: null,
          failureMetadata: null,
          createdAt: dispatchNow,
          updatedAt: dispatchNow,
          eligibleAt: null,
          skippedAt: null,
          queuedAt: null,
          providerAcceptedAt: null,
          deliveredAt: null,
          failedAt: null,
          bouncedAt: null,
          completedAt: null,
          outboxJobId: null,
        };
        try {
          dispatch = await runtime.repository.insertDispatch(dispatch);
          ownedByCurrentRun = true;
        } catch (error) {
          const duplicate = await runtime.repository.findDispatchByIdempotency(
            scope.organizationId,
            scope.eventId,
            idempotencyKey,
          );
          if (duplicate === undefined) throw error;
          const recoverableEnqueueFailure =
            duplicate.status === "failed" &&
            duplicate.providerMessageId === null &&
            duplicate.failureMetadata?.stage === "enqueue";
          if (
            duplicate.status !== "candidate" &&
            duplicate.status !== "eligible" &&
            !recoverableEnqueueFailure
          ) {
            continue;
          }
          dispatch = duplicate;
          ownedByCurrentRun = dispatch.runId === run.id;
        }
      }
      if (dispatch.status === "candidate") {
        if (candidate.normalizedEmail === null || candidate.normalizedEmail.trim().length === 0) {
          const skippedAt = this.clock().toISOString();
          dispatch = await runtime.repository.updateDispatch({
            ...dispatch,
            status: "skipped",
            skipMetadata: { reason: "missing_email" },
            skippedAt,
            completedAt: skippedAt,
            updatedAt: skippedAt,
          });
          if (!ownedByCurrentRun) {
            await this.refreshReminderRun(dispatch.runId, scope.organizationId, scope.eventId);
          }
          continue;
        }
        if (!candidate.eligible) {
          const skippedAt = this.clock().toISOString();
          dispatch = await runtime.repository.updateDispatch({
            ...dispatch,
            status: "skipped",
            skipMetadata: { reason: candidate.eligibilityReason },
            skippedAt,
            completedAt: skippedAt,
            updatedAt: skippedAt,
          });
          if (!ownedByCurrentRun) {
            await this.refreshReminderRun(dispatch.runId, scope.organizationId, scope.eventId);
          }
          continue;
        }
        const eligibleAt = this.clock().toISOString();
        dispatch = await runtime.repository.updateDispatch({
          ...dispatch,
          status: "eligible",
          eligibleAt,
          updatedAt: eligibleAt,
        });
      }
      try {
        const normalizedEmail = candidate.normalizedEmail?.trim();
        if (normalizedEmail === undefined || normalizedEmail.length === 0) {
          throw new Error("The reminder recipient email is unavailable.");
        }
        const result = await runtime.outbox.enqueue({
          dispatchId: dispatch.id,
          runId: dispatch.runId,
          organizationId: dispatch.organizationId,
          eventId: dispatch.eventId,
          recipient: normalizedEmail,
          from: candidate.renderedMessage.from,
          senderPurpose: "speakers",
          subject: candidate.renderedMessage.subject,
          html: candidate.renderedMessage.html,
          text: candidate.renderedMessage.text,
          idempotencyKey: dispatch.idempotencyKey,
        });
        const outboxJobId = result.outboxJobId.trim();
        if (outboxJobId.length === 0)
          throw new Error("The reminder outbox returned an empty job id.");
        const queuedAt = this.clock().toISOString();
        dispatch = await runtime.repository.updateDispatch({
          ...dispatch,
          status: "queued",
          outboxJobId,
          failureMetadata: null,
          failedAt: null,
          completedAt: null,
          queuedAt,
          updatedAt: queuedAt,
        });
      } catch (error) {
        const failedAt = this.clock().toISOString();
        dispatch = await runtime.repository.updateDispatch({
          ...dispatch,
          status: "failed",
          failureMetadata: { stage: "enqueue", reason: reminderErrorMessage(error) },
          failedAt,
          completedAt: failedAt,
          updatedAt: failedAt,
        });
      }
      if (!ownedByCurrentRun) {
        await this.refreshReminderRun(dispatch.runId, scope.organizationId, scope.eventId);
      }
    }
    const finishedAt = this.clock().toISOString();
    const ownedDispatches = await runtime.repository.listDispatches(
      scope.organizationId,
      scope.eventId,
      run.id,
    );
    const counts = ownedDispatches.reduce(
      (summary, dispatch) => {
        const count = reminderCountStatus(dispatch.status);
        summary.eligibleCount += count.eligible;
        summary.queuedCount += count.queued;
        summary.skippedCount += count.skipped;
        summary.failedCount += count.failed;
        return summary;
      },
      { eligibleCount: 0, queuedCount: 0, skippedCount: 0, failedCount: 0 },
    );
    run = await runtime.repository.updateRun({
      ...run,
      candidateCount: ownedDispatches.length,
      ...counts,
      state: "completed",
      completedAt: finishedAt,
      updatedAt: finishedAt,
    });
    return copyReminderRun(run);
  }

  private async finishReminderRun(
    run: ReminderRun,
    configurationFailure: string,
    repository: ReminderRepository,
  ): Promise<ReminderRun> {
    const completedAt = this.clock().toISOString();
    const failed = await repository.updateRun({
      ...run,
      state: "failed",
      configurationFailure,
      completedAt,
      updatedAt: completedAt,
    });
    return copyReminderRun(failed);
  }

  private async refreshReminderRun(
    runId: string,
    organizationId: string,
    eventId: string,
  ): Promise<void> {
    const runtime = this.reminders;
    if (runtime?.repository === undefined) return;
    const run = await runtime.repository.getRun(organizationId, eventId, runId);
    if (run === undefined) return;
    const dispatches = await runtime.repository.listDispatches(organizationId, eventId, runId);
    const counts = dispatches.reduce(
      (summary, dispatch) => {
        const count = reminderCountStatus(dispatch.status);
        summary.candidateCount += 1;
        summary.eligibleCount += count.eligible;
        summary.queuedCount += count.queued;
        summary.skippedCount += count.skipped;
        summary.failedCount += count.failed;
        return summary;
      },
      { candidateCount: 0, eligibleCount: 0, queuedCount: 0, skippedCount: 0, failedCount: 0 },
    );
    const nextState =
      run.state === "completed" || run.state === "failed"
        ? run.state
        : dispatches.every(
              (dispatch) => isReminderTerminal(dispatch.status) || dispatch.status === "queued",
            )
          ? "completed"
          : "running";
    await runtime.repository.updateRun({
      ...run,
      ...counts,
      state: nextState,
      completedAt:
        nextState === "completed" && run.completedAt === null
          ? this.clock().toISOString()
          : run.completedAt,
      updatedAt: this.clock().toISOString(),
    });
  }
}

export interface InMemoryCommunicationRepositoryOptions {
  templates?: readonly CommunicationTemplate[];
  recipients?: readonly CommunicationRecipient[];
  authorizedAudiences?: Readonly<Record<string, readonly CommunicationAudience[]>>;
}

export class InMemoryCommunicationRepository implements CommunicationRepository {
  private readonly templates = new Map<string, CommunicationTemplate>();
  private readonly recipients = new Map<string, CommunicationRecipient>();
  private readonly previews = new Map<string, CommunicationPreview>();
  private readonly sends = new Map<string, CommunicationSend>();
  private readonly authorizedAudiences = new Map<string, Set<CommunicationAudience>>();

  constructor(options: InMemoryCommunicationRepositoryOptions = {}) {
    for (const template of options.templates ?? []) {
      this.templates.set(
        this.templateKey(template.tenantId, template.eventId, template.id, template.version),
        template,
      );
    }
    for (const recipient of options.recipients ?? []) {
      this.recipients.set(
        this.recipientKey(recipient.tenantId, recipient.eventId, recipient.id),
        recipient,
      );
    }
    for (const [scope, audiences] of Object.entries(options.authorizedAudiences ?? {})) {
      this.authorizedAudiences.set(scope, new Set(audiences));
    }
  }

  async listTemplates(
    tenantId: string,
    eventId: string,
    purpose?: CommunicationTemplatePurpose,
  ): Promise<readonly CommunicationTemplate[]> {
    return [...this.templates.values()]
      .filter(
        (template) =>
          template.tenantId === tenantId &&
          template.eventId === eventId &&
          (purpose === undefined || template.purpose === purpose),
      )
      .sort((left, right) => left.version - right.version)
      .map((template) => ({ ...template, variables: [...template.variables] }));
  }

  async getTemplate(
    tenantId: string,
    eventId: string,
    templateId: string,
    version?: number,
  ): Promise<CommunicationTemplate | undefined> {
    const found =
      version === undefined
        ? [...this.templates.values()]
            .filter(
              (template) =>
                template.tenantId === tenantId &&
                template.eventId === eventId &&
                template.id === templateId,
            )
            .sort((left, right) => right.version - left.version)[0]
        : this.templates.get(this.templateKey(tenantId, eventId, templateId, version));
    return found === undefined ? undefined : { ...found, variables: [...found.variables] };
  }

  async saveTemplate(template: CommunicationTemplate): Promise<CommunicationTemplate> {
    const key = this.templateKey(
      template.tenantId,
      template.eventId,
      template.id,
      template.version,
    );
    this.templates.set(key, { ...template, variables: [...template.variables] });
    return { ...template, variables: [...template.variables] };
  }

  async listRecipients(
    tenantId: string,
    eventId: string,
    audience: CommunicationAudience,
  ): Promise<readonly CommunicationRecipient[]> {
    return [...this.recipients.values()]
      .filter(
        (recipient) =>
          recipient.tenantId === tenantId &&
          recipient.eventId === eventId &&
          (recipient.audiences.length === 0 || recipient.audiences.includes(audience)),
      )
      .map((recipient) => ({
        ...recipient,
        audiences: [...recipient.audiences],
        ...(recipient.data === undefined ? {} : { data: cloneData(recipient.data) }),
      }));
  }

  async getRecipientsByIds(
    tenantId: string,
    eventId: string,
    recipientIds: readonly string[],
  ): Promise<readonly CommunicationRecipient[]> {
    return recipientIds
      .map((id) => this.recipients.get(this.recipientKey(tenantId, eventId, id)))
      .filter((recipient): recipient is CommunicationRecipient => recipient !== undefined)
      .map((recipient) => ({
        ...recipient,
        audiences: [...recipient.audiences],
        ...(recipient.data === undefined ? {} : { data: cloneData(recipient.data) }),
      }));
  }

  async isAudienceAuthorized(
    tenantId: string,
    eventId: string,
    audience: CommunicationAudience,
  ): Promise<boolean> {
    const configured = this.authorizedAudiences.get(this.scopeKey(tenantId, eventId));
    if (configured !== undefined) {
      return configured.has(audience);
    }
    return true;
  }

  authorizeAudience(tenantId: string, eventId: string, audience: CommunicationAudience): void {
    const key = this.scopeKey(tenantId, eventId);
    const configured = this.authorizedAudiences.get(key) ?? new Set<CommunicationAudience>();
    configured.add(audience);
    this.authorizedAudiences.set(key, configured);
  }

  async getPreview(
    tenantId: string,
    eventId: string,
    previewId: string,
  ): Promise<CommunicationPreview | undefined> {
    const preview = this.previews.get(previewId);
    if (preview === undefined || preview.tenantId !== tenantId || preview.eventId !== eventId) {
      return undefined;
    }
    return copyPreview(preview);
  }

  async savePreview(preview: CommunicationPreview): Promise<CommunicationPreview> {
    this.previews.set(preview.id, copyPreview(preview));
    return copyPreview(preview);
  }

  async findSendByIdempotency(
    tenantId: string,
    eventId: string,
    idempotencyKey: string,
  ): Promise<CommunicationSend | undefined> {
    const found = [...this.sends.values()].find(
      (send) =>
        send.tenantId === tenantId &&
        send.eventId === eventId &&
        send.idempotencyKey === idempotencyKey,
    );
    return found === undefined ? undefined : copySend(found);
  }

  async listSends(tenantId: string, eventId: string): Promise<readonly CommunicationSend[]> {
    return [...this.sends.values()]
      .filter((send) => send.tenantId === tenantId && send.eventId === eventId)
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
      )
      .map(copySend);
  }

  async getSend(
    tenantId: string,
    eventId: string,
    sendId: string,
  ): Promise<CommunicationSend | undefined> {
    const send = this.sends.get(sendId);
    if (send === undefined || send.tenantId !== tenantId || send.eventId !== eventId) {
      return undefined;
    }
    return copySend(send);
  }

  async saveSend(send: CommunicationSend): Promise<CommunicationSend> {
    const existing = this.sends.get(send.id);
    if (existing !== undefined && existing.idempotencyKey !== send.idempotencyKey) {
      throw conflict("The communication send id already exists.");
    }
    const duplicate = [...this.sends.values()].find(
      (candidate) =>
        candidate.id !== send.id &&
        candidate.tenantId === send.tenantId &&
        candidate.eventId === send.eventId &&
        candidate.idempotencyKey === send.idempotencyKey,
    );
    if (duplicate !== undefined) {
      throw conflict("The idempotency key has already been used for this event.");
    }
    this.sends.set(send.id, copySend(send));
    return copySend(send);
  }

  seedRecipient(recipient: CommunicationRecipient): void {
    this.recipients.set(
      this.recipientKey(recipient.tenantId, recipient.eventId, recipient.id),
      recipient,
    );
  }

  private scopeKey(tenantId: string, eventId: string): string {
    return `${tenantId}:${eventId}`;
  }

  private templateKey(
    tenantId: string,
    eventId: string,
    templateId: string,
    version: number,
  ): string {
    return `${tenantId}:${eventId}:${templateId}:${version}`;
  }

  private recipientKey(tenantId: string, eventId: string, recipientId: string): string {
    return `${tenantId}:${eventId}:${recipientId}`;
  }
}
export interface InMemoryReminderRepositoryOptions {
  runs?: readonly ReminderRun[];
  dispatches?: readonly ReminderDispatch[];
}

export class InMemoryReminderRepository implements ReminderRepository {
  private readonly runs = new Map<string, ReminderRun>();
  private readonly dispatches = new Map<string, ReminderDispatch>();

  constructor(options: InMemoryReminderRepositoryOptions = {}) {
    for (const run of options.runs ?? []) {
      this.runs.set(run.id, copyReminderRun(run));
    }
    for (const dispatch of options.dispatches ?? []) {
      this.dispatches.set(dispatch.id, copyReminderDispatch(dispatch));
    }
  }

  async getRun(
    organizationId: string,
    eventId: string,
    runId: string,
  ): Promise<ReminderRun | undefined> {
    const run = this.runs.get(runId);
    return run === undefined || run.organizationId !== organizationId || run.eventId !== eventId
      ? undefined
      : copyReminderRun(run);
  }

  async listRuns(organizationId: string, eventId: string): Promise<readonly ReminderRun[]> {
    return [...this.runs.values()]
      .filter((run) => run.organizationId === organizationId && run.eventId === eventId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(copyReminderRun);
  }

  async insertRun(run: ReminderRun): Promise<ReminderRun> {
    if (this.runs.has(run.id)) {
      throw conflict("The reminder run id already exists.");
    }
    this.runs.set(run.id, copyReminderRun(run));
    return copyReminderRun(run);
  }

  async updateRun(run: ReminderRun): Promise<ReminderRun> {
    const existing = this.runs.get(run.id);
    if (
      existing === undefined ||
      existing.organizationId !== run.organizationId ||
      existing.eventId !== run.eventId
    ) {
      throw notFound("The reminder run was not found.");
    }
    this.runs.set(run.id, copyReminderRun(run));
    return copyReminderRun(run);
  }

  async getDispatch(
    organizationId: string,
    eventId: string,
    dispatchId: string,
  ): Promise<ReminderDispatch | undefined> {
    const dispatch = this.dispatches.get(dispatchId);
    return dispatch === undefined ||
      dispatch.organizationId !== organizationId ||
      dispatch.eventId !== eventId
      ? undefined
      : copyReminderDispatch(dispatch);
  }

  async findDispatchByIdempotency(
    organizationId: string,
    eventId: string,
    idempotencyKey: string,
  ): Promise<ReminderDispatch | undefined> {
    const dispatch = [...this.dispatches.values()].find(
      (candidate) =>
        candidate.organizationId === organizationId &&
        candidate.eventId === eventId &&
        candidate.idempotencyKey === idempotencyKey,
    );
    return dispatch === undefined ? undefined : copyReminderDispatch(dispatch);
  }

  async findDispatchByProviderMessageId(
    organizationId: string,
    eventId: string,
    providerMessageId: string,
  ): Promise<ReminderDispatch | undefined> {
    const dispatch = [...this.dispatches.values()].find(
      (candidate) =>
        candidate.organizationId === organizationId &&
        candidate.eventId === eventId &&
        candidate.providerMessageId === providerMessageId,
    );
    return dispatch === undefined ? undefined : copyReminderDispatch(dispatch);
  }

  async listDispatches(
    organizationId: string,
    eventId: string,
    runId?: string,
  ): Promise<readonly ReminderDispatch[]> {
    return [...this.dispatches.values()]
      .filter(
        (dispatch) =>
          dispatch.organizationId === organizationId &&
          dispatch.eventId === eventId &&
          (runId === undefined || dispatch.runId === runId),
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(copyReminderDispatch);
  }

  async insertDispatch(dispatch: ReminderDispatch): Promise<ReminderDispatch> {
    if (this.dispatches.has(dispatch.id)) {
      throw conflict("The reminder dispatch id already exists.");
    }
    const duplicate = await this.findDispatchByIdempotency(
      dispatch.organizationId,
      dispatch.eventId,
      dispatch.idempotencyKey,
    );
    if (duplicate !== undefined) {
      throw conflict("The reminder dispatch idempotency key has already been used.");
    }
    if (dispatch.providerMessageId !== null) {
      const providerDuplicate = await this.findDispatchByProviderMessageId(
        dispatch.organizationId,
        dispatch.eventId,
        dispatch.providerMessageId,
      );
      if (providerDuplicate !== undefined) {
        throw conflict("The provider message id has already been used.");
      }
    }
    this.dispatches.set(dispatch.id, copyReminderDispatch(dispatch));
    return copyReminderDispatch(dispatch);
  }

  async updateDispatch(dispatch: ReminderDispatch): Promise<ReminderDispatch> {
    const existing = this.dispatches.get(dispatch.id);
    if (
      existing === undefined ||
      existing.organizationId !== dispatch.organizationId ||
      existing.eventId !== dispatch.eventId
    ) {
      throw notFound("The reminder dispatch was not found.");
    }
    const duplicate = await this.findDispatchByIdempotency(
      dispatch.organizationId,
      dispatch.eventId,
      dispatch.idempotencyKey,
    );
    if (duplicate !== undefined && duplicate.id !== dispatch.id) {
      throw conflict("The reminder dispatch idempotency key has already been used.");
    }
    if (dispatch.providerMessageId !== null) {
      const providerDuplicate = await this.findDispatchByProviderMessageId(
        dispatch.organizationId,
        dispatch.eventId,
        dispatch.providerMessageId,
      );
      if (providerDuplicate !== undefined && providerDuplicate.id !== dispatch.id) {
        throw conflict("The provider message id has already been used.");
      }
    }
    this.dispatches.set(dispatch.id, copyReminderDispatch(dispatch));
    return copyReminderDispatch(dispatch);
  }
}

export type CommunicationRepositoryGrant = CommunicationGrant;
export type {
  CommunicationActor,
  CommunicationDeliveryAdapter,
  CommunicationRepository,
  ReminderCandidate,
  ReminderCandidateSource,
  ReminderDispatch,
  ReminderFacts,
  ReminderRepository,
  ReminderRun,
  ReminderRuntime,
  ReminderSubject,
  ReminderTriggerType,
} from "./types";
