import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AdminShell } from "./admin-shell";

const navigation = vi.hoisted(() => ({
  pathname: "/admin/organizations/org/events/event/agenda",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("./admin-shell-session", () => ({
  useOrganizerSession: () => ({
    authenticatedOrganizationId: "org",
    authentication: "authenticated",
    availableOrganizationIds: ["org"],
    setAuthenticatedOrganizationId: vi.fn(),
  }),
}));

describe("organizer shared workspace shell", () => {
  it("renders the organizer role through one shared main landmark on desktop and mobile", () => {
    const markup = renderToStaticMarkup(
      createElement(AdminShell, null, createElement("p", null, "Protected organizer content")),
    );

    expect(markup.match(/<main\b/gu)).toHaveLength(1);
    expect(markup).toContain('data-admin-shell="true"');
    expect(markup).toContain('aria-label="Program organizer navigation"');
    expect(markup).toContain('aria-label="Organizer mobile navigation"');
    expect(markup).toContain('href="#admin-content"');
    expect(markup).toContain('href="/admin/organizations/org/events/event/agenda"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).not.toContain("Protected organizer content");
  });

  it("keeps account, theme, command, and organization controls in the shared role chrome", () => {
    const markup = renderToStaticMarkup(
      createElement(AdminShell, null, createElement("p", null, "Protected organizer content")),
    );

    expect(markup).toContain('aria-label="Sign out"');
    expect(markup).toContain('aria-label="Toggle color theme"');
    expect(markup).toContain('aria-keyshortcuts="Meta+K Control+K"');
    expect(markup).toContain("Organization workspace");
    expect(markup).toContain("All work");
  });
});
