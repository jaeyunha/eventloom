import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  AdminShell,
  eventNavigationFor,
  qualifiedEventContext,
  sessionHasOrganizerMembership,
} from "./admin-shell";
import {
  createOrganizerEventsApi,
  createOrganizerOverviewApi,
  type OrganizerEventFormValues,
  type OrganizerEventRecord,
  type OrganizerOverviewActivityData,
  type OrganizerOverviewCoreData,
  OrganizerEventsView,
  OrganizerOverviewView,
  parseOrganizerEventsResponse,
  parseOrganizerOverviewActivityResponse,
  parseOrganizerOverviewCoreResponse,
  resolveOrganizerOverviewConfig,
  validateOrganizerEventForm,
} from "./organizer-overview";
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
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

function markup(
  state: Parameters<typeof OrganizerOverviewView>[0]["state"],
): string {
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
    expect(output).toContain("Live organization metrics");
    expect(output).toContain(">1<");
    expect(output).toContain(">2<");
    expect(output).toContain("Tasks that need you");
    expect(output).toContain("1 task");
    expect(output).toContain("Priority queued");
    expect(output).toContain("Publish the remaining session");
    expect(output).toContain("Open agenda");
    expect(output).toContain(
      "/admin/organizations/ai-engineer/events/event-live/agenda",
    );
    expect(output).not.toContain("Summit 2026");
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
    expect(output).toContain(
      "No action items are waiting for this organization.",
    );
    expect(output).toContain("No events yet");
    expect(output).toContain(
      "No events are available for this organization yet.",
    );
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
    expect(loading).toContain("Tasks that need you");
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

  it("uses local-organization only for local configuration", () => {
    expect(
      resolveOrganizerOverviewConfig({
        NEXT_PUBLIC_API_URL: "http://localhost:8787/",
        NEXT_PUBLIC_APP_ENV: "local",
      }),
    ).toEqual({
      apiBaseUrl: "",
      organizationId: "local-organization",
    });
    expect(
      resolveOrganizerOverviewConfig({
        NEXT_PUBLIC_API_URL: "http://localhost:8787/",
        NEXT_PUBLIC_APP_ENV: "local",
        NEXT_PUBLIC_ORGANIZATION_ID: "ai-engineer",
      }),
    ).toEqual({
      apiBaseUrl: "",
      organizationId: "ai-engineer",
    });
    expect(
      resolveOrganizerOverviewConfig({
        NEXT_PUBLIC_APP_ENV: "production",
        NEXT_PUBLIC_ORGANIZATION_ID: "ai-engineer",
      }),
    ).toEqual({
      apiBaseUrl: "",
      organizationId: "ai-engineer",
    });
    expect(
      resolveOrganizerOverviewConfig({
        NEXT_PUBLIC_API_URL: "https://api.example.test",
        NEXT_PUBLIC_APP_ENV: "production",
      }),
    ).toMatchObject({
      error: expect.stringContaining("NEXT_PUBLIC_ORGANIZATION_ID"),
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
        const data = requestedUrl.endsWith("/core")
          ? loadedCore
          : loadedActivity;
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
    ).resolves.toEqual([
      loadedCore,
      loadedCore,
      loadedActivity,
      loadedActivity,
    ]);

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
  it("renders dedicated event management rows with organization-qualified agenda and settings links", () => {
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
    expect(output).toContain(
      "/admin/organizations/ai-engineer/events/event-live/agenda",
    );
    expect(output).toContain(
      "/admin/organizations/ai-engineer/events/event-live/settings",
    );
    expect(output).toContain("America/Los_Angeles");
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
    expect(output).toContain(
      "Showing previous event data. The refresh failed.",
    );
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
      [
        "Submissions",
        "/admin/organizations/org%2Flive/events/event%2Flive/submissions",
      ],
      [
        "Reviews",
        "/admin/organizations/org%2Flive/events/event%2Flive/reviews",
      ],
      [
        "Speakers",
        "/admin/organizations/org%2Flive/events/event%2Flive/speakers",
      ],
      [
        "Deliverables",
        "/admin/organizations/org%2Flive/events/event%2Flive/deliverables",
      ],
      ["Files", "/admin/organizations/org%2Flive/events/event%2Flive/files"],
      ["Agenda", "/admin/organizations/org%2Flive/events/event%2Flive/agenda"],
      [
        "Settings",
        "/admin/organizations/org%2Flive/events/event%2Flive/settings",
      ],
      [
        "Communications",
        "/admin/organizations/org%2Flive/events/event%2Flive/communications",
      ],
      [
        "Reports",
        "/admin/organizations/org%2Flive/events/event%2Flive/reports",
      ],
      [
        "Content remix",
        "/admin/organizations/org%2Flive/events/event%2Flive/remix",
      ],
      ["Embeds", "/admin/organizations/org%2Flive/events/event%2Flive/embeds"],
    ] as const;

    expect(items.map((item) => [item.label, item.href])).toEqual(expected);
    expect(new Set(items.map((item) => item.href)).size).toBe(items.length);
    expect(
      items.some((item) =>
        `${item.label} ${item.href}`
          .toLocaleLowerCase()
          .includes("accelevents"),
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
    const previousOrganizationId = process.env.NEXT_PUBLIC_ORGANIZATION_ID;
    process.env.NEXT_PUBLIC_ORGANIZATION_ID = "ai-engineer";
    try {
      expect(eventNavigationFor(null).map((item) => item.label)).toEqual([
        "Overview",
        "Events",
        "Members",
      ]);
    } finally {
      if (previousOrganizationId === undefined) {
        delete process.env.NEXT_PUBLIC_ORGANIZATION_ID;
      } else {
        process.env.NEXT_PUBLIC_ORGANIZATION_ID = previousOrganizationId;
      }
    }

    expect(
      eventNavigationFor({
        organizationId: "ai-engineer",
        eventId: "event-live",
      }).some(
        (item) => item.href === "/admin/organizations/ai-engineer/members",
      ),
    ).toBe(true);
  });

  it("recognizes only qualified event paths for event-scoped navigation", () => {
    expect(
      qualifiedEventContext(
        "/admin/organizations/org%2Flive/events/event%2Flive/agenda",
      ),
    ).toEqual({ organizationId: "org/live", eventId: "event/live" });
    expect(qualifiedEventContext("/admin/events/event-live/agenda")).toBeNull();
  });
  it("mounts protected page content while organizer access is still being checked", () => {
    const output = renderToStaticMarkup(
      createElement(
        AdminShell,
        null,
        createElement("p", null, "Primary organizer content"),
      ),
    );

    expect(output).toContain("Open Sessionboard");
    expect(output).toContain("Primary organizer content");
    expect(output).toContain('aria-busy="true"');
    expect(output).toContain("Checking organizer access");
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
});
