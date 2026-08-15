import { describe, expect, it, vi } from "vitest";
import { DEV_PREWARM_PATHS, prewarmRoutes, waitForWeb } from "./prewarm-next-routes";

describe("Next dev route prewarming", () => {
  it("requests every common route once", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));

    const result = await prewarmRoutes({
      baseUrl: "http://127.0.0.1:3015",
      fetcher,
    });

    expect(fetcher.mock.calls.map(([input]) => String(input))).toEqual(
      DEV_PREWARM_PATHS.map((path) => `http://127.0.0.1:3015${path}`),
    );
    expect(result.failures).toEqual([]);
  });

  it("reports failed routes after warming the rest", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const status = String(input).endsWith("/review") ? 500 : 200;
      return new Response(null, { status });
    });

    const result = await prewarmRoutes({
      baseUrl: "http://127.0.0.1:3015",
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(DEV_PREWARM_PATHS.length);
    expect(result.failures).toEqual([{ path: "/review", status: 500 }]);
  });

  it("waits for the web health endpoint before prewarming", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("not listening"))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const wait = vi.fn(async () => undefined);

    await waitForWeb({
      baseUrl: "http://127.0.0.1:3015",
      attempts: 3,
      fetcher,
      wait,
    });

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });
});
