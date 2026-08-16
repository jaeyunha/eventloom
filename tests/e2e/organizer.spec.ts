import type { Locator, Page, Request, Route } from "@playwright/test";
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

const ORGANIZATION_ID = "local-organization";
const PRIMARY_EVENT_ID = "open-sessionboard-conf";
const SECONDARY_EVENT_ID = "devflow-conf-2027";
const SEEDED_AT = "2026-08-08T12:00:00.000Z";
const DISTINCT_PRIMARY_EVENT_SLUG = "test-summit-local";

const corsHeaders = {
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "accept, content-type",
  "access-control-allow-methods": "GET,PATCH,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-origin": "http://127.0.0.1:3015",
};

interface OrganizerApiHarness {
  readonly requests: Request[];
  readonly createdInputs: OrganizerEventCreateInput[];
}

interface InstallOrganizerApiOptions {
  readonly includeSecondaryEvent?: boolean;
  readonly primaryEndsAt?: string;
  readonly primaryEventSlug?: string;
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
    venue: "Eventloom Hall",
    cfpSettings: {
      enabled: true,
      opensAt: "2026-06-01T16:00:00.000Z",
      closesAt: "2026-08-15T06:59:59.000Z",
    },
    defaultCalendarSettings: {
      durationMinutes: 45,
      timeZone,
      location: "Eventloom Hall",
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
        trackIds: [...entry.trackIds],
        trackNames: [...entry.trackNames],
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
    slug: options.primaryEventSlug ?? PRIMARY_EVENT_ID,
    name: "Eventloom Conference",
    startsAt: "2026-09-18T16:00:00.000Z",
    endsAt: options.primaryEndsAt ?? "2026-09-19T23:00:00.000Z",
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

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    requests.push(request);
    const url = new URL(request.url());

    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    if (request.method() === "GET" && url.pathname === "/api/auth/get-session") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: corsHeaders,
        body: JSON.stringify({
          session: { id: "verified-organizer-session", userId: session.userId },
          user: { id: session.userId, email: session.email, name: session.displayName },
          memberships: [{ organizationId: ORGANIZATION_ID, role: "owner" }],
          speakerGrants: [],
        }),
      });
      return;
    }

    expectAuthenticated(request, session);

    const expectedPrefix = `/api/admin/organizations/${ORGANIZATION_ID}`;
    if (request.method() === "GET" && url.pathname === `${expectedPrefix}/members/organizations`) {
      await fulfillJson(route, [{ organizationId: ORGANIZATION_ID, name: "Eventloom organizers" }]);
      return;
    }
    if (
      request.method() === "GET" &&
      url.pathname === "/api/admin/evaluations/reviewer/workspace"
    ) {
      await fulfillJson(route, { assignments: [] });
      return;
    }
    if (request.method() === "GET" && url.pathname === "/api/speaker/portal/contexts") {
      await fulfillJson(route, []);
      return;
    }
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
      if (request.method() === "GET" && suffix === "integrations") {
        await fulfillJson(route, {
          event: {
            id: event.id,
            name: event.name,
            timeZone: event.timeZone,
            publishedAgendaRevisionId: "agenda-revision-e2e",
          },
          delivery: {
            openSend: {
              state: "connected",
              credentialLastFour: "2468",
              senderChecks: [],
              deliveredLast24Hours: 12,
              failedLast24Hours: 0,
              lastDeliveryAt: SEEDED_AT,
            },
            calendar: {
              state: "connected",
              sentLast24Hours: 8,
              failedLast24Hours: 0,
              lastInvitationAt: SEEDED_AT,
              lastFailure: null,
            },
          },
          apiKeys: [],
          webhooks: [],
        });
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

  return { requests, createdInputs };
}

function organizationUrl(): string {
  return `/admin/organizations/${ORGANIZATION_ID}`;
}

async function clickLinkAndWaitForUrl(page: Page, link: Locator, targetUrl: string): Promise<void> {
  await Promise.all([page.waitForURL(targetUrl), link.click()]);
}

function organizationEventsUrl(): string {
  return `${organizationUrl()}/events`;
}

