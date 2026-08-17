import { describe, expect, it, vi } from "vitest";
import {
  createOrganizerResultsExport,
  waitForOrganizerResultsExport,
} from "./organizer-results-export";

function deferred(): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
} {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("organizer results export client", () => {
  it("creates quickly, then reaches ready through explicit status signals", async () => {
    const firstStatusSignal = deferred();
    const secondStatusSignal = deferred();
    const firstStatusRequested = deferred();
    const signals = [firstStatusSignal, secondStatusSignal];
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            id: "export-1",
            status: "queued",
            fileName: "evaluation-plan-1.csv",
            createdAt: "2026-08-16T20:00:00.000Z",
          },
          202,
        ),
      )
      .mockImplementationOnce(async () => {
        firstStatusRequested.resolve();
        return jsonResponse({
          id: "export-1",
          status: "running",
          fileName: "evaluation-plan-1.csv",
          createdAt: "2026-08-16T20:00:00.000Z",
        });
      })
      .mockResolvedValueOnce(
        jsonResponse({
          id: "export-1",
          status: "ready",
          fileName: "evaluation-plan-1.csv",
          createdAt: "2026-08-16T20:00:00.000Z",
          completedAt: "2026-08-16T20:00:01.000Z",
          downloadUrl: "/api/admin/evaluations/plans/plan-1/exports/export-1/download",
        }),
      );

    const queued = await createOrganizerResultsExport({
      baseUrl: "",
      planId: "plan-1",
      idempotencyKey: "attempt-1",
      fetcher,
    });
    expect(queued.status).toBe("queued");
    expect(fetcher).toHaveBeenCalledTimes(1);

    let signalIndex = 0;
    const terminalPromise = waitForOrganizerResultsExport({
      baseUrl: "",
      planId: "plan-1",
      initialRun: queued,
      fetcher,
      waitForNextStatus: async () => {
        const signal = signals[signalIndex];
        signalIndex += 1;
        if (signal === undefined) throw new Error("Unexpected status wait.");
        await signal.promise;
      },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    firstStatusSignal.resolve();
    await firstStatusRequested.promise;
    expect(fetcher).toHaveBeenCalledTimes(2);
    secondStatusSignal.resolve();

    await expect(terminalPromise).resolves.toMatchObject({
      id: "export-1",
      status: "ready",
      downloadUrl: "/api/admin/evaluations/plans/plan-1/exports/export-1/download",
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("returns an actionable failed state for explicit retry", async () => {
    const statusSignal = deferred();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            id: "export-1",
            status: "queued",
            fileName: "evaluation-plan-1.csv",
            createdAt: "2026-08-16T20:00:00.000Z",
          },
          202,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "export-1",
          status: "failed",
          fileName: "evaluation-plan-1.csv",
          createdAt: "2026-08-16T20:00:00.000Z",
          completedAt: "2026-08-16T20:00:01.000Z",
          error: {
            code: "EVALUATION_EXPORT_GENERATION_FAILED",
            message: "Review export source unavailable.",
            retryable: true,
          },
        }),
      );
    const queued = await createOrganizerResultsExport({
      baseUrl: "",
      planId: "plan-1",
      idempotencyKey: "attempt-1",
      fetcher,
    });
    const terminalPromise = waitForOrganizerResultsExport({
      baseUrl: "",
      planId: "plan-1",
      initialRun: queued,
      fetcher,
      waitForNextStatus: () => statusSignal.promise,
    });

    statusSignal.resolve();

    await expect(terminalPromise).resolves.toMatchObject({
      status: "failed",
      error: {
        code: "EVALUATION_EXPORT_GENERATION_FAILED",
        message: "Review export source unavailable.",
        retryable: true,
      },
    });
  });
});
