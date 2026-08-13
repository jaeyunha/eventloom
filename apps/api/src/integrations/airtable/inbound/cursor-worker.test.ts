import { describe, expect, it, vi } from "vitest";

import {
  type AirtableConflictServiceDependencies,
  type AirtableSyncConflict,
  resolveAirtableConflict,
} from "../conflicts/service";
import {
  type AirtableInboundChangeStore,
  type AirtableInboundDomainCommands,
  type AirtableInboundTranslatorRegistry,
  runAirtableInboundChangeWorkerOnce,
} from "./change-worker";
import {
  type AirtableWebhookCursorClaim,
  type AirtableWebhookCursorStore,
  runAirtableCursorWorkerOnce,
} from "./cursor-worker";

const now = new Date("2026-08-13T12:00:00.000Z");

function cursorClaim(): AirtableWebhookCursorClaim {
  return {
    registrationId: "registration-1",
    organizationId: "organization-1",
    connectionId: "connection-1",
    providerWebhookId: "webhook-1",
    nextCursor: "cursor-1",
    rowVersion: 4,
    claimToken: "claim-1",
  };
}

describe("Airtable cursor worker", () => {
  it("advances a fetched page with the cursor claim token and row version", async () => {
    const change = {
      baseTransactionNumber: 12,
      tableId: "table-1",
      recordId: "record-1",
      fieldId: "field-1",
      entityType: "submission",
      applicationId: "application-1",
      sourceValueJson: '"Ada"',
      sourceHash: "source-hash-1",
    };
    const cursors: AirtableWebhookCursorStore = {
      claimNext: vi.fn(async () => cursorClaim()),
      advancePage: vi.fn(async () => ({
        kind: "advanced" as const,
        claim: null,
      })),
      markRetentionGap: vi.fn(async () => true),
      releaseClaim: vi.fn(async () => true),
    };
    const fetchPage = vi.fn(async () => ({
      kind: "page" as const,
      nextCursor: "cursor-2",
      mightHaveMore: false,
      changes: [change],
    }));
    const requestReconciliation = vi.fn(async () => undefined);

    await expect(
      runAirtableCursorWorkerOnce(
        {
          cursors,
          provider: { fetchPage },
          reconciliation: { request: requestReconciliation },
          createClaimToken: () => "claim-1",
          now: () => new Date(now),
        },
        { workerId: "worker-1", leaseDurationMs: 60_000 },
      ),
    ).resolves.toEqual({
      kind: "processed",
      registrationId: "registration-1",
      pages: 1,
      changes: 1,
    });

    expect(cursors.claimNext).toHaveBeenCalledWith({
      claimOwner: "worker-1",
      claimToken: "claim-1",
      claimedAt: now.toISOString(),
      leaseExpiresAt: "2026-08-13T12:01:00.000Z",
    });
    expect(fetchPage).toHaveBeenCalledWith({
      organizationId: "organization-1",
      connectionId: "connection-1",
      providerWebhookId: "webhook-1",
      cursor: "cursor-1",
    });
    expect(cursors.advancePage).toHaveBeenCalledWith({
      registrationId: "registration-1",
      claimToken: "claim-1",
      expectedRowVersion: 4,
      expectedCursor: "cursor-1",
      nextCursor: "cursor-2",
      fetchedAt: now.toISOString(),
      leaseExpiresAt: null,
      releaseClaim: true,
      changes: [change],
    });
    expect(cursors.markRetentionGap).not.toHaveBeenCalled();
    expect(cursors.releaseClaim).not.toHaveBeenCalled();
    expect(requestReconciliation).not.toHaveBeenCalled();
  });

  it("signals reconciliation and marks a provider retention gap by cursor CAS", async () => {
    const cursors: AirtableWebhookCursorStore = {
      claimNext: vi.fn(async () => cursorClaim()),
      advancePage: vi.fn(async () => ({
        kind: "advanced" as const,
        claim: null,
      })),
      markRetentionGap: vi.fn(async () => true),
      releaseClaim: vi.fn(async () => true),
    };
    const requestReconciliation = vi.fn(async () => undefined);

    await expect(
      runAirtableCursorWorkerOnce(
        {
          cursors,
          provider: {
            fetchPage: vi.fn(async () => ({
              kind: "retention_gap" as const,
              recoveryCursor: "cursor-current",
            })),
          },
          reconciliation: { request: requestReconciliation },
          createClaimToken: () => "claim-1",
          now: () => new Date(now),
        },
        { workerId: "worker-1", leaseDurationMs: 60_000 },
      ),
    ).resolves.toEqual({
      kind: "reconciliation_required",
      registrationId: "registration-1",
    });

    expect(requestReconciliation).toHaveBeenCalledWith({
      commandId: "airtable-reconcile:connection-1:registration-1:4",
      organizationId: "organization-1",
      connectionId: "connection-1",
      registrationId: "registration-1",
      reason: "webhook_retention_gap",
      observedCursor: "cursor-1",
    });
    expect(cursors.markRetentionGap).toHaveBeenCalledWith({
      registrationId: "registration-1",
      claimToken: "claim-1",
      expectedRowVersion: 4,
      expectedCursor: "cursor-1",
      recoveryCursor: "cursor-current",
      detectedAt: now.toISOString(),
    });
    expect(cursors.advancePage).not.toHaveBeenCalled();
    expect(cursors.releaseClaim).not.toHaveBeenCalled();
  });
});

