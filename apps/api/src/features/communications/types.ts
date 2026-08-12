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

export type CommunicationDeliveryStatus =
  | "queued"
  | "delivered"
  | "failed"
  | "bounced"
  | "complained";

export type CommunicationSendStatus = "queued" | "delivered" | "partial" | "failed";
export type CommunicationTemplateStatus = "draft" | "approved" | "archived";
export type CommunicationActorKind = "human" | "automation";
export type CommunicationRole = "organizer" | "delivery";

export type CommunicationSenderIdentity =
  | "auth@sessionboard.namuh.co"
  | "speakers@sessionboard.namuh.co"
  | "calendar@sessionboard.namuh.co";

export interface CommunicationGrant {
  eventId: string;
  role: CommunicationRole;
}

export interface CommunicationActor {
  tenantId: string;
  userId: string;
  kind: CommunicationActorKind;
  grants: readonly CommunicationGrant[];
}

export type CommunicationRenderData = Readonly<Record<string, unknown>>;

export interface CommunicationTemplate {
  id: string;
  tenantId: string;
  eventId: string;
  name: string;
  purpose: CommunicationTemplatePurpose;
  version: number;
  status: CommunicationTemplateStatus;
  sender: CommunicationSenderIdentity;
  subject: string;
  html: string;
  text: string;
  variables: readonly string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
}

export type CommunicationTemplateVersion = CommunicationTemplate;

export interface CommunicationRecipient {
  id: string;
  participantId?: string;
  tenantId: string;
  eventId: string;
  email: string;
  displayName: string;
  audiences: readonly CommunicationAudience[];
  data?: CommunicationRenderData;
}

export interface CommunicationRecipientSnapshot {
  id: string;
  participantId: string;
  tenantId: string;
  eventId: string;
  email: string;
  displayName: string;
  audiences: readonly CommunicationAudience[];
  data: CommunicationRenderData;
}

export interface CommunicationAuditEntry {
  id: string;
  tenantId: string;
  eventId: string;
  sendId: string;
  recipientId: string | null;
  action:
    | "preview_created"
    | "send_created"
    | "delivery_queued"
    | "delivery_delivered"
    | "delivery_failed"
    | "delivery_bounced"
    | "delivery_complained"
    | "delivery_retry";
  actorId: string;
  occurredAt: string;
  details: Readonly<Record<string, unknown>>;
}

export interface CommunicationDeliveryHistoryEntry {
  id: string;
  status: CommunicationDeliveryStatus;
  occurredAt: string;
  providerMessageId: string | null;
  reason: string | null;
  actorId: string;
}
export interface CommunicationRecipientPreview {
  recipientId: string;
  email: string;
  displayName: string;
  subject: string;
  html: string;
  text: string;
}

export interface CommunicationDelivery {
  recipientId: string;
  email: string;
  status: CommunicationDeliveryStatus;
  providerMessageId: string | null;
  failureReason: string | null;
  attempts: number;
  history: readonly CommunicationDeliveryHistoryEntry[];
}

export interface CommunicationTemplateSnapshot {
  id: string;
  name: string;
  purpose: CommunicationTemplatePurpose;
  version: number;
  sender: CommunicationSenderIdentity;
  subject: string;
  html: string;
  text: string;
}

export interface CommunicationPreview {
  id: string;
  tenantId: string;
  eventId: string;
  purpose: CommunicationTemplatePurpose;
  templateId: string;
  templateVersion: number;
  audience: CommunicationAudience;
  data: CommunicationRenderData;
  recipientCount: number;
  recipientIds: readonly string[];
  recipients: readonly CommunicationRecipientSnapshot[];
  recipientPreviews: readonly CommunicationRecipientPreview[];

  template: CommunicationTemplateSnapshot;
  subject: string;
  html: string;
  text: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
}

