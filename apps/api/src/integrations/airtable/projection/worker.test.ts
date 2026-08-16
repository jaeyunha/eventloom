import { describe, expect, it, vi } from "vitest";

import type { AirtableSyncJob } from "../sync/contracts";
import {
  type AirtableProjectionProvider,
  type AirtableProjectionRepository,
  AirtableProjectionWorker,
  classifyAirtableProjectionError,
} from "./worker";

const now = new Date("2026-04-05T12:00:00.000Z");

function job(overrides: Partial<AirtableSyncJob> = {}): AirtableSyncJob {
  return {
    id: "job-1",
    connectionId: "connection-1",
    organizationId: "organization-1",
    entityType: "submission",
    applicationId: "application-1",
    sourceVersion: 4,
    operation: "upsert",
    payloadJson: JSON.stringify({ tableId: "table-1", fields: { Name: "Ada" } }),
    availableAt: now.toISOString(),
    state: "claimed",
    deduplicationKey: "deduplication-1",
    attempts: 0,
    connectionVersion: 1,
    claimOwner: "worker-1",
    claimToken: "claim-1",
    leaseExpiresAt: "2026-04-05T12:01:00.000Z",
    lastError: null,
    createdAt: "2026-04-05T11:00:00.000Z",
    updatedAt: now.toISOString(),
    completedAt: null,
    ...overrides,
  };
}

function dependencies() {
  const provider: AirtableProjectionProvider = {
    performUpsert: vi.fn(async () => ({ recordId: "record-new" })),
    archive: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  };
  const repository: AirtableProjectionRepository = {
    getCurrentSourceVersion: vi.fn(async () => 4),
    getMapping: vi.fn(async () => null),
    complete: vi.fn(async () => true),
    completeWithMapping: vi.fn(async () => true),
    retry: vi.fn(async () => true),
    fail: vi.fn(async () => true),
  };
  const worker = new AirtableProjectionWorker(provider, repository, {
    now: () => new Date(now),
    retryBaseMilliseconds: 1_000,
    retryMaximumMilliseconds: 30_000,
  });
  return { provider, repository, worker };
}

const claim = { owner: "worker-1", claimToken: "claim-1" };