describe("Airtable inbound change worker", () => {
  it("dispatches an allowlisted translator and records a domain command CAS conflict", async () => {
    const createConflict = vi.fn(async () => ({
      kind: "recorded" as const,
      conflictId: "conflict-1",
    }));
    const complete = vi.fn(async () => true);
    const changes: AirtableInboundChangeStore = {
      claimNext: vi.fn(async () => ({
        id: "change-1",
        organizationId: "organization-1",
        connectionId: "connection-1",
        registrationId: "registration-1",
        baseTransactionNumber: 12,
        tableId: "table-1",
        recordId: "record-1",
        fieldId: "field-allowed",
        entityType: "submission",
        applicationId: "application-1",
        sourceValueJson: '"Airtable"',
        sourceHash: "source-hash-1",
        attemptCount: 1,
        claimToken: "claim-1",
      })),
      findEnabledProjection: vi.fn(async () => ({
        connectionId: "connection-1",
        tableId: "table-1",
        entityType: "submission",
        inboundFieldIds: ["field-allowed"],
      })),
      findRecordMapping: vi.fn(async () => ({
        id: "mapping-1",
        connectionId: "connection-1",
        tableId: "table-1",
        recordId: "record-1",
        entityType: "submission",
        applicationId: "application-1",
        lastExportedVersion: 7,
        lastExportedHash: "exported-hash",
        lastObservedHash: "observed-hash",
        mappingVersion: 3,
      })),
      complete,
      createConflict,
    };
    const applyValue = vi.fn(async () => ({
      kind: "version_conflict" as const,
      current: {
        version: 8,
        valueJson: '"D1 changed"',
        valueHash: "d1-hash-8",
      },
    }));
    const domain: AirtableInboundDomainCommands = {
      readField: vi.fn(async () => ({
        version: 7,
        valueJson: '"D1"',
        valueHash: "d1-hash-7",
      })),
      applyValue,
    };
    const translate = vi.fn(async () => ({
      valueJson: '"Translated Airtable"',
      valueHash: "translated-hash",
    }));
    const getTranslator = vi.fn(() => ({ translate }));
    const translators: AirtableInboundTranslatorRegistry = {
      get: getTranslator,
    };

    await expect(
      runAirtableInboundChangeWorkerOnce(
        {
          changes,
          domain,
          translators,
          createClaimToken: () => "claim-1",
          createConflictId: () => "conflict-1",
          now: () => new Date(now),
        },
        {
          workerId: "worker-1",
          leaseDurationMs: 60_000,
          retryDelayMs: 1_000,
          maxAttempts: 5,
        },
      ),
    ).resolves.toEqual({
      kind: "conflict",
      changeId: "change-1",
      conflictId: "conflict-1",
    });

    expect(getTranslator).toHaveBeenCalledWith("submission", "field-allowed");
    expect(translate).toHaveBeenCalledWith({
      sourceValue: "Airtable",
      organizationId: "organization-1",
      connectionId: "connection-1",
      entityType: "submission",
      applicationId: "application-1",
      fieldId: "field-allowed",
    });
    expect(applyValue).toHaveBeenCalledWith({
      commandId: "airtable-inbound:change-1",
      organizationId: "organization-1",
      entityType: "submission",
      applicationId: "application-1",
      fieldId: "field-allowed",
      valueJson: '"Translated Airtable"',
      expectedVersion: 7,
    });
    expect(createConflict).toHaveBeenCalledWith({
      conflictId: "conflict-1",
      changeId: "change-1",
      claimToken: "claim-1",
      organizationId: "organization-1",
      connectionId: "connection-1",
      entityType: "submission",
      applicationId: "application-1",
      fieldId: "field-allowed",
      sourceTransaction: 12,
      d1Version: 8,
      d1ValueJson: '"D1 changed"',
      airtableValueJson: '"Translated Airtable"',
      detectedAt: now.toISOString(),
      mappingId: "mapping-1",
      expectedMappingVersion: 3,
      observedHash: "source-hash-1",
    });
    expect(complete).not.toHaveBeenCalled();
  });
});

