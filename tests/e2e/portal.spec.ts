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
  await expect(page.getByText("2 tasks still need your attention.")).toBeVisible();
  const agreement = page.getByRole("article", { name: "Confirm speaker agreement" });
  const headshot = page.getByRole("article", { name: "Upload a headshot" });
  await expect(headshot.getByText("Complete a prerequisite first")).toBeVisible();

  await agreement.getByLabel("Completion note (optional)").fill("Agreement reviewed and accepted.");
  await agreement.getByRole("button", { name: "Mark complete" }).click();
  await expect(agreement.getByText("Completed", { exact: true })).toBeVisible();

  await expect(headshot.getByText("Complete a prerequisite first")).toHaveCount(0);
  await headshot.getByRole("button", { name: "Start task" }).click();
  await expect(headshot.getByText("In progress", { exact: true })).toBeVisible();
  await headshot.getByLabel(/Choose headshot/).setInputFiles({
    name: "ada-speaker.png",
    mimeType: "image/png",
    buffer: Buffer.from("deterministic-e2e-image"),
  });
  await expect(headshot.getByText("Submitted", { exact: true })).toBeVisible();
  await expect(page.getByText("1 task still needs your attention.")).toBeVisible();

  expect(api.view.tasks.find((task) => task.id === "task-agreement")?.status).toBe("completed");
  expect(api.view.tasks.find((task) => task.id === "task-headshot")?.status).toBe("submitted");
  expect(api.requests.some((request) => request.url().includes("/uploads"))).toBe(true);
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
  await page.getByRole("button", { name: "Save biography" }).click();

  await expect(page.getByRole("status")).toHaveText("Biography saved.");
  expect(api.view.profiles[0]?.biography).toContain("facilitator of calm incident response");
});

test("speaker portal skip link supports a keyboard-only path to main content", async ({
  authSession,
  page,
}) => {
  await installPortalApi(page, authSession);
  await page.goto("/portal?event=event-evaluator");
  await expect(page.getByRole("heading", { level: 1, name: "Welcome, Ada" })).toBeVisible();

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to portal content" });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#portal-content")).toBeFocused();
});
