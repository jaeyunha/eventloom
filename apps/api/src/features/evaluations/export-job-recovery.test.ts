import { describe, expect, it } from "vitest";
import {
  EvaluationExportCoordinator,
  InMemoryEvaluationExportArtifactStore,
  InMemoryEvaluationExportStore,
} from "./export-jobs";

describe("evaluation export recovery", () => {
  it("resumes a running export after an interrupted Queue delivery", async () => {
    const store = new InMemoryEvaluationExportStore();
    let generationCalls = 0;
    const coordinator = new EvaluationExportCoordinator({
      store,
      artifacts: new InMemoryEvaluationExportArtifactStore(),
      queue: { enqueue: async () => undefined },
      generator: {
        generate: async () => {
          generationCalls += 1;
          return { body: "Title\nProposal One\n", rowCount: 1 };
        },
      },
      clock: () => new Date("2026-08-16T20:00:00.000Z"),
      idFactory: () => "evaluation-export-interrupted",
    });
    const queued = await coordinator.request({
      tenantId: "tenant-1",
      eventId: "event-1",
      planId: "plan-1",
      planVersion: 2,
      requestedBy: "organizer-1",
      idempotencyKey: "interrupted-attempt",
    });
    await store.claim(queued.id, "2026-08-16T19:59:00.000Z", 1);

    await coordinator.process(queued.id, 2);

    await expect(
      coordinator.get({
        tenantId: "tenant-1",
        eventId: "event-1",
        planId: "plan-1",
        runId: queued.id,
      }),
    ).resolves.toMatchObject({ status: "ready", processorAttempt: 2, rowCount: 1 });
    expect(generationCalls).toBe(1);
  });
});
