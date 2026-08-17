import { describe, expect, it } from "vitest";
import type { OrganizationMember } from "../../members/api";
import {
  assignmentDistributionReviewerIds,
  assignmentReviewerSelectionError,
} from "./model-assignment-reviewer-selection";
import { evaluationExportFilename } from "./model-evaluation-export-filename";
import { participantDisplayLabel } from "./model-participant-display-label";
import { reviewerDisplayLabel } from "./model-reviewer-display-label";
import { reviewerPoolScopeKey, scopedReviewerPoolValue } from "./model-reviewer-pool-scope";

describe("assignment UX audit helpers", () => {
  it("uses trimmed human reviewer labels and distinguishable safe fallbacks", () => {
    const members: readonly OrganizationMember[] = [
      {
        organizationId: "organization",
        userId: "reviewer-named",
        name: "  Casey Reviewer  ",
        email: "casey@example.test",
        emailVerified: true,
        status: "active",
        role: "reviewer",
        createdAt: "2026-08-17T00:00:00.000Z",
        updatedAt: "2026-08-17T00:00:00.000Z",
      },
      {
        organizationId: "organization",
        userId: "reviewer-email",
        name: " ",
        email: "  email-only@example.test  ",
        emailVerified: true,
        status: "active",
        role: "reviewer",
        createdAt: "2026-08-17T00:00:00.000Z",
        updatedAt: "2026-08-17T00:00:00.000Z",
      },
    ];

    expect(reviewerDisplayLabel("reviewer-named", members, 1)).toBe("Casey Reviewer");
    expect(reviewerDisplayLabel("reviewer-email", members, 2)).toBe("email-only@example.test");
    expect(reviewerDisplayLabel("reviewer-internal-a", members, 3)).toBe("Reviewer 3");
    expect(reviewerDisplayLabel("reviewer-internal-b", members, 4)).toBe("Reviewer 4");
  });

  it("uses trimmed participant labels with positional nontechnical fallbacks", () => {
    expect(
      participantDisplayLabel([
        { id: "participant-a", displayName: "  Avery Speaker  " },
        { id: "participant-b", displayName: " " },
        { id: "participant-c", displayName: "" },
      ]),
    ).toBe("Avery Speaker · Participant 2 · Participant 3");
  });

  it("scopes reviewer-pool state by organization, event, and round", () => {
    const firstScope = reviewerPoolScopeKey(" organization ", " event-a ", " round-1 ");
    const nextEvent = reviewerPoolScopeKey("organization", "event-b", "round-1");
    const nextRound = reviewerPoolScopeKey("organization", "event-a", "round-2");
    const state = {
      scopeKey: firstScope,
      value: { reviewer: 2 } as Readonly<Record<string, number>>,
    };

    expect(firstScope).not.toBe(nextEvent);
    expect(firstScope).not.toBe(nextRound);
    expect(scopedReviewerPoolValue(firstScope, state, {})).toEqual({ reviewer: 2 });
    expect(scopedReviewerPoolValue(nextEvent, state, {})).toEqual({});
    expect(scopedReviewerPoolValue(nextRound, state, {})).toEqual({});
  });

  it("keeps explicit zero selection distinct from automatic distribution", () => {
    expect(assignmentDistributionReviewerIds("automatic", [])).toBeUndefined();
    expect(assignmentReviewerSelectionError("automatic", [])).toBeNull();
    expect(assignmentDistributionReviewerIds("explicit", [])).toEqual([]);
    expect(assignmentReviewerSelectionError("explicit", [])).toBe(
      "Select at least one reviewer or use automatic distribution.",
    );
    expect(assignmentDistributionReviewerIds("explicit", ["reviewer-a"])).toEqual(["reviewer-a"]);
  });

  it("uses a plan-neutral export filename", () => {
    expect(evaluationExportFilename()).toBe("evaluation-results.csv");
    expect(evaluationExportFilename()).not.toMatch(/\bplan[_-]/iu);
  });
});
