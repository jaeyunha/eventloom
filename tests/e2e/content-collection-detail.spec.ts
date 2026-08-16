import { expect, test } from "@playwright/test";

const webOrigin = `http://127.0.0.1:${process.env.PLAYWRIGHT_WEB_PORT?.trim() || "3015"}`;
const eventPath = "/admin/organizations/local-organization/events/demo-event";

test.use({ deviceScaleFactor: 2 });

test("content collection file review stays aligned in light and dark themes", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: "local-speaker-session",
      url: webOrigin,
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    },
  ]);
  await page.addInitScript(() => window.localStorage.setItem("theme", "light"));
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto("/portal/tasks?event=demo-event");
  const request = page.getByRole("article", { name: "Upload your presentation slides" });
  await expect(request).toBeVisible();
  await request.getByLabel("Choose slides").setInputFiles({
    name: "session-slides.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nEventloom visual QA\n"),
  });
  await request.getByRole("button", { name: "Upload and submit" }).click();
  await expect(
    page.getByRole("button", { name: /Upload your presentation slides Submitted/u }),
  ).toBeVisible();

  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: "local-session",
      url: webOrigin,
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    },
  ]);
  await page.goto(`${eventPath}/deliverables`);
  await expect(page.getByRole("heading", { level: 1, name: "Content collection" })).toBeVisible();

  const assignmentTable = page.getByRole("table", {
    name: "Per-speaker content request assignments and due dates",
  });
  await expect(assignmentTable).toBeVisible();
  const verticalAlignments = await assignmentTable
    .locator("tbody th, tbody td")
    .evaluateAll((cells) => cells.map((cell) => window.getComputedStyle(cell).verticalAlign));
  expect(new Set(verticalAlignments)).toEqual(new Set(["middle"]));
  const assignmentTableViewportBox = await assignmentTable.locator("..").boundingBox();
  const openRequestButton = assignmentTable.getByRole("button", { name: "Open request" });
  const openRequestButtonBox = await openRequestButton.boundingBox();
  expect(assignmentTableViewportBox).not.toBeNull();
  expect(openRequestButtonBox).not.toBeNull();
  expect((openRequestButtonBox?.x ?? 0) + (openRequestButtonBox?.width ?? 0)).toBeLessThanOrEqual(
    (assignmentTableViewportBox?.x ?? 0) + (assignmentTableViewportBox?.width ?? 0) + 1,
  );

  const themeToggle = page.getByRole("button", { name: "Choose color theme" });
  const themeToggleBox = await themeToggle.boundingBox();
  expect(themeToggleBox).not.toBeNull();
  expect(
    Math.abs((themeToggleBox?.width ?? 0) - (themeToggleBox?.height ?? 0)),
  ).toBeLessThanOrEqual(1);

  await page.screenshot({
    path: testInfo.outputPath("content-collection-light.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1728, height: 978 });
  await page.screenshot({
    path: testInfo.outputPath("content-collection-reference-light.png"),
    fullPage: true,
  });

  await openRequestButton.click();
  const requestDialog = page.getByRole("dialog");
  await expect(requestDialog.getByRole("heading", { name: "Request detail" })).toBeVisible();
  await requestDialog.getByRole("button", { name: "Inspect file versions" }).click();

  const fileReviewDialog = page.getByRole("dialog");
  await expect(fileReviewDialog.getByRole("heading", { name: "File review" })).toBeVisible();
  await expect(fileReviewDialog.getByRole("tab", { name: "Overview" })).toBeVisible();
  await expect(fileReviewDialog.getByRole("tab", { name: /Comments/u })).toBeVisible();
  await expect(fileReviewDialog.getByRole("tab", { name: /Versions/u })).toBeVisible();
  await expect(fileReviewDialog.getByText("Authoritative pointers", { exact: true })).toHaveCount(
    0,
  );

  await page.screenshot({
    path: testInfo.outputPath("file-review-light.png"),
    fullPage: true,
  });

  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "File review" })).not.toBeVisible();
  await expect(themeToggle).toBeVisible();
  await themeToggle.click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/u);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitemradio", { name: "Dark" })).not.toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("content-collection-reference-dark.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Open request" }).click();
  const darkRequestDialog = page.getByRole("dialog");
  await expect(darkRequestDialog.getByRole("heading", { name: "Request detail" })).toBeVisible();
  await darkRequestDialog.getByRole("button", { name: "Inspect file versions" }).click();
  const darkFileReviewDialog = page.getByRole("dialog");
  await expect(darkFileReviewDialog.getByRole("heading", { name: "File review" })).toBeVisible();
  await expect(darkFileReviewDialog.getByRole("tab", { name: "Overview" })).toBeVisible();
  await expect(darkFileReviewDialog.getByRole("tab", { name: /Comments/u })).toBeVisible();
  await expect(darkFileReviewDialog.getByRole("tab", { name: /Versions/u })).toBeVisible();
  await darkFileReviewDialog.evaluate(async (dialog) => {
    await Promise.all(dialog.getAnimations().map((animation) => animation.finished));
  });
  const darkFileReviewBox = await darkFileReviewDialog.boundingBox();
  const darkViewport = page.viewportSize();
  expect(darkFileReviewBox).not.toBeNull();
  expect(darkViewport).not.toBeNull();
  expect(darkFileReviewBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((darkFileReviewBox?.x ?? 0) + (darkFileReviewBox?.width ?? 0)).toBeLessThanOrEqual(
    darkViewport?.width ?? 0,
  );

  await page.screenshot({
    path: testInfo.outputPath("file-review-dark.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileFileReviewBox = await darkFileReviewDialog.boundingBox();
  expect(mobileFileReviewBox).not.toBeNull();
  expect(mobileFileReviewBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect(mobileFileReviewBox?.width ?? 391).toBeLessThanOrEqual(390);
  const versionsTab = darkFileReviewDialog.getByRole("tab", { name: /Versions/u });
  await versionsTab.click();
  await expect(versionsTab).toHaveAttribute("data-state", "active");
  const commentsTab = darkFileReviewDialog.getByRole("tab", { name: /Comments/u });
  await commentsTab.click();
  await expect(commentsTab).toHaveAttribute("data-state", "active");
  await expect(
    darkFileReviewDialog.getByText("This thread is limited to file version v1."),
  ).toBeVisible();
  await expect(darkFileReviewDialog.getByText(/local-speaker-id/u)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: testInfo.outputPath("file-review-mobile-dark.png"),
    fullPage: false,
  });

  await page.setViewportSize({ width: 1728, height: 978 });
  const overviewTab = darkFileReviewDialog.getByRole("tab", { name: "Overview" });
  await overviewTab.click();
  await expect(overviewTab).toHaveAttribute("data-state", "active");

  const reviewRequests: Array<{ readonly state: string; readonly release: boolean }> = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname.includes("/organizer/assets/") &&
      new URL(request.url()).pathname.endsWith("/review")
    ) {
      reviewRequests.push(request.postDataJSON());
    }
  });

  await darkFileReviewDialog.getByRole("button", { name: "Approve", exact: true }).click();
  const approvalDialog = page.getByRole("alertdialog");
  await expect(
    approvalDialog.getByRole("heading", { name: "Confirm file approval" }),
  ).toBeVisible();
  await approvalDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(approvalDialog).not.toBeVisible();
  expect(reviewRequests).toHaveLength(0);

  await darkFileReviewDialog.getByRole("button", { name: "Approve and release" }).click();
  const releaseDialog = page.getByRole("alertdialog");
  await expect(releaseDialog.getByRole("heading", { name: "Confirm file release" })).toBeVisible();
  const releaseRequest = page.waitForRequest(
    (request) => request.method() === "POST" && new URL(request.url()).pathname.endsWith("/review"),
  );
  await releaseDialog.getByRole("button", { name: "Confirm release" }).click();
  const confirmedReleaseRequest = await releaseRequest;
  expect(confirmedReleaseRequest.postDataJSON()).toMatchObject({
    state: "approved",
    release: true,
  });
  await expect(releaseDialog).not.toBeVisible();
});
