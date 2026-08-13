import { describe, expect, it } from "vitest";
import checkedInOpenApi from "../../../openapi/openapi.yaml?raw";

describe("checked-in public-v1 surface", () => {
  it("advertises safe nested catalog reads and mounted webhooks", () => {
    for (const path of [
      "/api/v1/organizations/{organizationId}/events:",
      "/api/v1/organizations/{organizationId}/events/{eventId}:",
      "/api/v1/organizations/{organizationId}/events/{eventId}/sessions:",
      "/api/v1/organizations/{organizationId}/events/{eventId}/sessions/{sessionId}:",
      "/api/v1/organizations/{organizationId}/events/{eventId}/speakers:",
      "/api/v1/organizations/{organizationId}/events/{eventId}/speakers/{speakerId}:",
    ]) {
      expect(checkedInOpenApi).toContain(path);
    }

    expect(checkedInOpenApi).toContain("/api/v1/organizations/{organizationId}/webhooks:");
    expect(checkedInOpenApi).toContain(
      "/api/v1/organizations/{organizationId}/webhooks/{subscriptionId}:",
    );
    expect(checkedInOpenApi).not.toContain("/api/v1/organizations/{organizationId}/sessions:");
    expect(checkedInOpenApi).not.toContain("/api/v1/organizations/{organizationId}/speakers:");
    expect(checkedInOpenApi).not.toContain("/api/v1/organizations/{organizationId}/agenda:");
  });
});
