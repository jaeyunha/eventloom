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

test("public agenda and itinerary remain usable on mobile", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/embed/demo-event/agenda");

  await expect(page.getByRole("heading", { level: 2, name: "Agenda" })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 4,
      name: "Designing reliable community systems",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 4,
      name: "Developer platforms that teams trust under pressure in practice",
    }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <= document.documentElement.clientWidth &&
          document.body.scrollWidth <= document.body.clientWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("public-agenda-mobile.png"),
    fullPage: true,
  });

  await page.goto("/embed/demo-event/itinerary");
  await expect(page.getByRole("heading", { level: 2, name: "Itinerary" })).toBeVisible();
  const addToSchedule = page.getByRole("button", { name: "Add to my schedule" }).first();
  await expect(addToSchedule).toBeVisible();
  await addToSchedule.click();
  await expect(page.getByRole("button", { name: "Remove from my schedule" })).toBeVisible();
  await page.getByRole("button", { name: "My schedule (1)" }).click();
  await expect(page.getByRole("button", { name: "Remove from my schedule" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <= document.documentElement.clientWidth &&
          document.body.scrollWidth <= document.body.clientWidth,
      ),
    )
    .toBe(true);
  await page.getByRole("main").screenshot({
    path: testInfo.outputPath("public-itinerary-mobile.png"),
  });
});
