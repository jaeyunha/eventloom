import { expect, test } from "@playwright/test";

const reviewerUrl = "/review?organizationId=local-organization&eventId=demo-event";

test("reviewers receive human-only score controls without shared AI triage", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: "local-reviewer-session",
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(reviewerUrl);
  const queue = page.getByRole("region", { name: "Assigned reviews" });
  await queue
    .getByRole("button", { name: /Open scorecard for/ })
    .first()
    .click();

  await expect(page.getByRole("heading", { name: "Score this submission" })).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Recommendation" }).getByRole("combobox"),
  ).toBeVisible();
  await expect(page.getByText("AI triage", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/AI suggestion/u)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Generate|Regenerate|Save override/u }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("reviewer-human-only-desktop.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).resolves.toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("reviewer-human-only-mobile.png"),
    fullPage: true,
  });
});
