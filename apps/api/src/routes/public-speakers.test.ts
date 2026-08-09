import { describe, expect, it, vi } from "vitest";
import type { ApiBindings } from "../app";
import { createApp } from "../app";
import type { PublishedSpeakerProjection } from "./public-speakers";

const bindings: ApiBindings = {
  APP_ENV: "local",
  WEB_ORIGIN: "http://localhost:3015",
};

const projection: PublishedSpeakerProjection = {
  event: {
    slug: "open-sessionboard-conf",
    name: "Open Sessionboard Conference",
    timeZone: "America/Los_Angeles",
    startsOn: "2026-09-18",
    endsOn: "2026-09-19",
    venueName: null,
  },
  revision: {
    id: "speaker-publication-1",
    number: 1,
    publishedAt: "2026-08-09T12:00:00.000Z",
  },
  speakers: [
    {
      id: "speaker-1",
      displayName: "Alex Rivera",
      pronouns: null,
      jobTitle: null,
      organization: null,
      biography: "A published biography.",
      photoUrl: null,
      sessionIds: ["session-1"],
      sessionTitles: ["Opening keynote"],
      trackNames: ["Main stage"],
    },
  ],
};

describe("published speaker projection route", () => {
  it("serves an anonymous immutable projection at the embed contract", async () => {
    const getPublishedSpeakers = vi.fn(async (eventSlug: string) =>
      eventSlug === projection.event.slug ? projection : null,
    );
    const app = createApp({ publishedSpeakers: { getPublishedSpeakers } });

    const response = await app.request(
      "/api/public/events/open-sessionboard-conf/speakers",
      undefined,
      bindings,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=60, stale-while-revalidate=30",
    );
    await expect(response.json()).resolves.toEqual({ data: projection });
    expect(getPublishedSpeakers).toHaveBeenCalledWith("open-sessionboard-conf");
  });

  it("does not expose a projection when the published source has no current revision", async () => {
    const getPublishedSpeakers = vi.fn(async () => null);
    const app = createApp({ publishedSpeakers: { getPublishedSpeakers } });

    const response = await app.request(
      "/api/public/events/open-sessionboard-conf/speakers",
      undefined,
      bindings,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  });
});
