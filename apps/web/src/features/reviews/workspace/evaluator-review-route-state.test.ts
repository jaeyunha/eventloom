import { describe, expect, it } from "vitest";
import {
  reviewAssignmentIdFromSearchParams,
  reviewAssignmentPageHref,
  reviewQueueUrlWithAssignment,
} from "./evaluator-review-route-state";

describe("reviewer route state", () => {
  it("adds and removes drawer selection without losing queue scope", () => {
    const queueUrl = new URL(
      "https://eventloom.example/review?organizationId=org-1&eventId=event-1",
    );
    const selectedUrl = reviewQueueUrlWithAssignment(queueUrl, " assignment-1 ");

    expect(selectedUrl.pathname).toBe("/review");
    expect(selectedUrl.searchParams.get("organizationId")).toBe("org-1");
    expect(selectedUrl.searchParams.get("eventId")).toBe("event-1");
    expect(selectedUrl.searchParams.get("assignmentId")).toBe("assignment-1");
    expect(reviewAssignmentIdFromSearchParams(selectedUrl.searchParams)).toBe("assignment-1");

    const closedUrl = reviewQueueUrlWithAssignment(selectedUrl, null);
    expect(closedUrl.searchParams.get("assignmentId")).toBeNull();
    expect(closedUrl.searchParams.get("organizationId")).toBe("org-1");
    expect(closedUrl.searchParams.get("eventId")).toBe("event-1");
  });

  it("builds a scoped full-page review destination", () => {
    expect(
      reviewAssignmentPageHref({
        assignmentId: "assignment-1:reviewer-1",
        organizationId: "org-1",
        eventId: "event-1",
      }),
    ).toBe("/review/assignment-1%3Areviewer-1?organizationId=org-1&eventId=event-1");
  });

  it("ignores unusable assignment query values", () => {
    expect(
      reviewAssignmentIdFromSearchParams(new URLSearchParams({ assignmentId: "   " })),
    ).toBeNull();
  });
});
