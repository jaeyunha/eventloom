import { OrganizerEventWorkspaceProvider } from "@/features/admin/organizer-event-workspace";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EventOverviewContent } from "./event-overview-content";
import { EventOverviewWorkspace } from "./event-overview-workspace";
import {
  type EventOverviewData,
  loadEventOverviewData,
  loadEventOverviewName,
} from "./event-overview-data";

const overviewData: EventOverviewData = {
  event: {
    cfpSettings: {
      closesAt: "2028-06-01T03:59:59.000Z",
      enabled: true,
      opensAt: "2028-04-01T13:00:00.000Z",
    },
    endsAt: "2028-09-11T22:00:00.000Z",
    id: "event-canonical-id",
    name: "Distinct Event",
    organizationId: "organization-1",
    startsAt: "2028-09-10T13:00:00.000Z",
    status: "active",
    timeZone: "America/New_York",
    venue: "Pier 42",
  },
  submissions: {
    accepted: 1,
    awaitingDecision: 1,
    status: "ready",
    total: 3,
  },
  agenda: {
    conflicts: 1,
    publishedSessions: 0,
    scheduledSessions: 2,
    status: "ready",
  },
};
describe("EventOverviewWorkspace", () => {
  it("does not render fabricated operational metrics before data loads", () => {
    const markup = renderToStaticMarkup(
      createElement(EventOverviewWorkspace, {
        organizationId: "local-organization",
        eventId: "open-sessionboard-conf",
      }),
    );

    expect(markup).toContain("Loading event overview");
    expect(markup).not.toContain(">42<");
    expect(markup).not.toContain(">8<");
    expect(markup).not.toContain(">12<");
    expect(markup).not.toContain("3 accepted sessions need agenda placement");
  });

  it("loads the authoritative event name for UUID routes", async () => {
    const eventId = "82b23d61-c2f8-4f6b-a89a-9bba98c3555c";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        data: {
          id: eventId,
          organizationId: "organization-1",
          name: "Forward Summit 2028",
          status: "active",
          timeZone: "America/New_York",
          startsAt: "2028-09-10T13:00:00.000Z",
          endsAt: "2028-09-11T22:00:00.000Z",
          venue: "Pier 42",
          cfpSettings: {
            enabled: true,
            opensAt: "2028-04-01T13:00:00.000Z",
            closesAt: "2028-06-01T03:59:59.000Z",
          },
        },
      }),
    );
    try {
      await expect(loadEventOverviewName("organization-1", eventId)).resolves.toBe(
        "Forward Summit 2028",
      );
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/admin/organizations/organization-1/events/${eventId}`,
        expect.objectContaining({ credentials: "include", cache: "no-store" }),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("derives overview metrics from the selected event APIs", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const path = String(input);
      if (path.endsWith("/events/event-1")) {
        return Response.json({
          data: {
            id: "event-1",
            organizationId: "organization-1",
            name: "Forward Summit 2028",
            status: "active",
            timeZone: "America/New_York",
            startsAt: "2028-09-10T13:00:00.000Z",
            endsAt: "2028-09-11T22:00:00.000Z",
            venue: "Pier 42",
            cfpSettings: {
              enabled: true,
              opensAt: "2028-04-01T13:00:00.000Z",
              closesAt: "2028-06-01T03:59:59.000Z",
            },
          },
        });
      }
      if (path.endsWith("/events/event-1/submissions")) {
        return Response.json({
          data: [
            { submission: { status: "submitted" } },
            { submission: { status: "accepted" } },
            { submission: { status: "declined" } },
          ],
        });
      }
      if (path.endsWith("/events/event-1/agenda")) {
        return Response.json({
          data: {
            draft: { entries: [{ id: "entry-1" }, { id: "entry-2" }] },
            currentPublishedRevision: null,
          },
        });
      }
      if (path.endsWith("/events/event-1/agenda/preview")) {
        return Response.json({
          data: {
            conflicts: [{ code: "ROOM_DOUBLE_BOOKED" }],
            releaseConflicts: [],
          },
        });
      }
      return Response.json({ error: { message: "Unexpected path" } }, { status: 500 });
    });

    const result = await loadEventOverviewData("organization-1", "event-1", undefined, fetchMock);

    expect(result.event.name).toBe("Forward Summit 2028");
    expect(result.submissions).toEqual({
      status: "ready",
      total: 3,
      awaitingDecision: 1,
      accepted: 1,
    });
    expect(result.agenda).toEqual({
      status: "ready",
      scheduledSessions: 2,
      conflicts: 1,
      publishedSessions: 0,
    });
  });

  it("marks CFP metrics unavailable when the selected event has no CFP record", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const path = String(input);
      if (path.endsWith("/events/event-1")) {
        return Response.json({
          data: {
            id: "event-1",
            organizationId: "organization-1",
            name: "Forward Summit 2028",
            status: "active",
            timeZone: "America/New_York",
            startsAt: "2028-09-10T13:00:00.000Z",
            endsAt: "2028-09-11T22:00:00.000Z",
            venue: null,
            cfpSettings: { enabled: false, opensAt: null, closesAt: null },
          },
        });
      }
      if (path.endsWith("/events/event-1/submissions")) {
        return Response.json({ error: { message: "The event was not found." } }, { status: 404 });
      }
      if (path.endsWith("/events/event-1/agenda")) {
        return Response.json({
          data: { draft: { entries: [] }, currentPublishedRevision: null },
        });
      }
      if (path.endsWith("/events/event-1/agenda/preview")) {
        return Response.json({ data: { conflicts: [], releaseConflicts: [] } });
      }
      return Response.json({ error: { message: "Unexpected path" } }, { status: 500 });
    });

    const result = await loadEventOverviewData("organization-1", "event-1", undefined, fetchMock);

    expect(result.submissions).toEqual({
      status: "unavailable",
      message: "Submission intake is not configured for this event.",
    });
    expect(result.agenda).toMatchObject({ status: "ready", scheduledSessions: 0, conflicts: 0 });
  });
  it("keeps private overview links on the canonical event ID and scopes the breadcrumb", () => {
    const eventId = "event-canonical-id";
    const eventSlug = "public-event-slug";
    const base = `/admin/organizations/organization-1/events/${eventId}`;
    const markup = renderToStaticMarkup(
      createElement(
        OrganizerEventWorkspaceProvider,
        {
          event: {
            id: eventId,
            name: overviewData.event.name,
            slug: eventSlug,
          },
          organizationId: "organization-1",
        },
        createElement(EventOverviewContent, {
          data: overviewData,
          eventId,
          organizationId: "organization-1",
        }),
      ),
    );

    expect(markup).toContain(`href="${base}/submissions"`);
    expect(markup).toContain(`href="${base}/agenda"`);
    expect(markup).toContain(`href="${base}/cfp"`);
    expect(markup).toContain('href="/admin/organizations/organization-1/events"');
    expect(markup).not.toContain(eventSlug);
    expect(markup).not.toContain('href="/admin/events"');
  });
});
