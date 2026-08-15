import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { signOutReviewerSession } from "../../features/reviews/reviewer-shell";
import ReviewerLayout from "./layout";
import ReviewerPage from "./page";

describe("ReviewerPage", () => {
  it("composes the evaluator-only page inside the route shell with one main landmark", () => {
    const markup = renderToStaticMarkup(
      createElement(ReviewerLayout, null, createElement(ReviewerPage)),
    );

    expect(markup).toContain('data-reviewer-shell="true"');
    expect(markup).toContain("Reviewer queue");
    expect(markup).not.toContain("Create evaluation plan");
    expect((markup.match(/<main\b/gu) ?? []).length).toBe(1);
  });

  it("signs out through the same-origin gateway before returning to login", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 200 }));
    const navigate = vi.fn();

    await signOutReviewerSession({ fetcher, navigate });

    expect(fetcher).toHaveBeenCalledWith(
      "/api/auth/sign-out",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(navigate).toHaveBeenCalledWith("/login");
  });
});
