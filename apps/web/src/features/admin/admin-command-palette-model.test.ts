import { describe, expect, it } from "vitest";
import {
  type AdminCommandPage,
  buildAdminCommandResults,
  loadAdminCommandEvents,
  nextCommandSelectionIndex,
  parseAdminCommandEventsResponse,
} from "./admin-command-palette-model";

const pages: readonly AdminCommandPage[] = [
  {
    current: false,
    group: "Workspace",
    href: "/admin",
    icon: "overview",
    keywords: "organization dashboard",
    label: "Home",
  },
  {
    current: true,
    group: "Workspace",
    href: "/admin/events",
    icon: "events",
    keywords: "programs calendar",
    label: "Events",
  },
  {
    current: false,
    group: "Workspace",
    href: "/admin/organizations/ai-engineer/members",
    icon: "members",
    keywords: "team people",
    label: "Members",
  },
];

const eventPayload = {
  data: [
    {
      id: "event-annual-summit",
      name: "Annual Program Summit",
      slug: "annual/summit",
      status: "active",
      startsAt: "2026-09-17T16:00:00.000Z",
      endsAt: "2026-09-18T00:00:00.000Z",
    },
    {
      id: "event-design-week",
      name: "Design Systems Week",
      slug: "design-week",
      status: "draft",
      startsAt: "2026-10-08T16:00:00.000Z",
      endsAt: "2026-10-10T00:00:00.000Z",
    },
  ],
};

describe("admin command palette model", () => {
  it("shows real events and omits the current events page", () => {
    // Given: the organizer is already on the all-events route.
    const events = parseAdminCommandEventsResponse(eventPayload);

    // When: the unfiltered command results are built.
    const results = buildAdminCommandResults({
      currentEventId: null,
      events,
      organizationId: "ai-engineer",
      pages,
      query: "",
    });

    // Then: real event destinations lead, while the redundant current route is absent.
    expect(results.map((result) => result.label)).toEqual([
      "Annual Program Summit",
      "Design Systems Week",
      "Home",
      "Members",
    ]);
    expect(results[0]).toMatchObject({
      group: "Events",
      href: "/admin/organizations/ai-engineer/events/annual%2Fsummit",
      kind: "event",
      status: "active",
    });
    expect(results.some((result) => result.href === "/admin/events")).toBe(false);
  });

  it("filters across event names, statuses, and page keywords", () => {
    // Given: event and page destinations are available.
    const events = parseAdminCommandEventsResponse(eventPayload);

    // When: the organizer searches each supported field.
    const draftResults = buildAdminCommandResults({
      currentEventId: null,
      events,
      organizationId: "ai-engineer",
      pages,
      query: "draft",
    });
    const peopleResults = buildAdminCommandResults({
      currentEventId: null,
      events,
      organizationId: "ai-engineer",
      pages,
      query: "people",
    });

    // Then: the matching event and page are returned independently.
    expect(draftResults.map((result) => result.label)).toEqual(["Design Systems Week"]);
    expect(peopleResults.map((result) => result.label)).toEqual(["Members"]);
  });

  it("rejects incomplete event summaries at the API boundary", () => {
    // Given: the event collection response omits a machine-consumed field.
    const invalidPayload = {
      data: [
        {
          endsAt: "2026-09-18T00:00:00.000Z",
          id: "event-live",
          name: "Live program",
          slug: "live-program",
          status: "active",
        },
      ],
    };

    // When / Then: parsing fails before invalid data reaches the palette.
    expect(() => parseAdminCommandEventsResponse(invalidPayload)).toThrow(
      "startsAt must be a non-empty string",
    );
  });

  it("wraps keyboard selection across the available results", () => {
    // Given: three results and the first result selected.
    const resultCount = 3;

    // When / Then: arrow and boundary commands retain a valid active result.
    expect(nextCommandSelectionIndex(0, resultCount, "previous")).toBe(2);
    expect(nextCommandSelectionIndex(2, resultCount, "next")).toBe(0);
    expect(nextCommandSelectionIndex(1, resultCount, "first")).toBe(0);
    expect(nextCommandSelectionIndex(1, resultCount, "last")).toBe(2);
    expect(nextCommandSelectionIndex(0, 0, "next")).toBe(-1);
  });

  it("loads events through the same-origin organization gateway", async () => {
    // Given: an organization ID and a successful gateway response.
    let requestedUrl = "";
    const fetcher = async (input: RequestInfo | URL): Promise<Response> => {
      requestedUrl = String(input);
      return new Response(JSON.stringify(eventPayload), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    };

    // When: command events are loaded.
    const events = await loadAdminCommandEvents("ai engineer", undefined, fetcher);

    // Then: the encoded same-origin route is used and parsed event data is returned.
    expect(requestedUrl).toBe("/api/admin/organizations/ai%20engineer/events");
    expect(events.map((event) => event.name)).toEqual([
      "Annual Program Summit",
      "Design Systems Week",
    ]);
  });
});
