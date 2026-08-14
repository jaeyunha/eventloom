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
        onSave: async () => undefined,
        onSetContentStatus: async () => undefined,
        onRestore: async () => undefined,
      }),
    );

    expect(markup).toContain("Sessions");
    expect(markup).toContain("Reliable worker pools");
    expect(markup).toContain("Session content");
    expect(markup).toContain("Content approval");
    expect(markup).toContain("Approve content");
    expect(markup).toContain("Change history");
    expect(markup).toContain("Avery Kim");
    expect(markup).toContain("Version 1 - Created");
    expect(markup).toContain("Restore version 1");
    expect(markup).toContain("Current");
  });
});
