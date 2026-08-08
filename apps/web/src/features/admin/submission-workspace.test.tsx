import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  getSeededSubmission,
  SubmissionDetailWorkspace,
  SubmissionListWorkspace,
} from "./submission-workspace";

describe("organizer submission workspace", () => {
  it("renders an accessible event-scoped submission table with filters and progress", () => {
    const markup = renderToStaticMarkup(
      createElement(SubmissionListWorkspace, { eventId: "summit-2026" }),
    );

    expect(markup).toContain("<table");
    expect(markup).toContain("<caption");
    expect(markup).toContain('scope="col"');
    expect(markup).toContain('scope="row"');
    expect(markup).toContain('aria-label="Select all visible submissions"');
    expect(markup).toContain('aria-label="Select Designing for Trust in AI-Assisted Teams"');
    expect(markup).toContain('id="submission-search"');
    expect(markup).toContain('for="submission-status"');
    expect(markup).toContain('for="submission-track"');
    expect(markup).toContain('for="submission-format"');
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain("Under review");
    expect(markup).toContain("Review progress");
    expect(markup).toContain("/admin/events/summit-2026/submissions/sub-001");
    expect(markup).not.toContain("maya.chen@example.test");
    expect(markup).not.toContain("Organizer notes");
  });

  it("keeps detail content private to the organizer detail view", () => {
    const markup = renderToStaticMarkup(
      createElement(SubmissionDetailWorkspace, {
        eventId: "summit-2026",
        submissionId: "sub-001",
      }),
    );

    expect(markup).toContain("Designing for Trust in AI-Assisted Teams");
    expect(markup).toContain("Version 3");
    expect(markup).toContain("maya.chen@example.test");
    expect(markup).toContain("Structured answers");
    expect(markup).toContain("Lifecycle timeline");
    expect(markup).toContain("Review score summary");
    expect(markup).toContain("Assignment &amp; conflicts");
    expect(markup).toContain("Organizer notes");
    expect(markup).toContain("Human-authored reason");
  });

  it("requires an authored reason and explicit confirmation before reopening", () => {
    const markup = renderToStaticMarkup(
      createElement(SubmissionDetailWorkspace, {
        eventId: "summit-2026",
        submissionId: "sub-001",
      }),
    );

    expect(markup).toContain('name="reopenReason"');
    expect(markup).toContain('minlength="10"');
    expect(markup).toContain('required=""');
    expect(markup).toContain("I confirm that reopening is necessary and authorized");
    expect(markup).toContain("Reopen and write audit event");
    expect(markup).toContain("disabled=\"\"");
    expect(markup).toContain("Every reopen is recorded in the audit log");
    expect(markup).toContain("automated tools cannot reopen a submission or make a final decision");
  });

  it("uses the requested event in every seeded list/detail lookup and link", () => {
    const listMarkup = renderToStaticMarkup(
      createElement(SubmissionListWorkspace, { eventId: "forge-2025" }),
    );
    const detailMarkup = renderToStaticMarkup(
      createElement(SubmissionDetailWorkspace, {
        eventId: "forge-2025",
        submissionId: "sub-101",
      }),
    );

    expect(getSeededSubmission("forge-2025", "sub-101")?.eventId).toBe("forge-2025");
    expect(getSeededSubmission("summit-2026", "sub-101")).toBeUndefined();
    expect(listMarkup).toContain("/admin/events/forge-2025/submissions/sub-101");
    expect(listMarkup).not.toContain("/admin/events/summit-2026/submissions/");
    expect(detailMarkup).toContain("/admin/events/forge-2025/submissions");
    expect(detailMarkup).not.toContain("/admin/events/summit-2026/submissions");
  });
});
