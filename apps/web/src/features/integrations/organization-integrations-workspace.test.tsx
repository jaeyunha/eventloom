import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrganizationIntegrationsWorkspace } from "./organization-integrations-workspace";

describe("organization integrations workspace", () => {
  it("exposes integration settings as exact in-page navigation destinations", () => {
    const markup = renderToStaticMarkup(
      createElement(OrganizationIntegrationsWorkspace, {
        organizationId: "org/one",
      }),
    );
    const navigation = markup.match(
      /<nav[^>]*aria-label="Integration settings"[^>]*>[\s\S]*?<\/nav>/u,
    )?.[0];

    expect(navigation).toBeDefined();
    expect(navigation).toContain('href="#connections"');
    expect(navigation).toContain('href="#airtable"');
    expect(navigation).toContain('href="#api-keys"');
    expect(navigation).toContain('href="#event-bindings"');
    expect(navigation?.match(/<a /gu)).toHaveLength(4);
  });

  it("separates organization connections from event bindings", () => {
    const markup = renderToStaticMarkup(
      createElement(OrganizationIntegrationsWorkspace, {
        organizationId: "org/one",
      }),
    );

    expect(markup).toContain("Integrations");
    expect(markup).toContain("D1 remains authoritative");
    expect(markup).toContain("Airtable projection");
    expect(markup).toContain("Developer API");
    expect(markup).toContain("Create API key");
    expect(markup).toContain("Expiration date and time");
    expect(markup).toContain("Time");
    expect(markup).not.toContain('type="date"');
    expect(markup).toContain("Event bindings");
    expect(markup).toContain("/admin/organizations/org%2Fone/events");
    expect(markup).not.toContain("Airtable remains authoritative");
  });
});
