import { defineConfig, devices } from "@playwright/test";

const webPort = process.env.PLAYWRIGHT_WEB_PORT?.trim() || "3015";
const apiPort = process.env.PLAYWRIGHT_API_PORT?.trim() || "8787";
const apiInspectorPort = process.env.PLAYWRIGHT_API_INSPECTOR_PORT?.trim() || "9232";
const nextDistDir = process.env.PLAYWRIGHT_NEXT_DIST_DIR?.trim() || `.next-playwright-${webPort}`;
const webBaseUrl = `http://127.0.0.1:${webPort}`;
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: webBaseUrl,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "bun --no-env-file scripts/dev/run-fixture-api.mjs",
      url: `${apiBaseUrl}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        API_PORT: apiPort,
        API_INSPECTOR_PORT: apiInspectorPort,
        APP_ENV: "local",
        FIXTURE_API_ORIGIN: apiBaseUrl,
        FIXTURE_WEB_ORIGIN: webBaseUrl,
        RUNTIME_PROFILE: "fixture",
      },
    },
    {
      command: "bun --no-env-file scripts/dev/run-local-service.ts web-playwright",
      url: `${webBaseUrl}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        PLAYWRIGHT_WEB_PORT: webPort,
        APP_ENV: "local",
        RUNTIME_PROFILE: "fixture",
        NEXT_PUBLIC_APP_ENV: "local",
        NEXT_PUBLIC_RUNTIME_PROFILE: "fixture",
        CLAUDECODE: "",
        CLAUDE_CODE: "",
        NEXT_DIST_DIR: nextDistDir,
        NEXT_PUBLIC_APP_URL: webBaseUrl,
        API_UPSTREAM_ORIGIN: apiBaseUrl,
      },
    },
  ],
});
