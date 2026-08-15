import { expect, test } from "./fixtures/auth";
import { installPortalApi } from "./fixtures/portal-api";

test("speaker upload and download surfaces show their effective formats", async ({
  authSession,
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await installPortalApi(page, authSession);

  await page.goto("/portal?event=event-evaluator");
  await page.getByRole("link", { name: "Tasks", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Requests & tasks" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: /Confirm speaker agreement/u }).click();
  await page.getByRole("button", { name: "Confirm completion" }).click();
  await page.getByRole("button", { name: /Upload a headshot/u }).click();
  const headshotTask = page.getByRole("article", { name: "Upload a headshot" });
  await expect(
    headshotTask.getByText("Accepted: PNG. Maximum 4.8 MiB.", { exact: true }),
  ).toBeVisible();
  await expect(headshotTask.getByLabel("Choose headshot")).toHaveAttribute("accept", "image/png");

  await page.getByRole("link", { name: "Files", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Files for/u })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByLabel("File type").selectOption("headshot");
  await expect(
    page.getByText("Accepted: JPG, PNG, WebP. Maximum 5.0 MiB.", { exact: true }),
  ).toBeVisible();

  await page.getByLabel("File type").selectOption("supporting_file");
  await expect(
    page.getByText("Accepted: PDF, Word, Plain text, JPG, PNG, WebP. Maximum 25.0 MiB.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Choose file")).toHaveAttribute(
    "accept",
    [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "image/jpeg",
      "image/png",
      "image/webp",
    ].join(","),
  );

  const formatMetadata = page.getByText("Format", { exact: true }).first().locator("..");
  await expect(formatMetadata).toContainText("application/pdf");
  await page.screenshot({
    path: testInfo.outputPath("upload-format-guidance.png"),
    fullPage: true,
  });
  const downloadRequest = page.waitForRequest(
    (request) =>
      request.method() === "GET" && request.url().includes("/assets/capabilities/download/"),
  );
  await page.getByRole("button", { name: "Download current version" }).click();
  expect((await downloadRequest).url()).toContain("opaque-download-token");
});
