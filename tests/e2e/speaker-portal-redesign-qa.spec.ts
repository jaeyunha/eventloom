import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/auth";
import { installPortalApi } from "./fixtures/portal-api";

const evaluatorEventId = "event-evaluator";
const acceptedSessionTitle = "Designing calm incident response";
const formTaskTitle = "Share speaker details";
const seededFileName = "calm-incident-response.pdf";

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

async function expectCurrentNavigation(page: Page, label: string): Promise<void> {
  const mobile = (page.viewportSize()?.width ?? 0) < 768;
  if (mobile) {
    await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  }
  const navigation = page.getByRole("link", { name: label, exact: true });
  await expect(navigation).toHaveCount(1);
  await expect(navigation).toHaveAttribute("aria-current", "page");
  if (mobile) {
    await page.keyboard.press("Escape");
  }
}

async function openAcceptedSpeakerTasks(page: Page): Promise<void> {
  await page.goto(`/portal/tasks?event=${evaluatorEventId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Requests & tasks" })).toBeVisible();
  await expect(page.getByText("Accepted speaker checklist", { exact: true })).toBeVisible();

  const formTask = page.getByRole("article", { name: formTaskTitle });
  await expect(formTask).toBeVisible();
  await expect(
    formTask.getByText(`Session · ${acceptedSessionTitle}`, { exact: true }),
  ).toBeVisible();
  await expect(
    formTask.getByText("This requirement applies only to this accepted session.", { exact: true }),
  ).toBeVisible();

  const form = formTask.getByRole("region", { name: "Speaker details response" });
  await expect(form.getByRole("button", { name: "Save response" })).toBeVisible();
  await expect(formTask.getByRole("button", { name: "Submit for review" })).toBeVisible();
  await expectCurrentNavigation(page, "Requests & tasks");
}

async function openAcceptedSpeakerFiles(page: Page): Promise<void> {
  await page.goto(`/portal?workspace=files&event=${evaluatorEventId}`);
  await expect(page.getByRole("region", { name: "files workspace" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Uploaded files" })).toBeVisible();
  const fileCard = page.getByRole("article", { name: seededFileName });
  await expect(fileCard).toBeVisible();
  await expect(page.getByRole("form", { name: "Upload another private file" })).toBeVisible();
  await expectCurrentNavigation(page, "Uploaded files");
}

test("speaker tasks and files stay focused on desktop", async ({ authSession, page }, testInfo) => {
  await installPortalApi(page, authSession);
  await page.setViewportSize({ width: 1440, height: 1000 });

  await openAcceptedSpeakerTasks(page);
  await expectNoPageOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("speaker-tasks-desktop.png"),
    fullPage: true,
  });

  await openAcceptedSpeakerFiles(page);
  await expectNoPageOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("speaker-files-desktop.png"),
    fullPage: true,
  });
});

test("speaker tasks and files stay bounded on mobile", async ({ authSession, page }, testInfo) => {
  await installPortalApi(page, authSession);
  await page.setViewportSize({ width: 390, height: 844 });

  await openAcceptedSpeakerTasks(page);
  await expectNoPageOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("speaker-tasks-mobile.png"),
    fullPage: true,
  });

  await openAcceptedSpeakerFiles(page);
  await expectNoPageOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("speaker-files-mobile.png"),
    fullPage: true,
  });
});
