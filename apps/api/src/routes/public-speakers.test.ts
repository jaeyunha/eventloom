import { describe, expect, it, vi } from "vitest";
import type { ApiBindings } from "../app";
import { createApp } from "../app";
import { type PublishedSpeakerProjection, publishedSpeakerPhotoPath } from "./public-speakers";

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
const publishedSpeaker = projection.speakers[0];
if (publishedSpeaker === undefined) {
  throw new Error("The published speaker fixture must contain one speaker.");
}

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
          ...publishedSpeaker,
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

  it("keeps only the exact stable same-origin headshot URL for the event and speaker", async () => {
    const photoUrl = publishedSpeakerPhotoPath(projection.event.slug, publishedSpeaker.id);
    const approvedProjection: PublishedSpeakerProjection = {
      ...projection,
      speakers: [{ ...publishedSpeaker, photoUrl }],
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
      data: { speakers: [{ photoUrl }] },
    });
  });
  it("rejects stable-looking headshot URLs for another event or speaker", async () => {
    const app = createApp({
      publishedSpeakers: {
        getPublishedSpeakers: async () => ({
          ...projection,
          speakers: [
            {
              ...publishedSpeaker,
              photoUrl: publishedSpeakerPhotoPath("other-event", publishedSpeaker.id),
            },
          ],
        }),
      },
    });

    const response = await app.request(
      "/api/public/events/open-sessionboard-conf/speakers",
      undefined,
      bindings,
    );

    await expect(response.json()).resolves.toMatchObject({
      data: { speakers: [{ photoUrl: null }] },
    });
  });
  it("serves only headshot bytes resolved from the immutable publication dependency", async () => {
    const body = new TextEncoder().encode("image").buffer;
    const getPublishedSpeakerHeadshot = vi.fn(async (eventSlug: string, speakerId: string) =>
      eventSlug === projection.event.slug && speakerId === publishedSpeaker.id
        ? {
            body,
            contentType: "image/webp" as const,
            sizeBytes: body.byteLength,
          }
        : null,
    );
    const app = createApp({
      publishedSpeakers: {
        getPublishedSpeakers: async () => projection,
        getPublishedSpeakerHeadshot,
      },
    });

    const response = await app.request(
      `${publishedSpeakerPhotoPath(projection.event.slug, publishedSpeaker.id)}`,
      undefined,
      bindings,
    );
    const missing = await app.request(
      `${publishedSpeakerPhotoPath(projection.event.slug, "speaker-other")}`,
      undefined,
      bindings,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new TextEncoder().encode("image"));
    expect(missing.status).toBe(404);
    expect(getPublishedSpeakerHeadshot).toHaveBeenCalledWith(
      projection.event.slug,
      publishedSpeaker.id,
    );
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
  it("prefers an unexpired isolate-memory speaker entry before consulting Cache API", async () => {
    const match = vi.fn(async () => undefined as Response | undefined);
    const put = vi.fn(async () => undefined);
    const deleteCache = vi.fn(async () => true);
    vi.stubGlobal("caches", { default: { match, put, delete: deleteCache } });
    let releaseMatch: ((value: Response | undefined) => void) | undefined;
    const blockedMatch = new Promise<Response | undefined>((resolve) => {
      releaseMatch = resolve;
    });

    try {
      const getPublishedSpeakers = vi.fn(async () => projection);
      const app = createApp({ publishedSpeakers: { getPublishedSpeakers } });
      const path = "/api/public/events/open-sessionboard-conf/speakers";

      const first = await app.request(path, undefined, bindings);
      expect(first.status).toBe(200);

      match.mockImplementation(() => blockedMatch);
      const second = await Promise.race([
        app.request(path, undefined, bindings),
        new Promise<"timed-out">((resolve) => {
          setTimeout(() => resolve("timed-out"), 100);
        }),
      ]);

      expect(second).not.toBe("timed-out");
      if (second !== "timed-out") expect(second.status).toBe(200);
      expect(match).toHaveBeenCalledTimes(1);
      expect(getPublishedSpeakers).toHaveBeenCalledTimes(1);
    } finally {
      releaseMatch?.(undefined);
      vi.unstubAllGlobals();
    }
  });

  it("does not wait for a pending speaker Cache API put before responding", async () => {
    let resolvePut!: () => void;
    const putDeferred = new Promise<void>((resolve) => {
      resolvePut = resolve;
    });
    const match = vi.fn(async () => undefined as Response | undefined);
    const put = vi.fn(() => putDeferred);
    const deleteCache = vi.fn(async () => true);
    vi.stubGlobal("caches", { default: { match, put, delete: deleteCache } });

    try {
      const app = createApp({
        publishedSpeakers: { getPublishedSpeakers: async () => projection },
      });
      const response = await Promise.race([
        app.request("/api/public/events/open-sessionboard-conf/speakers", undefined, bindings),
        new Promise<"timed-out">((resolve) => {
          setTimeout(() => resolve("timed-out"), 100);
        }),
      ]);

      expect(response).not.toBe("timed-out");
      if (response !== "timed-out") expect(response.status).toBe(200);
      await Promise.resolve();
      expect(put).toHaveBeenCalledTimes(1);
    } finally {
      resolvePut();
      vi.unstubAllGlobals();
    }
  });
  it("keeps a newer speaker revision after an older deferred put settles", async () => {
    let now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    let cachedResponse: Response | undefined;
    let putCount = 0;
    let resolveOldPut!: () => void;
    const oldPut = new Promise<void>((resolve) => {
      resolveOldPut = resolve;
    });
    const match = vi.fn(async () => undefined as Response | undefined);
    const put = vi.fn(async (_request: Request, response: Response) => {
      putCount += 1;
      if (putCount === 1) await oldPut;
      cachedResponse = response.clone();
    });
    const deleteCache = vi.fn(async () => true);
    vi.stubGlobal("caches", { default: { match, put, delete: deleteCache } });

    const newerProjection: PublishedSpeakerProjection = {
      ...projection,
      revision: {
        id: "speaker-publication-2",
        number: 2,
        publishedAt: "2026-08-10T12:00:00.000Z",
      },
    };
    let currentProjection = projection;
    const dependencies = {
      getPublishedSpeakers: vi.fn(async () => currentProjection),
    };

    try {
      const app = createApp({ publishedSpeakers: dependencies });
      const path = "/api/public/events/open-sessionboard-conf/speakers";

      expect((await app.request(path, undefined, bindings)).status).toBe(200);
      await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));

      now += 60_001;
      currentProjection = newerProjection;
      const newerResponse = await app.request(path, undefined, bindings);
      expect(newerResponse.status).toBe(200);
      await expect(newerResponse.json()).resolves.toMatchObject({
        data: { revision: { number: 2 } },
      });
      expect(put).toHaveBeenCalledTimes(1);

      resolveOldPut();
      await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(2));
      if (cachedResponse === undefined) throw new Error("Expected the newer cached response.");
      await expect(cachedResponse.clone().json()).resolves.toMatchObject({
        data: { revision: { number: 2 } },
      });
    } finally {
      resolveOldPut();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
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
