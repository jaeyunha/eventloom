import { expect, test } from "./fixtures/auth";
import { installPortalApi } from "./fixtures/portal-api";

test.use({ authRole: "speaker" });

test("authenticated speaker completes dependent action and upload tasks", async ({
  authSession,
  page,
}) => {
  expect(authSession.role).toBe("speaker");
  const api = await installPortalApi(page, authSession);

  await page.goto("/portal?event=event-evaluator");
  await expect(page.getByRole("heading", { level: 1, name: "My events" })).toBeVisible();
  await expect(
    page.getByText("1 accepted proposal and your assigned speaker tasks are ready to review."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "Prepare for your event" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Prepare for event", exact: true }).click();
  await expect(page).toHaveURL(/\/portal\/tasks\?event=event-evaluator$/);
  await expect(page.getByRole("heading", { level: 1, name: "Requests & tasks" })).toBeVisible();
  await expect(page.getByText("0 of 3 finished · 3 still open", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Upload a headshot/ }).click();
  const headshot = page.getByRole("article", { name: "Upload a headshot" });
  await expect(headshot.getByText("Blocked by prerequisites", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Confirm speaker agreement/ }).click();
  const agreement = page.getByRole("article", { name: "Confirm speaker agreement" });
  await agreement
    .getByLabel("Note to organizer (optional)")
    .fill("Agreement reviewed and accepted.");
  await agreement.getByRole("button", { name: "Confirm completion" }).click();
  await expect(agreement.getByText("Completed", { exact: true })).toBeVisible();
  await expect(page.getByText("1 of 3 finished · 2 still open", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Upload a headshot/ }).click();
  await expect(headshot.getByText("Blocked by prerequisites", { exact: true })).toHaveCount(0);
  await expect(headshot.getByRole("heading", { level: 2, name: "Upload lifecycle" })).toBeVisible();
  await headshot.getByLabel("Choose headshot").setInputFiles({
    name: "ada-speaker.png",
    mimeType: "image/png",
    buffer: Buffer.from("deterministic-e2e-image"),
  });
  await headshot.getByRole("button", { name: "Upload and submit" }).click();
  await expect(headshot.getByText("Submitted", { exact: true })).toBeVisible();
  await expect(headshot.getByText("Submitted for organizer review", { exact: true })).toBeVisible();
  await expect(page.getByText("1 of 3 finished · 2 still open", { exact: true })).toBeVisible();

  expect(api.view.tasks.find((task) => task.id === "task-agreement")?.status).toBe("completed");
  expect(api.view.tasks.find((task) => task.id === "task-headshot")?.status).toBe("submitted");
  expect(api.view.assets?.find((asset) => asset.taskId === "task-headshot")?.state).toBe("ready");
  expect(
    api.requests.some(
      (request) =>
        request.method() === "POST" &&
        request.url().includes("/assets/") &&
        request.url().endsWith("/finalize"),
    ),
  ).toBe(true);
  expect(api.requests.some((request) => request.url().includes("/uploads"))).toBe(true);
  expect(JSON.stringify(api.payloads)).not.toContain("objectKey");
  expect(JSON.stringify(api.payloads)).not.toContain("privateNote");
  expect(JSON.stringify(api.payloads)).not.toContain("Agreement reviewed and accepted.");
});

test("speaker edits the published biography through the authenticated portal", async ({
  authSession,
  page,
}) => {
  const api = await installPortalApi(page, authSession);
  await page.goto("/portal/profile?event=event-evaluator");

  await expect(page.getByRole("heading", { level: 1, name: "Your event profile" })).toBeVisible();
  const biography = page.getByLabel("Biography");
  await biography.fill(
    "Staff engineer, resilient-systems educator, and facilitator of calm incident response.",
  );
  await page.getByRole("button", { name: "Save profile" }).click();

  await expect(page.getByRole("status")).toHaveText("Profile saved.");
  expect(api.view.profiles[0]?.biography).toContain("facilitator of calm incident response");
});

test("speaker portal skip link supports a keyboard-only path to main content", async ({
  authSession,
  page,
}) => {
  await installPortalApi(page, authSession);
  await page.goto("/portal?event=event-evaluator");
  await expect(page.getByRole("heading", { level: 1, name: "My events" })).toBeVisible();
  const skipLink = page.getByRole("link", { name: "Skip to workspace content" });
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#workspace-main")).toBeFocused();
});

test("server-authorized context switching ignores event query guesses and is keyboard reachable", async ({
  authSession,
  page,
}) => {
  const api = await installPortalApi(page, authSession);
  await page.goto("/portal?event=event-not-authorized");
  await expect(page.getByRole("heading", { level: 1, name: "My events" })).toBeVisible();
  expect(api.view.context?.eventId).toBe("event-evaluator");
  expect(api.requests.some((request) => request.url().includes("event-not-authorized"))).toBe(
    false,
  );

  const eventContext = page.getByRole("combobox", { name: "Event context" });
  await eventContext.focus();
  await expect(eventContext).toBeFocused();
  await expect(eventContext.getByRole("option")).toHaveCount(2);
  await eventContext.selectOption({ label: "Collaborative Systems Summit" });

  await expect(page.getByRole("heading", { level: 1, name: "My events" })).toBeVisible();
  await expect(page.getByText("Bea Speaker", { exact: true })).toBeVisible();
  await expect(eventContext).toHaveValue("portal:ai-engineer:event-collaboration");
  expect(api.view.context?.eventId).toBe("event-collaboration");
  expect(api.view.context?.id).toBe("portal:ai-engineer:event-collaboration");
});

test("co-speaker roster exposes only server-authorized permissions and clears stale workspace data", async ({
  authSession,
  page,
}) => {
  const api = await installPortalApi(page, authSession);
  await page.goto("/portal?workspace=co-speakers");
  await expect(page.getByRole("heading", { level: 1, name: "Sessions" })).toBeVisible();
  const roster = page.getByRole("list", { name: "Co-speaker roster" });
  const primary = roster.getByRole("listitem").filter({ hasText: "Ada Speaker" });
  const existingCoSpeaker = roster.getByRole("listitem").filter({ hasText: "Grace Co-speaker" });
  await expect(primary).toBeVisible();
  await expect(primary.getByRole("button", { name: "Remove" })).toHaveCount(0);
  await expect(existingCoSpeaker.getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(existingCoSpeaker.getByRole("button", { name: "Remove" })).toBeVisible();

  await page.getByLabel("Name").fill("Jordan Co-speaker");
  await page.getByLabel("Email").fill("jordan@example.test");
  await page.getByRole("button", { name: "Add co-speaker" }).click();
  const invited = roster.getByRole("listitem").filter({ hasText: "Jordan Co-speaker" });
  await expect(invited).toBeVisible();
  await expect(invited).toContainText("pending");

  await invited.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Edit Jordan Co-speaker").fill("Jordan Updated");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(roster.getByText("Jordan Updated", { exact: true })).toBeVisible();

  page.once("dialog", (dialog) => void dialog.accept());
  await roster
    .getByRole("listitem")
    .filter({ hasText: "Jordan Updated" })
    .getByRole("button", { name: "Remove" })
    .click();
  const revoked = roster.getByRole("listitem").filter({ hasText: "Jordan Updated" });
  await expect(revoked).toContainText("revoked");
  expect(api.view.roster?.organizationId).toBe("ai-engineer");
  expect(api.view.roster?.members.some((member) => member.status === "revoked")).toBe(true);

  await page
    .getByRole("combobox", { name: "Event context" })
    .selectOption({ label: "Collaborative Systems Summit" });
  await expect(
    page.getByRole("heading", { level: 1, name: "This workspace is not available" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Add co-speaker" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(0);
  expect(api.view.context?.eventId).toBe("event-collaboration");
});

test("switching context clears files before loading the next event", async ({
  authSession,
  page,
}) => {
  const api = await installPortalApi(page, authSession);
  await page.goto("/portal?workspace=files");
  await expect(page.getByRole("heading", { level: 1, name: "Files" })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "calm-incident-response.pdf" }),
  ).toBeVisible();

  await page
    .getByRole("combobox", { name: "Event context" })
    .selectOption({ label: "Collaborative Systems Summit" });
  await expect(page.getByRole("heading", { level: 1, name: "Files" })).toBeVisible();
  await expect(page.getByText("No files yet", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "calm-incident-response.pdf" }),
  ).toHaveCount(0);
  expect(api.view.assets).toEqual([]);

  await page
    .getByRole("combobox", { name: "Event context" })
    .selectOption({ label: "Evaluator Summit" });
  await expect(
    page.getByRole("heading", { level: 2, name: "calm-incident-response.pdf" }),
  ).toBeVisible();
});

test("speaker privately uploads, finalizes, histories, comments, and downloads an opaque asset", async ({
  authSession,
  page,
}) => {
  const api = await installPortalApi(page, authSession);
  await page.goto("/portal?workspace=files");
  await expect(page.getByRole("heading", { level: 1, name: "Files" })).toBeVisible();

  await page.getByLabel("File type").selectOption("supporting_file");
  await page.getByLabel("Choose file").setInputFiles({
    name: "runbook.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("private runbook bytes"),
  });
  await page.getByRole("button", { name: "Upload private file" }).click();
  await page.getByRole("button", { name: /runbook\.txt/ }).click();
  await expect(page.getByRole("heading", { level: 2, name: "runbook.txt" })).toBeVisible();
  await expect(page.getByText("Immutable versions", { exact: true })).toBeVisible();
  await expect(page.getByText(/Version 1 · runbook\.txt/u)).toBeVisible();
  expect(api.view.assets?.find((asset) => asset.fileName === "runbook.txt")?.state).toBe("ready");
  expect(
    api.requests.some(
      (request) => request.method() === "POST" && request.url().endsWith("/uploads"),
    ),
  ).toBe(true);
  expect(
    api.requests.some(
      (request) =>
        request.method() === "PUT" && request.url().includes("/assets/capabilities/upload/"),
    ),
  ).toBe(true);
  expect(
    api.requests.some(
      (request) =>
        request.method() === "POST" &&
        request.url().includes("/assets/") &&
        request.url().endsWith("/finalize"),
    ),
  ).toBe(true);

  const downloadRequest = page.waitForRequest(
    (request) =>
      request.method() === "GET" && request.url().includes("/assets/capabilities/download/"),
  );
  await page.getByRole("button", { name: "Download current version" }).click();
  expect((await downloadRequest).url()).toContain("opaque-download-token");

  await page.goto("/portal/tasks?event=event-evaluator");
  await page.getByRole("button", { name: /Confirm speaker agreement/ }).click();
  const agreement = page.getByRole("article", { name: "Confirm speaker agreement" });
  await agreement.getByRole("button", { name: "Confirm completion" }).click();
  await expect(agreement.getByText("Completed", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Upload a headshot/ }).click();
  const headshot = page.getByRole("article", { name: "Upload a headshot" });
  await headshot.getByLabel("Choose headshot").setInputFiles({
    name: "ada-speaker.png",
    mimeType: "image/png",
    buffer: Buffer.from("task-asset-for-commenting"),
  });
  await headshot.getByRole("button", { name: "Upload and submit" }).click();
  await expect(
    headshot.getByRole("heading", { level: 3, name: "Comments on version 1" }),
  ).toBeVisible();
  await headshot
    .getByLabel("Reply on this version")
    .fill("Use this headshot in the speaker briefing.");
  await headshot.getByRole("button", { name: "Post reply" }).click();
  await expect(
    headshot.getByText("Use this headshot in the speaker briefing.", { exact: true }),
  ).toBeVisible();
  expect(
    api.requests.some(
      (request) => request.method() === "POST" && request.url().endsWith("/comments"),
    ),
  ).toBe(true);
  expect(JSON.stringify(api.payloads)).not.toContain("objectKey");
  expect(JSON.stringify(api.payloads)).not.toContain("privateNote");
});

test("expired secure download links surface an accessible failure state", async ({
  authSession,
  page,
}) => {
  const api = await installPortalApi(page, authSession, {
    expiredDownloadAssetId: "asset-slides-v1",
  });
  await page.goto("/portal?workspace=files");
  await expect(
    page.getByRole("heading", { level: 2, name: "calm-incident-response.pdf" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Download current version" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "Workspace action failed" });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("Workspace action failed");
  await expect(alert).toContainText("secure download link has expired");
  expect(
    api.requests.some((request) => request.url().endsWith("/assets/asset-slides-v1/download")),
  ).toBe(true);
});

test("task forms validate required answers, preserve focus, and retain immutable response history", async ({
  authSession,
  page,
}) => {
  const api = await installPortalApi(page, authSession);
  await page.goto("/portal/tasks?event=event-evaluator");
  await expect(page.getByRole("heading", { level: 1, name: "Requests & tasks" })).toBeVisible();
  await page.getByRole("button", { name: /Share speaker details/ }).click();
  const task = page.getByRole("article", { name: "Share speaker details" });
  const form = task.getByRole("region", { name: "Speaker details" });
  await expect(form.getByRole("button", { name: "Submit response" })).toBeVisible();

  const biography = form.getByLabel(/Biography/);
  await form.getByRole("button", { name: "Submit response" }).click();
  await expect(form.getByText("Biography is required.", { exact: true })).toBeVisible();
  await expect(form.getByText("Track is required.", { exact: true })).toBeVisible();
  await expect(biography).toBeFocused();

  await biography.fill("A calm systems educator.");
  await form.getByLabel(/Track/).selectOption("web");
  await form.getByRole("button", { name: "Save draft" }).click();
  await expect(
    form.getByText("Draft saved. It has not been submitted to organizers.", { exact: true }),
  ).toBeVisible();
  await form.getByText("Response history", { exact: true }).click();
  await expect(form.locator("details ol li")).toHaveCount(1);

  await biography.fill("A calmer systems educator and facilitator.");
  await form.getByRole("button", { name: "Save draft" }).click();
  await expect(form.locator("details ol li")).toHaveCount(2);
  expect(
    api.payloads.filter((payload) => JSON.stringify(payload).includes("response-e2e-")).length,
  ).toBeGreaterThan(0);
  expect(JSON.stringify(api.payloads)).not.toContain("privateNote");
  expect(JSON.stringify(api.payloads)).not.toContain("objectKey");
});

test("published resources and wiki stay event-scoped and cross-event portal access is denied", async ({
  authSession,
  page,
}) => {
  const api = await installPortalApi(page, authSession);
  await page.goto("/portal?workspace=resources");
  await expect(page.getByRole("heading", { level: 1, name: "Event guide" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Speaker guide" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open published resource" })).toHaveAttribute(
    "href",
    "https://sessionboard.namuh.co/speakers/guide",
  );

  await page.getByRole("button", { name: /Production checklist/ }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Production checklist" })).toBeVisible();
  await page.getByRole("button", { name: /Welcome to Evaluator Summit/ }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Welcome to Evaluator Summit" }),
  ).toBeVisible();
  await expect(page.getByText("green room channel", { exact: false })).toBeVisible();

  const denied = await page.evaluate(async () => {
    const response = await fetch(
      `${window.location.origin}/api/speaker/events/event-not-authorized/portal`,
      {
        credentials: "include",
      },
    );
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  });
  expect(denied.status).toBe(404);
  expect(denied.body.data).toBeUndefined();
  expect(JSON.stringify(denied.body)).not.toContain("objectKey");
  expect(JSON.stringify(denied.body)).not.toContain("privateNote");
  expect((denied.body.error as { code?: string } | undefined)?.code).toBe("NOT_FOUND");
  expect(JSON.stringify(api.payloads)).not.toContain("objectKey");
  expect(JSON.stringify(api.payloads)).not.toContain("privateNote");
});

test("optional resource failure stays local while accepted session data remains usable", async ({
  authSession,
  page,
}) => {
  const sensitiveMessage =
    "Storage bucket speaker-private-prod denied access with credential token secret-value.";
  await installPortalApi(page, authSession, {
    unavailableResource: "resources",
    unavailableResourceMessage: sensitiveMessage,
  });

  await page.goto("/portal?workspace=co-speakers");
  await expect(page.getByRole("heading", { level: 1, name: "Sessions" })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Designing calm incident response" }),
  ).toBeVisible();
  await expect(page.getByText("Workspace data unavailable", { exact: true })).toHaveCount(0);

  await page.goto("/portal?workspace=resources");
  await expect(page.getByRole("heading", { level: 1, name: "Event guide" })).toBeVisible();
  const guideFailure = page
    .getByRole("alert")
    .filter({ hasText: "Event resources unavailable" });
  await expect(guideFailure).toContainText(
    "Published event resources are not available for this event.",
  );
  await expect(guideFailure).toContainText("Support ID: e2e-portal-trace.");
  await expect(page.getByText(sensitiveMessage, { exact: true })).toHaveCount(0);
  await expect(page.getByText("secret-value", { exact: false })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { level: 2, name: "Welcome to Evaluator Summit" }),
  ).toBeVisible();
});
