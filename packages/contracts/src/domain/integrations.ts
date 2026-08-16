import { z } from "zod";
import {
  apiScopeSchema,
  apiScopes,
  idempotencyKeySchema,
  jsonValueSchema,
  timestampSchema,
} from "./common";
import {
  agendaVersionIdSchema,
  eventIdSchema,
  participantIdSchema,
  reviewIdSchema,
  submissionIdSchema,
  taskIdSchema,
  webhookDeliveryIdSchema,
  webhookSubscriptionIdSchema,
} from "./ids";
import { webhookDeliveryStatusSchema } from "./lifecycle";

export const organizationApiKeySummarySchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1).max(100),
  prefix: z.string().trim().min(1),
  scopes: z.array(apiScopeSchema).min(1),
  eventId: z.string().trim().min(1).nullable(),
  createdAt: timestampSchema,
  lastUsedAt: timestampSchema.nullable(),
  expiresAt: timestampSchema.nullable(),
  revokedAt: timestampSchema.nullable(),
});
export type OrganizationApiKeySummary = z.infer<typeof organizationApiKeySummarySchema>;

export const createOrganizationApiKeyRequestSchema = z.object({
  label: z.string().trim().min(1).max(100),
  scopes: z.array(apiScopeSchema).min(1).max(apiScopes.length),
  expiresAt: z
    .string()
    .trim()
    .max(80)
    .refine((value) => !Number.isNaN(Date.parse(value)), "The expiration date is invalid.")
    .nullable(),
  eventId: z.string().trim().min(1).max(200).nullable().optional(),
});
export type CreateOrganizationApiKeyRequest = z.infer<typeof createOrganizationApiKeyRequestSchema>;

export const oneTimeApiKeySecretSchema = z.object({
  id: z.string().trim().min(1),
  secret: z.string().trim().min(1),
});
export type OneTimeApiKeySecret = z.infer<typeof oneTimeApiKeySecretSchema>;

export const webhookEventTypes = [
  "submission.created",
  "submission.updated",
  "submission.submitted",
  "submission.withdrawn",
  "submission.decision_changed",
  "participant.updated",
  "review.submitted",
  "task.updated",
  "agenda.published",
  "agenda.rolled_back",
] as const;
export const webhookEventTypeSchema = z.enum(webhookEventTypes);
export type WebhookEventType = z.infer<typeof webhookEventTypeSchema>;

export const webhookSubscriptionSchema = z.object({
  id: webhookSubscriptionIdSchema,
  eventId: eventIdSchema,
  endpointUrl: z.url(),
  events: z.array(webhookEventTypeSchema).min(1),
  active: z.boolean(),
  signingSecretLastFour: z.string().length(4),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type WebhookSubscription = z.infer<typeof webhookSubscriptionSchema>;

export const webhookResourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("submission"), id: submissionIdSchema }),
  z.object({ type: z.literal("participant"), id: participantIdSchema }),
  z.object({ type: z.literal("review"), id: reviewIdSchema }),
  z.object({ type: z.literal("task"), id: taskIdSchema }),
  z.object({ type: z.literal("agenda_version"), id: agendaVersionIdSchema }),
]);

export const webhookEventSchema = z.object({
  id: webhookDeliveryIdSchema,
  type: webhookEventTypeSchema,
  eventId: eventIdSchema,
  occurredAt: timestampSchema,
  resource: webhookResourceSchema,
  data: jsonValueSchema,
});
export type WebhookEvent = z.infer<typeof webhookEventSchema>;

export const webhookSignatureHeadersSchema = z.object({
  "webhook-id": webhookDeliveryIdSchema,
  "webhook-timestamp": z.string().regex(/^\d{10,}$/),
  "webhook-signature": z.string().regex(/^v1,[A-Za-z0-9+/=_-]+$/),
});
export type WebhookSignatureHeaders = z.infer<typeof webhookSignatureHeadersSchema>;

export const webhookDeliverySchema = z.object({
  id: webhookDeliveryIdSchema,
  subscriptionId: webhookSubscriptionIdSchema,
  event: webhookEventSchema,
  status: webhookDeliveryStatusSchema,
  attemptCount: z.int().nonnegative(),
  nextAttemptAt: timestampSchema.nullable(),
  lastResponseStatus: z.int().min(100).max(599).nullable(),
  lastError: z.string().trim().min(1).nullable(),
  createdAt: timestampSchema,
  completedAt: timestampSchema.nullable(),
});
export type WebhookDelivery = z.infer<typeof webhookDeliverySchema>;

export const openSendSenderSchema = z.email();

export const openSendEmailPayloadSchema = z.object({
  from: openSendSenderSchema,
  to: z.array(z.email()).min(1),
  subject: z.string().trim().min(1).max(998),
  html: z.string().min(1),
  text: z.string().min(1),
  idempotencyKey: idempotencyKeySchema,
});
export type OpenSendEmailPayload = z.infer<typeof openSendEmailPayloadSchema>;

export const calendarInvitationPayloadSchema = z.object({
  method: z.enum(["REQUEST", "UPDATE", "CANCEL"]),
  uid: z.string().trim().min(1).max(255),
  sequence: z.int().nonnegative(),
  timeZone: z.string().trim().min(1),
  startsAt: timestampSchema,
  endsAt: timestampSchema,
  organizer: z.email(),
  attendees: z.array(z.email()).min(1),
  summary: z.string().trim().min(1).max(300),
  location: z.string().trim().max(300),
  idempotencyKey: idempotencyKeySchema,
});
export type CalendarInvitationPayload = z.infer<typeof calendarInvitationPayloadSchema>;

export const publicationOutboxPayloadSchema = z.discriminatedUnion("effect", [
  z.object({ effect: z.literal("invalidate_public_feeds"), eventId: eventIdSchema }),
  z.object({
    effect: z.literal("deliver_calendar_updates"),
    payload: calendarInvitationPayloadSchema,
  }),
  z.object({ effect: z.literal("deliver_webhook"), deliveryId: webhookDeliveryIdSchema }),
]);
export type PublicationOutboxPayload = z.infer<typeof publicationOutboxPayloadSchema>;
