import { z } from "zod";

export const submissionSteps = [
  "welcome",
  "account",
  "submission",
  "participant",
  "review",
] as const;

export const submissionStepSchema = z.enum(submissionSteps);
export type SubmissionStep = z.infer<typeof submissionStepSchema>;

const identifierSchema = z.string().trim().min(1).max(128);
const isoInstantSchema = z.iso.datetime({ offset: true });

export const eventCfpSchema = z
  .object({
    id: identifierSchema,
    tenantId: identifierSchema,
    slug: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().trim().min(1).max(200),
    timezone: z.string().trim().min(1).max(100),
    opensAt: isoInstantSchema,
    closesAt: isoInstantSchema,
  })
  .superRefine((event, context) => {
    if (Date.parse(event.opensAt) >= Date.parse(event.closesAt)) {
      context.addIssue({
        code: "custom",
        path: ["closesAt"],
        message: "CFP close date must be after its open date.",
      });
    }
  });
export type EventCfp = z.infer<typeof eventCfpSchema>;

export const formFieldKindSchema = z.enum([
  "text",
  "rich_text",
  "email",
  "select",
  "multi_select",
  "boolean",
  "number",
]);
export type FormFieldKind = z.infer<typeof formFieldKindSchema>;

export const formFieldSchema = z.object({
  id: identifierSchema,
  sectionId: identifierSchema,
  key: z.string().trim().min(1).max(100).regex(/^[A-Za-z][A-Za-z0-9_.-]*$/),
  label: z.string().trim().min(1).max(200),
  kind: formFieldKindSchema,
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(200)).max(200).default([]),
});
export type FormField = z.infer<typeof formFieldSchema>;

export const formSectionSchema = z.object({
  id: identifierSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(10_000).default(""),
});
export type FormSection = z.infer<typeof formSectionSchema>;

export const conditionOperatorSchema = z.enum([
  "equals",
  "not_equals",
  "in",
  "not_in",
  "contains",
  "is_empty",
  "is_not_empty",
]);
export type ConditionOperator = z.infer<typeof conditionOperatorSchema>;

export const conditionPredicateSchema = z.object({
  type: z.literal("predicate"),
  fieldKey: identifierSchema,
  operator: conditionOperatorSchema,
  value: z.unknown().optional(),
});
export type ConditionPredicate = z.infer<typeof conditionPredicateSchema>;

export interface ConditionGroup {
  type: "group";
  operator: "all" | "any";
  conditions: Array<ConditionPredicate | ConditionGroup>;
}

export const conditionGroupSchema: z.ZodType<ConditionGroup> = z.lazy(() =>
  z.object({
    type: z.literal("group"),
    operator: z.enum(["all", "any"]),
    conditions: z
      .array(z.union([conditionPredicateSchema, conditionGroupSchema]))
      .min(1)
      .max(100),
  }),
);

export const formRuleActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("show_field"), fieldKey: identifierSchema }),
  z.object({ type: z.literal("hide_field"), fieldKey: identifierSchema }),
  z.object({ type: z.literal("require_field"), fieldKey: identifierSchema }),
  z.object({ type: z.literal("show_section"), sectionId: identifierSchema }),
  z.object({ type: z.literal("hide_section"), sectionId: identifierSchema }),
  z.object({ type: z.literal("skip_section"), sectionId: identifierSchema }),
  z.object({
    type: z.literal("route"),
    queue: z.string().trim().min(1).max(128),
    format: z.string().trim().min(1).max(128).optional(),
    track: z.string().trim().min(1).max(128).optional(),
    category: z.string().trim().min(1).max(128).optional(),
    tags: z.array(z.string().trim().min(1).max(128)).max(50).default([]),
  }),
]);
export type FormRuleAction = z.infer<typeof formRuleActionSchema>;

export const formRuleSchema = z.object({
  id: identifierSchema,
  priority: z.number().int().min(0).max(10_000),
  when: conditionGroupSchema,
  actions: z.array(formRuleActionSchema).min(1).max(100),
});
export type FormRule = z.infer<typeof formRuleSchema>;

export const cfpFormSettingsSchema = z.object({
  speakerLimit: z.number().int().min(1).max(15),
  maxSubmissionsPerAccount: z.number().int().min(1).max(100),
  remindersEnabled: z.boolean(),
  adminNotificationsEnabled: z.boolean(),
  confirmationMessage: z.string().max(10_000),
  successContent: z.string().max(10_000),
  redirectUrl: z.url().optional(),
});
export type CfpFormSettings = z.infer<typeof cfpFormSettingsSchema>;

export const cfpFormSchema = z.object({
  id: identifierSchema,
  tenantId: identifierSchema,
  eventId: identifierSchema,
  name: z.string().trim().min(1).max(200),
  version: z.number().int().positive(),
  status: z.enum(["draft", "published", "closed"]),
  welcomeContent: z.string().max(20_000),
  settings: cfpFormSettingsSchema,
  sections: z.array(formSectionSchema).min(1).max(100),
  submissionFields: z.array(formFieldSchema).max(300),
  participantFields: z.array(formFieldSchema).max(100),
  rules: z.array(formRuleSchema).max(200),
});
export type CfpForm = z.infer<typeof cfpFormSchema>;

export const submissionParticipantSchema = z.object({
  id: identifierSchema,
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.email(),
  role: z.enum(["primary", "co_speaker"]),
  biography: z.string().max(20_000).default(""),
  answers: z.record(z.string(), z.unknown()).default({}),
});
export type SubmissionParticipant = z.infer<typeof submissionParticipantSchema>;

export const secondaryContactSchema = z.object({
  id: identifierSchema,
  name: z.string().trim().min(1).max(200),
  email: z.email(),
});
export type SecondaryContact = z.infer<typeof secondaryContactSchema>;

export const submissionStatusSchema = z.enum(["draft", "submitted", "reopened", "withdrawn"]);
export type SubmissionStatus = z.infer<typeof submissionStatusSchema>;

export const submissionSchema = z.object({
  id: identifierSchema,
  tenantId: identifierSchema,
  eventId: identifierSchema,
  formId: identifierSchema,
  ownerAccountId: identifierSchema,
  version: z.number().int().positive(),
  status: submissionStatusSchema,
  completedSteps: z.array(submissionStepSchema).max(submissionSteps.length),
  answers: z.record(z.string(), z.unknown()),
  participants: z.array(submissionParticipantSchema).max(15),
  secondaryContacts: z.array(secondaryContactSchema).max(20),
  createdAt: isoInstantSchema,
  updatedAt: isoInstantSchema,
  submittedAt: isoInstantSchema.optional(),
  reopenedAt: isoInstantSchema.optional(),
  withdrawnAt: isoInstantSchema.optional(),
  finalDecisionAt: isoInstantSchema.optional(),
});
export type Submission = z.infer<typeof submissionSchema>;

export type SubmissionVersionReason =
  | "draft_created"
  | "draft_saved"
  | "submitted"
  | "reopened"
  | "withdrawn";

export interface SubmissionVersion {
  submission: Submission;
  reason: SubmissionVersionReason;
  actorId: string;
  idempotencyKey?: string;
}

export interface AuditEntry {
  tenantId: string;
  eventId: string;
  submissionId: string;
  actorId: string;
  action: "submission_reopened" | "submission_withdrawn";
  reason: string;
  occurredAt: string;
}

export interface RoutingTarget {
  queue: string;
  format?: string;
  track?: string;
  category?: string;
  tags: string[];
}
