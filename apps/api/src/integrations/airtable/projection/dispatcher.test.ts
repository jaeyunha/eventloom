import { describe, expect, it } from "vitest";

import { dispatchDueAirtableProjectionJobs, sweepAirtableProjectionJobs } from "./dispatcher";

describe("Airtable projection dispatcher", () => {
  it("sends payload-free queue envelopes and marks only owned jobs queued", async () => {
    const messages: unknown[] = [];
    const result = await dispatchDueAirtableProjectionJobs({
      now: "2026-08-13T12:00:00.000Z",
      store: {
        listDue: async () => [
          { id: "job-1", organizationId: "org-1" },
          { id: "job-2", organizationId: "org-2" },
        ],
        markQueued: async (jobId) => jobId === "job-1",
      },
      queue: {
        send: async (message) => {
          messages.push(message);
        },
      },
    });
    expect(result).toEqual({ sent: 1, skipped: 1 });
    expect(messages).toEqual([
      {
        version: 2,
        kind: "airtable-projection",
        jobId: "job-1",
        tenantId: "org-1",
        enqueuedAt: "2026-08-13T12:00:00.000Z",
      },
      {
        version: 2,
        kind: "airtable-projection",
        jobId: "job-2",
        tenantId: "org-2",
        enqueuedAt: "2026-08-13T12:00:00.000Z",
      },
    ]);
  });

  it("releases expired claims before dispatching due jobs", async () => {
    const order: string[] = [];
    const result = await sweepAirtableProjectionJobs({
      now: "2026-08-13T12:00:00.000Z",
      releaseExpired: async () => {
        order.push("release");
        return 3;
      },
      dispatch: async () => {
        order.push("dispatch");
        return { sent: 2, skipped: 0 };
      },
    });
    expect(order).toEqual(["release", "dispatch"]);
    expect(result).toEqual({ released: 3, sent: 2, skipped: 0 });
  });
});
