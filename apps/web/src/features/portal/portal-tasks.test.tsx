import { describe, expect, it } from "vitest";
import { assetPointerLabels, resolveAssetPointers } from "./portal-assets";
import {
  commentsForAsset,
  getTaskUploadPolicy,
  portalTaskGroup,
  resolveTaskAsset,
  resolveTaskSubject,
  taskSubjectPresentation,
  validateTaskUpload,
} from "./portal-tasks";
import type { PortalAsset, PortalTask } from "./types";

function task(overrides: Record<string, unknown> = {}): PortalTask {
  return {
    id: "task-1",
    eventId: "event-1",
    submissionId: "submission-1",
    participantId: "participant-1",
    type: "upload",
    owner: "speaker",
    title: "Upload slides",
    status: "in_progress",
    dependencyIds: [],
    reminderOffsetsMinutes: [],
    acceptedAssetKinds: ["slides"],
    version: 1,
    updatedAt: "2026-08-12T12:00:00.000Z",
    ...overrides,
  } as PortalTask;
}

function asset(id: string, overrides: Record<string, unknown> = {}): PortalAsset {
  return {
    id,
    eventId: "event-1",
    submissionId: "submission-1",
    participantId: "participant-1",
    taskId: "task-1",
    kind: "slides",
    fileName: `${id}.pdf`,
    contentType: "application/pdf",
    sizeBytes: 100,
    state: "ready",
    createdAt: "2026-08-12T12:00:00.000Z",
    version: 1,
    ...overrides,
  } as PortalAsset;
}

describe("portal task deliverable helpers", () => {
  it("groups content requests separately from other event tasks", () => {
    expect(portalTaskGroup(task({ type: "upload" }))).toBe("content-requests");
    expect(portalTaskGroup(task({ type: "form" }))).toBe("content-requests");
    expect(portalTaskGroup(task({ type: "action" }))).toBe("other-event-tasks");
  });

  it("fails closed when the server upload policy is absent or incomplete", () => {
    const missing = getTaskUploadPolicy(task());
    expect(missing.valid).toBe(false);
    expect(missing.error).toContain("MIME allowlist");

    const missingLimit = getTaskUploadPolicy(task({ allowedMimeTypes: ["application/pdf"] }));
    expect(missingLimit.valid).toBe(false);
    expect(missingLimit.error).toContain("byte limit");

    const valid = getTaskUploadPolicy(
      task({ allowedMimeTypes: [" application/pdf "], maxBytes: 1_000 }),
    );
    expect(valid).toMatchObject({
      valid: true,
      allowedMimeTypes: ["application/pdf"],
      maxBytes: 1_000,
    });
  });

  it("validates MIME and size before upload", () => {
    const policy = getTaskUploadPolicy(
      task({ allowedMimeTypes: ["application/pdf", "image/*"], maxBytes: 100 }),
    );
    expect(validateTaskUpload({ type: "application/pdf", size: 100 }, policy)).toEqual({
      valid: true,
    });
    expect(validateTaskUpload({ type: "text/plain", size: 1 }, policy)).toMatchObject({
      valid: false,
    });
    expect(validateTaskUpload({ type: "image/png", size: 101 }, policy)).toMatchObject({
      valid: false,
      error: expect.stringContaining("limit"),
    });
  });

  it("distinguishes participant tasks from session tasks and reports missing accepted sessions", () => {
    const participantTask = task({
      submissionId: null,
      subject: { type: "participant", participantId: "participant-1" },
    });
    expect(resolveTaskSubject(participantTask)).toEqual({
      subject: { type: "participant", participantId: "participant-1" },
      error: null,
    });
    expect(
      taskSubjectPresentation(
        participantTask,
        [
          {
            id: "profile-1",
            eventId: "event-1",
            participantId: "participant-1",
            displayName: "Ada Speaker",
            biography: "",
            version: 1,
            updatedAt: "2026-08-12T12:00:00.000Z",
          },
        ],
        [],
      ).label,
    ).toContain("Ada Speaker");

    const sessionTask = task({
      submissionId: "missing-session",
      subject: {
        type: "session",
        participantId: "participant-1",
        submissionId: "missing-session",
      },
    });
    expect(taskSubjectPresentation(sessionTask, [], [])).toMatchObject({
      label: "Session unavailable",
      error: "This session-scoped task has no matching accepted submission.",
    });
  });

  it("uses pointer IDs rather than array order for version state", () => {
    const old = asset("asset-old", {
      version: 1,
      latestVersionId: "asset-current",
      currentVersionId: "asset-current",
      approvedVersionId: "asset-old",
    });
    const current = asset("asset-current", {
      version: 2,
      latestVersionId: "asset-current",
      currentVersionId: "asset-current",
      approvedVersionId: "asset-old",
      releasedVersionId: "asset-current",
    });
    const taskValue = task({
      allowedMimeTypes: ["application/pdf"],
      maxBytes: 10_000,
    });
    const resolution = resolveTaskAsset(taskValue, [current, old]);
    expect(resolution.status).toBe("ready");
    expect(resolution.latest?.id).toBe("asset-current");
    expect(assetPointerLabels(current, resolution.pointers)).toEqual([
      "Latest upload",
      "Current",
      "Released",
    ]);
    expect(resolveAssetPointers([old, current]).status).toBe("ready");

    const conflict = resolveAssetPointers([
      asset("asset-a", { latestVersionId: "asset-a" }),
      asset("asset-b", { latestVersionId: "asset-b" }),
    ]);
    expect(conflict.status).toBe("conflict");
  });

  it("keeps comments bound to the exact immutable asset version", () => {
    const selected = asset("asset-v2", { versionId: "version-v2", version: 2 });
    const comments = commentsForAsset(selected, [
      {
        id: "comment-v2",
        assetId: "asset-v2",
        versionId: "version-v2",
        body: "Use the updated deck.",
        authorLabel: "Organizer",
        createdAt: "2026-08-12T12:00:00.000Z",
      } as never,
      {
        id: "comment-v1",
        assetId: "asset-v2",
        versionId: "version-v1",
        body: "Old version note.",
        authorLabel: "Organizer",
        createdAt: "2026-08-12T12:00:00.000Z",
      } as never,
      {
        id: "comment-family",
        assetId: "family-1",
        versionId: "version-v2",
        body: "Family thread.",
        authorLabel: "Organizer",
        createdAt: "2026-08-12T12:00:00.000Z",
      } as never,
    ]);
    expect(comments.map((comment) => comment.id)).toEqual(["comment-v2"]);
  });
});
