import { expect, test } from "@playwright/test";

test("web and API foundations run as independent healthy services", async ({ page, request }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "A clear path from call for speakers to published agenda.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Foundation configured");
  await expect(page.getByText("Cloudflare Worker", { exact: true })).toBeVisible();
  await expect(page.locator(".wordmark span")).toHaveCSS("background-color", "rgb(80, 101, 232)");

  const webHealth = await request.get("/health");
  expect(webHealth.status()).toBe(200);
  expect(await webHealth.json()).toMatchObject({ status: "ok", service: "web" });

  const apiHealth = await request.get("http://127.0.0.1:8787/api/health");
  expect(apiHealth.status()).toBe(200);
  expect(await apiHealth.json()).toMatchObject({ status: "ok", service: "api" });
});
