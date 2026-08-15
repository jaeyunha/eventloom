import { z } from "zod";
import {
  entityVersionSchema,
  idempotencyKeySchema,
  paginatedResponseSchema,
  timestampSchema,
} from "./common";
import {
  evaluationPlanIdSchema,
  eventIdSchema,
  organizationIdSchema,
  reviewAssignmentIdSchema,
  reviewCommentIdSchema,
  reviewIdSchema,
  reviewRoundIdSchema,
  rubricCriterionIdSchema,
  submissionIdSchema,
  userIdSchema,
} from "./ids";
import {
  reviewAssignmentStatusSchema as lifecycleReviewAssignmentStatusSchema,
  reviewDecisionStatusSchema,
} from "./lifecycle";
import { type MutationEnvelope, mutationEnvelopeSchema } from "./submissions";

export const rubricCriterionSchema = z
  .object({
    id: rubricCriterionIdSchema,
    label: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2_000),
    minimumScore: z.number().finite(),
    maximumScore: z.number().finite(),
    weight: z.number().positive().finite(),
    required: z.boolean(),
  })
  .strict();
export type RubricCriterion = z.infer<typeof rubricCriterionSchema>;

export const reviewRoundSchema = z
  .object({
    id: reviewRoundIdSchema,
    organizationId: organizationIdSchema,
    planId: evaluationPlanIdSchema,
    eventId: eventIdSchema,
    name: z.string().trim().min(1).max(200),
    sequence: z.int().positive(),
    opensAt: timestampSchema,
    closesAt: timestampSchema,
    blindReview: z.boolean(),
    rubric: z.array(rubricCriterionSchema).min(1),
    version: entityVersionSchema,
  })
  .strict();
export type ReviewRound = z.infer<typeof reviewRoundSchema>;

export const evaluationPlanSchema = z
  .object({
    id: evaluationPlanIdSchema,
    organizationId: organizationIdSchema,
    eventId: eventIdSchema,
    name: z.string().trim().min(1).max(200),
    status: z.enum(["draft", "active", "closed"]),
    rounds: z.array(reviewRoundSchema).min(1),
    frozenGradingVersion: entityVersionSchema.nullable(),
    frozenRoundsVersion: entityVersionSchema.nullable(),
    frozenBy: userIdSchema.nullable(),
    frozenAt: timestampSchema.nullable(),
    version: entityVersionSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict()
  .superRefine((plan, context) => {
    const frozenValues = [
      plan.frozenGradingVersion,
      plan.frozenRoundsVersion,
      plan.frozenBy,
      plan.frozenAt,
    ];
    const isFullyFrozen = frozenValues.every((value) => value !== null);
    const isFullyMutable = frozenValues.every((value) => value === null);
    if (plan.status === "draft" ? !isFullyMutable : !isFullyFrozen) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message:
          plan.status === "draft"
            ? "A draft evaluation plan cannot carry frozen grading metadata"
            : "An opened evaluation plan requires frozen grading and round versions",
      });
    }
  });
export type EvaluationPlan = z.infer<typeof evaluationPlanSchema>;

export const reviewAssignmentContractStatusSchema = z.enum([
  "assigned",
  "in_progress",
  "submitted",
  "abstained",
  "superseded",
]);
export type ReviewAssignmentContractStatus = z.infer<typeof reviewAssignmentContractStatusSchema>;

