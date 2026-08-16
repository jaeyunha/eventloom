import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  type EvaluatorAssignment,
  ReviewWorkspace,
  type RubricCriterion,
} from "./review-workspace";

const criteria: readonly RubricCriterion[] = [
  {
    id: "impact",
    label: "Audience impact",
    description: "A useful outcome for attendees.",
    minimum: 1,
    maximum: 5,
    weight: 1,
    required: true,
  },
];

function assignment(id = "assignment-1"): EvaluatorAssignment {
  return {
    eventId: "event-1",
    eventName: "Open Source Summit",
    planId: "plan-1",
    planName: "Program review",
    reviewVersion: undefined,
    initialScores: {},
    initialResponses: {},
    initialConfirmed: [],
    initialComment: "",
    submittedAt: null,
    id,
    reference: "SUB-001",
    title: "Resilient public systems",
    abstract: "A practical session about resilient public systems.",
    round: {
      id: "round-1",
      name: "Committee review",
      status: "open",
      opensAt: "Aug 10, 2026",
      closesAt: "Aug 18, 2026",
      completionPercent: 0,
      blindReview: true,
      rubric: { name: "Program rubric", criteria },
    },
    assignmentStatus: "assigned",
    aiSuggestions: {},
    suggestions: [],
  };
}

describe("evaluator workspace composition", () => {
  it("uses the shared list-detail geometry and unified status vocabulary for the queue", () => {
    const markup = renderToStaticMarkup(
      createElement(ReviewWorkspace, {
        mode: "evaluator",
        initialState: { queue: [{ assignment: assignment() }] },
      }),
    );

    expect(markup).toContain('aria-label="Assigned reviews"');
    expect(markup).toContain('aria-label="Reviewer queue guidance"');
    expect(markup).toContain('data-tone="warning"');
    expect(markup).toContain("Needs review");
  });

  it("uses shared progress and sticky action primitives for one scorecard action bar", () => {
    const markup = renderToStaticMarkup(
      createElement(ReviewWorkspace, {
        eventId: "event-1",
        mode: "evaluator",
        initialState: { assignment: assignment() },
      }),
    );

    expect(markup).toContain("Rubric progress");
    expect(markup).toContain('aria-valuemax="1"');
    expect(markup).toContain('aria-valuenow="0"');
    expect(markup.match(/aria-label="Workspace actions"/gu)).toHaveLength(1);
    expect(markup).toContain("Submit review");
  });

  it("marks a scheduled round lock with its exact opening instant", () => {
    const scheduledAssignment: EvaluatorAssignment = {
      ...assignment(),
      round: {
        ...assignment().round,
        status: "scheduled",
        opensAt: "Aug 17, 2026, 8:24 AM UTC",
        opensAtIso: "2026-08-17T08:24:00.000Z",
      },
    };
    const markup = renderToStaticMarkup(
      createElement(ReviewWorkspace, {
        eventId: "event-1",
        mode: "evaluator",
        initialState: { assignment: scheduledAssignment },
      }),
    );

    expect(markup).toContain('data-round-availability="scheduled"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('id="round-availability-notice"');
    expect(markup).toContain('dateTime="2026-08-17T08:24:00.000Z"');
    expect(markup).toContain('aria-describedby="round-availability-notice"');
  });

  it("keeps the evaluator refinement block on semantic design tokens", () => {
    const css = readFileSync(
      fileURLToPath(new URL("./review-workspace.module.css", import.meta.url)),
      "utf8",
    );
    const refinement = css.split("/* Evaluator workspace refinement */")[1] ?? "";

    expect(refinement.length).toBeGreaterThan(0);
    expect(refinement).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
    expect(refinement).not.toMatch(/\brgba?\(/u);
    expect(refinement).toContain("var(--space-");
    expect(refinement).toContain("var(--background)");
    expect(refinement).toContain("var(--card)");
  });
});
