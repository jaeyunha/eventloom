import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createPublishedEventDirectoryRoutes } from "./public-events";

describe("published event directory routes", () => {
  it("returns only publication-safe fields from the source-backed directory", async () => {
    const routes = createPublishedEventDirectoryRoutes({
      async listPublishedEvents() {
        return [
          {
            organization: { id: "org-1", name: "Namuh Events" },
            event: {
              slug: "first-public-event",
              name: "First Public Event",
              timeZone: "America/Los_Angeles",
              startsOn: "2026-09-18",
              endsOn: "2026-09-19",
              venueName: "Pier 27",
              programPublished: true,
            },
            cfpOpen: true,
          },
          {
            organization: { id: "org-1", name: "Namuh Events" },
            event: {
              slug: "second-public-event",
              name: "Second Public Event",
              timeZone: "America/New_York",
              startsOn: "2026-10-01",
              endsOn: "2026-10-01",
              venueName: null,
              programPublished: false,
            },
            cfpOpen: false,
          },
        ];
      },
    });
    const app = new Hono().route("/api/public/events", routes);

    const response = await app.request("/api/public/events");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=60");
    expect(await response.json()).toEqual({
      data: [
        {
          organization: { id: "org-1", name: "Namuh Events" },
          events: [
            {
              slug: "first-public-event",
              name: "First Public Event",
              timeZone: "America/Los_Angeles",
              startsOn: "2026-09-18",
              endsOn: "2026-09-19",
              venueName: "Pier 27",
              programPublished: true,
              cfpOpen: true,
            },
            {
              slug: "second-public-event",
              name: "Second Public Event",
              timeZone: "America/New_York",
              startsOn: "2026-10-01",
              endsOn: "2026-10-01",
              venueName: null,
              programPublished: false,
              cfpOpen: false,
            },
          ],
        },
      ],
    });
  });

  it("returns an empty collection when nothing has a public projection", async () => {
    const routes = createPublishedEventDirectoryRoutes({
      async listPublishedEvents() {
        return [];
      },
    });

    const response = await routes.request("/");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [] });
  });
});
