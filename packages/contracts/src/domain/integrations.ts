import { z } from "zod";
import { idempotencyKeySchema, jsonValueSchema, timestampSchema } from "./common";
import {
  agendaVersionIdSchema,
  eventIdSchema,
  integrationPublicationIdSchema,
  participantIdSchema,
  reviewIdSchema,
  sessionIdSchema,
  submissionIdSchema,
  syncAttemptIdSchema,
  taskIdSchema,
  webhookDeliveryIdSchema,
  webhookSubscriptionIdSchema,
} from "./ids";
import {
  integrationPublicationStatusSchema,
  webhookDeliveryStatusSchema,
} from "./lifecycle";

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
  "integration.publication_completed",
  "integration.publication_failed",
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
  z.object({
    type: z.literal("integration_publication"),
    id: integrationPublicationIdSchema,
  }),
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

export const integrationFieldMappingSchema = z.object({
  sourceField: z.string().trim().min(1).max(200),
  destinationField: z.string().trim().min(1).max(200),
  required: z.boolean(),
});
export type IntegrationFieldMapping = z.infer<typeof integrationFieldMappingSchema>;

export const acceleventsSpeakerPayloadSchema = z.object({
  externalId: participantIdSchema,
  email: z.email(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  biography: z.string().trim().max(10_000),
  company: z.string().trim().max(200).nullable(),
  jobTitle: z.string().trim().max(200).nullable(),
  headshotUrl: z.url().nullable(),
});
export type AcceleventsSpeakerPayload = z.infer<typeof acceleventsSpeakerPayloadSchema>;

export const acceleventsSessionPayloadSchema = z.object({
  externalId: sessionIdSchema,
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(20_000),
  startsAt: timestampSchema,
  endsAt: timestampSchema,
  timeZone: z.string().trim().min(1),
  location: z.string().trim().max(300).nullable(),
  room: z.string().trim().min(1).max(200),
  track: z.string().trim().max(200).nullable(),
  tags: z.array(z.string().trim().min(1).max(100)),
  speakerExternalIds: z.array(participantIdSchema).min(1),
});
export type AcceleventsSessionPayload = z.infer<typeof acceleventsSessionPayloadSchema>;

export const integrationRecordErrorSchema = z.object({
  externalId: z.string().trim().min(1),
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  message: z.string().trim().min(1),
  retryable: z.boolean(),
});
export type IntegrationRecordError = z.infer<typeof integrationRecordErrorSchema>;

export const acceleventsPublicationPreviewSchema = z.object({
  publicationId: integrationPublicationIdSchema,
  eventId: eventIdSchema,
  agendaRevisionId: agendaVersionIdSchema,
  speakers: z.array(acceleventsSpeakerPayloadSchema),
  sessions: z.array(acceleventsSessionPayloadSchema),
  mappings: z.array(integrationFieldMappingSchema),
  validationErrors: z.array(integrationRecordErrorSchema),
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: timestampSchema,
});
export type AcceleventsPublicationPreview = z.infer<
  typeof acceleventsPublicationPreviewSchema
>;

export const publishAcceleventsRequestSchema = z.object({
  publicationId: integrationPublicationIdSchema,
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey: idempotencyKeySchema,
});
export type PublishAcceleventsRequest = z.infer<typeof publishAcceleventsRequestSchema>;

export const integrationPublicationSchema = z.object({
  id: integrationPublicationIdSchema,
  eventId: eventIdSchema,
  provider: z.literal("accelevents"),
  agendaRevisionId: agendaVersionIdSchema,
  status: integrationPublicationStatusSchema,
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: timestampSchema,
  completedAt: timestampSchema.nullable(),
});
export type IntegrationPublication = z.infer<typeof integrationPublicationSchema>;

export const syncAttemptSchema = z.object({
  id: syncAttemptIdSchema,
  publicationId: integrationPublicationIdSchema,
  attempt: z.int().positive(),
  status: z.enum(["running", "succeeded", "failed"]),
  errors: z.array(integrationRecordErrorSchema),
  startedAt: timestampSchema,
  completedAt: timestampSchema.nullable(),
});
export type SyncAttempt = z.infer<typeof syncAttemptSchema>;

export const openSendSenderSchema = z.enum([
  "auth@foreverbrowsing.com",
  "speakers@foreverbrowsing.com",
  "calendar@foreverbrowsing.com",
]);

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
  organizer: z.literal("calendar@foreverbrowsing.com"),
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
  z.object({
    effect: z.literal("publish_accelevents"),
    payload: publishAcceleventsRequestSchema,
  }),
  z.object({ effect: z.literal("deliver_webhook"), deliveryId: webhookDeliveryIdSchema }),
]);
export type PublicationOutboxPayload = z.infer<typeof publicationOutboxPayloadSchema>;
