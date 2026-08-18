import { describe, expect, it } from "vitest";
import { reviewerAssignmentRequestPath } from "./model-reviewer-assignment-request-path";

const assignment = {
  id: "assignment/shared",
  organizationId: "org b",
  eventId: "event/shared",
};

describe("reviewerAssignmentRequestPath", () => {
  it.each([
    [{ kind: "review" } as const, "/review"],
    [{ kind: "submit" } as const, "/review/submit"],
    [{ kind: "conflict" } as const, "/conflict"],
  ])("keeps organization and event scope on $kind requests", (action, suffix) => {
    expect(reviewerAssignmentRequestPath(assignment, action)).toBe(
      `/assignments/assignment%2Fshared${suffix}?organizationId=org+b&eventId=event%2Fshared`,
    );
  });
});
