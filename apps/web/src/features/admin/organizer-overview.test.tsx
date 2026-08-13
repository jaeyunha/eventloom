import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  AdminShell,
  eventNavigationFor,
  organizerOrganizationIdFromSession,
  organizerOrganizationIdsFromSession,
  qualifiedEventContext,
  sessionHasOrganizerMembership,
} from "./admin-shell";
import {
  calendarMonthCells,
  createOrganizerEventsApi,
  createOrganizerOverviewApi,
  eventIntersectsCalendarDate,
  eventStatusClass,
  getCalendarMonthCells,
  initialCalendarMonth,
  type OrganizerEventFormValues,
  type OrganizerEventRecord,
  OrganizerEventsView,
  type OrganizerOverviewActivityData,
  type OrganizerOverviewCoreData,
  OrganizerOverviewView,
  parseOrganizerEventsResponse,
  parseOrganizerOverviewActivityResponse,
  parseOrganizerOverviewCoreResponse,
  resolveOrganizerOverviewConfig,
  validateOrganizerEventForm,
} from "./organizer-overview";

const mockedPathname = vi.hoisted(() => ({ value: "/admin" }));

vi.mock("next/navigation", () => ({
  usePathname: () => mockedPathname.value,
}));

const loadedCore: OrganizerOverviewCoreData = {
  organizationId: "ai-engineer",
  metrics: {
    eventCount: 1,
  },
  events: [
    {
      id: "event-live",
      name: "Live program",
      slug: "live-program",
      status: "published",
      startsAt: "2026-09-17T00:00:00.000Z",
      endsAt: "2026-09-18T00:00:00.000Z",
    },
  ],
};

const loadedActivity: OrganizerOverviewActivityData = {
  organizationId: "ai-engineer",
  metrics: {
    submissionCount: 2,
    pendingReviewCount: 1,
    outstandingSpeakerTaskCount: 0,
    publishedSessionCount: 3,
  },
  actionItems: [
    {
      id: "agenda:event-live",
      type: "agenda",
      eventId: "event-live",
      title: "Publish the remaining session",
      description: "One session is not in the current published agenda.",
      count: 1,
      priority: 50,
      dueAt: null,
      href: "/admin/organizations/ai-engineer/events/event-live/agenda",
    },
  ],
};
const eventRecord: OrganizerEventRecord = {
  id: "event-live",
  organizationId: "ai-engineer",
  slug: "live-program",
  name: "Live program",
  status: "active",
  timeZone: "America/Los_Angeles",
  startsAt: "2026-09-17T16:00:00.000Z",
  endsAt: "2026-09-18T00:00:00.000Z",
  venue: "Main hall",
  cfpSettings: {
    enabled: true,
    opensAt: "2026-06-01T00:00:00.000Z",
    closesAt: "2026-07-01T00:00:00.000Z",
  },
  defaultCalendarSettings: {
    durationMinutes: 30,
    timeZone: "America/Los_Angeles",
    location: "Main hall",
  },
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  createdBy: "organizer-1",
  updatedBy: "organizer-1",
};

function markup(state: Parameters<typeof OrganizerOverviewView>[0]["state"]): string {
  return renderToStaticMarkup(
    createElement(OrganizerOverviewView, {
      state,
      onRetryCore: () => undefined,
      onRetryActivity: () => undefined,
    }),
  );
}

