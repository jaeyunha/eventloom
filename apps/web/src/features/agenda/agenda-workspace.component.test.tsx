import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  AGENDA_VIEW_MODES,
  AgendaBoard,
  type AgendaBusyOperation,
  AgendaSuggestionPanel,
  type AgendaSuggestionRunView,
  type AgendaViewMode,
  AgendaWorkspace,
  agendaWorkspaceDataMatchesEvent,
  agendaWorkspaceScopeKey,
  canCommitAgendaAsyncCompletion,
  deriveAgendaViewGroups,
  isAgendaAsyncScopeTokenCurrent,
  serializeAgendaSuggestionOptions,
} from "./agenda-workspace";
import type { AgendaPreview, AgendaWorkspaceData } from "./types";

const workspaceStyles = readFileSync(
  fileURLToPath(new URL("./agenda-workspace.module.css", import.meta.url)),
  "utf8",
);
const workspaceSource = readFileSync(
  fileURLToPath(new URL("./agenda-workspace.tsx", import.meta.url)),
  "utf8",
);

const data: AgendaWorkspaceData = {
  event: {
    id: "evt_open",
    name: "Open Systems Summit",
    timeZone: "America/Los_Angeles",
    startsOn: "2026-09-18",
    endsOn: "2026-09-19",
  },
  draft: {
    version: 7,
    updatedAt: "2026-08-08T12:00:00.000Z",
    updatedBy: "Avery Kim",
    entries: [
      {
        id: "entry_keynote",
        sessionId: "session_keynote",
        title: "Systems that stay understandable",
        format: "Keynote",
        speakerNames: ["Morgan Lee"],
        roomId: "room_main",
        roomName: "Main hall",
        trackIds: ["track_main"],
        trackNames: ["Main stage"],
        startsAtLocal: "2026-09-18T09:00",
        endsAtLocal: "2026-09-18T09:45",
      },
    ],
  },
  rooms: [{ id: "room_main", name: "Main hall", capacity: 500 }],
  tracks: [{ id: "track_main", name: "Main stage", color: "#4f5ee8" }],
  unscheduledSessions: [
    {
      id: "session_workshop",
      title: "Practical review systems",
      format: "Workshop",
      durationMinutes: 60,
      speakerNames: ["Sam Rivera"],
      capacityRequired: 40,
    },
  ],
  revisions: [
    {
      id: "revision_2",
      number: 2,
      publishedAt: "2026-08-07T12:00:00.000Z",
      publishedBy: "Avery Kim",
      sessionCount: 1,
      current: true,
    },
  ],
  currentPublishedRevision: {
    id: "revision_2",
    number: 2,
    publishedAt: "2026-08-07T12:00:00.000Z",
    publishedBy: "Avery Kim",
    sessionCount: 1,
    current: true,
  },
};
const baseEntry = data.draft.entries[0];
if (!baseEntry) throw new Error("Expected fixture entry.");

const preview: AgendaPreview = {
  draftVersion: 7,
  conflicts: [
    {
      id: "conflict_room",
      kind: "room",
      entryIds: ["entry_keynote"],
      message: "Main hall already has a session at this time.",
    },
  ],
  releaseConflicts: [],
  warnings: [],
  diff: { added: 0, changed: 1, removed: 0 },
  validatedAt: "2026-08-08T12:01:00.000Z",
};
const suggestionRun: AgendaSuggestionRunView = {
  id: "suggestion_1",
  version: 1,
  status: "pending",
  baseDraftVersion: 7,
  diff: {
    summary: "1 proposed agenda change: Move Systems that stay understandable",
    changes: [
      {
        id: "move:entry_keynote",
        kind: "move",
        entryId: "entry_keynote",
        sessionId: "session_keynote",
        summary: "Move Systems that stay understandable to Main hall at 10:00–10:45",
      },
    ],
  },
  candidateDiagnostics: {
    conflicts: [
      {
        id: "conflict_room",
        kind: "room",
        entryIds: ["entry_keynote"],
        message: "The proposed placement overlaps an existing session.",
      },
    ],
    warnings: [],
  },
  acceptedChangeIds: [],
};
const actionableSuggestionChange = suggestionRun.diff.changes[0];
if (!actionableSuggestionChange) throw new Error("Expected a suggestion change.");
const actionableSuggestionRun: AgendaSuggestionRunView = {
  ...suggestionRun,
  diff: {
    ...suggestionRun.diff,
    changes: [
      {
        ...actionableSuggestionChange,
        kind: "add",
        entryId: "entry_workshop",
        sessionId: "session_workshop",
        summary: "Add Practical review systems to Main hall at 10:00–11:00",
      },
    ],
  },
  candidateDiagnostics: { conflicts: [], warnings: [] },
};