export interface CommunicationSend {
  id: string;
  tenantId: string;
  eventId: string;
  purpose: CommunicationTemplatePurpose;
  audience: CommunicationAudience | null;
  templateId: string;
  templateVersion: number;
  template: CommunicationTemplateSnapshot;
  idempotencyKey: string;
  previewId: string | null;
  data: CommunicationRenderData;
  status: CommunicationSendStatus;
  recipientCount: number;
  queuedCount: number;
  deliveredCount: number;
  failedCount: number;
  terminal: boolean;
  recipients: readonly CommunicationRecipientSnapshot[];
  deliveries: readonly CommunicationDelivery[];
  history: readonly CommunicationAuditEntry[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommunicationRepository {
  listTemplates(
    tenantId: string,
    eventId: string,
    purpose?: CommunicationTemplatePurpose,
  ): Promise<readonly CommunicationTemplate[]>;
  getTemplate(
    tenantId: string,
    eventId: string,
    templateId: string,
    version?: number,
  ): Promise<CommunicationTemplate | undefined>;
  saveTemplate(template: CommunicationTemplate): Promise<CommunicationTemplate>;
  listRecipients(
    tenantId: string,
    eventId: string,
    audience: CommunicationAudience,
  ): Promise<readonly CommunicationRecipient[]>;
  getRecipientsByIds(
    tenantId: string,
    eventId: string,
    recipientIds: readonly string[],
  ): Promise<readonly CommunicationRecipient[]>;
  isAudienceAuthorized?(
    tenantId: string,
    eventId: string,
    audience: CommunicationAudience,
  ): Promise<boolean>;
  getPreview(
    tenantId: string,
    eventId: string,
    previewId: string,
  ): Promise<CommunicationPreview | undefined>;
  savePreview(preview: CommunicationPreview): Promise<CommunicationPreview>;
  findSendByIdempotency(
    tenantId: string,
    eventId: string,
    idempotencyKey: string,
  ): Promise<CommunicationSend | undefined>;
  getSend(
    tenantId: string,
    eventId: string,
    sendId: string,
  ): Promise<CommunicationSend | undefined>;
  saveSend(send: CommunicationSend): Promise<CommunicationSend>;
}

export interface CommunicationDeliveryRequest {
  tenantId: string;
  eventId: string;
  sendId: string;
  recipientId: string;
  to: string;
  from: CommunicationSenderIdentity;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
}

export interface CommunicationDeliveryResult {
  status?: CommunicationDeliveryStatus;
  providerMessageId?: string;
  reason?: string;
}

export interface CommunicationDeliveryAdapter {
  send(request: CommunicationDeliveryRequest): Promise<CommunicationDeliveryResult>;
}
export type ReminderTriggerType = "automatic" | "manual";

export type ReminderAudienceType = "task" | "review" | "combined";

export type ReminderRunState = "pending" | "running" | "completed" | "failed";

export type ReminderDispatchStatus =
  | "candidate"
  | "eligible"
  | "skipped"
  | "queued"
  | "provider_accepted"
  | "delivered"
  | "failed"
  | "bounced";

export type ReminderSubject =
  | { type: "task"; taskId: string }
  | { type: "review"; reviewAssignmentId: string };

export interface ReminderRenderedMessage {
  from: CommunicationSenderIdentity;
  subject: string;
  html: string;
  text: string;
}

export interface ReminderCandidate {
  id: string;
  organizationId: string;
  eventId: string;
  recipientApplicationId: string;
  normalizedEmail: string | null;
  displayName: string;
  subject: ReminderSubject;
  eligibilityReason: string;
  cadenceWindow: string;
  nextEligibleAt: string | null;
  eligible: boolean;
  renderedMessage: ReminderRenderedMessage;
}

export interface ReminderCandidateSourceInput {
  organizationId: string;
  eventId: string;
  triggerType: ReminderTriggerType;
  scheduledAt: string;
}

export interface ReminderCandidateSourceResult {
  audienceType: ReminderAudienceType;
  audienceRevision: string;
  candidates: readonly ReminderCandidate[];
}

export interface ReminderCandidateSource {
  listCandidates(input: ReminderCandidateSourceInput): Promise<ReminderCandidateSourceResult>;
}

export interface ReminderRun {
  id: string;
  organizationId: string;
  eventId: string;
  triggerType: ReminderTriggerType;
  audienceType: ReminderAudienceType;
  audienceRevision: string;
  candidateCount: number;
  eligibleCount: number;
  queuedCount: number;
  skippedCount: number;
  failedCount: number;
  state: ReminderRunState;
  configurationFailure: string | null;
  actorId: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReminderDispatch {
  id: string;
  runId: string;
  organizationId: string;
  eventId: string;
  recipient: string;
  subject: ReminderSubject;
  eligibilityReason: string;
  cadenceWindow: string;
  idempotencyKey: string;
  providerMessageId: string | null;
  status: ReminderDispatchStatus;
  skipMetadata: Readonly<Record<string, unknown>> | null;
  failureMetadata: Readonly<Record<string, unknown>> | null;
  createdAt: string;
  updatedAt: string;
  eligibleAt: string | null;
  skippedAt: string | null;
  queuedAt: string | null;
  providerAcceptedAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  bouncedAt: string | null;
  completedAt: string | null;
  outboxJobId: string | null;
}

export interface ReminderRepository {
  getRun(
    organizationId: string,
    eventId: string,
    runId: string,
  ): Promise<ReminderRun | undefined>;
  listRuns(organizationId: string, eventId: string): Promise<readonly ReminderRun[]>;
  insertRun(run: ReminderRun): Promise<ReminderRun>;
  updateRun(run: ReminderRun): Promise<ReminderRun>;
  getDispatch(
    organizationId: string,
    eventId: string,
    dispatchId: string,
  ): Promise<ReminderDispatch | undefined>;
  findDispatchByIdempotency(
    organizationId: string,
    eventId: string,
    idempotencyKey: string,
  ): Promise<ReminderDispatch | undefined>;
  findDispatchByProviderMessageId(
    organizationId: string,
    eventId: string,
    providerMessageId: string,
  ): Promise<ReminderDispatch | undefined>;
  listDispatches(
    organizationId: string,
    eventId: string,
    runId?: string,
  ): Promise<readonly ReminderDispatch[]>;
  insertDispatch(dispatch: ReminderDispatch): Promise<ReminderDispatch>;
  updateDispatch(dispatch: ReminderDispatch): Promise<ReminderDispatch>;
}

export interface ReminderOutboxEnqueueInput {
  dispatchId: string;
  runId: string;
  organizationId: string;
  eventId: string;
  recipient: string;
  from: CommunicationSenderIdentity;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
}

export interface ReminderOutboxDelivery {
  enqueue(input: ReminderOutboxEnqueueInput): Promise<{ outboxJobId: string }>;
}

export interface ReminderRuntime {
  repository: ReminderRepository;
  source?: ReminderCandidateSource;
  outbox?: ReminderOutboxDelivery;
}

export interface ReminderFacts {
  lastAutomatic: ReminderRun | null;
  lastManual: ReminderRun | null;
  nextEligibleAt: string | null;
  lastOutcome: ReminderDispatch | null;
}
