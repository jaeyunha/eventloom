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
  reviewAssignmentIdSchema,
  reviewCommentIdSchema,
  reviewIdSchema,
  reviewRoundIdSchema,
  rubricCriterionIdSchema,
  submissionIdSchema,
  userIdSchema,
} from "./ids";
import { reviewAssignmentStatusSchema, reviewDecisionStatusSchema } from "./lifecycle";

export const rubricCriterionSchema = z.object({
  id: rubricCriterionIdSchema,
  label: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000),
  minimumScore: z.number().finite(),
  maximumScore: z.number().finite(),
  weight: z.number().positive().finite(),
  required: z.boolean(),
});
export type RubricCriterion = z.infer<typeof rubricCriterionSchema>;

export const reviewRoundSchema = z.object({
  id: reviewRoundIdSchema,
  planId: evaluationPlanIdSchema,
  eventId: eventIdSchema,
  name: z.string().trim().min(1).max(200),
  sequence: z.int().positive(),
  opensAt: timestampSchema,
  closesAt: timestampSchema,
  blindReview: z.boolean(),
  rubric: z.array(rubricCriterionSchema).min(1),
});
export type ReviewRound = z.infer<typeof reviewRoundSchema>;

export const evaluationPlanSchema = z.object({
  id: evaluationPlanIdSchema,
  eventId: eventIdSchema,
  name: z.string().trim().min(1).max(200),
  status: z.enum(["draft", "active", "closed"]),
  rounds: z.array(reviewRoundSchema).min(1),
  version: entityVersionSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type EvaluationPlan = z.infer<typeof evaluationPlanSchema>;

export const reviewAssignmentSchema = z.object({
  id: reviewAssignmentIdSchema,
  eventId: eventIdSchema,
  planId: evaluationPlanIdSchema,
  roundId: reviewRoundIdSchema,
  submissionId: submissionIdSchema,
  reviewerId: userIdSchema,
  status: reviewAssignmentStatusSchema,
  assignedAt: timestampSchema,
  startedAt: timestampSchema.nullable(),
  submittedAt: timestampSchema.nullable(),
});
export type ReviewAssignment = z.infer<typeof reviewAssignmentSchema>;

export const conflictAbstentionSchema = z.object({
  assignmentId: reviewAssignmentIdSchema,
  reviewerId: userIdSchema,
  reason: z.string().trim().min(1).max(2_000),
  declaredAt: timestampSchema,
});
export type ConflictAbstention = z.infer<typeof conflictAbstentionSchema>;

export const scoreEvidenceSchema = z.object({
  quote: z.string().trim().min(1).max(2_000),
  sourceField: z.string().trim().min(1).max(200),
});

export const aiScoreSuggestionSchema = z.object({
  criterionId: rubricCriterionIdSchema,
  suggestedScore: z.number().finite(),
  rationale: z.string().trim().min(1).max(4_000),
  evidence: z.array(scoreEvidenceSchema).min(1),
  model: z.string().trim().min(1).max(200),
  generatedAt: timestampSchema,
});
export type AiScoreSuggestion = z.infer<typeof aiScoreSuggestionSchema>;

export const humanScoreConfirmationSchema = z.object({
  confirmedBy: userIdSchema,
  confirmedAt: timestampSchema,
  action: z.enum(["confirmed", "edited"]),
});

export const reviewScoreSchema = z
  .object({
    criterionId: rubricCriterionIdSchema,
    score: z.number().finite(),
    source: z.enum(["human", "ai_prefill"]),
    counted: z.boolean(),
    humanConfirmation: humanScoreConfirmationSchema.nullable(),
  })
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

export const reviewCommentSchema = z.object({
  id: reviewCommentIdSchema,
  reviewId: reviewIdSchema,
  authorId: userIdSchema,
  body: z.string().trim().min(1).max(10_000),
  visibility: z.enum(["reviewers", "organizers"]),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type ReviewComment = z.infer<typeof reviewCommentSchema>;

export const reviewSchema = z.object({
  id: reviewIdSchema,
  assignmentId: reviewAssignmentIdSchema,
  eventId: eventIdSchema,
  submissionId: submissionIdSchema,
  roundId: reviewRoundIdSchema,
  reviewerId: userIdSchema,
  scores: z.array(reviewScoreSchema),
  overallComment: z.string().trim().max(10_000),
  status: reviewAssignmentStatusSchema,
  version: entityVersionSchema,
  savedAt: timestampSchema,
  submittedAt: timestampSchema.nullable(),
});
export type Review = z.infer<typeof reviewSchema>;

export const aggregateReviewScoreSchema = z.object({
  submissionId: submissionIdSchema,
  roundId: reviewRoundIdSchema,
  weightedScore: z.number().finite(),
  countedReviewCount: z.int().nonnegative(),
  abstentionCount: z.int().nonnegative(),
  calculatedAt: timestampSchema,
});
export type AggregateReviewScore = z.infer<typeof aggregateReviewScoreSchema>;

export const saveReviewRequestSchema = z.object({
  scores: z.array(reviewScoreSchema),
  overallComment: z.string().trim().max(10_000),
  expectedVersion: entityVersionSchema,
  idempotencyKey: idempotencyKeySchema,
});
export type SaveReviewRequest = z.infer<typeof saveReviewRequestSchema>;

export const submitReviewRequestSchema = saveReviewRequestSchema.extend({
  confirmComplete: z.literal(true),
});
export type SubmitReviewRequest = z.infer<typeof submitReviewRequestSchema>;

export const abstainReviewRequestSchema = z.object({
  reason: z.string().trim().min(1).max(2_000),
  idempotencyKey: idempotencyKeySchema,
});
export type AbstainReviewRequest = z.infer<typeof abstainReviewRequestSchema>;

export const decideSubmissionRequestSchema = z.object({
  decision: reviewDecisionStatusSchema.exclude(["pending"]),
  reason: z.string().trim().min(1).max(4_000),
  expectedVersion: entityVersionSchema,
  idempotencyKey: idempotencyKeySchema,
});
export type DecideSubmissionRequest = z.infer<typeof decideSubmissionRequestSchema>;

export const reviewResponseSchema = z.object({ data: reviewSchema });
export const reviewsResponseSchema = paginatedResponseSchema(reviewSchema);
export const reviewAssignmentsResponseSchema = paginatedResponseSchema(reviewAssignmentSchema);
