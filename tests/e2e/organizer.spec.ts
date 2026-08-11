import type { Page, Request, Route } from "@playwright/test";
import type {
  OrganizerEventCreateInput,
  OrganizerEventRecord,
  OrganizerOverviewActivityData,
  OrganizerOverviewCoreData,
} from "../../apps/web/src/features/admin/organizer-overview";
import type { AgendaEntry, AgendaWorkspaceData } from "../../apps/web/src/features/agenda/types";
import type {
  EventRoom,
  EventSettingsAuditEntry,
  EventSettingsData,
  EventTaxonomyResource,
  SessionSettingsRecord,
} from "../../apps/web/src/features/settings/api";
import { E2E_SESSION_COOKIE, type E2eAuthSession, expect, test } from "./fixtures/auth";

test.use({ authRole: "organizer" });

const ORGANIZATION_ID = "ai-engineer";
const ORGANIZER_EMAIL = "jaeyunha0317@gmail.com";
const ORGANIZER_PASSWORD = "CalmSystems!26";
const PRIMARY_EVENT_ID = "open-sessionboard-conf";
const SECONDARY_EVENT_ID = "devflow-conf-2027";
const SEEDED_AT = "2026-08-08T12:00:00.000Z";

const corsHeaders = {
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "accept, content-type",
  "access-control-allow-methods": "GET,PATCH,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-origin": "http://127.0.0.1:3015",
};

interface OrganizerApiHarness {
  readonly requests: Request[];
  readonly createdInputs: OrganizerEventCreateInput[];
  readonly verifiedLogins: string[];
}

interface InstallOrganizerApiOptions {
  readonly includeSecondaryEvent?: boolean;
}

function eventRecord(input: {
  id: string;
  slug: string;
  name: string;
  startsAt: string;
  endsAt: string;
  createdBy: string;
  timeZone?: string;
}): OrganizerEventRecord {
  const timeZone = input.timeZone ?? "America/Los_Angeles";
  return {
    id: input.id,
    organizationId: ORGANIZATION_ID,
    slug: input.slug,
    name: input.name,
    status: "active",
    timeZone,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    venue: "Sessionboard Hall",
    cfpSettings: {
      enabled: true,
      opensAt: "2026-06-01T16:00:00.000Z",
      closesAt: "2026-08-15T06:59:59.000Z",
    },
    defaultCalendarSettings: {
      durationMinutes: 45,
      timeZone,
      location: "Sessionboard Hall",
    },
    version: 1,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    createdBy: input.createdBy,
    updatedBy: input.createdBy,
  };
}

function agendaEntry(input: {
  id: string;
  sessionId: string;
  title: string;
  roomId: string;
  roomName: string;
  trackId: string;
  trackName: string;
  startsAtLocal: string;
  endsAtLocal: string;
}): AgendaEntry {
  return {
    id: input.id,
    sessionId: input.sessionId,
    title: input.title,
    format: "Talk",
    speakerNames: ["Morgan Lee"],
    roomId: input.roomId,
    roomName: input.roomName,
    trackIds: [input.trackId],
    trackNames: [input.trackName],
    startsAtLocal: input.startsAtLocal,
    endsAtLocal: input.endsAtLocal,
  };
}

