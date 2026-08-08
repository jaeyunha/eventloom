import { z } from "zod";
import {
  entityVersionSchema,
  idempotencyKeySchema,
  jsonValueSchema,
  paginatedResponseSchema,
  timestampSchema,
} from "./common";
import {
  eventIdSchema,
  participantIdSchema,
  taskIdSchema,
  taskTransitionIdSchema,
  userIdSchema,
} from "./ids";
import { taskStatusSchema, taskTypeSchema } from "./lifecycle";

export const taskOwnerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("participant"), participantId: participantIdSchema }),
  z.object({ type: z.literal("organizer"), userId: userIdSchema }),
]);
export type TaskOwner = z.infer<typeof taskOwnerSchema>;

export const taskReminderSchema = z.object({
  sendAt: timestampSchema,
  sentAt: timestampSchema.nullable(),
});
export type TaskReminder = z.infer<typeof taskReminderSchema>;

export const taskAssignmentSchema = z.object({
  id: taskIdSchema,
  eventId: eventIdSchema,
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(10_000),
  type: taskTypeSchema,
  status: taskStatusSchema,
  owner: taskOwnerSchema,
  assigneeParticipantId: participantIdSchema,
  dueAt: timestampSchema.nullable(),
  dependencyIds: z.array(taskIdSchema),
  reminders: z.array(taskReminderSchema),
  completionPayload: jsonValueSchema.nullable(),
  version: entityVersionSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type TaskAssignment = z.infer<typeof taskAssignmentSchema>;

export const taskTransitionSchema = z.object({
  id: taskTransitionIdSchema,
  taskId: taskIdSchema,
  eventId: eventIdSchema,
  fromStatus: taskStatusSchema,
  toStatus: taskStatusSchema,
  actorId: userIdSchema,
  reason: z.string().trim().min(1).max(2_000),
  createdAt: timestampSchema,
});
export type TaskTransition = z.infer<typeof taskTransitionSchema>;

export const createTaskRequestSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(10_000),
  type: taskTypeSchema,
  owner: taskOwnerSchema,
  assigneeParticipantId: participantIdSchema,
  dueAt: timestampSchema.nullable(),
  dependencyIds: z.array(taskIdSchema),
  reminderTimes: z.array(timestampSchema),
  idempotencyKey: idempotencyKeySchema,
});
export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>;

export const transitionTaskRequestSchema = z.object({
  status: taskStatusSchema,
  completionPayload: jsonValueSchema.optional(),
  reason: z.string().trim().min(1).max(2_000),
  expectedVersion: entityVersionSchema,
  idempotencyKey: idempotencyKeySchema,
});
export type TransitionTaskRequest = z.infer<typeof transitionTaskRequestSchema>;

export const taskResponseSchema = z.object({ data: taskAssignmentSchema });
export const tasksResponseSchema = paginatedResponseSchema(taskAssignmentSchema);
