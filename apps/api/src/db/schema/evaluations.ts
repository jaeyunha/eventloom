import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const reviewPlans = sqliteTable(
  "review_plans",
  {
    id: text("id").primaryKey().notNull(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    predecessorPlanId: text("predecessor_plan_id"),
    name: text("name").notNull(),
    status: text("status", { enum: ["draft", "open", "closed"] }).notNull(),
    revisionSyncPending: integer("revision_sync_pending", { mode: "boolean" })
      .notNull()
      .default(false),
    revisionSyncToken: text("revision_sync_token"),
    blindReview: integer("blind_review", { mode: "boolean" }).notNull(),
    closesAt: text("closes_at"),
    reviewsPerSubmission: integer("reviews_per_submission").notNull(),
    maxAssignmentsPerReviewer: integer("max_assignments_per_reviewer").notNull(),
    trackFilter: text("track_filter"),
    autoDistribute: integer("auto_distribute", { mode: "boolean" }).notNull(),
    reviewerProjectionFieldIdsJson: text("reviewer_projection_field_ids_json").notNull(),
    reviewerProjectionFileIdsJson: text("reviewer_projection_file_ids_json").notNull(),
    gradingRevision: integer("grading_revision"),
    gradingLockedAt: text("grading_locked_at"),
    version: integer("version").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    unique("review_plans_organization_id_id_unique").on(table.organizationId, table.id),
    unique("review_plans_organization_id_event_id_id_unique").on(
      table.organizationId,
      table.eventId,
      table.id,
    ),
    uniqueIndex("uq_review_plans_predecessor")
      .on(table.organizationId, table.eventId, table.predecessorPlanId)
      .where(sql`${table.predecessorPlanId} IS NOT NULL`),
    index("review_plans_event_status_idx").on(
      table.organizationId,
      table.eventId,
      table.status,
      table.updatedAt,
    ),
    check(
      "review_plans_counts_check",
      sql`${table.reviewsPerSubmission} > 0 AND ${table.maxAssignmentsPerReviewer} > 0`,
    ),
    check("review_plans_version_check", sql`${table.version} > 0`),
    check(
      "review_plans_grading_check",
      sql`${table.gradingRevision} IS NULL OR ${table.gradingRevision} > 0`,
    ),
    check(
      "review_plans_grading_lock_check",
      sql`${table.gradingLockedAt} IS NULL OR ${table.gradingRevision} IS NOT NULL`,
    ),
    check(
      "review_plans_fields_json_check",
      sql`json_valid(${table.reviewerProjectionFieldIdsJson}) AND json_type(${table.reviewerProjectionFieldIdsJson}) = 'array'`,
    ),
    check(
      "review_plans_files_json_check",
      sql`json_valid(${table.reviewerProjectionFileIdsJson}) AND json_type(${table.reviewerProjectionFileIdsJson}) = 'array'`,
    ),
  ],
);

export const reviewRounds = sqliteTable(
  "review_rounds",
  {
    id: text("id").notNull(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    planId: text("plan_id").notNull(),
    predecessorRoundId: text("predecessor_round_id"),
    name: text("name").notNull(),
    sequence: integer("sequence").notNull(),
    revision: integer("revision").notNull(),
    rubricId: text("rubric_id").notNull(),
    rubricRevision: integer("rubric_revision").notNull(),
    opensAt: text("opens_at"),
    closesAt: text("closes_at"),
    blindReview: integer("blind_review", { mode: "boolean" }).notNull(),
    anonymization: text("anonymization", { enum: ["none", "single", "double"] }).notNull(),
    trackFilter: text("track_filter"),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.planId, table.id, table.revision] }),
    foreignKey({
      columns: [table.organizationId, table.eventId, table.planId],
      foreignColumns: [reviewPlans.organizationId, reviewPlans.eventId, reviewPlans.id],
    }).onDelete("cascade"),
    unique("review_rounds_event_key_unique").on(
      table.organizationId,
      table.eventId,
      table.planId,
      table.id,
      table.revision,
    ),
    unique("review_rounds_event_revision_unique").on(
      table.organizationId,
      table.eventId,
      table.id,
      table.revision,
    ),
    unique("review_rounds_sequence_revision_unique").on(
      table.organizationId,
      table.planId,
      table.sequence,
      table.revision,
    ),
    index("review_rounds_current_idx").on(
      table.organizationId,
      table.eventId,
      table.planId,
      table.sequence,
      table.revision,
    ),
    check(
      "review_rounds_revision_check",
      sql`${table.sequence} >= 0 AND ${table.revision} > 0 AND ${table.rubricRevision} > 0`,
    ),
    check(
      "review_rounds_time_check",
      sql`${table.closesAt} IS NULL OR ${table.opensAt} IS NULL OR ${table.closesAt} > ${table.opensAt}`,
    ),
  ],
);

