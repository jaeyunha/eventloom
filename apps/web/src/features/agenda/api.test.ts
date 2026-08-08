import { describe, expect, it, vi } from "vitest";
import { AgendaApiError, createAgendaApi } from "./api";
import type { AgendaWorkspaceData } from "./types";

const workspace = {
  event: {
    id: "evt_open",
    name: "Open Systems Summit",
    timeZone: "UTC",
    startsOn: "2026-09-18",
    endsOn: "2026-09-19",
  },
  draft: {
    version: 2,
    updatedAt: "2026-08-08T12:00:00.000Z",
    updatedBy: "Avery",
    entries: [],
  },
  rooms: [],
  tracks: [],
  unscheduledSessions: [],
  revisions: [],
  currentPublishedRevision: null,
} satisfies AgendaWorkspaceData;

describe("agenda API adapter", () => {
  it("uses credentialed admin endpoints and expected draft versions", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ data: workspace }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const api = createAgendaApi("https://api.example.com/", fetcher);

    await api.saveEntry({
      eventId: "evt/open",
      expectedVersion: 2,
      entry: {
        sessionId: "session_1",
        roomId: "room_1",
        trackIds: ["track_1"],
        startsAtLocal: "2026-09-18T09:00",
        endsAtLocal: "2026-09-18T10:00",
      },
    });

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe("https://api.example.com/api/admin/events/evt%2Fopen/agenda/draft/entries");
    expect(init).toMatchObject({
      method: "PUT",
      credentials: "include",
      headers: { accept: "application/json", "content-type": "application/json" },
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({ expectedVersion: 2 });
  });

  it("preserves structured conflict details from failed mutations", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "PUBLICATION_BLOCKED",
            message: "Hard scheduling conflicts must be resolved",
            traceId: "trace_agenda",
            details: {
              conflicts: [
                {
                  id: "conflict_room",
                  kind: "room",
                  entryIds: ["entry_1"],
                  message: "Room overlap",
                },
              ],
              warnings: [],
            },
          },
        }),
        { status: 409, headers: { "content-type": "application/json" } },
      ),
    );
    const api = createAgendaApi("https://api.example.com", fetcher);

    const error = await api.preview("evt_open").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AgendaApiError);
    expect(error).toMatchObject({
      code: "PUBLICATION_BLOCKED",
      status: 409,
      traceId: "trace_agenda",
      details: { conflicts: [{ kind: "room" }] },
    });
  });
});
