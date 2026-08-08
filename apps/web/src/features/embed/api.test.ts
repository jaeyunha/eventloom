import { describe, expect, it } from "vitest";
import { getPublishedAgenda, PublicEmbedApiError } from "./api";
import type { PublishedAgenda } from "./types";

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

describe("public embed API", () => {
  it("loads only the published projection with cache revalidation", async () => {
    const calls: Array<{
      input: RequestInfo | URL;
      init: RequestInit & { next?: { revalidate: number } };
    }> = [];
    const fetcher = async (
      input: RequestInfo | URL,
      init?: RequestInit & { next?: { revalidate: number } },
    ) => {
      calls.push({ input, init: init ?? {} });
      return new Response(JSON.stringify({ data: publishedAgenda }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    await expect(
      getPublishedAgenda("https://api.example.com/", "open/systems", fetcher),
    ).resolves.toEqual(publishedAgenda);
    expect(String(calls[0]?.input)).toBe(
      "https://api.example.com/api/public/events/open%2Fsystems/agenda",
    );
    expect(calls[0]?.init).toMatchObject({
      cache: "force-cache",
      headers: { accept: "application/json" },
      next: { revalidate: 60 },
    });
    expect(calls[0]?.init.credentials).toBeUndefined();
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

    const error = await getPublishedAgenda("https://api.example.com", "open", fetcher).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(PublicEmbedApiError);
    expect(error).toMatchObject({
      code: "PUBLICATION_NOT_FOUND",
      status: 404,
      traceId: "trace_public",
    });
  });
});
