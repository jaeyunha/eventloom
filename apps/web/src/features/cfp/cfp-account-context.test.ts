import { describe, expect, it } from "vitest";
import type { CfpAuthenticatedSession } from "./api";
import { shouldConfirmCfpApplicantContext } from "./cfp-account-context";

function session(memberships: CfpAuthenticatedSession["memberships"]): CfpAuthenticatedSession {
  return {
    email: "person@example.test",
    name: "Eventloom Person",
    firstName: "Eventloom",
    lastName: "Person",
    memberships,
  };
}

describe("CFP applicant context", () => {
  it.each([
    ["participant-only account", session([]), "evaluator-org", false],
    [
      "reviewer in the current organization",
      session([{ organizationId: "evaluator-org", role: "reviewer" }]),
      "evaluator-org",
      false,
    ],
    [
      "organizer in another organization",
      session([{ organizationId: "another-org", role: "admin" }]),
      "evaluator-org",
      false,
    ],
    [
      "organizer in the current organization",
      session([{ organizationId: "evaluator-org", role: "owner" }]),
      "evaluator-org",
      true,
    ],
  ] as const)(
    "returns the scoped boundary decision for %s",
    (_case, account, organizationId, expected) => {
      expect(shouldConfirmCfpApplicantContext(account, organizationId)).toBe(expected);
    },
  );
});