describe("AirtableProjectionWorker", () => {
  it("completes a stale source version without calling Airtable", async () => {
    const { provider, repository, worker } = dependencies();
    (repository.getCurrentSourceVersion as ReturnType<typeof vi.fn>).mockResolvedValue(5);

    await expect(worker.process({ job: job(), ...claim })).resolves.toEqual({ status: "stale" });

    expect(provider.performUpsert).not.toHaveBeenCalled();
    expect(repository.getMapping).not.toHaveBeenCalled();
    expect(repository.complete).toHaveBeenCalledWith({
      jobId: "job-1",
      ...claim,
      completedAt: now.toISOString(),
    });
  });

  it("upserts with a stable Application ID and atomically completes the mapping and job", async () => {
    const { provider, repository, worker } = dependencies();

    await expect(worker.process({ job: job(), ...claim })).resolves.toEqual({
      status: "succeeded",
    });

    expect(provider.performUpsert).toHaveBeenCalledWith({
      tableId: "table-1",
      applicationId: "application-1",
      fields: { Name: "Ada", "Application ID": "application-1" },
    });
    expect(repository.completeWithMapping).toHaveBeenCalledWith({
      jobId: "job-1",
      ...claim,
      organizationId: "organization-1",
      connectionId: "connection-1",
      entityType: "submission",
      applicationId: "application-1",
      tableId: "table-1",
      recordId: "record-new",
      sourceVersion: 4,
      completedAt: now.toISOString(),
    });
    expect(repository.complete).not.toHaveBeenCalled();
  });

  it.each(["archive", "delete"] as const)("%ss an existing mapped record", async (operation) => {
    const { provider, repository, worker } = dependencies();
    (repository.getMapping as ReturnType<typeof vi.fn>).mockResolvedValue({
      tableId: "mapped-table",
      recordId: "record-1",
      lastExportedVersion: 3,
    });

    await expect(worker.process({ job: job({ operation }), ...claim })).resolves.toEqual({
      status: "succeeded",
    });

    expect(provider[operation]).toHaveBeenCalledWith({
      tableId: "mapped-table",
      recordId: "record-1",
    });
    expect(repository.complete).toHaveBeenCalledWith({
      jobId: "job-1",
      ...claim,
      completedAt: now.toISOString(),
    });
  });

  it("treats archive/delete without a mapping as an idempotent success", async () => {
    const { provider, repository, worker } = dependencies();

    await expect(worker.process({ job: job({ operation: "delete" }), ...claim })).resolves.toEqual({
      status: "succeeded",
    });

    expect(provider.delete).not.toHaveBeenCalled();
    expect(repository.complete).toHaveBeenCalledOnce();
  });

  it("uses Retry-After for a rate-limited provider response", async () => {
    const { provider, repository, worker } = dependencies();
    (provider.performUpsert as ReturnType<typeof vi.fn>).mockRejectedValue({
      status: 429,
      headers: new Headers({ "Retry-After": "7" }),
      message: "rate limited",
    });

    await expect(worker.process({ job: job({ attempts: 4 }), ...claim })).resolves.toEqual({
      status: "retried",
    });

    expect(repository.retry).toHaveBeenCalledWith({
      jobId: "job-1",
      ...claim,
      availableAt: "2026-04-05T12:00:07.000Z",
      error: "rate limited",
    });
  });

  it("uses bounded exponential retry for transient errors", async () => {
    const { provider, repository, worker } = dependencies();
    (provider.performUpsert as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error("unavailable"), { status: 503 }),
    );

    await expect(worker.process({ job: job({ attempts: 6 }), ...claim })).resolves.toEqual({
      status: "retried",
    });

    expect(repository.retry).toHaveBeenCalledWith(
      expect.objectContaining({
        availableAt: "2026-04-05T12:00:30.000Z",
        error: "unavailable",
      }),
    );
  });

  it("fails non-retryable provider errors", async () => {
    const { provider, repository, worker } = dependencies();
    (provider.performUpsert as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error("invalid fields"), { status: 422 }),
    );

    await expect(worker.process({ job: job(), ...claim })).resolves.toEqual({ status: "failed" });

    expect(repository.fail).toHaveBeenCalledWith({
      jobId: "job-1",
      ...claim,
      completedAt: now.toISOString(),
      error: "invalid fields",
    });
    expect(repository.retry).not.toHaveBeenCalled();
  });

  it("rejects a job not owned by the supplied claim without repository or provider work", async () => {
    const { provider, repository, worker } = dependencies();

    await expect(
      worker.process({ job: job(), owner: "another-worker", claimToken: "claim-1" }),
    ).resolves.toEqual({
      status: "claim-rejected",
    });

    expect(repository.getCurrentSourceVersion).not.toHaveBeenCalled();
    expect(provider.performUpsert).not.toHaveBeenCalled();
  });

  it("reports a stale claim when fenced completion loses ownership", async () => {
    const { repository, worker } = dependencies();
    (repository.completeWithMapping as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    await expect(worker.process({ job: job(), ...claim })).resolves.toEqual({
      status: "claim-rejected",
    });
  });
});

describe("classifyAirtableProjectionError", () => {
  it("parses HTTP-date Retry-After deterministically", () => {
    expect(
      classifyAirtableProjectionError(
        {
          status: 429,
          headers: { "retry-after": "Sun, 05 Apr 2026 12:00:09 GMT" },
          message: "slow down",
        },
        now,
      ),
    ).toEqual({
      retryable: true,
      retryAfterMilliseconds: 9_000,
      message: "slow down",
    });
  });
});
