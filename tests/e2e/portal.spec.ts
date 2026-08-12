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
  await expect(page.getByRole("heading", { level: 1, name: "Welcome, Ada" })).toBeVisible();
  await expect(page.getByText("1 accepted", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Prepare for the event" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Open all tasks" }).click();
  await expect(page).toHaveURL(/\/portal\/tasks\?event=event-evaluator$/);
  await expect(page.getByText("3 tasks still need your attention.")).toBeVisible();
  const agreement = page.getByRole("article", { name: "Confirm speaker agreement" });
  const headshot = page.getByRole("article", { name: "Upload a headshot" });
  await expect(headshot.getByText("Complete a prerequisite first")).toBeVisible();

  await agreement.getByLabel("Completion note (optional)").fill("Agreement reviewed and accepted.");
  await agreement.getByRole("button", { name: "Mark complete" }).click();
  await expect(agreement.getByText("Completed", { exact: true })).toBeVisible();
  await expect(page.getByText("2 tasks still need your attention.")).toBeVisible();

  await expect(headshot.getByText("Complete a prerequisite first")).toHaveCount(0);
  await headshot.getByRole("button", { name: "Start task" }).click();
  await expect(headshot.getByText("In progress", { exact: true })).toBeVisible();
  await headshot.getByLabel(/Choose headshot/).setInputFiles({
    name: "ada-speaker.png",
    mimeType: "image/png",
    buffer: Buffer.from("deterministic-e2e-image"),
  });
  await expect(headshot.getByText("Submitted", { exact: true })).toBeVisible();
  await expect(page.getByText("2 tasks still need your attention.")).toBeVisible();

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

  await expect(page.getByRole("heading", { level: 1, name: "Speaker profile" })).toBeVisible();
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
  await expect(page.getByRole("heading", { level: 1, name: "Welcome, Ada" })).toBeVisible();
  const skipLink = page.getByRole("link", { name: "Skip to portal content" });
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#portal-content")).toBeFocused();
});

test("server-authorized context switching ignores event query guesses and is keyboard reachable", async ({
  authSession,
  page,
}) => {
  const api = await installPortalApi(page, authSession);
  await page.goto("/portal?event=event-not-authorized");
  await expect(page.getByRole("heading", { level: 1, name: "Welcome, Ada" })).toBeVisible();
  expect(api.view.context?.eventId).toBe("event-evaluator");
  expect(api.requests.some((request) => request.url().includes("event-not-authorized"))).toBe(
    false,
  );

  const accountMenu = page.getByRole("button", { name: "Account menu" });
  await accountMenu.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Switch event" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveCount(2);
  await page.keyboard.press("Tab");
  await expect(menu.getByRole("menuitem").first()).toBeFocused();

  const collaboration = menu.getByRole("menuitem", { name: "Collaborative Systems Summit" });
  await collaboration.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Welcome, Bea" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Account menu" })).toContainText(
    "Collaborative Systems Summit",
  );
  expect(api.view.context?.eventId).toBe("event-collaboration");
  expect(api.view.context?.id).toBe("portal:ai-engineer:event-collaboration");
});

test("co-speaker roster exposes only server-authorized permissions and clears stale workspace data", async ({
  authSession,
  page,
}) => {
  const api = await installPortalApi(page, authSession);
  await page.goto("/portal?workspace=co-speakers");
  await expect(page.getByRole("heading", { level: 2, name: "Co-speakers" })).toBeVisible();
  const roster = page.getByRole("list", { name: "Co-speaker roster" });
  const primary = roster.getByRole("listitem").filter({ hasText: "Ada Speaker" });
  const existingCoSpeaker = roster.getByRole("listitem").filter({ hasText: "Grace Co-speaker" });
  await expect(primary).toBeVisible();
  await expect(primary.getByRole("button", { name: "Remove" })).toHaveCount(0);
  await expect(existingCoSpeaker.getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(existingCoSpeaker.getByRole("button", { name: "Remove" })).toBeVisible();

  await page.getByLabel("Name").last().fill("Jordan Co-speaker");
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

  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Collaborative Systems Summit" }).click();
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
  await expect(page.getByRole("heading", { level: 2, name: "Session files" })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "calm-incident-response.pdf" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Collaborative Systems Summit" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Collaborative Systems Summit" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "No files yet" })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "calm-incident-response.pdf" }),
  ).toHaveCount(0);
  expect(api.view.assets).toEqual([]);

  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Evaluator Summit" }).click();
  await expect(
    page.getByRole("heading", { level: 3, name: "calm-incident-response.pdf" }),
  ).toBeVisible();
  expect(api.view.context?.eventId).toBe("event-evaluator");
});

