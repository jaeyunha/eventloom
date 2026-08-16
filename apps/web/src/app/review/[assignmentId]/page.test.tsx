import { describe, expect, it } from "vitest";
import ReviewerAssignmentPage from "./page";

describe("ReviewerAssignmentPage", () => {
  it("opens one authorized assignment in the full-page reviewer surface", async () => {
    const element = await ReviewerAssignmentPage({
      params: Promise.resolve({ assignmentId: "assignment-1%3Areviewer-1" }),
      searchParams: Promise.resolve({
        eventId: " event-1 ",
        organizationId: " org-1 ",
      }),
    });

    expect(element.props).toMatchObject({
      mode: "evaluator",
      assignmentId: "assignment-1:reviewer-1",
      eventId: "event-1",
      organizationId: "org-1",
    });
  });
});
