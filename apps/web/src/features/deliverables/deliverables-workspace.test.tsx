import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  createDeliverablesApi,
  type DeliverableAsset,
  type DeliverableExportDownload,
  type DeliverableSession,
  type DeliverableSpeakerProfile,
  type DeliverableTask,
} from "./api";
import {
  DeliverablesWorkspaceView,
  deliverablesExportStatusLabels,
  triggerDeliverablesDownload,
} from "./deliverables-workspace";

const session: DeliverableSession = {
  id: "session-1",
  eventId: "event-1",
  title: "Taming 40-Minute CI: Incremental Builds at Monorepo Scale",
  description: "A practical talk about reliable build pipelines.",
  status: "Accepted",
  durationMinutes: 40,
  speakerIds: ["speaker-1"],
  speakerRoster: [{ id: "speaker-1", role: "primary" }],
  version: 3,
  contentStatus: "Needs changes",
  updatedAt: "2026-08-09T12:00:00.000Z",
  history: [
    {
      id: "history-1",
      action: "updated",
      version: 2,
      actorId: "Jordan Alvarez",
      occurredAt: "2026-08-08T12:00:00.000Z",
    },
    {
      id: "history-2",
      action: "updated",
      version: 3,
      actorId: "Jordan Alvarez",
      occurredAt: "2026-08-09T12:00:00.000Z",
    },
  ],
};

const profile: DeliverableSpeakerProfile = {
  id: "profile-1",
  eventId: "event-1",
  participantId: "speaker-1",
  displayName: "Priya Raman",
  biography: "Build systems engineer.",
  headshotAssetId: "asset-headshot",
  version: 2,
  updatedAt: "2026-08-09T12:00:00.000Z",
};

const task: DeliverableTask = {
  id: "task-1",
  eventId: "event-1",
  submissionId: "submission-1",
  participantId: "speaker-1",
  sessionTitle: session.title,
  type: "upload",
  owner: "speaker",
  title: "Upload Session Presentation",
  description: "Final slide deck as a PDF, 16:9 aspect ratio.",
  status: "submitted",
  dueAt: "2027-05-01",
  dependencyIds: [],
  reminderOffsetsMinutes: [10080, 1440],
  acceptedAssetKinds: ["slides"],
  version: 2,
  updatedAt: "2026-08-09T12:00:00.000Z",
};

const assetV1: DeliverableAsset = {
  id: "asset-1",
  eventId: "event-1",
  submissionId: "submission-1",
  participantId: "speaker-1",
  taskId: "task-1",
  kind: "slides",
  fileName: "slides.pdf",
  contentType: "application/pdf",
  sizeBytes: 1024,
  state: "ready",
  createdAt: "2026-08-08T12:00:00.000Z",
  version: 1,
  versionFamilyId: "family-1",
};

const assetV2: DeliverableAsset = {
  ...assetV1,
  id: "asset-2",
  createdAt: "2026-08-09T12:00:00.000Z",
  version: 2,
  supersedesAssetId: "asset-1",
};

