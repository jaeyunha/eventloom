import { describe, expect, it } from "vitest";
import {
  acceptedSessionCount,
  agendaDays,
  eventDates,
  eventScheduleDates,
  publicationReadiness,
  resolveAgendaPlacementDate,
} from "./model";
import type { AgendaPreview, AgendaWorkspaceData } from "./types";

const data: AgendaWorkspaceData = {
  event: {
    id: "evt_open",
    name: "Open Systems Summit",
    timeZone: "America/Los_Angeles",
    startsOn: "2026-09-18",
    endsOn: "2026-09-19",
  },
  draft: {
    version: 4,
    updatedAt: "2026-08-08T12:00:00.000Z",
    updatedBy: "Avery",
    entries: [
      {
        id: "entry_later",
        sessionId: "session_later",
        title: "Building in public",
        format: "Talk",
        speakerNames: ["Avery Kim"],
        roomId: "room_main",
        roomName: "Main hall",
        trackIds: ["track_build"],
        trackNames: ["Build"],
        startsAtLocal: "2026-09-19T10:00",
        endsAtLocal: "2026-09-19T10:45",
      },
      {
        id: "entry_early",
        sessionId: "session_early",
        title: "Opening keynote",
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
  validation: null,
  rooms: [],
  tracks: [],
  acceptedSessionIds: ["session_early", "session_later"],
  unscheduledSessions: [],
  revisions: [],
  currentPublishedRevision: null,
};

const validatedData: AgendaWorkspaceData = {
  ...data,
  validation: {
    draftVersion: data.draft.version,
    validatedAt: "2026-08-08T12:01:00.000Z",
  },
};

function preview(overrides: Partial<AgendaPreview> = {}): AgendaPreview {
  return {
    draftVersion: 4,
    conflicts: [],
    releaseConflicts: [],
    warnings: [],
    diff: { added: 2, changed: 0, removed: 0 },
    validatedAt: "2026-08-08T12:01:00.000Z",
    ...overrides,
  };
}

describe("agenda workspace model", () => {
  it("uses the selected event day as the placement context", () => {
    expect(resolveAgendaPlacementDate("2026-09-19", "2026-09-18")).toBe("2026-09-19");
    expect(resolveAgendaPlacementDate("", "2026-09-18")).toBe("2026-09-18");
  });

  it("counts unique authoritative accepted session IDs", () => {
    expect(acceptedSessionCount(data)).toBe(2);
    expect(
      acceptedSessionCount({
        acceptedSessionIds: ["session_early", "session_early"],
      }),
    ).toBe(1);
  });

  it("reports zero accepted sessions when nothing is scheduled or queued", () => {
    expect(acceptedSessionCount({ acceptedSessionIds: [] })).toBe(0);
  });

  it("does not count retained scheduled entries that are no longer accepted", () => {
    const staleSchedule = {
      ...data,
      acceptedSessionIds: [],
    };

    expect(acceptedSessionCount(staleSchedule)).toBe(0);
  });

  it("groups and orders draft entries by local event day", () => {
    const days = agendaDays(data.draft.entries);

    expect(days.map((day) => day.date)).toEqual(["2026-09-18", "2026-09-19"]);
    expect(days[0]?.label).toBe("Friday, September 18");
    expect(days[0]?.entries[0]?.title).toBe("Opening keynote");
  });
  it("uses sparse authoritative schedule dates without inventing intervening days", () => {
    const days = agendaDays([], {
      startsOn: "2026-09-18",
      endsOn: "2026-09-20",
      scheduleDates: ["2026-09-18", "2026-09-20"],
    });

    expect(days.map((day) => day.date)).toEqual(["2026-09-18", "2026-09-20"]);
  });

  it("uses authoritative sparse dates for assisted placement criteria", () => {
    expect(
      eventScheduleDates({
        startsOn: "2026-09-18",
        endsOn: "2026-09-20",
        scheduleDates: ["2026-09-18", "2026-09-20"],
      }),
    ).toEqual(["2026-09-18", "2026-09-20"]);
    expect(
      eventScheduleDates({
        startsOn: "2026-09-18",
        endsOn: "2026-09-20",
      }),
    ).toEqual(["2026-09-18", "2026-09-19", "2026-09-20"]);
  });

  it("uses the authoritative event range for empty days and excludes out-of-range draft dates", () => {
    const outsideEntry = data.draft.entries[0];
    if (!outsideEntry) throw new Error("Expected fixture entry.");
    const days = agendaDays(
      [
        ...data.draft.entries,
        {
          ...outsideEntry,
          id: "entry_outside_event",
          startsAtLocal: "2026-09-21T10:00",
          endsAtLocal: "2026-09-21T10:45",
        },
      ],
      {
        startsOn: "2026-09-17",
        endsOn: "2026-09-20",
      },
    );

    expect(days.map((day) => day.date)).toEqual([
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);
    expect(days[0]?.entries).toEqual([]);
    expect(days[1]?.entries[0]?.title).toBe("Opening keynote");
    expect(days[3]?.entries).toEqual([]);
    expect(eventDates("2026-09-19", "2026-09-18")).toEqual([]);
  });

  it("requires validation of the exact current draft", () => {
    expect(publicationReadiness(data, preview()).ready).toBe(false);
    expect(publicationReadiness(validatedData, preview()).ready).toBe(true);
    expect(publicationReadiness(validatedData, preview({ draftVersion: 3 }))).toEqual({
      ready: false,
      reasons: ["Validate the current draft before publishing."],
    });
  });

  it("blocks publication for hard conflicts and unoverridden warnings", () => {
    const readiness = publicationReadiness(
      validatedData,
      preview({
        conflicts: [
          {
            id: "conflict_room",
            kind: "room",
            entryIds: ["entry_early"],
            message: "Main hall already has a session at this time.",
          },
        ],
        warnings: [
          {
            id: "warning_capacity",
            kind: "capacity",
            entryIds: ["entry_early"],
            message: "Expected attendance exceeds room capacity.",
            overridden: false,
          },
        ],
      }),
    );

    expect(readiness.ready).toBe(false);
    expect(readiness.reasons).toEqual([
      "Resolve 1 hard conflict.",
      "Resolve or override 1 warning.",
    ]);
  });
});
