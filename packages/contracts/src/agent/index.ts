import { z } from "zod";

const nonEmptyStringSchema = z.string().trim().min(1);
const nullableTimestampSchema = z.iso.datetime({ offset: true }).nullable();

export const agentRoles = ["organizer", "reviewer", "speaker"] as const;
export const agentRoleSchema = z.enum(agentRoles);
export type AgentRole = z.infer<typeof agentRoleSchema>;

export const agentCapabilities = [
  "organizer.overview.read",
  "reviewer.workspace.read",
  "speaker.portal.read",
  "speaker.tasks.read",
] as const;
export const agentCapabilitySchema = z.enum(agentCapabilities);
export type AgentCapability = z.infer<typeof agentCapabilitySchema>;

export const organizationReferenceSchema = z
  .object({
    id: nonEmptyStringSchema,
    name: nonEmptyStringSchema,
  })
  .strict();
export type OrganizationReference = z.infer<typeof organizationReferenceSchema>;

export const eventReferenceSchema = z
  .object({
    id: nonEmptyStringSchema,
    name: nonEmptyStringSchema,
  })
  .strict();
export type EventReference = z.infer<typeof eventReferenceSchema>;

const membershipRoleSchema = z.enum(["owner", "admin", "reviewer"]);

export const organizationAccessContextSchema = z
  .object({
    scope: z.literal("organization"),
    organization: organizationReferenceSchema,
    membershipRole: membershipRoleSchema.optional(),
    roles: z.array(agentRoleSchema),
    capabilities: z.array(agentCapabilitySchema),
  })
  .strict();
export type OrganizationAccessContext = z.infer<typeof organizationAccessContextSchema>;

export const eventAccessContextSchema = z
  .object({
    scope: z.literal("event"),
    organization: organizationReferenceSchema,
    event: eventReferenceSchema,
    membershipRole: membershipRoleSchema.optional(),
    roles: z.array(agentRoleSchema),
    capabilities: z.array(agentCapabilitySchema),
  })
  .strict();
export type EventAccessContext = z.infer<typeof eventAccessContextSchema>;

export const accessContextSchema = z.discriminatedUnion("scope", [
  organizationAccessContextSchema,
  eventAccessContextSchema,
]);
export type AccessContext = z.infer<typeof accessContextSchema>;

export const accountProfileSchema = z
  .object({
    name: nonEmptyStringSchema,
    origin: z.url(),
    account: z
      .object({
        id: nonEmptyStringSchema,
        email: z.email(),
      })
      .strict(),
  })
  .strict();
export type AccountProfile = z.infer<typeof accountProfileSchema>;

export const accountAccessSchema = z
  .object({
    profile: accountProfileSchema,
    contexts: z.array(accessContextSchema),
  })
  .strict();
export type AccountAccess = z.infer<typeof accountAccessSchema>;

const mappedEventSchema = z
  .object({
    event: eventReferenceSchema,
    hasEvaluationPlan: z.boolean(),
  })
  .strict();

export const membershipAccessMappingInputSchema = z
  .object({
    organization: organizationReferenceSchema,
    membershipRole: membershipRoleSchema,
    events: z.array(mappedEventSchema),
  })
  .strict();
export type MembershipAccessMappingInput = z.infer<typeof membershipAccessMappingInputSchema>;

export const principalVerifiedSpeakerScopeSchema = z
  .object({
    organization: organizationReferenceSchema,
    event: eventReferenceSchema,
    principalVerified: z.literal(true),
  })
  .strict();
export type PrincipalVerifiedSpeakerScope = z.infer<typeof principalVerifiedSpeakerScopeSchema>;

const organizerRoles = ["organizer"] as const satisfies readonly AgentRole[];
const organizerCapabilities = [
  "organizer.overview.read",
] as const satisfies readonly AgentCapability[];
const reviewerRoles = ["reviewer"] as const satisfies readonly AgentRole[];
const reviewerCapabilities = [
  "reviewer.workspace.read",
] as const satisfies readonly AgentCapability[];
const speakerRoles = ["speaker"] as const satisfies readonly AgentRole[];
const speakerCapabilities = [
  "speaker.portal.read",
  "speaker.tasks.read",
] as const satisfies readonly AgentCapability[];

/** Derives server-authoritative contexts from one current organization membership. */
export function mapMembershipToAccessContexts(
  input: MembershipAccessMappingInput,
): AccessContext[] {
  const parsed = membershipAccessMappingInputSchema.parse(input);
  const organizer = parsed.membershipRole === "owner" || parsed.membershipRole === "admin";
  const contexts: AccessContext[] = [
    {
      scope: "organization",
      organization: parsed.organization,
      membershipRole: parsed.membershipRole,
      roles: organizer ? [...organizerRoles] : [],
      capabilities: organizer ? [...organizerCapabilities] : [],
    },
  ];

  for (const entry of parsed.events) {
    if (organizer) {
      contexts.push({
        scope: "event",
        organization: parsed.organization,
        event: entry.event,
        membershipRole: parsed.membershipRole,
        roles: [...organizerRoles],
        capabilities: [...organizerCapabilities],
      });
    } else if (entry.hasEvaluationPlan) {
      contexts.push({
        scope: "event",
        organization: parsed.organization,
        event: entry.event,
        membershipRole: parsed.membershipRole,
        roles: [...reviewerRoles],
        capabilities: [...reviewerCapabilities],
      });
    }
  }

  return contexts;
}

