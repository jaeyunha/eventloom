import { afterEach, describe, expect, it, vi } from "vitest";
import { restoreBlockedReviewerQueueRouteSelection } from "./evaluator-review-route-history";

function browserHistory() {
  const forward = vi.fn();
  const pushState = vi.fn();
  vi.stubGlobal("window", {
    location: {
      href: "https://eventloom.test/review?organizationId=org-a&eventId=event-a",
    },
    history: {
      state: { existing: true },
      forward,
      pushState,
    },
  });
  return { forward, pushState };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("restoreBlockedReviewerQueueRouteSelection", () => {
  it("returns to the marked drawer entry when browser Back is blocked by autosave", () => {
    const history = browserHistory();

    restoreBlockedReviewerQueueRouteSelection("assignment-a", true);

    expect(history.forward).toHaveBeenCalledOnce();
    expect(history.pushState).not.toHaveBeenCalled();
  });

  it("recreates a direct-link selection without marking it as a drawer entry", () => {
    const history = browserHistory();

    restoreBlockedReviewerQueueRouteSelection("assignment-a", false);

    expect(history.forward).not.toHaveBeenCalled();
    expect(history.pushState).toHaveBeenCalledWith(
      { existing: true },
      "",
      "/review?organizationId=org-a&eventId=event-a&assignmentId=assignment-a",
    );
  });
});