describe("deliverables API adapter", () => {
  it("uses organization/event-qualified session and organizer asset routes", async () => {
    const calls: Array<{
      input: RequestInfo | URL;
      init: RequestInit | undefined;
    }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      const url = String(input);
      if (url.endsWith("/sessions"))
        return new Response(
          JSON.stringify({
            data: { items: [session], total: 1, limit: 50, offset: 0 },
          }),
          { status: 200 },
        );
      if (url.endsWith("/tasks"))
        return new Response(JSON.stringify({ data: [task] }), { status: 200 });
      if (url.includes("/assets?") || url.endsWith("/assets"))
        return new Response(
          JSON.stringify({
            data: [
              {
                ...assetV2,
                objectKey: "must-not-cross-boundary",
                tenantId: "tenant-secret",
              },
            ],
          }),
          { status: 200 },
        );
      if (url.endsWith("/download"))
        return new Response(
          JSON.stringify({
            data: {
              url: "https://private.example/download",
              expiresAt: "2026-08-09T12:02:00.000Z",
            },
          }),
          { status: 200 },
        );
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    };
    const api = createDeliverablesApi("https://api.example.test/", "org/1", "event/1", fetcher);
    await expect(api.listSessions()).resolves.toEqual([session]);
    await expect(api.listTasks?.()).resolves.toEqual([task]);
    const assets = await api.listAssets?.({ participantId: "speaker/1" });
    expect(assets?.[0]).not.toHaveProperty("objectKey");
    expect(assets?.[0]).not.toHaveProperty("tenantId");
    await api.getDownloadGrant?.("asset/2");
    expect(String(calls[0]?.input)).toBe(
      "https://api.example.test/api/admin/organizations/org%2F1/events/event%2F1/sessions",
    );
    expect(String(calls[1]?.input)).toContain("/api/speaker/events/event%2F1/organizer/tasks");
    expect(String(calls[2]?.input)).toContain(
      "/api/speaker/events/event%2F1/organizer/assets?participantId=speaker%2F1",
    );
    expect(String(calls[3]?.input)).toContain(
      "/api/speaker/events/event%2F1/organizer/assets/asset%2F2/download",
    );
    expect(calls.every((call) => call.init?.credentials === "include")).toBe(true);
  });
  it("provisions organizer task, reminder, and asset-review capabilities", async () => {
    const calls: Array<{
      input: RequestInfo | URL;
      init: RequestInit | undefined;
    }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      const url = String(input);
      if (url.endsWith("/organizer/tasks")) {
        return Response.json({ data: task }, { status: 201 });
      }
      if (url.endsWith("/organizer/reminders/queue")) {
        return Response.json({
          data: { sentCount: 1, recipientIds: ["speaker-1"] },
        });
      }
      if (url.endsWith("/organizer/assets/asset-2/review")) {
        return Response.json({ data: { ...assetV2, state: "approved" } });
      }
      throw new Error(`Unexpected request ${url}`);
    };
    const api = createDeliverablesApi("https://api.example.test", "org-1", "event-1", fetcher);

    await expect(
      api.createTask?.({
        title: "Upload slides",
        description: "PDF only",
        dueAt: "2027-05-01",
        allowedMimeTypes: ["application/pdf"],
        maxSizeBytes: 5_000_000,
        assigneeIds: ["speaker-1"],
        acceptedAssetKinds: ["slides"],
      }),
    ).resolves.toMatchObject({ id: task.id });
    await expect(
      api.sendBulkReminder?.({
        taskIds: ["task-1"],
        recipientIds: ["speaker-1"],
      }),
    ).resolves.toEqual({ sentCount: 1, recipientIds: ["speaker-1"] });
    await expect(
      api.reviewAsset?.({
        assetId: "asset-2",
        state: "approved",
        note: "Ready",
      }),
    ).resolves.toMatchObject({ id: "asset-2", state: "approved" });

    expect(String(calls[0]?.input)).toContain("/api/speaker/events/event-1/organizer/tasks");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      type: "upload",
      title: "Upload slides",
      instructions: "PDF only",
      description: "PDF only",
      dueAt: "2027-05-01",
      allowedMimeTypes: ["application/pdf"],
      maxBytes: 5_000_000,
      acceptedAssetKinds: ["slides"],
      assigneeIds: ["speaker-1"],
    });
    expect(String(calls[1]?.input)).toContain("/organizer/reminders/queue");
    expect(JSON.parse(String(calls[1]?.init?.body))).toMatchObject({
      taskIds: ["task-1"],
      recipientIds: ["speaker-1"],
      idempotencyKey: expect.any(String),
    });
    expect(String(calls[2]?.input)).toContain("/organizer/assets/asset-2/review");
  });
  it("posts an exact event-scoped export selection and validates the binary ZIP response", async () => {
    const calls: Array<{
      input: RequestInfo | URL;
      init: RequestInit | undefined;
    }> = [];
    const bytes = Uint8Array.from([80, 75, 3, 4]);
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return new Response(bytes, {
        status: 200,
        headers: {
          "content-type": "application/zip",
          "content-length": String(bytes.byteLength),
          "content-disposition":
            "attachment; filename=\"event-1-deliverables.zip\"; filename*=UTF-8''event-1-deliverables.zip",
        },
      });
    };
    const api = createDeliverablesApi("https://api.example.test", "org-1", "event-1", fetcher);
    const download = await api.exportDeliverables?.({
      assetIds: ["asset-2"],
      taskIds: ["task-1"],
      participantIds: ["speaker-1"],
      status: "uploaded",
    });
    expect(String(calls[0]?.input)).toBe(
      "https://api.example.test/api/speaker/events/event-1/organizer/deliverables/export",
    );
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      assetIds: ["asset-2"],
      taskIds: ["task-1"],
      participantIds: ["speaker-1"],
      status: "uploaded",
    });
    expect(calls[0]?.init?.method).toBe("POST");
    expect(new Headers(calls[0]?.init?.headers).get("accept")).toBe("application/zip");
    expect(new Headers(calls[0]?.init?.headers).get("content-type")).toBe("application/json");
    expect(download?.contentType).toBe("application/zip");
    expect(download?.fileName).toBe("event-1-deliverables.zip");
    expect(download?.sizeBytes).toBe(bytes.byteLength);
    expect([...new Uint8Array(download?.body ?? new ArrayBuffer(0))]).toEqual([...bytes]);
  });

  it("surfaces export errors and rejects unsafe binary headers", async () => {
    const errorApi = createDeliverablesApi(
      "https://api.example.test",
      "org-1",
      "event-1",
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "FORBIDDEN",
              message: "Organizer access is required.",
            },
          }),
          { status: 403 },
        ),
    );
    await expect(errorApi.exportDeliverables?.({ taskIds: ["task-1"] })).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });

    const invalidApi = createDeliverablesApi(
      "https://api.example.test",
      "org-1",
      "event-1",
      async () =>
        new Response(new Uint8Array([1]), {
          status: 200,
          headers: {
            "content-type": "application/octet-stream",
            "content-disposition": 'attachment; filename="bad.zip"',
          },
        }),
    );
    await expect(invalidApi.exportDeliverables?.({ taskIds: ["task-1"] })).rejects.toThrow(
      "ZIP archive",
    );
  });

  it("rejects missing organization or event scope rather than guessing a route", () => {
    expect(() => createDeliverablesApi("https://api.example.test", " ", "event-1")).toThrow(
      "organization ID is required",
    );
    expect(() => createDeliverablesApi("https://api.example.test", "org-1", " ")).toThrow(
      "event ID is required",
    );
  });
});