describe("organizer overview", () => {
  it("renders the dashboard hierarchy, live metrics, prioritized actions, and event destinations", () => {
    const output = markup({
      status: "loaded",
      core: { status: "loaded", data: loadedCore },
      activity: { status: "loaded", data: loadedActivity },
    });

    expect(output).toContain("Organization overview");
    expect(output).toContain("Metrics");
    expect(output).toContain(">1</");
    expect(output).toContain(">2</");
    expect(output).toContain("Needs attention");
    expect(output.indexOf("Metrics")).toBeLessThan(output.indexOf("Needs attention"));
    expect(output.indexOf("Metrics")).toBeLessThan(output.indexOf(">Events</"));
    expect(output).toContain("1 task");
    expect(output).toContain("Priority queued");
    expect(output).toContain("Publish the remaining session");
    expect(output).toContain(">Open");
    expect(output).toContain("/admin/organizations/ai-engineer/events/event-live/agenda");
    expect(output).toContain("/admin/organizations/ai-engineer/events/event-live/settings");
    expect(output).not.toContain("Keep your program moving");
    expect(output).not.toContain("Summit 2026");
  });

  it("presents active events with the same live status treatment as published events", () => {
    expect(eventStatusClass("active")).toBe(eventStatusClass("published"));
    expect(eventStatusClass("active")).not.toBe(eventStatusClass("archived"));
  });

  it("renders explicit empty states for events and action items", () => {
    const emptyCore: OrganizerOverviewCoreData = {
      organizationId: "empty-org",
      metrics: { eventCount: 0 },
      events: [],
    };
    const emptyActivity: OrganizerOverviewActivityData = {
      organizationId: "empty-org",
      metrics: {
        submissionCount: 0,
        pendingReviewCount: 0,
        outstandingSpeakerTaskCount: 0,
        publishedSessionCount: 0,
      },
      actionItems: [],
    };
    const output = markup({
      status: "loaded",
      core: { status: "loaded", data: emptyCore },
      activity: { status: "loaded", data: emptyActivity },
    });

    expect(output).toContain("all caught up");
    expect(output).toContain("No action items are waiting for this organization.");
    expect(output).toContain("No events yet");
    expect(output).toContain("No events are available for this organization yet.");
    expect(output).toContain("Manage events");
  });

  it("renders the accessible dashboard skeleton and understandable failure states", () => {
    const loading = markup({
      status: "loading",
      core: { status: "loading", data: null },
      activity: { status: "loading", data: null },
    });
    expect(loading).toContain("Organization overview");
    expect(loading).toContain("Loading organizer overview");
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('aria-label="Loading organization metrics"');
    expect(loading).toContain("Needs attention");
    expect(loading).toContain("Events");
    expect(loading).not.toContain("128");

    expect(
      markup({
        status: "error",
        message: "The API is unavailable.",
        core: {
          status: "error",
          data: null,
          message: "The API is unavailable.",
        },
        activity: { status: "loading", data: null },
      }),
    ).toContain("The API is unavailable.");
    expect(
      markup({
        status: "config-error",
        message: "Set NEXT_PUBLIC_ORGANIZATION_ID for this deployment.",
      }),
    ).toContain("NEXT_PUBLIC_ORGANIZATION_ID");
  });

  it("renders core content while activity is deferred or fails locally", () => {
    const deferred = markup({
      status: "loaded",
      core: { status: "loaded", data: loadedCore },
      activity: { status: "loading", data: null },
    });
    expect(deferred).toContain("Live program");
    expect(deferred).toContain("Loading action items…");

    const failed = markup({
      status: "loaded",
      core: { status: "loaded", data: loadedCore },
      activity: {
        status: "error",
        data: null,
        message: "Activity is unavailable.",
      },
    });
    expect(failed).toContain("Live program");
    expect(failed).toContain("Action items unavailable");
    expect(failed).toContain("Activity is unavailable.");
    expect(failed).toContain("Retry activity");
    expect(failed).not.toContain("Unable to load organizer overview");
  });

  it("retains same-organization snapshots across scoped refresh failures", () => {
    const output = markup({
      status: "loaded",
      core: {
        status: "error",
        data: loadedCore,
        message: "Core refresh failed.",
      },
      activity: {
        status: "error",
        data: loadedActivity,
        message: "Activity refresh failed.",
      },
    });
    expect(output).toContain("Live program");
    expect(output).toContain("Publish the remaining session");
    expect(output).toContain("Showing previous event data.");
    expect(output).toContain("Stale action items.");
    expect(output).toContain("Retry core");
    expect(output).toContain("Retry activity");
  });

  it("requires an authenticated organization instead of an environment tenant default", () => {
    expect(resolveOrganizerOverviewConfig("org-owner")).toEqual({
      apiBaseUrl: "",
      organizationId: "org-owner",
    });
    expect(resolveOrganizerOverviewConfig(undefined)).toMatchObject({
      error: expect.stringContaining("authenticated organizer membership"),
    });
  });

  it("fetches the exact credentialed core and activity endpoints", async () => {
    const requestedUrls: string[] = [];
    let requestedInit: RequestInit | undefined;
    const api = createOrganizerOverviewApi(
      "https://api.example.test/",
      "ai-engineer",
      async (url, init) => {
        const requestedUrl = String(url);
        requestedUrls.push(requestedUrl);
        requestedInit = init;
        const data = requestedUrl.endsWith("/core") ? loadedCore : loadedActivity;
        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );

    await expect(api.getCore()).resolves.toEqual(loadedCore);
    await expect(api.getActivity()).resolves.toEqual(loadedActivity);
    expect(requestedUrls).toEqual([
      "https://api.example.test/api/admin/organizations/ai-engineer/overview/core",
      "https://api.example.test/api/admin/organizations/ai-engineer/overview/activity",
    ]);
    expect(requestedInit?.credentials).toBe("include");
    expect(requestedInit?.cache).toBe("no-store");
  });

  it("deduplicates each endpoint independently without caching settled snapshots", async () => {
    let coreRequestCount = 0;
    let activityRequestCount = 0;
    let releaseCore: (() => void) | undefined;
    let releaseActivity: (() => void) | undefined;
    const coreGate = new Promise<void>((resolve) => {
      releaseCore = resolve;
    });
    const activityGate = new Promise<void>((resolve) => {
      releaseActivity = resolve;
    });
    const api = createOrganizerOverviewApi(
      "https://api.example.test",
      "ai-engineer",
      async (url) => {
        if (String(url).endsWith("/core")) {
          coreRequestCount += 1;
          await coreGate;
          return new Response(JSON.stringify({ data: loadedCore }), {
            status: 200,
          });
        }
        activityRequestCount += 1;
        await activityGate;
        return new Response(JSON.stringify({ data: loadedActivity }), {
          status: 200,
        });
      },
    );

    const firstCore = api.getCore();
    const secondCore = api.getCore();
    const firstActivity = api.getActivity();
    const secondActivity = api.getActivity();
    expect(firstCore).toBe(secondCore);
    expect(firstActivity).toBe(secondActivity);
    expect(coreRequestCount).toBe(1);
    expect(activityRequestCount).toBe(1);

    releaseCore?.();
    releaseActivity?.();
    await expect(
      Promise.all([firstCore, secondCore, firstActivity, secondActivity]),
    ).resolves.toEqual([loadedCore, loadedCore, loadedActivity, loadedActivity]);

    await expect(api.getCore()).resolves.toEqual(loadedCore);
    await expect(api.getActivity()).resolves.toEqual(loadedActivity);
    expect(coreRequestCount).toBe(2);
    expect(activityRequestCount).toBe(2);
  });

  it("rejects malformed, incomplete, and cross-tenant split envelopes", () => {
    expect(() =>
      parseOrganizerOverviewCoreResponse({
        data: { organizationId: "ai-engineer", events: [] },
      }),
    ).toThrow("organizer overview core response");
    expect(() =>
      parseOrganizerOverviewActivityResponse({
        data: { organizationId: "ai-engineer", metrics: {}, actionItems: [] },
      }),
    ).toThrow("invalid metrics.submissionCount");
    expect(() =>
      parseOrganizerOverviewCoreResponse(
        { data: { ...loadedCore, organizationId: "other-organization" } },
        "ai-engineer",
      ),
    ).toThrow("another organization");
  });
  it("generates a bounded 42-cell month grid across month boundaries", () => {
    const cells = getCalendarMonthCells(new Date(2026, 1, 1));
    expect(cells).toHaveLength(42);
    expect(cells[0]?.dateKey).toBe("2026-02-01");
    expect(cells[41]?.dateKey).toBe("2026-03-14");
    expect(calendarMonthCells(new Date(2026, 1, 1))).toHaveLength(42);
  });

  it("places multi-day events by checking each visible date and ignores invalid spans", () => {
    const event = {
      startsAt: "2026-02-28",
      endsAt: "2026-03-02",
    };
    expect(eventIntersectsCalendarDate(event, new Date(2026, 1, 28))).toBe(true);
    expect(eventIntersectsCalendarDate(event, new Date(2026, 2, 1))).toBe(true);
    expect(eventIntersectsCalendarDate(event, new Date(2026, 2, 2))).toBe(true);
    expect(eventIntersectsCalendarDate(event, new Date(2026, 2, 3))).toBe(false);
    expect(
      eventIntersectsCalendarDate(
        { startsAt: "not-a-date", endsAt: "2026-03-02T01:00:00.000Z" },
        new Date(2026, 2, 1),
      ),
    ).toBe(false);
  });

  it("initializes from the earliest non-archived valid event start", () => {
    const month = initialCalendarMonth([
      { status: "archived", startsAt: "2020-01-01T00:00:00.000Z" },
      { status: "active", startsAt: "not-a-date" },
      { status: "draft", startsAt: "2026-04-08T00:00:00.000Z" },
      { status: "active", startsAt: "2026-03-08T00:00:00.000Z" },
    ]);
    expect([month.getFullYear(), month.getMonth(), month.getDate()]).toEqual([2026, 2, 1]);
  });
  it("renders Calendar by default and keeps List actions behind the view switch", () => {
    const output = renderToStaticMarkup(
      createElement(OrganizerEventsView, {
        state: {
          status: "loaded",
          data: {
            organizationId: eventRecord.organizationId,
            events: [eventRecord],
          },
        },
        onCreate: async () => undefined,
        onUpdate: async () => undefined,
        onArchive: async () => undefined,
      }),
    );

    expect(output).toContain("Event management");
    expect(output).toContain("Create event");
    expect(output).toContain('aria-selected="true"');
    expect(output).toContain("September 2026");
    expect(output).toContain("Sun");
    expect(output).toContain("Mon");
    expect(output).toContain("/admin/organizations/ai-engineer/events/event-live/settings");
    expect(output).toContain("America/Los_Angeles");
    expect(output).toContain("<table");
    expect(output).toContain("September 2026 events");
    expect(output).not.toContain("Organization events and their current status");
    expect(output).not.toContain(">Agenda<");
  });
  it("retains event records after refresh failure and disables stale mutations", () => {
    const output = renderToStaticMarkup(
      createElement(OrganizerEventsView, {
        state: {
          status: "error",
          message: "The refresh failed.",
          data: {
            organizationId: eventRecord.organizationId,
            events: [eventRecord],
          },
        },
        onRetry: () => undefined,
        onCreate: async () => undefined,
        onUpdate: async () => undefined,
        onArchive: async () => undefined,
      }),
    );

    expect(output).toContain("Live program");
    expect(output).toContain("Showing previous event data. The refresh failed.");
    expect(output).toContain("Retry event refresh");
    expect(output).not.toContain(">Create event<");
    expect(output).not.toContain(">Edit<");
    expect(output).not.toContain(">Archive<");
  });

  it("sends canonical event create fields and parses the event envelope", async () => {
    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    const api = createOrganizerEventsApi(
      "https://api.example.test/",
      "ai-engineer",
      async (url, init) => {
        requestedUrl = String(url);
        requestedInit = init;
        return new Response(JSON.stringify({ data: eventRecord }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      },
    );

    await expect(
      api.createEvent({
        name: "Live program",
        slug: "live-program",
        status: "draft",
        timeZone: "America/Los_Angeles",
        startsAt: eventRecord.startsAt,
        endsAt: eventRecord.endsAt,
        venue: "Main hall",
        cfpSettings: eventRecord.cfpSettings,
        defaultCalendarSettings: eventRecord.defaultCalendarSettings,
      }),
    ).resolves.toEqual(eventRecord);
    expect(requestedUrl).toBe(
      "https://api.example.test/api/admin/organizations/ai-engineer/events",
    );
    expect(requestedInit?.credentials).toBe("include");
    expect(JSON.parse(String(requestedInit?.body))).toEqual({
      name: "Live program",
      slug: "live-program",
      status: "draft",
      timeZone: "America/Los_Angeles",
      startsAt: eventRecord.startsAt,
      endsAt: eventRecord.endsAt,
      venue: "Main hall",
      cfpSettings: eventRecord.cfpSettings,
      defaultCalendarSettings: eventRecord.defaultCalendarSettings,
    });
  });
  it("uses the same-origin gateway when no browser API origin is configured", async () => {
    let requestedUrl = "";
    const api = createOrganizerEventsApi("", "ai-engineer", async (url) => {
      requestedUrl = String(url);
      return new Response(JSON.stringify({ data: [eventRecord] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await expect(api.listEvents()).resolves.toEqual([eventRecord]);
    expect(requestedUrl).toBe("/api/admin/organizations/ai-engineer/events");
  });

  it("rejects legacy calendar timezone aliases and validates complete event form input", () => {
    expect(() =>
      parseOrganizerEventsResponse({
        data: [
          {
            ...eventRecord,
            defaultCalendarSettings: {
              ...eventRecord.defaultCalendarSettings,
              timezone: "UTC",
            },
          },
        ],
      }),
    ).toThrow("defaultCalendarSettings.timeZone");

    const values: OrganizerEventFormValues = {
      name: "New program",
      slug: "new-program",
      status: "draft",
      timeZone: "America/Los_Angeles",
      startsAt: "2026-09-17T09:00",
      endsAt: "2026-09-17T17:00",
      venue: "Main hall",
      cfpEnabled: true,
      cfpOpensAt: "",
      cfpClosesAt: "",
      defaultCalendarDurationMinutes: "45",
      defaultCalendarTimeZone: "America/Los_Angeles",
      defaultCalendarLocation: "Main hall",
    };
    const result = validateOrganizerEventForm(values);
    expect(result.error).toBeUndefined();
    expect(result.input).toMatchObject({
      timeZone: "America/Los_Angeles",
      cfpSettings: { enabled: true, opensAt: null, closesAt: null },
      defaultCalendarSettings: {
        durationMinutes: 45,
        timeZone: "America/Los_Angeles",
        location: "Main hall",
      },
    });
  });
});
describe("admin navigation", () => {
  it("exposes every qualified event workflow area in order with working route shapes", () => {
    const eventContext = { organizationId: "org/live", eventId: "event/live" };
    const items = eventNavigationFor(eventContext);
    const expected = [
      ["Overview", "/admin"],
      ["Events", "/admin/events"],
      ["Members", "/admin/organizations/org%2Flive/members"],
      ["CFP Form", "/admin/organizations/org%2Flive/events/event%2Flive/cfp"],
      ["Submissions", "/admin/organizations/org%2Flive/events/event%2Flive/submissions"],
      ["Reviews", "/admin/organizations/org%2Flive/events/event%2Flive/reviews"],
      ["Speakers", "/admin/organizations/org%2Flive/events/event%2Flive/speakers"],
      ["Deliverables", "/admin/organizations/org%2Flive/events/event%2Flive/deliverables"],
      ["Files", "/admin/organizations/org%2Flive/events/event%2Flive/files"],
      ["Agenda", "/admin/organizations/org%2Flive/events/event%2Flive/agenda"],
      ["Settings", "/admin/organizations/org%2Flive/events/event%2Flive/settings"],
      ["Communications", "/admin/organizations/org%2Flive/events/event%2Flive/communications"],
      ["Reports", "/admin/organizations/org%2Flive/events/event%2Flive/reports"],
      ["Content remix", "/admin/organizations/org%2Flive/events/event%2Flive/remix"],
      ["Embeds", "/admin/organizations/org%2Flive/events/event%2Flive/embeds"],
      ["Integrations", "/admin/organizations/org%2Flive/events/event%2Flive/integrations"],
    ] as const;

    expect(items.map((item) => [item.label, item.href])).toEqual(expected);
    expect(new Set(items.map((item) => item.href)).size).toBe(items.length);
    expect(
      items.some((item) =>
        `${item.label} ${item.href}`.toLocaleLowerCase().includes("accelevents"),
      ),
    ).toBe(false);

    for (const [label, href] of expected) {
      const item = items.find((candidate) => candidate.label === label);
      expect(item?.match(href)).toBe(true);
    }
    const agenda = items.find((item) => item.label === "Agenda");
    expect(agenda?.match(`${expected[9][1]}/sessions`)).toBe(true);
    expect(agenda?.match(`${expected[9][1]}-draft`)).toBe(false);
  });

  it("keeps organization Members available outside and inside an event", () => {
    expect(eventNavigationFor(null, "ai-engineer").map((item) => item.label)).toEqual([
      "Overview",
      "Events",
      "Members",
    ]);

    expect(
      eventNavigationFor({
        organizationId: "ai-engineer",
        eventId: "event-live",
      }).some((item) => item.href === "/admin/organizations/ai-engineer/members"),
    ).toBe(true);
  });

  it("recognizes only qualified event paths for event-scoped navigation", () => {
    expect(
      qualifiedEventContext("/admin/organizations/org%2Flive/events/event%2Flive/agenda"),
    ).toEqual({ organizationId: "org/live", eventId: "event/live" });
    expect(qualifiedEventContext("/admin/events/event-live/agenda")).toBeNull();
  });
  it("does not mount protected page content while organizer access is still being checked", () => {
    mockedPathname.value = "/admin";
    const output = renderToStaticMarkup(
      createElement(AdminShell, null, createElement("p", null, "Primary organizer content")),
    );

    expect(output).toContain("Open Sessionboard");
    expect(output).toContain("Workspace");
    expect(output).not.toContain("Program operations");
    expect(output).not.toContain("Publish &amp; measure");
    expect(output).toContain("Search or jump to");
    expect(output).toContain('aria-keyshortcuts="Meta+K Control+K"');
    expect(output).not.toContain("Primary organizer content");
    expect(output).toContain('aria-busy="true"');
    expect(output).toContain("Checking organizer access");
  });
  it("groups event-scoped navigation by organizer workflow", () => {
    mockedPathname.value = "/admin/organizations/ai-engineer/events/event-live/agenda";
    try {
      const output = renderToStaticMarkup(
        createElement(AdminShell, null, createElement("p", null, "Event workspace content")),
      );

      expect(output).toContain("Workspace");
      expect(output).toContain("Program operations");
      expect(output).toContain("People &amp; content");
      expect(output).toContain("Publish &amp; measure");
      expect(output).toContain("Integrations");
      expect(output).toContain("/admin/organizations/ai-engineer/events/event-live/agenda");
      expect(output).toContain("/admin/organizations/ai-engineer/events/event-live/integrations");
      expect(output).not.toContain("Event workspace content");
      expect(output).toContain("Checking organizer access");
    } finally {
      mockedPathname.value = "/admin";
    }
  });
  it("accepts only owner or admin membership for the selected organization", () => {
    const session = {
      user: { id: "user-1" },
      memberships: [
        { organizationId: "org-owner", role: "owner" },
        { organizationId: "org-reviewer", role: "reviewer" },
      ],
      speakerGrants: [{ organizationId: "org-speaker" }],
    };

    expect(sessionHasOrganizerMembership(session, "org-owner")).toBe(true);
    expect(sessionHasOrganizerMembership(session, "org-reviewer")).toBe(false);
    expect(sessionHasOrganizerMembership(session, "org-speaker")).toBe(false);
    expect(sessionHasOrganizerMembership(session, "other-org")).toBe(false);
    expect(sessionHasOrganizerMembership(session, null)).toBe(true);
  });

  it("keeps API documentation behind the organizer shell rather than public role surfaces", () => {
    const docsPath = "/admin/organizations/ai-engineer/events/event-live/integrations/api-docs";

    expect(qualifiedEventContext(docsPath)).toEqual({
      organizationId: "ai-engineer",
      eventId: "event-live",
    });
    expect(
      eventNavigationFor(qualifiedEventContext(docsPath))
        .find((item) => item.label === "Integrations")
        ?.match(docsPath),
    ).toBe(true);
    expect(docsPath).not.toContain("/review");
    expect(docsPath).not.toContain("/portal");
  });
  it("selects the organization from owner or admin session memberships", () => {
    const session = {
      user: { id: "user-1" },
      memberships: [
        { organizationId: "org-reviewer", role: "reviewer" },
        { organizationId: "org-owner", role: "owner" },
        { organizationId: "org-admin", role: "admin" },
      ],
    };

    expect(organizerOrganizationIdFromSession(session, null)).toBe("org-admin");
    expect(organizerOrganizationIdsFromSession(session)).toEqual(["org-admin", "org-owner"]);
    expect(organizerOrganizationIdFromSession(session, null, "org-admin")).toBe("org-admin");
    expect(organizerOrganizationIdFromSession(session, "org-admin")).toBe("org-admin");
    expect(organizerOrganizationIdFromSession(session, "org-reviewer")).toBeNull();
    expect(organizerOrganizationIdFromSession(session, "other-org")).toBeNull();
  });
});
