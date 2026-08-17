import { describe, expect, it } from "vitest";
import { createOrganizerResultsExportAttemptRunner } from "./organizer-results-export-attempt";

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("organizer results export attempts", () => {
  it("reuses one idempotency key after an ambiguous create failure", async () => {
    const keys: string[] = [];
    let createCalls = 0;
    const runner = createOrganizerResultsExportAttemptRunner({
      idFactory: () => "attempt-key-1",
    });
    const fetcher: typeof fetch = async (_input, init) => {
      const method = init?.method ?? "GET";
      if (method === "POST") {
        createCalls += 1;
        keys.push(new Headers(init?.headers).get("idempotency-key") ?? "");
        if (createCalls === 1) {
          throw new TypeError("The connection closed after the request was sent.");
        }
        return response(
          {
            id: "export-1",
            status: "queued",
            fileName: "evaluation-plan-1.csv",
            createdAt: "2026-08-16T20:00:00.000Z",
          },
          202,
        );
      }
      return response({
        id: "export-1",
        status: "ready",
        fileName: "evaluation-plan-1.csv",
        createdAt: "2026-08-16T20:00:00.000Z",
        completedAt: "2026-08-16T20:00:01.000Z",
        rowCount: 1,
        downloadUrl: "/api/admin/evaluations/plans/plan-1/exports/export-1/download",
      });
    };

    await expect(
      runner.start({
        baseUrl: "/api/admin/evaluations",
        planId: "plan-1",
        signal: new AbortController().signal,
        fetcher,
        waitForNextStatus: async () => undefined,
        onStatus: () => undefined,
      }),
    ).rejects.toThrow("connection closed");
    await expect(
      runner.start({
        baseUrl: "/api/admin/evaluations",
        planId: "plan-1",
        signal: new AbortController().signal,
        fetcher,
        waitForNextStatus: async () => undefined,
        onStatus: () => undefined,
      }),
    ).resolves.toMatchObject({ id: "export-1", status: "ready" });

    expect(keys).toEqual(["attempt-key-1", "attempt-key-1"]);
  });

  it("uses a new key only after a terminal failed run", async () => {
    const keys: string[] = [];
    const generatedKeys = ["attempt-key-1", "attempt-key-2"];
    let createCalls = 0;
    let statusCalls = 0;
    const runner = createOrganizerResultsExportAttemptRunner({
      idFactory: () => generatedKeys.shift() ?? "unexpected-key",
    });
    const fetcher: typeof fetch = async (_input, init) => {
      if ((init?.method ?? "GET") === "POST") {
        createCalls += 1;
        keys.push(new Headers(init?.headers).get("idempotency-key") ?? "");
        return response(
          {
            id: `export-${createCalls}`,
            status: "queued",
            fileName: "evaluation-plan-1.csv",
            createdAt: "2026-08-16T20:00:00.000Z",
          },
          202,
        );
      }
      statusCalls += 1;
      return statusCalls === 1
        ? response({
            id: "export-1",
            status: "failed",
            fileName: "evaluation-plan-1.csv",
            createdAt: "2026-08-16T20:00:00.000Z",
            completedAt: "2026-08-16T20:00:01.000Z",
            error: {
              code: "EVALUATION_EXPORT_GENERATION_FAILED",
              message: "The evaluation export could not be generated. Retry the export.",
              retryable: true,
            },
          })
        : response({
            id: "export-2",
            status: "ready",
            fileName: "evaluation-plan-1.csv",
            createdAt: "2026-08-16T20:00:02.000Z",
            completedAt: "2026-08-16T20:00:03.000Z",
            rowCount: 1,
            downloadUrl: "/api/admin/evaluations/plans/plan-1/exports/export-2/download",
          });
    };
    const start = () =>
      runner.start({
        baseUrl: "/api/admin/evaluations",
        planId: "plan-1",
        signal: new AbortController().signal,
        fetcher,
        waitForNextStatus: async () => undefined,
        onStatus: () => undefined,
      });

    await expect(start()).resolves.toMatchObject({ id: "export-1", status: "failed" });
    await expect(start()).resolves.toMatchObject({ id: "export-2", status: "ready" });

    expect(keys).toEqual(["attempt-key-1", "attempt-key-2"]);
  });
});
