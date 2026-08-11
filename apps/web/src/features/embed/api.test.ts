import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPublishedAgenda,
  getPublishedProgram,
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
      getPublishedAgenda(
        "https://open-sessionboard-web-staging.ashleyha0317.workers.dev/",
        "open/systems",
        fetcher,
      ),
    ).resolves.toEqual(publishedAgenda);
    expect(String(calls[0]?.input)).toBe(
      "https://open-sessionboard-web-staging.ashleyha0317.workers.dev/api/public/events/open%2Fsystems/agenda",
    );
    expect(calls[0]?.init).toMatchObject({
      cache: "force-cache",
      headers: { accept: "application/json" },
      next: { revalidate: 60, tags: ["public-programs"] },
    });
    expect(calls[0]?.init.credentials).toBeUndefined();
  });

  it("returns a program only when both public widgets share one revision and event", async () => {
    const fetcher = async (input: RequestInfo | URL) =>
      new Response(
        JSON.stringify({
          data: String(input).endsWith("/agenda") ? publishedAgenda : publishedSpeakers,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    await expect(
      getPublishedProgram(
        "https://open-sessionboard-web-staging.ashleyha0317.workers.dev",
        "open-systems",
        fetcher,
      ),
    ).resolves.toEqual({ agenda: publishedAgenda, speakers: publishedSpeakers });
  });

  it("rejects cross-widget data from different publication revisions", async () => {
    const staleSpeakers: PublishedSpeakerGallery = {
      ...publishedSpeakers,
      revision: { ...publishedSpeakers.revision, id: "revision_2", number: 2 },
    };
    const fetcher = async (input: RequestInfo | URL) =>
      new Response(
        JSON.stringify({
          data: String(input).endsWith("/agenda") ? publishedAgenda : staleSpeakers,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    await expect(
      getPublishedProgram(
        "https://open-sessionboard-web-staging.ashleyha0317.workers.dev",
        "open-systems",
        fetcher,
      ),
    ).rejects.toMatchObject({
      code: "PUBLICATION_REVISION_MISMATCH",
      status: 409,
    });
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
      "https://open-sessionboard-web-staging.ashleyha0317.workers.dev",
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
  it("rejects unpinned remote API origins before issuing a request", async () => {
    const fetcher = async () => {
      throw new Error("fetch must not run");
    };

    await expect(
      getPublishedAgenda("https://api.example.com", "open", fetcher),
    ).rejects.toMatchObject({
      code: "CONFIGURATION_ERROR",
      status: 503,
    });
  });
});
