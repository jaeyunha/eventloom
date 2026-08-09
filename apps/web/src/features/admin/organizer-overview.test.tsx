import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  createOrganizerOverviewApi,
  type OrganizerOverviewData,
  OrganizerOverviewView,
  parseOrganizerOverviewResponse,
  resolveOrganizerOverviewConfig,
} from "./organizer-overview";

const loadedData: OrganizerOverviewData = {
  organizationId: "org-live",
  metrics: {
    eventCount: 1,
    submissionCount: 2,
    pendingReviewCount: 1,
    outstandingSpeakerTaskCount: 0,
    publishedSessionCount: 3,
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
      href: "/admin/organizations/org-live/events/event-live/agenda",
    },
  ],
};

function markup(state: Parameters<typeof OrganizerOverviewView>[0]["state"]): string {
  return renderToStaticMarkup(createElement(OrganizerOverviewView, { state }));
}

describe("organizer overview", () => {
  it("renders live metrics, action items, and organization-qualified agenda links", () => {
    const output = markup({ status: "loaded", data: loadedData });

    expect(output).toContain("Organization overview");
    expect(output).toContain(">1<");
    expect(output).toContain(">2<");
    expect(output).toContain("Publish the remaining session");
    expect(output).toContain("/admin/organizations/org-live/events/event-live/agenda");
    expect(output).not.toContain("Summit 2026");
  });

  it("renders explicit empty states for events and action items", () => {
    const emptyData: OrganizerOverviewData = {
      organizationId: "empty-org",
      metrics: {
        eventCount: 0,
        submissionCount: 0,
        pendingReviewCount: 0,
        outstandingSpeakerTaskCount: 0,
        publishedSessionCount: 0,
      },
      events: [],
      actionItems: [],
    };
    const output = markup({ status: "loaded", data: emptyData });

    expect(output).toContain("No action items are waiting for this organization.");
    expect(output).toContain("No events are available for this organization yet.");
  });

  it("renders loading, error, and configuration states without seeded fallback data", () => {
    expect(markup({ status: "loading" })).toContain("Loading organizer overview");
    expect(markup({ status: "error", message: "The API is unavailable." })).toContain(
      "The API is unavailable.",
    );
    expect(
      markup({
        status: "config-error",
        message: "Set NEXT_PUBLIC_ORGANIZATION_ID for this deployment.",
      }),
    ).toContain("NEXT_PUBLIC_ORGANIZATION_ID");
    expect(markup({ status: "loading" })).not.toContain("128");
  });

  it("uses local-organization only for local configuration", () => {
    expect(
      resolveOrganizerOverviewConfig({
        NEXT_PUBLIC_API_URL: "http://localhost:8787/",
        NEXT_PUBLIC_APP_ENV: "local",
      }),
    ).toEqual({ apiBaseUrl: "http://localhost:8787", organizationId: "local-organization" });
    expect(
      resolveOrganizerOverviewConfig({
        NEXT_PUBLIC_API_URL: "https://api.example.test",
        NEXT_PUBLIC_APP_ENV: "production",
      }),
    ).toMatchObject({ error: expect.stringContaining("NEXT_PUBLIC_ORGANIZATION_ID") });
  });

  it("fetches the credentialed, tenant-qualified overview endpoint", async () => {
    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    const api = createOrganizerOverviewApi(
      "https://api.example.test/",
      "org-live",
      async (url, init) => {
        requestedUrl = String(url);
        requestedInit = init;
        return new Response(JSON.stringify({ data: loadedData }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );

    await expect(api.getOverview()).resolves.toEqual(loadedData);
    expect(requestedUrl).toBe("https://api.example.test/api/admin/organizations/org-live/overview");
    expect(requestedInit?.credentials).toBe("include");
    expect(requestedInit?.cache).toBe("no-store");
  });

  it("rejects malformed API envelopes", () => {
    expect(() => parseOrganizerOverviewResponse({ data: { events: [], actionItems: [] } })).toThrow(
      "organizer overview response",
    );
  });
});
