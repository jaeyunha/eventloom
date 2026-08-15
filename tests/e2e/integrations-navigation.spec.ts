import { expect, test } from "./fixtures/auth";

const ORGANIZATION_ID = "local-organization";
const EVENT_ID = "open-sessionboard-conf";
const INTEGRATIONS_PATH = `/admin/organizations/${ORGANIZATION_ID}/events/${EVENT_ID}/integrations`;

const integrationSnapshot = {
  event: {
    id: EVENT_ID,
    name: "Demo Event",
    timeZone: "America/Los_Angeles",
    publishedAgendaRevisionId: "agenda-revision-1",
  },
  delivery: {
    openSend: {
      state: "connected",
      credentialLastFour: "2468",
      senderChecks: [],
      deliveredLast24Hours: 4,
      failedLast24Hours: 0,
      lastDeliveryAt: "2026-08-15T12:00:00.000Z",
    },
    calendar: {
      state: "connected",
      sentLast24Hours: 4,
      failedLast24Hours: 0,
      lastInvitationAt: "2026-08-15T12:00:00.000Z",
      lastFailure: null,
    },
  },
  apiKeys: [],
  webhooks: [],
} as const;

test.use({ authRole: "organizer" });

test("switching integration sections keeps the loaded snapshot", async ({ page }) => {
  test.setTimeout(90_000);
  let snapshotRequests = 0;
  await page.route(`**/api/admin/organizations/${ORGANIZATION_ID}/events`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "private, no-store" },
      body: JSON.stringify({
        data: [{ id: EVENT_ID, name: "Demo Event", slug: EVENT_ID }],
      }),
    });
  });
  await page.route(`**${INTEGRATIONS_PATH.replace("/admin/", "/api/admin/")}`, async (route) => {
    snapshotRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "private, no-store" },
      body: JSON.stringify({ data: integrationSnapshot }),
    });
  });

  const sectionPaths = [
    INTEGRATIONS_PATH,
    `${INTEGRATIONS_PATH}/api-keys`,
    `${INTEGRATIONS_PATH}/webhooks`,
    `${INTEGRATIONS_PATH}/delivery`,
  ] as const;
  const prewarmResponses = await Promise.all(sectionPaths.map((path) => page.request.get(path)));
  for (const response of prewarmResponses) {
    expect(response.ok()).toBe(true);
  }

  await page.goto(INTEGRATIONS_PATH);
  await expect(page.getByRole("heading", { name: "Integrations", exact: true })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Integration settings" });

  await navigation.getByRole("link", { name: "Organization API keys", exact: true }).click();
  await expect(page).toHaveURL(`${INTEGRATIONS_PATH}/api-keys`, { timeout: 15_000 });
  await expect(
    page.getByRole("heading", { name: "Organization API keys", exact: true }),
  ).toBeVisible();

  await navigation.getByRole("link", { name: "Webhooks", exact: true }).click();
  await expect(page).toHaveURL(`${INTEGRATIONS_PATH}/webhooks`, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Webhooks", exact: true })).toBeVisible();

  await navigation.getByRole("link", { name: "Email & calendar", exact: true }).click();
  await expect(page).toHaveURL(`${INTEGRATIONS_PATH}/delivery`, { timeout: 15_000 });
  await expect(
    page.getByRole("heading", { name: "Delivery operations", exact: true }),
  ).toBeVisible();

  await navigation.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page).toHaveURL(INTEGRATIONS_PATH, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Integrations", exact: true })).toBeVisible();

  expect(snapshotRequests).toBe(1);
});
