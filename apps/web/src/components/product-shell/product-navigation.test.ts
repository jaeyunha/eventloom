import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const requiredRoutes = [
  ["Product", "/#workflow"],
  ["Workspaces", "/#workspaces"],
  ["Live demo", "/events"],
  ["Sign in", "/login"],
] as const;

const navigationSource = readFileSync(new URL("./product-navigation.tsx", import.meta.url), "utf8");
const homePageSource = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");

describe("ProductNavigation", () => {
  it("keeps the landing navigation small, semantic, and free of dead destinations", () => {
    expect(navigationSource).toContain("<nav");
    expect(navigationSource).toContain('aria-label="Product navigation"');
    expect(navigationSource).toContain("<ul");

    for (const [label, href] of requiredRoutes) {
      expect(navigationSource).toContain(`href: "${href}"`);
      expect(navigationSource).toContain(`label: "${label}"`);
    }
    expect(navigationSource).not.toContain("/docs/api");
    expect(navigationSource).not.toContain("API docs");
    expect(navigationSource).not.toContain("Primary workspaces");
  });

  it("keeps the brand link discoverable and keyboard-focusable", () => {
    expect(navigationSource).toContain('href="/"');
    expect(navigationSource).toContain('aria-label="Open Sessionboard home"');
    expect(navigationSource).toContain("product-nav-link");
  });
});

describe("Home", () => {
  it("declares an accessible, truthful workflow landing page", () => {
    expect(homePageSource).toContain('href="#main-content"');
    expect(homePageSource).toContain('id="main-content"');
    expect(homePageSource).toContain("Human-authoritative review");
    expect(homePageSource).toContain("Conflict-safe scheduling");
    expect(homePageSource).toContain("explicitly published");
    expect(homePageSource).toContain("Run your speaker program");
    expect(homePageSource).toContain("Explore the live product");
    expect(homePageSource).toContain("Publish the program, not your working table");
    expect(homePageSource).not.toContain("/docs/api");
    expect(homePageSource).not.toContain("NEXT_PUBLIC_API_URL");
  });
});
