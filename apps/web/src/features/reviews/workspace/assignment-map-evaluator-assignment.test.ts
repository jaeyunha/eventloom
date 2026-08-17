import { describe, expect, it } from "vitest";
import type { ApiReviewContext } from "./api-api-review-context";
import type { ApiReviewerWorkspacePlan } from "./api-api-reviewer-workspace-plan";
import { mapEvaluatorAssignment } from "./assignment-map-evaluator-assignment";

const plan = {
  id: "plan-dropdown",
  organizationId: "organization-dropdown",
  eventId: "event-dropdown",
  name: "Dropdown review",
  status: "open",
  blindReview: false,
  closesAt: "2099-08-20T00:00:00.000Z",
  createdAt: "2026-08-17T00:00:00.000Z",
} satisfies ApiReviewerWorkspacePlan;

const context = {
  assignment: {
    id: "assignment-dropdown",
    eventId: "event-dropdown",
    planId: "plan-dropdown",
    submissionId: "submission-dropdown",
    roundId: "round-dropdown",
    reviewerId: "reviewer-dropdown",
    status: "in_progress",
    version: 1,
  },
  round: {
    id: "round-dropdown",
    name: "Dropdown round",
    sequence: 1,
    revision: 1,
    rubricRevision: 1,
    opensAt: "2026-08-17T00:00:00.000Z",
    closesAt: "2099-08-20T00:00:00.000Z",
    blindReview: false,
    anonymization: "none",
    rubric: {
      id: "rubric-dropdown",
      name: "Dropdown rubric",
      criteria: [
        {
          id: "recommendation",
          label: "Recommendation",
          description: "Choose the configured recommendation.",
          inputType: "dropdown",
          minimum: 1,
          maximum: 3,
          weight: 1,
          required: true,
          options: [
            { label: "Advance", value: "advance" },
            { label: "Hold", value: "hold" },
            { label: "Reject", value: "reject" },
          ],
        },
      ],
    },
  },
  submission: {
    id: "submission-dropdown",
    title: "Dropdown submission",
    abstract: "A concrete delivery plan and audience outcome.",
  },
  review: null,
  rubricRevision: 1,
  submissionRevision: 1,
  suggestions: [
    {
      id: "suggestion-dropdown",
      status: "pending",
      version: 1,
      rubricRevision: 1,
      submissionRevision: 1,
      candidates: {
        recommendation: [
          {
            id: "candidate-dropdown",
            criterionId: "recommendation",
            value: 3,
            evidence: ["A concrete delivery plan and audience outcome."],
          },
        ],
      },
      provenance: {
        provider: "openai-responses",
        model: "gpt-test",
        sourceReferences: ["abstract"],
      },
    },
  ],
} satisfies ApiReviewContext;

describe("mapEvaluatorAssignment", () => {
  it("preserves pending dropdown suggestions from the reviewer API", () => {
    expect(mapEvaluatorAssignment(plan, context).aiSuggestions).toEqual({
      recommendation: {
        value: 3,
        evidence: ["A concrete delivery plan and audience outcome."],
      },
    });
  });
});
