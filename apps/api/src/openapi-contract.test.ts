import { describe, expect, it } from "vitest";
import checkedInOpenApi from "../../../openapi/openapi.yaml?raw";

describe("checked-in public-v1 surface", () => {
  it("advertises mounted webhooks without unsafe generic program resources", () => {
    for (const resource of ["events", "sessions", "speakers", "agenda"]) {
      expect(checkedInOpenApi).not.toContain(`/api/v1/organizations/{organizationId}/${resource}`);
    }

    expect(checkedInOpenApi).toContain("/api/v1/organizations/{organizationId}/webhooks:");
    expect(checkedInOpenApi).toContain(
      "/api/v1/organizations/{organizationId}/webhooks/{subscriptionId}:",
    );
  });
});