export const reviewRubrics = sqliteTable(
  "review_rubrics",
  {
    id: text("id").notNull(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    planId: text("plan_id").notNull(),
    revision: integer("revision").notNull(),
    name: text("name").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.planId, table.id, table.revision] }),
    foreignKey({
      columns: [table.organizationId, table.eventId, table.planId],
      foreignColumns: [reviewPlans.organizationId, reviewPlans.eventId, reviewPlans.id],
    }).onDelete("cascade"),
    unique("review_rubrics_event_key_unique").on(
      table.organizationId,
      table.eventId,
      table.planId,
      table.id,
      table.revision,
    ),
    index("review_rubrics_plan_idx").on(
      table.organizationId,
      table.eventId,
      table.planId,
      table.id,
      table.revision,
    ),
    check("review_rubrics_revision_check", sql`${table.revision} > 0`),
  ],
);

export const reviewCriteria = sqliteTable(
  "review_criteria",
  {
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    planId: text("plan_id").notNull(),
    rubricId: text("rubric_id").notNull(),
    rubricRevision: integer("rubric_revision").notNull(),
    id: text("id").notNull(),
    label: text("label").notNull(),
    description: text("description").notNull(),
    minimum: real("minimum").notNull(),
    maximum: real("maximum").notNull(),
    weight: real("weight").notNull(),
    required: integer("required", { mode: "boolean" }).notNull(),
    inputType: text("input_type", { enum: ["numeric", "dropdown", "free_text"] }).notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.organizationId, table.planId, table.rubricId, table.rubricRevision, table.id],
    }),
    foreignKey({
      columns: [
        table.organizationId,
        table.eventId,
        table.planId,
        table.rubricId,
        table.rubricRevision,
      ],
      foreignColumns: [
        reviewRubrics.organizationId,
        reviewRubrics.eventId,
        reviewRubrics.planId,
        reviewRubrics.id,
        reviewRubrics.revision,
      ],
    }).onDelete("cascade"),
    unique("review_criteria_sort_unique").on(
      table.organizationId,
      table.planId,
      table.rubricId,
      table.rubricRevision,
      table.sortOrder,
    ),
    index("review_criteria_order_idx").on(
      table.organizationId,
      table.eventId,
      table.planId,
      table.rubricId,
      table.rubricRevision,
      table.sortOrder,
    ),
    check("review_criteria_range_check", sql`${table.maximum} >= ${table.minimum}`),
    check(
      "review_criteria_weight_order_check",
      sql`${table.weight} > 0 AND ${table.sortOrder} >= 0`,
    ),
  ],
);