function resolvingConflict(
  resolution: "use_d1" | "use_airtable" | "manual",
  status: "resolving" | "resolved",
): AirtableSyncConflict {
  return {
    id: "conflict-1",
    organizationId: "organization-1",
    connectionId: "connection-1",
    entityType: "submission",
    applicationId: "application-1",
    fieldId: "field-1",
    sourceTransaction: 12,
    d1Version: 7,
    d1ValueJson: '"D1"',
    airtableValueJson: '"Airtable"',
    status,
    resolution,
    resolverId: "user-1",
    resolutionCommandId: "command-1",
  };
}

describe("Airtable conflict resolution", () => {
  it.each([
    {
      resolution: "use_d1" as const,
      expectedTarget: "provider" as const,
      expectedValueJson: '"D1"',
    },
    {
      resolution: "use_airtable" as const,
      expectedTarget: "domain" as const,
      expectedValueJson: '"Airtable"',
    },
    {
      resolution: "manual" as const,
      expectedTarget: "domain" as const,
      expectedValueJson: '"Reviewed"',
    },
  ])(
    "resolves $resolution once and replays the command idempotently",
    async ({ resolution, expectedTarget, expectedValueJson }) => {
      const beginResolution = vi
        .fn()
        .mockResolvedValueOnce({
          kind: "started",
          conflict: resolvingConflict(resolution, "resolving"),
        })
        .mockResolvedValueOnce({
          kind: "replay",
          conflict: resolvingConflict(resolution, "resolved"),
        });
      const completeResolution = vi.fn(async () => true);
      const reopenResolution = vi.fn(async () => true);
      const applyValue = vi.fn(async () => ({
        kind: "applied" as const,
        version: 8,
      }));
      const writeValue = vi.fn(async () => ({ kind: "applied" as const }));
      const dependencies: AirtableConflictServiceDependencies = {
        conflicts: {
          beginResolution,
          completeResolution,
          reopenResolution,
        },
        domain: { applyValue },
        provider: { writeValue },
        now: () => new Date(now),
      };
      const input =
        resolution === "manual"
          ? {
              conflictId: "conflict-1",
              organizationId: "organization-1",
              resolverId: "user-1",
              commandId: "command-1",
              resolution,
              manualValue: { valueJson: expectedValueJson },
            }
          : {
              conflictId: "conflict-1",
              organizationId: "organization-1",
              resolverId: "user-1",
              commandId: "command-1",
              resolution,
            };

      await expect(resolveAirtableConflict(dependencies, input)).resolves.toEqual({
        kind: "resolved",
        conflictId: "conflict-1",
        resolution,
      });
      await expect(resolveAirtableConflict(dependencies, input)).resolves.toEqual({
        kind: "already_resolved",
        conflictId: "conflict-1",
        resolution,
      });

      expect(beginResolution).toHaveBeenCalledTimes(2);
      expect(completeResolution).toHaveBeenCalledOnce();
      expect(reopenResolution).not.toHaveBeenCalled();

      if (expectedTarget === "provider") {
        expect(writeValue).toHaveBeenCalledOnce();
        expect(writeValue).toHaveBeenCalledWith({
          commandId: "command-1",
          organizationId: "organization-1",
          connectionId: "connection-1",
          entityType: "submission",
          applicationId: "application-1",
          fieldId: "field-1",
          valueJson: expectedValueJson,
        });
        expect(applyValue).not.toHaveBeenCalled();
      } else {
        expect(applyValue).toHaveBeenCalledOnce();
        expect(applyValue).toHaveBeenCalledWith({
          commandId: "command-1",
          organizationId: "organization-1",
          entityType: "submission",
          applicationId: "application-1",
          fieldId: "field-1",
          valueJson: expectedValueJson,
          expectedVersion: 7,
        });
        expect(writeValue).not.toHaveBeenCalled();
      }
    },
  );
});
