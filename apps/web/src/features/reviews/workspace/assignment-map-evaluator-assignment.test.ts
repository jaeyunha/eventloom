import { describe, expect, it } from "vitest";
import type { ApiReviewContext } from "./api-api-review-context";
import type { ApiReviewerWorkspacePlan } from "./api-api-reviewer-workspace-plan";
import { mapEvaluatorAssignment } from "./assignment-map-evaluator-assignment";

describe("mapEvaluatorAssignment", () => {
  it("uses exact No title when the canonical title is the submission identifier", () => {
    const plan: ApiReviewerWorkspacePlan = {
      id: "plan-internal",
      organizationId: "organization-internal",
      eventId: "event-internal",
      name: "Program review",
      status: "open",
      blindReview: true,
      closesAt: null,
      createdAt: "2026-08-17T00:00:00.000Z",
    };
    const context: ApiReviewContext = {
      assignment: {
        id: "assignment-internal",
        eventId: plan.eventId,
        planId: plan.id,
        submissionId: "submission-internal",
        roundId: "round-internal",
        reviewerId: "reviewer-internal",
        status: "assigned",
        version: 1,
      },
      round: {
        id: "round-internal",
        name: "Main review",
        sequence: 1,
        closesAt: null,
        rubric: {
          id: "rubric-internal",
          name: "Program rubric",
          criteria: [],
        },
      },
      submission: {
        id: "submission-internal",
        title: "submission-internal",
        abstract: "A proposal whose stored title is its canonical identifier.",
      },
      review: null,
    };

    const assignment = mapEvaluatorAssignment(plan, context);

    expect(assignment.title).toBe("No title");
    expect(assignment.title).not.toBe(context.submission.id);
  });
});