export const reviewCriterionOptions = sqliteTable(
  "review_criterion_options",
  {
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    planId: text("plan_id").notNull(),
    rubricId: text("rubric_id").notNull(),
    rubricRevision: integer("rubric_revision").notNull(),
    criterionId: text("criterion_id").notNull(),
    id: text("id").notNull(),
    label: text("label").notNull(),
    value: text("value").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.organizationId,
        table.planId,
        table.rubricId,
        table.rubricRevision,
        table.criterionId,
        table.id,
      ],
    }),
    foreignKey({
      columns: [
        table.organizationId,
        table.planId,
        table.rubricId,
        table.rubricRevision,
        table.criterionId,
      ],
      foreignColumns: [
        reviewCriteria.organizationId,
        reviewCriteria.planId,
        reviewCriteria.rubricId,
        reviewCriteria.rubricRevision,
        reviewCriteria.id,
      ],
    }).onDelete("cascade"),
    unique("review_criterion_options_value_unique").on(
      table.organizationId,
      table.planId,
      table.rubricId,
      table.rubricRevision,
      table.criterionId,
      table.value,
    ),
    unique("review_criterion_options_sort_unique").on(
      table.organizationId,
      table.planId,
      table.rubricId,
      table.rubricRevision,
      table.criterionId,
      table.sortOrder,
    ),
    index("review_criterion_options_order_idx").on(
      table.organizationId,
      table.eventId,
      table.planId,
      table.rubricId,
      table.rubricRevision,
      table.criterionId,
      table.sortOrder,
    ),
    check("review_criterion_options_order_check", sql`${table.sortOrder} >= 0`),
  ],
);

export const reviewerPools = sqliteTable(
  "reviewer_pools",
  {
    id: text("id").primaryKey().notNull(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    roundId: text("round_id").notNull(),
    roundRevision: integer("round_revision").notNull(),
    name: text("name"),
    version: integer("version").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.eventId, table.roundId, table.roundRevision],
      foreignColumns: [
        reviewRounds.organizationId,
        reviewRounds.eventId,
        reviewRounds.id,
        reviewRounds.revision,
      ],
    }).onDelete("restrict"),
    unique("reviewer_pools_organization_id_id_unique").on(table.organizationId, table.id),
    unique("reviewer_pools_event_id_unique").on(table.organizationId, table.eventId, table.id),
    unique("reviewer_pools_round_unique").on(
      table.organizationId,
      table.eventId,
      table.roundId,
      table.roundRevision,
    ),
    index("reviewer_pools_event_idx").on(table.organizationId, table.eventId, table.updatedAt),
    check("reviewer_pools_version_check", sql`${table.roundRevision} > 0 AND ${table.version} > 0`),
  ],
);

export const reviewerPoolMembers = sqliteTable(
  "reviewer_pool_members",
  {
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    poolId: text("pool_id").notNull(),
    reviewerId: text("reviewer_id").notNull(),
    grantedAt: text("granted_at"),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.eventId, table.poolId, table.reviewerId] }),
    foreignKey({
      columns: [table.organizationId, table.eventId, table.poolId],
      foreignColumns: [reviewerPools.organizationId, reviewerPools.eventId, reviewerPools.id],
    }).onDelete("cascade"),
    index("reviewer_pool_members_reviewer_idx").on(
      table.organizationId,
      table.eventId,
      table.reviewerId,
      table.poolId,
    ),
    index("reviewer_pool_members_granted_at_idx").on(
      table.organizationId,
      table.eventId,
      table.reviewerId,
      table.grantedAt,
    ),
  ],
);

