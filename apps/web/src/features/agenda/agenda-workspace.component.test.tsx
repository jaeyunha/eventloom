import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AgendaBoard } from "./agenda-workspace";
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
  warnings: [],
  diff: { added: 0, changed: 1, removed: 0 },
  validatedAt: "2026-08-08T12:01:00.000Z",
};

const actions = {
  onSaveEntry: vi.fn(async () => undefined),
  onRemoveEntry: vi.fn(async () => undefined),
  onPreview: vi.fn(async () => undefined),
  onOverrideWarning: vi.fn(async () => undefined),
  onPublish: vi.fn(async () => undefined),
  onDismissError: vi.fn(),
};

describe("agenda organizer workspace", () => {
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
    expect(markup).toContain("Publish immutable revision");
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Publish immutable revision<\/button>/);
  });
});
