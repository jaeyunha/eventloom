import { describe, expect, it, vi } from "vitest";
import { createApiNavigationCachedFetch } from "./api-navigation-cache";

const ORIGIN = "http://127.0.0.1:3015";

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
}

describe("API navigation cache", () => {
  it("never caches a request that explicitly uses no-store", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => jsonResponse({ value: "cached" }));
    const cachedFetch = createApiNavigationCachedFetch(fetcher, {
      origin: ORIGIN,
      ttlMs: 60_000,
    });

    const first = await cachedFetch("/api/admin/organizations/org-1/overview/core", {
      cache: "no-store",
      credentials: "include",
    });
    const second = await cachedFetch("/api/admin/organizations/org-1/overview/core", {
      cache: "no-store",
      credentials: "include",
    });

    await expect(first.json()).resolves.toEqual({ value: "cached" });
    await expect(second.json()).resolves.toEqual({ value: "cached" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each(["no-store", "private, max-age=60"])(
    "does not store responses declaring Cache-Control: %s",
    async (cacheControl) => {
      const fetcher = vi.fn<typeof fetch>().mockImplementation(
        async () =>
          new Response(JSON.stringify({ value: "fresh" }), {
            headers: {
              "cache-control": cacheControl,
              "content-type": "application/json",
            },
          }),
      );
      const cachedFetch = createApiNavigationCachedFetch(fetcher, { origin: ORIGIN });

      await cachedFetch("/api/admin/organizations/org-1/overview/core");
      await cachedFetch("/api/admin/organizations/org-1/overview/core");

      expect(fetcher).toHaveBeenCalledTimes(2);
    },
  );

  it("expires cached reads and fetches a fresh response", async () => {
    let currentTime = 1_000;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ revision: 1 }))
      .mockResolvedValueOnce(jsonResponse({ revision: 2 }));
    const cachedFetch = createApiNavigationCachedFetch(fetcher, {
      now: () => currentTime,
      origin: ORIGIN,
      ttlMs: 500,
    });

    await cachedFetch("/api/admin/organizations/org-1/overview/core");
    currentTime = 1_501;
    const refreshed = await cachedFetch("/api/admin/organizations/org-1/overview/core");

    await expect(refreshed.json()).resolves.toEqual({ revision: 2 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("invalidates navigation reads before an API mutation", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ revision: 1 }))
      .mockResolvedValueOnce(jsonResponse({ saved: true }))
      .mockResolvedValueOnce(jsonResponse({ revision: 2 }));
    const cachedFetch = createApiNavigationCachedFetch(fetcher, { origin: ORIGIN });
    const path = "/api/admin/organizations/org-1/overview/core";

    await cachedFetch(path);
    await cachedFetch(path);
    await cachedFetch("/api/admin/organizations/org-1/events/event-1", { method: "PATCH" });
    const refreshed = await cachedFetch(path);

    await expect(refreshed.json()).resolves.toEqual({ revision: 2 });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("never caches auth, external, or authorized reads", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => jsonResponse({ ok: true }));
    const cachedFetch = createApiNavigationCachedFetch(fetcher, { origin: ORIGIN });

    await cachedFetch("/api/auth/get-session");
    await cachedFetch("/api/auth/get-session");
    await cachedFetch("https://example.com/api/data");
    await cachedFetch("https://example.com/api/data");
    await cachedFetch("/api/admin/organizations/org-1/overview/core", {
      headers: { authorization: "Bearer private" },
    });
    await cachedFetch("/api/admin/organizations/org-1/overview/core", {
      headers: { authorization: "Bearer private" },
    });

    expect(fetcher).toHaveBeenCalledTimes(6);
  });
});
