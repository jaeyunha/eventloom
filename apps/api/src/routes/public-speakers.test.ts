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
      "public, max-age=0, s-maxage=60, stale-while-revalidate=30, must-revalidate",
    );
    await expect(response.json()).resolves.toEqual({ data: projection });
    expect(getPublishedSpeakers).toHaveBeenCalledWith("open-sessionboard-conf");
  });
  it("strips private fields and signed headshot URLs from the public projection", async () => {
    const unsafeProjection = {
      ...projection,
      event: {
        ...projection.event,
        privateDraft: "never public",
      },
      speakers: [
        {
          ...projection.speakers[0]!,
          photoUrl:
            "https://assets.sessionboard.namuh.co/public/speaker-1.webp?signature=private-token",
          email: "private@example.test",
          headshotAssetId: "asset-private",
        },
      ],
    } as unknown as PublishedSpeakerProjection;
    const app = createApp({
      publishedSpeakers: { getPublishedSpeakers: async () => unsafeProjection },
    });

    const response = await app.request(
      "/api/public/events/open-sessionboard-conf/speakers",
      undefined,
      bindings,
    );
    const body = (await response.json()) as {
      data: {
        event: Record<string, unknown>;
        speakers: readonly Record<string, unknown>[];
      };
    };

    expect(response.status).toBe(200);
    expect(body.data.event).not.toHaveProperty("privateDraft");
    expect(body.data.speakers[0]).toMatchObject({ photoUrl: null });
    expect(body.data.speakers[0]).not.toHaveProperty("email");
    expect(body.data.speakers[0]).not.toHaveProperty("headshotAssetId");
    expect(JSON.stringify(body)).not.toContain("private-token");
  });

  it("keeps only stable HTTPS URLs supplied as approved public headshots", async () => {
    const approvedProjection: PublishedSpeakerProjection = {
      ...projection,
      speakers: [
        {
          ...projection.speakers[0]!,
          photoUrl: "https://assets.sessionboard.namuh.co/public/speaker-1.webp",
        },
      ],
    };
    const app = createApp({
      publishedSpeakers: { getPublishedSpeakers: async () => approvedProjection },
    });

    const response = await app.request(
      "/api/public/events/open-sessionboard-conf/speakers",
      undefined,
      bindings,
    );

    await expect(response.json()).resolves.toMatchObject({
      data: {
        speakers: [
          {
            photoUrl: "https://assets.sessionboard.namuh.co/public/speaker-1.webp",
          },
        ],
      },
    });
  });
  it("caches successful projections without crossing event slugs", async () => {
    const otherProjection: PublishedSpeakerProjection = {
      ...projection,
      event: { ...projection.event, slug: "other-event", name: "Other Event" },
    };
    const getPublishedSpeakers = vi.fn(async (eventSlug: string) => {
      if (eventSlug === projection.event.slug) return projection;
      if (eventSlug === otherProjection.event.slug) return otherProjection;
      return null;
    });
    const app = createApp({ publishedSpeakers: { getPublishedSpeakers } });

    const first = await app.request(
      "/api/public/events/open-sessionboard-conf/speakers",
      undefined,
      bindings,
    );
    const cached = await app.request(
      "/api/public/events/open-sessionboard-conf/speakers",
      undefined,
      bindings,
    );
    const other = await app.request("/api/public/events/other-event/speakers", undefined, bindings);

    expect(first.status).toBe(200);
    expect(cached.status).toBe(200);
    expect(other.status).toBe(200);
    await expect(other.json()).resolves.toMatchObject({
      data: { event: { slug: "other-event", name: "Other Event" } },
    });
    expect(getPublishedSpeakers).toHaveBeenCalledTimes(2);
  });

  it("does not cache speaker projection errors", async () => {
    const getPublishedSpeakers = vi.fn(async () => {
      throw new Error("speaker read failed");
    });
    const app = createApp({ publishedSpeakers: { getPublishedSpeakers } });

    const first = await app.request(
      "/api/public/events/open-sessionboard-conf/speakers",
      undefined,
      bindings,
    );
    const second = await app.request(
      "/api/public/events/open-sessionboard-conf/speakers",
      undefined,
      bindings,
    );

    expect(first.status).toBe(500);
    expect(second.status).toBe(500);
    expect(getPublishedSpeakers).toHaveBeenCalledTimes(2);
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
