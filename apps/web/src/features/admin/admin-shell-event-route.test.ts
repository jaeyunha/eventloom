import { describe, expect, it, vi } from "vitest";
import { eventWorkspaceFromCollectionResponse, fetchOrganizerEventWorkspace } from "./admin-shell";

const responsePayload = {
  data: [
    {
      id: "e66dc153-ec67-4f29-8b0f-8fc6733da05d",
      name: "Summit 2026",
      slug: "summit-2026",
    },
  ],
};

describe("admin shell event route resolution", () => {
  it("resolves the collection by slug and legacy identifier", () => {
    expect(eventWorkspaceFromCollectionResponse(responsePayload, "summit-2026")).toEqual(
      responsePayload.data[0],
    );
    expect(
      eventWorkspaceFromCollectionResponse(responsePayload, "e66dc153-ec67-4f29-8b0f-8fc6733da05d"),
    ).toEqual(responsePayload.data[0]);
  });

  it("loads event identities through the organization collection endpoint", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify(responsePayload), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
    );

    await expect(
      fetchOrganizerEventWorkspace("https://eventloom.test", "ai engineer", "summit-2026", fetcher),
    ).resolves.toEqual(responsePayload.data[0]);
    expect(fetcher).toHaveBeenCalledWith(
      "https://eventloom.test/api/admin/organizations/ai%20engineer/events",
      {
        cache: "no-store",
        credentials: "include",
        headers: { Accept: "application/json" },
      },
    );
  });
});
