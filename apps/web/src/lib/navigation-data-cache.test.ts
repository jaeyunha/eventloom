import { describe, expect, it } from "vitest";
import { createNavigationDataCache } from "./navigation-data-cache";

function deferred<T>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe("navigation data cache", () => {
  it("supports synchronous peek hydration", () => {
    const cache = createNavigationDataCache();
    const snapshot = { revision: 4 };

    cache.write(" overview ", snapshot, [" organization:org-1 "]);

    expect(cache.peek<typeof snapshot>("overview")).toBe(snapshot);
  });

  it("expires completed data after the default 60-second TTL", async () => {
    let currentTime = 1_000;
    const cache = createNavigationDataCache({ now: () => currentTime });
    let loads = 0;

    await cache.read({
      key: "overview",
      tags: ["organization:org-1"],
      load: async () => {
        loads += 1;
        return { revision: loads };
      },
    });
    currentTime += 59_999;
    expect(cache.peek<{ revision: number }>("overview")).toEqual({ revision: 1 });

    currentTime += 1;
    expect(cache.peek("overview")).toBeUndefined();
    await cache.read({
      key: "overview",
      tags: ["organization:org-1"],
      load: async () => {
        loads += 1;
        return { revision: loads };
      },
    });
    expect(loads).toBe(2);
  });

  it("keeps the most recently used completed entries within the LRU bound", async () => {
    const cache = createNavigationDataCache({ maxEntries: 2 });
    const load = async (key: string) => key;

    await cache.read({ key: "first", tags: ["organization:org-1"], load: () => load("first") });
    await cache.read({
      key: "second",
      tags: ["organization:org-1"],
      load: () => load("second"),
    });
    expect(cache.peek("first")).toBe("first");

    await cache.read({ key: "third", tags: ["organization:org-1"], load: () => load("third") });

    expect(cache.peek("second")).toBeUndefined();
    expect(cache.peek("first")).toBe("first");
    expect(cache.peek("third")).toBe("third");
  });

  it("coalesces identical in-flight reads", async () => {
    const cache = createNavigationDataCache();
    const result = deferred<string>();
    let starts = 0;
    const load = () => {
      starts += 1;
      return result.promise;
    };

    const first = cache.read({ key: "overview", tags: ["event:event-1"], load });
    const second = cache.read({ key: "overview", tags: ["event:event-1"], load });

    expect(second).toBe(first);
    await Promise.resolve();
    expect(starts).toBe(1);
    result.resolve("loaded");
    await expect(first).resolves.toBe("loaded");
  });

  it("does not cache rejected loads", async () => {
    const cache = createNavigationDataCache();
    const error = new Error("load failed");
    let starts = 0;
    const load = async () => {
      starts += 1;
      throw error;
    };

    await expect(cache.read({ key: "overview", tags: ["event:event-1"], load })).rejects.toBe(
      error,
    );
    expect(cache.peek("overview")).toBeUndefined();
    await expect(cache.read({ key: "overview", tags: ["event:event-1"], load })).rejects.toBe(
      error,
    );
    expect(starts).toBe(2);
  });

  it("bypasses completed data for fresh reads", async () => {
    const cache = createNavigationDataCache();
    let revision = 0;
    const load = async () => {
      revision += 1;
      return revision;
    };

    await expect(
      cache.read({ key: "overview", tags: ["event:event-1"], load }),
    ).resolves.toBe(1);
    await expect(
      cache.read({ key: "overview", tags: ["event:event-1"], load }),
    ).resolves.toBe(1);
    await expect(
      cache.read({ key: "overview", tags: ["event:event-1"], load, fresh: true }),
    ).resolves.toBe(2);
    expect(cache.peek<number>("overview")).toBe(2);
  });

  it("invalidates only entries carrying targeted tags", () => {
    const cache = createNavigationDataCache();
    cache.write("event-1", "one", ["organization:org-1", "event:event-1"]);
    cache.write("event-2", "two", ["organization:org-1", "event:event-2"]);
    cache.write("other", "other", ["organization:org-2"]);

    cache.invalidate(["event:event-1"]);

    expect(cache.peek("event-1")).toBeUndefined();
    expect(cache.peek("event-2")).toBe("two");
    expect(cache.peek("other")).toBe("other");
  });

  it("does not let an invalidated in-flight read repopulate stale data", async () => {
    const cache = createNavigationDataCache();
    const oldResult = deferred<string>();
    const newResult = deferred<string>();
    let starts = 0;

    const oldRead = cache.read({
      key: "event",
      tags: ["event:event-1"],
      load: () => {
        starts += 1;
        return oldResult.promise;
      },
    });
    cache.invalidate(["event:event-1"]);
    const newRead = cache.read({
      key: "event",
      tags: ["event:event-1"],
      load: () => {
        starts += 1;
        return newResult.promise;
      },
    });

    oldResult.resolve("old");
    await expect(oldRead).resolves.toBe("old");
    expect(cache.peek("event")).toBeUndefined();

    newResult.resolve("new");
    await expect(newRead).resolves.toBe("new");
    expect(cache.peek("event")).toBe("new");
    expect(starts).toBe(2);
  });

  it("clears completed and pending data", async () => {
    const cache = createNavigationDataCache();
    const pendingResult = deferred<string>();
    const pendingRead = cache.read({
      key: "pending",
      tags: ["event:event-1"],
      load: () => pendingResult.promise,
    });
    cache.write("completed", "value", ["event:event-1"]);

    cache.clear();
    expect(cache.peek("completed")).toBeUndefined();
    expect(cache.peek("pending")).toBeUndefined();

    pendingResult.resolve("stale");
    await expect(pendingRead).resolves.toBe("stale");
    expect(cache.peek("pending")).toBeUndefined();
  });

  it("rejects empty keys and tags", () => {
    const cache = createNavigationDataCache();

    expect(() => cache.peek("  ")).toThrow(TypeError);
    expect(() => cache.write("key", "value", ["  "])).toThrow(TypeError);
  });
});
