import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { InMemoryEvaluationRepository, InMemorySubmissionReviewSource } from "./repository";
import { createEvaluationRoutes, type EvaluationRouteEnvironment } from "./routes";
import { EvaluationService } from "./service";
import type { EvaluationActor } from "./types";

const organizer: EvaluationActor = {
  tenantId: "tenant-1",
  userId: "organizer-1",
  kind: "human",
  grants: [{ eventId: "event-1", role: "organizer" }],
};

const reviewer: EvaluationActor = {
  tenantId: "tenant-1",
  userId: "reviewer-1",
  kind: "human",
  grants: [{ eventId: "event-1", role: "reviewer" }],
};

function createTestApp() {
  const repository = new InMemoryEvaluationRepository();
  const source = new InMemorySubmissionReviewSource([
    {
      id: "submission-1",
      tenantId: "tenant-1",
      eventId: "event-1",
      title: "Blind proposal",
      abstract: "Proposal details",
      answers: { identity: "Hidden", topic: "Visible" },
      identityFieldIds: ["identity"],
      participants: [
        {
          id: "participant-1",
          displayName: "Hidden Person",
          email: "hidden@example.com",
          biography: "Hidden biography",
        },
      ],
    },
  ]);
  const service = new EvaluationService(repository, source, {
    clock: () => new Date("2026-08-08T12:00:00.000Z"),
  });
  const app = new Hono<EvaluationRouteEnvironment>();
  app.use("*", async (context, next) => {
    context.set(
      "evaluationActor",
      context.req.header("x-test-actor") === "reviewer" ? reviewer : organizer,
    );
    await next();
  });
  app.route("/evaluations", createEvaluationRoutes(service));
  return app;
}

async function jsonRequest(
  app: ReturnType<typeof createTestApp>,
  path: string,
  method: "POST" | "PUT",
  body: unknown,
  actor = "organizer",
) {
  return app.request(path, {
    method,
    headers: { "content-type": "application/json", "x-test-actor": actor },
    body: JSON.stringify(body),
  });
}

const planRequest = {
  id: "plan-1",
  eventId: "event-1",
  name: "Committee",
  blindReview: true,
  closesAt: "2026-08-12T12:00:00.000Z",
  assignmentRule: { reviewsPerSubmission: 1, maxAssignmentsPerReviewer: 5 },
  rounds: [
    {
      id: "round-1",
      name: "Round one",
      sequence: 1,
      closesAt: "2026-08-11T12:00:00.000Z",
      rubric: {
        id: "rubric-1",
        name: "Rubric",
        criteria: [
          {
            id: "quality",
            label: "Quality",
            description: "Proposal quality",
            minimum: 1,
            maximum: 5,
            weight: 1,
            required: true,
          },
        ],
      },
    },
  ],
};

describe("evaluation HTTP routes", () => {
  it("exposes the plan, assignment, and blind reviewer flow", async () => {
    const app = createTestApp();
    const created = await jsonRequest(app, "/evaluations/plans", "POST", planRequest);
    const opened = await jsonRequest(app, "/evaluations/plans/plan-1/open", "POST", {
      expectedVersion: 1,
    });
    const assigned = await jsonRequest(app, "/evaluations/plans/plan-1/assignments", "POST", {
      roundId: "round-1",
      submissionId: "submission-1",
      reviewerIds: ["reviewer-1"],
    });
    const assignmentBody = (await assigned.json()) as {
      assignments: Array<{ id: string }>;
    };
    const mine = await app.request("/evaluations/plans/plan-1/assignments/mine", {
      headers: { "x-test-actor": "reviewer" },
    });
    const mineBody = (await mine.json()) as { assignments: Array<{ reviewerId: string }> };
    const context = await app.request(
      `/evaluations/assignments/${assignmentBody.assignments[0]?.id}`,
      { headers: { "x-test-actor": "reviewer" } },
    );
    const body = (await context.json()) as {
      submission: { participants: unknown[]; answers: Record<string, unknown> };
    };

    expect(created.status).toBe(201);
    expect(opened.status).toBe(200);
    expect(assigned.status).toBe(201);
    expect(mine.status).toBe(200);
    expect(mineBody.assignments).toEqual([
      expect.objectContaining({ reviewerId: reviewer.userId }),
    ]);
    expect(context.status).toBe(200);
    expect(body.submission.participants).toEqual([]);
    expect(body.submission.answers).toEqual({ topic: "Visible" });
  });

  it("returns a stable safe error for malformed requests", async () => {
    const response = await jsonRequest(createTestApp(), "/evaluations/plans", "POST", {
      name: "Missing required fields",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "EVALUATION_INVALID_INPUT",
        message: "The evaluation request is invalid.",
      },
    });
  });
});
