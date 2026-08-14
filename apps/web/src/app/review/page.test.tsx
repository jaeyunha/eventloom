import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { signOutReviewerSession } from "../../features/reviews/reviewer-shell";
import ReviewerPage from "./page";

describe("ReviewerPage", () => {
  it("provides account navigation and a visible sign-out action", () => {
    const markup = renderToStaticMarkup(createElement(ReviewerPage));

    expect(markup).toContain('data-reviewer-shell="true"');
    expect(markup).toContain('href="/work"');
    expect(markup).toContain('data-reviewer-sign-out="true"');
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
