import { expect, test } from "./fixtures/auth";

test.use({ authRole: "submitter" });

async function selectSearchable(
  page: import("@playwright/test").Page,
  label: string,
  option: string,
): Promise<void> {
  const combobox = page.getByRole("combobox", { name: label });
  await combobox.fill(option);
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect(combobox).toHaveValue(option);
}

test("submitter completes the account-first CFP with two participants", async ({ page }) => {
  await page.goto("/cfp/evaluator-2026");

  await expect(page.getByRole("heading", { level: 1, name: "Welcome to our event!" })).toBeVisible();
  const continueButton = page.getByRole("button", { name: "Continue →" });
  await continueButton.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/cfp\/evaluator-2026\/account$/);

  await page.getByLabel("Your Email Address:").fill("ada@example.test");
  await page.getByLabel("Create a password:").fill("CalmSystems!26");
  await page.getByLabel("First Name").fill("Ada");
  await page.getByLabel("Last Name").fill("Speaker");
  await page.getByRole("checkbox", { name: /I agree to the Terms of Service/ }).check();
  await page.getByRole("button", { name: "Create account →" }).click();
  await expect(page).toHaveURL(/\/cfp\/evaluator-2026\/submission$/);

  await page.getByLabel("Title").fill("Designing calm incident response");
  await page
    .getByLabel("Description")
    .fill("A practical, evidence-led approach to building resilient teams before an incident begins.");
  await selectSearchable(page, "Format", "Breakout Session");
  await page.getByRole("checkbox", { name: "Leadership" }).check();
  await selectSearchable(page, "Track", "Track 2");
  await selectSearchable(page, "Level", "Advanced");
  await selectSearchable(page, "Language", "English");
  await page.getByRole("button", { name: "Next step →" }).click();
  await expect(page).toHaveURL(/\/cfp\/evaluator-2026\/participants$/);

  await expect(page.getByLabel("First Name").first()).toHaveValue("Ada");
  await expect(page.getByLabel("Last Name").first()).toHaveValue("Speaker");
  await expect(page.getByLabel("Email").first()).toHaveValue("ada@example.test");
  await page.getByLabel("Biography").first().fill("Staff engineer and resilient-systems educator.");
  await page.getByRole("button", { name: "＋ Add participant" }).click();
  await page.getByLabel("First Name").nth(1).fill("Grace");
  await page.getByLabel("Last Name").nth(1).fill("Cooper");
  await page.getByLabel("Email").nth(1).fill("grace@example.test");
  await page.getByLabel("Biography").nth(1).fill("Engineering leader and incident facilitator.");
  await page.getByRole("button", { name: "Continue to review →" }).click();
  await expect(page).toHaveURL(/\/cfp\/evaluator-2026\/review$/);

  await expect(page.getByRole("heading", { level: 1, name: "Review your submission" })).toBeVisible();
  await expect(page.getByText("Designing calm incident response", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: /Ada Speaker/ })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: /Grace Cooper/ })).toBeVisible();
  await page.getByRole("button", { name: "Submit", exact: true }).click();

  await expect(page).toHaveURL(/\/cfp\/evaluator-2026\/complete$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Thank you for submitting to present at our event!",
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to portal →" })).toBeVisible();

  const persistedReceipt = await page.evaluate(() => {
    const raw = window.localStorage.getItem(
      "open-sessionboard:cfp-draft:v1:evaluator-2026",
    );
    return raw ? (JSON.parse(raw) as { receipt?: { id?: string } }).receipt : null;
  });
  expect(persistedReceipt?.id).toMatch(/^submission-/);
});

test("required CFP validation announces errors and focuses the first invalid field", async ({ page }) => {
  await page.goto("/cfp/validation-check/account");
  await page.getByRole("button", { name: "Create account →" }).click();

  const errorSummary = page.getByRole("alert").filter({ hasText: "Check the highlighted fields." });
  await expect(errorSummary).toBeVisible();
  await expect(errorSummary).toContainText("Enter a valid email address.");
  await expect(page.getByLabel("Your Email Address:")).toBeFocused();
  await expect(page.getByLabel("Your Email Address:")).toHaveAttribute("aria-invalid", "true");
});

test("CFP draft survives a reload without submitting", async ({ page }) => {
  await page.goto("/cfp/resume-check/account");
  await page.getByLabel("Your Email Address:").fill("resume@example.test");
  await page.getByLabel("First Name").fill("Resilient");
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Your Email Address:")).toHaveValue("resume@example.test");
  await expect(page.getByLabel("First Name")).toHaveValue("Resilient");
});
