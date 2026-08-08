import { z } from "zod";
import { entityVersionSchema, idempotencyKeySchema, timestampSchema } from "./common";
import {
  agendaIdSchema,
  agendaVersionIdSchema,
  eventIdSchema,
  participantIdSchema,
  roomIdSchema,
  sessionIdSchema,
  trackIdSchema,
  userIdSchema,
} from "./ids";
import { agendaVersionStatusSchema } from "./lifecycle";

export const ianaTimeZoneSchema = z
  .string()
  .trim()
  .refine(
    (timeZone) => timeZone === "UTC" || /^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)+$/.test(timeZone),
    "Expected an IANA timezone",
  );

export const zonedScheduleTimeSchema = z.object({
  instant: timestampSchema,
  timeZone: ianaTimeZoneSchema,
});
export type ZonedScheduleTime = z.infer<typeof zonedScheduleTimeSchema>;

export const scheduledSessionSchema = z
  .object({
    sessionId: sessionIdSchema,
    roomId: roomIdSchema,
    trackId: trackIdSchema.nullable(),
    participantIds: z.array(participantIdSchema).min(1),
    startsAt: zonedScheduleTimeSchema,
    endsAt: zonedScheduleTimeSchema,
    capacity: z.int().positive().nullable(),
  })
  .superRefine((session, context) => {
    if (Date.parse(session.endsAt.instant) <= Date.parse(session.startsAt.instant)) {
      context.addIssue({
        code: "custom",
        path: ["endsAt", "instant"],
        message: "Session end must be after its start",
      });
    }
    if (session.startsAt.timeZone !== session.endsAt.timeZone) {
      context.addIssue({
        code: "custom",
        path: ["endsAt", "timeZone"],
        message: "Session start and end must use the same timezone",
      });
    }
  });
export type ScheduledSession = z.infer<typeof scheduledSessionSchema>;

export const hardConflictSchema = z.object({
  type: z.enum(["room_overlap", "participant_overlap"]),
  sessionIds: z.array(sessionIdSchema).min(2),
  message: z.string().trim().min(1).max(2_000),
});
export type HardConflict = z.infer<typeof hardConflictSchema>;

export const softWarningTypes = [
  "track_overlap",
  "capacity",
  "travel_time",
  "custom_rule",
] as const;
export const softWarningSchema = z.object({
  type: z.enum(softWarningTypes),
  sessionIds: z.array(sessionIdSchema).min(1),
  message: z.string().trim().min(1).max(2_000),
  ruleId: z.string().trim().min(1).nullable(),
});
export type SoftWarning = z.infer<typeof softWarningSchema>;

export const scheduleOverrideSchema = z.object({
  warning: softWarningSchema,
  reason: z.string().trim().min(1).max(2_000),
  approvedBy: userIdSchema,
  approvedAt: timestampSchema,
});
export type ScheduleOverride = z.infer<typeof scheduleOverrideSchema>;

export const agendaVersionSchema = z.object({
  id: agendaVersionIdSchema,
  agendaId: agendaIdSchema,
  eventId: eventIdSchema,
  number: entityVersionSchema,
  status: agendaVersionStatusSchema,
  sessions: z.array(scheduledSessionSchema),
  hardConflicts: z.array(hardConflictSchema),
  softWarnings: z.array(softWarningSchema),
  overrides: z.array(scheduleOverrideSchema),
  basedOnVersionId: agendaVersionIdSchema.nullable(),
  createdBy: userIdSchema,
  createdAt: timestampSchema,
});
export type AgendaVersion = z.infer<typeof agendaVersionSchema>;

export const agendaDraftSchema = agendaVersionSchema.extend({
  status: z.enum(["draft", "validating", "ready"]),
  version: entityVersionSchema,
  updatedAt: timestampSchema,
});
export type AgendaDraft = z.infer<typeof agendaDraftSchema>;

export const publishedAgendaRevisionSchema = agendaVersionSchema.extend({
  status: z.literal("published"),
  publishedBy: userIdSchema,
  publishedAt: timestampSchema,
  publicationIdempotencyKey: idempotencyKeySchema,
});
export type PublishedAgendaRevision = z.infer<typeof publishedAgendaRevisionSchema>;

export const agendaDiffSchema = z.object({
  fromVersionId: agendaVersionIdSchema.nullable(),
  toVersionId: agendaVersionIdSchema,
  addedSessionIds: z.array(sessionIdSchema),
  removedSessionIds: z.array(sessionIdSchema),
  changedSessionIds: z.array(sessionIdSchema),
});
export type AgendaDiff = z.infer<typeof agendaDiffSchema>;

export const updateAgendaDraftRequestSchema = z.object({
  sessions: z.array(scheduledSessionSchema),
  expectedVersion: entityVersionSchema,
  idempotencyKey: idempotencyKeySchema,
});
export type UpdateAgendaDraftRequest = z.infer<typeof updateAgendaDraftRequestSchema>;

export const publishAgendaRequestSchema = z.object({
  expectedVersion: entityVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  overrides: z.array(scheduleOverrideSchema),
});
export type PublishAgendaRequest = z.infer<typeof publishAgendaRequestSchema>;

export const rollbackAgendaRequestSchema = z.object({
  targetRevisionId: agendaVersionIdSchema,
  expectedVersion: entityVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  reason: z.string().trim().min(1).max(2_000),
});
export type RollbackAgendaRequest = z.infer<typeof rollbackAgendaRequestSchema>;

export const agendaVersionResponseSchema = z.object({ data: agendaVersionSchema });
export const agendaPreviewResponseSchema = z.object({
  data: z.object({
    version: agendaVersionSchema,
    diff: agendaDiffSchema,
    canPublish: z.boolean(),
  }),
});
