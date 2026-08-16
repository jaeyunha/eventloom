import { describe, expect, it } from "vitest";
import type { UserPrincipal } from "../auth/types";
import { evaluationRolesForOrganizationMembership, evaluationRolesForPrincipal } from "./access";

describe("evaluation organization access", () => {
  it.each([
    ["owner", ["organizer"]],
    ["admin", ["organizer"]],
    ["reviewer", []],
  ] as const)("derives organization capabilities for %s", (role, expected) => {
    expect(evaluationRolesForOrganizationMembership(role)).toEqual(expected);
  });

  it("adds reviewer authority only for the exact accepted event grant", () => {
    const principal: UserPrincipal = {
      kind: "user",
      sessionId: "session-reviewer",
      userId: "reviewer-1",
      email: "reviewer@example.test",
      memberships: [{ organizationId: "org-a", role: "reviewer" }],
      speakerGrants: [],
      reviewerGrants: [{ organizationId: "org-a", eventId: "event-a" }],
    };

    expect(evaluationRolesForPrincipal(principal, "org-a", "event-a")).toEqual(["reviewer"]);
    expect(evaluationRolesForPrincipal(principal, "org-a", "event-b")).toEqual([]);
  });
});