function agendaFor(event: OrganizerEventRecord): AgendaWorkspaceData {
  const primary = event.id === PRIMARY_EVENT_ID;
  const entry = primary
    ? agendaEntry({
        id: "entry-open-keynote",
        sessionId: "session-open-keynote",
        title: "Opening keynote: Systems that earn trust",
        roomId: "room-main",
        roomName: "Main Hall",
        trackId: "track-main",
        trackName: "Main stage",
        startsAtLocal: "2026-09-18T09:00",
        endsAtLocal: "2026-09-18T09:45",
      })
    : agendaEntry({
        id: "entry-devflow-keynote",
        sessionId: "session-devflow-keynote",
        title: "DevFlow platform patterns",
        roomId: "room-devflow",
        roomName: "DevFlow Studio",
        trackId: "track-devflow",
        trackName: "Platform practice",
        startsAtLocal: "2027-03-18T10:00",
        endsAtLocal: "2027-03-18T10:45",
      });
  const revision = {
    id: `revision-${event.id}`,
    number: 1,
    publishedAt: SEEDED_AT,
    publishedBy: "Organizer",
    sessionCount: 1,
    current: true,
  } as const;
  return {
    event: {
      id: event.id,
      name: event.name,
      timeZone: event.timeZone,
      startsOn: event.startsAt.slice(0, 10),
      endsOn: event.endsAt.slice(0, 10),
    },
    draft: {
      version: 3,
      updatedAt: SEEDED_AT,
      updatedBy: "Organizer",
      entries: [entry],
    },
    rooms: [
      {
        id: entry.roomId,
        name: entry.roomName,
        capacity: 250,
      },
    ],
    tracks: [
      {
        id: entry.trackIds[0] ?? "track-main",
        name: entry.trackNames[0] ?? "Main stage",
        color: primary ? "#4f5ee8" : "#d45c36",
      },
    ],
    unscheduledSessions: [
      {
        id: `session-unscheduled-${event.id}`,
        title: primary ? "Designing reliable CFP operations" : "Shipping calm release systems",
        format: "Workshop",
        durationMinutes: 60,
        speakerNames: ["Avery Kim"],
        capacityRequired: 80,
      },
    ],
    revisions: [revision],
    currentPublishedRevision: revision,
  };
}

function settingsResource(
  eventId: string,
  id: string,
  name: string,
  createdBy: string,
): EventTaxonomyResource {
  return {
    id,
    tenantId: ORGANIZATION_ID,
    eventId,
    name,
    description: `${name} for ${eventId}`,
    version: 1,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    createdBy,
    updatedBy: createdBy,
    history: [],
  };
}

function settingsFor(event: OrganizerEventRecord): EventSettingsData {
  const actorId = event.createdBy;
  const settings: SessionSettingsRecord = {
    id: `settings-${event.id}`,
    tenantId: ORGANIZATION_ID,
    eventId: event.id,
    statuses: ["Draft", "Submitted", "Accepted", "Waitlisted", "Rejected", "Withdrawn"],
    agendaEligibleStatuses: ["Accepted"],
    version: 1,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    createdBy: actorId,
    updatedBy: actorId,
    history: [],
  };
  const room: EventRoom = {
    id: `room-${event.id}`,
    tenantId: ORGANIZATION_ID,
    eventId: event.id,
    name: event.id === PRIMARY_EVENT_ID ? "Main Hall" : "DevFlow Studio",
    capacity: 250,
    resources: ["Projector", "Microphones"],
    version: 1,
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    createdBy: actorId,
    updatedBy: actorId,
    history: [],
  };
  const audit: EventSettingsAuditEntry[] = [];
  return {
    organizationId: ORGANIZATION_ID,
    eventId: event.id,
    settings,
    rooms: [room],
    tracks: [settingsResource(event.id, `track-${event.id}`, "Main stage", actorId)],
    formats: [settingsResource(event.id, `format-${event.id}`, "Talk", actorId)],
    levels: [settingsResource(event.id, `level-${event.id}`, "All levels", actorId)],
    tags: [settingsResource(event.id, `tag-${event.id}`, "Featured", actorId)],
    audit,
  };
}

function overviewCoreFor(events: readonly OrganizerEventRecord[]): OrganizerOverviewCoreData {
  return {
    organizationId: ORGANIZATION_ID,
    metrics: {
      eventCount: events.length,
    },
    events: events.map((event) => ({
      id: event.id,
      name: event.name,
      slug: event.slug,
      status: event.status,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
    })),
  };
}

