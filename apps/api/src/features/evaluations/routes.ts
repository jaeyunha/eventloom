import { Hono } from "hono";
import { ZodError, z } from "zod";
import { EvaluationError, forbidden, notFound } from "./errors";
import {
  type EvaluationExport,
  type EvaluationExportCoordinator,
  EvaluationExportError,
  type EvaluationExportGeneration,
  EvaluationExportGenerationError,
  type RunningEvaluationExport,
} from "./export-jobs";
import {
  type EvaluationOrganizerReviewExportSnapshot,
  type EvaluationService,
  isHumanConfirmedScore,
} from "./service";
import type { EvaluationActor, EvaluationReview, ReviewRound } from "./types";

export interface EvaluationRouteEnvironment {
  Variables: {
    evaluationActor: EvaluationActor;
  };
}
export interface EvaluationReminderDeliveryFact {
  readonly outboxId: string;
  readonly reviewerId: string;
  readonly roundId: string | null;
  readonly status: "pending" | "queued" | "processing" | "delivered" | "failed" | "dead-letter";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly lastErrorCode: string | null;
}
export interface EvaluationReminderBoundary {
  sendOutstandingReviewerReminders(
    actor: EvaluationActor,
    input: {
      readonly planId: string;
      readonly roundId?: string | undefined;
      readonly reviewerIds: readonly string[];
      readonly assignmentIds: readonly string[];
    },
  ): Promise<{
    readonly queued: number;
    readonly reviewerIds: readonly string[];
    readonly facts: readonly EvaluationReminderDeliveryFact[];
  }>;
  listOutstandingReviewerReminderDeliveries(
    actor: EvaluationActor,
    input: { readonly planId: string },
  ): Promise<readonly EvaluationReminderDeliveryFact[]>;
}
export interface EvaluationReviewerIdentityBoundary {
  resolveReviewerIds(
    actor: EvaluationActor,
    input: {
      readonly eventId: string;
      readonly reviewerIds: readonly string[];
    },
  ): Promise<readonly string[] | null>;
}

export interface EvaluationRouteOptions {
  /** Delivers reminders through the communications boundary; absent means fail closed. */
  readonly reminders?: EvaluationReminderBoundary | undefined;
  /** Resolves verified reviewer emails to canonical user IDs at the production boundary. */
  readonly reviewerIdentity?: EvaluationReviewerIdentityBoundary | undefined;
  /** Persists and processes review-results export runs; absent means fail closed. */
  readonly resultsExports?: EvaluationExportCoordinator | undefined;
}

const criterionInputTypeSchema = z.enum(["numeric", "dropdown", "free_text"]);
const anonymizationSchema = z.enum(["none", "single", "double"]);
const evaluationInstantSchema = z.iso.datetime({ offset: true });
const criterionOptionSchema = z.object({
  id: z.string().optional(),
  label: z.string(),
  value: z.string(),
});
const criterionSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  minimum: z.number(),
  maximum: z.number(),
  weight: z.number(),
  required: z.boolean(),
  inputType: criterionInputTypeSchema.optional(),
  options: z.array(criterionOptionSchema).optional(),
});
const rubricSchema = z.object({
  id: z.string(),
  name: z.string(),
  criteria: z.array(criterionSchema),
});
const reviewerPoolSchema = z.object({
  reviewerIds: z.array(z.string()),
  name: z.string().optional(),
});
const roundSchema = z.object({
  id: z.string(),
  name: z.string(),
  sequence: z.number(),
  opensAt: evaluationInstantSchema.nullable().optional(),
  closesAt: evaluationInstantSchema.nullable().default(null),
  blindReview: z.boolean().optional(),
  anonymization: anonymizationSchema.optional(),
  reviewerPool: reviewerPoolSchema.optional(),
  trackFilter: z.string().nullable().optional(),
  rubric: rubricSchema,
});
const projectionSchema = z.object({
  fieldIds: z.array(z.string()).optional(),
  fileIds: z.array(z.string()).optional(),
  visibleFieldIds: z.array(z.string()).optional(),
  visibleFileIds: z.array(z.string()).optional(),
});

const assignmentRuleSchema = z.object({
  reviewsPerSubmission: z.number(),
  maxAssignmentsPerReviewer: z.number(),
  trackFilter: z.string().nullable().optional(),
  autoDistribute: z.boolean().optional(),
});
const createPlanSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  name: z.string(),
  blindReview: z.boolean(),
  closesAt: evaluationInstantSchema.nullable().default(null),
  assignmentRule: assignmentRuleSchema,
  rounds: z.array(roundSchema).max(50),
  reviewerProjection: projectionSchema.optional(),
  evaluatorProjection: projectionSchema.optional(),
  projection: projectionSchema.optional(),
});
const updatePlanSchema = z.object({
  expectedVersion: z.number().int().positive(),
  name: z.string().optional(),
  blindReview: z.boolean().optional(),
  closesAt: evaluationInstantSchema.nullable().optional(),
  assignmentRule: assignmentRuleSchema.optional(),
  rounds: z.array(roundSchema).max(50).optional(),
  reviewerProjection: projectionSchema.optional(),
  evaluatorProjection: projectionSchema.optional(),
  projection: projectionSchema.optional(),
});

