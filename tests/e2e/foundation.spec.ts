import { expect, test } from "@playwright/test";

test("web and API foundations run as independent healthy services", async ({ page, request }) => {
  await page.goto("/");

  await expect(page.locator("#hero-title")).toBeVisible();
  await expect(page.getByRole("tablist", { name: "Eventloom workflow preview" })).toBeVisible();
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
test("landing footer links to the public legal pages", async ({ page }) => {
  await page.goto("/");

  const footer = page.locator("footer");
  const privacyLink = footer.getByRole("link", { name: "Privacy" });
  const termsLink = footer.getByRole("link", { name: "Terms" });

  await expect(privacyLink).toHaveAttribute("href", "/privacy");
  await expect(termsLink).toHaveAttribute("href", "/terms");

  await privacyLink.click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();

  await page.goto("/");
  await page.locator("footer").getByRole("link", { name: "Terms" }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeVisible();
});
test("legal pages remain keyboard navigable at the minimum mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/privacy");

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to legal content" });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#legal-content")).toBeFocused();

  const privacyMetrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    sections: document.querySelectorAll("article section").length,
    tocLinks: document.querySelectorAll("aside a").length,
  }));
  expect(privacyMetrics.scrollWidth).toBe(privacyMetrics.innerWidth);
  expect(privacyMetrics.tocLinks).toBe(privacyMetrics.sections);

  await page.goto("/terms");
  const termsMetrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    sections: document.querySelectorAll("article section").length,
    tocLinks: document.querySelectorAll("aside a").length,
  }));
  expect(termsMetrics.scrollWidth).toBe(termsMetrics.innerWidth);
  expect(termsMetrics.tocLinks).toBe(termsMetrics.sections);
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
});
test("unauthenticated organizer routes fail closed before rendering workspace chrome", async ({
  page,
}) => {
  const redirect = page.waitForURL(/\/login$/, { timeout: 15_000 });
  await page.goto("/admin/events");
  await redirect;
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Signed-in organizer", { exact: true })).toHaveCount(0);
});
test("unauthenticated speaker routes redirect to sign-in without rendering portal chrome", async ({
  page,
}) => {
  const redirect = page.waitForURL(/\/login\?next=%2Fportal$/, { timeout: 15_000 });
  await page.goto("/portal");
  await redirect;
  await expect(page.getByText("Speaker portal", { exact: true })).toHaveCount(0);
});
