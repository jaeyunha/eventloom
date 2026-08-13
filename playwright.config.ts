import { defineConfig, devices } from "@playwright/test";

const webPort = process.env.PLAYWRIGHT_WEB_PORT?.trim() || "3015";
const apiPort = process.env.PLAYWRIGHT_API_PORT?.trim() || "8787";
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
      command: "bun run --filter @eventloom/api dev:fixture",
      url: `${apiBaseUrl}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        API_PORT: apiPort,
        APP_ENV: "local",
        RUNTIME_PROFILE: "fixture",
      },
    },
    {
      command: "bun run --filter @eventloom/web dev:playwright",
      url: `${webBaseUrl}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        PLAYWRIGHT_WEB_PORT: webPort,
        APP_ENV: "local",
        NEXT_PUBLIC_APP_ENV: "local",
        NEXT_PUBLIC_RUNTIME_PROFILE: "fixture",
        CLAUDECODE: "",
        CLAUDE_CODE: "",
        NEXT_PUBLIC_APP_URL: webBaseUrl,
        API_UPSTREAM_ORIGIN: apiBaseUrl,
      },
    },
  ],
});
