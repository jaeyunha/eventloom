import { z } from "zod";
import {
  entityVersionSchema,
  idempotencyKeySchema,
  jsonValueSchema,
  paginatedResponseSchema,
  timestampSchema,
} from "./common";
import {
  assetFamilyIdSchema,
  assetVersionIdSchema,
  eventIdSchema,
  organizationIdSchema,
  participantIdSchema,
  reminderDispatchIdSchema,
  submissionIdSchema,
  taskIdSchema,
  taskTransitionIdSchema,
  userIdSchema,
} from "./ids";
import { taskStatusSchema, taskTypeSchema } from "./lifecycle";
import {
  mutationEnvelopeSchema as authoritativeMutationEnvelopeSchema,
  type MutationEnvelope,
} from "./submissions";

export const taskSubjectSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("participant"), participantId: participantIdSchema }).strict(),
  z
    .object({
      type: z.literal("session"),
      participantId: participantIdSchema,
      submissionId: submissionIdSchema,
    })
    .strict(),
]);
export type TaskSubject = z.infer<typeof taskSubjectSchema>;

export const taskAssignmentMappingSchema = z
  .object({
    participantId: participantIdSchema,
    submissionId: submissionIdSchema.nullable(),
  })
  .strict();
export type TaskAssignmentMapping = z.infer<typeof taskAssignmentMappingSchema>;

export const taskAssignmentMappingsSchema = z
  .array(taskAssignmentMappingSchema)
  .min(1)
  .superRefine((assignments, context) => {
    const seen = new Set<string>();
    assignments.forEach((assignment, index) => {
      const key = `${assignment.participantId}\u0000${assignment.submissionId ?? ""}`;
      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: "A participant and submission pair may only be assigned once",
        });
      }
      seen.add(key);
    });
  });
export type TaskAssignmentMappings = z.infer<typeof taskAssignmentMappingsSchema>;

export const taskReminderSchema = z
  .object({
    id: reminderDispatchIdSchema,
    sendAt: timestampSchema,
    sentAt: timestampSchema.nullable(),
  })
  .strict();
export type TaskReminder = z.infer<typeof taskReminderSchema>;

export const assetVersionSchema = z
  .object({
    id: assetVersionIdSchema,
    assetFamilyId: assetFamilyIdSchema,
    organizationId: organizationIdSchema,
    eventId: eventIdSchema,
    participantId: participantIdSchema,
    submissionId: submissionIdSchema.nullable(),
    taskId: taskIdSchema.nullable(),
    version: entityVersionSchema,
    createdAt: timestampSchema,
  })
  .strict();
export type AssetVersion = z.infer<typeof assetVersionSchema>;

export const assetFamilySchema = z
  .object({
    id: assetFamilyIdSchema,
    organizationId: organizationIdSchema,
    eventId: eventIdSchema,
    participantId: participantIdSchema,
    submissionId: submissionIdSchema.nullable(),
    taskId: taskIdSchema.nullable(),
    latestVersionId: assetVersionIdSchema.nullable(),
    currentVersionId: assetVersionIdSchema.nullable(),
    approvedVersionId: assetVersionIdSchema.nullable(),
    releasedVersionId: assetVersionIdSchema.nullable(),
    version: entityVersionSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export type AssetFamily = z.infer<typeof assetFamilySchema>;

export const taskAssignmentSchema = z
  .object({
    id: taskIdSchema,
    organizationId: organizationIdSchema,
    eventId: eventIdSchema,
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().max(10_000),
    type: taskTypeSchema,
    status: taskStatusSchema,
    subject: taskSubjectSchema,
    dueAt: timestampSchema.nullable(),
    dependencyIds: z.array(taskIdSchema),
    reminders: z.array(taskReminderSchema),
    completionPayload: jsonValueSchema.nullable(),
    version: entityVersionSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export type TaskAssignment = z.infer<typeof taskAssignmentSchema>;

export const taskTransitionSchema = z
  .object({
    id: taskTransitionIdSchema,
    organizationId: organizationIdSchema,
    eventId: eventIdSchema,
    taskId: taskIdSchema,
    fromStatus: taskStatusSchema,
    toStatus: taskStatusSchema,
    actorId: userIdSchema,
    reason: z.string().trim().min(1).max(2_000),
    createdAt: timestampSchema,
  })
  .strict();
export type TaskTransition = z.infer<typeof taskTransitionSchema>;

export const createTaskRequestSchema = z
  .object({
    organizationId: organizationIdSchema,
    eventId: eventIdSchema,
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().max(10_000),
    type: taskTypeSchema,
    assignments: taskAssignmentMappingsSchema,
    dueAt: timestampSchema.nullable(),
    dependencyIds: z.array(taskIdSchema),
    reminderTimes: z.array(timestampSchema),
    expectedVersion: entityVersionSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();
export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>;

export const transitionTaskRequestSchema = z
  .object({
    organizationId: organizationIdSchema,
    eventId: eventIdSchema,
    status: taskStatusSchema,
    completionPayload: jsonValueSchema.optional(),
    reason: z.string().trim().min(1).max(2_000),
    expectedVersion: entityVersionSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();
export type TransitionTaskRequest = z.infer<typeof transitionTaskRequestSchema>;

export const taskMutationResponseSchema = authoritativeMutationEnvelopeSchema(taskAssignmentSchema);
export type TaskMutationResponse = MutationEnvelope<TaskAssignment>;
export const taskResponseSchema = taskMutationResponseSchema;
export const tasksResponseSchema = paginatedResponseSchema(taskAssignmentSchema);

export const assetFamilyResponseSchema = authoritativeMutationEnvelopeSchema(assetFamilySchema);
export const assetVersionResponseSchema = authoritativeMutationEnvelopeSchema(assetVersionSchema);
