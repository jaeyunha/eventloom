import { Hono } from "hono";
import { z, ZodError } from "zod";
import { EvaluationError, forbidden } from "./errors";
import type { EvaluationService } from "./service";
import type { EvaluationActor } from "./types";

export interface EvaluationRouteEnvironment {
  Variables: {
    evaluationActor: EvaluationActor;
  };
}

const criterionSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  minimum: z.number(),
  maximum: z.number(),
  weight: z.number(),
  required: z.boolean(),
});

const rubricSchema = z.object({
  id: z.string(),
  name: z.string(),
  criteria: z.array(criterionSchema),
});

const roundSchema = z.object({
  id: z.string(),
  name: z.string(),
  sequence: z.number(),
  closesAt: z.string().nullable(),
  rubric: rubricSchema,
});

const createPlanSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  name: z.string(),
  blindReview: z.boolean(),
  closesAt: z.string().nullable(),
  assignmentRule: z.object({
    reviewsPerSubmission: z.number(),
    maxAssignmentsPerReviewer: z.number(),
  }),
  rounds: z.array(roundSchema),
});

const versionSchema = z.object({ expectedVersion: z.number().int().positive() });

const assignmentSchema = z.object({
  roundId: z.string(),
  submissionId: z.string(),
  reviewerIds: z.array(z.string()),
});

const saveReviewSchema = z.object({
  scores: z.array(
    z.object({
      criterionId: z.string(),
      value: z.number(),
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

const conflictSchema = z.object({ reason: z.string() });

const decisionSchema = z.object({
  status: z.enum(["accepted", "waitlisted", "rejected"]),
  reason: z.string(),
  idempotencyKey: z.string(),
  expectedVersion: z.number().int().positive().optional(),
});

function actor(context: { get(name: "evaluationActor"): EvaluationActor }): EvaluationActor {
  const current = context.get("evaluationActor");
  if (current === undefined) {
    throw forbidden("Evaluation authentication is required.");
  }
  return current;
}

export function createEvaluationRoutes(service: EvaluationService): Hono<EvaluationRouteEnvironment> {
  const routes = new Hono<EvaluationRouteEnvironment>();

  routes.post("/plans", async (context) => {
    const plan = await service.createPlan(actor(context), createPlanSchema.parse(await context.req.json()));
    return context.json(plan, 201);
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

  routes.post("/plans/:planId/assignments", async (context) => {
    const body = assignmentSchema.parse(await context.req.json());
    const assignments = await service.assignReviewers(actor(context), {
      planId: context.req.param("planId"),
      ...body,
    });
    return context.json({ assignments }, 201);
  });

  routes.get("/plans/:planId/assignments/mine", async (context) =>
    context.json({
      assignments: await service.listReviewerAssignments(
        actor(context),
        context.req.param("planId"),
      ),
    }),
  );

  routes.get("/assignments/:assignmentId", async (context) =>
    context.json(
      await service.getReviewContext(actor(context), context.req.param("assignmentId")),
    ),
  );

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
      await service.declareConflict(
        actor(context),
        context.req.param("assignmentId"),
        body.reason,
      ),
      201,
    );
  });

  routes.get(
    "/plans/:planId/rounds/:roundId/submissions/:submissionId/reviews",
    async (context) =>
      context.json({
        reviews: await service.listSubmittedReviews(
          actor(context),
          context.req.param("planId"),
          context.req.param("roundId"),
          context.req.param("submissionId"),
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
      return context.json(
        { error: { code: error.code, message: error.message } },
        error.status,
      );
    }
    throw error;
  });

  return routes;
}