export const reviewAssignments = sqliteTable(
  "review_assignments",
  {
    id: text("id").primaryKey().notNull(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    planId: text("plan_id").notNull(),
    roundId: text("round_id").notNull(),
    roundRevision: integer("round_revision").notNull(),
    submissionId: text("submission_id").notNull(),
    reviewerId: text("reviewer_id").notNull(),
    status: text("status", {
      enum: ["assigned", "in_progress", "submitted", "abstained", "superseded"],
    }).notNull(),
    predecessorAssignmentId: text("predecessor_assignment_id"),
    successorAssignmentId: text("successor_assignment_id"),
    supersededReason: text("superseded_reason"),
    supersededAt: text("superseded_at"),
    planVersion: integer("plan_version").notNull(),
    rubricRevision: integer("rubric_revision").notNull(),
    submissionRevision: integer("submission_revision").notNull(),
    version: integer("version").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.eventId, table.planId],
      foreignColumns: [reviewPlans.organizationId, reviewPlans.eventId, reviewPlans.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.eventId, table.roundId, table.roundRevision],
      foreignColumns: [
        reviewRounds.organizationId,
        reviewRounds.eventId,
        reviewRounds.id,
        reviewRounds.revision,
      ],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.eventId, table.predecessorAssignmentId],
      foreignColumns: [table.organizationId, table.eventId, table.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.eventId, table.successorAssignmentId],
      foreignColumns: [table.organizationId, table.eventId, table.id],
    }).onDelete("restrict"),
    unique("review_assignments_organization_id_id_unique").on(table.organizationId, table.id),
    unique("review_assignments_event_id_unique").on(table.organizationId, table.eventId, table.id),
    uniqueIndex("review_assignments_active_unique_idx")
      .on(
        table.organizationId,
        table.eventId,
        table.planId,
        table.roundId,
        table.submissionId,
        table.reviewerId,
      )
      .where(sql`${table.status} <> 'superseded'`),
    index("review_assignments_plan_status_idx").on(
      table.organizationId,
      table.eventId,
      table.planId,
      table.status,
      table.updatedAt,
    ),
    index("review_assignments_reviewer_idx").on(
      table.organizationId,
      table.eventId,
      table.reviewerId,
      table.status,
      table.updatedAt,
    ),
    index("review_assignments_submission_round_idx").on(
      table.organizationId,
      table.eventId,
      table.submissionId,
      table.roundId,
      table.roundRevision,
    ),
    index("review_assignments_predecessor_idx").on(
      table.organizationId,
      table.eventId,
      table.predecessorAssignmentId,
    ),
    index("review_assignments_successor_idx").on(
      table.organizationId,
      table.eventId,
      table.successorAssignmentId,
    ),
    check(
      "review_assignments_revisions_check",
      sql`${table.roundRevision} > 0 AND ${table.planVersion} > 0 AND ${table.rubricRevision} > 0 AND ${table.submissionRevision} > 0 AND ${table.version} > 0`,
    ),
    check(
      "review_assignments_lineage_check",
      sql`(${table.predecessorAssignmentId} IS NULL OR ${table.predecessorAssignmentId} <> ${table.id}) AND (${table.successorAssignmentId} IS NULL OR ${table.successorAssignmentId} <> ${table.id})`,
    ),
    check(
      "review_assignments_superseded_check",
      sql`(${table.status} = 'superseded') = (${table.supersededReason} IS NOT NULL AND ${table.supersededAt} IS NOT NULL)`,
    ),
  ],
);

export const evaluationReviews = sqliteTable(
  "evaluation_reviews",
  {
    id: text("id").primaryKey().notNull(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    planId: text("plan_id").notNull(),
    roundId: text("round_id").notNull(),
    assignmentId: text("assignment_id").notNull(),
    submissionId: text("submission_id").notNull(),
    reviewerId: text("reviewer_id").notNull(),
    comment: text("comment").notNull(),
    submittedAt: text("submitted_at"),
    planRevision: integer("plan_revision").notNull(),
    roundRevision: integer("round_revision").notNull(),
    rubricRevision: integer("rubric_revision").notNull(),
    submissionRevision: integer("submission_revision").notNull(),
    version: integer("version").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.eventId, table.assignmentId],
      foreignColumns: [
        reviewAssignments.organizationId,
        reviewAssignments.eventId,
        reviewAssignments.id,
      ],
    }).onDelete("restrict"),
    unique("evaluation_reviews_organization_id_id_unique").on(table.organizationId, table.id),
    unique("evaluation_reviews_event_id_unique").on(table.organizationId, table.eventId, table.id),
    unique("evaluation_reviews_assignment_unique").on(
      table.organizationId,
      table.eventId,
      table.assignmentId,
    ),
    index("evaluation_reviews_plan_idx").on(
      table.organizationId,
      table.eventId,
      table.planId,
      table.roundId,
      table.updatedAt,
    ),
    index("evaluation_reviews_submission_idx").on(
      table.organizationId,
      table.eventId,
      table.submissionId,
      table.roundId,
    ),
    check(
      "evaluation_reviews_revisions_check",
      sql`${table.planRevision} > 0 AND ${table.roundRevision} > 0 AND ${table.rubricRevision} > 0 AND ${table.submissionRevision} > 0 AND ${table.version} > 0`,
    ),
  ],
);

