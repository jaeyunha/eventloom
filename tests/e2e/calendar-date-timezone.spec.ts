import { expect, test, type Page } from "@playwright/test";

const ORGANIZATION_ID = "local-organization";
const SESSION_COOKIE = "better-auth.session_token";
const SESSION_TOKEN = "local-session";
const EVENT_NAME = "DevFlow Calendar Dates";
const EVENT_SLUG = "devflow-calendar-dates";
const EVENT_TIME_ZONE = "America/Los_Angeles";
const adminEventPath = `/api/admin/organizations/${ORGANIZATION_ID}/events`;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  expect(value).toBeDefined();
  expect(typeof value).toBe("object");
  expect(value).not.toBeNull();
  return value as JsonRecord;
}

function calendarCell(page: Page, date: string) {
  return page.locator("td", {
    has: page.locator(`time[datetime="${date}"]`),
  });
}

test.use({ timezoneId: "Asia/Tokyo" });

test.beforeEach(async ({ context }) => {
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: SESSION_TOKEN,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
});

test("event timezone keeps editor, calendar, API, and public dates aligned", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.clock.install({ time: new Date("2026-08-15T12:00:00.000Z") });

  const sessionReady = page.waitForResponse(
    (response) => response.url().endsWith("/api/auth/get-session") && response.ok(),
    { timeout: 90_000 },
  );
  await page.goto(`/admin/organizations/${ORGANIZATION_ID}/events?create=1`);
  await sessionReady;
  await expect(page.getByRole("heading", { level: 2, name: "Create event" })).toBeVisible();

  await page.getByRole("textbox", { name: /^Event name\b/u }).fill(EVENT_NAME);
  await page.getByRole("textbox", { name: /^Public URL slug\b/u }).fill(EVENT_SLUG);
  await page.getByRole("combobox", { name: /^Event time zone\b/u }).fill(EVENT_TIME_ZONE);

  const eventSchedule = page.getByRole("region", { name: "When does this event happen?" });
  for (let month = 0; month < 9; month += 1) {
    await eventSchedule.getByRole("button", { name: "Next month" }).click();
  }
  await expect(eventSchedule.getByText("May 2027", { exact: true })).toBeVisible();
  await eventSchedule.getByRole("button", { name: /Starts Choose date/u }).click();
  await eventSchedule.getByRole("button", { name: "Wed, May 12, 2027" }).click();
  await eventSchedule.getByRole("button", { name: /Ends May 12, 2027/u }).click();
  await eventSchedule.getByRole("button", { name: "Fri, May 14, 2027" }).click();
  await page.getByLabel("Start time").fill("09:00");
  await page.getByLabel("End time").fill("16:00");
  await page
    .getByRole("textbox", { name: /^Event location\b/u })
    .fill("Moscone West, San Francisco, CA");

  const createResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith(adminEventPath) && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.status()).toBe(201);
  const created = record(record(await createResponse.json()).data);
  expect(created).toMatchObject({
    name: EVENT_NAME,
    slug: EVENT_SLUG,
    timeZone: EVENT_TIME_ZONE,
    startsAt: "2027-05-12T16:00:00.000Z",
    endsAt: "2027-05-14T23:00:00.000Z",
  });
  await expect(page.getByText("Event created.", { exact: true })).toBeVisible();

  const monthHeading = page.getByRole("heading", { level: 3, name: "May 2027" });
  for (let month = 0; month < 12 && !(await monthHeading.isVisible()); month += 1) {
    await page.getByRole("button", { name: "Next month" }).click();
  }
  await expect(monthHeading).toBeVisible();

  const summary = page.getByRole("complementary", { name: "Calendar summary" });
  await expect(summary.getByText(EVENT_NAME, { exact: true })).toBeVisible();
  await expect(summary).toContainText(/May 12, 2027.*America\/Los_Angeles/u);
  for (const date of ["2027-05-12", "2027-05-13", "2027-05-14"]) {
    await expect(calendarCell(page, date).getByRole("link", { name: EVENT_NAME })).toBeVisible();
  }
  for (const date of ["2027-05-11", "2027-05-15"]) {
    await expect(calendarCell(page, date).getByRole("link", { name: EVENT_NAME })).toHaveCount(0);
  }
  await page.screenshot({
    path: testInfo.outputPath("calendar-dates-asia-tokyo.png"),
    fullPage: true,
  });
  await page.locator('[role="tabpanel"][data-state="active"]').screenshot({
    path: testInfo.outputPath("calendar-dates-workspace-asia-tokyo.png"),
  });

  const eventId = created.id;
  const version = created.version;
  expect(typeof eventId).toBe("string");
  expect(typeof version).toBe("number");
  if (typeof eventId !== "string" || typeof version !== "number") {
    throw new Error("Created event did not include a typed id and version.");
  }

  const publishResponse = await context.request.patch(`${adminEventPath}/${eventId}`, {
    data: {
      expectedVersion: version,
      status: "active",
    },
  });
  expect(publishResponse.status()).toBe(200);

  const agendaResponse = await context.request.post(`${adminEventPath}/${eventId}/agenda`, {
    data: {
      minimumTravelMinutes: 10,
      sessions: [],
      rooms: [],
      tracks: [],
    },
  });
  expect(agendaResponse.status()).toBe(201);
  const agenda = record(record(await agendaResponse.json()).data);
  const agendaVersion = agenda.version;
  expect(typeof agendaVersion).toBe("number");
  if (typeof agendaVersion !== "number") {
    throw new Error("Created agenda did not include a numeric version.");
  }
  const publishAgendaResponse = await context.request.post(
    `${adminEventPath}/${eventId}/agenda/publish`,
    {
      data: {
        expectedVersion: agendaVersion,
      },
    },
  );
  expect(publishAgendaResponse.status()).toBe(200);

  const publicResponse = await context.request.get("/api/public/events");
  expect(publicResponse.status()).toBe(200);
  const publicOrganizations = record(await publicResponse.json()).data;
  expect(Array.isArray(publicOrganizations)).toBe(true);
  if (!Array.isArray(publicOrganizations)) {
    throw new Error("Public event directory did not return an array.");
  }
  const publicEvents = publicOrganizations.flatMap((organization) => {
    const events = record(organization).events;
    return Array.isArray(events) ? events.map(record) : [];
  });
  expect(publicEvents.find((event) => event.slug === EVENT_SLUG)).toMatchObject({
    name: EVENT_NAME,
    timeZone: EVENT_TIME_ZONE,
    startsOn: "2027-05-12",
    endsOn: "2027-05-14",
  });

  await page.goto("/events");
  const publicEvent = page.locator("article", {
    has: page.getByRole("heading", { level: 3, name: EVENT_NAME, exact: true }),
  });
  await expect(publicEvent).toContainText("May 12–14, 2027");
  await expect(publicEvent).toContainText(EVENT_TIME_ZONE);
  await expect(publicEvent.getByRole("link", { name: "View event", exact: true })).toHaveAttribute(
    "href",
    `/events/${EVENT_SLUG}`,
  );
  await page.screenshot({
    path: testInfo.outputPath("public-event-dates-asia-tokyo.png"),
    fullPage: true,
  });
});
