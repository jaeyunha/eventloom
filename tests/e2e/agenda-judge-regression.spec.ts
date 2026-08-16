import { expect, test } from "@playwright/test";

const organizationId = "local-organization";
const eventId = "demo-event";
const agendaRoute = `/admin/organizations/${organizationId}/events/${eventId}/agenda`;
const agendaApi = `/api/admin/organizations/${organizationId}/events/${eventId}/agenda`;

test.use({ viewport: { width: 1440, height: 1000 } });

test("persists validation, exposes rejected conflicts, moves sessions, and applies assistance", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(120_000);
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

  await page.goto(agendaRoute, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await expect(page.getByRole("heading", { name: "Agenda", exact: true })).toBeVisible();
  await expect(page.locator('[data-entry-id="local-entry-keynote"]:visible')).toBeVisible();
  await expect(page.locator('[data-entry-id="local-entry-workshop"]:visible')).toBeVisible();

  const validationResponse = page.waitForResponse((response) => {
    const request = response.request();
    return (
      request.method() === "GET" &&
      new URL(response.url()).pathname === `${agendaApi}/preview` &&
      response.status() === 200
    );
  });
  await page.getByRole("button", { name: "Preview and validate" }).click();
  await validationResponse;
  await expect(page.getByText("Validated", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("Validated", { exact: true })).toBeVisible();

  const conflictResponse = page.waitForResponse((response) => {
    const request = response.request();
    return (
      request.method() === "PUT" &&
      new URL(response.url()).pathname === `${agendaApi}/draft` &&
      response.status() === 409
    );
  });
  await page
    .getByRole("button", {
      name: /Edit Developer platforms that teams trust under pressure in practice/u,
    })
    .click();
  const editor = page.getByRole("dialog");
  const startInput = editor.getByRole("textbox", { name: "Start time" });
  const endInput = editor.getByRole("textbox", { name: "End time" });
  await editor.getByLabel("Room").selectOption({ label: "Main Hall (200 seats)" });
  await startInput.fill("09:00");
  await endInput.fill("10:00");
  await editor.getByRole("button", { name: "Save changes" }).click();
  const rejected = await conflictResponse;
  expect(await rejected.json()).toMatchObject({
    error: {
      code: "CONFLICT",
      details: [expect.objectContaining({ code: "agenda.room" })],
    },
    data: {
      candidateDiagnostics: {
        evaluated: true,
        report: {
          conflicts: [expect.objectContaining({ kind: "room" })],
        },
      },
    },
  });
  await expect(page.getByRole("alert")).toContainText(
    "The agenda contains unresolved scheduling conflicts.",
  );
  await expect(page.getByText(/overlap in room "Main Hall"/u)).toBeVisible();
  await expect(page.locator('[data-entry-id="local-entry-workshop"]:visible')).toHaveAttribute(
    "aria-label",
    /Workshop Studio, 10:15 AM to 11:15 AM/u,
  );
  await editor.getByRole("button", { name: "Cancel" }).click();
  await expect(editor).not.toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("agenda-conflict-visible.png"),
    fullPage: true,
  });

  const moveResponse = page.waitForResponse((response) => {
    const request = response.request();
    return (
      request.method() === "PUT" &&
      new URL(response.url()).pathname === `${agendaApi}/draft` &&
      response.status() === 200
    );
  });
  await page
    .getByRole("button", {
      name: /Edit Developer platforms that teams trust under pressure in practice/u,
    })
    .click();
  await editor.getByLabel("Room").selectOption({ label: "Main Hall (200 seats)" });
  await startInput.fill("13:00");
  await endInput.fill("14:00");
  await editor.getByRole("button", { name: "Save changes" }).click();
  await moveResponse;
  await expect(page.locator('[data-entry-id="local-entry-workshop"]:visible')).toHaveAttribute(
    "aria-label",
    /Main Hall, 1:00 PM to 2:00 PM/u,
  );
  await expect(page.getByText("Needs validation", { exact: true })).toBeVisible();

  const revalidationResponse = page.waitForResponse((response) => {
    const request = response.request();
    return (
      request.method() === "GET" &&
      new URL(response.url()).pathname === `${agendaApi}/preview` &&
      response.status() === 200
    );
  });
  await page.getByRole("button", { name: "Preview and validate" }).click();
  await revalidationResponse;
  const publishResponse = page.waitForResponse((response) => {
    const request = response.request();
    return (
      request.method() === "POST" &&
      new URL(response.url()).pathname === `${agendaApi}/publish` &&
      response.status() === 200
    );
  });
  await page.getByRole("button", { name: "Publish agenda" }).click();
  await publishResponse;
  await expect(page.getByText("Validated", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Validated", { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("agenda-move-publish-validation-persisted.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Configure suggestions" }).click();
  const suggestionResponse = page.waitForResponse((response) => {
    const request = response.request();
    return (
      request.method() === "POST" &&
      new URL(response.url()).pathname === `${agendaApi}/suggestions` &&
      response.ok()
    );
  });
  await page.getByRole("button", { name: "Generate private suggestions" }).click();
  const suggestion = await suggestionResponse;
  const suggestionBody = (await suggestion.json()) as {
    data: {
      id: string;
      status: string;
      diff: { changes: readonly { id: string }[] };
      candidateDiagnostics: { conflicts: readonly unknown[] };
    };
  };
  expect(suggestionBody.data).toMatchObject({
    status: "pending",
    candidateDiagnostics: { conflicts: [] },
  });
  expect(suggestionBody.data.diff.changes.length).toBeGreaterThan(0);

  const firstSuggestion = page.getByRole("checkbox").first();
  await expect(firstSuggestion).toBeVisible();
  await firstSuggestion.check();
  await page.screenshot({
    path: testInfo.outputPath("agenda-assisted-placement-proposed.png"),
    fullPage: true,
  });
  const applyResponse = page.waitForResponse((response) => {
    const request = response.request();
    return (
      request.method() === "POST" &&
      new URL(response.url()).pathname ===
        `${agendaApi}/suggestions/${encodeURIComponent(suggestionBody.data.id)}/apply` &&
      response.status() === 200
    );
  });
  await page.getByRole("button", { name: "Apply selected changes" }).click();
  const applied = await applyResponse;
  const appliedBody = (await applied.json()) as {
    data: { entries: readonly unknown[] };
  };
  expect(appliedBody.data.entries.length).toBeGreaterThan(2);
  await expect(page.getByText(/Revision \d+ live/u)).toBeVisible();
  await expect(page.getByText("Needs validation", { exact: true })).toBeVisible();
  await expect(page.getByText("Selected advisory changes were applied")).toBeVisible();

  await page.reload();
  await expect(page.locator('[data-entry-id]:visible')).toHaveCount(
    appliedBody.data.entries.length,
  );
  await page.screenshot({
    path: testInfo.outputPath("agenda-assisted-placement-applied.png"),
    fullPage: true,
  });
});