export const evaluationScores = sqliteTable(
  "evaluation_scores",
  {
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    reviewId: text("review_id").notNull(),
    criterionId: text("criterion_id").notNull(),
    valueNumber: real("value_number"),
    valueText: text("value_text"),
    origin: text("origin", { enum: ["human", "ai"] }).notNull(),
    humanConfirmedBy: text("human_confirmed_by"),
    suggestionId: text("suggestion_id"),
    suggestionStatus: text("suggestion_status", {
      enum: ["pending", "accepted", "edited", "rejected", "stale"],
    }),
    rubricRevision: integer("rubric_revision").notNull(),
    submissionRevision: integer("submission_revision").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.reviewId, table.criterionId] }),
    foreignKey({
      columns: [table.organizationId, table.eventId, table.reviewId],
      foreignColumns: [
        evaluationReviews.organizationId,
        evaluationReviews.eventId,
        evaluationReviews.id,
      ],
    }).onDelete("restrict"),
    index("evaluation_scores_review_idx").on(table.organizationId, table.eventId, table.reviewId),
    index("evaluation_scores_suggestion_idx").on(
      table.organizationId,
      table.eventId,
      table.suggestionId,
    ),
    check(
      "evaluation_scores_one_value_check",
      sql`(${table.valueNumber} IS NOT NULL) <> (${table.valueText} IS NOT NULL)`,
    ),
    check(
      "evaluation_scores_origin_check",
      sql`(${table.origin} = 'human' AND ${table.suggestionId} IS NULL AND ${table.suggestionStatus} IS NULL) OR (${table.origin} = 'ai' AND ${table.suggestionId} IS NOT NULL AND ${table.suggestionStatus} IS NOT NULL)`,
    ),
    check(
      "evaluation_scores_confirmation_check",
      sql`${table.humanConfirmedBy} IS NULL OR (${table.origin} = 'ai' AND ${table.suggestionStatus} IN ('accepted', 'edited'))`,
    ),
    check(
      "evaluation_scores_revision_check",
      sql`${table.rubricRevision} > 0 AND ${table.submissionRevision} > 0`,
    ),
  ],
);

export const evaluationScoreEvidence = sqliteTable(
  "evaluation_score_evidence",
  {
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    reviewId: text("review_id").notNull(),
    criterionId: text("criterion_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    evidence: text("evidence").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.organizationId, table.reviewId, table.criterionId, table.ordinal],
    }),
    foreignKey({
      columns: [table.organizationId, table.reviewId, table.criterionId],
      foreignColumns: [
        evaluationScores.organizationId,
        evaluationScores.reviewId,
        evaluationScores.criterionId,
      ],
    }).onDelete("cascade"),
    index("evaluation_score_evidence_order_idx").on(
      table.organizationId,
      table.eventId,
      table.reviewId,
      table.criterionId,
      table.ordinal,
    ),
    check("evaluation_score_evidence_ordinal_check", sql`${table.ordinal} >= 0`),
  ],
);