function agendaUrl(eventId: string): string {
  return `/admin/organizations/${ORGANIZATION_ID}/events/${eventId}/agenda`;
}

function settingsUrl(eventId: string): string {
  return `/admin/organizations/${ORGANIZATION_ID}/events/${eventId}/settings`;
}

async function expectAgendaWorkspace(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { level: 1, name: "Agenda" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Build the event day" })).toBeVisible();
  await expect(page.getByLabel("Agenda release center")).toBeVisible();
  await expect(page.getByRole("tablist", { name: "Schedule view" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview and validate" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish agenda" })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Agenda workspace unavailable" }),
  ).toHaveCount(0);
  await expect(page.getByText("The agenda could not be loaded.", { exact: true })).toHaveCount(0);
}

test("verified organizer login opens the organization overview through the shared shell", async ({
  authSession,
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(authSession.role).toBe("organizer");
  const api = await installOrganizerApi(page, authSession);
  await page.addInitScript(
    (organizationId) =>
      window.localStorage.setItem("eventloom.organizer-organization", organizationId),
    ORGANIZATION_ID,
  );

  await page.goto("/login");
  await expect(page).toHaveURL("/work");
  await expect(
    page.getByRole("heading", { level: 1, name: "Where do you want to work?" }),
  ).toBeVisible();
  const organizerWorkspace = page.locator('[data-workspace="organizer"]');
  await expect(organizerWorkspace).toBeVisible();
  const continueToOrganization = organizerWorkspace.getByRole("link", {
    name: "Continue with Eventloom organizers",
  });
  await expect(continueToOrganization).toHaveAttribute("href", organizationEventsUrl());
  await clickLinkAndWaitForUrl(page, continueToOrganization, organizationEventsUrl());
  await expect(page.getByRole("heading", { level: 1, name: "Event management" })).toBeVisible();

  const overviewLink = page.getByRole("link", { name: "Eventloom organizer overview" });
  await expect(overviewLink).toHaveAttribute("href", organizationUrl());
  await clickLinkAndWaitForUrl(page, overviewLink, organizationUrl());
  await expect(
    page.getByRole("heading", { level: 1, name: "Organization overview" }),
  ).toBeVisible();
  await expect(
    page.locator("#admin-content").getByText(ORGANIZATION_ID, { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Events" })).toBeVisible();

  await page.keyboard.press("Control+k");
  const commandPalette = page.getByRole("dialog", { name: "Search events and pages" });
  await expect(commandPalette).toBeVisible();
  const commandSearch = commandPalette.getByRole("combobox", { name: "Search events and pages" });
  await expect(commandSearch).toBeFocused();
  await commandSearch.fill("nothing matches");
  await expect(commandPalette.getByText("No matching events or pages.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(commandPalette).toBeHidden();
  await expect(page.getByRole("button", { name: "Search or jump to" })).toBeFocused();

  const agendaDestination = agendaUrl(PRIMARY_EVENT_ID);
  const agendaLink = page.getByRole("link", {
    name: "Open agenda for Eventloom Conference",
    exact: true,
  });
  await expect(agendaLink).toHaveAttribute("href", agendaDestination);
  await agendaLink.click();
  await expect(page).toHaveURL(agendaDestination);
  await expectAgendaWorkspace(page);

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

test("keeps organizer reads bounded when revisiting through links and browser history", async ({
  authSession,
  page,
}) => {
  const api = await installOrganizerApi(page, authSession);

  await page.goto(organizationUrl());
  await expect(
    page.getByRole("heading", { level: 1, name: "Organization overview" }),
  ).toBeVisible();

  const organizationNavigation = page.getByRole("navigation", {
    name: "Organization organizer navigation",
  });
  const membersLink = organizationNavigation.getByRole("link", { name: "Members", exact: true });
  const membersPath = `${organizationUrl()}/members`;
  await expect(membersLink).toHaveAttribute("href", membersPath);
  await clickLinkAndWaitForUrl(page, membersLink, membersPath);

  await Promise.all([
    page.waitForURL(organizationUrl()),
    page.evaluate(() => window.history.back()),
  ]);
  await expect(page).toHaveURL(organizationUrl());
  await expect(
    page.getByRole("heading", { level: 1, name: "Organization overview" }),
  ).toBeVisible();

  await clickLinkAndWaitForUrl(page, membersLink, membersPath);

  const overviewLink = organizationNavigation.getByRole("link", { name: "Overview", exact: true });
  await overviewLink.click();
  await expect(page).toHaveURL(organizationUrl());
  await expect(
    page.getByRole("heading", { level: 1, name: "Organization overview" }),
  ).toBeVisible();

  const overviewReads = api.requests
    .filter((request) => request.method() === "GET")
    .map((request) => new URL(request.url()).pathname)
    .filter((pathname) =>
      pathname.includes(`/api/admin/organizations/${ORGANIZATION_ID}/overview/`),
    );
  const corePath = `/api/admin/organizations/${ORGANIZATION_ID}/overview/core`;
  const activityPath = `/api/admin/organizations/${ORGANIZATION_ID}/overview/activity`;
  const coreReads = overviewReads.filter((pathname) => pathname === corePath).length;
  const activityReads = overviewReads.filter((pathname) => pathname === activityPath).length;

  expect(new Set(overviewReads)).toEqual(new Set([corePath, activityPath]));
  expect(coreReads).toBeGreaterThan(0);
  expect(coreReads).toBeLessThanOrEqual(3);
  expect(activityReads).toBe(coreReads);
});

test("organization overview reflows without document overflow", async ({ authSession, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installOrganizerApi(page, authSession);
  await page.goto(organizationUrl());

  await expect(
    page.getByRole("heading", { level: 1, name: "Organization overview" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Events" })
      .getByRole("heading", { level: 2, name: "Eventloom Conference" }),
  ).toBeVisible();
  const mobileNavigation = page.getByRole("navigation", { name: "Organizer mobile navigation" });
  await expect(mobileNavigation).toBeVisible();
  await expect(mobileNavigation.getByRole("link", { name: "Overview", exact: true })).toBeVisible();
  await mobileNavigation.getByRole("button", { name: "More navigation destinations" }).click();
  const additionalNavigation = page.getByRole("dialog", { name: "More navigation" });
  await expect(additionalNavigation).toBeVisible();
  await expect(
    additionalNavigation.getByRole("link", { name: "Settings", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(additionalNavigation).toBeHidden();
  const mobileOverflow = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("body *")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        let ancestor: HTMLElement | null = element;
        let hasFixedAncestor = false;
        while (ancestor && !hasFixedAncestor) {
          hasFixedAncestor = getComputedStyle(ancestor).position === "fixed";
          ancestor = ancestor.parentElement;
        }
        return {
          tag: element.tagName,
          className: element.className,
          left: rect.left,
          right: rect.right,
          visible:
            !hasFixedAncestor &&
            element.getClientRects().length > 0 &&
            getComputedStyle(element).visibility !== "hidden" &&
            !element.classList.contains("sr-only"),
        };
      })
      .filter(({ left, right, visible }) => visible && (left < -1 || right > window.innerWidth + 1))
      .slice(0, 10),
  );
  expect(mobileOverflow).toEqual([]);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
});

test("dedicated Events page creates an event with canonical timezone and dates", async ({
  authSession,
  page,
}) => {
  const api = await installOrganizerApi(page, authSession);
  await page.clock.install({ time: new Date("2026-08-15T12:00:00.000Z") });

  await page.goto(organizationEventsUrl());
  await expect(page.getByRole("heading", { level: 1, name: "Event management" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Events" })).toBeVisible();
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Create event" })).toBeVisible();

  await page.getByRole("textbox", { name: /^Event name\b/u }).fill("DevFlow Conf 2027");
  await page.getByRole("textbox", { name: /^Public URL slug\b/u }).fill(SECONDARY_EVENT_ID);
  await page.getByRole("combobox", { name: /^Event time zone\b/u }).fill("America/Los_Angeles");
  const eventSchedule = page.getByRole("region", { name: "When does this event happen?" });
  for (let month = 0; month < 7; month += 1) {
    await eventSchedule.getByRole("button", { name: "Next month" }).click();
  }
  await expect(eventSchedule.getByText("March 2027", { exact: true })).toBeVisible();
  await eventSchedule.getByRole("button", { name: /Starts Choose date/u }).click();
  await eventSchedule.getByRole("button", { name: "Thu, Mar 18, 2027" }).click();
  await eventSchedule.getByRole("button", { name: /Ends Mar 18, 2027/u }).click();
  await eventSchedule.getByRole("button", { name: "Fri, Mar 19, 2027" }).click();
  await page.getByLabel("Event start time").fill("09:00");
  await page.getByLabel("Event end time").fill("16:30");
  await page.getByRole("textbox", { name: /^Event location\b/u }).fill("DevFlow Studio");
  await page.getByRole("button", { name: "Create event", exact: true }).click();

  await expect(page.getByText("Event created.", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "List", exact: true }).click();
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
  const api = await installOrganizerApi(page, authSession, {
    primaryEventSlug: DISTINCT_PRIMARY_EVENT_SLUG,
  });

  await page.goto(organizationEventsUrl());
  const eventSettingsLink = page
    .getByRole("link", { name: "Eventloom Conference", exact: true })
    .first();
  const eventSettingsPath = settingsUrl(PRIMARY_EVENT_ID);
  await expect(eventSettingsLink).toHaveAttribute("href", eventSettingsPath);
  await clickLinkAndWaitForUrl(page, eventSettingsLink, eventSettingsPath);
  await expect(page.getByRole("heading", { level: 1, name: "Session workflow" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByText(`Organization ${ORGANIZATION_ID} · Public slug ${DISTINCT_PRIMARY_EVENT_SLUG}`, {
      exact: true,
    }),
  ).toBeVisible();
  const visibleSettingsSectionLink = async (name: RegExp) => {
    const desktopNavigation = page.getByRole("complementary", {
      name: "Event settings sections",
    });
    if (!(await desktopNavigation.isVisible())) {
      const trigger = page.getByRole("button", { name: "Choose event settings section" });
      await expect(trigger).toBeVisible();
      if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
    }
    return page.getByRole("link", { name });
  };
  const initialWorkflowSettingsLink = await visibleSettingsSectionLink(/Session workflow/u);
  await expect(initialWorkflowSettingsLink).toHaveAttribute(
    "href",
    `${settingsUrl(PRIMARY_EVENT_ID)}/workflow`,
  );
  for (const [name, section] of [
    [/Session workflow/u, "workflow"],
    [/Rooms and venues/u, "rooms"],
    [/Session classification/u, "classification"],
    [/Change history/u, "history"],
  ] as const) {
    const link = await visibleSettingsSectionLink(name);
    const href = await link.getAttribute("href");
    expect(href).toBe(`${settingsUrl(PRIMARY_EVENT_ID)}/${section}`);
    expect(href).not.toContain(DISTINCT_PRIMARY_EVENT_SLUG);
  }

  const programNavigation = page.getByRole("navigation", { name: "Program organizer navigation" });
  const agendaLink = programNavigation.getByRole("link", { name: "Agenda", exact: true });
  await expect(agendaLink).toHaveAttribute("href", agendaUrl(PRIMARY_EVENT_ID));
  await Promise.all([
    page.waitForURL(new RegExp(`${agendaUrl(PRIMARY_EVENT_ID)}$`)),
    agendaLink.click(),
  ]);
  await expectAgendaWorkspace(page);

  const peopleNavigation = page.getByRole("navigation", { name: "People organizer navigation" });
  const programSettingsLink = peopleNavigation.getByRole("link", {
    name: "Program settings",
    exact: true,
  });
  await expect(programSettingsLink).toHaveAttribute("href", settingsUrl(PRIMARY_EVENT_ID));
  await Promise.all([
    page.waitForURL(new RegExp(`${settingsUrl(PRIMARY_EVENT_ID)}$`)),
    programSettingsLink.click(),
  ]);
  await expect(page.getByRole("heading", { level: 1, name: "Session workflow" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const eventCollectionPath = `/api/admin/organizations/${ORGANIZATION_ID}/events`;
  const settingsWorkspaceReadCount = () =>
    api.requests.filter((request) => {
      if (request.method() !== "GET") return false;
      const pathname = new URL(request.url()).pathname;
      return pathname === eventCollectionPath || pathname.includes("/sessions/");
    }).length;
  const readsBeforeSectionNavigation = settingsWorkspaceReadCount();

  const roomsSettingsLink = await visibleSettingsSectionLink(/Rooms and venues/u);
  await Promise.all([
    page.waitForURL(new RegExp(`${settingsUrl(PRIMARY_EVENT_ID)}/rooms$`)),
    roomsSettingsLink.click(),
  ]);
  await expect(page.getByRole("heading", { level: 1, name: "Rooms and venues" })).toBeVisible();

  const classificationSettingsLink = await visibleSettingsSectionLink(/Session classification/u);
  await Promise.all([
    page.waitForURL(new RegExp(`${settingsUrl(PRIMARY_EVENT_ID)}/classification$`)),
    classificationSettingsLink.click(),
  ]);
  await expect(
    page.getByRole("heading", { level: 1, name: "Session classification" }),
  ).toBeVisible();

  const historySettingsLink = await visibleSettingsSectionLink(/Change history/u);
  await Promise.all([
    page.waitForURL(new RegExp(`${settingsUrl(PRIMARY_EVENT_ID)}/history$`)),
    historySettingsLink.click(),
  ]);
  await expect(page.getByRole("heading", { level: 1, name: "Change history" })).toBeVisible();

  const workflowSettingsLink = await visibleSettingsSectionLink(/Session workflow/u);
  await Promise.all([
    page.waitForURL(new RegExp(`${settingsUrl(PRIMARY_EVENT_ID)}/workflow$`)),
    workflowSettingsLink.click(),
  ]);
  await expect(page.getByRole("heading", { level: 1, name: "Session workflow" })).toBeVisible();
  expect(settingsWorkspaceReadCount()).toBe(readsBeforeSectionNavigation);
  const settingsRequests = api.requests.filter(
    (request) =>
      request.method() === "GET" && new URL(request.url()).pathname.includes("/sessions/"),
  );
  expect(settingsRequests).not.toHaveLength(0);
  expect(
    settingsRequests.every((request) =>
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

  const viewModes = ["Timetable", "All days", "List", "Tracks", "Rooms"] as const;
  await expect(page.getByRole("tab")).toHaveCount(viewModes.length);
  for (const mode of viewModes) {
    const tab = page.getByRole("tab", { name: mode, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toBeVisible();
    await expectAgendaWorkspace(page);
  }
});

test("organizer sidebar keeps every event destination reachable at constrained height", async ({
  authSession,
  page,
}, testInfo) => {
  await installOrganizerApi(page, authSession);

  for (const viewport of [
    { name: "normal", width: 1440, height: 900 },
    { name: "zoomed-out", width: 1800, height: 1125 },
  ] as const) {
    await page.setViewportSize(viewport);
    await page.goto(agendaUrl(PRIMARY_EVENT_ID));
    await expectAgendaWorkspace(page);
    await expect(page.getByText("Organization workspace", { exact: true })).toBeVisible();
    await expect(
      page
        .locator('[data-scroll-region="sidebar-navigation"]')
        .getByRole("link", { name: "Integrations", exact: true }),
    ).toBeInViewport();
    await page.screenshot({
      path: testInfo.outputPath(`organizer-sidebar-${viewport.name}.png`),
      fullPage: true,
    });
  }

  await page.setViewportSize({ width: 1152, height: 620 });
  await page.goto(agendaUrl(PRIMARY_EVENT_ID));
  await expectAgendaWorkspace(page);

  const navigation = page.locator('[data-scroll-region="sidebar-navigation"]');
  const integrationsLink = navigation.getByRole("link", {
    name: "Integrations",
    exact: true,
  });
  const footerLabel = page.getByText("Organization workspace", { exact: true });
  const main = page.locator("#admin-content");

  await expect(navigation).toBeVisible();
  await expect(footerLabel).toBeVisible();

  const metrics = await navigation.evaluate((element) => {
    const node = element as HTMLElement;
    return {
      clientHeight: node.clientHeight,
      overflowY: getComputedStyle(node).overflowY,
      scrollHeight: node.scrollHeight,
    };
  });
  expect(metrics.overflowY).toBe("auto");
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

  const footerBefore = await footerLabel.boundingBox();
  const mainScrollBefore = await main.evaluate((element) => (element as HTMLElement).scrollTop);

  await navigation.evaluate((element) => {
    const node = element as HTMLElement;
    node.scrollTop = node.scrollHeight;
  });

  await expect(integrationsLink).toBeInViewport();
  await expect(footerLabel).toBeVisible();

  const footerAfter = await footerLabel.boundingBox();
  const mainScrollAfter = await main.evaluate((element) => (element as HTMLElement).scrollTop);
  expect(footerBefore).not.toBeNull();
  expect(footerAfter).not.toBeNull();
  expect(Math.abs((footerAfter?.y ?? 0) - (footerBefore?.y ?? 0))).toBeLessThan(1);
  expect(mainScrollAfter).toBe(mainScrollBefore);
});

test("agenda day navigation supports direct multi-day jumps at responsive widths", async ({
  authSession,
  page,
}, testInfo) => {
  await installOrganizerApi(page, authSession, {
    primaryEndsAt: "2026-09-24T23:00:00.000Z",
  });

  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "tablet", width: 820, height: 1180 },
    { name: "mobile", width: 390, height: 844 },
  ] as const) {
    await page.setViewportSize(viewport);
    await page.goto(agendaUrl(PRIMARY_EVENT_ID));
    await expectAgendaWorkspace(page);

    const dayChooser = page.getByRole("navigation", { name: "Choose an event day" });
    await expect(dayChooser).toBeVisible();
    await expect(dayChooser.getByRole("button")).toHaveCount(7);
    await expect(
      dayChooser.getByRole("button", { name: /Day 1.*Fri, Sep 18.*1 session/u }),
    ).toHaveAttribute("aria-current", "date");

    await dayChooser.getByRole("button", { name: /Day 7.*Thu, Sep 24.*0 sessions/u }).click();
    await expect(
      dayChooser.getByRole("button", { name: /Day 7.*Thu, Sep 24.*0 sessions/u }),
    ).toHaveAttribute("aria-current", "date");
    const dayNavigation = page.getByRole("navigation", { name: "Event day navigation" });
    await expect(
      dayNavigation.getByText("Thursday, September 24 · Day 7 of 7", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("No sessions scheduled on this day.", { exact: true }),
    ).toBeVisible();

    const layout = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      hanOrKanaOrHangul: (
        document.body.innerText.match(
          /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu,
        ) ?? []
      ).length,
    }));
    expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.hanOrKanaOrHangul).toBe(0);

    await page.screenshot({
      path: testInfo.outputPath(`agenda-multi-day-${viewport.name}.png`),
      fullPage: true,
    });
  }
});

test("agenda data remains isolated between organization-qualified events", async ({
  authSession,
  page,
}) => {
  const api = await installOrganizerApi(page, authSession, { includeSecondaryEvent: true });

  await page.goto(agendaUrl(PRIMARY_EVENT_ID));
  await expectAgendaWorkspace(page);
  await expect(page.getByText("Eventloom Conference", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Edit Opening keynote: Systems that earn trust/u }),
  ).toBeVisible();
  await expect(page.getByText("DevFlow Conf 2027", { exact: true })).toHaveCount(0);

  await page.goto(agendaUrl(SECONDARY_EVENT_ID));
  await expectAgendaWorkspace(page);
  await expect(page.getByText("DevFlow Conf 2027", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Edit DevFlow platform patterns/u })).toBeVisible();
  await expect(page.getByText("Eventloom Conference", { exact: true })).toHaveCount(0);

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
