import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePath, revalidateTag } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath, revalidateTag }));

import { POST } from "./route";

const token = "cache-invalidation-test-token";

function request(body: unknown, authorization?: string): Request {
  return new Request("https://web.example.test/api/internal/cache-invalidation", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorization === undefined ? {} : { authorization }),
    },
    body: JSON.stringify(body),
  });
}

describe("public cache invalidation route", () => {
  beforeEach(() => {
    process.env.CACHE_INVALIDATION_TOKEN = token;
    revalidateTag.mockReset();
    revalidatePath.mockReset();
  });

  afterEach(() => {
    delete process.env.CACHE_INVALIDATION_TOKEN;
  });

  it("rejects requests without the internal bearer token", async () => {
    const response = await POST(request({ eventId: "event-1" }));

    expect(response.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("invalidates the tagged public projections immediately", async () => {
    const response = await POST(request({ eventId: "event-1" }, `Bearer ${token}`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { eventId: "event-1", invalidated: true },
    });
    expect(revalidateTag).toHaveBeenCalledWith("public-programs", { expire: 0 });
    expect(revalidatePath).toHaveBeenCalledTimes(5);
    for (const view of ["sessions", "speakers-list", "agenda", "itinerary", "speakers"]) {
      expect(revalidatePath).toHaveBeenCalledWith(`/embed/event-1/${view}`, "page");
    }
  });

  it("rejects malformed event identifiers without touching the cache", async () => {
    const response = await POST(request({ eventId: "" }, `Bearer ${token}`));

    expect(response.status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
