import { z } from "zod";

export const submissionStatuses = [
  "draft",
  "submitted",
  "under_review",
  "accepted",
  "waitlisted",
  "declined",
  "withdrawn",
] as const;
export const submissionStatusSchema = z.enum(submissionStatuses);
export type SubmissionStatus = z.infer<typeof submissionStatusSchema>;

export const participantRoles = ["primary_speaker", "co_speaker"] as const;
export const participantRoleSchema = z.enum(participantRoles);
export type ParticipantRole = z.infer<typeof participantRoleSchema>;

export const reviewAssignmentStatuses = [
  "assigned",
  "in_progress",
  "submitted",
  "abstained",
] as const;
export const reviewAssignmentStatusSchema = z.enum(reviewAssignmentStatuses);
export type ReviewAssignmentStatus = z.infer<typeof reviewAssignmentStatusSchema>;

export const reviewDecisionStatuses = [
  "pending",
  "accepted",
  "waitlisted",
  "declined",
] as const;
export const reviewDecisionStatusSchema = z.enum(reviewDecisionStatuses);
export type ReviewDecisionStatus = z.infer<typeof reviewDecisionStatusSchema>;

export const taskStatuses = [
  "not_started",
  "in_progress",
  "submitted",
  "needs_changes",
  "completed",
  "waived",
  "overdue",
  "reopened",
] as const;
export const taskStatusSchema = z.enum(taskStatuses);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const taskTypes = ["form", "upload", "action"] as const;
export const taskTypeSchema = z.enum(taskTypes);
export type TaskType = z.infer<typeof taskTypeSchema>;

export const agendaVersionStatuses = [
  "draft",
  "validating",
  "ready",
  "published",
  "superseded",
  "rolled_back",
] as const;
export const agendaVersionStatusSchema = z.enum(agendaVersionStatuses);
export type AgendaVersionStatus = z.infer<typeof agendaVersionStatusSchema>;

export const webhookDeliveryStatuses = [
  "pending",
  "delivering",
  "retrying",
  "succeeded",
  "failed",
  "dead_letter",
] as const;
export const webhookDeliveryStatusSchema = z.enum(webhookDeliveryStatuses);
export type WebhookDeliveryStatus = z.infer<typeof webhookDeliveryStatusSchema>;

export const integrationPublicationStatuses = [
  "preview",
  "queued",
  "publishing",
  "succeeded",
  "partially_failed",
  "failed",
] as const;
export const integrationPublicationStatusSchema = z.enum(integrationPublicationStatuses);
export type IntegrationPublicationStatus = z.infer<typeof integrationPublicationStatusSchema>;
