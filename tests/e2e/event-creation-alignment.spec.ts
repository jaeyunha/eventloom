import { expect, test } from "@playwright/test";

const ORGANIZATION_ID = "local-organization";
const SESSION_COOKIE = "better-auth.session_token";
const SESSION_TOKEN = "local-session";

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

async function expectNoPageOverflow(page: import("@playwright/test").Page) {
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

test("event creation uses one centered responsive rail", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const eventCreationUrl = `/admin/organizations/${ORGANIZATION_ID}/events?create=1`;

  await page.setViewportSize({ width: 1728, height: 971 });
  const sessionReady = page.waitForResponse(
    (response) => response.url().endsWith("/api/auth/get-session") && response.ok(),
    { timeout: 90_000 },
  );
  await page.goto(eventCreationUrl);
  await sessionReady;

  const heading = page.getByRole("heading", { level: 1, name: "Event management" });
  const editor = page.locator("#organizer-event-editor");
  const eventName = page.getByRole("textbox", { name: /^Event name\b/u });
  const publicSlug = page.getByRole("textbox", { name: /^Public URL slug\b/u });
  const scheduleLayout = page
    .getByRole("region", { name: "When does this event happen?" })
    .locator('[data-layout="split"]');

  await expect(heading).toBeVisible();
  await expect(editor).toBeVisible();

  const desktopGeometry = await page.evaluate(() => {
    const headerElement = [...document.querySelectorAll("header")].find((element) =>
      element.textContent?.includes("Event management"),
    );
    const editorElement = document.querySelector<HTMLElement>("#organizer-event-editor");
    const contentElement = headerElement?.parentElement;
    if (!headerElement || !editorElement || !contentElement) return null;
    const headerBox = headerElement.getBoundingClientRect();
    const editorBox = editorElement.getBoundingClientRect();
    const contentBox = contentElement.getBoundingClientRect();
    return {
      headerLeft: headerBox.left,
      headerRight: headerBox.right,
      editorLeft: editorBox.left,
      editorRight: editorBox.right,
      editorWidth: editorBox.width,
      centerOffset:
        (editorBox.left + editorBox.right) / 2 - (contentBox.left + contentBox.right) / 2,
    };
  });
  expect(desktopGeometry).not.toBeNull();
  expect(
    Math.abs((desktopGeometry?.headerLeft ?? 0) - (desktopGeometry?.editorLeft ?? 0)),
  ).toBeLessThan(1);
  expect(
    Math.abs((desktopGeometry?.headerRight ?? 0) - (desktopGeometry?.editorRight ?? 0)),
  ).toBeLessThan(1);
  expect(Math.abs(desktopGeometry?.centerOffset ?? 0)).toBeLessThan(1);
  expect(desktopGeometry?.editorWidth).toBeGreaterThanOrEqual(831);
  expect(desktopGeometry?.editorWidth).toBeLessThanOrEqual(833);

  const [eventNameBox, publicSlugBox] = await Promise.all([
    eventName.boundingBox(),
    publicSlug.boundingBox(),
  ]);
  expect(eventNameBox).not.toBeNull();
  expect(publicSlugBox).not.toBeNull();
  expect(Math.abs((eventNameBox?.y ?? 0) - (publicSlugBox?.y ?? 0))).toBeLessThan(1);
  expect(Math.abs((eventNameBox?.width ?? 0) - (publicSlugBox?.width ?? 0))).toBeLessThan(1);
  await expect(scheduleLayout).toHaveCSS("grid-template-columns", /\d+(\.\d+)?px \d+(\.\d+)?px/u);
  await expectNoPageOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("event-creation-desktop.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.reload();
  await expect(editor).toBeVisible();
  await expect(scheduleLayout).toHaveCSS("grid-template-columns", /^\d+(\.\d+)?px$/u);
  await expectNoPageOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("event-creation-tablet.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(editor).toBeVisible();
  const mobileInputs = await Promise.all([eventName.boundingBox(), publicSlug.boundingBox()]);
  expect((mobileInputs[1]?.y ?? 0) > (mobileInputs[0]?.y ?? 0)).toBe(true);
  await expectNoPageOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("event-creation-mobile.png"),
    fullPage: true,
  });

  const createEvent = page.getByRole("button", { name: "Create event", exact: true });
  const mobileNavigation = page.getByRole("navigation", { name: "Mobile navigation" });
  await createEvent.scrollIntoViewIfNeeded();
  await expect(createEvent).toBeVisible();
  await expect(mobileNavigation).toBeVisible();
  const [createEventBox, mobileNavigationBox] = await Promise.all([
    createEvent.boundingBox(),
    mobileNavigation.boundingBox(),
  ]);
  expect(createEventBox).not.toBeNull();
  expect(mobileNavigationBox).not.toBeNull();
  expect(createEventBox?.y ?? 0).toBeLessThan(mobileNavigationBox?.y ?? 0);
  expect((createEventBox?.y ?? 0) + (createEventBox?.height ?? 0)).toBeLessThanOrEqual(
    mobileNavigationBox?.y ?? 0,
  );
  await page.screenshot({
    path: testInfo.outputPath("event-creation-mobile-bottom.png"),
    fullPage: true,
  });
});