export const evaluationConflicts = sqliteTable(
  "evaluation_conflicts",
  {
    id: text("id").primaryKey().notNull(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    planId: text("plan_id").notNull(),
    assignmentId: text("assignment_id").notNull(),
    submissionId: text("submission_id").notNull(),
    reviewerId: text("reviewer_id").notNull(),
    reason: text("reason").notNull(),
    declaredAt: text("declared_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.eventId, table.assignmentId],
      foreignColumns: [
        reviewAssignments.organizationId,
        reviewAssignments.eventId,
        reviewAssignments.id,
      ],
    }).onDelete("restrict"),
    unique("evaluation_conflicts_organization_id_id_unique").on(table.organizationId, table.id),
    unique("evaluation_conflicts_assignment_unique").on(
      table.organizationId,
      table.eventId,
      table.assignmentId,
    ),
    index("evaluation_conflicts_plan_idx").on(
      table.organizationId,
      table.eventId,
      table.planId,
      table.declaredAt,
    ),
    index("evaluation_conflicts_reviewer_idx").on(
      table.organizationId,
      table.eventId,
      table.reviewerId,
      table.declaredAt,
    ),
  ],
);

export const evaluationSuggestions = sqliteTable(
  "evaluation_suggestions",
  {
    id: text("id").primaryKey().notNull(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    planId: text("plan_id").notNull(),
    roundId: text("round_id").notNull(),
    assignmentId: text("assignment_id").notNull(),
    submissionId: text("submission_id").notNull(),
    reviewerId: text("reviewer_id").notNull(),
    planRevision: integer("plan_revision").notNull(),
    rubricRevision: integer("rubric_revision").notNull(),
    submissionRevision: integer("submission_revision").notNull(),
    rubricId: text("rubric_id"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    generatedAt: text("generated_at").notNull(),
    sourceReferencesJson: text("source_references_json").notNull(),
    provenanceJson: text("provenance_json").notNull(),
    status: text("status", {
      enum: ["pending", "accepted", "edited", "rejected", "stale"],
    }).notNull(),
    version: integer("version").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.eventId, table.planId],
      foreignColumns: [reviewPlans.organizationId, reviewPlans.eventId, reviewPlans.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.eventId, table.assignmentId],
      foreignColumns: [
        reviewAssignments.organizationId,
        reviewAssignments.eventId,
        reviewAssignments.id,
      ],
    }).onDelete("restrict"),
    unique("evaluation_suggestions_organization_id_id_unique").on(table.organizationId, table.id),
    unique("evaluation_suggestions_event_id_unique").on(
      table.organizationId,
      table.eventId,
      table.id,
    ),
    index("evaluation_suggestions_plan_idx").on(
      table.organizationId,
      table.eventId,
      table.planId,
      table.roundId,
      table.createdAt,
    ),
    index("evaluation_suggestions_assignment_idx").on(
      table.organizationId,
      table.eventId,
      table.assignmentId,
      table.createdAt,
    ),
    index("evaluation_suggestions_status_idx").on(
      table.organizationId,
      table.eventId,
      table.status,
      table.updatedAt,
    ),
    check(
      "evaluation_suggestions_revision_check",
      sql`${table.planRevision} > 0 AND ${table.rubricRevision} > 0 AND ${table.submissionRevision} > 0 AND ${table.version} > 0`,
    ),
    check(
      "evaluation_suggestions_source_json_check",
      sql`json_valid(${table.sourceReferencesJson}) AND json_type(${table.sourceReferencesJson}) = 'array'`,
    ),
    check(
      "evaluation_suggestions_provenance_json_check",
      sql`json_valid(${table.provenanceJson}) AND json_type(${table.provenanceJson}) = 'object'`,
    ),
  ],
);

