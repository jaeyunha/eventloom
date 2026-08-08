import { z } from "zod";
import {
  entityVersionSchema,
  idempotencyKeySchema,
  jsonValueSchema,
  paginatedResponseSchema,
  timestampSchema,
} from "./common";
import {
  accountIdSchema,
  assetIdSchema,
  eventIdSchema,
  formFieldIdSchema,
  participantIdSchema,
  secondaryContactIdSchema,
  speakerProfileIdSchema,
  submissionFormIdSchema,
  submissionIdSchema,
  submissionVersionIdSchema,
  userIdSchema,
} from "./ids";
import { participantRoleSchema, submissionStatusSchema } from "./lifecycle";

export const submissionAnswersSchema = z.record(formFieldIdSchema, jsonValueSchema);

export const participantPermissions = [
  "view_submission",
  "edit_own_profile",
  "manage_own_assets",
  "view_own_tasks",
  "update_own_tasks",
] as const;
export const participantPermissionSchema = z.enum(participantPermissions);

export const participantGrantSchema = z.object({
  eventId: eventIdSchema,
  participantId: participantIdSchema,
  userId: userIdSchema,
  permissions: z.array(participantPermissionSchema).min(1),
  grantedAt: timestampSchema,
  revokedAt: timestampSchema.nullable(),
});
export type ParticipantGrant = z.infer<typeof participantGrantSchema>;

export const submissionParticipantSchema = z.object({
  id: participantIdSchema,
  eventId: eventIdSchema,
  submissionId: submissionIdSchema,
  profileId: speakerProfileIdSchema.nullable(),
  role: participantRoleSchema,
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.email(),
  userId: userIdSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type SubmissionParticipant = z.infer<typeof submissionParticipantSchema>;

export const secondaryContactSchema = z.object({
  id: secondaryContactIdSchema,
  eventId: eventIdSchema,
  submissionId: submissionIdSchema,
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.email(),
  userId: userIdSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type SecondaryContact = z.infer<typeof secondaryContactSchema>;

export const speakerProfileSchema = z.object({
  id: speakerProfileIdSchema,
  eventId: eventIdSchema,
  participantId: participantIdSchema,
  biography: z.string().trim().max(10_000),
  company: z.string().trim().max(200).nullable(),
  jobTitle: z.string().trim().max(200).nullable(),
  location: z.string().trim().max(200).nullable(),
  websiteUrl: z.url().nullable(),
  socialUrl: z.url().nullable(),
  headshotAssetId: assetIdSchema.nullable(),
  version: entityVersionSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type SpeakerProfile = z.infer<typeof speakerProfileSchema>;

export const submissionSchema = z.object({
  id: submissionIdSchema,
  eventId: eventIdSchema,
  formId: submissionFormIdSchema,
  submitterAccountId: accountIdSchema,
  status: submissionStatusSchema,
  title: z.string().trim().min(1).max(300),
  abstract: z.string().trim().max(20_000),
  answers: submissionAnswersSchema,
  participantIds: z.array(participantIdSchema).max(15),
  secondaryContactIds: z.array(secondaryContactIdSchema),
  currentVersion: entityVersionSchema,
  submittedAt: timestampSchema.nullable(),
  withdrawnAt: timestampSchema.nullable(),
  reopenedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type Submission = z.infer<typeof submissionSchema>;

export const submissionDraftSchema = z.object({
  submissionId: submissionIdSchema,
  eventId: eventIdSchema,
  formId: submissionFormIdSchema,
  step: z.enum(["welcome", "account", "submission", "participants", "review"]),
  title: z.string().trim().max(300),
  abstract: z.string().trim().max(20_000),
  answers: submissionAnswersSchema,
  participants: z.array(submissionParticipantSchema).max(15),
  secondaryContacts: z.array(secondaryContactSchema),
  version: entityVersionSchema,
  lastSavedAt: timestampSchema,
});
export type SubmissionDraft = z.infer<typeof submissionDraftSchema>;

export const submissionVersionSchema = z.object({
  id: submissionVersionIdSchema,
  submissionId: submissionIdSchema,
  eventId: eventIdSchema,
  version: entityVersionSchema,
  status: submissionStatusSchema,
  title: z.string().trim().min(1).max(300),
  abstract: z.string().trim().max(20_000),
  answers: submissionAnswersSchema,
  participantIds: z.array(participantIdSchema).max(15),
  secondaryContactIds: z.array(secondaryContactIdSchema),
  changedBy: userIdSchema,
  changeReason: z.string().trim().min(1).max(1_000),
  createdAt: timestampSchema,
});
export type SubmissionVersion = z.infer<typeof submissionVersionSchema>;

export const createSubmissionDraftRequestSchema = z.object({
  eventId: eventIdSchema,
  formId: submissionFormIdSchema,
  idempotencyKey: idempotencyKeySchema,
});
export type CreateSubmissionDraftRequest = z.infer<typeof createSubmissionDraftRequestSchema>;

export const updateSubmissionDraftRequestSchema = z.object({
  expectedVersion: entityVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  step: z.enum(["account", "submission", "participants", "review"]),
  title: z.string().trim().max(300).optional(),
  abstract: z.string().trim().max(20_000).optional(),
  answers: submissionAnswersSchema.optional(),
  participants: z.array(submissionParticipantSchema).max(15).optional(),
  secondaryContacts: z.array(secondaryContactSchema).optional(),
});
export type UpdateSubmissionDraftRequest = z.infer<typeof updateSubmissionDraftRequestSchema>;

export const submitSubmissionRequestSchema = z.object({
  expectedVersion: entityVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  termsAccepted: z.literal(true),
});
export type SubmitSubmissionRequest = z.infer<typeof submitSubmissionRequestSchema>;

export const transitionSubmissionRequestSchema = z.object({
  status: z.enum(["withdrawn", "under_review", "accepted", "waitlisted", "declined"]),
  expectedVersion: entityVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  reason: z.string().trim().min(1).max(1_000),
});
export type TransitionSubmissionRequest = z.infer<typeof transitionSubmissionRequestSchema>;

export const reopenSubmissionRequestSchema = z.object({
  expectedVersion: entityVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  reason: z.string().trim().min(1).max(1_000),
});
export type ReopenSubmissionRequest = z.infer<typeof reopenSubmissionRequestSchema>;

export const submissionResponseSchema = z.object({ data: submissionSchema });
export const submissionsResponseSchema = paginatedResponseSchema(submissionSchema);
export const participantResponseSchema = z.object({ data: submissionParticipantSchema });
export const participantsResponseSchema = paginatedResponseSchema(submissionParticipantSchema);
