import { describe, expect, it } from "vitest";
import { AgendaApiError } from "../api";
import {
  createAgendaDemoApi,
  createLocalAgendaDemoApi,
  isAgendaUnavailable,
  loadAgendaWorkspace,
  resolveAgendaAppEnvironment,
} from "./agenda-demo-api";

describe("local agenda demo API", () => {
  it("starts with useful deterministic data and versions draft mutations", async () => {
    const api = createAgendaDemoApi("evt_demo");
    const initial = await api.getWorkspace("evt_demo");

    expect(initial).toMatchObject({
      event: { id: "evt_demo", name: "Open Systems Summit 2026" },
      draft: { version: 3 },
    });
    expect(initial.draft.entries).toHaveLength(2);
    expect(initial.rooms).toHaveLength(2);
    expect(initial.unscheduledSessions.map((session) => session.id)).toEqual(["session_review"]);

    const saved = await api.saveEntry({
      eventId: "evt_demo",
      expectedVersion: initial.draft.version,
      entry: {
        sessionId: "session_review",
        roomId: "room_main",
        trackIds: ["track_practice"],
        startsAtLocal: "2026-09-18T11:00",
        endsAtLocal: "2026-09-18T12:00",
      },
    });

    expect(saved.draft.version).toBe(4);
    expect(saved.draft.updatedAt).toBe("2026-08-08T12:01:00.000Z");
    expect(saved.draft.entries.at(-1)).toMatchObject({
      id: "entry_session_review",
      title: "Practical review systems",
      roomName: "Main hall",
    });
    expect(saved.unscheduledSessions).toEqual([]);

    await expect(
      api.saveEntry({
        eventId: "evt_demo",
        expectedVersion: 3,
        entry: {
          sessionId: "session_review",
          roomId: "room_main",
          trackIds: ["track_practice"],
          startsAtLocal: "2026-09-18T12:00",
          endsAtLocal: "2026-09-18T13:00",
        },
      }),
    ).rejects.toMatchObject({ code: "AGENDA_VERSION_CONFLICT", status: 409 });
  });
  it("keeps suggestion generation private until a human applies selected changes", async () => {
    const input = {
      eventId: "evt_demo",
      baseDraftVersion: 3,
      dates: ["2026-09-18"],
      eligibleStatuses: ["accepted"],
      roomIds: ["room_main", "room_studio"],
      dayWindows: [{ date: "2026-09-18", startLocal: "09:00", endLocal: "17:00" }],
      orderedRules: [],
      ignoreExistingTimes: false,
      ignoreExistingRooms: false,
    } as const;
    const api = createAgendaDemoApi("evt_demo");
    const initial = await api.getWorkspace("evt_demo");
    const generated = await api.generateSuggestion(input);

    expect(generated).toMatchObject({
      id: "suggestion_1",
      version: 1,
      status: "pending",
      baseDraftVersion: 3,
      acceptedChangeIds: [],
      candidateDiagnostics: {
        conflicts: [],
        warnings: [expect.objectContaining({ kind: "capacity" })],
      },
    });
    expect(generated.diff.changes).toHaveLength(1);
    expect((await api.getWorkspace("evt_demo")).draft).toEqual(initial.draft);
    await expect(api.getSuggestion({ eventId: "evt_demo", runId: generated.id })).resolves.toEqual(
      generated,
    );

    const secondApi = createAgendaDemoApi("evt_demo");
    await expect(secondApi.generateSuggestion(input)).resolves.toEqual(generated);

    const regenerated = await api.regenerateSuggestion({
      eventId: "evt_demo",
      runId: generated.id,
      baseDraftVersion: 3,
    });
    expect(regenerated).toMatchObject({
      id: "suggestion_2",
      version: 2,
      status: "pending",
      baseDraftVersion: 3,
    });
    await expect(
      api.getSuggestion({ eventId: "evt_demo", runId: generated.id }),
    ).resolves.toMatchObject({ status: "superseded" });

    const rejected = await api.rejectSuggestion({ eventId: "evt_demo", runId: regenerated.id });
    expect(rejected).toMatchObject({ status: "rejected", acceptedChangeIds: [] });
    await expect(
      api.applySuggestion({
        eventId: "evt_demo",
        runId: regenerated.id,
        acceptedChangeIds: [regenerated.diff.changes[0]?.id ?? ""],
      }),
    ).rejects.toMatchObject({ code: "SUGGESTION_STATE_INVALID", status: 409 });
    expect((await api.getWorkspace("evt_demo")).draft).toEqual(initial.draft);
    const freshRun = await api.generateSuggestion(input);
    const changeId = freshRun.diff.changes[0]?.id;
    if (!changeId) throw new Error("Expected a deterministic suggestion change.");
    const applied = await api.applySuggestion({
      eventId: "evt_demo",
      runId: freshRun.id,
      acceptedChangeIds: [changeId],
    });
    expect(applied.draft).toMatchObject({ version: 4 });
    expect(applied.draft.entries).toHaveLength(3);
    expect(applied.unscheduledSessions).toEqual([]);
    expect(applied.currentPublishedRevision).toMatchObject({ sessionCount: 1 });
    await expect(
      api.getSuggestion({ eventId: "evt_demo", runId: freshRun.id }),
    ).resolves.toMatchObject({
      status: "applied",
      acceptedChangeIds: [changeId],
    });
  });

  it("detects room conflicts and publishes an immutable revision after they are resolved", async () => {
    const api = createAgendaDemoApi("evt_demo");
    const initial = await api.getWorkspace("evt_demo");
    const conflicted = await api.saveEntry({
      eventId: "evt_demo",
      expectedVersion: initial.draft.version,
      entry: {
        sessionId: "session_review",
        roomId: "room_main",
        trackIds: ["track_practice"],
        startsAtLocal: "2026-09-18T09:15",
        endsAtLocal: "2026-09-18T10:15",
      },
    });
    const conflictPreview = await api.preview("evt_demo");

    expect(conflictPreview.conflicts).toEqual([
      expect.objectContaining({
        kind: "room",
        entryIds: ["entry_keynote", "entry_session_review"],
      }),
    ]);
    await expect(
      api.publish({ eventId: "evt_demo", expectedVersion: conflicted.draft.version }),
    ).rejects.toMatchObject({
      code: "PUBLICATION_BLOCKED",
      details: { conflicts: [expect.objectContaining({ kind: "room" })] },
    });

    const resolved = await api.saveEntry({
      eventId: "evt_demo",
      expectedVersion: conflicted.draft.version,
      entry: {
        id: "entry_session_review",
        sessionId: "session_review",
        roomId: "room_main",
        trackIds: ["track_practice"],
        startsAtLocal: "2026-09-18T11:00",
        endsAtLocal: "2026-09-18T12:00",
      },
    });
    expect(await api.preview("evt_demo")).toMatchObject({
      draftVersion: resolved.draft.version,
      conflicts: [],
      warnings: [],
      releaseConflicts: [],
      diff: { added: 2, changed: 0, removed: 0 },
    });

    const published = await api.publish({
      eventId: "evt_demo",
      expectedVersion: resolved.draft.version,
    });
    expect(published.draft.version).toBe(resolved.draft.version + 1);
    expect(published.currentPublishedRevision).toMatchObject({
      number: 2,
      sessionCount: 3,
      current: true,
    });
    expect(published.revisions).toHaveLength(2);
  });

  it("requires capacity warnings to be explicitly overridden before publication", async () => {
    const api = createAgendaDemoApi("evt_demo");
    const initial = await api.getWorkspace("evt_demo");
    const saved = await api.saveEntry({
      eventId: "evt_demo",
      expectedVersion: initial.draft.version,
      entry: {
        sessionId: "session_review",
        roomId: "room_studio",
        trackIds: ["track_practice"],
        startsAtLocal: "2026-09-18T11:00",
        endsAtLocal: "2026-09-18T12:00",
      },
    });
    const warning = (await api.preview("evt_demo")).warnings[0];

    expect(warning).toMatchObject({ kind: "capacity", overridden: false });
    const overridden = await api.overrideWarning({
      eventId: "evt_demo",
      expectedVersion: saved.draft.version,
      warningId: warning?.id ?? "",
      reason: "The workshop has a separate registration cap.",
    });
    expect(await api.preview("evt_demo")).toMatchObject({
      draftVersion: overridden.draft.version,
      warnings: [
        expect.objectContaining({
          overridden: true,
          overrideReason: "The workshop has a separate registration cap.",
        }),
      ],
    });

    await expect(
      api.publish({ eventId: "evt_demo", expectedVersion: overridden.draft.version }),
    ).resolves.toMatchObject({ currentPublishedRevision: { number: 2 } });
  });
});