function overviewActivityFor(
  events: readonly OrganizerEventRecord[],
): OrganizerOverviewActivityData {
  return {
    organizationId: ORGANIZATION_ID,
    metrics: {
      submissionCount: events.length,
      pendingReviewCount: 1,
      outstandingSpeakerTaskCount: 2,
      publishedSessionCount: events.length,
    },
    actionItems: [
      {
        id: `agenda:${PRIMARY_EVENT_ID}`,
        type: "agenda",
        eventId: PRIMARY_EVENT_ID,
        title: "Review the published agenda",
        description: "Confirm the current agenda before sharing the event program.",
        count: 1,
        priority: 50,
        dueAt: null,
        href: `/admin/organizations/${ORGANIZATION_ID}/events/${PRIMARY_EVENT_ID}/agenda`,
      },
    ],
  };
}

async function fulfillJson(route: Route, data: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: corsHeaders,
    body: JSON.stringify({ data }),
  });
}

async function fulfillError(
  route: Route,
  status: number,
  code: string,
  message: string,
): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: corsHeaders,
    body: JSON.stringify({ error: { code, message, traceId: "trace-organizer-e2e" } }),
  });
}

function expectAuthenticated(request: Request, session: E2eAuthSession): void {
  expect(request.headers().cookie ?? "").toContain(`${E2E_SESSION_COOKIE}=${session.token}`);
}

