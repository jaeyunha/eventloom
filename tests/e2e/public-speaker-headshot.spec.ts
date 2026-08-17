import { expect, test } from "@playwright/test";

test("released headshot renders across every public speaker surface", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);

  const speakersResponse = await request.get("/api/public/events/demo-event/speakers");
  expect(speakersResponse.status()).toBe(200);
  const speakersPayload = await speakersResponse.json();
  const publishedSpeaker = (
    speakersPayload as {
      data?: { speakers?: Array<{ displayName: string; photoUrl: string | null }> };
    }
  ).data?.speakers?.find((speaker) => speaker.photoUrl !== null);
  if (publishedSpeaker?.photoUrl === null || publishedSpeaker?.photoUrl === undefined) {
    throw new Error("Expected a released public speaker headshot.");
  }
  await page.goto("/embed/demo-event/speakers-list");
  const listHeadshot = page.getByRole("img", {
    name: `${publishedSpeaker.displayName} headshot`,
  });
  const listHeadshotImage = listHeadshot.locator('[style*="background-image"]');
  await expect
    .poll(() =>
      listHeadshotImage.evaluate((image) => window.getComputedStyle(image).backgroundImage),
    )
    .toContain(publishedSpeaker.photoUrl);
  const headshotResponse = await request.get(
    new URL(publishedSpeaker.photoUrl, page.url()).toString(),
  );
  expect(headshotResponse.status()).toBe(200);
  expect(headshotResponse.headers()["content-type"]).toBe("image/png");
  await page.screenshot({
    path: testInfo.outputPath("public-speakers-list-headshot.png"),
    fullPage: true,
  });

  await page.goto("/embed/demo-event/speakers");
  const speakerCard = page
    .locator('button[aria-haspopup="dialog"]')
    .filter({ hasText: publishedSpeaker.displayName });
  const cardHeadshotImage = speakerCard.locator('[style*="background-image"]');
  await expect
    .poll(() =>
      cardHeadshotImage.evaluate((image) => window.getComputedStyle(image).backgroundImage),
    )
    .toContain(publishedSpeaker.photoUrl);
  await speakerCard.click();
  const detailDialog = page.getByRole("dialog");
  await expect(detailDialog.getByRole("button", { name: "Back to speakers" })).toBeFocused();
  await expect
    .poll(() =>
      detailDialog
        .locator('[style*="background-image"]')
        .evaluate((image) => window.getComputedStyle(image).backgroundImage),
    )
    .toContain(publishedSpeaker.photoUrl);
  await page.screenshot({
    path: testInfo.outputPath("public-speaker-gallery-detail-headshot.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => detailDialog.evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth))
    .toBe(true);
  await expect
    .poll(() =>
      detailDialog
        .getByRole("article")
        .evaluate((article) => article.scrollWidth <= article.clientWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("public-speaker-gallery-detail-headshot-mobile.png"),
    fullPage: true,
  });
  const detailSurface = detailDialog.locator(":scope > div").first();
  await detailSurface.evaluate((surface) => surface.scrollTo({ top: surface.scrollHeight }));
  await expect(detailDialog.getByText("Track: Main stage")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detailDialog).toBeHidden();
  await expect(speakerCard).toBeFocused();
});