const noEligibleSuggestionData: AgendaWorkspaceData = {
  ...data,
  unscheduledSessions: [],
};

const actions = {
  onSaveEntry: vi.fn(async () => undefined),
  onRemoveEntry: vi.fn(async () => undefined),
  onPreview: vi.fn(async () => undefined),
  onOverrideWarning: vi.fn(async () => undefined),
  onPublish: vi.fn(async () => undefined),
  onDismissError: vi.fn(),
};
const multiDayData: AgendaWorkspaceData = {
  ...data,
  event: {
    ...data.event,
    startsOn: "2026-09-18",
    endsOn: "2026-09-19",
    timeZone: "America/Los_Angeles",
  },
  draft: {
    ...data.draft,
    entries: [
      {
        ...baseEntry,
        id: "entry_keynote",
        roomId: "room_main",
        roomName: "Main hall",
        trackIds: ["track_main"],
        trackNames: ["Main stage"],
        startsAtLocal: "2026-09-18T09:00",
        endsAtLocal: "2026-09-18T09:45",
      },
      {
        ...baseEntry,
        id: "entry_earlier",
        title: "Earlier workshop",
        roomId: "room_breakout",
        roomName: "Breakout room",
        trackIds: ["track_audience"],
        trackNames: ["Audience"],
        startsAtLocal: "2026-09-18T08:00",
        endsAtLocal: "2026-09-18T08:45",
      },
      {
        ...baseEntry,
        id: "entry_later",
        title: "Later workshop",
        roomId: "room_main",
        roomName: "Main hall",
        trackIds: ["track_main", "track_audience"],
        trackNames: ["Main stage", "Audience"],
        startsAtLocal: "2026-09-19T11:00",
        endsAtLocal: "2026-09-19T12:00",
      },
    ],
  },
  rooms: [
    ...data.rooms,
    { id: "room_breakout", name: "Breakout room", capacity: 80 },
    { id: "room_empty", name: "Empty room", capacity: 20 },
  ],
  tracks: [
    ...data.tracks,
    { id: "track_audience", name: "Audience", color: "#16a085" },
    { id: "track_empty", name: "Empty track", color: "#999999" },
  ],
};
const emptyDayData: AgendaWorkspaceData = {
  ...multiDayData,
  event: {
    ...multiDayData.event,
    startsOn: "2026-09-18",
    endsOn: "2026-09-20",
  },
  draft: {
    ...multiDayData.draft,
    entries: multiDayData.draft.entries.filter((entry) => entry.id === "entry_later"),
  },
};

function renderBoard(
  boardData: AgendaWorkspaceData = data,
  initialView?: AgendaViewMode,
  boardPreview: AgendaPreview | null = preview,
  boardBusy = false,
  boardBusyOperation?: AgendaBusyOperation,
  boardError: string | null = null,
) {
  return renderToStaticMarkup(
    createElement(AgendaBoard, {
      ...actions,
      organizationId: "organization-1",
      data: boardData,
      preview: boardPreview,
      busy: boardBusy,
      ...(boardBusyOperation === undefined ? {} : { busyOperation: boardBusyOperation }),
      statusMessage: null,
      error: boardError,
      ...(initialView ? { initialView } : {}),
    }),
  );
}

