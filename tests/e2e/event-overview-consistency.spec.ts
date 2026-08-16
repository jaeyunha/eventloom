import { expect, test } from "@playwright/test";

const ORGANIZATION_ID = "local-organization";
const EVENT_ID = "open-sessionboard-conf";
const SESSION_COOKIE = {
  name: "better-auth.session_token",
  value: "local-session",
  domain: "127.0.0.1",
  path: "/",
  httpOnly: true,
  sameSite: "Lax" as const,
};

test("event overview uses live data and a responsive phase grid", async ({ page }, testInfo) => {
  await page.context().addCookies([SESSION_COOKIE]);

  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "tablet", width: 820, height: 1180 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`/admin/organizations/${ORGANIZATION_ID}/events/${EVENT_ID}`);

    await expect(
      page.getByRole("heading", { level: 1, name: "Eventloom Conference" }),
    ).toBeVisible();
    await expect(page.getByText("0 submissions", { exact: true })).toBeVisible();
    await expect(page.getByText("Submission intake needs setup", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Agenda metrics are unavailable", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Agenda metrics could not be loaded.", { exact: true }),
    ).toBeVisible();

    const progress = page.getByLabel("Event program progress");
    const phases = ["Intake", "Review", "Agenda", "Publish"].map((name) =>
      progress.getByRole("link", { name: new RegExp(`^${name}\\b`, "u") }),
    );
    const bounds = await Promise.all(phases.map((phase) => phase.boundingBox()));
    bounds.forEach((box) => {
      expect(box).not.toBeNull();
    });
    expect(Math.abs((bounds[0]?.y ?? 0) - (bounds[1]?.y ?? 1))).toBeLessThanOrEqual(2);
    if (viewport.name !== "mobile") {
      expect(Math.abs((bounds[0]?.y ?? 0) - (bounds[3]?.y ?? 1))).toBeLessThanOrEqual(2);
    } else {
      expect(Math.abs((bounds[2]?.y ?? 0) - (bounds[3]?.y ?? 1))).toBeLessThanOrEqual(2);
      expect(bounds[2]?.y ?? 0).toBeGreaterThan(bounds[0]?.y ?? Number.POSITIVE_INFINITY);
    }

    const layout = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));
    expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);

    await page.screenshot({
      path: testInfo.outputPath(`event-overview-${viewport.name}.png`),
    });
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/admin/organizations/${ORGANIZATION_ID}/events/${EVENT_ID}/submissions`);
  await expect(page.getByText("0 total", { exact: true })).toBeVisible();
  await expect(page.getByText("No submissions yet", { exact: true })).toBeVisible();
  await expect(page.getByText("Unable to load submissions", { exact: true })).toHaveCount(0);
});
