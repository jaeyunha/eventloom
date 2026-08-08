import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "../../app/page";
import { ProductNavigation } from "./product-navigation";

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

describe("ProductNavigation", () => {
  it("renders semantic navigation groups with every evaluator route", () => {
    const markup = renderToStaticMarkup(createElement(ProductNavigation));

    expect(markup).toContain('<nav class="product-nav"');
    expect(markup).toContain('aria-label="Product navigation"');
    expect(markup).toContain("Primary workspaces");
    expect(markup).toContain("Public and developer surfaces");
    expect(markup).toContain("<ul>");

    for (const [label, href] of requiredRoutes) {
      expect(markup).toContain(`href="${href}"`);
      expect(markup).toContain(label);
    }
  });

  it("keeps the brand link discoverable and keyboard-focusable", () => {
    const markup = renderToStaticMarkup(createElement(ProductNavigation));

    expect(markup).toContain('href="/"');
    expect(markup).toContain('aria-label="Open Sessionboard home"');
    expect(markup).toContain('class="product-nav-link"');
  });
});

describe("Home", () => {
  it("renders an accessible, truthful workflow dashboard", () => {
    const markup = renderToStaticMarkup(createElement(Home));

    expect(markup).toContain('href="#main-content"');
    expect(markup).toContain('id="main-content"');
    expect(markup).toContain("Human-authoritative review");
    expect(markup).toContain("Conflict-safe scheduling");
    expect(markup).toContain("explicitly published");
    expect(markup).toContain("This landing page shows workflow surfaces, not live event data.");
    expect(markup).not.toContain("NEXT_PUBLIC_API_URL");
  });
});
