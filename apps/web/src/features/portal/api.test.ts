import { describe, expect, it } from "vitest";
import { createPortalApi, PortalApiError } from "./api";
import type { PortalTask, PortalView } from "./types";

const emptyPortal: PortalView = {
  submissions: [],
  profiles: [],
  tasks: [],
  outstandingTaskCount: 0,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function task(): PortalTask {
  return {
    id: "task/one",
    eventId: "event one",
    submissionId: "submission-1",
    participantId: "participant-1",
    type: "form",
    owner: "speaker",
    title: "Confirm details",
    status: "in_progress",
    dependencyIds: [],
    reminderOffsetsMinutes: [],
    version: 2,
    updatedAt: "2026-08-08T12:00:00.000Z",
  };
}

describe("speaker portal API adapter", () => {
  it("loads the event-scoped portal with authenticated credentials", async () => {
    const calls: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return jsonResponse({ data: emptyPortal });
    };
    const api = createPortalApi("https://api.example.com/", fetcher);

    await expect(api.getPortal("event one")).resolves.toEqual(emptyPortal);
    expect(calls).toHaveLength(1);
    expect(String(calls[0]?.input)).toBe(
      "https://api.example.com/api/speaker/events/event%20one/portal",
    );
    expect(calls[0]?.init).toMatchObject({ credentials: "include" });
  });

  it("sends optimistic profile versions and preserves structured API errors", async () => {
    const requests: RequestInit[] = [];
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(init ?? {});
      return jsonResponse(
        {
          error: {
            code: "VERSION_CONFLICT",
            message: "The speaker profile has changed. Reload it before saving.",
            traceId: "trace-1",
          },
        },
        409,
      );
    };
    const api = createPortalApi("https://api.example.com", fetcher);

    const error = await api
      .updateBiography({
        eventId: "event-1",
        participantId: "participant-1",
        biography: "Updated biography",
        expectedVersion: 4,
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PortalApiError);
    expect(error).toMatchObject({ code: "VERSION_CONFLICT", status: 409, traceId: "trace-1" });
    expect(JSON.parse(String(requests[0]?.body))).toEqual({
      biography: "Updated biography",
      expectedVersion: 4,
    });
  });

  it("posts task transitions with encoded identifiers", async () => {
    const current = task();
    const calls: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return jsonResponse({ data: { task: { ...current, status: "submitted", version: 3 } } });
    };
    const api = createPortalApi("https://api.example.com", fetcher);

    await expect(
      api.transitionTask({
        eventId: current.eventId,
        taskId: current.id,
        toStatus: "submitted",
        expectedVersion: current.version,
        note: "Ready for review",
      }),
    ).resolves.toMatchObject({ status: "submitted", version: 3 });
    expect(String(calls[0]?.input)).toContain("/events/event%20one/tasks/task%2Fone/transitions");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      toStatus: "submitted",
      expectedVersion: 2,
      note: "Ready for review",
    });
  });

  it("uses a private upload grant without forwarding portal credentials", async () => {
    const calls: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      if (calls.length === 1) {
        return jsonResponse({
          data: {
            asset: { id: "asset-1" },
            grant: {
              method: "PUT",
              url: "https://uploads.example.com/private/object",
              headers: { "content-type": "application/pdf", "x-upload-token": "signed" },
              expiresAt: "2026-08-08T12:05:00.000Z",
            },
          },
        });
      }
      return new Response(null, { status: 204 });
    };
    const api = createPortalApi("https://api.example.com", fetcher);
    const file = new File(["slides"], "session.pdf", { type: "application/pdf" });

    await expect(
      api.uploadTaskFile({
        eventId: "event-1",
        participantId: "participant-1",
        taskId: "task-1",
        kind: "slides",
        file,
      }),
    ).resolves.toEqual({ assetId: "asset-1" });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.init).toMatchObject({ credentials: "include", method: "POST" });
    expect(calls[1]).toMatchObject({
      input: "https://uploads.example.com/private/object",
      init: { credentials: "omit", method: "PUT", body: file },
    });
  });

  it("uses relative upload capabilities through the same-origin gateway", async () => {
    const calls: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
    const capabilityUrl = "/api/speaker/assets/capabilities/upload/capability-1/token-1";
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return calls.length === 1
        ? jsonResponse({
            data: {
              asset: { id: "asset-1" },
              grant: {
                method: "PUT",
                url: capabilityUrl,
                headers: { "content-type": "application/pdf" },
                expiresAt: "2026-08-08T12:05:00.000Z",
              },
            },
          })
        : new Response(null, { status: 204 });
    };
    const api = createPortalApi("", fetcher);

    await api.uploadTaskFile({
      eventId: "event-1",
      participantId: "participant-1",
      taskId: "task-1",
      kind: "slides",
      file: new File(["slides"], "session.pdf", { type: "application/pdf" }),
    });

    expect(calls.map(({ input }) => String(input))).toEqual([
      "/api/speaker/events/event-1/uploads",
      capabilityUrl,
    ]);
    expect(calls[1]?.init).toMatchObject({ credentials: "omit", method: "PUT" });
  });

  it("reports failed object storage uploads without submitting the task", async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount += 1;
      return callCount === 1
        ? jsonResponse({
            data: {
              asset: { id: "asset-1" },
              grant: {
                method: "PUT",
                url: "https://uploads.example.com/private/object",
                headers: {},
                expiresAt: "2026-08-08T12:05:00.000Z",
              },
            },
          })
        : new Response(null, { status: 503 });
    };
    const api = createPortalApi("https://api.example.com", fetcher);

    await expect(
      api.uploadTaskFile({
        eventId: "event-1",
        participantId: "participant-1",
        taskId: "task-1",
        kind: "slides",
        file: new File(["slides"], "session.pdf", { type: "application/pdf" }),
      }),
    ).rejects.toMatchObject({ code: "UPLOAD_FAILED", status: 503 });
    expect(callCount).toBe(2);
  });
});
