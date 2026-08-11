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
  CommunicationSenderIdentity,
  CommunicationSendStatus,
  CommunicationTemplate,
  CommunicationTemplatePurpose,
  CommunicationTemplateSnapshot,
} from "./types";
import { COMMUNICATION_AUDIENCES, COMMUNICATION_TEMPLATE_PURPOSES } from "./types";

export type CommunicationErrorCode =
  | "COMMUNICATION_INVALID_INPUT"
  | "COMMUNICATION_FORBIDDEN"
  | "COMMUNICATION_NOT_FOUND"
  | "COMMUNICATION_CONFLICT"
  | "COMMUNICATION_UNAVAILABLE";

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
  data?: CommunicationRenderData;
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

function senderForPurpose(purpose: CommunicationTemplatePurpose): CommunicationSenderIdentity {
  if (purpose === "verification") {
    return "auth@sessionboard.namuh.co";
  }
  if (
    purpose === "schedule_publish" ||
    purpose === "schedule_update" ||
    purpose === "schedule_cancel"
  ) {
    return "calendar@sessionboard.namuh.co";
  }
  return "speakers@sessionboard.namuh.co";
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

function renderDataForRecipient(
  data: CommunicationRenderData,
  recipient: CommunicationRecipientSnapshot,
): CommunicationRenderData {
  return {
    ...data,
    ...recipient.data,
    recipientId: recipient.id,
    email: recipient.email,
    displayName: recipient.displayName,
    recipient: {
      id: recipient.id,
      email: recipient.email,
      displayName: recipient.displayName,
    },
  };
}

function deliveryAction(status: CommunicationDeliveryStatus): CommunicationAuditEntry["action"] {
  return status === "queued"
    ? "delivery_queued"
    : (`delivery_${status}` as CommunicationAuditEntry["action"]);
}

function isFailureDeliveryStatus(status: CommunicationDeliveryStatus): boolean {
  return status === "failed" || status === "bounced" || status === "complained";
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
    history: delivery.history.map((entry) => ({ ...entry })),
  }));
  const summary = summarizeDeliveries(deliveries, recipients.length);
  return {
    ...send,
    ...summary,
    data: cloneData(send.data),
    template: { ...send.template },
    recipients,
    deliveries,
    history: send.history.map((entry) => ({ ...entry, details: cloneData(entry.details) })),
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

export class CommunicationService {
  private readonly clock: () => Date;
  private readonly previewLifetimeMs: number;

  constructor(
    private readonly repository: CommunicationRepository,
    private readonly deliveryAdapter?: CommunicationDeliveryAdapter,
    options: CommunicationServiceOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.previewLifetimeMs = options.previewLifetimeMs ?? 15 * 60 * 1_000;
    if (!Number.isSafeInteger(this.previewLifetimeMs) || this.previewLifetimeMs < 1_000) {
      throw new Error("previewLifetimeMs must be at least one second.");
    }
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
    const sender = input.sender ?? senderForPurpose(purpose);
    if (sender !== senderForPurpose(purpose)) {
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
    const versions = await this.repository.listTemplates(actor.tenantId, existing.eventId);
    const latest = versions
      .filter((candidate) => candidate.id === existing.id)
      .reduce((maximum, candidate) => Math.max(maximum, candidate.version), 0);
    const now = this.clock().toISOString();
    return this.repository.saveTemplate({
      ...existing,
      version: latest + 1,
      status: "draft",
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
    return this.repository.saveTemplate({
      ...template,
      status: "approved",
      approvedBy: actor.userId,
      approvedAt: now,
      updatedAt: now,
    });
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
    return this.repository.saveTemplate({
      ...template,
      status: "archived",
      updatedAt: this.clock().toISOString(),
    });
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
    requireOrganizer(actor, input.eventId);
    if (input.purpose !== "organizer_group_email") {
      throw invalidInput(
        "Only organizer group email templates can preview a participant audience.",
      );
    }
    const audience = requireAudience(input.audience);
    const authorization = this.assertAudienceAuthorized(actor.tenantId, input.eventId, audience);
    const templatePromise = this.resolveApprovedTemplate(
      actor.tenantId,
      input.eventId,
      input.templateId,
      input.templateVersion,
      input.purpose,
    );
    const recipientsPromise = this.repository.listRecipients(
      actor.tenantId,
      input.eventId,
      audience,
    );
    const [, template, recipients] = await Promise.all([
      authorization,
      templatePromise,
      recipientsPromise,
    ]);
    const snapshots = recipients.map((recipient) =>
      this.assertRecipientScope(recipient, actor, input.eventId),
    );
    const data = cloneData(input.data);
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
    const existing = await this.repository.findSendByIdempotency(
      actor.tenantId,
      input.eventId,
      idempotencyKey,
    );
    if (existing !== undefined) {
      return copySend(existing);
    }
    if (this.deliveryAdapter === undefined) {
      throw unavailable("Operational email delivery is not configured.");
    }
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
    const created = await this.createSend(actor, {
      eventId: input.eventId,
      purpose: preview.purpose,
      audience: preview.audience,
      template,
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
    const existing = await this.repository.findSendByIdempotency(
      actor.tenantId,
      input.eventId,
      idempotencyKey,
    );
    if (existing !== undefined) {
      return copySend(existing);
    }
    if (this.deliveryAdapter === undefined) {
      throw unavailable("Operational email delivery is not configured.");
    }
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
    const created = await this.createSend(actor, {
      eventId: input.eventId,
      purpose,
      audience: null,
      template,
      recipients: snapshots,
      data: cloneData(input.data),
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
      (input.reason === undefined || input.reason === delivery.failureReason)
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
      reason: input.reason ?? null,
      actorId: actor.userId,
    };
    const nextDelivery: CommunicationDelivery = {
      ...delivery,
      status,
      providerMessageId: input.providerMessageId ?? delivery.providerMessageId,
      failureReason:
        status === "failed" || status === "bounced" || status === "complained"
          ? (input.reason ?? delivery.failureReason)
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
        reason: input.reason ?? null,
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
    if (selected.sender !== senderForPurpose(purpose)) {
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
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        idempotencyKey: `${current.id}:${recipient.id}`,
      };
      let result: CommunicationDeliveryResult;
      try {
        result = await this.deliveryAdapter.send(request);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "The delivery provider failed.";
        current = this.applyDeliveryResult(actor, current, recipient.id, {
          status: "failed",
          reason,
        });
        await this.repository.saveSend(current);
        continue;
      }
      current = this.applyDeliveryResult(actor, current, recipient.id, {
        status: result.status ?? "queued",
        ...(result.providerMessageId === undefined
          ? {}
          : { providerMessageId: result.providerMessageId }),
        ...(result.reason === undefined ? {} : { reason: result.reason }),
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
      reason: result.reason ?? null,
      actorId: actor.userId,
    };
    const nextDelivery: CommunicationDelivery = {
      ...current,
      status: result.status,
      providerMessageId: result.providerMessageId ?? current.providerMessageId,
      failureReason:
        result.status === "failed" || result.status === "bounced" || result.status === "complained"
          ? (result.reason ?? current.failureReason)
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
        reason: result.reason ?? null,
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
    return [...this.recipients.values()].some(
      (recipient) =>
        recipient.tenantId === tenantId &&
        recipient.eventId === eventId &&
        (recipient.audiences.length === 0 || recipient.audiences.includes(audience)),
    );
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

export type CommunicationRepositoryGrant = CommunicationGrant;
export type {
  CommunicationActor,
  CommunicationDeliveryAdapter,
  CommunicationRepository,
} from "./types";
