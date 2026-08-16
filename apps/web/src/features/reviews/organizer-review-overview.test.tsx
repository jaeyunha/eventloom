import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OrganizerReviewOverview, type OrganizerReviewRow } from "./organizer-review-overview";

function overviewRows(count: number): readonly OrganizerReviewRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `submission-${index + 1}`,
    reference: `SUB-${String(index + 1).padStart(3, "0")}`,
    title: `Submission ${index + 1}`,
    roundName: "Committee review",
    assignedReviewerCount: 2,
    expectedReviewerCount: 2,
    completedReviewCount: index % 2,
    expectedReviewCount: 2,
    weightedScoreLabel: index % 2 === 0 ? "—" : "4.2 / 5",
    conflictCount: 0,
    decisionLabel: "Not decided",
    attentionKind: index % 2 === 0 ? "completion" : "decision",
    attentionLabel: index % 2 === 0 ? "Reviews in progress" : "Ready for decision",
    reviewerDisplayNames: ["Morgan Chen", "Priya Shah"],
    manageable: true,
    attentionAction: {
      label: index % 2 === 0 ? "View reviewers" : "Review decision",
      target: index % 2 === 0 ? ("reviewers" as const) : ("decisions" as const),
    },
  }));
}

describe("OrganizerReviewOverview", () => {
  it("bounds a large review collection behind search and pagination", () => {
    const markup = renderToStaticMarkup(
      createElement(OrganizerReviewOverview, {
        planName: "Program review",
        planStatusLabel: "Open for review",
        description: "Committee review has 30 submissions in view.",
        metrics: [
          { label: "Reviewer coverage", value: "60/60", detail: "reviewer slots assigned" },
        ],
        completionPercent: 50,
        attentionSummary: {
          count: 30,
          label: "submissions need attention",
          description: "Use row actions to continue review operations.",
        },
        rows: overviewRows(30),
        onManageReviewers: vi.fn(),
        onOpenPlan: vi.fn(),
        onOpenReviewers: vi.fn(),
        onOpenDecisions: vi.fn(),
      }),
    );

    expect(markup).toContain("Search submissions");
    expect(markup).toContain('aria-label="Submission pagination"');
    expect(markup).toContain("Page 1 of 3");
    expect(markup).toContain("Submission 10");
    expect(markup).not.toContain("Submission 11");
    expect(markup).not.toContain("SUB-001");
    expect(markup).toContain("Previous");
    expect(markup).toContain("Next");
  });

  it("renders a missing title instead of exposing an internal submission id", () => {
    const [baseRow] = overviewRows(1);
    if (!baseRow) throw new Error("Expected one review overview row.");
    const internalId = "submission_27aac547-93f8-44b1-bd07-56d18f17a280";
    const markup = renderToStaticMarkup(
      createElement(OrganizerReviewOverview, {
        planName: "Program review",
        planStatusLabel: "Open for review",
        description: "Committee review has one submission in view.",
        metrics: [{ label: "Reviewer coverage", value: "2/2", detail: "reviewer slots assigned" }],
        completionPercent: 0,
        attentionSummary: {
          count: 1,
          label: "submission needs attention",
          description: "Use row actions to continue review operations.",
        },
        rows: [
          {
            ...baseRow,
            id: internalId,
            reference: internalId,
            title: internalId,
          },
        ],
        onManageReviewers: vi.fn(),
        onOpenPlan: vi.fn(),
        onOpenReviewers: vi.fn(),
        onOpenDecisions: vi.fn(),
      }),
    );

    expect(markup).toContain("<strong>No title</strong>");
    expect(markup).not.toContain(`<span>${internalId}</span>`);
  });
});
