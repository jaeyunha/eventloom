import { expect, test } from "@playwright/test";

const webOrigin = `http://127.0.0.1:${process.env.PLAYWRIGHT_WEB_PORT?.trim() || "3015"}`;
const eventPath = "/admin/organizations/local-organization/events/demo-event";

test.use({ deviceScaleFactor: 2 });

test("content collection file review stays aligned in light and dark themes", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(90_000);
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

  const portalContextsResponse = await context.request.get(
    `${webOrigin}/api/speaker/portal/contexts`,
  );
  expect(portalContextsResponse.ok()).toBe(true);
  expect(await portalContextsResponse.json()).toMatchObject({
    data: [
      {
        id: "portal:local-organization:demo-event:local-participant",
        eventId: "demo-event",
        primaryParticipantId: "local-participant",
      },
    ],
  });
  const currentPortalContextResponse = await context.request.get(
    `${webOrigin}/api/speaker/events/demo-event/portal/context`,
  );
  expect(currentPortalContextResponse.ok()).toBe(true);
  expect(await currentPortalContextResponse.json()).toMatchObject({
    data: {
      id: "portal:local-organization:demo-event:local-participant",
      eventId: "demo-event",
      primaryParticipantId: "local-participant",
    },
  });
  const portalFixtureResponse = await context.request.get(
    `${webOrigin}/api/speaker/events/demo-event/portal`,
  );
  expect(portalFixtureResponse.ok()).toBe(true);
  expect(await portalFixtureResponse.json()).toMatchObject({
    data: {
      context: {
        id: "portal:local-organization:demo-event:local-participant",
        eventId: "demo-event",
        primaryParticipantId: "local-participant",
      },
      tasks: [
        expect.objectContaining({
          title: "Upload your presentation slides",
          status: "not_started",
        }),
      ],
    },
  });
  const initialPortalResponse = page.waitForResponse((response) => {
    const pathname = new URL(response.url()).pathname;
    return (
      response.request().method() === "GET" && pathname === "/api/speaker/events/demo-event/portal"
    );
  });
  await page.goto("/portal/tasks?event=demo-event");
  await expect((await initialPortalResponse).ok()).toBe(true);
  const request = page.getByRole("article", { name: "Upload your presentation slides" });
  await expect(request).toBeVisible({ timeout: 15_000 });
  await request.getByLabel("Choose slides").setInputFiles({
    name: "session-slides.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nEventloom visual QA\n"),
  });
  const initialDocumentSentinel = "content-files-v1-document";
  await page.evaluate(
    (sentinel) => Reflect.set(window, "__eventloomContentFilesSentinel", sentinel),
    initialDocumentSentinel,
  );
  const initialSubmissionResponse = page.waitForResponse((response) => {
    const pathname = new URL(response.url()).pathname;
    return (
      response.request().method() === "POST" &&
      pathname.startsWith("/api/speaker/events/demo-event/tasks/") &&
      pathname.endsWith("/transitions")
    );
  });
  await request.getByRole("button", { name: "Upload and submit" }).click();
  const initialSubmission = await initialSubmissionResponse;
  expect(initialSubmission.ok()).toBe(true);
  expect(initialSubmission.request().postDataJSON()).toMatchObject({ toStatus: "submitted" });
  expect(await page.evaluate(() => Reflect.get(window, "__eventloomContentFilesSentinel"))).toBe(
    initialDocumentSentinel,
  );
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
  await expect(assignmentTable).toBeVisible({ timeout: 15_000 });
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
  const uploaderField = fileReviewDialog.getByText("Uploader", { exact: true }).locator("..");
  await expect(uploaderField).toContainText("Alex Rivera");
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

  await darkFileReviewDialog
    .getByLabel("Review note (optional)")
    .fill("Replace the session deck with v2.");
  const needsChangesResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.includes("/organizer/assets/") &&
      new URL(response.url()).pathname.endsWith("/review"),
  );
  await darkFileReviewDialog.getByRole("button", { name: "Needs changes" }).click();
  const returnedForChanges = await needsChangesResponse;
  expect(
    returnedForChanges.ok(),
    `${returnedForChanges.status()} ${await returnedForChanges.text()}`,
  ).toBe(true);
  expect(returnedForChanges.request().postDataJSON()).toMatchObject({
    state: "needs_changes",
    release: false,
  });

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
  const participantCommentsResponse = page.waitForResponse((response) => {
    const pathname = new URL(response.url()).pathname;
    return (
      response.request().method() === "GET" &&
      pathname.startsWith("/api/speaker/events/demo-event/assets/") &&
      !pathname.includes("/organizer/") &&
      pathname.endsWith("/comments")
    );
  });
  await page.goto("/portal/tasks?event=demo-event");
  await expect((await participantCommentsResponse).ok()).toBe(true);
  const returnedTask = page.getByRole("article", { name: "Upload your presentation slides" });
  await expect(returnedTask.getByText("Needs changes", { exact: true })).toBeVisible();
  await expect(returnedTask.getByText("Replace the session deck with v2.")).toBeVisible();
  const replacementInput = returnedTask.getByLabel("Choose slides");
  const replacementSubmit = returnedTask.getByRole("button", { name: "Upload and submit" });
  await expect(replacementInput).toBeEnabled();
  await expect(replacementSubmit).toBeDisabled();
  await page.screenshot({
    path: testInfo.outputPath("returned-task-needs-changes.png"),
    fullPage: true,
  });
  await replacementInput.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("returned-task-reupload-controls.png"),
    fullPage: true,
  });

  await replacementInput.setInputFiles({
    name: "session-slides-v2.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nEventloom immutable v2\n"),
  });
  await expect(replacementSubmit).toBeEnabled();
  const replacementDocumentSentinel = "content-files-v2-document";
  await page.evaluate(
    (sentinel) => Reflect.set(window, "__eventloomContentFilesSentinel", sentinel),
    replacementDocumentSentinel,
  );
  const replacementSubmissionResponse = page.waitForResponse((response) => {
    const pathname = new URL(response.url()).pathname;
    return (
      response.request().method() === "POST" &&
      pathname.startsWith("/api/speaker/events/demo-event/tasks/") &&
      pathname.endsWith("/transitions")
    );
  });
  await replacementSubmit.click();
  const replacementSubmission = await replacementSubmissionResponse;
  expect(replacementSubmission.ok()).toBe(true);
  expect(replacementSubmission.request().postDataJSON()).toMatchObject({
    toStatus: "submitted",
  });
  expect(await page.evaluate(() => Reflect.get(window, "__eventloomContentFilesSentinel"))).toBe(
    replacementDocumentSentinel,
  );
  await expect(
    page.getByRole("button", { name: /Upload your presentation slides Submitted/u }),
  ).toBeVisible();

  const failedWorkspaceResponses: string[] = [];
  const captureWorkspaceFailure = (response: {
    ok(): boolean;
    request(): { method(): string };
    status(): number;
    url(): string;
  }): void => {
    if (response.status() < 400) return;
    failedWorkspaceResponses.push(
      `${response.request().method()} ${new URL(response.url()).pathname} ${response.status()}`,
    );
  };
  page.on("response", captureWorkspaceFailure);
  const rosterWorkspaceResponse = page.waitForResponse((response) => {
    const pathname = new URL(response.url()).pathname;
    return (
      response.request().method() === "GET" &&
      pathname === "/api/speaker/events/demo-event/submissions/submission_local_1/roster"
    );
  });
  await page.goto("/portal?workspace=files&event=demo-event");
  const rosterResponse = await rosterWorkspaceResponse;
  expect(rosterResponse.ok()).toBe(true);
  expect(await rosterResponse.json()).toMatchObject({
    data: {
      organizationId: "local-organization",
      eventId: "demo-event",
      submissionId: "submission_local_1",
    },
  });
  await expect(page.getByRole("heading", { level: 1, name: "Files" })).toBeVisible({
    timeout: 15_000,
  });
  const uploadedFamily = page.getByRole("button", { name: /session-slides-v2\.pdf/u });
  await expect(uploadedFamily).toHaveCount(1);
  await uploadedFamily.click();
  const participantVersion2 = page.getByText("Version 2 · session-slides-v2.pdf", { exact: true });
  const participantVersion1 = page.getByText("Version 1 · session-slides.pdf", { exact: true });
  await expect(participantVersion2).toBeVisible();
  await expect(participantVersion1).toBeVisible();
  await expect(page.getByRole("button", { name: "Download version 1" })).toBeVisible();
  await expect(
    page.getByRole("alert").filter({
      has: page.getByRole("button", { name: "Retry" }),
    }),
  ).toHaveCount(0);
  if (failedWorkspaceResponses.length > 0) {
    throw new Error(`Workspace API failures:\n${failedWorkspaceResponses.join("\n")}`);
  }
  page.off("response", captureWorkspaceFailure);
  await page.screenshot({
    path: testInfo.outputPath("participant-files-family.png"),
    fullPage: true,
  });
  await participantVersion1.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("participant-files-v1-v2.png"),
    fullPage: true,
  });

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
  const updatedAssignments = page.getByRole("table", {
    name: "Per-speaker content request assignments and due dates",
  });
  await updatedAssignments.getByRole("button", { name: "Open request" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Inspect file versions" }).click();
  const updatedReview = page.getByRole("dialog");
  await updatedReview.getByRole("tab", { name: /Versions/u }).click();
  await expect(
    updatedReview.getByText("v2 · session-slides-v2.pdf", { exact: true }),
  ).toBeVisible();
  await expect(updatedReview.getByText("v1 · session-slides.pdf", { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("immutable-v1-v2-history.png"),
    fullPage: true,
  });
  await updatedReview.getByRole("tab", { name: "Overview" }).click();

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

  await updatedReview.getByRole("button", { name: "Approve", exact: true }).click();
  const approvalDialog = page.getByRole("alertdialog");
  await expect(
    approvalDialog.getByRole("heading", { name: "Confirm file approval" }),
  ).toBeVisible();
  await approvalDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(approvalDialog).not.toBeVisible();
  expect(reviewRequests).toHaveLength(0);

  await updatedReview.getByRole("button", { name: "Approve and release" }).click();
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
