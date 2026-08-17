import { expect, test } from "./fixtures/auth";

test.use({ authRole: "organizer" });

test("embed workspace describes the private event record without a lifecycle status", async ({
  page,
}, testInfo) => {
  await page.goto("/admin/organizations/local-organization/events/open-sessionboard-conf/embeds");

  const publicationDetails = page.getByRole("button", { name: "Publication details" }).first();
  await publicationDetails.click();
  const publicationSummary = publicationDetails.locator("xpath=../..");
  await expect(publicationSummary.getByText("Event record", { exact: true })).toBeVisible();
  await expect(page.getByText("Draft event", { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("organizer-embed-event-record.png"),
    fullPage: true,
  });
});