export const reviewAssignmentSchema = z
  .object({
    id: reviewAssignmentIdSchema,
    organizationId: organizationIdSchema,
    eventId: eventIdSchema,
    planId: evaluationPlanIdSchema,
    planVersion: entityVersionSchema,
    roundId: reviewRoundIdSchema,
    roundVersion: entityVersionSchema,
    submissionId: submissionIdSchema,
    reviewerId: userIdSchema,
    status: reviewAssignmentContractStatusSchema,
    version: entityVersionSchema,
    predecessorAssignmentId: reviewAssignmentIdSchema.nullable(),
    successorAssignmentId: reviewAssignmentIdSchema.nullable(),
    supersededReason: z.string().trim().min(1).max(2_000).nullable(),
    supersededAt: timestampSchema.nullable(),
    assignedAt: timestampSchema,
    startedAt: timestampSchema.nullable(),
    submittedAt: timestampSchema.nullable(),
  })
  .strict()
  .superRefine((assignment, context) => {
    if (assignment.predecessorAssignmentId === assignment.id) {
      context.addIssue({
        code: "custom",
        path: ["predecessorAssignmentId"],
        message: "An assignment cannot be its own predecessor",
      });
    }
    if (assignment.successorAssignmentId === assignment.id) {
      context.addIssue({
        code: "custom",
        path: ["successorAssignmentId"],
        message: "An assignment cannot be its own successor",
      });
    }
    if (assignment.status === "superseded") {
      if (assignment.successorAssignmentId === null) {
        context.addIssue({
          code: "custom",
          path: ["successorAssignmentId"],
          message: "A superseded assignment requires a successor assignment",
        });
      }
      if (assignment.supersededReason === null) {
        context.addIssue({
          code: "custom",
          path: ["supersededReason"],
          message: "A superseded assignment requires a reason",
        });
      }
      if (assignment.supersededAt === null) {
        context.addIssue({
          code: "custom",
          path: ["supersededAt"],
          message: "A superseded assignment requires a timestamp",
        });
      }
    } else if (
      assignment.successorAssignmentId !== null ||
      assignment.supersededReason !== null ||
      assignment.supersededAt !== null
    ) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Only a superseded assignment may carry successor lineage",
      });
    }
  });
export type ReviewAssignment = z.infer<typeof reviewAssignmentSchema>;

export const conflictAbstentionSchema = z
  .object({
    organizationId: organizationIdSchema,
    eventId: eventIdSchema,
    assignmentId: reviewAssignmentIdSchema,
    reviewerId: userIdSchema,
    reason: z.string().trim().min(1).max(2_000),
    declaredAt: timestampSchema,
  })
  .strict();
export type ConflictAbstention = z.infer<typeof conflictAbstentionSchema>;

export const scoreEvidenceSchema = z
  .object({
    quote: z.string().trim().min(1).max(2_000),
    sourceField: z.string().trim().min(1).max(200),
  })
  .strict();

export const aiScoreSuggestionSchema = z
  .object({
    criterionId: rubricCriterionIdSchema,
    suggestedScore: z.number().finite(),
    rationale: z.string().trim().min(1).max(4_000),
    evidence: z.array(scoreEvidenceSchema).min(1),
    model: z.string().trim().min(1).max(200),
    generatedAt: timestampSchema,
  })
  .strict();
export type AiScoreSuggestion = z.infer<typeof aiScoreSuggestionSchema>;

export const humanScoreConfirmationSchema = z
  .object({
    confirmedBy: userIdSchema,
    confirmedAt: timestampSchema,
    action: z.enum(["confirmed", "edited"]),
  })
  .strict();

export const reviewScoreSchema = z
  .object({
    criterionId: rubricCriterionIdSchema,
    score: z.number().finite(),
    source: z.enum(["human", "ai_prefill"]),
    counted: z.boolean(),
    humanConfirmation: humanScoreConfirmationSchema.nullable(),
  })
  .strict()
  .superRefine((score, context) => {
    if (score.counted && score.humanConfirmation === null) {
      context.addIssue({
        code: "custom",
        path: ["humanConfirmation"],
        message: "A counted score requires human confirmation",
      });
    }
  });
export type ReviewScore = z.infer<typeof reviewScoreSchema>;

