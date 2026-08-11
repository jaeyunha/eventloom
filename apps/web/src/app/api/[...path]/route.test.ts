import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const context = {
  params: Promise.resolve({ path: ["admin", "events"] }),
};

beforeEach(() => {
  process.env.API_UPSTREAM_ORIGIN = "https://api.example.test";
  process.env.APP_ENV = "production";
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.API_UPSTREAM_ORIGIN;
  delete process.env.APP_ENV;
});

describe("same-origin API proxy", () => {
  it("forwards scoped requests and removes stale response framing", async () => {
    const fetcher = vi.fn(
      async (_target: RequestInfo | URL, _init?: RequestInit) =>
        new Response("proxied", {
          status: 200,
          headers: {
            "content-encoding": "gzip",
            "content-length": "7",
            "content-type": "text/plain",
          },
        }),
    );
    vi.stubGlobal("fetch", fetcher);

    const response = await GET(
      new NextRequest("https://web.example.test/api/admin/events?status=active", {
        headers: { cookie: "session=opaque" },
      }),
      context,
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [target, init] = fetcher.mock.calls[0] ?? [];
    expect(String(target)).toBe("https://api.example.test/api/admin/events?status=active");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const headers = new Headers(init?.headers);
    expect(headers.get("cookie")).toBe("session=opaque");
    expect(headers.get("x-forwarded-host")).toBe("web.example.test");
    expect(headers.get("x-forwarded-proto")).toBe("https");
    expect(await response.text()).toBe("proxied");
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("content-length")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("propagates client cancellation to the upstream request", async () => {
    const client = new AbortController();
    let upstreamSignal: AbortSignal | undefined;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((_target: RequestInfo | URL, init?: RequestInit) => {
        upstreamSignal = init?.signal ?? undefined;
        markStarted?.();
        return new Promise<Response>((_resolve, reject) => {
          upstreamSignal?.addEventListener("abort", () => reject(upstreamSignal?.reason), {
            once: true,
          });
        });
      }),
    );

    const response = GET(
      new NextRequest("https://web.example.test/api/admin/events", {
        signal: client.signal,
      }),
      context,
    );
    await started;
    client.abort(new DOMException("Navigation cancelled.", "AbortError"));

    await expect(response).rejects.toMatchObject({ name: "AbortError" });
    expect(upstreamSignal?.aborted).toBe(true);
  });

  it("returns a trace-bearing gateway timeout at the fixed read deadline", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_target: RequestInfo | URL, init?: RequestInit) => {
        const signal = init?.signal;
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      }),
    );

    const pending = GET(
      new NextRequest("https://web.example.test/api/admin/events", {
        headers: { "x-request-id": "trace-proxy-timeout" },
      }),
      context,
    );
    await vi.advanceTimersByTimeAsync(15_000);
    const response = await pending;
    const body = (await response.json()) as {
      error: { code: string; message: string; traceId: string };
    };

    expect(response.status).toBe(504);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.error.code).toBe("INTEGRATION_UNAVAILABLE");
    expect(body.error.message).toContain("gateway deadline");
    expect(body.error.traceId).toBe("trace-proxy-timeout");
  });
});