/** Derives speaker reads only from a principal-verified organization/event scope. */
export function mapSpeakerScopeToAccessContext(
  input: PrincipalVerifiedSpeakerScope,
): EventAccessContext {
  const parsed = principalVerifiedSpeakerScopeSchema.parse(input);
  return {
    scope: "event",
    organization: parsed.organization,
    event: parsed.event,
    roles: [...speakerRoles],
    capabilities: [...speakerCapabilities],
  };
}

export const urgencySchema = z.enum(["Urgent", "Upcoming", "Later"]);
export type Urgency = z.infer<typeof urgencySchema>;

export const briefingSeveritySchema = z.enum(["critical", "high", "normal"]);
export type BriefingSeverity = z.infer<typeof briefingSeveritySchema>;

export const organizerStatusSchema = z
  .object({
    organizations: z.array(
      z
        .object({
          organization: organizationReferenceSchema,
          membershipRole: z.enum(["owner", "admin"]),
          actionItems: z.array(
            z
              .object({
                id: nonEmptyStringSchema,
                title: nonEmptyStringSchema,
                dueAt: nullableTimestampSchema,
                priority: z.number().min(0).max(100),
                eventId: nonEmptyStringSchema.optional(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();
export type OrganizerStatus = z.infer<typeof organizerStatusSchema>;

export const reviewerWorkloadWarningSchema = z
  .object({
    code: z.literal("WORKSPACE_UNAVAILABLE"),
    organization: organizationReferenceSchema,
    message: nonEmptyStringSchema,
  })
  .strict();
export type ReviewerWorkloadWarning = z.infer<typeof reviewerWorkloadWarningSchema>;

export const reviewerInboxSchema = z
  .object({
    assignments: z.array(
      z
        .object({
          organization: organizationReferenceSchema,
          event: eventReferenceSchema,
          planId: nonEmptyStringSchema,
          roundId: nonEmptyStringSchema,
          assignmentId: nonEmptyStringSchema,
          title: nonEmptyStringSchema,
          deadline: nullableTimestampSchema,
        })
        .strict(),
    ),
    warnings: z
      .array(
        z
          .object({
            code: z.literal("REVIEWER_WORKSPACE_UNAVAILABLE"),
            message: nonEmptyStringSchema,
            profileName: nonEmptyStringSchema,
            organizationId: nonEmptyStringSchema,
          })
          .strict(),
      )
      .default([]),
  })
  .strict();
export type ReviewerInbox = z.infer<typeof reviewerInboxSchema>;

export const speakerTasksSchema = z
  .object({
    tasks: z.array(
      z
        .object({
          organization: organizationReferenceSchema,
          event: eventReferenceSchema,
          taskId: nonEmptyStringSchema,
          title: nonEmptyStringSchema,
          dueAt: nullableTimestampSchema,
          status: z.enum([
            "not_started",
            "in_progress",
            "submitted",
            "needs_changes",
            "completed",
            "waived",
            "overdue",
            "reopened",
          ]),
        })
        .strict(),
    ),
  })
  .strict();
export type SpeakerTasks = z.infer<typeof speakerTasksSchema>;

export const agentWarningSchema = z
  .object({
    code: z.enum([
      "PROFILE_EXPIRED",
      "AUTHORIZATION_DENIED",
      "CONTEXT_FAILED",
      "REMOTE_LOGOUT_FAILED",
      "REVIEWER_WORKSPACE_UNAVAILABLE",
    ]),
    message: nonEmptyStringSchema,
    profileName: nonEmptyStringSchema.optional(),
    organizationId: nonEmptyStringSchema.optional(),
    eventId: nonEmptyStringSchema.optional(),
  })
  .strict();
export type AgentWarning = z.infer<typeof agentWarningSchema>;

export const briefingItemSchema = z
  .object({
    profileName: nonEmptyStringSchema,
    organization: organizationReferenceSchema,
    event: eventReferenceSchema.nullable(),
    role: agentRoleSchema,
    sourceId: nonEmptyStringSchema,
    title: nonEmptyStringSchema,
    deadline: nullableTimestampSchema,
    severity: briefingSeveritySchema,
    urgency: urgencySchema,
  })
  .strict();
export type BriefingItem = z.infer<typeof briefingItemSchema>;

export const aggregateBriefingSchema = z
  .object({
    generatedAt: z.iso.datetime({ offset: true }),
    profiles: z
      .object({
        requested: z.int().nonnegative(),
        succeeded: z.int().nonnegative(),
        failed: z.int().nonnegative(),
      })
      .strict(),
    items: z.array(briefingItemSchema),
    warnings: z.array(agentWarningSchema),
    requestTraceIds: z.array(nonEmptyStringSchema),
  })
  .strict();
export type AggregateBriefing = z.infer<typeof aggregateBriefingSchema>;

export const cliExitCodes = {
  success: 0,
  unexpectedFailure: 1,
  usageError: 2,
  authenticationFailure: 3,
  authorizationFailure: 4,
  aggregateFailure: 5,
} as const;
export type CliExitCode = (typeof cliExitCodes)[keyof typeof cliExitCodes];

export const cliExitCodeSchema = z.union([
  z.literal(cliExitCodes.success),
  z.literal(cliExitCodes.unexpectedFailure),
  z.literal(cliExitCodes.usageError),
  z.literal(cliExitCodes.authenticationFailure),
  z.literal(cliExitCodes.authorizationFailure),
  z.literal(cliExitCodes.aggregateFailure),
]);

export const cliOutputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("profiles"), profiles: z.array(accountProfileSchema) }).strict(),
  z.object({ kind: z.literal("access"), accounts: z.array(accountAccessSchema) }).strict(),
  z.object({ kind: z.literal("organizerStatus"), status: organizerStatusSchema }).strict(),
  z.object({ kind: z.literal("reviewerInbox"), inbox: reviewerInboxSchema }).strict(),
  z.object({ kind: z.literal("speakerTasks"), tasks: speakerTasksSchema }).strict(),
  z
    .object({
      kind: z.literal("skillInstall"),
      installations: z.array(
        z
          .object({
            agent: z.enum(["codex", "claude-code"]),
            destination: nonEmptyStringSchema,
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      ),
    })
    .strict(),
  z.object({ kind: z.literal("briefing"), briefing: aggregateBriefingSchema }).strict(),
]);
export type CliOutput = z.infer<typeof cliOutputSchema>;

export const cliSuccessEnvelopeSchema = z
  .object({
    success: z.literal(true),
    exitCode: z.literal(cliExitCodes.success),
    output: cliOutputSchema,
    warnings: z.array(agentWarningSchema),
    requestTraceIds: z.array(nonEmptyStringSchema),
  })
  .strict();
export type CliSuccessEnvelope = z.infer<typeof cliSuccessEnvelopeSchema>;

const cliErrorDetailSchema = z
  .object({
    message: nonEmptyStringSchema,
  })
  .strict();

export const cliErrorEnvelopeSchema = z.discriminatedUnion("exitCode", [
  z
    .object({
      success: z.literal(false),
      exitCode: z.literal(cliExitCodes.unexpectedFailure),
      error: cliErrorDetailSchema.extend({ code: z.literal("UNEXPECTED_FAILURE") }).strict(),
      requestTraceIds: z.array(nonEmptyStringSchema),
    })
    .strict(),
  z
    .object({
      success: z.literal(false),
      exitCode: z.literal(cliExitCodes.usageError),
      error: cliErrorDetailSchema.extend({ code: z.literal("USAGE_ERROR") }).strict(),
      requestTraceIds: z.array(nonEmptyStringSchema),
    })
    .strict(),
  z
    .object({
      success: z.literal(false),
      exitCode: z.literal(cliExitCodes.authenticationFailure),
      error: cliErrorDetailSchema.extend({ code: z.literal("AUTHENTICATION_FAILED") }).strict(),
      requestTraceIds: z.array(nonEmptyStringSchema),
    })
    .strict(),
  z
    .object({
      success: z.literal(false),
      exitCode: z.literal(cliExitCodes.authorizationFailure),
      error: cliErrorDetailSchema
        .extend({ code: z.enum(["AUTHORIZATION_FAILED", "INCOMPATIBLE_CONTEXT"]) })
        .strict(),
      requestTraceIds: z.array(nonEmptyStringSchema),
    })
    .strict(),
  z
    .object({
      success: z.literal(false),
      exitCode: z.literal(cliExitCodes.aggregateFailure),
      error: cliErrorDetailSchema.extend({ code: z.literal("AGGREGATE_FAILURE") }).strict(),
      requestTraceIds: z.array(nonEmptyStringSchema),
    })
    .strict(),
]);
export type CliErrorEnvelope = z.infer<typeof cliErrorEnvelopeSchema>;

export const cliEnvelopeSchema = z.discriminatedUnion("success", [
  cliSuccessEnvelopeSchema,
  cliErrorEnvelopeSchema,
]);
export type CliEnvelope = z.infer<typeof cliEnvelopeSchema>;
