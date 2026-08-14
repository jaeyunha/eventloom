import { describe, expect, it } from "vitest";
import { evaluationRolesForOrganizationMembership } from "./access";

describe("evaluation organization access", () => {
  it.each([
    ["owner", ["organizer", "reviewer"]],
    ["admin", ["organizer", "reviewer"]],
    ["reviewer", ["reviewer"]],
  ] as const)("derives concurrent evaluation capabilities for %s", (role, expected) => {
    expect(evaluationRolesForOrganizationMembership(role)).toEqual(expected);
  });
});
