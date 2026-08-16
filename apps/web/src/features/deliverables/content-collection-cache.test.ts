import { describe, expect, it } from "vitest";
import {
  CONTENT_COLLECTION_NAVIGATION_CACHE_TTL_MS,
  createContentCollectionNavigationCache,
} from "./content-collection-cache";

describe("content collection navigation cache", () => {
  it("reuses an event snapshot until the freshness window expires", () => {
    let now = 1_000;
    const cache = createContentCollectionNavigationCache<{ readonly taskIds: readonly string[] }>({
      now: () => now,
    });
    const scope = { organizationId: "org-1", eventId: "event-1", view: "requests" };
    const snapshot = { taskIds: ["task-1"] };

    cache.set(scope, snapshot);

    expect(cache.get(scope)).toEqual(snapshot);
    now += CONTENT_COLLECTION_NAVIGATION_CACHE_TTL_MS;
    expect(cache.get(scope)).toBeUndefined();
  });

  it("keeps event snapshots isolated and supports explicit invalidation", () => {
    const cache = createContentCollectionNavigationCache<number>();
    const first = { organizationId: "org-1", eventId: "event-1", view: "requests" };
    const second = { organizationId: "org-1", eventId: "event-1", view: "files" };

    cache.set(first, 1);
    cache.set(second, 2);
    cache.invalidate(first);

    expect(cache.get(first)).toBeUndefined();
    expect(cache.get(second)).toBe(2);
  });

  it("invalidates every cached view for a mutated event", () => {
    const cache = createContentCollectionNavigationCache<number>();
    const requests = { organizationId: "org-1", eventId: "event-1", view: "requests" };
    const files = { organizationId: "org-1", eventId: "event-1", view: "files" };
    const otherEvent = { organizationId: "org-1", eventId: "event-2", view: "requests" };

    cache.set(requests, 1);
    cache.set(files, 2);
    cache.set(otherEvent, 3);
    cache.invalidateEvent({ organizationId: "org-1", eventId: "event-1" });

    expect(cache.get(requests)).toBeUndefined();
    expect(cache.get(files)).toBeUndefined();
    expect(cache.get(otherEvent)).toBe(3);
  });

  it("bounds retained private snapshots and evicts the oldest scope", () => {
    const cache = createContentCollectionNavigationCache<number>({ maxEntries: 2 });
    const first = { organizationId: "org-1", eventId: "event-1", view: "requests" };
    const second = { organizationId: "org-1", eventId: "event-2", view: "requests" };
    const third = { organizationId: "org-1", eventId: "event-3", view: "requests" };

    cache.set(first, 1);
    cache.set(second, 2);
    cache.set(third, 3);

    expect(cache.get(first)).toBeUndefined();
    expect(cache.get(second)).toBe(2);
    expect(cache.get(third)).toBe(3);
  });
});
