import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReviewWorkspace } from "./review-workspace";

describe("review workspace", () => {
  it("renders plan status, round dates, and blind-review semantics for organizers", () => {
    const markup = renderToStaticMarkup(
      createElement(ReviewWorkspace, { eventId: "summit-2026", mode: "organizer" }),
    );

    expect(markup).toContain("Evaluation plan status");
    expect(markup).toContain("Open for review");
    expect(markup).toContain("Initial committee review");
    expect(markup).toContain("Calibration and final review");
    expect(markup).toContain("Aug 10, 2026");
    expect(markup).toContain("Aug 24, 2026");
    expect(markup).toContain("Blind review");
    expect(markup).toContain("Reviewer views hide participant identity fields.");
  });

  it("exposes assignment progress, conflicts, abstentions, and counted aggregates", () => {
    const markup = renderToStaticMarkup(
      createElement(ReviewWorkspace, { eventId: "summit-2026", mode: "organizer" }),
    );

    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain("Reviewer assignment progress");
    expect(markup).toContain("2 conflicts declared");
    expect(markup).toContain("1 abstention");
    expect(markup).toContain("Counted aggregate scores");
    expect(markup).toContain("Human-confirmed scores only");
  });

  it("renders bounded rubric controls and human-authority decision safeguards", () => {
    const organizerMarkup = renderToStaticMarkup(
      createElement(ReviewWorkspace, { eventId: "summit-2026", mode: "organizer" }),
    );
    const evaluatorMarkup = renderToStaticMarkup(
      createElement(ReviewWorkspace, { eventId: "summit-2026", mode: "evaluator" }),
    );

    expect(organizerMarkup).toContain("Criteria and weights");
    expect(organizerMarkup).toContain("1–5");
    expect(organizerMarkup).toContain("Written reason");
    expect(organizerMarkup).toContain("required");
    expect(organizerMarkup).toContain("Confirm human decision");
    expect(organizerMarkup).toContain("AI suggestions cannot accept, waitlist, reject, or publish a decision.");
    expect(evaluatorMarkup).toContain('type="number"');
    expect(evaluatorMarkup).toContain('min="1"');
    expect(evaluatorMarkup).toContain('max="5"');
  });

  it("keeps evaluator content blind and limited to one assignment", () => {
    const markup = renderToStaticMarkup(
      createElement(ReviewWorkspace, { eventId: "summit-2026", mode: "evaluator" }),
    );

    expect(markup).toContain("Only your assigned submission is available");
    expect(markup).toContain("Blind review is on");
    expect(markup).toContain("Author identity is hidden from reviewers");
    expect(markup).toContain("Redacted for blind review");
    expect(markup).not.toContain("Riley");
    expect(markup).not.toContain("review plan status");
  });

  it("marks AI evidence uncounted and requires a written abstention reason", () => {
    const markup = renderToStaticMarkup(
      createElement(ReviewWorkspace, { eventId: "summit-2026", mode: "evaluator" }),
    );

    expect(markup).toContain("AI suggestion · uncounted");
    expect(markup).toContain("Confirm or edit this suggestion");
    expect(markup).toContain("A confirmation is required before this review is submitted");
    expect(markup).toContain("Conflict of interest");
    expect(markup).toContain('id="abstention-reason"');
    expect(markup).toContain("required");
    expect(markup).toContain("immediately removes your access");
  });
});
