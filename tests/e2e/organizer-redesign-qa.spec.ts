import { expect, test } from "@playwright/test";

const ORGANIZATION_ID = "local-organization";
const EVENT_ID = "demo-event";
const SESSION_COOKIE = "better-auth.session_token";
const SESSION_TOKEN = "local-session";
const organizationBase = `/admin/organizations/${ORGANIZATION_ID}`;
const eventBase = `${organizationBase}/events/${EVENT_ID}`;

async function expectNoPageOverflow(page: import("@playwright/test").Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
    overflowing: Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.right > document.documentElement.clientWidth + 1 || rect.left < -1;
      })
      .slice(0, 8)
      .map((element) => ({
        className: element.className,
        tag: element.tagName,
        text: element.textContent?.trim().slice(0, 80),
      })),
  }));
  expect(dimensions.body, JSON.stringify(dimensions.overflowing)).toBeLessThanOrEqual(
    dimensions.viewport,
  );
  expect(dimensions.document, JSON.stringify(dimensions.overflowing)).toBeLessThanOrEqual(
    dimensions.viewport,
  );
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
test("CFP editor uses one constrained date-range calendar", async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date("2026-08-16T18:00:00.000Z"));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${eventBase}/cfp`);

  const schedule = page.getByRole("region", { name: "When is the CFP open?" });
  await expect(schedule).toBeVisible({ timeout: 30_000 });
  await expect(schedule.getByText("Individual days")).toHaveCount(0);
  await expect(schedule.locator('input[type="date"], input[type="time"]')).toHaveCount(0);

  await expect(schedule.getByRole("button", { name: "Sat, Aug 15, 2026" })).toBeDisabled();
  const openDate = schedule.getByRole("button", { name: "Thu, Aug 20, 2026" });
  await openDate.click();
  await expect(openDate).toBeDisabled();
  await expect(schedule.getByRole("button", { name: "Fri, Aug 21, 2026" })).toBeEnabled();
  await expectNoPageOverflow(page);

  await page.screenshot({
    path: testInfo.outputPath("cfp-date-range-calendar.png"),
    fullPage: true,
  });
});

test("People tab strip owns only intentional horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${organizationBase}/members`);

  const tabList = page.getByRole("tablist", { name: "People workspace sections" });
  await expect(tabList).toBeVisible();

  const overflow = await tabList.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      x: style.overflowX,
      y: style.overflowY,
    };
  });
  expect(overflow.x).toBe("auto");
  expect(overflow.y).toBe("hidden");
});

test("organizer content requests default to standard upload formats", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${eventBase}/deliverables`);
  await expect(page.getByRole("heading", { level: 1, name: "Content collection" })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: "New content request" }).click();
  await expect(page.getByLabel("File type")).toContainText("Slides");
  const fileFormats = page.getByRole("group", { name: "File formats (required)" });
  await expect(fileFormats.getByLabel("PDF")).toBeChecked();
  await expect(fileFormats.getByLabel("PowerPoint")).toBeChecked();
  await expect(page.getByLabel("Maximum file size (MB)")).toHaveValue("100");
  await page.screenshot({
    path: testInfo.outputPath("new-content-request-formats.png"),
    fullPage: true,
  });
});

test("organizer uses the redesigned content workflow on desktop", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto(`${eventBase}/deliverables`);
  await expect(page.getByRole("heading", { level: 1, name: "Content collection" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Content collection sections" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open request" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Open request" }).first().click();
  await expect(page.getByRole("dialog").getByText("Request detail")).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("content-requests-desktop.png"),
    fullPage: true,
  });

  await page.goto(`${eventBase}/sessions`);
  await expect(page.getByRole("heading", { level: 1, name: "Sessions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Session list" })).toBeVisible();
  await expect(page.getByText("Session content", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Change history" })).toBeVisible();
  await expectNoPageOverflow(page);

  await page.goto(`${eventBase}/files`);
  await expect(page.getByRole("heading", { level: 1, name: "Content collection" })).toBeVisible();
  await expect(page.getByText("No files have been submitted yet")).toBeVisible();
  await expect(page.getByRole("link", { name: "Create a content request" })).toBeVisible();
  await expect(page.locator("[data-file-family-row]")).toHaveCount(0);
  await expect(page.getByText("Loading Files library")).toHaveCount(0);
  await expectNoPageOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("files-library-desktop.png"),
    fullPage: true,
  });

  await page.goto(`${organizationBase}/integrations`);
  await expect(page.getByRole("heading", { level: 1, name: "Integrations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connection ownership" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Event bindings" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Organization API keys" })).toBeVisible();
  await expectNoPageOverflow(page);
});

test("organizer keeps content operations bounded on mobile", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto(`${eventBase}/deliverables`);
  await expect(page.getByRole("heading", { level: 1, name: "Content collection" })).toBeVisible();
  await expect(page.getByText("Switch section: Requests")).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("content-requests-mobile.png"),
    fullPage: true,
  });

  await page.goto(`${eventBase}/sessions`);
  await expect(page.getByRole("heading", { level: 1, name: "Sessions" })).toBeVisible();
  await expect(page.getByText("Session content", { exact: true })).toBeVisible();
  await expectNoPageOverflow(page);

  await page.goto(`${eventBase}/files`);
  await expect(page.getByRole("heading", { level: 1, name: "Content collection" })).toBeVisible();
  await expect(page.getByText("No files have been submitted yet")).toBeVisible();
  await expect(page.locator("[data-file-family-row]")).toHaveCount(0);
  await expect(page.getByText("Loading Files library")).toHaveCount(0);
  await expectNoPageOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("files-library-mobile.png"),
    fullPage: true,
  });

  await page.goto(`${organizationBase}/integrations`);
  await expect(page.getByRole("heading", { level: 1, name: "Integrations" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Integration settings" })).toBeVisible();
  await expectNoPageOverflow(page);
});
