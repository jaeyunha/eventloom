import { expect, test } from "@playwright/test";

test("web and API foundations run as independent healthy services", async ({ page, request }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Move from a call for speakers to a published agenda with care.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the CFP" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Visit speaker portal" })).toBeVisible();

  const webHealth = await request.get("/health");
  expect(webHealth.status()).toBe(200);
  expect(await webHealth.json()).toMatchObject({ status: "ok", service: "web" });

  const apiHealth = await request.get("http://127.0.0.1:8787/api/health");
  expect(apiHealth.status()).toBe(200);
  expect(await apiHealth.json()).toMatchObject({ status: "ok", service: "api" });
});
