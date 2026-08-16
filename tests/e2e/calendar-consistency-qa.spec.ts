import { expect, test } from "@playwright/test";

const ORGANIZATION_ID = "local-organization";
const EVENT_ID = "demo-event";
const SESSION_COOKIE = "better-auth.session_token";
const SESSION_TOKEN = "local-session";
const eventBase = `/admin/organizations/${ORGANIZATION_ID}/events/${EVENT_ID}`;

async function expectNoPageOverflow(page: import("@playwright/test").Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
}

test.beforeEach(async ({ context }) => {
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: SESSION_TOKEN,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
});

test("review scheduling uses inline styled calendars on desktop and mobile", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${eventBase}/reviews`);
  await page.getByRole("tab", { name: "Setup" }).click();

  const picker = page.locator('[data-temporal-picker="single"]').first();
  await expect(picker).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('input[type="datetime-local"]')).toHaveCount(0);
  await expect(picker.locator("[data-calendar-grid]")).toBeVisible();

  const clearButton = picker.getByRole("button", { name: "Clear date" });
  if (await clearButton.isVisible()) await clearButton.click();
  const selectableDay = picker.locator('button[data-muted="false"]:not(:disabled)').first();
  await selectableDay.click();
  await expect(picker.locator('button[data-boundary="true"]')).toHaveCount(1);
  await expectNoPageOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("review-calendar-desktop.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole("tab", { name: "Setup" }).click();
  const mobilePicker = page.locator('[data-temporal-picker="single"]').first();
  await expect(mobilePicker).toBeVisible();
  const previousMonth = mobilePicker.getByRole("button", { name: "Previous month" });
  const nextMonth = mobilePicker.getByRole("button", { name: "Next month" });
  await expect(previousMonth).toBeVisible();
  await expect(nextMonth).toBeVisible();
  const targetSizes = await mobilePicker.evaluate((element) => {
    const previous = element.querySelector<HTMLButtonElement>(
      'button[aria-label="Previous month"]',
    );
    const next = element.querySelector<HTMLButtonElement>('button[aria-label="Next month"]');
    const day = element.querySelector<HTMLButtonElement>('button[data-muted="false"]');
    return {
      previous: previous?.getBoundingClientRect() ?? null,
      next: next?.getBoundingClientRect() ?? null,
      day: day?.getBoundingClientRect() ?? null,
    };
  });
  for (const target of [targetSizes.previous, targetSizes.next, targetSizes.day]) {
    expect(target?.width).toBeGreaterThanOrEqual(44);
    expect(target?.height).toBeGreaterThanOrEqual(44);
  }
  const lastDay = mobilePicker.locator('button[data-muted="false"]:not(:disabled)').last();
  await lastDay.evaluate((element) => element.scrollIntoView({ block: "end" }));
  await expect(lastDay).toBeInViewport();
  const clearance = await lastDay.evaluate((element) => {
    const fixedNavigation = [...document.querySelectorAll<HTMLElement>("nav")].find(
      (navigation) => {
        const style = window.getComputedStyle(navigation);
        return style.position === "fixed" && style.bottom === "0px";
      },
    );
    const dayBox = element.getBoundingClientRect();
    const navigationBox = fixedNavigation?.getBoundingClientRect();
    return {
      dayBottom: dayBox.bottom,
      navigationTop: navigationBox?.top ?? window.innerHeight,
    };
  });
  expect(clearance.dayBottom).toBeLessThanOrEqual(clearance.navigationTop);
  await lastDay.click();
  await expectNoPageOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("review-calendar-mobile-viewport.png"),
  });
  await mobilePicker.screenshot({ path: testInfo.outputPath("review-calendar-mobile-picker.png") });
});

test("content request due dates use the shared calendar", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${eventBase}/deliverables`);
  await page.getByRole("button", { name: "New content request" }).click();

  const dialog = page.getByRole("dialog");
  const picker = dialog.locator('[data-temporal-picker="single"]');
  await expect(picker).toBeVisible();
  await expect(dialog.locator('input[type="date"], input[type="datetime-local"]')).toHaveCount(0);
  const selectableDay = picker.locator('button[data-muted="false"]:not(:disabled)').first();
  await selectableDay.click();
  await expect(picker.locator('button[data-boundary="true"]')).toHaveCount(1);
  await expectNoPageOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("content-request-calendar.png"),
    fullPage: true,
  });
});

test("organization API key expiration uses the shared calendar", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/admin/organizations/${ORGANIZATION_ID}/integrations`);

  const picker = page.locator('[data-temporal-picker="single"]').first();
  await expect(picker).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('input[type="date"], input[type="datetime-local"]')).toHaveCount(0);
  const selectableDay = picker.locator('button[data-muted="false"]:not(:disabled)').first();
  await selectableDay.click();
  await expect(picker.locator('button[data-boundary="true"]')).toHaveCount(1);
  await expectNoPageOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("api-key-expiration-calendar.png"),
    fullPage: true,
  });
});
