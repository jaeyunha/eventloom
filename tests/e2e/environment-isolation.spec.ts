import { expect, test } from "@playwright/test";

const expectedWebPort = process.env.PLAYWRIGHT_WEB_PORT?.trim() || "3015";
const expectedApiPort = process.env.PLAYWRIGHT_API_PORT?.trim() || "8787";

test("runs Playwright against its isolated fixture web and API services", async ({
  page,
  request,
}) => {
  await page.goto("/health");
  expect(new URL(page.url()).port).toBe(expectedWebPort);

  const directApiResponse = await request.get(`http://127.0.0.1:${expectedApiPort}/api/health`);
  expect(directApiResponse.status()).toBe(200);
  expect(await directApiResponse.json()).toEqual(
    expect.objectContaining({
      environment: "local",
      runtimeProfile: "fixture",
    }),
  );

  const apiHealth = await page.evaluate(async () => {
    const response = await fetch("/api/health");
    return {
      status: response.status,
      body: (await response.json()) as {
        readonly environment?: string;
        readonly runtimeProfile?: string;
      },
    };
  });

  expect(apiHealth).toEqual({
    status: 200,
    body: expect.objectContaining({
      environment: "local",
      runtimeProfile: "fixture",
    }),
  });
});
