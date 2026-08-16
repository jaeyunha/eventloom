import { expect, test } from "@playwright/test";

const ORGANIZATION_ID = "local-organization";
const EVENT_ID = "demo-event";
const eventBase = `/admin/organizations/${ORGANIZATION_ID}/events/${EVENT_ID}`;

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
    overflowing: Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.right > document.documentElement.clientWidth + 1 || rect.left < -1;
      })
      .slice(0, 12)
      .map((element) => ({
        className: element.className,
        parentClassName: element.parentElement?.className,
        rect: element.getBoundingClientRect().toJSON(),
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
      name: "better-auth.session_token",
      value: "local-session",
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
});

test("CFP editor keeps preview, field builder, and taxonomy focused on desktop", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${eventBase}/cfp`);

  await expect(
    page.getByRole("heading", { name: "Configure your call for proposals" }),
  ).toBeVisible();
  await expect(page.getByText("Ready for review")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "CFP configuration sections" })).toBeVisible();

  await expect(page.getByRole("heading", { name: "Event details" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("cfp-event-details-desktop.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Messaging" }).click();
  await expect(page.getByRole("heading", { name: "Messaging" })).toBeVisible();
  await expect(page.getByLabel("Form label")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("cfp-messaging-desktop.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Taxonomy & links" }).click();
  await expect(page.getByLabel("Tracks")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Remove /u }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("cfp-taxonomy-desktop.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Fields & rules" }).click();
  await expect(page.getByText("Proposal questions")).toBeVisible();
  await expect(page.getByText("Nested condition preview")).toHaveCount(0);
  await expect(page.getByText("Conditional visibility")).toBeVisible();
  await expect(page.getByText("View advanced condition structure")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("cfp-fields-rules-desktop.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Public preview" }).click();
  const previewHeading = page.getByRole("heading", { name: "Public form preview" });
  await expect(previewHeading).toBeVisible();
  await expect(page.locator("form form")).toHaveCount(0);
  const previewTop = await previewHeading.evaluate(
    (element) => element.getBoundingClientRect().top,
  );
  expect(previewTop).toBeLessThan(420);
  await expect(page.getByRole("button", { name: "Publish form" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("cfp-public-preview-desktop.png"),
    fullPage: true,
  });
});

test("CFP editor uses one compact section selector and reachable actions on mobile", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${eventBase}/cfp`);

  const sectionSelect = page.getByRole("combobox", { name: "Configuration section" });
  await expect(sectionSelect).toBeVisible();
  const sections = [
    { id: "event-details", heading: "Event details" },
    { id: "messaging", heading: "Messaging" },
    { id: "taxonomy", heading: "Taxonomy & helpful links" },
    { id: "fields-rules", heading: "Fields & rules" },
    { id: "public-preview", heading: "Public form preview" },
  ] as const;

  for (const section of sections) {
    await sectionSelect.selectOption(section.id);
    await expect(page.getByRole("heading", { name: section.heading })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }

  await expect(page.getByRole("heading", { name: "Public form preview" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish form" })).toBeVisible();
  await expect(page.getByText("Ready for review")).toHaveCount(0);

  const actionHeights = await page
    .getByRole("button", { name: /^(Back|Publish form)$/u })
    .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
  expect(new Set(actionHeights.map((height) => Math.round(height))).size).toBe(1);
  const actionOrder = await page
    .getByRole("button", { name: /^(Back|Publish form)$/u })
    .evaluateAll((buttons) => buttons.map((button) => button.textContent?.trim()));
  expect(actionOrder).toEqual(["Back", "Publish form"]);

  await page.screenshot({
    path: testInfo.outputPath("cfp-public-preview-mobile.png"),
    fullPage: true,
  });
});

test("CFP editor keeps every configuration section usable on a compact desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(`${eventBase}/cfp`);

  const sections = [
    { label: "Event details", heading: "Event details" },
    { label: "Messaging", heading: "Messaging" },
    { label: "Taxonomy & links", heading: "Taxonomy & helpful links" },
    { label: "Fields & rules", heading: "Fields & rules" },
    { label: "Public preview", heading: "Public form preview" },
  ] as const;

  for (const section of sections) {
    await page.getByRole("button", { name: section.label }).click();
    await expect(page.getByRole("heading", { name: section.heading })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test("CFP editor lets incomplete draft save attempts reach persistence", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${eventBase}/cfp`);
  await page.getByLabel("Event name").fill("");

  const saveRequest = page.waitForRequest(
    (request) =>
      request.method() === "PUT" &&
      new URL(request.url()).pathname.endsWith(`/events/${EVENT_ID}/config`),
  );
  await page.getByRole("button", { name: "Save changes" }).click();

  await saveRequest;
});

test("CFP editor keeps standard desktop gutters around its document", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${eventBase}/cfp`);

  const insets = await page
    .locator('form[aria-label="Event and CFP configuration"]')
    .evaluate((form) => {
      const viewport = form.parentElement?.parentElement;
      const workspace = viewport?.parentElement;
      if (!viewport || !workspace) throw new Error("CFP viewport ancestry is unavailable.");

      const viewportRect = viewport.getBoundingClientRect();
      const workspaceRect = workspace.getBoundingClientRect();
      return {
        left: viewportRect.left - workspaceRect.left,
        right: workspaceRect.right - viewportRect.right,
      };
    });

  expect(insets.left).toBeGreaterThanOrEqual(24);
  expect(insets.right).toBeGreaterThanOrEqual(24);
});

test("CFP editor keeps historical close confirmation compact", async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date("2026-09-16T09:00:00.000Z") });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${eventBase}/cfp`);

  const checkbox = page.getByRole("checkbox", { name: /Confirm past close date/u });
  await expect(checkbox).toBeVisible();

  const metrics = await checkbox.evaluate((input) => {
    const label = input.closest("label");
    const copy = label?.querySelector("span");
    if (!label || !copy) throw new Error("Historical close confirmation structure is unavailable.");

    const inputRect = input.getBoundingClientRect();
    const copyRect = copy.getBoundingClientRect();
    const labelRect = label.getBoundingClientRect();
    return {
      checkboxWidth: inputRect.width,
      copyWidth: copyRect.width,
      labelHeight: labelRect.height,
    };
  });

  expect(metrics.checkboxWidth).toBeLessThanOrEqual(24);
  expect(metrics.copyWidth).toBeGreaterThanOrEqual(240);
  expect(metrics.labelHeight).toBeLessThanOrEqual(96);
  await checkbox.locator("xpath=ancestor::label").screenshot({
    path: testInfo.outputPath("cfp-historical-close-confirmation-desktop.png"),
  });
});

test("CFP editor switches public preview between full-width views", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${eventBase}/cfp`);
  await page.getByRole("button", { name: "Public preview" }).click();

  const viewToggle = page.getByRole("group", { name: "Public preview view" });
  await expect(viewToggle).toBeVisible();
  await expect(viewToggle.getByRole("radio", { name: "Application form" })).toHaveAttribute(
    "data-state",
    "on",
  );

  const applicationPreview = page.locator('section[aria-label="Public CFP form preview"]');
  await expect(applicationPreview).toBeVisible();
  await expect(applicationPreview).toHaveRole("region");

  await viewToggle.getByRole("radio", { name: "After submission" }).click();
  await expect(applicationPreview).toBeHidden();

  const confirmationPreview = page.locator('section[aria-label="After submission preview"]');
  await expect(confirmationPreview).toBeVisible();
  await expect(confirmationPreview).toHaveRole("region");
  await page.screenshot({
    path: testInfo.outputPath("cfp-after-submission-preview-desktop.png"),
    fullPage: true,
  });
});
