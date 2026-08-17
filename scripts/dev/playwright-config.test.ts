import { describe, expect, it } from "vitest";
import config from "../../playwright.config";

describe("Playwright service isolation", () => {
  it("runs the API and web application with the fixture profile", () => {
    expect(config.webServer).toEqual([
      expect.objectContaining({
        command: "bun --no-env-file scripts/dev/run-fixture-api.mjs",
        env: expect.objectContaining({
          APP_ENV: "local",
          RUNTIME_PROFILE: "fixture",
        }),
      }),
      expect.objectContaining({
        command: "bun --no-env-file scripts/dev/run-local-service.ts web-playwright",
        env: expect.objectContaining({
          APP_ENV: "local",
          RUNTIME_PROFILE: "fixture",
          NEXT_PUBLIC_APP_ENV: "local",
          NEXT_PUBLIC_RUNTIME_PROFILE: "fixture",
        }),
      }),
    ]);
  });
});
