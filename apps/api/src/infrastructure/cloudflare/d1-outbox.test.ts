import type { D1Database } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";

import { D1AirtableSyncJobRepository } from "./d1-outbox";

class RecordingD1 {
  readonly queries: string[] = [];

  prepare(query: string) {
    this.queries.push(query);
    return {
      bind: (..._values: unknown[]) => this.prepare(query),
      all: async () => ({ results: [] }),
      first: async () => null,
      run: async () => ({ meta: { changes: 1 } }),
    };
  }
}

describe("D1AirtableSyncJobRepository", () => {
  it("uses the current attempt_count column when claiming and retrying jobs", async () => {
    const database = new RecordingD1();
    const repository = new D1AirtableSyncJobRepository(database as unknown as D1Database);

    await repository.claimDue({
      now: "2026-08-13T12:00:00.000Z",
      owner: "worker-1",
      claimToken: "claim-1",
      leaseExpiresAt: "2026-08-13T12:01:00.000Z",
    });
    await repository.retry({
      jobId: "job-1",
      owner: "worker-1",
      claimToken: "claim-1",
      availableAt: "2026-08-13T12:02:00.000Z",
      error: "temporary",
    });

    const queries = database.queries.join("\n");
    expect(queries).toContain("attempt_count");
    expect(queries).not.toMatch(/\battempts\b/u);
  });
});
