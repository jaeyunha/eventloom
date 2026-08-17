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

test("public refresh tokens preserve panel geometry and readable metadata", async ({ page }) => {
  await page.goto("/embed/demo-event/sessions");

  const styles = await page.locator("[class*='embedRoot']").evaluate((root) => {
    const computed = getComputedStyle(root);
    const first = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (element === null) return null;
      const style = getComputedStyle(element);
      return {
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
        color: style.color,
      };
    };
    return {
      radius3: computed.getPropertyValue("--pub-radius-3").trim(),
      radius4: computed.getPropertyValue("--pub-radius-4").trim(),
      shadow1: computed.getPropertyValue("--pub-shadow-1").trim(),
      shadow2: computed.getPropertyValue("--pub-shadow-2").trim(),
      subtle: computed.getPropertyValue("--pub-subtle").trim(),
      muted: computed.getPropertyValue("--pub-muted").trim(),
      masthead: first("[class*='embedMasthead']"),
      filters: first("[class*='filters']"),
      sessionCard: first("[class*='publicSessionCard']"),
      sessionTime: first("[class*='publicSessionTime']"),
    };
  });

  expect(styles.radius3).not.toBe("");
  expect(styles.radius4).not.toBe("");
  expect(styles.shadow1).not.toBe("");
  expect(styles.shadow2).not.toBe("");
  expect(styles.subtle).toBe(styles.muted);
  expect(styles.masthead?.borderRadius).toBe("12px");
  expect(styles.masthead?.boxShadow).not.toBe("none");
  expect(styles.filters?.borderRadius).toBe("12px");
  expect(styles.filters?.boxShadow).not.toBe("none");
  expect(styles.sessionCard?.borderRadius).toContain("12px");
  expect(styles.sessionCard?.boxShadow).not.toBe("none");
  expect(styles.sessionTime?.borderRadius).toBe("8px");

  await page.goto("/embed/demo-event/sessions?theme=dark");
  const darkStyles = await page.locator("[class*='embedRoot']").evaluate((root) => {
    const computed = getComputedStyle(root);
    const masthead = document.querySelector<HTMLElement>("[class*='embedMasthead']");
    const mastheadStyle = masthead === null ? null : getComputedStyle(masthead);
    return {
      radius3: computed.getPropertyValue("--pub-radius-3").trim(),
      radius4: computed.getPropertyValue("--pub-radius-4").trim(),
      shadow1: computed.getPropertyValue("--pub-shadow-1").trim(),
      shadow2: computed.getPropertyValue("--pub-shadow-2").trim(),
      subtle: computed.getPropertyValue("--pub-subtle").trim(),
      muted: computed.getPropertyValue("--pub-muted").trim(),
      mastheadRadius: mastheadStyle?.borderRadius,
      mastheadShadow: mastheadStyle?.boxShadow,
    };
  });
  expect(darkStyles.radius3).not.toBe("");
  expect(darkStyles.radius4).not.toBe("");
  expect(darkStyles.shadow1).not.toBe("");
  expect(darkStyles.shadow2).not.toBe("");
  expect(darkStyles.subtle).toBe(darkStyles.muted);
  expect(darkStyles.mastheadRadius).toBe("12px");
  expect(darkStyles.mastheadShadow).not.toBe("none");
});
