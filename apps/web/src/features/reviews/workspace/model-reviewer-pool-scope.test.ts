import { describe, expect, it } from "vitest";
import {
  reviewerPoolScopeKey,
  type ScopedReviewerPoolValue,
  scopedReviewerPoolValue,
} from "./model-reviewer-pool-scope";

describe("reviewer pool scope state", () => {
  it("distinguishes organization, event, and round scopes", () => {
    const eventOneRoundOne = reviewerPoolScopeKey("org-1", "event-1", "round-1");

    expect(eventOneRoundOne).not.toBe(reviewerPoolScopeKey("org-1", "event-2", "round-1"));
    expect(eventOneRoundOne).not.toBe(reviewerPoolScopeKey("org-1", "event-1", "round-2"));
    expect(eventOneRoundOne).not.toBe(reviewerPoolScopeKey("org-2", "event-1", "round-1"));
    expect(eventOneRoundOne).toBe(reviewerPoolScopeKey(" org-1 ", " event-1 ", " round-1 "));
  });

  it("hides a completed request from a previous scope", () => {
    const currentScope = reviewerPoolScopeKey("org-1", "event-2", "round-1");
    const staleState: ScopedReviewerPoolValue<string> = {
      scopeKey: reviewerPoolScopeKey("org-1", "event-1", "round-1"),
      value: "stale pool",
    };

    expect(scopedReviewerPoolValue(currentScope, staleState, "loading")).toBe("loading");
  });
});
