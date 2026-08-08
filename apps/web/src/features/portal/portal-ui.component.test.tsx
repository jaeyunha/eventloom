import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageHeading, Progress, SubmissionStatusBadge, TaskStatusBadge } from "./portal-ui";

describe("speaker portal UI components", () => {
  it("renders a clear page heading hierarchy", () => {
    const markup = renderToStaticMarkup(
      createElement(PageHeading, {
        eyebrow: "Speaker portal",
        title: "Tasks",
        description: "Complete your accepted-speaker tasks.",
      }),
    );

    expect(markup).toContain("<h1>Tasks</h1>");
    expect(markup).toContain("Speaker portal");
    expect(markup).toContain("Complete your accepted-speaker tasks.");
  });

  it("exposes status labels as text rather than color alone", () => {
    const submission = renderToStaticMarkup(
      createElement(SubmissionStatusBadge, { status: "accepted" }),
    );
    const task = renderToStaticMarkup(createElement(TaskStatusBadge, { status: "needs_changes" }));

    expect(submission).toContain("Accepted");
    expect(task).toContain("Needs changes");
  });

  it("renders readiness with native progress semantics", () => {
    const markup = renderToStaticMarkup(
      createElement(Progress, { value: 60, label: "Speaker readiness" }),
    );

    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-valuenow="60"');
    expect(markup).toContain('aria-label="Speaker readiness"');
  });
});