const versionSchema = z.object({ expectedVersion: z.number().int().positive() });
const lifecycleVersionSchema = versionSchema.extend({
  revisionSyncToken: z.string().uuid(),
});
const reconciliationSchema = lifecycleVersionSchema;
const updatePlanScheduleSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    closesAt: evaluationInstantSchema.nullable(),
    revisionSyncToken: z.string().uuid(),
  })
  .strict();
const distributionPreviewSchema = z.object({
  roundId: z.string().min(1),
  submissionIds: z.array(z.string().min(1)).min(1),
  reviewerIds: z.array(z.string().min(1)).min(1).optional(),
  expectedVersion: z.number().int().positive(),
});
const distributionApplySchema = distributionPreviewSchema.extend({
  fingerprint: z.string().min(1),
});
const replacementSchema = z.object({
  replacementReviewerId: z.string().min(1),
  expectedVersion: z.number().int().positive(),
  reason: z.string().min(1),
});

const assignmentSchema = z.object({
  roundId: z.string(),
  submissionId: z.string(),
  reviewerIds: z.array(z.string()),
  expectedVersion: z.number().int().positive().optional(),
});

const saveReviewSchema = z.object({
  scores: z.array(
    z.object({
      criterionId: z.string(),
      value: z.union([z.number(), z.string()]),
      origin: z.enum(["human", "ai"]),
      evidence: z.array(z.string()).optional(),
    }),
  ),
  comment: z.string().optional(),
  expectedVersion: z.number().int().positive().optional(),
});

const confirmScoresSchema = z.object({
  criterionIds: z.array(z.string()),
  expectedVersion: z.number().int().positive(),
});
const generateSuggestionsSchema = z.object({});
const resolveSuggestionSchema = z.object({
  action: z.enum(["accept", "edit", "reject"]),
  expectedVersion: z.number().int().positive(),
  reason: z.string().optional(),
  criterionId: z.string().optional(),
  scores: z.record(z.string(), z.number()).optional(),
  criterionScores: z.record(z.string(), z.number()).optional(),
});

const conflictSchema = z.object({ reason: z.string() });
const reopenSchema = z.object({
  expectedVersion: z.number().int().positive(),
  reason: z.string(),
  idempotencyKey: z.string(),
});

const decisionSchema = z.object({
  status: z.enum(["accepted", "waitlisted", "rejected"]),
  reason: z.string(),
  idempotencyKey: z.string(),
  expectedVersion: z.number().int().positive().optional(),
});
const reminderSchema = z.object({
  reviewerIds: z.array(z.string()).min(1),
  roundId: z.string().optional(),
});

