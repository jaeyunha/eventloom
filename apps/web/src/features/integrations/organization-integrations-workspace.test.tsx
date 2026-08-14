import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrganizationIntegrationsWorkspace } from "./organization-integrations-workspace";

describe("organization integrations workspace", () => {
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
    expect(markup).toContain("Event bindings");
    expect(markup).toContain("/admin/organizations/org%2Fone/events");
    expect(markup).not.toContain("Airtable remains authoritative");
  });
});
