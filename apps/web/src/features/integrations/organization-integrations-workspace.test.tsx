import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrganizationIntegrationsWorkspace } from "./organization-integrations-workspace";

describe("organization integrations workspace", () => {
  it("renders a focused connection destination with stable navigation URLs", () => {
    const markup = renderToStaticMarkup(
      createElement(OrganizationIntegrationsWorkspace, {
        organizationId: "org/one",
        section: "connections",
      }),
    );

    expect(markup).toContain("Integrations");
    expect(markup).toContain("D1 remains authoritative");
    expect(markup).toContain("Airtable projection");
    expect(markup).toContain("Developer API");
    expect(markup).toContain('href="/admin/organizations/org%2Fone/integrations"');
    expect(markup).toContain('href="/admin/organizations/org%2Fone/integrations/airtable"');
    expect(markup).toContain('href="/admin/organizations/org%2Fone/integrations/api-keys"');
    expect(markup).toContain('href="/admin/organizations/org%2Fone/integrations/event-bindings"');
    expect(markup).not.toContain('href="#airtable"');
    expect(markup).not.toContain("Create API key");
    expect(markup).not.toContain("Open an event");
  });

  it("renders the selected organization integration destination only", () => {
    const apiKeysMarkup = renderToStaticMarkup(
      createElement(OrganizationIntegrationsWorkspace, {
        organizationId: "org/one",
        section: "api-keys",
      }),
    );
    const eventBindingsMarkup = renderToStaticMarkup(
      createElement(OrganizationIntegrationsWorkspace, {
        organizationId: "org/one",
        section: "event-bindings",
      }),
    );

    expect(apiKeysMarkup).toContain("Create API key");
    expect(apiKeysMarkup).not.toContain("Airtable projection");
    expect(apiKeysMarkup).not.toContain("Open an event");

    expect(eventBindingsMarkup).toContain("Event bindings");
    expect(eventBindingsMarkup).toContain("Open an event");
    expect(eventBindingsMarkup).toContain("/admin/organizations/org%2Fone/events");
    expect(eventBindingsMarkup).not.toContain("Create API key");
  });
});
