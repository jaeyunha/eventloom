import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AccountAccess } from "./account-access";
import { AccountHubView, loadAccountAccess } from "./account-hub";

const access = (capabilities: AccountAccess["capabilities"]): AccountAccess => ({
  identity: { id: "user-1", email: "user@example.com", name: "User One" },
  memberships: [
    { organizationId: "org-a", role: "owner" },
    { organizationId: "org-b", role: "reviewer" },
  ],
  portalContexts: [],
  reviewerAssignmentCount: 2,
  capabilities,
});

describe("AccountHubView", () => {
  it("derives portal and review capabilities from API data envelopes", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/auth/get-session") {
        return Response.json({
          session: { id: "session-1" },
          user: { id: "user-1", email: "speaker@example.com", name: "Speaker" },
          memberships: [],
        });
      }
      if (path === "/api/speaker/portal/contexts") {
        return Response.json({
          data: [
            {
              id: "event-1",
              organizationId: "org-1",
              eventId: "event-1",
              name: "Local Event",
              slug: "local-event",
              status: "draft",
              capabilities: ["submission-edit"],
              submissionIds: ["submission-1"],
              participantIds: [],
            },
          ],
        });
      }
      if (path === "/api/admin/evaluations/reviewer/workspace") {
        return Response.json({ data: { assignments: [{ assignmentId: "assignment-1" }] } });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    const result = await loadAccountAccess(fetcher);

    expect(result?.capabilities).toEqual(new Set(["reviews", "proposals"]));
    expect(result?.reviewerAssignmentCount).toBe(1);
  });

  it("shows every server-derived workspace at the same time", () => {
    const markup = renderToStaticMarkup(
      createElement(AccountHubView, {
        access: access(new Set(["organizer", "reviews", "proposals", "speaker-tasks"])),
      }),
    );

    expect(markup).toContain('href="/admin"');
    expect(markup).toContain('href="/review"');
    expect(markup).toContain('href="/portal/submissions"');
    expect(markup).toContain('href="/portal/tasks"');
  });

  it("does not invent destinations for unavailable capabilities", () => {
    const markup = renderToStaticMarkup(
      createElement(AccountHubView, { access: access(new Set()) }),
    );

    expect(markup).not.toContain('href="/admin"');
    expect(markup).not.toContain('href="/review"');
    expect(markup).not.toContain('href="/portal/submissions"');
    expect(markup).not.toContain('href="/portal/tasks"');
  });
});
