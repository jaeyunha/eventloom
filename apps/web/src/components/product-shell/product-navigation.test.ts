import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const requiredRoutes = [
  ["Call for speakers (CFP)", "/cfp/open-sessionboard-conf"],
  ["Speaker portal", "/portal"],
  ["Organizer workspace", "/admin"],
  ["Reviewer workspace", "/review"],
  ["Agenda workspace", "/admin/events/demo-event/agenda"],
  ["Public speaker gallery", "/embed/open-sessionboard-conf/speakers"],
  ["Public agenda", "/embed/open-sessionboard-conf/agenda"],
  ["API docs", "/docs/api"],
] as const;

const navigationSource = readFileSync(new URL("./product-navigation.tsx", import.meta.url), "utf8");
const homePageSource = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");

describe("ProductNavigation", () => {
  it("declares semantic navigation groups with every evaluator route", () => {
    expect(navigationSource).toContain("<nav");
    expect(navigationSource).toContain('aria-label="Product navigation"');
    expect(navigationSource).toContain("Primary workspaces");
    expect(navigationSource).toContain("Public and developer surfaces");
    expect(navigationSource).toContain("<ul");

    for (const [label, href] of requiredRoutes) {
      expect(navigationSource).toContain(`href: "${href}"`);
      expect(navigationSource).toContain(`label: "${label}"`);
    }
  });

  it("keeps the brand link discoverable and keyboard-focusable", () => {
    expect(navigationSource).toContain('href="/"');
    expect(navigationSource).toContain('aria-label="Open Sessionboard home"');
    expect(navigationSource).toContain("product-nav-link");
  });
});

describe("Home", () => {
  it("declares an accessible, truthful workflow dashboard", () => {
    expect(homePageSource).toContain('href="#main-content"');
    expect(homePageSource).toContain('id="main-content"');
    expect(homePageSource).toContain("Human-authoritative review");
    expect(homePageSource).toContain("Conflict-safe scheduling");
    expect(homePageSource).toContain("explicitly published");
    expect(homePageSource).toContain("This landing page shows workflow surfaces");
    expect(homePageSource).toContain("live event");
    expect(homePageSource).not.toContain("NEXT_PUBLIC_API_URL");
  });
});
