import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPublishedAgenda,
  getPublishedProgram,
  getPublishedSpeakers,
  PublicEmbedApiError,
} from "./api";
import type { PublishedAgenda, PublishedSpeakerGallery } from "./types";

const publishedAgenda: PublishedAgenda = {
  event: {
    slug: "open-systems",
    name: "Open Systems Summit",
    timeZone: "UTC",
    startsOn: "2026-09-18",
    endsOn: "2026-09-19",
    venueName: null,
  },
  revision: {
    id: "revision_3",
    number: 3,
    publishedAt: "2026-08-08T12:00:00.000Z",
  },
  entries: [],
};

const publishedSpeakers: PublishedSpeakerGallery = {
  event: publishedAgenda.event,
  revision: {
    id: "speaker_projection_8",
    number: 8,
    publishedAt: "2026-08-08T12:05:00.000Z",
  },
  speakers: [],
};

describe("public embed API", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ENV", "staging");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it("loads only the latest immutable published projection", async () => {
    const calls: Array<{
      input: RequestInfo | URL;
      init: RequestInit;
    }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init: init ?? {} });
      return new Response(JSON.stringify({ data: publishedAgenda }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    await expect(
      getPublishedAgenda("https://web-staging.example.test/", "open/systems", fetcher),
    ).resolves.toEqual(publishedAgenda);
    expect(String(calls[0]?.input)).toBe(
      "https://web-staging.example.test/api/public/events/open%2Fsystems/agenda",
    );
    expect(calls[0]?.init).toMatchObject({
      cache: "force-cache",
      headers: { accept: "application/json" },
      next: { revalidate: 60, tags: ["public-programs"] },
    });
    expect(calls[0]?.init.credentials).toBeUndefined();
  });
  it("accepts distinct agenda and speaker child revisions under one served release", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, ...(init === undefined ? {} : { init }) });
      const isAgenda = String(input).endsWith("/agenda");
      return Response.json(
        { data: isAgenda ? publishedAgenda : publishedSpeakers },
        isAgenda
          ? undefined
          : {
              headers: {
                "x-sessionboard-program-revision": "101",
                "x-sessionboard-cache-revision": "1001",
              },
            },
      );
    };

    await expect(
      getPublishedProgram(
        "https://open-sessionboard-web-staging.ashleyha0317.workers.dev",
        "open-systems",
        fetcher,
      ),
    ).resolves.toEqual({
      agenda: publishedAgenda,
      speakers: publishedSpeakers,
      servedProgramRevision: 101,
      cacheRevision: 1001,
    });
    expect(calls).toHaveLength(2);
    expect(calls.map(({ init }) => init?.cache)).toEqual(["no-store", "no-store"]);
  });

  it("strips private keys and defaults omitted agenda track IDs to an empty list", async () => {
    const rawEntry = {
      id: "entry_keynote",
      sessionId: "session_keynote",
      title: "Opening keynote",
      summary: "A practical opening.",
      format: "Keynote",
      speakerNames: ["Sam Rivera"],
      roomName: "Main hall",
      trackNames: ["Main stage"],
      startsAt: "2026-09-18T16:00:00.000Z",
      endsAt: "2026-09-18T16:45:00.000Z",
      privateNotes: "do not expose",
    };
    const response = Response.json({
      data: {
        ...publishedAgenda,
        event: { ...publishedAgenda.event, privateEmail: "secret@example.test" },
        entries: [rawEntry],
        privateSourceHash: "secret",
      },
    });
    const agenda = await getPublishedAgenda(
      "https://open-sessionboard-web-staging.ashleyha0317.workers.dev",
      "open-systems",
      async () => response,
    );

    expect(agenda.event).toEqual(publishedAgenda.event);
    expect(agenda.entries).toEqual([
      {
        id: rawEntry.id,
        sessionId: rawEntry.sessionId,
        title: rawEntry.title,
        summary: rawEntry.summary,
        format: rawEntry.format,
        speakerNames: rawEntry.speakerNames,
        roomName: rawEntry.roomName,
        trackNames: rawEntry.trackNames,
        trackIds: [],
        startsAt: rawEntry.startsAt,
        endsAt: rawEntry.endsAt,
      },
    ]);
    expect(agenda.entries[0]).not.toHaveProperty("privateNotes");
  });

  it("rejects malformed public envelopes and bodies", async () => {
    const fetcher = async () => Response.json({ data: { event: publishedAgenda.event } });
    await expect(
      getPublishedAgenda(
        "https://open-sessionboard-web-staging.ashleyha0317.workers.dev",
        "open-systems",
        fetcher,
      ),
    ).rejects.toMatchObject({ code: "PUBLIC_EMBED_INVALID_RESPONSE", status: 502 });
  });

  it("requires positive release headers for the speaker projection", async () => {
    const fetcher = async () => Response.json({ data: publishedSpeakers });
    await expect(
      getPublishedSpeakers(
        "https://open-sessionboard-web-staging.ashleyha0317.workers.dev",
        "open-systems",
        fetcher,
      ),
    ).rejects.toMatchObject({ code: "PUBLIC_EMBED_INVALID_RESPONSE", status: 502 });
  });

  it.each([
    ["0", "1001"],
    ["not-a-number", "1001"],
    ["101", "0"],
    ["101", "1.5"],
  ])("rejects malformed release headers (%s, %s)", async (programRevision, cacheRevision) => {
    const fetcher = async () =>
      Response.json(
        { data: publishedSpeakers },
        {
          headers: {
            "x-sessionboard-program-revision": programRevision,
            "x-sessionboard-cache-revision": cacheRevision,
          },
        },
      );
    await expect(
      getPublishedSpeakers(
        "https://open-sessionboard-web-staging.ashleyha0317.workers.dev",
        "open-systems",
        fetcher,
      ),
    ).rejects.toMatchObject({ code: "PUBLIC_EMBED_INVALID_RESPONSE", status: 502 });
  });

  it("rejects mismatched served release headers without child-revision retries", async () => {
    const calls: Array<RequestInfo | URL> = [];
    const fetcher = async (input: RequestInfo | URL) => {
      calls.push(input);
      const isAgenda = String(input).endsWith("/agenda");
      return Response.json(
        { data: isAgenda ? publishedAgenda : publishedSpeakers },
        {
          headers: {
            "x-sessionboard-program-revision": isAgenda ? "102" : "101",
            "x-sessionboard-cache-revision": "1001",
          },
        },
      );
    };

    await expect(
      getPublishedProgram(
        "https://open-sessionboard-web-staging.ashleyha0317.workers.dev",
        "open-systems",
        fetcher,
      ),
    ).rejects.toMatchObject({ code: "PUBLICATION_REVISION_MISMATCH", status: 409 });
    expect(calls).toHaveLength(2);
  });

  it("rejects event metadata mismatches without retrying either projection", async () => {
    const calls: Array<RequestInfo | URL> = [];
    const fetcher = async (input: RequestInfo | URL) => {
      calls.push(input);
      const isAgenda = String(input).endsWith("/agenda");
      return Response.json(
        {
          data: isAgenda
            ? publishedAgenda
            : { ...publishedSpeakers, event: { ...publishedSpeakers.event, name: "Other event" } },
        },
        {
          headers: {
            "x-sessionboard-program-revision": "101",
            "x-sessionboard-cache-revision": "1001",
          },
        },
      );
    };

    await expect(
      getPublishedProgram(
        "https://open-sessionboard-web-staging.ashleyha0317.workers.dev",
        "open-systems",
        fetcher,
      ),
    ).rejects.toMatchObject({ code: "PUBLICATION_REVISION_MISMATCH", status: 409 });
    expect(calls).toHaveLength(2);
  });

  it("returns a stable public error without assuming draft data exists", async () => {
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "PUBLICATION_NOT_FOUND",
            message: "No published agenda exists for this event.",
            traceId: "trace_public",
          },
        }),
        { status: 404, headers: { "content-type": "application/json" } },
      );

    const error = await getPublishedAgenda(
      "https://web-staging.example.test",
      "open",
      fetcher,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PublicEmbedApiError);
    expect(error).toMatchObject({
      code: "PUBLICATION_NOT_FOUND",
      status: 404,
      traceId: "trace_public",
    });
  });
  it("rejects non-HTTPS remote API origins before issuing a request", async () => {
    const fetcher = async () => {
      throw new Error("fetch must not run");
    };

    await expect(
      getPublishedAgenda("http://api.example.com", "open", fetcher),
    ).rejects.toMatchObject({
      code: "CONFIGURATION_ERROR",
      status: 503,
    });
  });
});
