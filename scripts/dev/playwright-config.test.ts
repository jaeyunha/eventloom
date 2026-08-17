import { describe, expect, it } from "vitest";
import config from "../../playwright.config";

describe("Playwright service isolation", () => {
  it("runs the API and web application with the fixture profile", () => {
    expect(config.webServer).toEqual([
      expect.objectContaining({
        command: "bun run --filter @eventloom/api dev:fixture",
        env: expect.objectContaining({
          APP_ENV: "local",
          RUNTIME_PROFILE: "fixture",
          FIXTURE_API_ORIGIN: "http://127.0.0.1:8787",
          FIXTURE_WEB_ORIGIN: "http://127.0.0.1:3015",
        }),
      }),
      expect.objectContaining({
        command: "bun run --filter @eventloom/web dev:playwright",
        env: expect.objectContaining({
          APP_ENV: "local",
          NEXT_PUBLIC_APP_ENV: "local",
          NEXT_PUBLIC_RUNTIME_PROFILE: "fixture",
          NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3015",
          API_UPSTREAM_ORIGIN: "http://127.0.0.1:8787",
        }),
      }),
    ]);
  });
});
