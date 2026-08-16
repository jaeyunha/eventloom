import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { Locator, Page, TestInfo } from "@playwright/test";

const ORGANIZATION_ID = "local-organization";
const EVENT_ID = "demo-event";
const SESSION_COOKIE = "better-auth.session_token";
const SESSION_TOKEN = "local-session";
const eventBase = `/admin/organizations/${ORGANIZATION_ID}/events/${EVENT_ID}`;
const screenshotDirectory = process.env.IDENTIFIER_AUDIT_SCREENSHOT_DIR?.trim();

test.setTimeout(60_000);

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

async function captureEvidence(
  target: Locator,
  testInfo: TestInfo,
  name: "desktop" | "mobile" | "submissions-mobile",
): Promise<void> {
  const image = await target.screenshot();
  await testInfo.attach(`identifier-audit-${name}`, {
    body: image,
    contentType: "image/png",
  });
  if (!screenshotDirectory) return;
  await mkdir(screenshotDirectory, { recursive: true });
  await target.screenshot({
    path: path.join(screenshotDirectory, `identifier-audit-ui-${name}.png`),
  });
}

async function createSessionHistory(page: Page, sessionId: string, title: string): Promise<void> {
  const createResponse = await page.request.post(
    `/api/admin/organizations/${ORGANIZATION_ID}/events/${EVENT_ID}/sessions`,
    {
      data: {
        id: sessionId,
        title,
        description: "Prepared for organizer review.",
        durationMinutes: 30,
      },
    },
  );
  expect(createResponse.status()).toBe(201);
  const created = (await createResponse.json()) as { data: { version: number } };
  const updateResponse = await page.request.patch(
    `/api/admin/organizations/${ORGANIZATION_ID}/events/${EVENT_ID}/sessions/${sessionId}`,
    {
      data: {
        expectedVersion: created.data.version,
        description: "Updated after organizer review.",
        contentStatus: "Needs changes",
      },
    },
  );
  expect(updateResponse.ok()).toBe(true);
  const updated = (await updateResponse.json()) as { data: { version: number } };
  expect(updated.data.version).toBe(created.data.version + 1);
}

async function openHistory(page: Page, title: string): Promise<Locator> {
  await page.goto(`${eventBase}/sessions`);
  await expect(page.getByRole("heading", { level: 1, name: "Sessions" })).toBeVisible({
    timeout: 30_000,
  });
  const sessionButton = page.getByRole("button", { name: title, exact: false });
  await expect(sessionButton).toHaveCount(1);
  await sessionButton.click();

  return page.locator("section").filter({
    has: page.getByRole("heading", { name: "Change history", exact: true }),
  });
}

async function expectIdentifierSafeHistory(history: Locator): Promise<void> {
  await expect(history).toHaveCount(1);
  await expect(history.getByText("Loading session history...", { exact: true })).toBeHidden({
    timeout: 30_000,
  });
  await expect(history.getByText(/^Local Organizer - /u)).toHaveCount(2, {
    timeout: 30_000,
  });
  await expect(history).not.toContainText("local-organizer");
  await expect(history).not.toContainText(/\b(?:Version|v)\s*\d+\b/iu);
  await expect(history.getByRole("button", { name: "Restore this revision" })).toBeVisible();
}

test("session history shows named actors without persisted version counters", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const title = "多言語セッション — Élodie & 김하늘";
  await createSessionHistory(page, "identifier-audit-session-e2e", title);
  const history = await openHistory(page, title);
  await expectIdentifierSafeHistory(history);
  const historyList = history.locator("ol");
  await historyList.scrollIntoViewIfNeeded();
  await captureEvidence(historyList, testInfo, "desktop");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(history).toContainText(title);
  expect(await history.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
  await historyList.scrollIntoViewIfNeeded();
  await captureEvidence(historyList, testInfo, "mobile");
});

test("mobile submission collection keeps titles primary and technical labels hidden", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${eventBase}/submissions`);
  await expect(page.getByRole("heading", { level: 1, name: "Submissions" })).toBeVisible({
    timeout: 30_000,
  });
  const submissions = page.locator("[data-submission-collection='true']");
  await expect(submissions).toBeVisible();
  await expect(submissions.getByText("Loading submissions", { exact: true })).toBeHidden({
    timeout: 30_000,
  });
  await expect(submissions.locator('a[href*="/submissions/"]').first()).toBeVisible();
  await expect(submissions).not.toContainText(/\bsubmission_[\w-]+\b/iu);
  await expect(submissions).not.toContainText(/\b(?:Version|v)\s*\d+\b/iu);
  expect(
    await page.locator("html").evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await captureEvidence(submissions.locator("tbody tr").first(), testInfo, "submissions-mobile");
});
