import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OrganizerEventWorkspaceProvider } from "@/features/admin/organizer-event-workspace";
import { createNavigationDataCache } from "@/lib/navigation-data-cache";
import type { SessionRecord, SessionsApi } from "./api";
import { SessionsWorkspaceView } from "./session-workspace";
import {
  loadSessionsWorkspaceBundle,
  type SessionsWorkspaceCacheBundle,
  sessionsWorkspaceCacheKey,
  sessionsWorkspaceCacheTags,
} from "./session-workspace-model";

const session: SessionRecord = {
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
const speakers = [{ id: "speaker-1", displayName: "Avery Kim" }] as const;

function sessionsApi(): SessionsApi {
  return {
    list: vi.fn(async () => [session]),
    get: vi.fn(async () => session),
    updateContent: vi.fn(async () => session),
    listSpeakers: vi.fn(async () => speakers),
    updateSpeakers: vi.fn(async () => session),
    listHistory: vi.fn(async () => []),
    restoreVersion: vi.fn(async () => session),
  };
}

describe("sessions workspace presentation", () => {
  it("renders one accessible empty workspace with the event name", () => {
    const markup = renderToStaticMarkup(
      createElement(
        OrganizerEventWorkspaceProvider,
        {
          organizationId: "org-1",
          event: {
            id: "87aadc17-5e75-4732-9085-65df6b8e9a9b",
            name: "Test Summit Local",
            slug: "test-summit-local",
          },
        },
        createElement(SessionsWorkspaceView, {
          organizationId: "org-1",
          eventId: "87aadc17-5e75-4732-9085-65df6b8e9a9b",
          sessions: [],
          selectedSessionId: null,
          history: [],
        }),
      ),
    );

    expect(markup).toContain('data-sessions-state="empty"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("Test Summit Local");
    expect(markup).not.toContain("Event 87aadc17-5e75-4732-9085-65df6b8e9a9b");
    expect(markup).not.toContain('data-sessions-layout="split"');
  });

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

    expect(markup).toContain('data-sessions-layout="split"');
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
describe("sessions workspace navigation cache", () => {
  it("isolates normalized organization and canonical event scopes", () => {
    const firstKey = sessionsWorkspaceCacheKey(" org-1 ", " event-1 ");
    const secondKey = sessionsWorkspaceCacheKey("org-2", "event-1");

    expect(firstKey).toBe("sessions:workspace:org-1:event-1");
    expect(secondKey).not.toBe(firstKey);
    expect(sessionsWorkspaceCacheTags(" org-1 ", " event-1 ")).toEqual([
      "organization:org-1",
      "event:event-1",
      "sessions:event-1",
    ]);
  });

  it("loads one initial bundle on a cache miss", async () => {
    const api = sessionsApi();
    const cache = createNavigationDataCache();
    const key = sessionsWorkspaceCacheKey("org-1", "event-1");
    const tags = sessionsWorkspaceCacheTags("org-1", "event-1");

    await expect(loadSessionsWorkspaceBundle(api, cache, key, tags)).resolves.toEqual({
      sessions: [session],
      speakers,
    });
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.listSpeakers).toHaveBeenCalledTimes(1);
  });

  it("hydrates cache hits without loading or issuing duplicate initial reads", async () => {
    const api = sessionsApi();
    const cache = createNavigationDataCache();
    const key = sessionsWorkspaceCacheKey("org-1", "event-1");
    const tags = sessionsWorkspaceCacheTags("org-1", "event-1");

    await loadSessionsWorkspaceBundle(api, cache, key, tags);
    await expect(loadSessionsWorkspaceBundle(api, cache, key, tags)).resolves.toEqual({
      sessions: [session],
      speakers,
    });

    expect(cache.peek(key)).toEqual({ sessions: [session], speakers });
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.listSpeakers).toHaveBeenCalledTimes(1);
  });

  it("bypasses the completed bundle on an explicit fresh reload", async () => {
    const api = sessionsApi();
    const cache = createNavigationDataCache();
    const key = sessionsWorkspaceCacheKey("org-1", "event-1");
    const tags = sessionsWorkspaceCacheTags("org-1", "event-1");

    await loadSessionsWorkspaceBundle(api, cache, key, tags);
    await loadSessionsWorkspaceBundle(api, cache, key, tags, undefined, true);

    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.listSpeakers).toHaveBeenCalledTimes(2);
  });

  it("fences pending reads when event and sessions mutations invalidate the scope", async () => {
    const cache = createNavigationDataCache();
    const key = sessionsWorkspaceCacheKey("org-1", "event-1");
    const tags = sessionsWorkspaceCacheTags("org-1", "event-1");
    let resolveLoad!: (value: SessionsWorkspaceCacheBundle) => void;
    const pending = cache.read({
      key,
      tags,
      load: () =>
        new Promise<SessionsWorkspaceCacheBundle>((resolve) => {
          resolveLoad = resolve;
        }),
    });

    cache.invalidate(["event:event-1", "sessions:event-1"]);
    resolveLoad({ sessions: [session], speakers });
    await expect(pending).resolves.toEqual({ sessions: [session], speakers });
    expect(cache.peek(key)).toBeUndefined();
  });
});