export const reviewCommentSchema = z
  .object({
    id: reviewCommentIdSchema,
    reviewId: reviewIdSchema,
    authorId: userIdSchema,
    body: z.string().trim().min(1).max(10_000),
    visibility: z.enum(["reviewers", "organizers"]),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export type ReviewComment = z.infer<typeof reviewCommentSchema>;

export const reviewSchema = z
  .object({
    id: reviewIdSchema,
    organizationId: organizationIdSchema,
    assignmentId: reviewAssignmentIdSchema,
    eventId: eventIdSchema,
    planId: evaluationPlanIdSchema,
    planVersion: entityVersionSchema,
    submissionId: submissionIdSchema,
    roundId: reviewRoundIdSchema,
    roundVersion: entityVersionSchema,
    reviewerId: userIdSchema,
    scores: z.array(reviewScoreSchema),
    overallComment: z.string().trim().max(10_000),
    status: lifecycleReviewAssignmentStatusSchema,
    version: entityVersionSchema,
    savedAt: timestampSchema,
    submittedAt: timestampSchema.nullable(),
  })
  .strict();
export type Review = z.infer<typeof reviewSchema>;

export const aggregateReviewScoreSchema = z
  .object({
    organizationId: organizationIdSchema,
    eventId: eventIdSchema,
    planId: evaluationPlanIdSchema,
    planVersion: entityVersionSchema,
    submissionId: submissionIdSchema,
    roundId: reviewRoundIdSchema,
    roundVersion: entityVersionSchema,
    weightedScore: z.number().finite(),
    countedReviewCount: z.int().nonnegative(),
    abstentionCount: z.int().nonnegative(),
    calculatedAt: timestampSchema,
  })
  .strict();
export type AggregateReviewScore = z.infer<typeof aggregateReviewScoreSchema>;

export const saveReviewRequestSchema = z
  .object({
    organizationId: organizationIdSchema,
    eventId: eventIdSchema,
    scores: z.array(reviewScoreSchema),
    overallComment: z.string().trim().max(10_000),
    expectedVersion: entityVersionSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();
export type SaveReviewRequest = z.infer<typeof saveReviewRequestSchema>;

export const submitReviewRequestSchema = saveReviewRequestSchema
  .extend({ confirmComplete: z.literal(true) })
  .strict();
export type SubmitReviewRequest = z.infer<typeof submitReviewRequestSchema>;

export const abstainReviewRequestSchema = z
  .object({
    organizationId: organizationIdSchema,
    eventId: eventIdSchema,
    reason: z.string().trim().min(1).max(2_000),
    expectedVersion: entityVersionSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();
export type AbstainReviewRequest = z.infer<typeof abstainReviewRequestSchema>;

export const decideSubmissionRequestSchema = z
  .object({
    organizationId: organizationIdSchema,
    eventId: eventIdSchema,
    decision: reviewDecisionStatusSchema.exclude(["pending"]),
    reason: z.string().trim().min(1).max(4_000),
    expectedVersion: entityVersionSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();
export type DecideSubmissionRequest = z.infer<typeof decideSubmissionRequestSchema>;

export const replaceReviewAssignmentRequestSchema = z
  .object({
    organizationId: organizationIdSchema,
    eventId: eventIdSchema,
    oldAssignmentId: reviewAssignmentIdSchema,
    replacementReviewerId: userIdSchema,
    expectedVersion: entityVersionSchema,
    reason: z.string().trim().min(1).max(2_000),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict();
export type ReplaceReviewAssignmentRequest = z.infer<typeof replaceReviewAssignmentRequestSchema>;

export const updateEvaluationPlanRequestSchema = z
  .object({
    organizationId: organizationIdSchema,
    eventId: eventIdSchema,
    name: z.string().trim().min(1).max(200).optional(),
    rounds: z.array(reviewRoundSchema).min(1).optional(),
    status: z.enum(["draft", "active", "closed"]).optional(),
    expectedVersion: entityVersionSchema,
    idempotencyKey: idempotencyKeySchema,
  })
  .strict()
  .superRefine((request, context) => {
    if (request.rounds !== undefined && request.status !== "draft") {
      context.addIssue({
        code: "custom",
        path: ["rounds"],
        message: "Evaluation grading and round configuration may only change while draft",
      });
    }
  });
export type UpdateEvaluationPlanRequest = z.infer<typeof updateEvaluationPlanRequestSchema>;

export const evaluationPlanMutationResponseSchema = mutationEnvelopeSchema(evaluationPlanSchema);
export type EvaluationPlanMutationResponse = MutationEnvelope<EvaluationPlan>;
export const reviewResponseSchema = mutationEnvelopeSchema(reviewSchema);
export type ReviewMutationResponse = MutationEnvelope<Review>;
export const reviewsResponseSchema = paginatedResponseSchema(reviewSchema);
export const reviewAssignmentMutationResponseSchema =
  mutationEnvelopeSchema(reviewAssignmentSchema);
export type ReviewAssignmentMutationResponse = MutationEnvelope<ReviewAssignment>;
export const reviewAssignmentsResponseSchema = paginatedResponseSchema(reviewAssignmentSchema);
export const evaluationPlanResponseSchema = evaluationPlanMutationResponseSchema;
export const reviewAssignmentResponseSchema = reviewAssignmentMutationResponseSchema;
export const reviewRoundResponseSchema = mutationEnvelopeSchema(reviewRoundSchema);
