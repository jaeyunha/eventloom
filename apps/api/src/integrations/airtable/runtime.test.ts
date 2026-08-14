import { describe, expect, it } from "vitest";
import { resolveAirtableOAuthCallbackRedirect } from "./runtime";

describe("Airtable OAuth callback redirects", () => {
  it("resolves only the callback organization path against WEB_ORIGIN", () => {
    expect(
      resolveAirtableOAuthCallbackRedirect({
        webOrigin: "https://web.example.test",
        organizationId: "organization/with slash",
        returnPath:
          "/admin/organizations/organization%2Fwith%20slash/integrations/airtable?connected=1",
      }).toString(),
    ).toBe(
      "https://web.example.test/admin/organizations/organization%2Fwith%20slash/integrations/airtable?connected=1",
    );
  });

  it("falls back to the organization integration path when persisted state is unsafe", () => {
    expect(
      resolveAirtableOAuthCallbackRedirect({
        webOrigin: "https://web.example.test",
        organizationId: "organization-1",
        returnPath: "https://attacker.example.test/redirect",
      }).toString(),
    ).toBe("https://web.example.test/admin/organizations/organization-1/integrations/airtable");
  });
});
