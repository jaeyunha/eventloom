import { expect, test } from "@playwright/test";

test("public sessions filter by title and speaker and restore the full program", async ({
  page,
}, testInfo) => {
  await page.goto("/embed/demo-event/sessions");

  const search = page.getByPlaceholder("Search by title or speaker");
  const cards = page.locator("ol article");
  await expect(search).toBeVisible();
  await expect(cards).toHaveCount(2);
  await expect(page.getByText("Sessions 1 - 2 of 2", { exact: true })).toBeVisible();

  await search.fill("Designing reliable community systems");
  await expect(cards).toHaveCount(1);
  await expect(
    page.getByRole("heading", {
      level: 3,
      name: "Designing reliable community systems",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 3,
      name: "Developer platforms that teams trust under pressure in practice",
    }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("public-session-title-search-desktop.png"),
    fullPage: true,
  });

  await search.fill("Taylor Silva");
  await expect(cards).toHaveCount(1);
  await expect(
    page.getByRole("heading", {
      level: 3,
      name: "Developer platforms that teams trust under pressure in practice",
    }),
  ).toBeVisible();

  await search.fill("definitely-no-public-session");
  await expect(cards).toHaveCount(0);
  await expect(page.getByText("Sessions 0 of 2", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 3,
      name: "No sessions match these filters",
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(search).toHaveValue("");
  await expect(cards).toHaveCount(2);
  await expect(page.getByText("Sessions 1 - 2 of 2", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 3,
      name: "No sessions match these filters",
    }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  const embedNavigation = page.getByRole("navigation", {
    name: "Published event views",
  });
  await expect
    .poll(() =>
      embedNavigation.evaluate(
        (navigation) =>
          window.getComputedStyle(navigation).maskImage.includes("linear-gradient") &&
          navigation.scrollWidth > navigation.clientWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("public-session-search-cleared-mobile.png"),
    fullPage: true,
  });
});
