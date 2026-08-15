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

async function openAcceptedSpeakerTasks(page: Page): Promise<void> {
  await page.goto(`/portal/tasks?event=${evaluatorEventId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Requests & tasks" })).toBeVisible();
  await expect(page.getByText("Accepted speaker checklist", { exact: true })).toBeVisible();

  const inbox = page.getByRole("navigation", { name: "Task inbox" });
  await inbox.getByRole("button", { name: new RegExp(`^${formTaskTitle}`) }).click();

  const formTask = page.getByRole("article", { name: formTaskTitle });
  await expect(formTask).toBeVisible();
  await expect(
    formTask.getByText(`Session · ${acceptedSessionTitle}`, { exact: true }),
  ).toBeVisible();
  await expect(
    formTask.getByText("Applies only to this accepted session.", { exact: true }),
  ).toBeVisible();

  const form = formTask.getByRole("region", { name: "Speaker details" });
  await expect(form.getByRole("button", { name: "Save draft" })).toBeVisible();
  await expect(form.getByRole("button", { name: "Submit response" })).toBeVisible();
  await expect(form.getByRole("region", { name: "Workspace actions" })).toHaveCSS(
    "position",
    "sticky",
  );
}

async function openAcceptedSpeakerFiles(page: Page): Promise<void> {
  await page.goto(`/portal?workspace=files&event=${evaluatorEventId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Files" })).toBeVisible();
  await expect(page.getByLabel("Session attribution")).toHaveValue("submission-evaluator");
  await expect(
    page.getByRole("heading", { level: 2, name: `Files for ${acceptedSessionTitle}` }),
  ).toBeVisible();

  const fileDetail = page.getByRole("region", { name: seededFileName });
  await expect(fileDetail.getByRole("heading", { level: 2, name: seededFileName })).toBeVisible();
  await expect(fileDetail.getByText("Session ID", { exact: true })).toBeVisible();
  await expect(fileDetail.getByText("submission-evaluator", { exact: true })).toBeVisible();
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
