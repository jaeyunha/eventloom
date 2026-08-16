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
const landingPageSource = readFileSync(
  new URL("../../features/landing/landing-page.tsx", import.meta.url),
  "utf8",
);

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
    expect(navigationSource).toContain('aria-label="Eventloom home"');
    expect(navigationSource).toContain("product-nav-link");
  });
});

describe("Home", () => {
  it("delegates to an accessible landing page shell", () => {
    expect(homePageSource).toContain("import { LandingPage }");
    expect(homePageSource).toContain("return <LandingPage />");
    expect(landingPageSource).toContain('href="#main"');
    expect(landingPageSource).toContain('id="main"');
    expect(`${homePageSource}\n${landingPageSource}`).not.toContain("/docs/api");
    expect(`${homePageSource}\n${landingPageSource}`).not.toContain("NEXT_PUBLIC_API_URL");
  });
});
