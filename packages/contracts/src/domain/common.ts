import { z } from "zod";
import { apiKeyIdSchema, userIdSchema } from "./ids";

export const timestampSchema = z.iso.datetime({ offset: true });
export const traceIdSchema = z.uuid();
export const idempotencyKeySchema = z.string().trim().min(8).max(128);
export const entityVersionSchema = z.int().positive();
export const jsonValueSchema = z.json();

export const eventRoles = [
  "organizer",
  "reviewer",
  "submitter",
  "participant",
  "secondary_contact",
  "api_client",
] as const;
export const eventRoleSchema = z.enum(eventRoles);
export type EventRole = z.infer<typeof eventRoleSchema>;

export const apiScopes = [
  "events:read",
  "events:write",
  "forms:read",
  "forms:write",
  "submissions:read",
  "submissions:write",
  "participants:read",
  "participants:write",
  "reviews:read",
  "reviews:write",
  "tasks:read",
  "tasks:write",
  "agenda:read",
  "agenda:write",
  "files:read",
  "files:write",
  "publications:read",
  "publications:write",
  "integrations:read",
  "integrations:write",
  "webhooks:read",
  "webhooks:write",
] as const;
export const apiScopeSchema = z.enum(apiScopes);
export type ApiScope = z.infer<typeof apiScopeSchema>;

export const apiErrorCodes = [
  "AUTHENTICATION_REQUIRED",
  "ACCESS_DENIED",
  "TENANT_SCOPE_VIOLATION",
  "NOT_FOUND",
  "VALIDATION_FAILED",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "IDEMPOTENCY_CONFLICT",
  "RATE_LIMITED",
  "INTEGRATION_UNAVAILABLE",
  "INTERNAL_ERROR",
] as const;
export const apiErrorCodeSchema = z.enum(apiErrorCodes);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const validationIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.int().nonnegative()])),
  code: z.string().trim().min(1),
  message: z.string().trim().min(1),
});

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string().trim().min(1),
    traceId: traceIdSchema,
    details: z.array(validationIssueSchema).optional(),
    retryAfterSeconds: z.int().positive().optional(),
  }),
});
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

export const sortDirectionSchema = z.enum(["asc", "desc"]);
export const paginationRequestSchema = z.object({
  cursor: z.string().trim().min(1).max(512).optional(),
  limit: z.int().min(1).max(100).default(25),
  sort: z.string().trim().min(1).max(64).optional(),
  direction: sortDirectionSchema.default("asc"),
});
export type PaginationRequest = z.infer<typeof paginationRequestSchema>;

export const paginationMetaSchema = z.object({
  nextCursor: z.string().min(1).nullable(),
  hasMore: z.boolean(),
});
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

export const paginatedResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    page: paginationMetaSchema,
  });

export const mutationMetadataSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  expectedVersion: entityVersionSchema.optional(),
});
export type MutationMetadata = z.infer<typeof mutationMetadataSchema>;

export const auditActorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user"), userId: userIdSchema }),
  z.object({ type: z.literal("api_key"), apiKeyId: apiKeyIdSchema }),
  z.object({ type: z.literal("system"), name: z.string().trim().min(1) }),
]);
export type AuditActor = z.infer<typeof auditActorSchema>;
