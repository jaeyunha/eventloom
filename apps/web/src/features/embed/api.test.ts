import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPublishedAgenda, getPublishedProgram, PublicEmbedApiError } from "./api";
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
  revision: publishedAgenda.revision,
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

  it("returns a program only when both public widgets share one revision and event", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, ...(init === undefined ? {} : { init }) });
      return new Response(
        JSON.stringify({
          data: String(input).endsWith("/agenda") ? publishedAgenda : publishedSpeakers,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    await expect(
      getPublishedProgram("https://web-staging.example.test", "open-systems", fetcher),
    ).resolves.toEqual({ agenda: publishedAgenda, speakers: publishedSpeakers });
    expect(calls).toHaveLength(2);
    expect(calls.map(({ init }) => init?.cache)).toEqual(["no-store", "no-store"]);
  });

  it("recovers one-revision skew by refreshing only the stale projection", async () => {
    const staleSpeakers: PublishedSpeakerGallery = {
      ...publishedSpeakers,
      revision: { ...publishedSpeakers.revision, id: "revision_2", number: 2 },
    };
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    let speakerReads = 0;
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, ...(init === undefined ? {} : { init }) });
      const speakers = String(input).endsWith("/speakers");
      if (speakers) speakerReads += 1;
      return new Response(
        JSON.stringify({
          data:
            speakers && speakerReads === 1
              ? staleSpeakers
              : speakers
                ? publishedSpeakers
                : publishedAgenda,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    await expect(
      getPublishedProgram("https://web-staging.example.test", "open-systems", fetcher),
    ).resolves.toEqual({ agenda: publishedAgenda, speakers: publishedSpeakers });
    expect(calls).toHaveLength(3);
    expect(calls.slice(0, 2).map(({ init }) => init?.cache)).toEqual(["no-store", "no-store"]);
    expect(String(calls[2]?.input)).toMatch(/\/speakers$/u);
    expect(calls[2]?.init).toMatchObject({
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    expect(calls[2]?.init?.next).toBeUndefined();
  });

  it.each(["agenda", "speakers"] as const)(
    "recovers when a refreshed %s projection overtakes the retained revision",
    async (lowerProjection) => {
      const revision2 = {
        ...publishedAgenda.revision,
        id: "revision_2",
        number: 2,
      };
      const revision4 = {
        ...publishedAgenda.revision,
        id: "revision_4",
        number: 4,
        publishedAt: "2026-08-08T13:00:00.000Z",
      };
      const staleAgenda = { ...publishedAgenda, revision: revision2 };
      const staleSpeakers = { ...publishedSpeakers, revision: revision2 };
      const refreshedAgenda = { ...publishedAgenda, revision: revision4 };
      const refreshedSpeakers = { ...publishedSpeakers, revision: revision4 };
      const reads = { agenda: 0, speakers: 0 };
      const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
      const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ input, ...(init === undefined ? {} : { init }) });
        const projection = String(input).endsWith("/agenda") ? "agenda" : "speakers";
        reads[projection] += 1;
        const firstRead = reads[projection] === 1;
        const data =
          projection === "agenda"
            ? firstRead && lowerProjection === "agenda"
              ? staleAgenda
              : firstRead
                ? publishedAgenda
                : refreshedAgenda
            : firstRead && lowerProjection === "speakers"
              ? staleSpeakers
              : firstRead
                ? publishedSpeakers
                : refreshedSpeakers;
        return Response.json({ data });
      };

      await expect(
        getPublishedProgram("https://web-staging.example.test", "open-systems", fetcher),
      ).resolves.toEqual({ agenda: refreshedAgenda, speakers: refreshedSpeakers });
      expect(calls).toHaveLength(4);
      expect(calls.map(({ init }) => init?.cache)).toEqual([
        "no-store",
        "no-store",
        "no-store",
        "no-store",
      ]);
      expect(String(calls[2]?.input)).toMatch(new RegExp(`/${lowerProjection}$`, "u"));
      expect(String(calls[3]?.input)).toMatch(
        new RegExp(`/${lowerProjection === "agenda" ? "speakers" : "agenda"}$`, "u"),
      );
    },
  );
  it("fails closed when the retained projection does not catch an overtaking revision", async () => {
    const staleSpeakers: PublishedSpeakerGallery = {
      ...publishedSpeakers,
      revision: { ...publishedSpeakers.revision, id: "revision_2", number: 2 },
    };
    const overtakingSpeakers: PublishedSpeakerGallery = {
      ...publishedSpeakers,
      revision: {
        ...publishedSpeakers.revision,
        id: "revision_4",
        number: 4,
        publishedAt: "2026-08-08T13:00:00.000Z",
      },
    };
    let speakerReads = 0;
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, ...(init === undefined ? {} : { init }) });
      const speakers = String(input).endsWith("/speakers");
      if (speakers) speakerReads += 1;
      return Response.json({
        data: speakers
          ? speakerReads === 1
            ? staleSpeakers
            : overtakingSpeakers
          : publishedAgenda,
      });
    };

    await expect(
      getPublishedProgram("https://web-staging.example.test", "open-systems", fetcher),
    ).rejects.toMatchObject({
      code: "PUBLICATION_REVISION_MISMATCH",
      status: 409,
    });
    expect(calls).toHaveLength(4);
    expect(calls.map(({ init }) => init?.cache)).toEqual([
      "no-store",
      "no-store",
      "no-store",
      "no-store",
    ]);
  });

  it("retries both projections for an equal-number mismatch and rejects when it persists", async () => {
    const mismatchedAgenda: PublishedAgenda = {
      ...publishedAgenda,
      event: { ...publishedAgenda.event, name: "Different event" },
    };
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, ...(init === undefined ? {} : { init }) });
      return new Response(
        JSON.stringify({
          data: String(input).endsWith("/agenda") ? mismatchedAgenda : publishedSpeakers,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    await expect(
      getPublishedProgram("https://web-staging.example.test", "open-systems", fetcher),
    ).rejects.toMatchObject({
      code: "PUBLICATION_REVISION_MISMATCH",
      status: 409,
    });
    expect(calls).toHaveLength(4);
    expect(calls.map(({ init }) => init?.cache)).toEqual([
      "no-store",
      "no-store",
      "no-store",
      "no-store",
    ]);
    expect(calls.slice(2).every(({ init }) => init?.next === undefined)).toBe(true);
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