function actor(context: { get(name: "evaluationActor"): EvaluationActor }): EvaluationActor {
  const current = context.get("evaluationActor");
  if (current === undefined) {
    throw forbidden("Evaluation authentication is required.");
  }
  return current;
}
function roundsRequireBlind(
  rounds:
    | readonly {
        readonly blindReview?: boolean | undefined;
        readonly anonymization?: string | undefined;
      }[]
    | undefined,
): boolean {
  return (
    rounds?.some(
      (round) =>
        round.blindReview === true ||
        (round.anonymization !== undefined && round.anonymization !== "none"),
    ) ?? false
  );
}
async function canonicalizeRoundPools(
  currentActor: EvaluationActor,
  eventId: string,
  rounds: readonly z.infer<typeof roundSchema>[],
  identityBoundary: EvaluationReviewerIdentityBoundary | undefined,
): Promise<readonly z.infer<typeof roundSchema>[] | null> {
  if (identityBoundary === undefined) return rounds;
  const resolvedRounds: z.infer<typeof roundSchema>[] = [];
  for (const round of rounds) {
    const reviewerIds = round.reviewerPool?.reviewerIds;
    if (reviewerIds === undefined) {
      resolvedRounds.push(round);
      continue;
    }
    const resolved = await identityBoundary.resolveReviewerIds(currentActor, {
      eventId,
      reviewerIds,
    });
    if (resolved === null) return null;
    resolvedRounds.push({
      ...round,
      reviewerPool: {
        ...(round.reviewerPool ?? {}),
        reviewerIds: [...resolved],
      },
    });
  }
  return resolvedRounds;
}
function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const safeText =
    typeof value === "string" && /^[\t\r\n ]*[=+\-@]/u.test(text) ? `'${text}` : text;
  return /[",\r\n]/u.test(safeText) ? `"${safeText.replace(/"/gu, '""')}"` : safeText;
}

export function createUniqueCsvHeaders(
  candidates: readonly {
    readonly header: string;
    readonly stableId: string;
  }[],
): string[] {
  const usedSerializedHeaders = new Set<string>();
  return candidates.map(({ header, stableId }) => {
    let candidate = header;
    while (usedSerializedHeaders.has(csvCell(candidate))) {
      candidate = `${candidate} [${stableId}]`;
    }
    usedSerializedHeaders.add(csvCell(candidate));
    return candidate;
  });
}

function reviewerScoreValue(
  criterion: {
    readonly inputType?: "numeric" | "dropdown" | "free_text" | undefined;
    readonly minimum: number;
    readonly options?: readonly { readonly label: string; readonly value: string }[] | undefined;
  },
  score: { readonly value: number | string },
): string {
  if ((criterion.inputType ?? "numeric") === "dropdown" && typeof score.value === "number") {
    const index = Math.round(score.value - criterion.minimum);
    return criterion.options?.[index]?.value ?? String(score.value);
  }
  return String(score.value);
}
function freeTextResponse(comment: string, criterionId: string): string {
  const startMarker = `[scorecard-response id="${criterionId}"]`;
  const start = comment.indexOf(startMarker);
  if (start < 0) return "";
  const valueStart = start + startMarker.length;
  const end = comment.indexOf("[/scorecard-response]", valueStart);
  return (end < 0 ? comment.slice(valueStart) : comment.slice(valueStart, end)).trim();
}
function reviewerComment(comment: string): string {
  let remaining = comment;
  const startMarker = '[scorecard-response id="';
  const endMarker = "[/scorecard-response]";
  while (true) {
    const start = remaining.indexOf(startMarker);
    if (start < 0) break;
    const valueStart = remaining.indexOf("]", start + startMarker.length);
    if (valueStart < 0) break;
    const end = remaining.indexOf(endMarker, valueStart + 1);
    if (end < 0) break;
    remaining = `${remaining.slice(0, start)}${remaining.slice(end + endMarker.length)}`;
  }
  return remaining.trim();
}
function readableNumber(value: number | null): string {
  return value === null ? "" : String(Number(value.toFixed(6)));
}
function reviewMatchesRound(review: EvaluationReview, round: ReviewRound, planVersion: number) {
  const rubricRevision = round.rubricRevision ?? planVersion;
  const roundRevision = round.revision ?? planVersion;
  return (
    review.roundId === round.id &&
    (review.rubricRevision ?? review.rubricVersion ?? review.planRevision ?? review.planVersion) ===
      rubricRevision &&
    (review.roundRevision ??
      review.rubricRevision ??
      review.rubricVersion ??
      review.planRevision ??
      review.planVersion) === roundRevision
  );
}
function submittedReviews(
  snapshot: EvaluationOrganizerReviewExportSnapshot,
  round: ReviewRound,
  submissionId: string,
): readonly EvaluationReview[] {
  const rubricRevision =
    round.rubricRevision ?? snapshot.plan.gradingRevision ?? snapshot.plan.version;
  const roundRevision = round.revision ?? snapshot.plan.gradingRevision ?? snapshot.plan.version;
  const assignmentIds = new Set(
    snapshot.assignments
      .filter(
        (assignment) =>
          assignment.roundId === round.id &&
          assignment.submissionId === submissionId &&
          assignment.status !== "abstained" &&
          assignment.status !== "superseded" &&
          (assignment.rubricRevision ?? assignment.planVersion) === rubricRevision &&
          (assignment.roundRevision ?? assignment.rubricRevision ?? assignment.planVersion) ===
            roundRevision,
      )
      .map((assignment) => assignment.id),
  );
  return snapshot.reviews
    .filter(
      (review) =>
        review.submissionId === submissionId &&
        assignmentIds.has(review.assignmentId) &&
        reviewMatchesRound(review, round, snapshot.plan.gradingRevision ?? snapshot.plan.version),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function renderEvaluationPlanCsv(
  snapshot: EvaluationOrganizerReviewExportSnapshot,
): EvaluationExportGeneration {
  const rounds = [...snapshot.plan.rounds].sort(
    (left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id),
  );
  const aggregates = new Map(
    snapshot.aggregates.map((aggregate) => [
      `${aggregate.roundId}\u0000${aggregate.submissionId}`,
      aggregate,
    ]),
  );
  const roundNameCounts = new Map<string, number>();
  for (const round of rounds) {
    roundNameCounts.set(round.name, (roundNameCounts.get(round.name) ?? 0) + 1);
  }
  const roundHeaderPrefix = (round: (typeof rounds)[number]): string =>
    roundNameCounts.get(round.name) === 1 ? round.name : `${round.name} [${round.id}]`;
  const criterionHeaderCounts = new Map<string, number>();
  for (const round of rounds) {
    for (const criterion of round.rubric.criteria) {
      const header = `${roundHeaderPrefix(round)} - ${criterion.label}`;
      criterionHeaderCounts.set(header, (criterionHeaderCounts.get(header) ?? 0) + 1);
    }
  }
  const headerCandidates = [
    "Submission ID",
    "Title",
    "Participants",
    "Lifecycle status",
    "Decision status",
    "Decision reason",
    "Assignment reviewers",
    "Assignment statuses",
  ].map((header) => ({ header, stableId: header }));
  const appendHeader = (header: string, stableId: string): void => {
    headerCandidates.push({ header, stableId });
  };
  for (const round of rounds) {
    const prefix = roundHeaderPrefix(round);
    appendHeader(`${prefix} - Submitted reviews`, `${round.id}/submitted-reviews`);
    appendHeader(`${prefix} - Expected reviews`, `${round.id}/expected-reviews`);
    appendHeader(`${prefix} - Aggregate score`, `${round.id}/aggregate-score`);
    appendHeader(`${prefix} - Possible score`, `${round.id}/possible-score`);
    appendHeader(`${prefix} - Reviewer comments`, `${round.id}/reviewer-comments`);
    for (const criterion of round.rubric.criteria) {
      const base = `${prefix} - ${criterion.label}`;
      appendHeader(
        criterionHeaderCounts.get(base) === 1 ? base : `${base} [${round.id}/${criterion.id}]`,
        `${round.id}/${criterion.id}`,
      );
    }
  }
  const headers = createUniqueCsvHeaders(headerCandidates);
  const rows = snapshot.submissions.map((submission) => {
    const submissionAssignments = snapshot.assignments
      .filter((assignment) => assignment.submissionId === submission.id)
      .sort(
        (left, right) =>
          rounds.findIndex((round) => round.id === left.roundId) -
            rounds.findIndex((round) => round.id === right.roundId) ||
          left.id.localeCompare(right.id),
      );
    const roundValues = rounds.flatMap((round) => {
      const aggregate = aggregates.get(`${round.id}\u0000${submission.id}`);
      if (aggregate === undefined) {
        throw new Error(
          `The aggregate for submission ${submission.id} and round ${round.id} is unavailable.`,
        );
      }
      const reviews = submittedReviews(snapshot, round, submission.id);
      const criterionValues = round.rubric.criteria.map((criterion) => {
        const values = reviews
          .flatMap((review) => {
            const score = review.scores[criterion.id];
            if (criterion.inputType === "free_text") {
              const storedValue =
                isHumanConfirmedScore(score) && typeof score.value === "string"
                  ? score.value.trim()
                  : "";
              const value =
                storedValue.length > 0
                  ? storedValue
                  : freeTextResponse(review.comment, criterion.id);
              return value.length === 0 ? [] : [value];
            }
            return isHumanConfirmedScore(score) ? [reviewerScoreValue(criterion, score)] : [];
          })
          .sort((left, right) => left.localeCompare(right));
        return values.join(" | ");
      });
      return [
        aggregate.submittedReviewCount,
        aggregate.expectedReviewCount,
        readableNumber(aggregate.averageWeightedTotal),
        readableNumber(aggregate.possibleWeightedTotal),
        reviews
          .map((review) => reviewerComment(review.comment))
          .filter((comment) => comment.length > 0)
          .sort((left, right) => left.localeCompare(right))
          .join(" | "),
        ...criterionValues,
      ];
    });
    const participants = submission.participants
      .map((participant) => {
        const role =
          "role" in participant && typeof participant.role === "string"
            ? ` (${participant.role})`
            : "";
        return `${participant.displayName}${role}`;
      })
      .sort((left, right) => left.localeCompare(right))
      .join(" | ");
    const decision = snapshot.decisions[submission.id];
    return [
      submission.id,
      submission.title,
      participants,
      submission.status,
      decision?.status ?? "undecided",
      decision?.history.at(-1)?.reason ?? "",
      submissionAssignments.map((assignment) => assignment.reviewerId).join(" | "),
      submissionAssignments.map((assignment) => assignment.status).join(" | "),
      ...roundValues,
    ];
  });
  return {
    body: `${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`,
    rowCount: rows.length,
  };
}

export function createEvaluationExportGenerator(service: EvaluationService): {
  generate(job: RunningEvaluationExport): Promise<EvaluationExportGeneration>;
} {
  return {
    generate: async (job) => {
      const snapshot = await service.getOrganizerReviewExportSnapshot(
        {
          tenantId: job.tenantId,
          userId: job.requestedBy,
          kind: "human",
          grants: [{ eventId: job.eventId, role: "organizer" }],
        },
        job.planId,
      );
      if (snapshot.plan.version !== job.planVersion) {
        throw new EvaluationExportGenerationError(
          "The review plan changed after this export was requested. Request a new export.",
        );
      }
      try {
        return renderEvaluationPlanCsv(snapshot);
      } catch (error) {
        throw new EvaluationExportGenerationError(
          "The evaluation results could not be rendered safely.",
          { cause: error },
        );
      }
    },
  };
}

function requireResultsExports(options: EvaluationRouteOptions): EvaluationExportCoordinator {
  if (options.resultsExports !== undefined) return options.resultsExports;
  throw new EvaluationExportError(
    "EVALUATION_EXPORT_UNAVAILABLE",
    "Review results exports are temporarily unavailable.",
    503,
  );
}

function evaluationExportPath(planId: string, runId: string): string {
  return `/api/admin/evaluations/plans/${encodeURIComponent(planId)}/exports/${encodeURIComponent(runId)}`;
}

function evaluationExportResponse(job: EvaluationExport): Record<string, unknown> {
  const statusUrl = evaluationExportPath(job.planId, job.id);
  return {
    id: job.id,
    planId: job.planId,
    status: job.status,
    fileName: job.fileName,
    createdAt: job.requestedAt,
    statusUrl,
    downloadUrl: `${statusUrl}/download`,
    ...(job.status === "running" ? { startedAt: job.startedAt } : {}),
    ...(job.status === "ready"
      ? {
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          rowCount: job.rowCount,
        }
      : {}),
    ...(job.status === "failed"
      ? {
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          error: job.error,
        }
      : {}),
  };
}

export function createEvaluationRoutes(
  service: EvaluationService,
  options: EvaluationRouteOptions = {},
): Hono<EvaluationRouteEnvironment> {
  const routes = new Hono<EvaluationRouteEnvironment>();

  routes.post("/plans/:planId/exports", async (context) => {
    const currentActor = actor(context);
    const plan = await service.getOrganizerPlan(currentActor, context.req.param("planId"));
    const idempotencyKey = z
      .string()
      .trim()
      .min(1)
      .max(200)
      .parse(context.req.header("idempotency-key"));
    const job = await requireResultsExports(options).request({
      tenantId: currentActor.tenantId,
      eventId: plan.eventId,
      planId: plan.id,
      planVersion: plan.version,
      requestedBy: currentActor.userId,
      idempotencyKey,
    });
    return context.json({ data: evaluationExportResponse(job) }, 202);
  });

  routes.get("/plans/:planId/exports/:runId", async (context) => {
    const currentActor = actor(context);
    const plan = await service.getOrganizerPlan(currentActor, context.req.param("planId"));
    const job = await requireResultsExports(options).get({
      tenantId: currentActor.tenantId,
      eventId: plan.eventId,
      planId: plan.id,
      runId: context.req.param("runId"),
    });
    return context.json({ data: evaluationExportResponse(job) });
  });

  routes.get("/plans/:planId/exports/:runId/download", async (context) => {
    const currentActor = actor(context);
    const plan = await service.getOrganizerPlan(currentActor, context.req.param("planId"));
    const download = await requireResultsExports(options).download({
      tenantId: currentActor.tenantId,
      eventId: plan.eventId,
      planId: plan.id,
      runId: context.req.param("runId"),
    });
    return context.body(download.body, 200, {
      "content-type": download.contentType,
      "content-disposition": `attachment; filename="${download.fileName}"`,
      "cache-control": "no-store",
    });
  });

  routes.get("/reviewer/workspace", async (context) => {
    const eventId = context.req.query("eventId");
    const organizationId = context.req.query("organizationId");
    return context.json({
      data: await service.listReviewerWorkspace(
        actor(context),
        eventId === undefined ? undefined : eventId,
        organizationId === undefined ? undefined : organizationId,
      ),
    });
  });
  routes.get("/organizer/workspace", async (context) => {
    const eventId = context.req.query("eventId");
    return context.json({
      data: await service.getOrganizerWorkspace(
        actor(context),
        eventId ?? "",
        context.req.query("planId"),
      ),
    });
  });
  routes.get("/plans", async (context) => {
    const eventId = context.req.query("eventId");
    return context.json({ plans: await service.listPlans(actor(context), eventId) });
  });

  routes.get("/plans/:planId", async (context) =>
    context.json(await service.getPlan(actor(context), context.req.param("planId"))),
  );

  routes.post("/plans", async (context) => {
    const body = createPlanSchema.parse(await context.req.json());
    const currentActor = actor(context);
    const rounds = await canonicalizeRoundPools(
      currentActor,
      body.eventId,
      body.rounds,
      options.reviewerIdentity,
    );
    if (rounds === null) {
      return context.json(
        {
          error: {
            code: "EVALUATION_REVIEWER_NOT_FOUND",
            message: "Every reviewer must be a verified member of this organization.",
          },
        },
        403,
      );
    }
    const plan = await service.createPlan(currentActor, {
      ...body,
      rounds,
      blindReview: body.blindReview || roundsRequireBlind(rounds),
    });
    return context.json(plan, 201);
  });
  routes.patch("/plans/:planId", async (context) => {
    const body = updatePlanSchema.parse(await context.req.json());
    const currentActor = actor(context);
    const currentPlan = await service.getPlan(currentActor, context.req.param("planId"));
    const rounds =
      body.rounds === undefined
        ? undefined
        : await canonicalizeRoundPools(
            currentActor,
            currentPlan.eventId,
            body.rounds,
            options.reviewerIdentity,
          );
    if (rounds === null) {
      return context.json(
        {
          error: {
            code: "EVALUATION_REVIEWER_NOT_FOUND",
            message: "Every reviewer must be a verified member of this organization.",
          },
        },
        403,
      );
    }
    const blindReview =
      body.blindReview === true ||
      roundsRequireBlind(rounds) ||
      currentPlan?.rounds.some(
        (round) =>
          round.blindReview === true ||
          (round.anonymization !== undefined && round.anonymization !== "none"),
      ) === true
        ? true
        : body.blindReview;
    return context.json(
      await service.updatePlan(currentActor, context.req.param("planId"), {
        ...body,
        ...(rounds === undefined ? {} : { rounds }),
        ...(blindReview === undefined ? {} : { blindReview }),
      }),
    );
  });
  routes.put("/plans/:planId", async (context) => {
    const body = updatePlanSchema.parse(await context.req.json());
    const currentActor = actor(context);
    const currentPlan = await service.getPlan(currentActor, context.req.param("planId"));
    const rounds =
      body.rounds === undefined
        ? undefined
        : await canonicalizeRoundPools(
            currentActor,
            currentPlan.eventId,
            body.rounds,
            options.reviewerIdentity,
          );
    if (rounds === null) {
      return context.json(
        {
          error: {
            code: "EVALUATION_REVIEWER_NOT_FOUND",
            message: "Every reviewer must be a verified member of this organization.",
          },
        },
        403,
      );
    }
    const blindReview =
      body.blindReview === true ||
      roundsRequireBlind(rounds) ||
      currentPlan.rounds.some(
        (round) =>
          round.blindReview === true ||
          (round.anonymization !== undefined && round.anonymization !== "none"),
      ) === true
        ? true
        : body.blindReview;
    return context.json(
      await service.updatePlan(currentActor, context.req.param("planId"), {
        ...body,
        ...(rounds === undefined ? {} : { rounds }),
        ...(blindReview === undefined ? {} : { blindReview }),
      }),
    );
  });

  routes.post("/plans/:planId/revise", async (context) => {
    const body = versionSchema.parse(await context.req.json());
    return context.json(
      await service.revisePlanToDraft(actor(context), context.req.param("planId"), body),
      201,
    );
  });

  routes.post("/plans/:planId/open", async (context) => {
    const body = lifecycleVersionSchema.parse(await context.req.json());
    return context.json(
      await service.openPlan(
        actor(context),
        context.req.param("planId"),
        body.expectedVersion,
        body.revisionSyncToken,
      ),
    );
  });

  routes.post("/plans/:planId/close", async (context) => {
    const body = lifecycleVersionSchema.parse(await context.req.json());
    return context.json(
      await service.closePlan(
        actor(context),
        context.req.param("planId"),
        body.expectedVersion,
        body.revisionSyncToken,
      ),
    );
  });

  routes.patch("/plans/:planId/schedule", async (context) => {
    const body = updatePlanScheduleSchema.parse(await context.req.json());
    return context.json(
      await service.updatePlanSchedule(actor(context), context.req.param("planId"), body),
    );
  });

  routes.post("/plans/:planId/reconcile-revision-family", async (context) => {
    const body = reconciliationSchema.parse(await context.req.json());
    return context.json(
      await service.reconcilePlanRevisionFamily(
        actor(context),
        context.req.param("planId"),
        body.expectedVersion,
        body.revisionSyncToken,
      ),
    );
  });

  routes.post("/plans/:planId/distribution/preview", async (context) => {
    const body = distributionPreviewSchema.parse(await context.req.json());
    const currentActor = actor(context);
    const planId = context.req.param("planId");
    const plan = await service.getPlan(currentActor, planId);
    const reviewerIds =
      body.reviewerIds === undefined || options.reviewerIdentity === undefined
        ? body.reviewerIds
        : await options.reviewerIdentity.resolveReviewerIds(currentActor, {
            eventId: plan.eventId,
            reviewerIds: body.reviewerIds,
          });
    if (reviewerIds === null) {
      return context.json(
        {
          error: {
            code: "EVALUATION_REVIEWER_NOT_FOUND",
            message: "Every reviewer must be a verified member of this organization.",
          },
        },
        403,
      );
    }
    return context.json(
      await service.previewDistribution(currentActor, {
        planId,
        ...body,
        ...(reviewerIds === undefined ? {} : { reviewerIds }),
      }),
    );
  });

  routes.post("/plans/:planId/distribution/apply", async (context) => {
    const body = distributionApplySchema.parse(await context.req.json());
    const currentActor = actor(context);
    const planId = context.req.param("planId");
    const plan = await service.getPlan(currentActor, planId);
    const reviewerIds =
      body.reviewerIds === undefined || options.reviewerIdentity === undefined
        ? body.reviewerIds
        : await options.reviewerIdentity.resolveReviewerIds(currentActor, {
            eventId: plan.eventId,
            reviewerIds: body.reviewerIds,
          });
    if (reviewerIds === null) {
      return context.json(
        {
          error: {
            code: "EVALUATION_REVIEWER_NOT_FOUND",
            message: "Every reviewer must be a verified member of this organization.",
          },
        },
        403,
      );
    }
    return context.json(
      await service.applyDistribution(currentActor, {
        planId,
        ...body,
        ...(reviewerIds === undefined ? {} : { reviewerIds }),
      }),
    );
  });

  routes.post("/plans/:planId/assignments/:assignmentId/replace", async (context) => {
    const body = replacementSchema.parse(await context.req.json());
    const currentActor = actor(context);
    const planId = context.req.param("planId");
    const plan = await service.getPlan(currentActor, planId);
    const assignmentId = context.req.param("assignmentId");
    const assignment = (await service.listOrganizerAssignments(currentActor, planId)).find(
      (candidate) => candidate.id === assignmentId,
    );
    if (assignment === undefined) {
      throw notFound("The evaluation assignment was not found.");
    }
    const replacementReviewerIds =
      options.reviewerIdentity === undefined
        ? [body.replacementReviewerId]
        : await options.reviewerIdentity.resolveReviewerIds(currentActor, {
            eventId: plan.eventId,
            reviewerIds: [body.replacementReviewerId],
          });
    const replacementReviewerId = replacementReviewerIds?.[0];
    if (replacementReviewerId === undefined) {
      return context.json(
        {
          error: {
            code: "EVALUATION_REVIEWER_NOT_FOUND",
            message: "The replacement reviewer must be a verified organization member.",
          },
        },
        403,
      );
    }
    return context.json(
      await service.replaceAssignment(currentActor, assignmentId, {
        replacementReviewerId,
        expectedVersion: body.expectedVersion,
        reason: body.reason,
      }),
    );
  });

  routes.get("/plans/:planId/reminders", async (context) => {
    if (options.reminders === undefined) {
      return context.json(
        {
          error: {
            code: "EVALUATION_REMINDERS_UNAVAILABLE",
            message: "Reviewer reminders are not connected to the communications boundary.",
          },
        },
        503,
      );
    }
    const currentActor = actor(context);
    const plan = await service.getPlan(currentActor, context.req.param("planId"));
    return context.json({
      facts: await options.reminders.listOutstandingReviewerReminderDeliveries(currentActor, {
        planId: plan.id,
      }),
    });
  });

  routes.post("/plans/:planId/reminders", async (context) => {
    const body = reminderSchema.parse(await context.req.json());
    if (options.reminders === undefined) {
      return context.json(
        {
          error: {
            code: "EVALUATION_REMINDERS_UNAVAILABLE",
            message: "Reviewer reminders are not connected to the communications boundary.",
          },
        },
        503,
      );
    }
    const currentActor = actor(context);
    const planId = context.req.param("planId");
    const [plan, assignments, existingFacts] = await Promise.all([
      service.getPlan(currentActor, planId),
      service.listOrganizerAssignments(currentActor, planId),
      options.reminders.listOutstandingReviewerReminderDeliveries(currentActor, { planId }),
    ]);
    const selected = assignments.filter(
      (assignment) =>
        body.reviewerIds.includes(assignment.reviewerId) &&
        (body.roundId === undefined || assignment.roundId === body.roundId) &&
        (assignment.status === "assigned" || assignment.status === "in_progress"),
    );
    if (selected.length === 0) {
      return context.json(
        {
          error: {
            code: "EVALUATION_NO_OUTSTANDING_REVIEWS",
            message: "The selected reviewers have no outstanding reviews.",
          },
        },
        400,
      );
    }
    const reviewerIds = [...new Set(selected.map((assignment) => assignment.reviewerId))].sort();
    const reusableStatuses = new Set(["queued", "processing", "delivered"]);
    const reusableFacts = reviewerIds.flatMap((reviewerId) => {
      const fact = existingFacts.find(
        (candidate) =>
          candidate.reviewerId === reviewerId &&
          candidate.roundId === (body.roundId ?? null) &&
          reusableStatuses.has(candidate.status),
      );
      return fact === undefined ? [] : [fact];
    });
    if (reusableFacts.length === reviewerIds.length) {
      return context.json(
        {
          queued: 0,
          reviewerIds,
          facts: reusableFacts,
        },
        200,
      );
    }
    const result = await options.reminders.sendOutstandingReviewerReminders(currentActor, {
      planId: plan.id,
      ...(body.roundId === undefined ? {} : { roundId: body.roundId }),
      reviewerIds,
      assignmentIds: selected.map((assignment) => assignment.id).sort(),
    });
    return context.json(result, 202);
  });
  routes.post("/plans/:planId/assignments", async (context) => {
    const body = assignmentSchema.parse(await context.req.json());
    const currentActor = actor(context);
    const plan = await service.getPlan(currentActor, context.req.param("planId"));
    const round = plan.rounds.find((candidate) => candidate.id === body.roundId);
    if (round === undefined) {
      return context.json(
        {
          error: {
            code: "EVALUATION_ROUND_NOT_FOUND",
            message: "The evaluation round was not found.",
          },
        },
        404,
      );
    }
    const reviewerIds =
      options.reviewerIdentity === undefined
        ? body.reviewerIds
        : await options.reviewerIdentity.resolveReviewerIds(currentActor, {
            eventId: plan.eventId,
            reviewerIds: body.reviewerIds,
          });
    if (reviewerIds === null) {
      return context.json(
        {
          error: {
            code: "EVALUATION_REVIEWER_NOT_FOUND",
            message: "Every reviewer must be a verified member of this organization.",
          },
        },
        403,
      );
    }
    const pool = round.reviewerPool?.reviewerIds;
    if (pool !== undefined && reviewerIds.some((reviewerId) => !pool.includes(reviewerId))) {
      return context.json(
        {
          error: {
            code: "EVALUATION_REVIEWER_OUTSIDE_POOL",
            message: "Every assigned reviewer must belong to this round's reviewer pool.",
          },
        },
        403,
      );
    }
    const assignments = await service.assignReviewers(currentActor, {
      planId: context.req.param("planId"),
      ...body,
      reviewerIds,
    });
    return context.json({ assignments }, 201);
  });
  routes.delete("/plans/:planId/assignments/:assignmentId", async (context) => {
    await service.unassignAssignment(
      actor(context),
      context.req.param("planId"),
      context.req.param("assignmentId"),
    );
    return context.body(null, 204);
  });

  routes.get("/plans/:planId/assignments", async (context) =>
    context.json({
      assignments: await service.listOrganizerAssignments(
        actor(context),
        context.req.param("planId"),
      ),
    }),
  );
  routes.get("/plans/:planId/assignment-history", async (context) =>
    context.json({
      history: await service.listAssignmentHistory(actor(context), context.req.param("planId"), {
        roundId: context.req.query("roundId"),
        submissionId: context.req.query("submissionId"),
      }),
    }),
  );

  routes.get("/plans/:planId/assignments/mine", async (context) =>
    context.json({
      assignments: await service.listReviewerAssignments(
        actor(context),
        context.req.param("planId"),
      ),
    }),
  );

  routes.get("/assignments/:assignmentId", async (context) =>
    context.json(await service.getReviewContext(actor(context), context.req.param("assignmentId"))),
  );
  routes.get("/assignments/:assignmentId/suggestions", async (context) =>
    context.json({
      suggestions: await service.listAiSuggestions(
        actor(context),
        context.req.param("assignmentId"),
      ),
    }),
  );
  routes.post("/assignments/:assignmentId/suggestions/generate", async (context) => {
    generateSuggestionsSchema.parse(await context.req.json());
    return context.json(
      await service.generateAiSuggestions(actor(context), {
        assignmentId: context.req.param("assignmentId"),
      }),
      201,
    );
  });
  routes.post("/assignments/:assignmentId/suggestions/:suggestionId/resolve", async (context) => {
    const body = resolveSuggestionSchema.parse(await context.req.json());
    return context.json(
      await service.resolveAiSuggestion(
        actor(context),
        context.req.param("suggestionId"),
        body,
        context.req.param("assignmentId"),
      ),
    );
  });
  routes.post("/assignments/:assignmentId/suggestions", async (context) => {
    generateSuggestionsSchema.parse(await context.req.json());
    return context.json(
      await service.generateAiSuggestions(actor(context), {
        assignmentId: context.req.param("assignmentId"),
      }),
      201,
    );
  });
  routes.post("/suggestions/:suggestionId/resolve", async (context) => {
    const body = resolveSuggestionSchema.parse(await context.req.json());
    return context.json(
      await service.resolveAiSuggestion(actor(context), context.req.param("suggestionId"), body),
    );
  });

  routes.put("/assignments/:assignmentId/review", async (context) => {
    const body = saveReviewSchema.parse(await context.req.json());
    return context.json(
      await service.saveReview(actor(context), context.req.param("assignmentId"), body),
    );
  });

  routes.post("/assignments/:assignmentId/review/confirm", async (context) => {
    const body = confirmScoresSchema.parse(await context.req.json());
    return context.json(
      await service.confirmAiScores(
        actor(context),
        context.req.param("assignmentId"),
        body.criterionIds,
        body.expectedVersion,
      ),
    );
  });

  routes.post("/assignments/:assignmentId/review/submit", async (context) => {
    const body = versionSchema.parse(await context.req.json());
    return context.json(
      await service.submitReview(
        actor(context),
        context.req.param("assignmentId"),
        body.expectedVersion,
      ),
    );
  });

  routes.post("/assignments/:assignmentId/conflict", async (context) => {
    const body = conflictSchema.parse(await context.req.json());
    return context.json(
      await service.declareConflict(actor(context), context.req.param("assignmentId"), body.reason),
      201,
    );
  });

  routes.get("/plans/:planId/rounds/:roundId/submissions/:submissionId/reviews", async (context) =>
    context.json({
      reviews: await service.listSubmittedReviews(
        actor(context),
        context.req.param("planId"),
        context.req.param("roundId"),
        context.req.param("submissionId"),
      ),
    }),
  );

  routes.get("/plans/:planId/rounds/:roundId/aggregates", async (context) =>
    context.json({
      aggregates: await service.listAggregates(
        actor(context),
        context.req.param("planId"),
        context.req.param("roundId"),
      ),
    }),
  );
  routes.get(
    "/plans/:planId/rounds/:roundId/submissions/:submissionId/aggregate",
    async (context) =>
      context.json(
        await service.getAggregate(
          actor(context),
          context.req.param("planId"),
          context.req.param("roundId"),
          context.req.param("submissionId"),
        ),
      ),
  );

  routes.get("/plans/:planId/progress", async (context) =>
    context.json(await service.getProgress(actor(context), context.req.param("planId"))),
  );

  routes.get("/events/:eventId/submissions", async (context) =>
    context.json(
      await service.listOrganizerSubmissions(actor(context), context.req.param("eventId")),
    ),
  );

  routes.post("/events/:eventId/submissions/:submissionId/reopen", async (context) => {
    const body = reopenSchema.parse(await context.req.json());
    return context.json(
      await service.reopenSubmission(
        actor(context),
        context.req.param("eventId"),
        context.req.param("submissionId"),
        body,
      ),
    );
  });

  routes.get("/plans/:planId/submissions/:submissionId/decision", async (context) =>
    context.json(
      await service.getDecision(
        actor(context),
        context.req.param("planId"),
        context.req.param("submissionId"),
      ),
    ),
  );

  routes.put("/plans/:planId/submissions/:submissionId/decision", async (context) => {
    const body = decisionSchema.parse(await context.req.json());
    return context.json(
      await service.recordDecision(actor(context), {
        planId: context.req.param("planId"),
        submissionId: context.req.param("submissionId"),
        ...body,
      }),
    );
  });

  routes.onError((error, context) => {
    if (error instanceof ZodError) {
      return context.json(
        {
          error: {
            code: "EVALUATION_INVALID_INPUT",
            message: "The evaluation request is invalid.",
          },
        },
        400,
      );
    }
    if (error instanceof EvaluationError) {
      return context.json({ error: { code: error.code, message: error.message } }, error.status);
    }
    if (error instanceof EvaluationExportError) {
      return context.json({ error: { code: error.code, message: error.message } }, error.status);
    }
    throw error;
  });

  return routes;
}
