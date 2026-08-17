import { expect, test } from "./fixtures/auth";
import { installPortalApi } from "./fixtures/portal-api";

const evidenceDir = "qa/v1/file-upload-dropzone";

test("captures the shared drop-zone on portal files and task upload", async ({
  authSession,
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await installPortalApi(page, authSession);

  await page.goto("/portal?workspace=files&event=event-evaluator");
  await expect(page.getByRole("heading", { level: 1, name: "Files" })).toBeVisible({
    timeout: 30_000,
  });
  const filesControl = page.locator("[data-file-upload]").first();
  await expect(filesControl).toBeVisible();
  await expect(filesControl.getByText("Drop your files here or browse")).toBeVisible();
  await filesControl.screenshot({ path: `${evidenceDir}/portal-files-dropzone.png` });

  await page.getByLabel("Choose file").setInputFiles({
    name: "runbook.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nEventloom file upload evidence\n"),
  });
  await expect(page.getByText("runbook.pdf", { exact: true })).toBeVisible();
  await expect(page.getByText("PDF", { exact: true }).first()).toBeVisible();
  await page
    .locator("[data-file-upload]")
    .first()
    .locator("..")
    .screenshot({
      path: `${evidenceDir}/portal-files-selected.png`,
    });

  await page.goto("/portal/tasks?event=event-evaluator");
  await expect(page.getByRole("heading", { level: 1, name: "Requests & tasks" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: /Confirm speaker agreement/u }).click();
  await page.getByRole("button", { name: "Confirm completion" }).click();
  await page.getByRole("button", { name: /Upload a headshot/u }).click();
  const headshotTask = page.getByRole("article", { name: "Upload a headshot" });
  await expect(
    headshotTask.getByRole("heading", { level: 2, name: "Upload lifecycle" }),
  ).toBeVisible();
  await expect(headshotTask.locator("[data-file-upload]")).toBeVisible();
  await expect(headshotTask.getByText(/Drop your headshot file here or browse/u)).toBeVisible();
  await headshotTask.locator("[data-file-upload]").screenshot({
    path: `${evidenceDir}/portal-task-headshot.png`,
  });

  await page.goto("/portal/profile?event=event-evaluator");
  await expect(page.getByRole("heading", { level: 1, name: "Your event profile" })).toBeVisible({
    timeout: 30_000,
  });
  const profileUpload = page
    .locator("#profile-headshot")
    .locator("xpath=ancestor::*[@data-file-upload][1]");
  await expect(profileUpload).toBeVisible();
  await profileUpload.screenshot({ path: `${evidenceDir}/portal-profile-headshot.png` });
});
