import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AccountAccess } from "./account-access";
import { AccountHubView } from "./account-hub";

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
