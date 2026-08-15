import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  EventGuideWorkspaceView,
  FilesWorkspaceView,
  SessionsWorkspaceView,
} from "./portal-workspace";
import type {
  PortalAsset,
  PortalResource,
  PortalRosterEnvelope,
  PortalSubmission,
  PortalTask,
  PortalWikiPage,
} from "./types";

const accepted: PortalSubmission = {
  id: "session-accepted",
  eventId: "event-1",
  title: "Reliable event operations",
  status: "accepted",
  participantIds: ["speaker-1", "speaker-2"],
  updatedAt: "2026-08-15T10:00:00.000Z",
  version: 3,
};

const otherAccepted: PortalSubmission = {
  ...accepted,
  id: "session-other",
  title: "Another accepted session",
  participantIds: ["speaker-1"],
};

const roster: PortalRosterEnvelope = {
  organizationId: "org-1",
  eventId: "event-1",
  submissionId: accepted.id,
  capabilities: { manage: true, invite: true },
  members: [
    {
      participantId: "speaker-1",
      displayName: "Priya Raman",
      email: "priya@example.test",
      role: "primary",
      status: "active",
      capabilities: { edit: false, remove: false },
    },
    {
      participantId: "speaker-2",
      displayName: "Marcus Okafor",
      email: "marcus@example.test",
      role: "co_speaker",
      status: "active",
      capabilities: { edit: true, remove: true },
    },
  ],
};

const task: PortalTask = {
  id: "task-session-1",
  eventId: "event-1",
  submissionId: accepted.id,
  participantId: "speaker-1",
  type: "upload",
  owner: "speaker",
  title: "Upload final slides",
  status: "in_progress",
  dependencyIds: [],
  reminderOffsetsMinutes: [],
  version: 2,
  updatedAt: "2026-08-15T10:00:00.000Z",
};

const asset: PortalAsset = {
  id: "asset-v1",
  eventId: "event-1",
  submissionId: accepted.id,
  participantId: "speaker-1",
  kind: "slides",
  fileName: "reliable-operations.pdf",
  contentType: "application/pdf",
  sizeBytes: 1536,
  state: "ready",
  createdAt: "2026-08-15T10:00:00.000Z",
  version: 1,
  versionFamilyId: "family-slides",
  latestVersionId: "asset-v1",
  currentVersionId: "asset-v1",
  reviewState: "needs_changes",
  reviewNote: "Replace the draft agenda slide.",
};

describe("focused participant workspaces", () => {
  it("scopes co-speakers, tasks, and files to the explicitly selected accepted session", () => {
    const markup = renderToStaticMarkup(
      createElement(SessionsWorkspaceView, {
        eventName: "North Summit",
        sessions: [accepted, otherAccepted],
        selectedSessionId: accepted.id,
        roster,
        tasks: [
          task,
          { ...task, id: "other-task", submissionId: otherAccepted.id, title: "Hidden task" },
        ],
        assets: [
          asset,
          { ...asset, id: "other-asset", submissionId: otherAccepted.id, fileName: "hidden.pdf" },
        ],
        canManageRoster: true,
        canInvite: true,
        busyRoster: false,
        onSelectSession: vi.fn(),
        onAddCoSpeaker: vi.fn(),
        onUpdateCoSpeaker: vi.fn(),
        onRemoveCoSpeaker: vi.fn(),
      }),
    );

    expect(markup).toContain("Accepted session");
    expect(markup).toContain("Reliable event operations");
    expect(markup).toContain("Primary speaker");
    expect(markup).toContain("Marcus Okafor");
    expect(markup).toContain("Upload final slides");
    expect(markup).toContain("reliable-operations.pdf");
    expect(markup).not.toContain("Hidden task");
    expect(markup).not.toContain("hidden.pdf");
    expect(markup).not.toMatch(/remove[^<]*Priya Raman/iu);
  });

  it("requires explicit session attribution for real file actions and renders truthful review data", () => {
    const markup = renderToStaticMarkup(
      createElement(FilesWorkspaceView, {
        eventName: "North Summit",
        sessions: [accepted, otherAccepted],
        selectedSessionId: accepted.id,
        assets: [asset],
        participantId: "speaker-1",
        canWrite: true,
        busyAssetIds: new Set<string>(),
        onSelectSession: vi.fn(),
        onUpload: vi.fn(),
        onRetryUpload: vi.fn(),
        onCompleteUpload: vi.fn(),
        onDownload: vi.fn(),
      }),
    );

    expect(markup).toContain("Files for Reliable event operations");
    expect(markup).toContain("Session attribution");
    expect(markup).toContain("Needs changes");
    expect(markup).toContain("Replace the draft agenda slide.");
    expect(markup).toContain("Download current version");
    expect(markup).toContain("application/pdf");
    expect(markup).toContain("1.5 KiB");
    expect(markup).toContain(
      'accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/jpeg,image/png,image/webp"',
    );
    expect(markup).not.toMatch(/comments|activity history|uploaded by/iu);
  });

  it("keeps event-guide unavailable distinct from empty and retains safe published rendering", () => {
    const unavailable = renderToStaticMarkup(
      createElement(EventGuideWorkspaceView, {
        eventName: "North Summit",
        available: false,
        resources: [],
        wiki: [],
      }),
    );
    const empty = renderToStaticMarkup(
      createElement(EventGuideWorkspaceView, {
        eventName: "North Summit",
        available: true,
        resources: [],
        wiki: [],
      }),
    );
    const resource: PortalResource = {
      id: "resource-1",
      title: "Speaker handbook",
      html: '<p>Read <strong>carefully</strong>.</p><script>alert(1)</script><a href="javascript:alert(2)">unsafe</a>',
      url: "https://example.test/handbook",
      order: 2,
      updatedAt: "2026-08-15T10:00:00.000Z",
    };
    const wiki: PortalWikiPage = {
      id: "wiki-1",
      title: "Arrival guide",
      summary: "Where to check in.",
      order: 1,
      updatedAt: "2026-08-15T09:00:00.000Z",
    };
    const published = renderToStaticMarkup(
      createElement(EventGuideWorkspaceView, {
        eventName: "North Summit",
        available: true,
        resources: [resource],
        wiki: [wiki],
      }),
    );

    expect(unavailable).toContain("Event guide unavailable");
    expect(empty).toContain("Nothing published yet");
    expect(published).toContain("Speaker handbook");
    expect(published).toContain("Arrival guide");
    expect(published).toContain("<strong>carefully</strong>");
    expect(published).toContain('href="https://example.test/handbook"');
    expect(published).not.toContain("<script");
    expect(published).not.toContain('href="javascript:');
  });

  it("keeps /portal/tasks authoritative and removes the duplicate task implementation", () => {
    const workspaceSource = readFileSync(
      fileURLToPath(new URL("portal-workspace.tsx", import.meta.url)),
      "utf8",
    );
    const routeSource = readFileSync(
      fileURLToPath(new URL("../../app/portal/page.tsx", import.meta.url)),
      "utf8",
    );

    expect(workspaceSource).not.toMatch(
      /function TasksWorkspace|function FormTaskCard|function FormField/,
    );
    expect(workspaceSource).not.toContain('section === "tasks"');
    expect(routeSource).toContain("redirect(event ? `/portal/tasks?event=");
    expect(routeSource).not.toMatch(/<PortalWorkspace section=["'{]tasks/);
  });
});
