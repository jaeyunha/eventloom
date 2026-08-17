import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const SESSION_COOKIE = {
  name: "better-auth.session_token",
  value: "local-session",
  domain: "127.0.0.1",
  path: "/",
  httpOnly: true,
  sameSite: "Lax" as const,
};

const reviewsUrl = "/admin/organizations/local-organization/events/demo-event/reviews";

test("organizer export retries one run and downloads its durable CSV", async ({
  page,
}, testInfo) => {
  await page.context().addCookies([SESSION_COOKIE]);
  const createRequests: { readonly idempotencyKey: string | null }[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /\/api\/admin\/evaluations\/plans\/[^/]+\/exports$/u.test(new URL(request.url()).pathname)
    ) {
      createRequests.push({
        idempotencyKey: request.headers()["idempotency-key"] ?? null,
      });
    }
  });
  let failNextStatus = true;
  await page.route(/\/api\/admin\/evaluations\/plans\/[^/]+\/exports\/[^/]+$/u, async (route) => {
    if (route.request().method() === "GET" && failNextStatus) {
      failNextStatus = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "TEMPORARY_STATUS_FAILURE",
            message: "Status is temporarily unavailable.",
          },
        }),
      });
      return;
    }
    await route.fallback();
  });

  await page.goto(reviewsUrl);
  await page.getByRole("tab", { name: "Results" }).click();
  const exportButton = page.getByRole("button", { name: "Export CSV" });
  await expect(exportButton).toBeVisible();
  await exportButton.evaluate((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("The review export action was not a button.");
    }
    button.click();
    button.click();
  });

  await expect(page.getByText("Status is temporarily unavailable.", { exact: true })).toBeVisible();
  expect(createRequests).toHaveLength(1);
  expect(createRequests[0]?.idempotencyKey).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
  );

  await page.getByRole("button", { name: "Retry CSV export" }).click();
  const downloadLink = page.getByRole("link", { name: "Download CSV" });
  await expect(downloadLink).toBeVisible({ timeout: 60_000 });
  expect(createRequests).toHaveLength(2);
  expect([...new Set(createRequests.map((request) => request.idempotencyKey))]).toHaveLength(1);

  const downloadPromise = page.waitForEvent("download");
  await downloadLink.click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (downloadPath === null) throw new Error("The review export download was unavailable.");
  const csv = await readFile(downloadPath, "utf8");
  expect(csv).toContain("Submission ID,Title,Participants,Lifecycle status,Decision status");
  expect(csv).toContain("submitted");

  await page.screenshot({
    path: testInfo.outputPath("review-export-ready-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(downloadLink).toBeVisible();
  const reviewRound = page.getByRole("combobox", { name: "Review round" });
  const reviewRoundHint = page.getByText("Uses this round's saved scorecard.", { exact: true });
  const reviewRoundStatus = page.getByTestId("round-results-status");
  const mobileNavigation = page.getByRole("navigation", { name: "Mobile navigation" });
  const [
    reviewRoundBounds,
    reviewRoundHintBounds,
    reviewRoundStatusBounds,
    mobileNavigationBounds,
  ] = await Promise.all([
    reviewRound.boundingBox(),
    reviewRoundHint.boundingBox(),
    reviewRoundStatus.boundingBox(),
    mobileNavigation.boundingBox(),
  ]);
  expect(reviewRoundBounds).not.toBeNull();
  expect(reviewRoundHintBounds).not.toBeNull();
  expect(reviewRoundStatusBounds).not.toBeNull();
  expect(mobileNavigationBounds).not.toBeNull();
  expect((reviewRoundBounds?.y ?? 0) + (reviewRoundBounds?.height ?? 0)).toBeLessThanOrEqual(
    mobileNavigationBounds?.y ?? 0,
  );
  expect(
    (reviewRoundHintBounds?.y ?? 0) + (reviewRoundHintBounds?.height ?? 0),
  ).toBeLessThanOrEqual(mobileNavigationBounds?.y ?? 0);
  expect(
    (reviewRoundStatusBounds?.y ?? 0) + (reviewRoundStatusBounds?.height ?? 0),
  ).toBeLessThanOrEqual(mobileNavigationBounds?.y ?? 0);
  const layout = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);
  await page.screenshot({
    path: testInfo.outputPath("review-export-ready-mobile.png"),
    fullPage: true,
  });
});
