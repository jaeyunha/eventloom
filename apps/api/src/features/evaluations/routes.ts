import { Hono } from "hono";
import { ZodError, z } from "zod";
import { EvaluationError, forbidden } from "./errors";
import type { EvaluationService } from "./service";
import type { EvaluationActor } from "./types";

export interface EvaluationRouteEnvironment {
  Variables: {
    evaluationActor: EvaluationActor;
  };
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
  }>;
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
}

const criterionInputTypeSchema = z.enum(["numeric", "dropdown", "free_text"]);
const anonymizationSchema = z.enum(["none", "single", "double"]);
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
  opensAt: z.string().nullable().optional(),
  closesAt: z.string().nullable().default(null),
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
  closesAt: z.string().nullable().default(null),
  assignmentRule: assignmentRuleSchema,
  rounds: z.array(roundSchema),
  reviewerProjection: projectionSchema.optional(),
  evaluatorProjection: projectionSchema.optional(),
  projection: projectionSchema.optional(),
});
const updatePlanSchema = z.object({
  expectedVersion: z.number().int().positive(),
  name: z.string().optional(),
  blindReview: z.boolean().optional(),
  closesAt: z.string().nullable().optional(),
  assignmentRule: assignmentRuleSchema.optional(),
  rounds: z.array(roundSchema).optional(),
  reviewerProjection: projectionSchema.optional(),
  evaluatorProjection: projectionSchema.optional(),
  projection: projectionSchema.optional(),
});

const versionSchema = z.object({ expectedVersion: z.number().int().positive() });

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
  expectedVersion: z.number().int().positive().optional(),
  reason: z.string().optional(),
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

