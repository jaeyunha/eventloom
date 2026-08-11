import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { InMemoryEvaluationRepository, InMemorySubmissionReviewSource } from "./repository";
import {
  createEvaluationRoutes,
  type EvaluationRouteEnvironment,
  type EvaluationRouteOptions,
} from "./routes";
import {
  type EvaluationDecisionProjectionInput,
  EvaluationService,
  type EvaluationServiceOptions,
} from "./service";
import type { EvaluationActor, SubmissionReviewMaterial } from "./types";

const organizer: EvaluationActor = {
  tenantId: "tenant-1",
  userId: "organizer-1",
  kind: "human",
  grants: [
    { eventId: "event-1", role: "organizer" },
    { eventId: "event-2", role: "organizer" },
  ],
};

const reviewer: EvaluationActor = {
  tenantId: "tenant-1",
  userId: "reviewer-1",
  kind: "human",
  grants: [{ eventId: "event-1", role: "reviewer" }],
};
const samReviewer: EvaluationActor = {
  ...reviewer,
  userId: "sam-whitfield",
};
const otherTenantOrganizer: EvaluationActor = {
  tenantId: "tenant-2",
  userId: "organizer-2",
  kind: "human",
  grants: [{ eventId: "event-1", role: "organizer" }],
};

function createTestApp(
  serviceOptions: EvaluationServiceOptions = {},
  routeOptions: EvaluationRouteOptions = {},
  submissionMaterials: readonly SubmissionReviewMaterial[] = [
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
  ],
) {
  const repository = new InMemoryEvaluationRepository();
  const source = new InMemorySubmissionReviewSource(submissionMaterials);
  const service = new EvaluationService(repository, source, {
    clock: () => new Date("2026-08-08T12:00:00.000Z"),
    ...serviceOptions,
  });
  const app = new Hono<EvaluationRouteEnvironment>();
  app.use("*", async (context, next) => {
    const actorHeader = context.req.header("x-test-actor");
    context.set(
      "evaluationActor",
      actorHeader === "reviewer"
        ? reviewer
        : actorHeader === "sam"
          ? samReviewer
          : actorHeader === "other-tenant"
            ? otherTenantOrganizer
            : organizer,
    );
    await next();
  });
  app.route("/evaluations", createEvaluationRoutes(service, routeOptions));
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
  reviewerProjection: { fieldIds: ["topic"], fileIds: [] },
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
  it("creates the first draft from the canonical plan DTO without a seeded fallback", async () => {
    const app = createTestApp();
    const before = await app.request("/evaluations/plans?eventId=event-1");
    const beforeBody = (await before.json()) as { plans: readonly unknown[] };

    const response = await jsonRequest(app, "/evaluations/plans", "POST", planRequest);
    const body = (await response.json()) as {
      id: string;
      eventId: string;
      name: string;
      status: string;
      blindReview: boolean;
      closesAt: string | null;
      assignmentRule: typeof planRequest.assignmentRule;
      rounds: typeof planRequest.rounds;
    };

    expect(before.status).toBe(200);
    expect(beforeBody.plans).toEqual([]);
    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      ...planRequest,
      status: "draft",
      version: 1,
    });
  });
  it("lists plans by event without crossing tenant boundaries", async () => {
    const app = createTestApp();
    const eventOne = await jsonRequest(app, "/evaluations/plans", "POST", planRequest);
    const eventTwo = await jsonRequest(app, "/evaluations/plans", "POST", {
      ...planRequest,
      id: "plan-2",
      eventId: "event-2",
      name: "Second event",
    });
    const otherTenant = await jsonRequest(
      app,
      "/evaluations/plans",
      "POST",
      { ...planRequest, id: "plan-other-tenant" },
      "other-tenant",
    );

    const response = await app.request("/evaluations/plans?eventId=event-1");
    const body = (await response.json()) as {
      plans: Array<{ id: string; tenantId: string; eventId: string }>;
    };

    expect(eventOne.status).toBe(201);
    expect(eventTwo.status).toBe(201);
    expect(otherTenant.status).toBe(201);
    expect(response.status).toBe(200);
    expect(body.plans).toEqual([
      expect.objectContaining({
        id: "plan-1",
        tenantId: "tenant-1",
        eventId: "event-1",
      }),
    ]);
  });
  it("lists seeded submissions for the organizer event", async () => {
    const response = await createTestApp().request("/evaluations/events/event-1/submissions");
    const body = (await response.json()) as Array<{ id: string; eventId: string; status: string }>;

    expect(response.status).toBe(200);
    expect(body).toEqual([
      expect.objectContaining({
        id: "submission-1",
        eventId: "event-1",
        status: "submitted",
      }),
    ]);
  });
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
  it("deletes an outstanding assignment with a 204 empty response", async () => {
    const app = createTestApp();
    await jsonRequest(app, "/evaluations/plans", "POST", planRequest);
    await jsonRequest(app, "/evaluations/plans/plan-1/open", "POST", { expectedVersion: 1 });
    const assigned = await jsonRequest(app, "/evaluations/plans/plan-1/assignments", "POST", {
      roundId: "round-1",
      submissionId: "submission-1",
      reviewerIds: ["reviewer-1"],
    });
    const assignmentId = ((await assigned.json()) as { assignments: Array<{ id: string }> })
      .assignments[0]?.id;
    if (assignmentId === undefined) throw new Error("Expected an assignment fixture.");

    const removed = await app.request(`/evaluations/plans/plan-1/assignments/${assignmentId}`, {
      method: "DELETE",
    });
    expect(removed.status).toBe(204);
    expect(await removed.text()).toBe("");

    const listed = await app.request("/evaluations/plans/plan-1/assignments");
    await expect(listed.json()).resolves.toEqual({ assignments: [] });
  });

  it("rejects forbidden and submitted assignment deletions safely", async () => {
    const app = createTestApp();
    await jsonRequest(app, "/evaluations/plans", "POST", planRequest);
    await jsonRequest(app, "/evaluations/plans/plan-1/open", "POST", { expectedVersion: 1 });
    const assigned = await jsonRequest(app, "/evaluations/plans/plan-1/assignments", "POST", {
      roundId: "round-1",
      submissionId: "submission-1",
      reviewerIds: ["reviewer-1"],
    });
    const assignmentId = ((await assigned.json()) as { assignments: Array<{ id: string }> })
      .assignments[0]?.id;
    if (assignmentId === undefined) throw new Error("Expected an assignment fixture.");
    const path = `/evaluations/plans/plan-1/assignments/${assignmentId}`;

    const forbidden = await app.request(path, {
      method: "DELETE",
      headers: { "x-test-actor": "reviewer" },
    });
    expect(forbidden.status).toBe(403);
    await expect(forbidden.json()).resolves.toMatchObject({
      error: { code: "EVALUATION_FORBIDDEN" },
    });

    const saved = await jsonRequest(
      app,
      `/evaluations/assignments/${assignmentId}/review`,
      "PUT",
      { scores: [{ criterionId: "quality", value: 4, origin: "human" }] },
      "reviewer",
    );
    const savedBody = (await saved.json()) as { version: number };
    await jsonRequest(
      app,
      `/evaluations/assignments/${assignmentId}/review/submit`,
      "POST",
      { expectedVersion: savedBody.version },
      "reviewer",
    );

    const submitted = await app.request(path, { method: "DELETE" });
    expect(submitted.status).toBe(409);
    await expect(submitted.json()).resolves.toMatchObject({
      error: { code: "EVALUATION_CONFLICT" },
    });
  });
  it("loads the authenticated reviewer workspace in one redacted batch", async () => {
    const app = createTestApp({}, {}, [
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
      {
        id: "submission-2",
        tenantId: "tenant-1",
        eventId: "event-1",
        title: "Second proposal",
        abstract: "Second details",
        answers: { identity: "Other hidden", topic: "Second visible" },
        identityFieldIds: ["identity"],
        participants: [
          {
            id: "participant-2",
            displayName: "Other Hidden Person",
            email: "other-hidden@example.com",
            biography: "Other hidden biography",
          },
        ],
      },
    ]);
    await jsonRequest(app, "/evaluations/plans", "POST", {
      ...planRequest,
      assignmentRule: { reviewsPerSubmission: 2, maxAssignmentsPerReviewer: 5 },
    });
    await jsonRequest(app, "/evaluations/plans/plan-1/open", "POST", { expectedVersion: 1 });
    await jsonRequest(app, "/evaluations/plans/plan-1/assignments", "POST", {
      roundId: "round-1",
      submissionId: "submission-1",
      reviewerIds: ["reviewer-1"],
    });
    await jsonRequest(app, "/evaluations/plans/plan-1/assignments", "POST", {
      roundId: "round-1",
      submissionId: "submission-2",
      reviewerIds: ["reviewer-1", "reviewer-2"],
    });

    const assignmentId = "plan-1:round-1:submission-1:reviewer-1";
    const saved = await jsonRequest(
      app,
      `/evaluations/assignments/${assignmentId}/review`,
      "PUT",
      {
        scores: [{ criterionId: "quality", value: 4, origin: "human" }],
        comment: "Ready for committee.",
      },
      "reviewer",
    );
    await jsonRequest(
      app,
      `/evaluations/assignments/${assignmentId}/review/submit`,
      "POST",
      { expectedVersion: 1 },
      "reviewer",
    );

    const batch = await app.request("/evaluations/reviewer/workspace?eventId=event-1", {
      headers: { "x-test-actor": "reviewer" },
    });
    const body = (await batch.json()) as {
      data: {
        assignments: Array<{
          assignment: { id: string; reviewerId: string; status: string };
          plan: { name: string };
          submission: {
            title: string;
            participants: unknown[];
            answers: Record<string, unknown>;
          };
          review: { comment: string } | null;
        }>;
      };
    };
    const organizerBatch = await app.request("/evaluations/reviewer/workspace?eventId=event-1");
    const otherEventBatch = await app.request("/evaluations/reviewer/workspace?eventId=event-2", {
      headers: { "x-test-actor": "reviewer" },
    });
    const emptyBatch = await createTestApp().request(
      "/evaluations/reviewer/workspace?eventId=event-1",
      { headers: { "x-test-actor": "reviewer" } },
    );

    expect(saved.status).toBe(200);
    expect(batch.status).toBe(200);
    expect(body.data.assignments).toHaveLength(2);
    expect(
      body.data.assignments.every((entry) => entry.assignment.reviewerId === reviewer.userId),
    ).toBe(true);
    expect(body.data.assignments.map((entry) => entry.assignment.status)).toContain("submitted");
    expect(body.data.assignments[0]?.plan.name).toBe("Committee");
    expect(body.data.assignments[0]?.submission.title).toBe("Blind proposal");
    expect(body.data.assignments[0]?.submission.participants).toEqual([]);
    expect(body.data.assignments[0]?.submission.answers).toEqual({ topic: "Visible" });
    expect(body.data.assignments[0]?.review?.comment).toBe("Ready for committee.");
    expect(organizerBatch.status).toBe(403);
    expect(otherEventBatch.status).toBe(403);
    expect(emptyBatch.status).toBe(200);
    await expect(emptyBatch.json()).resolves.toEqual({ data: { assignments: [] } });
  });
  it("returns the organizer workspace snapshot and validates event scope", async () => {
    const app = createTestApp();
    const missingEvent = await app.request("/evaluations/organizer/workspace");
    expect(missingEvent.status).toBe(400);
    await expect(missingEvent.json()).resolves.toMatchObject({
      error: { code: "EVALUATION_INVALID_INPUT" },
    });

    await jsonRequest(app, "/evaluations/plans", "POST", planRequest);
    await jsonRequest(app, "/evaluations/plans/plan-1/open", "POST", { expectedVersion: 1 });
    await jsonRequest(app, "/evaluations/plans/plan-1/assignments", "POST", {
      roundId: "round-1",
      submissionId: "submission-1",
      reviewerIds: ["reviewer-1"],
    });

    const response = await app.request(
      "/evaluations/organizer/workspace?eventId=event-1&planId=plan-1",
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: {
        plan: { id: string };
        submissions: readonly { id: string }[];
        assignments: readonly { planId: string; submissionId: string }[];
        progress: { planId: string };
        aggregates: readonly { planId: string; roundId: string }[];
        decisions: Record<string, unknown>;
      };
    };
    expect(body.data.plan.id).toBe("plan-1");
    expect(body.data.submissions.map((entry) => entry.id)).toEqual(["submission-1"]);
    expect(body.data.assignments).toEqual([
      expect.objectContaining({ planId: "plan-1", submissionId: "submission-1" }),
    ]);
    expect(body.data.progress.planId).toBe("plan-1");
    expect(body.data.aggregates).toEqual([
      expect.objectContaining({ planId: "plan-1", roundId: "round-1" }),
    ]);
    expect(body.data.decisions).toEqual({});
  });
  it("moves Sam from 0/2 to 2/2 with two blind, complete scorecards", async () => {
    const submissions: readonly SubmissionReviewMaterial[] = [
      {
        id: "submission-sam-1",
        tenantId: "tenant-1",
        eventId: "event-1",
        title: "First blind proposal",
        abstract: "First proposal details",
        answers: { identity: "First hidden identity", topic: "First visible topic" },
        identityFieldIds: ["identity"],
        participants: [
          {
            id: "participant-sam-1",
            displayName: "First Hidden Person",
            email: "first-hidden@example.com",
            biography: "First hidden biography",
          },
        ],
      },
      {
        id: "submission-sam-2",
        tenantId: "tenant-1",
        eventId: "event-1",
        title: "Second blind proposal",
        abstract: "Second proposal details",
        answers: { identity: "Second hidden identity", topic: "Second visible topic" },
        identityFieldIds: ["identity"],
        participants: [
          {
            id: "participant-sam-2",
            displayName: "Second Hidden Person",
            email: "second-hidden@example.com",
            biography: "Second hidden biography",
          },
        ],
      },
    ];
    const app = createTestApp({}, {}, submissions);
    const round = planRequest.rounds[0];
    const qualityCriterion = round?.rubric.criteria[0];
    if (round === undefined || qualityCriterion === undefined) {
      throw new Error("The route fixture must include an initial round and criterion.");
    }
    const created = await jsonRequest(app, "/evaluations/plans", "POST", {
      ...planRequest,
      assignmentRule: { reviewsPerSubmission: 1, maxAssignmentsPerReviewer: 2 },
      rounds: [
        {
          ...round,
          reviewerPool: { reviewerIds: [samReviewer.userId], name: "Sam review pool" },
          rubric: {
            ...round.rubric,
            criteria: [
              qualityCriterion,
              {
                id: "recommendation",
                label: "Recommendation",
                description: "Committee recommendation",
                minimum: 1,
                maximum: 3,
                weight: 1,
                required: true,
                inputType: "dropdown",
                options: [
                  { id: "accept", label: "Accept", value: "accept" },
                  { id: "maybe", label: "Maybe", value: "maybe" },
                  { id: "reject", label: "Reject", value: "reject" },
                ],
              },
              {
                id: "evidence",
                label: "Evidence",
                description: "Written evidence for the scorecard.",
                minimum: 0,
                maximum: 1,
                weight: 1,
                required: true,
                inputType: "free_text",
              },
            ],
          },
        },
      ],
    });
    expect(created.status).toBe(201);
    await jsonRequest(app, "/evaluations/plans/plan-1/open", "POST", {
      expectedVersion: 1,
    });

    for (const submission of submissions) {
      const assigned = await jsonRequest(app, "/evaluations/plans/plan-1/assignments", "POST", {
        roundId: "round-1",
        submissionId: submission.id,
        reviewerIds: [samReviewer.userId],
      });
      expect(assigned.status).toBe(201);
    }

    const assignmentsResponse = await app.request("/evaluations/plans/plan-1/assignments");
    const assignmentsBody = (await assignmentsResponse.json()) as {
      assignments: Array<{ id: string; reviewerId: string; submissionId: string }>;
    };
    expect(assignmentsBody.assignments).toHaveLength(2);
    expect(assignmentsBody.assignments.map((assignment) => assignment.reviewerId)).toEqual([
      samReviewer.userId,
      samReviewer.userId,
    ]);
    expect(
      new Set(assignmentsBody.assignments.map((assignment) => assignment.submissionId)),
    ).toEqual(new Set(["submission-sam-1", "submission-sam-2"]));

    const initialProgressResponse = await app.request("/evaluations/plans/plan-1/progress");
    const initialProgress = (await initialProgressResponse.json()) as {
      total: number;
      submitted: number;
      reviewers: Array<{
        reviewerId: string;
        assigned: number;
        submitted: number;
        outstanding: number;
        completionPercent: number;
      }>;
    };
    expect(initialProgress).toMatchObject({ total: 2, submitted: 0 });
    expect(initialProgress.reviewers).toEqual([
      expect.objectContaining({
        reviewerId: samReviewer.userId,
        assigned: 2,
        submitted: 0,
        outstanding: 2,
        completionPercent: 0,
      }),
    ]);

    const reviewerWorkspace = await app.request("/evaluations/reviewer/workspace?eventId=event-1", {
      headers: { "x-test-actor": "sam" },
    });
    const reviewerWorkspaceBody = (await reviewerWorkspace.json()) as {
      data: {
        assignments: Array<{
          assignment: { id: string };
          submission: { answers: Record<string, unknown>; participants: unknown[] };
        }>;
      };
    };
    expect(reviewerWorkspaceBody.data.assignments).toHaveLength(2);
    expect(
      reviewerWorkspaceBody.data.assignments.every(
        (entry) =>
          entry.submission.participants.length === 0 &&
          !("identity" in entry.submission.answers) &&
          "topic" in entry.submission.answers,
      ),
    ).toBe(true);

    for (const assignment of assignmentsBody.assignments) {
      const saved = await jsonRequest(
        app,
        `/evaluations/assignments/${assignment.id}/review`,
        "PUT",
        {
          scores: [
            { criterionId: "quality", value: 4, origin: "human" },
            { criterionId: "recommendation", value: "accept", origin: "human" },
            {
              criterionId: "evidence",
              value: `Complete evidence for ${assignment.submissionId}.`,
              origin: "human",
            },
          ],
          comment: "Complete scorecard.",
        },
        "sam",
      );
      const savedBody = (await saved.json()) as { version: number };
      expect(saved.status).toBe(200);
      const submitted = await jsonRequest(
        app,
        `/evaluations/assignments/${assignment.id}/review/submit`,
        "POST",
        { expectedVersion: savedBody.version },
        "sam",
      );
      expect(submitted.status).toBe(200);
    }

    const completedProgressResponse = await app.request("/evaluations/plans/plan-1/progress");
    const completedProgress = (await completedProgressResponse.json()) as typeof initialProgress;
    expect(completedProgress).toMatchObject({ total: 2, submitted: 2 });
    expect(completedProgress.reviewers).toEqual([
      expect.objectContaining({
        reviewerId: samReviewer.userId,
        assigned: 2,
        submitted: 2,
        outstanding: 0,
        completionPercent: 100,
      }),
    ]);
  });
  it("persists canonical verified reviewer IDs and fails closed for aliases or other tenants", async () => {
    const reviewerIdentity: NonNullable<EvaluationRouteOptions["reviewerIdentity"]> = {
      resolveReviewerIds: async (actor, input) =>
        actor.tenantId === organizer.tenantId &&
        input.eventId === "event-1" &&
        input.reviewerIds.length === 1 &&
        input.reviewerIds[0] === reviewer.userId
          ? [reviewer.userId]
          : null,
    };
    const app = createTestApp({}, { reviewerIdentity });
    await jsonRequest(app, "/evaluations/plans", "POST", planRequest);
    await jsonRequest(app, "/evaluations/plans/plan-1/open", "POST", {
      expectedVersion: 1,
    });

    const assigned = await jsonRequest(app, "/evaluations/plans/plan-1/assignments", "POST", {
      roundId: "round-1",
      submissionId: "submission-1",
      reviewerIds: [reviewer.userId],
    });
    const body = (await assigned.json()) as {
      assignments: Array<{ reviewerId: string }>;
    };
    const mine = await app.request("/evaluations/plans/plan-1/assignments/mine", {
      headers: { "x-test-actor": "reviewer" },
    });
    const mineBody = (await mine.json()) as {
      assignments: Array<{ reviewerId: string }>;
    };

    expect(assigned.status).toBe(201);
    expect(body.assignments).toEqual([expect.objectContaining({ reviewerId: reviewer.userId })]);
    expect(mine.status).toBe(200);
    expect(mineBody.assignments).toEqual([
      expect.objectContaining({ reviewerId: reviewer.userId }),
    ]);

    for (const reviewerId of ["reviewer@example.com", "unverified-reviewer-1", "sam-whitfield"]) {
      const denied = await jsonRequest(app, "/evaluations/plans/plan-1/assignments", "POST", {
        roundId: "round-1",
        submissionId: "submission-1",
        reviewerIds: [reviewerId],
      });
      expect(denied.status).toBe(403);
      await expect(denied.json()).resolves.toMatchObject({
        error: { code: "EVALUATION_REVIEWER_NOT_FOUND" },
      });
    }

    const crossTenant = await jsonRequest(
      app,
      "/evaluations/plans/plan-1/assignments",
      "POST",
      {
        roundId: "round-1",
        submissionId: "submission-1",
        reviewerIds: [reviewer.userId],
      },
      "other-tenant",
    );
    expect(crossTenant.status).toBe(404);
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
  it("projects organizer decision outcomes through the decision route", async () => {
    const projected: EvaluationDecisionProjectionInput[] = [];
    const app = createTestApp({
      decisionProjection: {
        projectDecision: async (input) => {
          projected.push(structuredClone(input));
        },
      },
    });
    await jsonRequest(app, "/evaluations/plans", "POST", planRequest);
    await jsonRequest(app, "/evaluations/plans/plan-1/open", "POST", { expectedVersion: 1 });

    const accepted = await jsonRequest(
      app,
      "/evaluations/plans/plan-1/submissions/submission-1/decision",
      "PUT",
      {
        status: "accepted",
        reason: "Committee consensus",
        idempotencyKey: "route-decision-1",
      },
    );
    const acceptedBody = (await accepted.json()) as { version: number };
    const waitlisted = await jsonRequest(
      app,
      "/evaluations/plans/plan-1/submissions/submission-1/decision",
      "PUT",
      {
        status: "waitlisted",
        reason: "Capacity changed",
        idempotencyKey: "route-decision-2",
        expectedVersion: acceptedBody.version,
      },
    );
    const waitlistedBody = (await waitlisted.json()) as { version: number };
    const rejected = await jsonRequest(
      app,
      "/evaluations/plans/plan-1/submissions/submission-1/decision",
      "PUT",
      {
        status: "rejected",
        reason: "Program fit changed",
        idempotencyKey: "route-decision-3",
        expectedVersion: waitlistedBody.version,
      },
    );

    expect(accepted.status).toBe(200);
    expect(waitlisted.status).toBe(200);
    expect(rejected.status).toBe(200);
    expect(projected.map((input) => input.status)).toEqual(["accepted", "waitlisted", "rejected"]);
    expect(projected.map((input) => input.communication.templatePurpose)).toEqual([
      "decision_accepted",
      "decision_waitlisted",
      "decision_rejected",
    ]);
  });
  it("persists per-round pools and all scorecard input types", async () => {
    const app = createTestApp();
    const firstRound = planRequest.rounds[0];
    const firstCriterion = firstRound?.rubric.criteria[0];
    if (firstRound === undefined || firstCriterion === undefined) {
      throw new Error("The route fixture must include an initial round and criterion.");
    }
    const response = await jsonRequest(app, "/evaluations/plans", "POST", {
      ...planRequest,
      rounds: [
        {
          ...firstRound,
          opensAt: "2026-08-01T12:00:00.000Z",
          blindReview: true,
          anonymization: "double",
          reviewerPool: { reviewerIds: ["reviewer-1"], name: "Initial committee" },
          rubric: {
            ...firstRound.rubric,
            criteria: [
              firstCriterion,
              {
                id: "recommendation",
                label: "Recommendation",
                description: "Committee recommendation",
                minimum: 1,
                maximum: 3,
                weight: 1,
                required: true,
                inputType: "dropdown",
                options: [
                  { id: "accept", label: "Accept", value: "accept" },
                  { id: "maybe", label: "Maybe", value: "maybe" },
                  { id: "reject", label: "Reject", value: "reject" },
                ],
              },
              {
                id: "comments",
                label: "Comments",
                description: "Evidence",
                minimum: 0,
                maximum: 1,
                weight: 1,
                required: false,
                inputType: "free_text",
              },
            ],
          },
        },
        {
          ...firstRound,
          id: "round-2",
          name: "Final review",
          sequence: 2,
          opensAt: "2026-08-11T12:00:00.000Z",
          closesAt: "2026-08-12T12:00:00.000Z",
          reviewerPool: { reviewerIds: ["reviewer-2"], name: "Final committee" },
          rubric: {
            id: "rubric-2",
            name: "Finalist rubric",
            criteria: [
              {
                ...firstCriterion,
                id: "final-fit",
                label: "Final program fit",
                description: "Fit for the final program.",
              },
            ],
          },
        },
      ],
    });
    const planResponse = await app.request("/evaluations/plans/plan-1");
    const plan = (await planResponse.json()) as {
      rounds: Array<{
        id: string;
        opensAt?: string | null;
        closesAt: string | null;
        reviewerPool?: { reviewerIds: string[] };
        rubric: {
          id: string;
          criteria: Array<{ id: string; inputType?: string; options?: unknown[] }>;
        };
      }>;
    };

    expect(response.status).toBe(201);
    expect(planResponse.status).toBe(200);
    expect(plan.rounds[0]?.reviewerPool?.reviewerIds).toEqual(["reviewer-1"]);
    expect(plan.rounds[1]?.reviewerPool?.reviewerIds).toEqual(["reviewer-2"]);
    expect(plan.rounds[0]?.rubric.criteria.map((criterion) => criterion.inputType)).toEqual([
      undefined,
      "dropdown",
      "free_text",
    ]);
    expect(plan.rounds[0]?.rubric.criteria[1]?.options).toHaveLength(3);
    expect(plan.rounds.map((round) => [round.opensAt, round.closesAt])).toEqual([
      ["2026-08-01T12:00:00.000Z", "2026-08-11T12:00:00.000Z"],
      ["2026-08-11T12:00:00.000Z", "2026-08-12T12:00:00.000Z"],
    ]);
    expect(plan.rounds.map((round) => round.rubric.id)).toEqual(["rubric-1", "rubric-2"]);
    expect(plan.rounds[1]?.rubric.criteria.map((criterion) => criterion.id)).toEqual(["final-fit"]);

    await jsonRequest(app, "/evaluations/plans/plan-1/open", "POST", { expectedVersion: 1 });
    const outsidePool = await jsonRequest(app, "/evaluations/plans/plan-1/assignments", "POST", {
      roundId: "round-1",
      submissionId: "submission-1",
      reviewerIds: ["reviewer-2"],
    });
    expect(outsidePool.status).toBe(403);
  });

  it("exports a stable, formula-safe organizer CSV without crossing tenants", async () => {
    const getAggregate = vi.spyOn(EvaluationService.prototype, "getAggregate");
    const listAggregates = vi.spyOn(EvaluationService.prototype, "listAggregates");
    const app = createTestApp({}, {}, [
      {
        id: "submission-1",
        tenantId: "tenant-1",
        eventId: "event-1",
        title: "=2+3",
        abstract: "Proposal details",
        answers: { topic: "Visible" },
        identityFieldIds: [],
        participants: [
          {
            id: "participant-1",
            displayName: "@attacker",
            email: "participant@example.com",
            biography: "Participant biography",
          },
        ],
      },
    ]);
    await jsonRequest(app, "/evaluations/plans", "POST", planRequest);
    const first = await app.request("/evaluations/plans/plan-1/export.csv");
    const second = await app.request("/evaluations/plans/plan-1/export.csv");
    const otherTenant = await app.request("/evaluations/plans/plan-1/export.csv", {
      headers: { "x-test-actor": "other-tenant" },
    });
    const firstText = await first.text();
    const secondText = await second.text();

    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toContain("text/csv");
    expect(first.headers.get("content-disposition")).toContain("evaluation-plan-1.csv");
    expect(firstText).toBe(secondText);
    expect(firstText).toContain("submission_id,title,participants");
    expect(firstText).toContain("submission-1");
    expect(firstText).toContain("submission-1,'=2+3,'@attacker");
    expect(otherTenant.status).toBe(404);
    expect(getAggregate).not.toHaveBeenCalled();
    expect(listAggregates).toHaveBeenCalledTimes(2);
    getAggregate.mockRestore();
    listAggregates.mockRestore();
  });

  it("only sends outstanding reminders through the injected communications boundary", async () => {
    const calls: Array<{
      planId: string;
      reviewerIds: readonly string[];
      assignmentIds: readonly string[];
    }> = [];
    const app = createTestApp(
      {},
      {
        reminders: {
          sendOutstandingReviewerReminders: async (_actor, input) => {
            calls.push(input);
            return { queued: input.assignmentIds.length, reviewerIds: input.reviewerIds };
          },
        },
      },
    );
    await jsonRequest(app, "/evaluations/plans", "POST", planRequest);
    await jsonRequest(app, "/evaluations/plans/plan-1/open", "POST", { expectedVersion: 1 });
    await jsonRequest(app, "/evaluations/plans/plan-1/assignments", "POST", {
      roundId: "round-1",
      submissionId: "submission-1",
      reviewerIds: ["reviewer-1"],
    });
    const reminder = await jsonRequest(app, "/evaluations/plans/plan-1/reminders", "POST", {
      roundId: "round-1",
      reviewerIds: ["reviewer-1"],
    });
    const unavailable = await jsonRequest(
      createTestApp(),
      "/evaluations/plans/plan-1/reminders",
      "POST",
      { reviewerIds: ["reviewer-1"] },
    );

    expect(reminder.status).toBe(202);
    expect(await reminder.json()).toEqual({ queued: 1, reviewerIds: ["reviewer-1"] });
    expect(calls).toEqual([
      {
        planId: "plan-1",
        roundId: "round-1",
        reviewerIds: ["reviewer-1"],
        assignmentIds: ["plan-1:round-1:submission-1:reviewer-1"],
      },
    ]);
    expect(unavailable.status).toBe(503);
  });
});
