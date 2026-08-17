import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { APIResponse, BrowserContext, Locator, Page, TestInfo } from "@playwright/test";
import { CFP_FIXTURE_LANGUAGE_OPTIONS } from "./fixtures/cfp-api";

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
  name:
    | "desktop"
    | "mobile"
    | "no-title-desktop"
    | "reviews-desktop"
    | "reviews-assignments-desktop"
    | "reviews-assignments-mobile"
    | "reviews-results-desktop"
    | "submissions-mobile"
    | "submission-detail-mobile"
    | "sync-history",
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

async function expectAllHidden(locator: Locator): Promise<void> {
  const count = await locator.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    await expect(locator.nth(index)).toBeHidden();
  }
}

async function responseData<T>(response: APIResponse): Promise<T> {
  const payload = (await response.json()) as T | { data: T };
  return typeof payload === "object" && payload !== null && "data" in payload
    ? payload.data
    : payload;
}

async function setSessionCookie(context: BrowserContext, token: string): Promise<void> {
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: token,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function createOpaqueTitleSubmission(page: Page, context: BrowserContext): Promise<string> {
  const email = "identifier-no-title@example.test";
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    data: {
      email,
      password: "StrongPass1!",
      name: "Identifier Audit Applicant",
    },
  });
  expect(signUp.status()).toBe(200);
  const account = await responseData<{ token: string }>(signUp);
  await setSessionCookie(context, account.token);
  const session = await page.request.get("/api/auth/get-session");
  expect(session.status()).toBe(200);
  expect(await responseData<{ user: { email: string } }>(session)).toMatchObject({
    user: { email },
  });

  const cfpBase = `/api/cfp/organizations/${ORGANIZATION_ID}/events/${EVENT_ID}`;
  const create = await page.request.post(`${cfpBase}/forms/main-cfp/drafts`, {
    headers: { "idempotency-key": "identifier-no-title-create" },
  });
  expect(create.status()).toBe(201);
  const created = await responseData<{ id: string; version: number }>(create);
  let version = created.version;

  for (const completedStep of ["welcome", "account", "submission"] as const) {
    const saved = await page.request.patch(`${cfpBase}/submissions/${created.id}/draft`, {
      headers: { "idempotency-key": `identifier-no-title-${completedStep}` },
      data: {
        expectedVersion: version,
        completedStep,
        ...(completedStep === "submission"
          ? {
              answers: {
                title: created.id,
                format: "Breakout Session",
                level: "Intermediate",
                track: "Platform & Infrastructure",
                abstract: "A supported workflow fixture for identifier-safe title presentation.",
              },
            }
          : {}),
      },
    });
    expect(saved.status()).toBe(200);
    version = (await responseData<{ version: number }>(saved)).version;
  }

  const participants = await page.request.put(`${cfpBase}/submissions/${created.id}/participants`, {
    headers: { "idempotency-key": "identifier-no-title-participants" },
    data: {
      expectedVersion: version,
      participants: [
        {
          id: "participant-identifier-audit",
          firstName: "Casey",
          lastName: "Applicant",
          email,
          role: "primary",
          biography: "A deterministic applicant profile for browser QA.",
          answers: {},
        },
      ],
      secondaryContacts: [],
    },
  });
  expect(participants.status()).toBe(200);
  version = (await responseData<{ version: number }>(participants)).version;

  const reviewStep = await page.request.patch(`${cfpBase}/submissions/${created.id}/draft`, {
    headers: { "idempotency-key": "identifier-no-title-review-step" },
    data: { expectedVersion: version, completedStep: "review" },
  });
  expect(reviewStep.status()).toBe(200);
  version = (await responseData<{ version: number }>(reviewStep)).version;

  const review = await page.request.post(`${cfpBase}/submissions/${created.id}/review`, {
    headers: { "idempotency-key": "identifier-no-title-review" },
  });
  expect(review.status()).toBe(200);
  expect(await responseData<{ canSubmit: boolean }>(review)).toMatchObject({ canSubmit: true });

  const submit = await page.request.post(`${cfpBase}/submissions/${created.id}/submit`, {
    headers: { "idempotency-key": "identifier-no-title-submit" },
    data: { expectedVersion: version },
  });
  expect(submit.status()).toBe(200);
  await setSessionCookie(context, SESSION_TOKEN);
  return created.id;
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
  await expect(history.getByText(/^Authorized organizer - /u)).toHaveCount(2, {
    timeout: 30_000,
  });
  await expectAllHidden(history.getByText("local-organizer", { exact: true }));
  await expect(history).not.toContainText(/\b(?:Version|v)\s*\d+\b/iu);
  await expect(
    history.getByRole("button", { name: /Restore Created revision from/u }),
  ).toBeVisible();
}

