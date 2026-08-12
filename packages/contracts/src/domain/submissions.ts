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
  crmContactIdSchema,
  eventIdSchema,
  formFieldIdSchema,
  operationReceiptIdSchema,
  organizationIdSchema,
  participantIdSchema,
  secondaryContactIdSchema,
  speakerProfileIdSchema,
  submissionFormIdSchema,
  submissionIdSchema,
  submissionVersionIdSchema,
  userIdSchema,
} from "./ids";
import { participantRoleSchema, submissionStatusSchema } from "./lifecycle";
export const operationStateSchema = z.enum(["completed", "pending", "failed"]);
export type OperationState = z.infer<typeof operationStateSchema>;

export const mutationOperationSchema = z
  .object({
    id: operationReceiptIdSchema,
    state: operationStateSchema,
    revision: entityVersionSchema,
  })
  .strict();
export type MutationOperation = z.infer<typeof mutationOperationSchema>;

export const mutationEnvelopeSchema = <T extends z.ZodType>(dataSchema: T) =>
  z
    .object({
      data: dataSchema,
      operation: mutationOperationSchema,
    })
    .strict();
export type MutationEnvelope<T> = {
  data: T;
  operation: MutationOperation;
};
export const casMutationSchema = z
  .object({
    organizationId: organizationIdSchema,
    eventId: eventIdSchema,
    expectedVersion: entityVersionSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();
export type CasMutation = z.infer<typeof casMutationSchema>;
export const casMutationRequestSchema = casMutationSchema;
export const speakerWorkspaceExpectedVersionSchema = z
  .object({
    expectedRosterVersion: entityVersionSchema,
    expectedProfileVersion: entityVersionSchema,
  })
  .strict();
export type SpeakerWorkspaceExpectedVersion = z.infer<typeof speakerWorkspaceExpectedVersionSchema>;

export const submissionAnswersSchema = z.record(formFieldIdSchema, jsonValueSchema);

export const participantPermissions = [
  "view_submission",
  "edit_own_profile",
  "manage_own_assets",
  "view_own_tasks",
  "update_own_tasks",
] as const;
export const participantPermissionSchema = z.enum(participantPermissions);

export const participantGrantSchema = z
  .object({
    organizationId: organizationIdSchema,
    eventId: eventIdSchema,
    participantId: participantIdSchema,
    userId: userIdSchema,
    permissions: z.array(participantPermissionSchema).min(1),
    grantedAt: timestampSchema,
    revokedAt: timestampSchema.nullable(),
  })
  .strict();
export type ParticipantGrant = z.infer<typeof participantGrantSchema>;

export const participantIdentityStateSchema = z.enum(["resolved", "ambiguous", "unclaimed"]);
export type ParticipantIdentityState = z.infer<typeof participantIdentityStateSchema>;

export const participantSourceTypeSchema = z.enum(["cfp", "manual", "csv", "crm"]);
export type ParticipantSourceType = z.infer<typeof participantSourceTypeSchema>;

export const normalizedEmailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const submissionParticipantSchema = z
  .object({
    id: participantIdSchema,
    organizationId: organizationIdSchema,
    eventId: eventIdSchema,
    submissionId: submissionIdSchema,
    profileId: speakerProfileIdSchema.nullable(),
    crmContactId: crmContactIdSchema.nullable(),
    role: participantRoleSchema,
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    normalizedEmail: normalizedEmailSchema,
    identityState: participantIdentityStateSchema,
    sourceType: participantSourceTypeSchema,
    sourceId: z.string().trim().min(1).max(500),
    claimedUserId: userIdSchema.nullable(),
    version: entityVersionSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
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
export const submissionParticipantInputSchema = z
  .object({
    id: participantIdSchema.optional(),
    role: participantRoleSchema,
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: normalizedEmailSchema,
  })
  .strict();
export type SubmissionParticipantInput = z.infer<typeof submissionParticipantInputSchema>;

export const secondaryContactInputSchema = z.object({
  id: secondaryContactIdSchema.optional(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.email(),
});
export type SecondaryContactInput = z.infer<typeof secondaryContactInputSchema>;

export const speakerProfileSchema = z
  .object({
    id: speakerProfileIdSchema,
    organizationId: organizationIdSchema,
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
  })
  .strict();
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
  participants: z.array(submissionParticipantInputSchema).max(15).optional(),
  secondaryContacts: z.array(secondaryContactInputSchema).optional(),
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

export const submissionMutationResponseSchema = mutationEnvelopeSchema(submissionSchema);
export type SubmissionMutationResponse = MutationEnvelope<Submission>;
export const submissionResponseSchema = submissionMutationResponseSchema;
export const submissionsResponseSchema = paginatedResponseSchema(submissionSchema);

export const participantMutationResponseSchema = mutationEnvelopeSchema(
  submissionParticipantSchema,
);
export type ParticipantMutationResponse = MutationEnvelope<SubmissionParticipant>;
export const participantResponseSchema = participantMutationResponseSchema;
export const participantsResponseSchema = paginatedResponseSchema(submissionParticipantSchema);

export const speakerProfileMutationResponseSchema = mutationEnvelopeSchema(speakerProfileSchema);
export type SpeakerProfileMutationResponse = MutationEnvelope<SpeakerProfile>;
