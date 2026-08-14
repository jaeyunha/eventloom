import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/auth";
import { installPortalApi } from "./fixtures/portal-api";

test.use({ authRole: "speaker" });

async function expectNoPageOverflow(page: Page): Promise<void> {
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

test("speaker tasks and files stay focused on desktop", async ({ authSession, page }, testInfo) => {
  await installPortalApi(page, authSession);
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto("/portal?workspace=tasks");
  await expect(page.getByRole("heading", { level: 1, name: "Requests & tasks" })).toBeVisible();
  const formTask = page.getByRole("article", { name: "Speaker details" });
  await expect(formTask.getByRole("button", { name: "Save response" })).toBeVisible();
  await expect(formTask.getByRole("button", { name: "Submit for review" })).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("speaker-tasks-desktop.png"),
    fullPage: true,
  });

  await page.goto("/portal?workspace=files");
  await expect(page.getByRole("heading", { level: 2, name: "Uploaded files" })).toBeVisible();
  await expect(page.getByRole("article", { name: "calm-incident-response.pdf" })).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("speaker-files-desktop.png"),
    fullPage: true,
  });
});

test("speaker tasks and files stay bounded on mobile", async ({ authSession, page }, testInfo) => {
  await installPortalApi(page, authSession);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/portal?workspace=tasks");
  await expect(page.getByRole("heading", { level: 1, name: "Requests & tasks" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Speaker details" })).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("speaker-tasks-mobile.png"),
    fullPage: true,
  });

  await page.goto("/portal?workspace=files");
  await expect(page.getByRole("heading", { level: 2, name: "Uploaded files" })).toBeVisible();
  await expect(page.getByRole("article", { name: "calm-incident-response.pdf" })).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("speaker-files-mobile.png"),
    fullPage: true,
  });
});
