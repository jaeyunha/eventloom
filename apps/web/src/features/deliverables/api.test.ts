import { describe, expect, it } from "vitest";
import { createDeliverablesApi } from "./api";

const restoredSession = {
  id: "session-1",
  eventId: "event-1",
  title: "Restored title",
  description: "Restored abstract",
  status: "confirmed",
  durationMinutes: 30,
  speakerIds: ["participant-1"],
  speakerRoster: [{ id: "participant-1", role: "primary" }],
  version: 4,
};

describe("deliverables API", () => {
  it("restores immutable session content through the canonical admin mutation envelope", async () => {
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    const api = createDeliverablesApi(
      "https://api.example.test",
      "org-1",
      "event-1",
      async (input, init) => {
        requests.push({
          url: String(input),
          method: init?.method ?? "GET",
          body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
        });
        return Response.json({ data: restoredSession });
      },
    );

    await expect(
      api.restoreSessionVersion?.({
        sessionId: "session-1",
        version: 2,
        expectedVersion: 3,
      }),
    ).resolves.toEqual(restoredSession);
    expect(requests).toEqual([
      {
        url: "https://api.example.test/api/admin/organizations/org-1/events/event-1/sessions/session-1/restore",
        method: "POST",
        body: { version: 2, expectedVersion: 3 },
      },
    ]);
  });
  it("serializes an explicit non-empty upload asset policy and rejects missing policy", async () => {
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    const api = createDeliverablesApi(
      "https://api.example.test",
      "org-1",
      "event-1",
      async (input, init) => {
        requests.push({
          url: String(input),
          method: init?.method ?? "GET",
          body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
        });
        return Response.json({
          data: {
            id: "task-1",
            eventId: "event-1",
            submissionId: "submission-1",
            participantId: "participant-1",
            type: "upload",
            owner: "speaker",
            title: "Upload slides",
          },
        });
      },
    );

    if (api.createTask === undefined) throw new Error("Expected organizer task adapter.");
    await api.createTask({
      title: "Upload slides",
      description: "PDF only",
      dueAt: "2026-08-22",
      allowedMimeTypes: ["application/pdf"],
      maxSizeBytes: 5_000_000,
      acceptedAssetKinds: ["slides", "supporting_file"],
      assigneeIds: ["participant-1"],
    });

    expect(requests[0]).toMatchObject({
      url: "https://api.example.test/api/speaker/events/event-1/organizer/tasks",
      method: "POST",
      body: {
        acceptedAssetKinds: ["slides", "supporting_file"],
      },
    });
    await expect(
      api.createTask({
        title: "Missing policy",
        description: "No asset kind",
        dueAt: "2026-08-22",
        allowedMimeTypes: ["application/pdf"],
        maxSizeBytes: 5_000_000,
        acceptedAssetKinds: [],
        assigneeIds: ["participant-1"],
      }),
    ).rejects.toThrow("accepted asset kind");
    expect(requests).toHaveLength(1);
  });

  it("replaces a headshot through the organizer grant, private upload, finalization, and profile relink", async () => {
    const pendingAsset = {
      id: "asset-headshot-v2",
      eventId: "event-1",
      participantId: "participant-1",
      kind: "headshot",
      fileName: "speaker.png",
      contentType: "image/png",
      sizeBytes: 11,
      state: "pending_upload",
      createdAt: "2026-08-10T00:00:00.000Z",
      version: 2,
      versionFamilyId: "family-headshot",
      supersedesAssetId: "asset-headshot-v1",
    };
    const finalizedAsset = {
      ...pendingAsset,
      state: "ready",
      finalizedAt: "2026-08-10T00:01:00.000Z",
    };
    const profile = {
      id: "profile-1",
      eventId: "event-1",
      participantId: "participant-1",
      displayName: "Priya Raman",
      biography: "Build systems engineer.",
      headshotAssetId: finalizedAsset.id,
      version: 3,
      updatedAt: "2026-08-10T00:01:00.000Z",
    };
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const api = createDeliverablesApi(
      "https://api.example.test",
      "org-1",
      "event-1",
      async (input, init) => {
        calls.push({ url: String(input), init });
        switch (calls.length) {
          case 1:
            return Response.json({
              data: {
                asset: pendingAsset,
                grant: {
                  method: "PUT",
                  url: "https://uploads.example.test/events/event-1/headshots/v2",
                  headers: { "content-type": "image/png" },
                  expiresAt: "2026-08-10T00:05:00.000Z",
                },
              },
            });
          case 2:
            return new Response(null, { status: 204 });
          case 3:
            return Response.json({ data: finalizedAsset });
          default:
            return Response.json({ data: profile });
        }
      },
    );

    if (api.replaceHeadshot === undefined) throw new Error("Expected organizer headshot adapter.");
    const result = await api.replaceHeadshot({
      participantId: "participant-1",
      file: new File(["headshot-v2"], "speaker.png", { type: "image/png" }),
      supersedesAssetId: "asset-headshot-v1",
      expectedVersion: 2,
    });

    expect(result).toEqual({ asset: finalizedAsset, profile });
    expect(calls.map((call) => call.url)).toEqual([
      "https://api.example.test/api/speaker/events/event-1/organizer/profiles/participant-1/headshot",
      "https://uploads.example.test/events/event-1/headshots/v2",
      "https://api.example.test/api/speaker/events/event-1/organizer/assets/asset-headshot-v2/finalize",
      "https://api.example.test/api/speaker/events/event-1/organizer/profiles/participant-1",
    ]);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      participantId: "participant-1",
      kind: "headshot",
      fileName: "speaker.png",
      contentType: "image/png",
      sizeBytes: 11,
      supersedesAssetId: "asset-headshot-v1",
    });
    expect(calls[1]?.init?.credentials).toBe("omit");
    expect(calls[1]?.init?.body).toBeInstanceOf(File);
    expect(JSON.parse(String(calls[2]?.init?.body))).toEqual({ state: "ready" });
    expect(JSON.parse(String(calls[3]?.init?.body))).toEqual({
      headshotAssetId: "asset-headshot-v2",
      expectedVersion: 2,
    });
  });

  it("returns authoritative edit and approval responses and preserves optimistic versions", async () => {
    const responses = [
      {
        ...restoredSession,
        title: "Prefixed title",
        description: "Original abstract",
        version: 2,
        updatedBy: "organizer-1",
      },
      {
        ...restoredSession,
        title: "Prefixed title",
        description: "Original abstract with appended detail",
        version: 3,
        updatedBy: "organizer-1",
      },
      {
        ...restoredSession,
        title: "Prefixed title",
        description: "Original abstract with appended detail",
        status: "Accepted",
        contentStatus: "Approved",
        version: 4,
        updatedBy: "organizer-1",
      },
    ];
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    const api = createDeliverablesApi(
      "https://api.example.test",
      "org-1",
      "event-1",
      async (input, init) => {
        requests.push({
          url: String(input),
          method: init?.method ?? "GET",
          body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
        });
        return Response.json({ data: responses[requests.length - 1] });
      },
    );

    const first = await api.updateSession({
      sessionId: "session-1",
      expectedVersion: 1,
      title: "Prefixed title",
      description: "Original abstract",
    });
    const second = await api.updateSession({
      sessionId: first.id,
      expectedVersion: first.version,
      title: first.title,
      description: `${first.description} with appended detail`,
    });
    const approved = await api.updateSession({
      sessionId: second.id,
      expectedVersion: second.version,
      status: "Approved",
    });

    expect(first).toMatchObject({ title: "Prefixed title", version: 2, updatedBy: "organizer-1" });
    expect(second).toMatchObject({
      description: "Original abstract with appended detail",
      version: 3,
    });
    expect(approved).toMatchObject({ contentStatus: "Approved", version: 4 });
    expect(requests.map((request) => request.body)).toEqual([
      {
        expectedVersion: 1,
        title: "Prefixed title",
        description: "Original abstract",
      },
      {
        expectedVersion: 2,
        title: "Prefixed title",
        description: "Original abstract with appended detail",
      },
      { expectedVersion: 3, status: "Approved" },
    ]);
  });

  it("normalizes authenticated organizer attribution and immutable content snapshots", async () => {
    const requests: string[] = [];
    const api = createDeliverablesApi(
      "https://api.example.test",
      "org-1",
      "event-1",
      async (input) => {
        requests.push(String(input));
        return Response.json({
          data: [
            {
              id: "content-history-1",
              action: "updated",
              version: 2,
              actorAccountId: "organizer-1",
              actorLabel: "Jordan Alvarez",
              occurredAt: "2026-08-09T12:00:00.000Z",
              snapshot: {
                title: "Prefixed title",
                abstract: "Original abstract",
              },
            },
          ],
        });
      },
    );

    await expect(api.listSessionContentHistory?.("session-1")).resolves.toEqual([
      {
        id: "content-history-1",
        action: "updated",
        version: 2,
        actorId: "organizer-1",
        actorLabel: "Jordan Alvarez",
        occurredAt: "2026-08-09T12:00:00.000Z",
        title: "Prefixed title",
        description: "Original abstract",
      },
    ]);
    expect(requests).toEqual([
      "https://api.example.test/api/admin/organizations/org-1/events/event-1/sessions/session-1/history",
    ]);
  });

  it("uses the exact organizer matrix query and keeps server status/current asset authoritative", async () => {
    const requests: string[] = [];
    const currentAsset = {
      id: "asset-2",
      eventId: "event-1",
      submissionId: "submission-1",
      participantId: "participant-1",
      taskId: "task-1",
      kind: "slides",
      fileName: "current.pdf",
      contentType: "application/pdf",
      sizeBytes: 2048,
      state: "ready",
      createdAt: "2026-08-11T12:00:00.000Z",
      version: 2,
      versionFamilyId: "family-1",
      objectKey: "private/object-key",
      tenantId: "private-tenant",
      capabilityToken: "private-capability",
      signedDownloadUrl: "https://private.example.test/file",
    };
    const task = {
      id: "task-1",
      eventId: "event-1",
      submissionId: "submission-1",
      participantId: "participant-1",
      type: "upload",
      owner: "speaker",
      title: "Upload slides",
      status: "submitted",
      dependencyIds: [],
      reminderOffsetsMinutes: [],
      version: 1,
      updatedAt: "2026-08-11T12:00:00.000Z",
    };
    const api = createDeliverablesApi(
      "https://api.example.test",
      "org-1",
      "event-1",
      async (input) => {
        requests.push(String(input));
        return Response.json({
          data: {
            organizationId: "org-1",
            eventId: "event-1",
            total: 1,
            filters: {
              participantId: "participant-1",
              taskId: "task-1",
              status: "incomplete",
              objectKey: "must-not-cross-boundary",
            },
            items: [
              {
                task,
                participantId: "participant-1",
                participantName: "Priya Raman",
                assets: [currentAsset],
                currentAsset,
                status: "needs_changes",
              },
            ],
          },
        });
      },
    );

    const matrix = await api.listDeliverableMatrix?.({
      participantId: "participant-1",
      taskId: "task-1",
      status: "incomplete",
    });

    expect(requests).toEqual([
      "https://api.example.test/api/speaker/events/event-1/organizer/deliverables?participantId=participant-1&taskId=task-1&status=incomplete",
    ]);
    expect(matrix?.filters).toEqual({
      participantId: "participant-1",
      taskId: "task-1",
      status: "incomplete",
    });
    expect(matrix?.items[0]).toMatchObject({
      status: "needs_changes",
      currentAsset: { id: "asset-2", version: 2 },
    });
    expect(matrix?.items[0]?.currentAsset).not.toHaveProperty("objectKey");
    expect(matrix?.items[0]?.currentAsset).not.toHaveProperty("tenantId");
    expect(matrix?.items[0]?.currentAsset).not.toHaveProperty("capabilityToken");
    expect(matrix?.items[0]?.currentAsset).not.toHaveProperty("signedDownloadUrl");
  });
  it("surfaces optimistic concurrency conflicts without hiding the server error", async () => {
    const api = createDeliverablesApi("https://api.example.test", "org-1", "event-1", async () =>
      Response.json(
        { error: { code: "CONFLICT", message: "Session version 3 is current." } },
        { status: 409 },
      ),
    );

    await expect(
      api.updateSession({ sessionId: "session-1", expectedVersion: 2, title: "stale" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
      message: "Session version 3 is current.",
    });
  });
});