export const evaluationSuggestionCandidates = sqliteTable(
  "evaluation_suggestion_candidates",
  {
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    suggestionId: text("suggestion_id").notNull(),
    id: text("id").notNull(),
    criterionId: text("criterion_id").notNull(),
    value: real("value").notNull(),
    evidenceJson: text("evidence_json").notNull(),
    provenanceJson: text("provenance_json").notNull(),
    ordinal: integer("ordinal").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.suggestionId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.eventId, table.suggestionId],
      foreignColumns: [
        evaluationSuggestions.organizationId,
        evaluationSuggestions.eventId,
        evaluationSuggestions.id,
      ],
    }).onDelete("cascade"),
    unique("evaluation_suggestion_candidates_criterion_order_unique").on(
      table.organizationId,
      table.suggestionId,
      table.criterionId,
      table.ordinal,
    ),
    index("evaluation_suggestion_candidates_order_idx").on(
      table.organizationId,
      table.eventId,
      table.suggestionId,
      table.criterionId,
      table.ordinal,
    ),
    check(
      "evaluation_suggestion_candidates_json_check",
      sql`${table.ordinal} >= 0 AND json_valid(${table.evidenceJson}) AND json_type(${table.evidenceJson}) = 'array' AND json_valid(${table.provenanceJson}) AND json_type(${table.provenanceJson}) = 'object'`,
    ),
  ],
);

export const evaluationSuggestionHistory = sqliteTable(
  "evaluation_suggestion_history",
  {
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    suggestionId: text("suggestion_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    action: text("action", { enum: ["generate", "stale", "accept", "edit", "reject"] }).notNull(),
    actorId: text("actor_id"),
    at: text("at").notNull(),
    reason: text("reason"),
    valuesJson: text("values_json"),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.suggestionId, table.ordinal] }),
    foreignKey({
      columns: [table.organizationId, table.eventId, table.suggestionId],
      foreignColumns: [
        evaluationSuggestions.organizationId,
        evaluationSuggestions.eventId,
        evaluationSuggestions.id,
      ],
    }).onDelete("restrict"),
    index("evaluation_suggestion_history_order_idx").on(
      table.organizationId,
      table.eventId,
      table.suggestionId,
      table.ordinal,
    ),
    check(
      "evaluation_suggestion_history_values_check",
      sql`${table.ordinal} >= 0 AND (${table.valuesJson} IS NULL OR (json_valid(${table.valuesJson}) AND json_type(${table.valuesJson}) = 'object'))`,
    ),
  ],
);

export const evaluationDecisions = sqliteTable(
  "evaluation_decisions",
  {
    id: text("id").primaryKey().notNull(),
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    planId: text("plan_id").notNull(),
    submissionId: text("submission_id").notNull(),
    status: text("status", { enum: ["accepted", "waitlisted", "rejected"] }).notNull(),
    version: integer("version").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.eventId, table.planId],
      foreignColumns: [reviewPlans.organizationId, reviewPlans.eventId, reviewPlans.id],
    }).onDelete("restrict"),
    unique("evaluation_decisions_organization_id_id_unique").on(table.organizationId, table.id),
    unique("evaluation_decisions_event_id_unique").on(
      table.organizationId,
      table.eventId,
      table.id,
    ),
    unique("evaluation_decisions_plan_submission_unique").on(
      table.organizationId,
      table.planId,
      table.submissionId,
    ),
    index("evaluation_decisions_event_idx").on(
      table.organizationId,
      table.eventId,
      table.planId,
      table.updatedAt,
    ),
    check("evaluation_decisions_version_check", sql`${table.version} > 0`),
  ],
);

