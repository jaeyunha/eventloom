import { expect, test } from "@playwright/test";

test("web and API foundations run as independent healthy services", async ({ page, request }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Run your speaker program from first submission to published agenda.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the CFP" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Sign in", exact: true }).first()).toBeVisible();

  const webHealth = await request.get("/health");
  expect(webHealth.status()).toBe(200);
  expect(await webHealth.json()).toMatchObject({ status: "ok", service: "web" });

  const apiPort = process.env.PLAYWRIGHT_API_PORT?.trim() || "8787";
  const apiHealth = await request.get(`http://127.0.0.1:${apiPort}/api/health`);
  expect(apiHealth.status()).toBe(200);
  expect(await apiHealth.json()).toMatchObject({ status: "ok", service: "api" });
});
test("unauthenticated organizer routes fail closed before rendering workspace chrome", async ({
  page,
}) => {
  await page.goto("/admin/events");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Signed-in organizer", { exact: true })).toHaveCount(0);
});
test("unauthenticated speaker routes redirect to sign-in without rendering portal chrome", async ({
  page,
}) => {
  await page.goto("/portal");
  await expect(page).toHaveURL(/\/login\?next=%2Fportal$/);
  await expect(page.getByText("Speaker portal", { exact: true })).toHaveCount(0);
});
