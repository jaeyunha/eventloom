import { describe, expect, it, vi } from "vitest";
import type { AirtableSyncJobInput } from "../sync/contracts";
import { getAirtableProjectionHealth } from "./health";
import {
  type AirtableProjectionConnection,
  claimProjectionSyncJobs,
  enqueueStaleMappingRepairs,
  type InitialExportCheckpoint,
  processInitialExportPage,
} from "./reconciliation";

describe("Airtable projection reconciliation", () => {
  it("pages the initial export, repairs stale mappings, gates claims, and summarizes health", async () => {
    const now = () => "2026-08-13T12:00:00.000Z";
    const connection: AirtableProjectionConnection = {
      id: "connection-1",
      organizationId: "organization-1",
      version: 4,
      status: "connected",
    };
    let checkpoint: InitialExportCheckpoint | null = null;
    const enqueued: AirtableSyncJobInput[] = [];
    const claim = vi.fn(async () => []);
    const connections = {
      getConnection: vi.fn(async () => connection),
    };
    const jobs = {
      enqueue: vi.fn(async (job: AirtableSyncJobInput) => {
        enqueued.push(job);
        return true;
      }),
      claim,
    };
    const checkpoints = {
      get: vi.fn(async () => checkpoint),
      save: vi.fn(async (next: InitialExportCheckpoint) => {
        checkpoint = next;
      }),
    };
    const source = {
      listEntities: vi
        .fn()
        .mockResolvedValueOnce({
          entities: [
            { applicationId: "session-1", sourceVersion: 2, payloadJson: '{"name":"One"}' },
            { applicationId: "session-2", sourceVersion: 3, payloadJson: '{"name":"Two"}' },
          ],
          nextCursorApplicationId: "session-2",
        })
        .mockResolvedValueOnce({
          entities: [
            { applicationId: "session-3", sourceVersion: 1, payloadJson: '{"name":"Three"}' },
          ],
          nextCursorApplicationId: null,
        }),
    };

    const firstPage = await processInitialExportPage(
      { connectionId: connection.id, entityType: "session", pageSize: 2 },
      { connections, checkpoints, source, jobs, now },
    );
    const secondPage = await processInitialExportPage(
      { connectionId: connection.id, entityType: "session", pageSize: 2 },
      { connections, checkpoints, source, jobs, now },
    );

    expect(firstPage).toMatchObject({ kind: "processed", scanned: 2, enqueued: 2 });
    expect(secondPage).toMatchObject({
      kind: "processed",
      scanned: 1,
      enqueued: 1,
      checkpoint: {
        state: "completed",
        scannedCount: 3,
        enqueuedCount: 3,
        completedAt: now(),
      },
    });
    expect(source.listEntities.mock.calls.map(([input]) => input.afterApplicationId)).toEqual([
      null,
      "session-2",
    ]);

    const repair = await enqueueStaleMappingRepairs(
      { connectionId: connection.id, afterCursor: null, pageSize: 10 },
      {
        connections,
        jobs,
        now,
        mappings: {
          listMappings: async () => ({
            mappings: [
              {
                connectionId: connection.id,
                organizationId: connection.organizationId,
                entityType: "session",
                applicationId: "session-1",
                tableId: "table-1",
                recordId: "record-present",
                mappingVersion: 1,
                lastExportedVersion: 2,
              },
              {
                connectionId: connection.id,
                organizationId: connection.organizationId,
                entityType: "session",
                applicationId: "session-2",
                tableId: "table-1",
                recordId: "record-missing",
                mappingVersion: 2,
                lastExportedVersion: 3,
              },
            ],
            nextCursor: "mapping-2",
          }),
        },
        records: {
          findExistingRecordIds: async () => new Set(["record-present"]),
        },
      },
    );

    expect(repair).toEqual({
      kind: "processed",
      scanned: 2,
      enqueued: 1,
      nextCursor: "mapping-2",
    });
    expect(enqueued.at(-1)).toMatchObject({
      applicationId: "session-2",
      sourceVersion: 3,
      operation: "reconcile",
    });

    connection.status = "paused";
    expect(
      await claimProjectionSyncJobs(
        {
          connectionId: connection.id,
          owner: "worker-1",
          limit: 5,
          now: now(),
          leaseExpiresAt: "2026-08-13T12:01:00.000Z",
        },
        { connections, jobs },
      ),
    ).toEqual([]);
    connection.status = "disconnected";
    expect(
      await claimProjectionSyncJobs(
        {
          connectionId: connection.id,
          owner: "worker-1",
          limit: 5,
          now: now(),
          leaseExpiresAt: "2026-08-13T12:01:00.000Z",
        },
        { connections, jobs },
      ),
    ).toEqual([]);
    expect(claim).not.toHaveBeenCalled();

    await expect(
      getAirtableProjectionHealth(connection.id, {
        now,
        health: {
          getSnapshot: async () => ({
            counts: { pending: 4, claimed: 2, retry: 1, dead: 3, openConflicts: 5 },
            oldestOutstandingAt: "2026-08-13T11:58:29.500Z",
            lastSuccessAt: "2026-08-13T11:55:00.000Z",
            lastErrorCode: "AIRTABLE_RATE_LIMITED",
            lastError: "Provider rate limit exceeded",
          }),
        },
      }),
    ).resolves.toEqual({
      pending: 4,
      claimed: 2,
      retry: 1,
      dead: 3,
      openConflicts: 5,
      outstanding: 7,
      lagSeconds: 90,
      lastSuccessAt: "2026-08-13T11:55:00.000Z",
      error: {
        code: "AIRTABLE_RATE_LIMITED",
        message: "Provider rate limit exceeded",
      },
    });
  });
});