export const evaluationExportRuns = sqliteTable(
  "evaluation_export_runs",
  {
    id: text("id").primaryKey().notNull(),
    tenantId: text("tenant_id").notNull(),
    eventId: text("event_id").notNull(),
    planId: text("plan_id").notNull(),
    planVersion: integer("plan_version").notNull(),
    requestedBy: text("requested_by").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    fileName: text("file_name").notNull(),
    status: text("status", { enum: ["queued", "running", "ready", "failed"] }).notNull(),
    requestedAt: text("requested_at").notNull(),
    startedAt: text("started_at"),
    processorAttempt: integer("processor_attempt"),
    completedAt: text("completed_at"),
    artifactKey: text("artifact_key"),
    rowCount: integer("row_count"),
    errorCode: text("error_code", {
      enum: ["EVALUATION_EXPORT_GENERATION_FAILED", "EVALUATION_EXPORT_PROCESSING_EXHAUSTED"],
    }),
    errorMessage: text("error_message"),
    errorRetryable: integer("error_retryable", { mode: "boolean" }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    unique("evaluation_export_runs_tenant_idempotency_unique").on(
      table.tenantId,
      table.idempotencyKey,
    ),
    index("evaluation_export_runs_scope_idx").on(
      table.tenantId,
      table.eventId,
      table.planId,
      table.requestedAt,
    ),
    index("evaluation_export_runs_status_idx").on(table.status, table.updatedAt),
    check("evaluation_export_runs_plan_version_check", sql`${table.planVersion} > 0`),
    check(
      "evaluation_export_runs_row_count_check",
      sql`${table.rowCount} IS NULL OR ${table.rowCount} >= 0`,
    ),
    check(
      "evaluation_export_runs_state_check",
      sql`(${table.status} = 'queued' AND ${table.startedAt} IS NULL AND ${table.processorAttempt} IS NULL AND ${table.completedAt} IS NULL AND ${table.artifactKey} IS NULL AND ${table.rowCount} IS NULL AND ${table.errorCode} IS NULL AND ${table.errorMessage} IS NULL AND ${table.errorRetryable} IS NULL) OR (${table.status} = 'running' AND ${table.startedAt} IS NOT NULL AND ${table.processorAttempt} IS NOT NULL AND ${table.completedAt} IS NULL AND ${table.artifactKey} IS NULL AND ${table.rowCount} IS NULL AND ${table.errorCode} IS NULL AND ${table.errorMessage} IS NULL AND ${table.errorRetryable} IS NULL) OR (${table.status} = 'ready' AND ${table.startedAt} IS NOT NULL AND ${table.processorAttempt} IS NOT NULL AND ${table.completedAt} IS NOT NULL AND ${table.artifactKey} IS NOT NULL AND ${table.rowCount} IS NOT NULL AND ${table.errorCode} IS NULL AND ${table.errorMessage} IS NULL AND ${table.errorRetryable} IS NULL) OR (${table.status} = 'failed' AND ${table.startedAt} IS NOT NULL AND ${table.processorAttempt} IS NOT NULL AND ${table.completedAt} IS NOT NULL AND ${table.artifactKey} IS NULL AND ${table.rowCount} IS NULL AND ${table.errorCode} IN ('EVALUATION_EXPORT_GENERATION_FAILED', 'EVALUATION_EXPORT_PROCESSING_EXHAUSTED') AND ${table.errorMessage} IS NOT NULL AND ${table.errorRetryable} = 1)`,
    ),
  ],
);

export const evaluationDecisionTransitions = sqliteTable(
  "evaluation_decision_transitions",
  {
    organizationId: text("organization_id").notNull(),
    eventId: text("event_id").notNull(),
    decisionId: text("decision_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    fromStatus: text("from_status", { enum: ["accepted", "waitlisted", "rejected"] }),
    toStatus: text("to_status", { enum: ["accepted", "waitlisted", "rejected"] }).notNull(),
    reason: text("reason").notNull(),
    decidedBy: text("decided_by").notNull(),
    decidedAt: text("decided_at").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.decisionId, table.ordinal] }),
    foreignKey({
      columns: [table.organizationId, table.eventId, table.decisionId],
      foreignColumns: [
        evaluationDecisions.organizationId,
        evaluationDecisions.eventId,
        evaluationDecisions.id,
      ],
    }).onDelete("restrict"),
    unique("evaluation_decision_transitions_idempotency_unique").on(
      table.organizationId,
      table.decisionId,
      table.idempotencyKey,
    ),
    index("evaluation_decision_transitions_order_idx").on(
      table.organizationId,
      table.eventId,
      table.decisionId,
      table.ordinal,
    ),
    check("evaluation_decision_transitions_ordinal_check", sql`${table.ordinal} >= 0`),
  ],
);