describe("agenda organizer workspace", () => {
  it("invalidates stale, aborted, and unmounted deferred work", async () => {
    const scopeA = agendaWorkspaceScopeKey("organization-1", "event-a");
    const scopeB = agendaWorkspaceScopeKey("organization-1", "event-b");
    const workspaceA = AgendaWorkspace({
      organizationId: "organization-1",
      eventId: "event-a",
    });
    const workspaceB = AgendaWorkspace({
      organizationId: "organization-1",
      eventId: "event-b",
    });
    const token = { scopeKey: scopeA, generation: 1 };
    let currentScope = scopeA;
    let currentGeneration = 1;
    let commit: string | null = null;
    let resolveDeferred: ((value: string) => void) | undefined;
    const deferred = new Promise<string>((resolve) => {
      resolveDeferred = resolve;
    });
    const completion = deferred.then((value) => {
      if (canCommitAgendaAsyncCompletion(token, currentScope, currentGeneration, true)) {
        commit = value;
      }
    });

    currentScope = scopeB;
    currentGeneration += 1;
    resolveDeferred?.("event-a");
    await completion;

    expect(scopeA).not.toBe(scopeB);
    expect(workspaceA.key).toBe(scopeA);
    expect(workspaceB.key).toBe(scopeB);
    expect(commit).toBeNull();
    expect(isAgendaAsyncScopeTokenCurrent(token, currentScope, currentGeneration)).toBe(false);
    expect(canCommitAgendaAsyncCompletion(token, scopeA, 1, true)).toBe(true);
    expect(canCommitAgendaAsyncCompletion(token, scopeA, 1, false)).toBe(false);
    expect(canCommitAgendaAsyncCompletion(token, scopeA, 1, true, true)).toBe(false);
    expect(agendaWorkspaceDataMatchesEvent(data, data.event.id)).toBe(true);
    expect(agendaWorkspaceDataMatchesEvent(data, "event-b")).toBe(false);
  });
  it("presents private draft context and structured conflicts", () => {
    const markup = renderToStaticMarkup(
      createElement(AgendaBoard, {
        ...actions,
        organizationId: "organization-1",
        data,
        preview,
        busy: false,
        statusMessage: null,
        error: null,
      }),
    );

    expect(markup).toContain("Agenda workspace");
    expect(markup).toContain("Draft v7");
    expect(markup).toContain("private draft");
    expect(markup).toContain("1 hard conflict");
    expect(markup).toContain("Main hall already has a session at this time.");
    expect(markup).toContain("Hard conflict:");
  });
  it("links the agenda back to the organization-scoped event overview", () => {
    const markup = renderBoard();

    expect(markup).toContain('href="/admin/organizations/organization-1/events/evt_open"');
    expect(markup).not.toContain('href="/admin/events/evt_open"');
  });

  it("exposes accessible scheduling and disabled publication controls", () => {
    const markup = renderToStaticMarkup(
      createElement(AgendaBoard, {
        ...actions,
        organizationId: "organization-1",
        data,
        preview,
        busy: false,
        statusMessage: null,
        error: null,
      }),
    );

    expect(markup).toContain('href="#agenda-content"');
    expect(markup).toContain('aria-label="Agenda validation and publication"');
    expect(markup).toContain("Times are shown in America/Los_Angeles");
    expect(markup).toContain("Suggestions");
    expect(markup).toContain("Suggestions remain optional and private.");
    expect(markup).toContain("Publish agenda");
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Publish agenda<\/button>/);
  });
  it("routes organizers to durable room settings before scheduling without a room", () => {
    const markup = renderBoard({ ...data, rooms: [] }, undefined, null);

    expect(markup).toContain('href="/admin/organizations/organization-1/events/evt_open/settings"');
    expect(markup).toContain("Scheduling is unavailable until you create a room.");
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Add accepted session<\/button>/);
    expect(markup).not.toContain("Generate private suggestions");
  });
  it("keeps suggestion configuration collapsed until an organizer requests it", () => {
    const markup = renderToStaticMarkup(
      createElement(AgendaSuggestionPanel, {
        run: null,
        currentDraftVersion: data.draft.version,
        busy: false,
        busyOperation: null,
        eligibleUnscheduledCount: data.unscheduledSessions.length,
        selectedChangeIds: [],
        onSelectionChange: vi.fn(),
        onGenerate: vi.fn(async () => undefined),
        onRegenerate: undefined,
        onReject: undefined,
        onApply: undefined,
      }),
    );

    expect(markup).toContain("Optional advisory");
    expect(markup).toContain("Configure suggestions");
    expect(markup).toContain('data-state="closed"');
    expect(markup).not.toContain("Existing session times");
    expect(serializeAgendaSuggestionOptions("keep", false)).toEqual({
      ignoreExistingTimes: false,
      ignoreExistingRooms: false,
    });
    expect(serializeAgendaSuggestionOptions("move", false)).toEqual({
      ignoreExistingTimes: true,
      ignoreExistingRooms: false,
    });
    expect(serializeAgendaSuggestionOptions("keep", true)).toEqual({
      ignoreExistingTimes: false,
      ignoreExistingRooms: true,
    });
    expect(workspaceSource).toContain("Existing session times");
    expect(workspaceSource).toContain("Keep scheduled sessions fixed");
    expect(workspaceSource).toContain("serializeAgendaSuggestionOptions(");
    expect(workspaceStyles).toMatch(/\.scheduleOptionSelected/u);
    expect(workspaceStyles).toMatch(/input:focus-visible/u);
    expect(workspaceStyles).toMatch(/input:disabled/u);
    expect(workspaceStyles).toMatch(/aria-invalid/u);
  });
  it("renders the unavailable suggestion capability without a clickable generator", () => {
    const markup = renderToStaticMarkup(
      createElement(AgendaSuggestionPanel, {
        run: null,
        currentDraftVersion: data.draft.version,
        busy: false,
        busyOperation: null,
        eligibleUnscheduledCount: data.unscheduledSessions.length,
        selectedChangeIds: [],
        onSelectionChange: vi.fn(),
        onGenerate: undefined,
        onRegenerate: undefined,
        onReject: undefined,
        onApply: undefined,
      }),
    );

    expect(markup).toContain("Configure suggestions");
    expect(markup).not.toContain("Generate private suggestions");
    expect(workspaceSource).toContain(
      "Suggestion generation is unavailable until an approved provider is connected.",
    );
  });
  it("keeps organizer actions below sticky chrome and preserves draft context after a failed request", () => {
    const markup = renderBoard(data, undefined, preview, true, "validate", "Validation failed.");
    expect(markup).toContain("Agenda request failed");
    expect(markup).toContain("authoritative private draft remains visible as Draft v7");
    expect(markup).toContain("Checking...");
    expect(markup).toContain("Publish agenda");
    expect(markup).not.toContain("Publishing...");
    expect(markup).toMatch(/actionRail/u);
    expect(workspaceStyles).toMatch(/\.actionRail[\s\S]*position:\s*sticky/u);
    expect(workspaceStyles).toMatch(/\.actionRail[\s\S]*scroll-padding/u);
    expect(workspaceSource).toContain("endOperation(token)");
    expect(workspaceSource).toContain("expectedVersion: current.draft.version");
    expect(workspaceSource).toContain("acceptedChangeIds: changeIds");
    expect(workspaceSource).toContain("key={scopeKey}");
    expect(workspaceSource).toContain("agendaWorkspaceDataMatchesEvent(nextData, eventId)");
  });

  it("renders an honest empty state when no eligible sessions are available for suggestions", () => {
    const markup = renderToStaticMarkup(
      createElement(AgendaBoard, {
        ...actions,
        organizationId: "organization-1",
        data: noEligibleSuggestionData,
        preview: null,
        busy: false,
        statusMessage: null,
        error: null,
        onGenerateSuggestion: vi.fn(async () => undefined),
      }),
    );
    expect(markup).toContain("Configure suggestions");
    expect(markup).not.toContain("Generate private suggestions");
    expect(workspaceSource).toContain("No eligible unscheduled sessions");
    expect(workspaceSource).toContain(
      "No eligible unscheduled accepted sessions are currently available.",
    );
  });

  it("enables apply after a human selects a conflict-free proposal", () => {
    const changeId = actionableSuggestionRun.diff.changes[0]?.id;
    if (!changeId) throw new Error("Expected an actionable suggestion change.");
    const markup = renderToStaticMarkup(
      createElement(AgendaSuggestionPanel, {
        run: actionableSuggestionRun,
        currentDraftVersion: data.draft.version,
        busy: false,
        busyOperation: null,
        eligibleUnscheduledCount: data.unscheduledSessions.length,
        selectedChangeIds: [changeId],
        onSelectionChange: vi.fn(),
        onGenerate: vi.fn(async () => undefined),
        onRegenerate: vi.fn(async () => undefined),
        onReject: vi.fn(async () => undefined),
        onApply: vi.fn(async () => undefined),
      }),
    );
    expect(markup).toContain("Choose changes for human application");
    expect(markup).toContain('type="checkbox"');
    expect(markup).toMatch(/<button[^>]*>Apply selected changes<\/button>/u);
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>Apply selected changes<\/button>/u);
  });
  it("shows the accepted-session pool with explicit session metadata in the default day view", () => {
    const markup = renderBoard(multiDayData);
    expect(markup).toContain("Unscheduled accepted sessions");
    expect(markup).toContain("Practical review systems");
    expect(markup).toContain("Workshop");
    expect(markup).toContain("Sam Rivera");
    expect(markup).toContain("Add accepted session");
  });
  it("navigates every event day, including empty days, without crossing event boundaries", () => {
    const groups = deriveAgendaViewGroups(emptyDayData, "day");
    expect(groups.map((group) => group.id)).toEqual(["2026-09-18", "2026-09-19", "2026-09-20"]);
    expect(groups[0]?.entries).toEqual([]);
    expect(groups[2]?.entries).toEqual([]);

    const firstDayMarkup = renderBoard(emptyDayData);
    expect(firstDayMarkup).toContain('aria-label="Event day navigation"');
    expect(firstDayMarkup).toMatch(/<button[^>]*disabled=""[^>]*>Previous day<\/button>/u);
    expect(firstDayMarkup).toMatch(/<button[^>]*>Next day<\/button>/u);
    expect(firstDayMarkup).toContain("No sessions scheduled on this day.");

    const lastDayMarkup = renderBoard({
      ...emptyDayData,
      event: {
        ...emptyDayData.event,
        startsOn: "2026-09-20",
        endsOn: "2026-09-20",
      },
    });
    expect(lastDayMarkup).toMatch(/<button[^>]*disabled=""[^>]*>Previous day<\/button>/u);
    expect(lastDayMarkup).toMatch(/<button[^>]*disabled=""[^>]*>Next day<\/button>/u);
  });
  it("keeps advisory suggestions private and blocks applying hard-conflicting candidates", () => {
    const markup = renderToStaticMarkup(
      createElement(AgendaBoard, {
        ...actions,
        organizationId: "organization-1",
        data,
        preview,
        suggestionRun,
        onGenerateSuggestion: vi.fn(async () => undefined),
        onRegenerateSuggestion: vi.fn(async () => undefined),
        onRejectSuggestion: vi.fn(async () => undefined),
        onApplySuggestion: vi.fn(async () => undefined),
        busy: false,
        statusMessage: null,
        error: null,
      }),
    );

    expect(markup).toContain("Suggestions");
    expect(markup).toContain("never change this draft or publish anything");
    expect(markup).toContain("Choose changes for human application");
    expect(markup).toContain("hard blocker");
    expect(markup).toContain("They cannot be overridden by AI.");
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Apply selected changes<\/button>/);
  });
  it("exposes all five accessible schedule tabs with Day selected by default", () => {
    const markup = renderBoard(multiDayData);
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-labelledby="agenda-view-label"');
    for (const mode of AGENDA_VIEW_MODES) {
      expect(markup).toContain(`id="agenda-view-${mode}"`);
      expect(markup).toContain('role="tab"');
      expect(markup).toContain('aria-controls="agenda-view-panel"');
    }
    expect(markup).toMatch(/id="agenda-view-day"[^>]*aria-selected="true"/);
    expect(markup).toMatch(/id="agenda-view-list"[^>]*aria-selected="false"/);
    expect(markup).toContain("Schedule view");
  });

  it("derives chronological, timezone-local, and deterministic grouped views", () => {
    const list = deriveAgendaViewGroups(multiDayData, "list")[0];
    if (!list) throw new Error("Expected list view group.");
    expect(list.entries.map((entry) => entry.id)).toEqual([
      "entry_earlier",
      "entry_keynote",
      "entry_later",
    ]);

    const week = deriveAgendaViewGroups(multiDayData, "week");
    expect(week.map((group) => group.label)).toEqual([
      "Friday, September 18",
      "Saturday, September 19",
    ]);
    expect(week.map((group) => group.entries.map((entry) => entry.id))).toEqual([
      ["entry_earlier", "entry_keynote"],
      ["entry_later"],
    ]);

    const tracks = deriveAgendaViewGroups(multiDayData, "track");
    expect(tracks.map((group) => group.label)).toEqual(["Audience", "Empty track", "Main stage"]);
    expect(tracks[1]?.entries).toHaveLength(0);

    const rooms = deriveAgendaViewGroups(multiDayData, "room");
    expect(rooms.map((group) => group.label)).toEqual(["Breakout room", "Empty room", "Main hall"]);
    expect(rooms[1]?.entries).toHaveLength(0);
  });

  it("keeps conflict and edit controls available in every rendered mode without mutating the draft", () => {
    const before = JSON.stringify(multiDayData.draft.entries);
    for (const mode of AGENDA_VIEW_MODES) {
      const markup = renderBoard(multiDayData, mode);
      expect(markup).toContain("Edit");
      expect(markup).toContain("Hard conflict:");
      expect(markup).toContain(`id="agenda-view-${mode}"`);
      expect(markup).toMatch(new RegExp(`id="agenda-view-${mode}"[^>]*aria-selected="true"`));
    }
    expect(JSON.stringify(multiDayData.draft.entries)).toBe(before);
  });

  it("renders deterministic empty and unscheduled states for Track and Room views", () => {
    const trackMarkup = renderBoard(multiDayData, "track", null);
    expect(trackMarkup).toContain("Empty track");
    expect(trackMarkup).toContain("No sessions scheduled in this track.");
    expect(trackMarkup).toContain("Unscheduled accepted sessions");
    expect(trackMarkup).toContain("Practical review systems");

    const roomMarkup = renderBoard(multiDayData, "room", null);
    expect(roomMarkup).toContain("Empty room");
    expect(roomMarkup).toContain("No sessions scheduled in this room.");
    expect(roomMarkup).toContain("Unscheduled accepted sessions");
  });
});