async function installOrganizerApi(
  page: Page,
  session: E2eAuthSession,
  options: InstallOrganizerApiOptions = {},
): Promise<OrganizerApiHarness> {
  const primaryEvent = eventRecord({
    id: PRIMARY_EVENT_ID,
    slug: PRIMARY_EVENT_ID,
    name: "Open Sessionboard Conference",
    startsAt: "2026-09-18T16:00:00.000Z",
    endsAt: "2026-09-19T23:00:00.000Z",
    createdBy: session.userId,
  });
  const secondaryEvent = eventRecord({
    id: SECONDARY_EVENT_ID,
    slug: SECONDARY_EVENT_ID,
    name: "DevFlow Conf 2027",
    startsAt: "2027-03-18T16:00:00.000Z",
    endsAt: "2027-03-19T00:30:00.000Z",
    createdBy: session.userId,
  });
  let events: OrganizerEventRecord[] = [
    primaryEvent,
    ...(options.includeSecondaryEvent ? [secondaryEvent] : []),
  ];
  const requests: Request[] = [];
  const createdInputs: OrganizerEventCreateInput[] = [];
  const verifiedLogins: string[] = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    requests.push(request);
    const url = new URL(request.url());

    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    if (request.method() === "POST" && url.pathname === "/api/auth/sign-in/email") {
      const body = request.postDataJSON() as { email?: unknown; password?: unknown };
      expect(Object.keys(body).sort()).toEqual(["email", "password"]);
      expect(body).toEqual({ email: ORGANIZER_EMAIL, password: ORGANIZER_PASSWORD });
      verifiedLogins.push(ORGANIZER_EMAIL);
      await fulfillJson(route, {
        session: { id: "verified-organizer-session", email: ORGANIZER_EMAIL, emailVerified: true },
        user: { id: session.userId, email: ORGANIZER_EMAIL, emailVerified: true },
      });
      return;
    }

    if (request.method() === "GET" && url.pathname === "/api/auth/get-session") {
      await fulfillJson(route, {
        session: { id: "verified-organizer-session" },
        user: { id: session.userId },
        memberships: [{ organizationId: ORGANIZATION_ID, role: "owner" }],
        speakerGrants: [],
      });
      return;
    }

    expectAuthenticated(request, session);

    const expectedPrefix = `/api/admin/organizations/${ORGANIZATION_ID}`;
    if (request.method() === "GET" && url.pathname === `${expectedPrefix}/overview/core`) {
      await fulfillJson(route, overviewCoreFor(events));
      return;
    }
    if (request.method() === "GET" && url.pathname === `${expectedPrefix}/overview/activity`) {
      await fulfillJson(route, overviewActivityFor(events));
      return;
    }

    const eventsCollectionPath = `${expectedPrefix}/events`;
    if (url.pathname === eventsCollectionPath && request.method() === "GET") {
      await fulfillJson(route, events);
      return;
    }

    if (url.pathname === eventsCollectionPath && request.method() === "POST") {
      const body = request.postDataJSON() as OrganizerEventCreateInput;
      expect(Object.keys(body).sort()).toEqual([
        "cfpSettings",
        "defaultCalendarSettings",
        "endsAt",
        "name",
        "slug",
        "startsAt",
        "status",
        "timeZone",
        "venue",
      ]);
      expect(Object.keys(body.cfpSettings ?? {}).sort()).toEqual([
        "closesAt",
        "enabled",
        "opensAt",
      ]);
      expect(Object.keys(body.defaultCalendarSettings ?? {}).sort()).toEqual([
        "durationMinutes",
        "location",
        "timeZone",
      ]);
      expect(body.name).toBe("DevFlow Conf 2027");
      expect(body.slug).toBe(SECONDARY_EVENT_ID);
      expect(body.timeZone).toBe("America/Los_Angeles");
      expect(body.startsAt).toBe("2027-03-18T16:00:00.000Z");
      expect(body.endsAt).toBe("2027-03-19T23:30:00.000Z");
      expect(body.cfpSettings).toEqual({ enabled: false, opensAt: null, closesAt: null });
      const created: OrganizerEventRecord = {
        ...eventRecord({
          id: SECONDARY_EVENT_ID,
          slug: SECONDARY_EVENT_ID,
          name: body.name,
          startsAt: body.startsAt,
          endsAt: body.endsAt,
          createdBy: session.userId,
          timeZone: body.timeZone,
        }),
        status: body.status ?? "draft",
        venue: body.venue ?? null,
        cfpSettings: body.cfpSettings,
        defaultCalendarSettings: body.defaultCalendarSettings,
      };
      events = [created, ...events.filter((event) => event.id !== created.id)];
      createdInputs.push(body);
      await fulfillJson(route, created, 201);
      return;
    }

    const eventItemMatch = new RegExp(`^${expectedPrefix}/events/([^/]+)$`, "u").exec(url.pathname);
    if (eventItemMatch?.[1] && request.method() === "GET") {
      const event = events.find((candidate) => candidate.id === eventItemMatch[1]);
      if (event) {
        await fulfillJson(route, event);
        return;
      }
      await fulfillError(route, 404, "NOT_FOUND", "The event was not found.");
      return;
    }

    const eventPathMatch = new RegExp(`^${expectedPrefix}/events/([^/]+)(?:/(.*))?$`, "u").exec(
      url.pathname,
    );
    if (eventPathMatch?.[1]) {
      const eventId = eventPathMatch[1];
      const event = events.find((candidate) => candidate.id === eventId);
      if (!event) {
        await fulfillError(route, 404, "NOT_FOUND", "The event was not found.");
        return;
      }
      const suffix = eventPathMatch[2] ?? "";
      const agenda = agendaFor(event);
      const settings = settingsFor(event);
      if (request.method() === "GET" && suffix === "agenda") {
        await fulfillJson(route, agenda);
        return;
      }
      if (request.method() === "GET" && suffix === "sessions/settings") {
        await fulfillJson(route, settings.settings);
        return;
      }
      if (request.method() === "GET" && suffix === "sessions/rooms") {
        await fulfillJson(route, settings.rooms);
        return;
      }
      if (request.method() === "GET" && suffix === "sessions/tracks") {
        await fulfillJson(route, settings.tracks);
        return;
      }
      if (request.method() === "GET" && suffix === "sessions/formats") {
        await fulfillJson(route, settings.formats);
        return;
      }
      if (request.method() === "GET" && suffix === "sessions/levels") {
        await fulfillJson(route, settings.levels);
        return;
      }
      if (request.method() === "GET" && suffix === "sessions/tags") {
        await fulfillJson(route, settings.tags);
        return;
      }
      if (request.method() === "GET" && suffix === "sessions/audit") {
        await fulfillJson(route, settings.audit);
        return;
      }
      await fulfillError(route, 404, "E2E_ROUTE_NOT_FOUND", `No organizer route for ${suffix}.`);
      return;
    }

    if (url.pathname.startsWith("/api/admin/organizations/")) {
      await fulfillError(
        route,
        404,
        "E2E_SCOPE_NOT_FOUND",
        "The requested organization scope is not seeded.",
      );
      return;
    }

    await route.continue();
  });

  return { requests, createdInputs, verifiedLogins };
}

