import { describe, expect, it } from "vitest";
import {
  mergeOrganizerDecisionOverrides,
  type OrganizerDecisionOverrideState,
} from "./organizer-view-controller";
import type { ReviewPlanSeed } from "./organizer-review-plan-seed";

function seed(version: number, status: "accepted" | "rejected"): ReviewPlanSeed {
  return {
    planId: "plan-1",
    decisionBySubmission: {
      "submission-1": {
        status,
        reason: `Authoritative version ${version}`,
        version,
      },
    },
  } as unknown as ReviewPlanSeed;
}

const localRejectedOverride: OrganizerDecisionOverrideState = {
  planId: "plan-1",
  decisions: {
    "submission-1": {
      status: "rejected",
      reason: "Local optimistic rejection",
      version: 2,
    },
  },
};

describe("mergeOrganizerDecisionOverrides", () => {
  it("drops a local override when a newer authoritative decision arrives", () => {
    const authoritative = seed(3, "accepted");

    expect(mergeOrganizerDecisionOverrides(authoritative, localRejectedOverride)).toEqual({});
    expect(
      {
        ...authoritative.decisionBySubmission,
        ...mergeOrganizerDecisionOverrides(authoritative, localRejectedOverride),
      }["submission-1"],
    ).toEqual(authoritative.decisionBySubmission["submission-1"]);
  });

  it("keeps a newer local override while the authoritative seed is stale", () => {
    const authoritative = seed(1, "accepted");

    expect(mergeOrganizerDecisionOverrides(authoritative, localRejectedOverride)).toEqual(
      localRejectedOverride.decisions,
    );
  });
});
