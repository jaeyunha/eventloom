import { describe, expect, it, vi } from "vitest";
import type { ApiBindings } from "../app";
import { createApp } from "../app";
import type { ProgramPublicationManifest } from "../features/events/types";
import {
  invalidatePublishedSpeakerCache,
  type PublishedSpeakerProjection,
  type PublishedSpeakerRouteDependencies,
  publishedSpeakerPhotoPath,
} from "./public-speakers";

const bindings: ApiBindings = {
  APP_ENV: "local",
  WEB_ORIGIN: "http://127.0.0.1:3015",
};

const projection: PublishedSpeakerProjection = {
  event: {
    slug: "open-sessionboard-conf",
    name: "Eventloom Conference",
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
  sourceHash: "speaker-hash-1",
};
const publishedSpeaker = projection.speakers[0]!;

const manifest: ProgramPublicationManifest = {
  id: "program-release-1",
  organizationId: "organization-1",
  eventId: "event-1",
  revision: 101,
  cacheRevision: 1001,
  lifecycle: "served",
  agendaProjectionId: "agenda-publication-1",
  agendaRevisionNumber: 1,
  agendaSourceHash: "agenda-hash-1",
  speakerProjectionId: projection.revision.id,
  speakerRevisionNumber: projection.revision.number,
  speakerSourceHash: "speaker-hash-1",
  approvedContentRevision: 1,
  approvedProfileRevision: 1,
  releasedAssetRevision: 1,
  sourceTrigger: "initial-publication",
  actorId: "organizer-1",
  publishedAt: "2026-08-09T12:00:00.000Z",
  parentServedRevision: null,
  rollbackTargetRevision: null,
  failureReason: null,
};

function manifestWith(
  overrides: Partial<ProgramPublicationManifest> = {},
): ProgramPublicationManifest {
  return { ...manifest, ...overrides };
}

function releaseProjection(
  currentManifest: ProgramPublicationManifest = manifest,
): PublishedSpeakerProjection {
  const { sourceHash: _sourceHash, ...publicProjection } = projection;
  return {
    ...publicProjection,
    revision: {
      id: currentManifest.id,
      number: currentManifest.revision,
      publishedAt: currentManifest.publishedAt,
    },
  };
}

function dependencies(
  overrides: Partial<PublishedSpeakerRouteDependencies> = {},
): PublishedSpeakerRouteDependencies {
  return {
    getProgramPublicationManifest: async () => manifest,
    getPublishedSpeakers: async () => projection,
    ...overrides,
  };
}

function speakerPath(speakerId = publishedSpeaker.id): string {
  return publishedSpeakerPhotoPath(projection.event.slug, speakerId);
}

describe("published speaker projection route", () => {
  it("binds public JSON to the served program release and exact child revision", async () => {
    const getProgramPublicationManifest = vi.fn(async () => manifest);
    const getPublishedSpeakers = vi.fn(
      async (_eventSlug: string, _revisionId?: string, _revisionNumber?: number) => projection,
    );
    const app = createApp({
      publishedSpeakers: dependencies({ getProgramPublicationManifest, getPublishedSpeakers }),
    });

    const response = await app.request(
      "/api/public/events/open-sessionboard-conf/speakers",
      undefined,
      bindings,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=60, stale-while-revalidate=30, must-revalidate",
    );
    expect(response.headers.get("x-sessionboard-program-revision")).toBe("101");
    expect(response.headers.get("x-sessionboard-cache-revision")).toBe("1001");
    await expect(response.json()).resolves.toEqual({ data: releaseProjection() });
    expect(getProgramPublicationManifest).toHaveBeenCalledWith("open-sessionboard-conf");
    expect(getPublishedSpeakers).toHaveBeenCalledWith(
      "open-sessionboard-conf",
      manifest.speakerProjectionId,
      manifest.speakerRevisionNumber,
    );
  });
  it("serves a schema-valid projection carrying Airtable indexed fields", async () => {
    const indexedProjection = {
      ...projection,
      id: "published-speakers:organization-1:event-1",
      organizationId: "organization-1",
      eventId: "event-1",
      eventSlug: projection.event.slug,
      revisionId: projection.revision.id,
      revisionNumber: projection.revision.number,
      publishedAt: projection.revision.publishedAt,
      headshots: [],
    };
    const getPublishedSpeakers = vi.fn(
      async (_eventSlug: string, _revisionId?: string, _revisionNumber?: number) =>
        indexedProjection as unknown as PublishedSpeakerProjection,
    );
    const app = createApp({
      publishedSpeakers: dependencies({ getPublishedSpeakers }),
    });

    const response = await app.request(
      "/api/public/events/open-sessionboard-conf/speakers",
      undefined,
      bindings,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: releaseProjection() });
    expect(getPublishedSpeakers).toHaveBeenCalledWith(
      projection.event.slug,
      manifest.speakerProjectionId,
      manifest.speakerRevisionNumber,
    );
  });

  it.each([
    ["absent", undefined],
    ["missing", null],
    ["pending", manifestWith({ lifecycle: "pending" })],
    ["failed", manifestWith({ lifecycle: "failed", failureReason: "build failed" })],
  ])("fails closed for %s program manifests", async (_name, currentManifest) => {
    const getPublishedSpeakers = vi.fn(async () => projection);
    const app = createApp({
      publishedSpeakers: {
        getPublishedSpeakers,
        ...(currentManifest === undefined
          ? {}
          : { getProgramPublicationManifest: async () => currentManifest }),
      },
    });

    const response = await app.request(
      "/api/public/events/open-sessionboard-conf/speakers",
      undefined,
      bindings,
    );

    expect(response.status).toBe(404);
    expect(getPublishedSpeakers).not.toHaveBeenCalled();
  });
  it("rejects a projection whose child revision is not the manifest binding", async () => {
    const getPublishedSpeakers = vi.fn(async () => projection);
    const app = createApp({
      publishedSpeakers: dependencies({
        getPublishedSpeakers,
        getProgramPublicationManifest: async () =>
          manifestWith({
            speakerProjectionId: "speaker-publication-other",
            speakerRevisionNumber: 2,
          }),
      }),
    });

    const response = await app.request(
      "/api/public/events/open-sessionboard-conf/speakers",
      undefined,
      bindings,
    );

    expect(response.status).toBe(404);
    expect(getPublishedSpeakers).toHaveBeenCalledWith(
      projection.event.slug,
      "speaker-publication-other",
      2,
    );
  });
  it("strips private fields and signed headshot URLs from the public projection", async () => {
    const unsafeProjection = {
      ...projection,
      event: { ...projection.event, privateDraft: "never public" },
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
      publishedSpeakers: dependencies({ getPublishedSpeakers: async () => unsafeProjection }),
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

  it("keeps only the exact stable same-origin headshot URL", async () => {
    const photoUrl = speakerPath();
    const approvedProjection: PublishedSpeakerProjection = {
      ...projection,
      speakers: [{ ...publishedSpeaker, photoUrl }],
    };
    const app = createApp({
      publishedSpeakers: dependencies({ getPublishedSpeakers: async () => approvedProjection }),
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
      publishedSpeakers: dependencies({
        getPublishedSpeakers: async () => ({
          ...projection,
          speakers: [
            {
              ...publishedSpeaker,
              photoUrl: publishedSpeakerPhotoPath("other-event", publishedSpeaker.id),
            },
          ],
        }),
      }),
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

  it("proves headshot membership and approved photo before reading private bytes", async () => {
    const body = new TextEncoder().encode("image").buffer as ArrayBuffer;
    const approvedProjection: PublishedSpeakerProjection = {
      ...projection,
      speakers: [{ ...publishedSpeaker, photoUrl: speakerPath() }],
    };
    const getPublishedSpeakerHeadshot = vi.fn(async () => ({
      body,
      contentType: "image/webp" as const,
      sizeBytes: body.byteLength,
    }));
    const app = createApp({
      publishedSpeakers: dependencies({
        getPublishedSpeakers: async () => approvedProjection,
        getPublishedSpeakerHeadshot,
      }),
    });

    const response = await app.request(speakerPath(), undefined, bindings);
    const unlisted = await app.request(speakerPath("speaker-other"), undefined, bindings);
    const nullPhotoApp = createApp({
      publishedSpeakers: dependencies({
        getPublishedSpeakers: async () => projection,
        getPublishedSpeakerHeadshot,
      }),
    });
    const nullPhoto = await nullPhotoApp.request(speakerPath(), undefined, bindings);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-sessionboard-program-revision")).toBe("101");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new TextEncoder().encode("image"));
    expect(unlisted.status).toBe(404);
    expect(nullPhoto.status).toBe(404);
    expect(getPublishedSpeakerHeadshot).toHaveBeenCalledTimes(1);
    expect(getPublishedSpeakerHeadshot).toHaveBeenCalledWith(
      projection.event.slug,
      publishedSpeaker.id,
      manifest.revision,
      manifest.speakerProjectionId,
      manifest.speakerRevisionNumber,
    );
  });

  it("does not read headshot bytes for a missing or mismatched projection", async () => {
    const getPublishedSpeakerHeadshot = vi.fn(async () => null);
    const getPublishedSpeakers = vi.fn(async () => projection);
    const app = createApp({
      publishedSpeakers: dependencies({
        getPublishedSpeakers,
        getPublishedSpeakerHeadshot,
        getProgramPublicationManifest: async () => manifestWith({ speakerRevisionNumber: 2 }),
      }),
    });

    const response = await app.request(speakerPath(), undefined, bindings);

    expect(response.status).toBe(404);
    expect(getPublishedSpeakerHeadshot).not.toHaveBeenCalled();
  });

  it("automatically isolates a higher program revision at the same public URL", async () => {
    let currentManifest = manifest;
    const getProgramPublicationManifest = vi.fn(async () => currentManifest);
    const getPublishedSpeakers = vi.fn(async () => projection);
    const app = createApp({
      publishedSpeakers: dependencies({ getProgramPublicationManifest, getPublishedSpeakers }),
    });
    const path = "/api/public/events/open-sessionboard-conf/speakers";

    const first = await app.request(path, undefined, bindings);
    currentManifest = manifestWith({
      id: "program-release-2",
      revision: 102,
      cacheRevision: 1002,
      publishedAt: "2026-08-10T12:00:00.000Z",
    });
    const newer = await app.request(path, undefined, bindings);
    const cachedNewer = await app.request(path, undefined, bindings);

    expect(first.status).toBe(200);
    expect(newer.status).toBe(200);
    expect(cachedNewer.status).toBe(200);
    await expect(newer.json()).resolves.toMatchObject({
      data: { revision: { id: "program-release-2", number: 102 } },
    });
    expect(getProgramPublicationManifest).toHaveBeenCalledTimes(3);
    expect(getPublishedSpeakers).toHaveBeenCalledTimes(2);
  });

  it("supports rollback to a lower child revision under a higher release and cache revision", async () => {
    const lowerChildProjection: PublishedSpeakerProjection = {
      ...projection,
      revision: {
        id: "speaker-publication-rollback",
        number: 3,
        publishedAt: "2026-08-11T12:00:00.000Z",
      },
      speakers: [{ ...publishedSpeaker, biography: "Rolled back biography." }],
      sourceHash: "speaker-hash-rollback",
    };
    let currentManifest = manifestWith({
      id: "program-release-4",
      revision: 104,
      cacheRevision: 1004,
      speakerProjectionId: projection.revision.id,
      speakerRevisionNumber: projection.revision.number,
    });
    const getPublishedSpeakers = vi.fn(
      async (_slug: string, revisionId?: string, revisionNumber?: number) =>
        revisionId === lowerChildProjection.revision.id &&
        revisionNumber === lowerChildProjection.revision.number
          ? lowerChildProjection
          : projection,
    );
    const app = createApp({
      publishedSpeakers: dependencies({
        getPublishedSpeakers,
        getProgramPublicationManifest: async () => currentManifest,
      }),
    });
    const path = "/api/public/events/open-sessionboard-conf/speakers";

    expect((await app.request(path, undefined, bindings)).status).toBe(200);
    currentManifest = manifestWith({
      id: "program-release-5",
      revision: 105,
      cacheRevision: 1005,
      publishedAt: "2026-08-12T12:00:00.000Z",
      speakerProjectionId: lowerChildProjection.revision.id,
      speakerRevisionNumber: lowerChildProjection.revision.number,
      speakerSourceHash: lowerChildProjection.sourceHash ?? "",
    });
    const rollback = await app.request(path, undefined, bindings);

    expect(rollback.status).toBe(200);
    await expect(rollback.json()).resolves.toMatchObject({
      data: {
        revision: { id: "program-release-5", number: 105 },
        speakers: [{ biography: "Rolled back biography." }],
      },
    });
    expect(getPublishedSpeakers).toHaveBeenLastCalledWith(
      projection.event.slug,
      lowerChildProjection.revision.id,
      lowerChildProjection.revision.number,
    );
  });

  it("prevents an older deferred cache write from becoming current", async () => {
    let resolveOldPut!: () => void;
    const oldPut = new Promise<void>((resolve) => {
      resolveOldPut = resolve;
    });
    let currentManifest = manifest;
    const match = vi.fn(async () => undefined as Response | undefined);
    const put = vi.fn(async (_request: Request, response: Response) => {
      if (put.mock.calls.length === 1) await oldPut;
      cachedResponse = response.clone();
    });
    const deleteCache = vi.fn(async () => true);
    let cachedResponse: Response | undefined;
    vi.stubGlobal("caches", { default: { match, put, delete: deleteCache } });

    const getPublishedSpeakers = vi.fn(async () => projection);
    const routeDependencies = dependencies({
      getPublishedSpeakers,
      getProgramPublicationManifest: async () => currentManifest,
    });

    try {
      const app = createApp({ publishedSpeakers: routeDependencies });
      const path = "/api/public/events/open-sessionboard-conf/speakers";
      expect((await app.request(path, undefined, bindings)).status).toBe(200);
      await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));

      currentManifest = manifestWith({
        id: "program-release-2",
        revision: 102,
        cacheRevision: 1002,
        publishedAt: "2026-08-10T12:00:00.000Z",
      });
      await invalidatePublishedSpeakerCache(routeDependencies, projection.event.slug, 102, 1002);
      const newer = await app.request(path, undefined, bindings);
      expect(newer.status).toBe(200);
      await expect(newer.json()).resolves.toMatchObject({
        data: { revision: { id: "program-release-2", number: 102 } },
      });
      expect(put).toHaveBeenCalledTimes(1);

      resolveOldPut();
      await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(2));
      if (cachedResponse === undefined) throw new Error("Expected the current cached response.");
      await expect(cachedResponse.clone().json()).resolves.toMatchObject({
        data: { revision: { id: "program-release-2", number: 102 } },
      });
    } finally {
      resolveOldPut();
      vi.unstubAllGlobals();
    }
  });

  it("prefers an unexpired isolate-memory entry before consulting Cache API", async () => {
    const match = vi.fn(async () => undefined as Response | undefined);
    const put = vi.fn(async () => undefined);
    vi.stubGlobal("caches", { default: { match, put } });
    let releaseMatch: ((value: Response | undefined) => void) | undefined;
    const blockedMatch = new Promise<Response | undefined>((resolve) => {
      releaseMatch = resolve;
    });

    try {
      const getPublishedSpeakers = vi.fn(async () => projection);
      const app = createApp({ publishedSpeakers: dependencies({ getPublishedSpeakers }) });
      const path = "/api/public/events/open-sessionboard-conf/speakers";
      expect((await app.request(path, undefined, bindings)).status).toBe(200);

      match.mockImplementation(() => blockedMatch);
      const second = await Promise.race([
        app.request(path, undefined, bindings),
        new Promise<"timed-out">((resolve) => setTimeout(() => resolve("timed-out"), 100)),
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

  it("does not wait for a pending Cache API put before responding", async () => {
    let resolvePut!: () => void;
    const putDeferred = new Promise<void>((resolve) => {
      resolvePut = resolve;
    });
    const match = vi.fn(async () => undefined as Response | undefined);
    const put = vi.fn(() => putDeferred);
    vi.stubGlobal("caches", { default: { match, put } });

    try {
      const app = createApp({ publishedSpeakers: dependencies() });
      const response = await Promise.race([
        app.request("/api/public/events/open-sessionboard-conf/speakers", undefined, bindings),
        new Promise<"timed-out">((resolve) => setTimeout(() => resolve("timed-out"), 100)),
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

  it("does not cache projection errors", async () => {
    const getPublishedSpeakers = vi.fn(async () => {
      throw new Error("speaker read failed");
    });
    const app = createApp({ publishedSpeakers: dependencies({ getPublishedSpeakers }) });

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
});