describe("deliverables workspace", () => {
  it("renders task setup, filters, immutable versions, comments, approval, and content editors", () => {
    const markup = renderToStaticMarkup(
      createElement(DeliverablesWorkspaceView, {
        organizationId: "org-1",
        eventId: "event-1",
        sessions: [session],
        tasks: [task],
        assets: [assetV1, assetV2],
        profiles: [profile],
        selectedAssetId: "asset-2",
        assetHistory: [assetV1, assetV2],
        comments: [
          {
            id: "comment-1",
            eventId: "event-1",
            assetId: "asset-2",
            body: "Draft deck - final version coming Friday.",
            authorLabel: "Priya Raman",
            createdAt: "2026-08-09T12:01:00.000Z",
          },
        ],
        onCreateTask: async () => undefined,
        onInspectAsset: () => undefined,
        onAddComment: async () => undefined,
        onDownloadVersion: async () => undefined,
        onExportDeliverables: async () => undefined,
        onSendBulkReminder: async () => undefined,
        onSaveSession: async () => undefined,
        onApproveSession: async () => undefined,
        onSaveBiography: async () => undefined,
        onReplaceHeadshot: async () => undefined,
        onRestoreSessionVersion: async () => undefined,
      }),
    );
    expect(markup).toContain("Content management and deliverables");
    expect(markup).toContain("Create a file-request task");
    expect(markup).toContain("Allowed MIME types");
    expect(markup).toContain("Accepted asset kinds (required)");
    expect(markup).toContain("Slides");
    expect(markup).toContain("The replacement is staged through a");
    expect(markup).not.toContain("current API does not expose organizer headshot replacement");
    expect(markup).toContain("Maximum file size");
    expect(markup).toContain("Assignees");
    expect(markup).toContain("Filter by speaker");
    expect(markup).toContain("Filter by task");
    expect(markup).toContain("Preview reminder recipients");
    expect(markup).toContain("slides.pdf");
    expect(markup).toContain("Current");
    expect(markup).toContain("Draft deck - final version coming Friday.");
    expect(markup).toContain("Approve content");
    expect(markup).toContain("Session title and abstract");
    expect(markup).toContain("Public approval gate");
    expect(markup).toContain("Unapproved content");
    expect(markup).toContain("Review status:");
    expect(markup).toContain("Prior version to restore");
    expect(markup).toContain("Restore selected prior version");
    expect(markup).toContain("Speaker bio and headshot");
    expect(markup).not.toContain("must-not-cross-boundary");
    expect(markup).toContain("Download selected deliverables ZIP");
  });
  it("keeps Files and Deliverables route modes separate", () => {
    const filesMarkup = renderToStaticMarkup(
      createElement(DeliverablesWorkspaceView, {
        organizationId: "org-1",
        eventId: "event-1",
        mode: "files",
        sessions: [session],
        tasks: [task],
        assets: [assetV1, assetV2],
        profiles: [profile],
        onInspectAsset: () => undefined,
      }),
    );
    expect(filesMarkup).toContain("Asset-centric Files library");
    expect(filesMarkup).toContain("Select sessions");
    expect(filesMarkup).toContain("Download selected files ZIP");
    expect(filesMarkup).not.toContain("Create a file-request task");
    expect(filesMarkup).not.toContain("Deliverables dashboard");

    const deliverablesMarkup = renderToStaticMarkup(
      createElement(DeliverablesWorkspaceView, {
        organizationId: "org-1",
        eventId: "event-1",
        mode: "deliverables",
        sessions: [session],
        tasks: [task],
        assets: [assetV1, assetV2],
        profiles: [profile],
      }),
    );
    expect(deliverablesMarkup).toContain("Deliverables dashboard");
    expect(deliverablesMarkup).not.toContain("Asset-centric Files library");
  });

  it("groups slides.pdf by its authoritative latest version and shows two versions", () => {
    const markup = renderToStaticMarkup(
      createElement(DeliverablesWorkspaceView, {
        organizationId: "org-1",
        eventId: "event-1",
        mode: "files",
        sessions: [session],
        tasks: [task],
        assets: [assetV1, assetV2],
        profiles: [profile],
        onInspectAsset: () => undefined,
      }),
    );
    expect(markup).toContain("slides.pdf");
    expect(markup).toContain("v2 · 2 versions");
    expect(markup).toContain("Review state");
    expect(markup).toContain("View version history");
  });

  it("exposes file filtering and latest asset/session selection controls", () => {
    const markup = renderToStaticMarkup(
      createElement(DeliverablesWorkspaceView, {
        organizationId: "org-1",
        eventId: "event-1",
        mode: "files",
        sessions: [session],
        tasks: [task],
        assets: [assetV1, assetV2],
        profiles: [profile],
      }),
    );
    expect(markup).toContain("Filter files");
    expect(markup).toContain("Filter by session");
    expect(markup).toContain("Filter by review state");
    expect(markup).toContain("Select all visible latest files");
    expect(markup).toContain(
      "Select session Taming 40-Minute CI: Incremental Builds at Monorepo Scale",
    );
    expect(markup).toContain('aria-label="Select slides.pdf"');
  });

  it("keeps every ZIP response state explicit and non-fabricated", () => {
    expect(Object.keys(deliverablesExportStatusLabels)).toEqual([
      "idle",
      "queued",
      "preparing",
      "generating",
      "ready",
      "download-started",
      "failure",
    ]);
    expect(deliverablesExportStatusLabels.queued).toContain("queued");
    expect(deliverablesExportStatusLabels.generating).toContain("generating");
    expect(deliverablesExportStatusLabels.ready).toContain("validated ZIP response");
    expect(deliverablesExportStatusLabels["download-started"]).toContain("download");
    expect(deliverablesExportStatusLabels.failure).toContain("failed");
  });

  it("renders honest disabled capability states rather than fabricated success", () => {
    const markup = renderToStaticMarkup(
      createElement(DeliverablesWorkspaceView, {
        organizationId: "org-1",
        eventId: "event-1",
        error: "This content changed elsewhere. Reload before trying again.",
        sessions: [],
        tasks: [],
        assets: [],
        profiles: [],
        apiConfigured: false,
        capabilityMessages: ["Task tracking unavailable", "Bulk reminder sending is unavailable"],
      }),
    );
    expect(markup).toContain("Deliverables API is not configured");
    expect(markup).toContain("This content changed elsewhere. Reload before trying again.");
    expect(markup).toContain("Task tracking unavailable");
    expect(markup).toContain("Bulk reminder sending is unavailable");
    expect(markup).toContain("Task creation unavailable");
    expect(markup).toContain("Session editing unavailable");
    expect(markup).not.toContain("objectKey");
    expect(markup).toContain("Download selected deliverables ZIP");
    expect(markup).toContain('disabled=""');
  });
  it("revokes the transient object URL after starting a ZIP download", () => {
    const createObjectURL = vi.fn(() => "blob:deliverables");
    const revokeObjectURL = vi.fn();
    const click = vi.fn();
    const remove = vi.fn();
    const appendChild = vi.fn();
    vi.stubGlobal("document", {
      createElement: () => ({
        href: "",
        download: "",
        rel: "",
        style: {},
        click,
        remove,
      }),
      body: { appendChild },
    });
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const download: DeliverableExportDownload = {
      body: new Uint8Array([80, 75, 3, 4]).buffer,
      fileName: "event-1-deliverables.zip",
      contentType: "application/zip",
      sizeBytes: 4,
    };
    try {
      triggerDeliverablesDownload(download);
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(appendChild).toHaveBeenCalledTimes(1);
      expect(click).toHaveBeenCalledTimes(1);
      expect(remove).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:deliverables");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