function reviewerScoreValue(
  criterion: {
    readonly inputType?: "numeric" | "dropdown" | "free_text" | undefined;
    readonly minimum: number;
    readonly options?: readonly { readonly label: string; readonly value: string }[] | undefined;
  },
  score: { readonly value: number | string; readonly evidence: readonly string[] } | undefined,
): string {
  if (score === undefined) return "";
  const inputType = criterion.inputType ?? "numeric";
  if (inputType === "dropdown") {
    if (typeof score.value === "string") return score.value;
    const index = Math.round(score.value - criterion.minimum);
    return criterion.options?.[index]?.value ?? String(score.value);
  }
  if (inputType === "free_text") {
    return typeof score.value === "string" ? score.value : (score.evidence[0] ?? "");
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

async function evaluationPlanCsv(
  service: EvaluationService,
  currentActor: EvaluationActor,
  planId: string,
): Promise<string> {
  const plan = await service.getPlan(currentActor, planId);
  const [submissions, assignments] = await Promise.all([
    service.listOrganizerSubmissions(currentActor, plan.eventId),
    service.listOrganizerAssignments(currentActor, plan.id),
  ]);
  const decisions = new Map(
    await Promise.all(
      submissions.map(
        async (submission) =>
          [submission.id, await service.getDecision(currentActor, plan.id, submission.id)] as const,
      ),
    ),
  );
  const aggregatesByRound = new Map(
    await Promise.all(
      plan.rounds.map(async (round) => {
        const aggregates = await service.listAggregates(currentActor, plan.id, round.id);
        return [
          round.id,
          new Map(aggregates.map((aggregate) => [aggregate.submissionId, aggregate] as const)),
        ] as const;
      }),
    ),
  );
  const roundColumns = plan.rounds.flatMap((round) => [
    `round_${round.id}_submitted_reviews`,
    `round_${round.id}_expected_reviews`,
    `round_${round.id}_average_weighted_total`,
    `round_${round.id}_possible_weighted_total`,
    `round_${round.id}_comments`,
    ...round.rubric.criteria.map((criterion) => `round_${round.id}_criterion_${criterion.id}`),
  ]);
  const headers = [
    "submission_id",
    "title",
    "participants",
    "decision_status",
    "decision_reason",
    "assignment_reviewers",
    "assignment_statuses",
    ...roundColumns,
  ];
  const rows = await Promise.all(
    [...submissions]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(async (submission) => {
        const submissionAssignments = assignments
          .filter((assignment) => assignment.submissionId === submission.id)
          .sort((left, right) => left.id.localeCompare(right.id));
        const roundValues = (
          await Promise.all(
            plan.rounds.map(async (round) => {
              const aggregate = aggregatesByRound.get(round.id)?.get(submission.id);
              if (aggregate === undefined) {
                throw new Error(
                  `The aggregate for submission ${submission.id} and round ${round.id} is unavailable.`,
                );
              }
              const reviews = await service.listSubmittedReviews(
                currentActor,
                plan.id,
                round.id,
                submission.id,
              );
              const criterionValues = round.rubric.criteria.map((criterion) => {
                const values = reviews
                  .flatMap((review) => {
                    const score = review.scores[criterion.id];
                    if (criterion.inputType === "free_text") {
                      const response = freeTextResponse(review.comment, criterion.id);
                      const storedValue =
                        typeof score?.value === "string" ? score.value.trim() : "";
                      const value = response.length > 0 ? response : storedValue;
                      return value.length === 0 ? [] : [value];
                    }
                    return score === undefined ||
                      score.origin !== "human" ||
                      score.humanConfirmedBy === null
                      ? []
                      : [reviewerScoreValue(criterion, score)];
                  })
                  .sort((left, right) => left.localeCompare(right));
                return values.join(" | ");
              });
              return [
                aggregate.submittedReviewCount,
                aggregate.expectedReviewCount,
                aggregate.averageWeightedTotal === null
                  ? ""
                  : aggregate.averageWeightedTotal.toFixed(6),
                aggregate.possibleWeightedTotal.toFixed(6),
                reviews
                  .map((review) => review.comment.trim())
                  .filter((comment) => comment.length > 0)
                  .sort((left, right) => left.localeCompare(right))
                  .join(" | "),
                ...criterionValues,
              ];
            }),
          )
        ).flat();
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
        const decision = decisions.get(submission.id);
        return [
          submission.id,
          submission.title,
          participants,
          decision?.status ?? "",
          decision?.history.at(-1)?.reason ?? "",
          submissionAssignments.map((assignment) => assignment.reviewerId).join(" | "),
          submissionAssignments.map((assignment) => assignment.status).join(" | "),
          ...roundValues,
        ];
      }),
  );
  return `${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function createEvaluationRoutes(
  service: EvaluationService,
  options: EvaluationRouteOptions = {},
): Hono<EvaluationRouteEnvironment> {
  const routes = new Hono<EvaluationRouteEnvironment>();

  routes.get("/plans/:planId/export.csv", async (context) => {
    const csv = await evaluationPlanCsv(service, actor(context), context.req.param("planId"));
    const filename = `evaluation-${context.req.param("planId").replace(/[^a-z0-9_-]/giu, "-")}.csv`;
    return context.body(csv, 200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    });
  });
  routes.get("/reviewer/workspace", async (context) => {
    const eventId = context.req.query("eventId");
    return context.json({
      data: await service.listReviewerWorkspace(
        actor(context),
        eventId === undefined ? undefined : eventId,
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

  routes.post("/plans/:planId/open", async (context) => {
    const body = versionSchema.parse(await context.req.json());
    return context.json(
      await service.openPlan(actor(context), context.req.param("planId"), body.expectedVersion),
    );
  });

  routes.post("/plans/:planId/close", async (context) => {
    const body = versionSchema.parse(await context.req.json());
    return context.json(
      await service.closePlan(actor(context), context.req.param("planId"), body.expectedVersion),
    );
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
    const [plan, assignments] = await Promise.all([
      service.getPlan(currentActor, context.req.param("planId")),
      service.listOrganizerAssignments(currentActor, context.req.param("planId")),
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
    const result = await options.reminders.sendOutstandingReviewerReminders(currentActor, {
      planId: plan.id,
      ...(body.roundId === undefined ? {} : { roundId: body.roundId }),
      reviewerIds: [...new Set(selected.map((assignment) => assignment.reviewerId))].sort(),
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

  routes.get("/plans/:planId/assignments", async (context) =>
    context.json({
      assignments: await service.listOrganizerAssignments(
        actor(context),
        context.req.param("planId"),
      ),
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
      await service.resolveAiSuggestion(actor(context), context.req.param("suggestionId"), body),
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
    throw error;
  });

  return routes;
}