describe("agenda local fallback", () => {
  it("is created only for APP_ENV=local", () => {
    expect(createLocalAgendaDemoApi("production", "evt_demo")).toBeNull();
    expect(createLocalAgendaDemoApi(undefined, "evt_demo")).toBeNull();
    expect(createLocalAgendaDemoApi("local", "evt_demo")).not.toBeNull();
  });

  it("reads APP_ENV from web health when it is not injected", async () => {
    let healthRequests = 0;
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      healthRequests += 1;
      expect(input).toBe("/health");
      expect(init).toMatchObject({
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      return Response.json({ status: "ok", environment: "local" });
    };

    await expect(resolveAgendaAppEnvironment(undefined, undefined, fetcher)).resolves.toBe("local");
    await expect(resolveAgendaAppEnvironment("production", undefined, fetcher)).resolves.toBe(
      "production",
    );
    expect(healthRequests).toBe(1);
  });

  it("uses local data only when the primary API returns not-found or unavailable", async () => {
    const local = createAgendaDemoApi("evt_demo");
    const unavailable = new AgendaApiError("DEPENDENCY_UNAVAILABLE", "Agenda unavailable", 503);
    const primary = {
      ...createAgendaDemoApi("evt_demo"),
      getWorkspace: async () => {
        throw unavailable;
      },
    };
    let fallbackResolutions = 0;
    const resolveFallback = async () => {
      fallbackResolutions += 1;
      return local;
    };

    await expect(loadAgendaWorkspace(primary, resolveFallback, "evt_demo")).resolves.toMatchObject({
      api: local,
      usingLocalDemo: true,
      data: { event: { id: "evt_demo" } },
    });
    expect(fallbackResolutions).toBe(1);

    const availablePrimary = createAgendaDemoApi("evt_demo");
    await expect(
      loadAgendaWorkspace(availablePrimary, resolveFallback, "evt_demo"),
    ).resolves.toMatchObject({ api: availablePrimary, usingLocalDemo: false });
    expect(fallbackResolutions).toBe(1);
    expect(isAgendaUnavailable(new AgendaApiError("NOT_FOUND", "Missing", 404))).toBe(true);
    expect(isAgendaUnavailable(new AgendaApiError("BAD_GATEWAY", "Unavailable", 502))).toBe(true);
  });

  it("does not hide authentication, server, or production failures", async () => {
    const local = createAgendaDemoApi("evt_demo");
    for (const status of [401, 403, 409, 500]) {
      const failure = new AgendaApiError("AGENDA_REQUEST_FAILED", "Request failed", status);
      const primary = {
        ...createAgendaDemoApi("evt_demo"),
        getWorkspace: async () => {
          throw failure;
        },
      };

      await expect(loadAgendaWorkspace(primary, local, "evt_demo")).rejects.toBe(failure);
      expect(isAgendaUnavailable(failure)).toBe(false);
    }

    const productionApi = createAgendaDemoApi("evt_demo");
    await expect(loadAgendaWorkspace(productionApi, null, "different-event")).rejects.toMatchObject(
      { status: 404 },
    );
  });
});
