import { expect, test } from "./fixtures/auth";

test.use({ authRole: "organizer" });

function record(value: unknown): Record<string, unknown> {
  expect(value).not.toBeNull();
  expect(typeof value).toBe("object");
  expect(Array.isArray(value)).toBe(false);
  return value as Record<string, unknown>;
}

test("previews current edits to an existing speaker email template", async ({ page }) => {
  await page.goto("/admin/organizations/local-organization/events/demo-event/speakers");
  await page.getByRole("checkbox").first().check();
  await page.getByRole("tab", { name: "Email" }).click();
  await page.getByRole("button", { name: "Use welcome starter" }).click();
  await page.getByLabel("Template name").fill("Existing draft binding");
  await page.getByLabel("Subject").fill("Saved v1 for {{first_name}}");
  await page.getByRole("tab", { name: "Plain text" }).click();
  await page.locator("#email-text").fill("Saved v1 for {{display_name}}.");

  const saveResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/speakers/email/templates") &&
      !response.url().includes("/versions"),
  );
  await page.getByRole("button", { name: "Save draft" }).click();
  const saveResponse = await saveResponsePromise;
  expect(saveResponse.status()).toBe(201);
  expect(record(saveResponse.request().postDataJSON())).not.toHaveProperty("html");
  const saved = record(record(await saveResponse.json()).data);
  expect(saved.version).toBe(1);

  await page.getByLabel("Subject").fill("Current v2 for {{first_name}}");
  await page.locator("#email-text").fill("Current v2 for {{display_name}}.");

  const previewResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && response.url().includes("/speakers/email/preview"),
  );
  await page.getByRole("button", { name: "Preview selected recipients" }).click();
  const previewResponse = await previewResponsePromise;
  expect(previewResponse.status()).toBe(200);
  const preview = record(record(await previewResponse.json()).data);
  expect(preview.templateVersion).toBe(2);
  expect(preview.subject).toBe("Current v2 for Alex");
  const recipients = preview.recipients;
  expect(Array.isArray(recipients)).toBe(true);
  const recipient = record((recipients as readonly unknown[])[0]);
  expect(recipient.text).toContain("Current v2 for Alex Rivera.");
  expect(recipient.html).toContain("Current v2 for Alex Rivera.");
  expect(recipient.text).not.toContain("Saved v1");
  expect(recipient.html).not.toContain("Saved v1");
});

test("keeps generated HTML read-only in the speaker email editor", async ({ page }) => {
  await page.goto("/admin/organizations/local-organization/events/demo-event/speakers");
  await page.getByRole("checkbox").first().check();
  await page.getByRole("tab", { name: "Email" }).click();
  await page.getByRole("button", { name: "Use welcome starter" }).click();
  await page.getByRole("tab", { name: "HTML source" }).click();

  await expect(page.locator("#email-html")).toHaveAttribute("readonly", "");
});
