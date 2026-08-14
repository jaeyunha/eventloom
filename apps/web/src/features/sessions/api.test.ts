import { describe, expect, it } from "vitest";
import { createSessionsApi, SessionsApiError } from "./api";

const session = {
  id: "session/1",
  eventId: "event/1",
  title: "Reliable worker pools",
  description: "How to keep jobs moving.",
  status: "Accepted",
  contentStatus: "Needs changes" as const,
  durationMinutes: 45,
  version: 1,
  createdAt: "2026-08-09T12:00:00.000Z",
  updatedAt: "2026-08-09T12:00:00.000Z",
  updatedBy: "organizer-1",
};

describe("sessions API adapter", () => {
  it("uses canonical credentialed Session endpoints for list, edit, history, and restore", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const updated = { ...session, title: "Reliable worker pools, revised", version: 2 };
    const restored = { ...session, version: 3, updatedAt: "2026-08-09T12:03:00.000Z" };

    const api = createSessionsApi(
      "https://api.example.test/",
      "org/1",
      "event/1",
      async (input, init) => {
        calls.push({ input, ...(init === undefined ? {} : { init }) });
        const path = String(input);

        if (path.endsWith("/history")) {
          return Response.json({
            data: [
              {
                id: "history-1",
                action: "created",
                version: 1,
                actorId: "organizer-1",
                actorLabel: "Avery Kim",
                occurredAt: "2026-08-09T12:00:00.000Z",
                snapshot: { title: session.title, description: session.description },
              },
            ],
          });
        }
        if (path.endsWith("/restore")) return Response.json({ data: restored });
        if (init?.method === "PATCH") return Response.json({ data: updated });
        return Response.json({ data: [session] });
      },
    );

    await expect(api.list()).resolves.toEqual([session]);
    await expect(
      api.updateContent({
        sessionId: session.id,
        expectedVersion: 1,
        title: updated.title,
        description: updated.description,
      }),
    ).resolves.toEqual(updated);
    await expect(api.listHistory(session.id)).resolves.toEqual([
      {
        id: "history-1",
        action: "created",
        version: 1,
        actorId: "organizer-1",
        actorLabel: "Avery Kim",
        occurredAt: "2026-08-09T12:00:00.000Z",
        snapshot: { title: session.title, description: session.description },
      },
    ]);
    await expect(
      api.restoreVersion({ sessionId: session.id, version: 1, expectedVersion: 2 }),
    ).resolves.toEqual(restored);

    expect(calls.map((call) => String(call.input))).toEqual([
      "https://api.example.test/api/admin/organizations/org%2F1/events/event%2F1/sessions",
      "https://api.example.test/api/admin/organizations/org%2F1/events/event%2F1/sessions/session%2F1",
      "https://api.example.test/api/admin/organizations/org%2F1/events/event%2F1/sessions/session%2F1/history",
      "https://api.example.test/api/admin/organizations/org%2F1/events/event%2F1/sessions/session%2F1/restore",
    ]);
    expect(calls[0]?.init).toMatchObject({ credentials: "include", cache: "no-store" });
    expect(calls[1]?.init).toMatchObject({ method: "PATCH", credentials: "include" });
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
      expectedVersion: 1,
      title: updated.title,
      description: updated.description,
    });
    expect(calls[3]?.init).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(String(calls[3]?.init?.body))).toEqual({ version: 1, expectedVersion: 2 });
  });

  it("preserves canonical version conflicts", async () => {
    const api = createSessionsApi("", "org-1", "event-1", async () =>
      Response.json(
        {
          error: {
            code: "CONFLICT",
            message: "The session has changed.",
            traceId: "trace-1",
          },
        },
        { status: 409 },
      ),
    );

    await expect(
      api.updateContent({ sessionId: "session-1", expectedVersion: 2, title: "Stale title" }),
    ).rejects.toMatchObject(
      new SessionsApiError("CONFLICT", "The session has changed.", 409, "trace-1"),
    );
  });
});
