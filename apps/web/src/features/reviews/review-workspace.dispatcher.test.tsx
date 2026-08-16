import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  type EvaluatorAssignment,
  type ReviewPlanSeed,
  ReviewWorkspace,
  type RubricCriterion,
} from "./review-workspace";

const criterion: RubricCriterion = {
  id: "impact",
  label: "Impact",
  description: "Audience value.",
  minimum: 1,
  maximum: 5,
  weight: 1,
  required: true,
};

function evaluatorAssignment(): EvaluatorAssignment {
  return {
    eventId: "event-1",
    eventName: "Summit",
    planId: "plan-1",
    planName: "Review plan",
    reviewVersion: undefined,
    initialScores: {},
    initialResponses: {},
    initialConfirmed: [],
    initialComment: "",
    submittedAt: null,
    id: "assignment-1",
    reference: "SUB-1",
    title: "Evaluator proposal",
    abstract: "Evaluator abstract.",
    round: {
      id: "round-1",
      name: "Review round",
      status: "open",
      opensAt: "Aug 1, 2026",
      closesAt: "Aug 10, 2026",
      completionPercent: 0,
      rubric: { name: "Rubric", criteria: [criterion] },
    },
    aiSuggestions: {},
    suggestions: [],
  };
}

function organizerSeed(): ReviewPlanSeed {
  const assignment = evaluatorAssignment();
  return {
    planId: assignment.planId,
    version: 1,
    decisionBySubmission: {},
    eventId: assignment.eventId,
    eventName: assignment.eventName,
    planName: assignment.planName,
    status: "draft",
    opensAt: "Aug 1, 2026",
    closesAt: "Aug 10, 2026",
    blindReview: false,
    assignmentRule: { reviewsPerSubmission: 1, maxAssignmentsPerReviewer: 5 },
    rounds: [assignment.round],
    aggregates: [],
    submittedReviews: [],
    assignments: [],
    progress: {
      totalAssignments: 0,
      assigned: 0,
      inProgress: 0,
      submitted: 0,
      abstained: 0,
      conflicts: 0,
      completionPercent: 0,
      reviewers: [],
    },
  };
}

describe("review workspace public dispatcher", () => {
  it("keeps organizer and evaluator projections isolated at the public boundary", () => {
    const organizer = renderToStaticMarkup(
      createElement(ReviewWorkspace, {
        eventId: "event-1",
        mode: "organizer",
        initialState: { organizer: organizerSeed() },
      }),
    );
    const evaluator = renderToStaticMarkup(
      createElement(ReviewWorkspace, {
        eventId: "event-1",
        mode: "evaluator",
        initialState: { assignment: evaluatorAssignment() },
      }),
    );

    expect(organizer).toContain("Organizer review");
    expect(organizer).not.toContain("Only your assigned submission is available");
    expect(evaluator).toContain("Only your assigned submission is available");
    expect(evaluator).not.toContain("Create evaluation plan");
  });
});
