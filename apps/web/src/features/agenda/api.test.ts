import { describe, expect, it } from "vitest";
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
    const calls: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ data: workspace }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const api = createAgendaApi("https://api.example.com/", "org_open", fetcher);

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

    expect(calls).toHaveLength(1);
    expect(String(calls[0]?.input)).toBe(
      "https://api.example.com/api/admin/organizations/org_open/events/evt%2Fopen/agenda/draft/entries",
    );
    expect(calls[0]?.init).toMatchObject({
      method: "PUT",
      credentials: "include",
      headers: { accept: "application/json", "content-type": "application/json" },
    });
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({ expectedVersion: 2 });
  });
  it("rejects missing organization context instead of inferring a tenant", () => {
    expect(() => createAgendaApi("https://api.example.com", "   ")).toThrow(
      "An organization ID is required",
    );
  });

  it("preserves structured conflict details from failed mutations", async () => {
    const fetcher = async () => {
      return new Response(
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
      );
    };
    const api = createAgendaApi("https://api.example.com", "org_open", fetcher);

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
