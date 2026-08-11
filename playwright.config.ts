import { defineConfig, devices } from "@playwright/test";

const webBaseUrl = "http://127.0.0.1:3015";
const apiBaseUrl = "http://127.0.0.1:8787";

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
      command: "bun run --filter @open-sessionboard/api dev",
      url: `${apiBaseUrl}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "bun run --filter @open-sessionboard/web dev",
      url: `${webBaseUrl}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        APP_ENV: "local",
        NEXT_PUBLIC_APP_ENV: "local",
        CLAUDECODE: "",
        CLAUDE_CODE: "",
        NEXT_PUBLIC_APP_URL: webBaseUrl,
        API_UPSTREAM_ORIGIN: apiBaseUrl,
        NEXT_PUBLIC_API_URL: apiBaseUrl,
        NEXT_PUBLIC_ORGANIZATION_ID: "ai-engineer",
      },
    },
  ],
});