test("speaker privately uploads, finalizes, histories, comments, and downloads an opaque asset", async ({
  authSession,
  page,
}) => {
  const api = await installPortalApi(page, authSession);
  await page.goto("/portal?workspace=files");
  await expect(page.getByRole("heading", { level: 2, name: "Session files" })).toBeVisible();

  await page.getByLabel("File type").selectOption("supporting_file");
  await page.getByLabel("Choose file").setInputFiles({
    name: "runbook.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("private runbook bytes"),
  });
  await page.getByRole("button", { name: "Upload privately" }).click();
  const uploaded = page.getByRole("article", { name: "runbook.txt" });
  await expect(uploaded).toBeVisible();
  await expect(uploaded.getByText("pending upload · Current v1", { exact: true })).toBeVisible();
  expect(api.view.assets?.find((asset) => asset.fileName === "runbook.txt")?.state).toBe(
    "pending_upload",
  );
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
  expect(JSON.stringify(api.payloads)).not.toContain("objectKey");
  expect(JSON.stringify(api.payloads)).not.toContain("privateNote");

  await uploaded.getByText("Version history and comments", { exact: true }).click();
  await expect(uploaded.getByText(/Version 1 · runbook\.txt · pending_upload/u)).toBeVisible();
  await uploaded.getByRole("button", { name: "Mark finalized" }).click();
  await expect(uploaded.getByText("ready · Current v1", { exact: true })).toBeVisible();

  await uploaded.getByLabel("Add a comment").fill("Use this runbook in the speaker briefing.");
  await uploaded.getByRole("button", { name: "Post comment" }).click();
  await expect(
    uploaded.getByText("Use this runbook in the speaker briefing.", { exact: true }),
  ).toBeVisible();

  const downloadRequest = page.waitForRequest(
    (request) =>
      request.method() === "GET" && request.url().includes("/assets/capabilities/download/"),
  );
  await uploaded.getByRole("button", { name: "Download current" }).click();
  expect((await downloadRequest).url()).toContain("opaque-download-token");
  expect(api.view.assets?.find((asset) => asset.fileName === "runbook.txt")?.state).toBe("ready");
});

test("expired secure download links surface an accessible failure state", async ({
  authSession,
  page,
}) => {
  const api = await installPortalApi(page, authSession, {
    expiredDownloadAssetId: "asset-slides-v1",
  });
  await page.goto("/portal?workspace=files");
  const asset = page.getByRole("article", { name: "calm-incident-response.pdf" });
  await asset.getByRole("button", { name: "Download current" }).click();
  const alert = page.getByRole("alert", { name: "Portal workspace error" });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("secure download link has expired");
  expect(
    api.requests.some((request) => request.url().endsWith("/assets/asset-slides-v1/download")),
  ).toBe(true);
});

test("task forms validate required answers and retain immutable response history", async ({
  authSession,
  page,
}) => {
  const api = await installPortalApi(page, authSession);
  await page.goto("/portal?workspace=tasks");
  const form = page.getByRole("article", { name: "Speaker details" });
  await expect(form).toBeVisible();

  await form.getByRole("button", { name: "Save response" }).click();
  await expect(form.getByRole("alert")).toHaveText("Biography is required.");
  await form.getByLabel("Biography *").fill("A calm systems educator.");
  await form.getByLabel("Track *").selectOption("web");
  await form.getByRole("button", { name: "Save response" }).click();
  await expect(form.getByRole("status")).toHaveText("Your response was saved.");
  await form.getByText("Response history", { exact: true }).click();
  await expect(form.locator("details ol li")).toHaveCount(1);

  await form.getByLabel("Biography *").fill("A calmer systems educator and facilitator.");
  await form.getByRole("button", { name: "Save response" }).click();
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
  await expect(page.getByRole("heading", { level: 2, name: "Resources" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Speaker guide" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open published resource" })).toHaveAttribute(
    "href",
    "https://sessionboard.namuh.co/speakers/guide",
  );
  await expect(page.getByRole("heading", { level: 2, name: "Production checklist" })).toBeVisible();

  await page
    .getByRole("navigation", { name: "Speaker portal" })
    .getByRole("link", { name: "Wiki" })
    .click();
  await expect(page.getByRole("heading", { level: 2, name: "Wiki" })).toBeVisible();
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