test("session history shows authorized actors without persisted version counters", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const title = "Inclusive Reliability Workshop - Elodie Park and Hana Kim";
  await createSessionHistory(page, "identifier-audit-session-e2e", title);
  const history = await openHistory(page, title);
  await expectIdentifierSafeHistory(history);
  const advancedDetails = history.locator("details").first();
  await advancedDetails.locator("summary").click();
  await expect(advancedDetails.getByText("local-organizer", { exact: true })).toBeVisible();
  await advancedDetails.locator("summary").click();
  await history.getByRole("button", { name: /Restore Created revision from/u }).click();
  await expect(
    page.getByRole("status").filter({
      hasText: "Session content restored from the selected revision.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("status")).not.toContainText(/\b(?:Version|v)\s*\d+\b/iu);
  const historyList = history.locator("ol");
  await historyList.scrollIntoViewIfNeeded();
  await captureEvidence(historyList, testInfo, "desktop");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(history).toContainText(title);
  expect(await history.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
  const firstHistoryCard = historyList.locator("li").first();
  await firstHistoryCard.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -160));
  await captureEvidence(firstHistoryCard, testInfo, "mobile");
});

test("organizer assignment and decision surfaces keep identifiers in advanced data only", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  expect(CFP_FIXTURE_LANGUAGE_OPTIONS).toEqual(["English"]);
  const opaqueSubmissionId = await createOpaqueTitleSubmission(page, context);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${eventBase}/submissions`);
  await expect(page.getByRole("heading", { level: 1, name: "Submissions" })).toBeVisible({
    timeout: 30_000,
  });
  const noTitleRow = page.locator("tbody tr").filter({ hasText: "No title" }).first();
  await expect(noTitleRow).toBeVisible();
  await expect(noTitleRow).not.toContainText(opaqueSubmissionId);
  await captureEvidence(noTitleRow, testInfo, "no-title-desktop");

  await page.goto(`${eventBase}/reviews`);
  await expect(page.getByRole("heading", { level: 1, name: "Program review" })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("tab", { name: "Setup" }).click();
  await expect(page.locator('[role="tabpanel"]:visible')).not.toContainText(
    /\b(?:Version|v)\s*\d+\b/iu,
  );

  await page.getByRole("tab", { name: "Assignments" }).click();
  const assignments = page.locator('[role="tabpanel"]:visible');
  const submissionSelector = assignments.getByLabel("Proposal", { exact: true });
  await expect(submissionSelector).toBeVisible();
  expect((await submissionSelector.locator("option").allTextContents()).join(" ")).not.toMatch(
    /\b(?:SUB-[A-Z0-9-]+|submission_[\w-]+)\b/u,
  );
  await expect(assignments).not.toContainText(/\bSUB-[A-Z0-9-]+\b/u);
  await expect(assignments).not.toContainText(/\bassignment_[\w-]+\b/iu);
  const assignmentAction = assignments
    .getByRole("button", { name: /Manage assignment|View assignment/u })
    .first();
  await expect(assignmentAction).toBeVisible({ timeout: 30_000 });
  await assignmentAction.click();
  await expect(assignments).not.toContainText(/\bSUB-[A-Z0-9-]+\b/u);
  await expect(assignments).not.toContainText(/\bassignment_[\w-]+\b/iu);
  const responsiveAssignmentControls = assignments.locator('[data-assignment-controls="true"]');
  await captureEvidence(responsiveAssignmentControls, testInfo, "reviews-assignments-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(responsiveAssignmentControls).toBeVisible();
  expect(
    await responsiveAssignmentControls.evaluate((element) => ({
      display: window.getComputedStyle(element).display,
      fitsViewport: element.scrollWidth <= element.clientWidth,
    })),
  ).toEqual({ display: "grid", fitsViewport: true });
  await captureEvidence(responsiveAssignmentControls, testInfo, "reviews-assignments-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.getByRole("tab", { name: "Results" }).click();
  const decisions = page.locator('[role="tabpanel"]:visible');
  await expect(decisions).not.toContainText(/\bSUB-[A-Z0-9-]+\b/u);
  await expect(decisions).not.toContainText(/\b(?:round|rubric) revision\b/iu);
  await expect(decisions).not.toContainText(/\b(?:Version|v)\s*\d+\b/iu);
  await captureEvidence(decisions.locator("table").first(), testInfo, "reviews-results-desktop");
  await decisions.getByRole("button", { name: "Review" }).first().click();
  const editor = decisions.locator('[id^="decision-editor-"] > article');
  const acceptedTitle = (await editor.getByRole("heading", { level: 3 }).textContent())?.trim();
  expect(acceptedTitle).toBeTruthy();
  await expect(editor).not.toContainText(/\bSUB-[A-Z0-9-]+\b/u);
  await editor.getByLabel("Decision", { exact: true }).selectOption("accepted");
  await editor.getByLabel(/Written reason/u).fill("Accepted after organizer review.");
  await editor
    .getByRole("checkbox", { name: /I confirm this is a human organizer decision/u })
    .check();
  await editor.getByRole("button", { name: /Confirm human decision/u }).click();
  await expect(editor.getByRole("status")).toContainText("Decision saved.", {
    timeout: 30_000,
  });
  await captureEvidence(editor, testInfo, "reviews-desktop");

  const syncedHistory = await openHistory(page, acceptedTitle ?? "");
  await expect(syncedHistory.getByText(/^Authorized organizer - /u).first()).toBeVisible({
    timeout: 30_000,
  });
  await expectAllHidden(syncedHistory.getByText("local-organizer", { exact: true }));
  const syncAdvanced = syncedHistory.locator("details").first();
  await syncAdvanced.locator("summary").click();
  await expect(syncAdvanced.getByText("local-organizer", { exact: true })).toBeVisible();
  await captureEvidence(syncedHistory.locator("ol"), testInfo, "sync-history");
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

  await submissions.locator('a[href*="/submissions/"]').first().click();
  const detail = page.locator('[data-slot="sheet-content"]');
  await expect(detail).toBeVisible();
  await expect(detail).not.toContainText(/\bsubmission_[\w-]+\b/iu);
  await expect(detail).not.toContainText(/\b(?:Version|v)\s*\d+\b/iu);
  await captureEvidence(detail, testInfo, "submission-detail-mobile");
});
