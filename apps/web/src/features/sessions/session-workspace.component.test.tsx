import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SessionsWorkspaceView } from "./session-workspace";

const session = {
  id: "session-1",
  eventId: "event-1",
  title: "Reliable worker pools",
  description: "How to keep jobs moving.",
  status: "Accepted",
  contentStatus: "Needs changes" as const,
  durationMinutes: 45,
  speakerIds: ["speaker-1"],
  speakerRoster: [{ id: "speaker-1", displayName: "Avery Kim", role: "primary" }],
  version: 2,
  createdAt: "2026-08-09T12:00:00.000Z",
  updatedAt: "2026-08-09T12:01:00.000Z",
  updatedBy: "organizer-1",
};

describe("sessions workspace presentation", () => {
  it("presents canonical editing, approval, attributed history, and restore controls", () => {
    const markup = renderToStaticMarkup(
      createElement(SessionsWorkspaceView, {
        organizationId: "org-1",
        eventId: "event-1",
        sessions: [session],
        selectedSessionId: session.id,
        history: [
          {
            id: "history-1",
            action: "created",
            version: 1,
            actorId: "organizer-1",
            actorLabel: "Avery Kim",
            occurredAt: "2026-08-09T12:00:00.000Z",
            snapshot: {
              title: "Original worker pools",
              description: "The first abstract.",
              contentStatus: "Needs changes",
            },
          },
          {
            id: "history-2",
            action: "updated",
            version: 2,
            actorId: "organizer-1",
            actorLabel: "Avery Kim",
            occurredAt: "2026-08-09T12:01:00.000Z",
            snapshot: {
              title: session.title,
              description: session.description,
              contentStatus: "Needs changes",
            },
          },
        ],
        speakers: [
          {
            id: "speaker-1",
            displayName: "Avery Kim",
            jobTitle: "Staff Engineer",
            company: "Example Co",
          },
          { id: "speaker-2", displayName: "Morgan Lee" },
        ],
        onSave: async () => undefined,
        onSaveSpeakers: async () => undefined,
        onSetContentStatus: async () => undefined,
        onRestore: async () => undefined,
      }),
    );

    expect(markup).toContain("Sessions");
    expect(markup).toContain("Reliable worker pools");
    expect(markup).toContain("Session content");
    expect(markup).toContain("Content approval");
    expect(markup).toContain("Approve content");
    expect(markup).toContain("Speaker assignments");
    expect(markup).toContain("Current assignments");
    expect(markup).toContain("Avery Kim");
    expect(markup).toContain("Primary");
    expect(markup).toContain("Morgan Lee");
    expect(markup).toContain("Save speaker assignments");
    expect(markup).toContain('role="checkbox"');
    expect(markup).toContain("Change history");
    expect(markup).toContain("Avery Kim");
    expect(markup).toContain("Version 1 - Created");
    expect(markup).toContain("Restore version 1");
    expect(markup).toContain("Current");
  });

  it("distinguishes an empty roster from an unavailable roster and announces success politely", () => {
    const emptyMarkup = renderToStaticMarkup(
      createElement(SessionsWorkspaceView, {
        organizationId: "org-1",
        eventId: "event-1",
        sessions: [{ ...session, speakerIds: [], speakerRoster: [] }],
        selectedSessionId: session.id,
        history: [],
        speakers: [],
        statusMessage: "Speaker assignments saved.",
        onSaveSpeakers: async () => undefined,
      }),
    );
    expect(emptyMarkup).toContain("No speakers are available in this event roster.");
    expect(emptyMarkup).not.toContain("Speaker roster unavailable");
    expect(emptyMarkup).toContain('role="status"');
    expect(emptyMarkup).toContain('aria-live="polite"');
    expect(emptyMarkup).toContain("Speaker assignments saved.");

    const unavailableMarkup = renderToStaticMarkup(
      createElement(SessionsWorkspaceView, {
        organizationId: "org-1",
        eventId: "event-1",
        sessions: [session],
        selectedSessionId: session.id,
        history: [],
        speakers: null,
        speakerError: "The roster request failed.",
        onRetrySpeakers: () => undefined,
        onSaveSpeakers: async () => undefined,
      }),
    );
    expect(unavailableMarkup).toContain("Speaker roster unavailable");
    expect(unavailableMarkup).toContain("Current assignments are preserved");
    expect(unavailableMarkup).toContain("Avery Kim");
    expect(unavailableMarkup).toContain("Primary");
    expect(unavailableMarkup).toContain("Retry speaker roster");
    expect(unavailableMarkup).not.toContain("No speakers are available in this event roster.");
  });
});
