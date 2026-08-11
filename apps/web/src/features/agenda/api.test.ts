import { describe, expect, it } from "vitest";
import { AgendaApiError, createAgendaApi } from "./api";
import type { AgendaWorkspaceData } from "./types";

const workspace = {
  event: {
    id: "evt/open",
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
  it("uses credentialed admin endpoints and sends a complete draft for create/update/remove", async () => {
    const scheduledEntry = {
      id: "entry_existing",
      sessionId: "session_existing",
      title: "Existing session",
      format: "Talk",
      speakerNames: [],
      roomId: "room_existing",
      roomName: "Existing room",
      trackIds: ["track_existing"],
      trackNames: ["Existing track"],
      startsAtLocal: "2026-09-18T09:00",
      endsAtLocal: "2026-09-18T10:00",
    };
    const workspaceWithEntry = {
      ...workspace,
      draft: { ...workspace.draft, entries: [scheduledEntry] },
      rooms: [
        { id: "room_existing", name: "Existing room", capacity: 100 },
        { id: "room_1", name: "Room 1", capacity: 100 },
        { id: "room_updated", name: "Updated room", capacity: 100 },
      ],
      tracks: [
        { id: "track_existing", name: "Existing track", color: "#000000" },
        { id: "track_1", name: "Track 1", color: "#111111" },
      ],
      unscheduledSessions: [
        {
          id: "session_1",
          title: "New session",
          format: "Talk",
          durationMinutes: 60,
          speakerNames: ["Priya Raman"],
          capacityRequired: 10,
        },
      ],
    } satisfies AgendaWorkspaceData;
    const calls: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
    let serverWorkspace: AgendaWorkspaceData = workspaceWithEntry;
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      const path = String(input);
      if (path.endsWith("/agenda")) {
        return new Response(JSON.stringify({ data: serverWorkspace }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      const payload = JSON.parse(String(init?.body)) as {
        expectedVersion: number;
        entries: readonly {
          id: string;
          sessionId: string;
          roomId: string;
          trackIds: readonly string[];
          startsAtLocal: string;
          endsAtLocal: string;
        }[];
      };
      const entries = payload.entries.map((entry) => {
        const existing = serverWorkspace.draft.entries.find(
          (candidate) => candidate.id === entry.id || candidate.sessionId === entry.sessionId,
        );
        const session = serverWorkspace.unscheduledSessions.find(
          (candidate) => candidate.id === entry.sessionId,
        );
        return {
          ...entry,
          title: existing?.title ?? session?.title ?? entry.sessionId,
          format: existing?.format ?? session?.format ?? "Session",
          speakerNames: existing?.speakerNames ?? session?.speakerNames ?? [],
          roomName:
            serverWorkspace.rooms.find((room) => room.id === entry.roomId)?.name ?? entry.roomId,
          trackNames: entry.trackIds.flatMap(
            (trackId) => serverWorkspace.tracks.find((track) => track.id === trackId)?.name ?? [],
          ),
        };
      });
      const version = serverWorkspace.draft.version + 1;
      serverWorkspace = {
        ...serverWorkspace,
        draft: {
          ...serverWorkspace.draft,
          version,
          updatedAt: `2026-08-08T12:0${version - 2}:00.000Z`,
          entries,
        },
        unscheduledSessions: serverWorkspace.unscheduledSessions.filter(
          (session) => !entries.some((entry) => entry.sessionId === session.id),
        ),
      };
      return new Response(
        JSON.stringify({
          data: {
            eventId: "evt/open",
            version,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const api = createAgendaApi("https://api.example.com/", "org_open", fetcher);

    const created = await api.saveEntry({
      eventId: "evt/open",
      expectedVersion: 2,
      entry: {
        sessionId: "session_1",
        roomId: "room_1",
        trackIds: ["track_1"],
        startsAtLocal: "2026-09-18T11:00",
        endsAtLocal: "2026-09-18T12:00",
      },
    });

    expect(created.draft).toMatchObject({
      version: 3,
      updatedAt: "2026-08-08T12:01:00.000Z",
      updatedBy: "Avery",
      entries: [
        expect.objectContaining({
          id: "entry_existing",
          title: "Existing session",
          roomName: "Existing room",
        }),
        expect.objectContaining({
          id: "entry_session_1",
          title: "New session",
          roomName: "Room 1",
          speakerNames: ["Priya Raman"],
        }),
      ],
    });
    expect(calls.map((call) => String(call.input))).toEqual([
      "https://api.example.com/api/admin/organizations/org_open/events/evt%2Fopen/agenda",
      "https://api.example.com/api/admin/organizations/org_open/events/evt%2Fopen/agenda/draft",
      "https://api.example.com/api/admin/organizations/org_open/events/evt%2Fopen/agenda",
    ]);
    expect(calls[0]?.init).toMatchObject({
      credentials: "include",
      headers: { accept: "application/json" },
    });
    expect(calls[1]?.init).toMatchObject({
      method: "PUT",
      credentials: "include",
      headers: { accept: "application/json", "content-type": "application/json" },
    });
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
      expectedVersion: 2,
      entries: [
        {
          id: "entry_existing",
          sessionId: "session_existing",
          roomId: "room_existing",
          trackIds: ["track_existing"],
          startsAtLocal: "2026-09-18T09:00",
          endsAtLocal: "2026-09-18T10:00",
        },
        {
          id: "entry_session_1",
          sessionId: "session_1",
          roomId: "room_1",
          trackIds: ["track_1"],
          startsAtLocal: "2026-09-18T11:00",
          endsAtLocal: "2026-09-18T12:00",
        },
      ],
    });

    calls.length = 0;
    await api.saveEntry({
      eventId: "evt/open",
      expectedVersion: 3,
      entry: {
        id: "entry_existing",
        sessionId: "session_existing",
        roomId: "room_updated",
        trackIds: [],
        startsAtLocal: "2026-09-18T13:00",
        endsAtLocal: "2026-09-18T14:00",
      },
    });
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
      expectedVersion: 3,
      entries: [
        {
          id: "entry_existing",
          sessionId: "session_existing",
          roomId: "room_updated",
          trackIds: [],
          startsAtLocal: "2026-09-18T13:00",
          endsAtLocal: "2026-09-18T14:00",
        },
        {
          id: "entry_session_1",
          sessionId: "session_1",
          roomId: "room_1",
          trackIds: ["track_1"],
          startsAtLocal: "2026-09-18T11:00",
          endsAtLocal: "2026-09-18T12:00",
        },
      ],
    });

    calls.length = 0;
    await api.removeEntry({ eventId: "evt/open", entryId: "entry_existing", expectedVersion: 4 });
    expect(calls.map((call) => String(call.input))).toEqual([
      "https://api.example.com/api/admin/organizations/org_open/events/evt%2Fopen/agenda",
      "https://api.example.com/api/admin/organizations/org_open/events/evt%2Fopen/agenda/draft",
      "https://api.example.com/api/admin/organizations/org_open/events/evt%2Fopen/agenda",
    ]);
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
      expectedVersion: 4,
      entries: [
        {
          id: "entry_session_1",
          sessionId: "session_1",
          roomId: "room_1",
          trackIds: ["track_1"],
          startsAtLocal: "2026-09-18T11:00",
          endsAtLocal: "2026-09-18T12:00",
        },
      ],
    });
  });
  it("rejects missing organization context instead of inferring a tenant", () => {
    expect(() => createAgendaApi("https://api.example.com", "   ")).toThrow(
      "An organization ID is required",
    );
  });

  it("uses GET preview and publishes through the canonical route before reloading the workspace", async () => {
    const calls: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
    const preview = {
      draftVersion: 2,
      conflicts: [],
      warnings: [],
      diff: { added: 0, changed: 0, removed: 0 },
      validatedAt: "2026-08-08T12:00:00.000Z",
    };
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      const data = String(input).endsWith("/preview") ? preview : workspace;
      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const api = createAgendaApi("https://api.example.com", "org_open", fetcher);

    await expect(api.preview("evt/open")).resolves.toStrictEqual(preview);
    const published = await api.publish({ eventId: "evt/open", expectedVersion: 2 });
    expect(published).toStrictEqual(workspace);

    expect(calls.map((call) => String(call.input))).toEqual([
      "https://api.example.com/api/admin/organizations/org_open/events/evt%2Fopen/agenda/preview",
      "https://api.example.com/api/admin/organizations/org_open/events/evt%2Fopen/agenda/publish",
      "https://api.example.com/api/admin/organizations/org_open/events/evt%2Fopen/agenda",
    ]);
    expect(calls[0]?.init).toMatchObject({ method: "GET", credentials: "include" });
    expect(calls[1]?.init).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({ expectedVersion: 2 });
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
  it("normalizes direct success payloads and canonical validation issue arrays", async () => {
    const preview = {
      draftVersion: 2,
      conflicts: [],
      warnings: [],
      diff: { added: 0, changed: 0, removed: 0 },
      validatedAt: "2026-08-08T12:00:00.000Z",
    };
    const directApi = createAgendaApi(
      "https://api.example.com",
      "org_open",
      async () => new Response(JSON.stringify(preview), { status: 200 }),
    );
    await expect(directApi.preview("evt/open")).resolves.toStrictEqual(preview);

    const conflictApi = createAgendaApi(
      "https://api.example.com",
      "org_open",
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "CONFLICT",
              message: "The agenda contains unresolved scheduling conflicts.",
              traceId: "trace_issue_array",
              details: [
                {
                  path: ["entries", "entry_1", "entry_2"],
                  code: "agenda.room",
                  message: "The entries overlap in the same room.",
                },
              ],
            },
          }),
          { status: 409 },
        ),
    );
    await expect(conflictApi.preview("evt/open")).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
      traceId: "trace_issue_array",
      details: [
        {
          path: ["entries", "entry_1", "entry_2"],
          code: "agenda.room",
        },
      ],
    });
  });
  it("uses canonical private suggestion lifecycle paths and exact criteria/change bodies", async () => {
    const calls: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
    const suggestionRun = {
      id: "run/1",
      version: 1,
      status: "pending",
      baseDraftVersion: 2,
      diff: { summary: "One proposed change", changes: [] },
      validation: { conflicts: [] },
      acceptedChangeIds: [],
    };
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      const path = String(input);
      const data = path.endsWith("/apply")
        ? { version: 3, entries: [] }
        : path.endsWith("/agenda")
          ? workspace
          : suggestionRun;
      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const api = createAgendaApi("https://api.example.com/", "org/open", fetcher);

    await api.generateSuggestion({
      eventId: "evt/open",
      baseDraftVersion: 2,
      dates: ["2026-09-18"],
      eligibleStatuses: ["accepted"],
      roomIds: ["room/1"],
      dayWindows: [{ date: "2026-09-18", startLocal: "09:00", endLocal: "17:00" }],
      orderedRules: ["avoid conflicts"],
      ignoreExistingTimes: false,
      ignoreExistingRooms: true,
    });
    await api.regenerateSuggestion({
      eventId: "evt/open",
      runId: "run/1",
      baseDraftVersion: 2,
    });
    await api.rejectSuggestion({ eventId: "evt/open", runId: "run/1" });
    const applied = await api.applySuggestion({
      eventId: "evt/open",
      runId: "run/1",
      acceptedChangeIds: ["change/1"],
    });
    expect(applied).toStrictEqual(workspace);
    await api.getSuggestion({ eventId: "evt/open", runId: "run/1" });

    expect(calls.map((call) => String(call.input))).toEqual([
      "https://api.example.com/api/admin/organizations/org%2Fopen/events/evt%2Fopen/agenda/suggestions",
      "https://api.example.com/api/admin/organizations/org%2Fopen/events/evt%2Fopen/agenda/suggestions/run%2F1/regenerate",
      "https://api.example.com/api/admin/organizations/org%2Fopen/events/evt%2Fopen/agenda/suggestions/run%2F1/reject",
      "https://api.example.com/api/admin/organizations/org%2Fopen/events/evt%2Fopen/agenda/suggestions/run%2F1/apply",
      "https://api.example.com/api/admin/organizations/org%2Fopen/events/evt%2Fopen/agenda",
      "https://api.example.com/api/admin/organizations/org%2Fopen/events/evt%2Fopen/agenda/suggestions/run%2F1",
    ]);
    expect(calls[0]?.init).toMatchObject({
      method: "POST",
      credentials: "include",
      headers: { accept: "application/json", "content-type": "application/json" },
    });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      baseDraftVersion: 2,
      dates: ["2026-09-18"],
      eligibleStatuses: ["accepted"],
      roomIds: ["room/1"],
      dayWindows: [{ date: "2026-09-18", startLocal: "09:00", endLocal: "17:00" }],
      orderedRules: ["avoid conflicts"],
      ignoreExistingTimes: false,
      ignoreExistingRooms: true,
    });
    expect(JSON.parse(String(calls[3]?.init?.body))).toEqual({
      acceptedChangeIds: ["change/1"],
    });
  });
});
