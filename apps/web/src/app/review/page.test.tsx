import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { signOutAccount } from "@/features/account/account-actions";
import ReviewerLayout from "./layout";
import ReviewerPage from "./page";

vi.mock("@/features/auth/authenticated-route-guard", () => ({
  AuthenticatedRouteGuard: ({ children }: Readonly<{ children: ReactNode }>) => children,
}));

describe("ReviewerPage", () => {
  it("routes an invitation to the exact event and organization", async () => {
    const element = await ReviewerPage({
      searchParams: Promise.resolve({
        assignmentId: " assignment-1 ",
        eventId: " event-1 ",
        organizationId: "org-1",
      }),
    });

    expect(element.props).toMatchObject({
      mode: "evaluator",
      initialSelectedAssignmentId: "assignment-1",
      eventId: "event-1",
      organizationId: "org-1",
    });
  });

  it("preserves the unfiltered route and ignores unusable raw values", async () => {
    const element = await ReviewerPage({
      searchParams: Promise.resolve({ eventId: ["event-1", "event-2"], organizationId: "   " }),
    });
    const unfiltered = await ReviewerPage();

    expect(element.props).toEqual({ mode: "evaluator" });
    expect(unfiltered.props).toEqual({ mode: "evaluator" });
  });

  it("composes the evaluator-only page inside the route shell with one main landmark", async () => {
    const markup = renderToStaticMarkup(createElement(ReviewerLayout, null, await ReviewerPage()));

    expect(markup).toContain('data-reviewer-shell="true"');
    expect(markup).toContain("Reviewer queue");
    expect(markup).not.toContain("Create evaluation plan");
    expect((markup.match(/<main\b/gu) ?? []).length).toBe(1);
    expect(markup).toContain('data-role-workspace-shell="true"');
    expect(markup).toContain('data-role-workspace="reviewer"');
    expect(markup).toContain('aria-label="Reviewer workspace"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('id="reviewer-main"');
    expect(markup).toContain('href="/work"');
    expect(markup).toContain('data-reviewer-sign-out="true"');
  });

  it("signs out through the same-origin gateway before returning to login", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 200 }));
    const navigate = vi.fn();

    await signOutAccount({ fetcher, navigate });

    expect(fetcher).toHaveBeenCalledWith(
      "/api/auth/sign-out",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(navigate).toHaveBeenCalledWith("/login");
  });
});
