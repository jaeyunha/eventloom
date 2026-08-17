import { expect, test } from "@playwright/test";

const reviewerPath = "/review?organizationId=local-organization&eventId=demo-event";
const organizerReviewsPath = "/admin/organizations/local-organization/events/demo-event/reviews";
const organizerComment =
  "Judge QA reviewer note: prioritize rollback evidence and concrete migration tradeoffs.";

test("organizer can audit submitted reviewer comments beside the aggregate", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto(`/login?next=${encodeURIComponent(reviewerPath)}`);
  await page.getByLabel("Email address").fill("reviewer@local.eventloom.test");
  await page.getByLabel("Password").fill("reviewer-local");
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(page).toHaveURL(/\/review\?organizationId=local-organization/, {
    timeout: 60_000,
  });

  const reviewRow = page
    .getByRole("region", { name: "Assigned reviews" })
    .getByRole("listitem")
    .filter({ hasText: "In progress" })
    .first();
  await expect(reviewRow).toBeVisible();
  const submissionTitle = (
    await reviewRow.getByRole("heading", { level: 3 }).textContent()
  )?.trim();
  if (!submissionTitle) throw new Error("Expected an in-progress submission title.");

  await reviewRow.getByRole("button", { name: /Open scorecard for/ }).click();
  await expect(page.getByRole("heading", { name: "Score this submission" })).toBeVisible();
  await expect(page.getByText("Human confirmed · counted", { exact: true })).toHaveCount(2);
  await page.getByLabel("Comments for the organizing committee").fill(organizerComment);
  const submitReview = page
    .locator('[data-reviewer-scorecard-footer="true"]')
    .getByRole("button", { name: "Submit review" });
  await expect(submitReview).toBeEnabled();
  await submitReview.click();
  await expect(page.getByText("Review submitted to the committee.", { exact: true })).toBeVisible();

  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await page.goto(`/login?next=${encodeURIComponent(organizerReviewsPath)}`);
  await page.getByLabel("Email address").fill("organizer@local.eventloom.test");
  await page.getByLabel("Password").fill("organizer-local");
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(page).toHaveURL(new RegExp(`${organizerReviewsPath}$`), { timeout: 60_000 });

  await page.getByRole("tab", { name: "Results" }).click();
  await page.getByRole("combobox", { name: "Decision status" }).selectOption({
    label: "All submissions",
  });
  await page.getByRole("searchbox", { name: "Find a submission" }).fill(submissionTitle);
  const resultRow = page.getByRole("row").filter({ hasText: submissionTitle });
  await expect(resultRow).toBeVisible();
  await resultRow.getByRole("button", { name: "Review" }).click();

  const reviewEvidence = page.locator('[data-review-evidence="submitted"]');
  await expect(
    reviewEvidence.getByRole("heading", { name: "Submitted reviewer comments" }),
  ).toBeVisible();
  await expect(reviewEvidence.getByText(organizerComment, { exact: true })).toBeVisible();
  await expect(reviewEvidence.getByText(/^Review \d+$/)).toHaveCount(2);
});