function agendaUrl(eventId: string): string {
  return `/admin/organizations/${ORGANIZATION_ID}/events/${eventId}/agenda`;
}

function settingsUrl(eventId: string): string {
  return `/admin/organizations/${ORGANIZATION_ID}/events/${eventId}/settings`;
}

async function expectAgendaWorkspace(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { level: 1, name: "Agenda workspace" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Draft schedule" })).toBeVisible();
  await expect(page.getByRole("tablist", { name: "Schedule view" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview and validate" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish immutable revision" })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Agenda workspace unavailable" }),
  ).toHaveCount(0);
  await expect(page.getByText("The agenda could not be loaded.", { exact: true })).toHaveCount(0);
}

test("verified organizer login opens the organization overview", async ({ authSession, page }) => {
  expect(authSession.role).toBe("organizer");
  expect(authSession.email).toBe(ORGANIZER_EMAIL);
  const api = await installOrganizerApi(page, authSession);

  await page.goto("/login");
  await expect(
    page.getByRole("heading", { level: 1, name: "Welcome back to the program desk." }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill(ORGANIZER_EMAIL);
  await page.getByLabel("Password").fill(ORGANIZER_PASSWORD);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Organization overview" }),
  ).toBeVisible();
  await expect(page.getByText("ai-engineer", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Signed in organizer" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Events" })).toBeVisible();
  await expect(
    page.getByText("Open Sessionboard Conference", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Events", exact: true })).toBeVisible();
  expect(api.verifiedLogins).toEqual([ORGANIZER_EMAIL]);
  const overviewRequests = api.requests
    .filter((request) => request.method() === "GET")
    .map((request) => new URL(request.url()).pathname);
  expect(overviewRequests).toEqual(
    expect.arrayContaining([
      `/api/admin/organizations/${ORGANIZATION_ID}/overview/core`,
      `/api/admin/organizations/${ORGANIZATION_ID}/overview/activity`,
    ]),
  );
});

test("dedicated Events page creates an event with canonical timezone and dates", async ({
  authSession,
  page,
}) => {
  const api = await installOrganizerApi(page, authSession);

  await page.goto("/admin/events");
  await expect(page.getByRole("heading", { level: 1, name: "Event management" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Events" })).toBeVisible();
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Create an event" })).toBeVisible();

  await page.getByLabel("Event name").fill("DevFlow Conf 2027");
  await page.getByLabel("URL slug").fill(SECONDARY_EVENT_ID);
  await page.getByLabel("Event time zone").fill("America/Los_Angeles");
  await page.getByLabel("Starts").fill("2027-03-18T09:00");
  await page.getByLabel("Ends").fill("2027-03-19T16:30");
  await page.getByLabel("Venue").fill("DevFlow Studio");
  await page.getByRole("button", { name: "Create event", exact: true }).click();

  await expect(page.getByText("Event created.", { exact: true })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "DevFlow Conf 2027" });
  await expect(row).toBeVisible();
  await expect(row).toContainText(`/${SECONDARY_EVENT_ID}`);
  await expect(row).toContainText("America/Los_Angeles");
  await expect(row).toContainText("Draft");

  expect(api.createdInputs).toHaveLength(1);
  expect(api.createdInputs[0]).toMatchObject({
    name: "DevFlow Conf 2027",
    slug: SECONDARY_EVENT_ID,
    timeZone: "America/Los_Angeles",
    startsAt: "2027-03-18T16:00:00.000Z",
    endsAt: "2027-03-19T23:30:00.000Z",
    venue: "DevFlow Studio",
    status: "draft",
    cfpSettings: { enabled: false, opensAt: null, closesAt: null },
  });
});

test("canonical Settings navigation stays organization and event qualified", async ({
  authSession,
  page,
}) => {
  const api = await installOrganizerApi(page, authSession);

  await page.goto("/admin/events");
  await page.getByRole("link", { name: "Open Sessionboard Conference", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${settingsUrl(PRIMARY_EVENT_ID)}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Event settings" })).toBeVisible();
  await expect(
    page.getByText(`Organization ${ORGANIZATION_ID} · Event ${PRIMARY_EVENT_ID}`, { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Event settings sections" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sessions and statuses", exact: true }),
  ).toHaveAttribute("href", "#session-settings");

  const organizerSidebar = page.locator('aside[aria-label="Organizer workspace"]');
  await expect(organizerSidebar.getByRole("link", { name: "Agenda", exact: true })).toHaveAttribute(
    "href",
    agendaUrl(PRIMARY_EVENT_ID),
  );
  await organizerSidebar.getByRole("link", { name: "Agenda", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${agendaUrl(PRIMARY_EVENT_ID)}$`));
  await expectAgendaWorkspace(page);

  await organizerSidebar.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${settingsUrl(PRIMARY_EVENT_ID)}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Event settings" })).toBeVisible();
  expect(
    api.requests
      .filter((request) => request.method() === "GET")
      .filter((request) => new URL(request.url()).pathname.includes("/sessions/"))
      .every((request) =>
        new URL(request.url()).pathname.includes(
          `/organizations/${ORGANIZATION_ID}/events/${PRIMARY_EVENT_ID}/`,
        ),
      ),
  ).toBe(true);
});

test("agenda workspace exposes all five accessible view modes without an unavailable state", async ({
  authSession,
  page,
}) => {
  await installOrganizerApi(page, authSession);

  await page.goto(agendaUrl(PRIMARY_EVENT_ID));
  await expectAgendaWorkspace(page);

  const viewModes = ["List", "Day", "Week", "Track", "Room"] as const;
  await expect(page.getByRole("tab")).toHaveCount(viewModes.length);
  for (const mode of viewModes) {
    const tab = page.getByRole("tab", { name: mode, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toBeVisible();
    await expectAgendaWorkspace(page);
  }
});

test("agenda data remains isolated between organization-qualified events", async ({
  authSession,
  page,
}) => {
  const api = await installOrganizerApi(page, authSession, { includeSecondaryEvent: true });

  await page.goto(agendaUrl(PRIMARY_EVENT_ID));
  await expectAgendaWorkspace(page);
  await expect(
    page.getByText("Open Sessionboard Conference", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Opening keynote: Systems that earn trust" }),
  ).toBeVisible();
  await expect(page.getByText("DevFlow Conf 2027", { exact: true })).toHaveCount(0);

  await page.goto(agendaUrl(SECONDARY_EVENT_ID));
  await expectAgendaWorkspace(page);
  await expect(page.getByText("DevFlow Conf 2027", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "DevFlow platform patterns" })).toBeVisible();
  await expect(page.getByText("Open Sessionboard Conference", { exact: true })).toHaveCount(0);

  const agendaRequests = api.requests.filter(
    (request) => request.method() === "GET" && new URL(request.url()).pathname.endsWith("/agenda"),
  );
  expect(new Set(agendaRequests.map((request) => new URL(request.url()).pathname))).toEqual(
    new Set([
      `/api/admin/organizations/${ORGANIZATION_ID}/events/${PRIMARY_EVENT_ID}/agenda`,
      `/api/admin/organizations/${ORGANIZATION_ID}/events/${SECONDARY_EVENT_ID}/agenda`,
    ]),
  );
});
